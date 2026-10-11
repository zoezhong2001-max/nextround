import { id, now } from "./store.mjs";
import { skillInstructions } from "./agent.mjs";
import { resolveTaskMaterials } from "./task-materials.mjs";
import { WorkbenchTools, agentTools } from "./workbench-tools.mjs";

import { reviewSchema, validateReview } from "./review-schema.mjs";
export { validateReview } from "./review-schema.mjs";
export class TaskRunner {
  constructor({ store, getBridge, skillRoot }) {
    this.store = store;
    this.getBridge = getBridge;
    this.skillRoot = skillRoot;
    this.running = false;
  }
  async start(input) {
    if (this.running)
      throw Object.assign(new Error("已有任务正在运行，请等它完成后再启动"), {
        status: 409,
      });
    this.running = true;
    try {
      return await this.startLocked(input);
    } catch (e) {
      this.running = false;
      throw e;
    }
  }
  async startLocked(input) {
    const kinds = ["review", "prep", "experience", "resume", "mock", "chat"];
    if (!kinds.includes(input.kind))
      throw Object.assign(new Error("任务类型无效"), { status: 400 });
    const app = input.applicationId
      ? this.store.get("applications", input.applicationId)
      : null;
    if (input.applicationId && !app)
      throw Object.assign(new Error("岗位不存在"), { status: 400 });
    const stageId = input.stageId || app?.currentStageId || "";
    const stage = stageId ? this.store.get("stages", stageId) : null;
    if (stageId && !stage)
      throw Object.assign(new Error("阶段不存在，请重新选择"), { status: 400 });
    if (input.assetId && !this.store.get("assets", input.assetId))
      throw Object.assign(new Error("个人资产不存在，请重新选择"), {
        status: 400,
      });
    if (stage && stage.applicationId !== app?.id)
      throw Object.assign(new Error("阶段不属于此岗位"), { status: 400 });
    const materials = resolveTaskMaterials(
      this.store,
      input.materialIds,
      app?.id,
    );
    if (input.kind === "prep" && app?.status.startsWith("closed-"))
      throw Object.assign(
        new Error(
          "该岗位已归档，请选择进行中的岗位；已有准备可在历史准备中阅读。",
        ),
        { status: 400 },
      );
    if (
      input.kind === "review" &&
      !materials.some((a) => a.kind === "transcript" && a.content?.trim())
    )
      throw Object.assign(new Error("复盘需要选择完整逐字稿"), { status: 400 });
    if (input.kind === "prep" && !app)
      throw Object.assign(new Error("阶段准备需要绑定岗位"), { status: 400 });
    if (
      ["prep", "review", "experience", "resume"].includes(input.kind) &&
      !materials.some((a) => a.content) &&
      !input.assetId
    )
      throw Object.assign(new Error("请先选择本次使用的文字材料"), {
        status: 400,
      });
    const bridge = await this.getBridge();
    const account = await bridge.account();
    if (!["chatgpt", "chatgptAuthTokens", "siwc"].includes(account.type))
      throw Object.assign(new Error("请先连接 ChatGPT 账户"), { status: 400 });
    let conversation = input.conversationId
      ? this.store.get("conversations", input.conversationId)
      : null;
    if (input.conversationId && !conversation)
      throw Object.assign(new Error("对话不存在，请新建对话"), { status: 400 });
    if (
      conversation?.applicationId &&
      conversation.applicationId !== (app?.id || "")
    )
      throw Object.assign(new Error("对话岗位不能在途中切换，请新建对话"), {
        status: 400,
      });
    const task = {
      id: id(),
      kind: input.kind,
      title: {
        review: "逐字稿复盘",
        prep: "阶段准备",
        experience: "经历深挖",
        resume: "简历优化",
        mock: "模拟面试",
        chat: "Agent 对话",
      }[input.kind],
      applicationId: app?.id || "",
      stageId,
      status: "running",
      createdAt: now(),
      text: "",
      materialIds: materials.map((a) => a.id),
      prompt: input.prompt || "",
      model: input.model || "",
      assetId: input.assetId || "",
      conversationId: conversation?.id || "",
    };
    this.store.transaction(() => {
      if (input.kind === "chat") {
        conversation ||= {
          id: id(),
          title: task.prompt.slice(0, 28) || task.title,
          applicationId: task.applicationId,
          stageId: task.stageId,
          kind: "chat",
          messages: [],
          createdAt: now(),
        };
        if (!conversation.applicationId && app) {
          conversation.applicationId = app.id;
          conversation.stageId = task.stageId;
        }
        task.conversationId = conversation.id;
        task.agentVersion = 1;
        task.steps = [];
        task.results = [];
        conversation.messages.push({
          role: "user",
          text: task.prompt,
          taskId: task.id,
        });
        conversation.updatedAt = now();
        this.store.put("conversations", conversation);
      }
      this.store.put("tasks", task);
    });
    this.activeTask = task;
    this.execute(task, materials, conversation).finally(() => {
      this.running = false;
      this.activeTask = null;
    });
    return task;
  }
  async execute(task, materials, conversation) {
    try {
      if (task.kind === "chat") {
        await this.executeAgent(task, conversation);
        return;
      }
      const app = this.store.get("applications", task.applicationId),
        stage = this.store.get("stages", task.stageId);
      const chosenAsset = task.assetId
        ? this.store.get("assets", task.assetId)
        : null;
      const profile = this.store
        .list("assets")
        .filter((a) => a.kind === "profile");
      const context = {
        application: app,
        stage,
        profile,
        experience: chosenAsset,
        materials: materials
          .filter((a) => a.content)
          .map((a) => ({
            id: a.id,
            title: a.title,
            kind: a.kind,
            source: a.source,
            content: a.content,
          })),
      };
      const prompts = {
        review:
          "输出指定 JSON。完整覆盖每个主问题及追问；按连续考察意图分组，每题 question/answer 必须是原稿逐字原文，不能改写，长答仍保留完整边界。原稿不清晰时保留原文并在 uncertainties 标注。timestamp 只能用原稿存在的时间戳，没有则空字符串。逐题具体诊断；组级给基于句子的诊断、证据、更好结构、只用已确认事实的示例（否则使用待核实位）、补充思考、可执行练习。example 是复盘后示范，非当时回答。不要判断音频特征。experienceIds 仅填写上下文实际给出的经历 id，否则空数组。",
        prep: "输出当前阶段的具体准备稿：本阶段重点、岗位判断及来源、经历匹配、优先问题及真实证据、可执行练习、必要待核实项。面向用户，省略流程维护说明。",
        experience:
          "基于选择的经历和面试追问深挖：确认事实、职责边界、业务链路、指标口径、30秒结论、90秒项目树、三层追问。未确认的口径单列，不改写主事实。",
        resume:
          "基于最新 Profile、真实经历和目标岗位形成简历修改建议及可审阅草稿。所有数字和职责都有来源；缺失时用待核实位。",
        mock: "模拟面试。一次只问一题，依据岗位和现有材料追问；用户说结束后统一点评，并指出具体答法。",
        chat: "回答用户当前问题，结合已提供材料，结论有依据。",
      };
      const instructions = await skillInstructions(this.skillRoot, task.kind);
      const prompt = `${prompts[task.kind]}\n用户要求：${task.prompt || "按现有材料完成此任务"}\n本次材料：${JSON.stringify(context)}`;
      const bridge = await this.getBridge();
      let lastSave = 0;
      const result = await bridge.run({
        prompt,
        instructions,
        model: task.model || undefined,
        threadId: conversation?.threadId,
        outputSchema: task.kind === "review" ? reviewSchema : undefined,
        onProgress: (event) => {
          task.threadId = event.threadId;
          task.turnId = event.turnId || task.turnId;
          task.model = event.model || task.model;
          if (event.text) task.text = event.text;
          if (Date.now() - lastSave > 500) {
            this.store.transaction(() => this.store.put("tasks", task));
            lastSave = Date.now();
          }
        },
      });
      task.text = result.text;
      task.model = result.model;
      task.threadId = result.threadId;
      this.store.transaction(() => {
        if (task.kind === "review") {
          let parsed;
          try {
            parsed = JSON.parse(result.text);
          } catch {
            throw new Error("复盘结构解析失败，模型原始输出已保留");
          }
          const transcript = materials
            .filter((a) => a.kind === "transcript")
            .map((a) => a.content)
            .join("\n");
          validateReview(parsed, transcript);
          const review = {
            ...parsed,
            id: id(),
            applicationId: task.applicationId,
            stageId: task.stageId,
            materialIds: task.materialIds,
            source: "Agent 基于用户逐字稿生成",
            createdAt: now(),
            taskId: task.id,
            result: stage?.result || "结果待确认",
            status: "ready",
          };
          this.store.put("reviews", review);
          task.resultRoute = `/reviews/${review.id}`;
        } else if (["chat", "mock"].includes(task.kind)) {
          const c = conversation || {
            id: id(),
            title: task.prompt.slice(0, 28) || task.title,
            applicationId: task.applicationId,
            stageId: task.stageId,
            kind: task.kind,
            messages: [],
            createdAt: now(),
          };
          c.threadId = result.threadId;
          c.updatedAt = now();
          c.messages.push(
            { role: "user", text: task.prompt || task.title },
            { role: "assistant", text: result.text },
          );
          this.store.put("conversations", c);
          task.conversationId = c.id;
          task.resultRoute = `/chat/${c.id}`;
        } else {
          const artifact = {
            id: id(),
            title: `${app?.company || "个人"}｜${stage?.title || ""}${task.title}`,
            kind: task.kind,
            applicationId: task.applicationId,
            stageId: task.stageId,
            content: result.text,
            createdAt: now(),
            source: task.materialIds.join(", "),
            taskId: task.id,
            status: "draft",
          };
          this.store.put("artifacts", artifact);
          task.resultRoute = `/documents/${artifact.id}`;
        }
        task.status = "completed";
        task.completedAt = now();
        this.store.put("tasks", task);
      });
    } catch (e) {
      task.status = "failed";
      task.error = e.message;
      task.completedAt = now();
      this.store.transaction(() => this.store.put("tasks", task));
    }
  }
  async executeAgent(task, conversation) {
    const tools = new WorkbenchTools({
      store: this.store,
      task,
      skillRoot: this.skillRoot,
    });
    const bridge = await this.getBridge();
    const instructions = await skillInstructions(this.skillRoot, "agent");
    const continuing = conversation?.agentVersion === 1;
    const history = continuing
      ? undefined
      : (conversation?.messages || [])
          .filter((m) => m.taskId !== task.id)
          .slice(-20)
          .map((m) => ({ role: m.role, text: m.text }));
    let lastSave = 0;
    const result = await bridge.run({
      instructions,
      prompt: JSON.stringify({
        userRequest: task.prompt,
        date: new Date(task.createdAt).toLocaleDateString("en-CA", {
          timeZone: "Asia/Shanghai",
        }),
        applicationId: task.applicationId,
        originalStageId: task.stageId,
        selectedMaterialIds: task.materialIds,
        selectedAssetId: task.assetId,
        previousMessages: history,
        completedResults: task.results,
        continuation:
          task.attempt > 1
            ? "继续尚未完成的部分；已成功的写入不要重复执行。使用工具读取最新状态。"
            : undefined,
      }),
      model: task.model || undefined,
      threadId:
        task.threadId || (continuing ? conversation.threadId : undefined),
      dynamicTools: agentTools,
      onToolCall: (name, args) => tools.call(name, args),
      onProgress: (event) => {
        task.threadId = event.threadId;
        task.turnId = event.turnId || task.turnId;
        task.model = event.model || task.model;
        if (event.text !== undefined) task.text = event.text;
        if (Date.now() - lastSave > 500 || event.type === "started") {
          this.store.transaction(() => this.store.put("tasks", task));
          lastSave = Date.now();
        }
      },
    });
    if (task.cancelRequested)
      throw new Error("任务已停止；已完成结果保留，可继续未完成部分");
    task.text = result.text;
    task.model = result.model;
    task.threadId = result.threadId;
    this.store.transaction(() => {
      const c = this.store.get("conversations", task.conversationId);
      c.threadId = result.threadId;
      c.agentVersion = 1;
      c.updatedAt = now();
      c.messages.push({
        role: "assistant",
        text: result.text,
        taskId: task.id,
        attempt: task.attempt || 1,
      });
      this.store.put("conversations", c);
      task.status = task.question ? "waiting-input" : "completed";
      task.completedAt = now();
      task.resultRoute = "/chat/" + c.id;
      this.store.put("tasks", task);
    });
  }
  async retry(taskId, input = {}) {
    if (this.running)
      throw Object.assign(new Error("已有任务正在运行"), { status: 409 });
    const task = this.store.get("tasks", taskId);
    if (!task || !["failed", "waiting-input"].includes(task.status))
      throw new Error("只能继续未完成的任务");
    if (task.status === "waiting-input" && !input.prompt?.trim())
      throw new Error("请先补充所需信息");
    if (!task.agentVersion) return this.start(task);
    this.running = true;
    try {
      const bridge = await this.getBridge();
      const account = await bridge.account();
      if (!["chatgpt", "chatgptAuthTokens", "siwc"].includes(account.type))
        throw new Error("请先连接 ChatGPT 账户");
      let updatedConversation;
      if (input.prompt?.trim()) {
        const selected = resolveTaskMaterials(
          this.store,
          input.materialIds || [],
          task.applicationId,
        );
        task.materialIds = [
          ...new Set([...task.materialIds, ...selected.map((m) => m.id)]),
        ];
        if (input.assetId) {
          if (!this.store.get("assets", input.assetId))
            throw new Error("经历不存在");
          task.assetId = input.assetId;
        }
        task.prompt += "\n用户补充：" + input.prompt.trim();
        if (input.model !== undefined) task.model = input.model;
        updatedConversation = this.store.get(
          "conversations",
          task.conversationId,
        );
        updatedConversation.messages.push({
          role: "user",
          text: input.prompt.trim(),
          taskId: task.id,
        });
      }
      Object.assign(task, {
        status: "running",
        question: null,
        error: null,
        cancelRequested: false,
        text: "",
        turnId: null,
        attempt: (task.attempt || 1) + 1,
      });
      this.store.transaction(() => {
        if (updatedConversation)
          this.store.put("conversations", updatedConversation);
        this.store.put("tasks", task);
      });
      this.activeTask = task;
      this.execute(
        task,
        [],
        this.store.get("conversations", task.conversationId),
      ).finally(() => {
        this.running = false;
        this.activeTask = null;
      });
      return task;
    } catch (e) {
      this.running = false;
      throw e;
    }
  }
  async interrupt(taskId) {
    const task =
      this.activeTask?.id === taskId
        ? this.activeTask
        : this.store.get("tasks", taskId);
    if (!task || task.status !== "running")
      throw new Error("此任务暂时不能中断");
    task.cancelRequested = true;
    this.store.transaction(() => this.store.put("tasks", task));
    if (!task.turnId) return;
    const bridge = await this.getBridge();
    await bridge.request("turn/interrupt", {
      threadId: task.threadId,
      turnId: task.turnId,
    });
  }
}
