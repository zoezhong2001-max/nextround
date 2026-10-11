import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { id, now } from "./store.mjs";
import { updateProgress, addPractice, isClosed } from "./domain.mjs";
import { reviewSchema, validateReview } from "./review-schema.mjs";
import { resolveTaskMaterials } from "./task-materials.mjs";
import { memoryContext } from './memory.mjs';

const str = { type: "string" };
const ids = { type: "array", items: str };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const tool = (name, description, properties) => ({
  type: "function",
  name: "workbench_" + name,
  description,
  inputSchema: obj(properties),
});
export const agentTools = [
  tool('memory', '读取最新个人背景、项目事实和故事；按关键词或经历检索，使用 evidenceId 读取原始问答。空字符串表示不筛选。', {q:str,experienceId:str,evidenceId:str}),
  tool(
    "context",
    "读取当前岗位、阶段和资料目录，只返回索引；先定位再按需读正文。未绑定岗位时返回岗位列表。",
    {},
  ),
  tool(
    "need_input",
    "缺少会改变后续任务的关键信息时，保存一个具体问题并结束本轮；用户补充后从已完成处继续。",
    { question: str },
  ),
  tool(
    "bind",
    "仅在对话尚未绑定且用户明确点名唯一岗位时绑定，歧义时请用户选择。",
    { applicationId: str },
  ),
  tool(
    "read",
    "读取本岗位资料或个人资产正文。长文分页，nextOffset 非空须继续读取；复盘前完整读取逐字稿。",
    {
      collection: { enum: ["artifacts", "reviews", "assets"], type: "string" },
      id: str,
      offset: { type: "integer", minimum: 0 },
      length: { type: "integer", minimum: 1, maximum: 20000 },
    },
  ),
  tool(
    "rules",
    "按需加载本地 skill 能力规则；保存复盘/准备/经历草稿或更新进度前必须读取相应规则。",
    {
      capability: {
        type: "string",
        enum: ["review", "prep", "experience", "resume", "progress"],
      },
    },
  ),
  tool(
    "progress",
    "只根据用户明确陈述的实际进度更新；不得根据逐字稿或模型推测判断通过。纯通知不生成文档。日期未说清用空字符串；下一阶段名称必须已明确。",
    {
      stageId: str,
      expectedCurrentStageId: str,
      type: {
        type: "string",
        enum: [
          "completed",
          "advanced",
          "failed",
          "withdrawn",
          "cancelled",
          "scheduled",
          "rescheduled",
        ],
      },
      sourceQuote: str,
      occurredAt: str,
      date: str,
      nextStage: str,
    },
  ),
  tool(
    "save_review",
    "保存本轮逐题复盘。完整原话、具体诊断、问题组建议和示例。已有该轮复盘返回其入口，禁止覆盖原话。",
    {
      stageId: str,
      materialIds: ids,
      review: reviewSchema,
    },
  ),
  tool(
    "save_document",
    "保存准备稿或经历/简历修改草稿。准备归对应阶段，经历草稿关联既有资产，不把模型建议变成确认事实。正文不写执行日志。先读材料和对应规则。",
    {
      kind: { type: "string", enum: ["prep", "experience", "resume"] },
      stageId: str,
      assetId: str,
      materialIds: ids,
      title: str,
      content: str,
    },
  ),
  tool(
    "add_practice",
    "把复盘中具体改进加入当前岗位的练习清单；须引用已读取的来源。",
    {
      stageId: str,
      sourceId: str,
      title: str,
    },
  ),
];
const files = {
  review: [
    "review-and-archive.md",
    "feedback-loop.md",
    "question-forecasting.md",
  ],
  prep: ["interview-prep.md", "question-forecasting.md", "feedback-loop.md"],
  experience: ["experience-cards.md", "knowledge-routing.md"],
  resume: ["resume.md"],
  progress: ["progress-update-routing.md"],
};
const labels = {
  memory: '读取个人记忆与证据',
  need_input: "等待补充信息",
  context: "定位岗位与资料",
  bind: "关联岗位",
  read: "读取参考资料",
  rules: "加载任务规则",
  progress: "更新面试进度",
  save_review: "保存逐题复盘",
  save_document: "保存准备与经历草稿",
  add_practice: "添加练习",
};
export const fingerprint = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
const bodyOf = (item) =>
  item.content ||
  JSON.stringify({
    summary: item.summary,
    groups: item.groups,
    uncertainties: item.uncertainties,
  });
const routeOf = (collection, item) =>
  "/" +
  { artifacts: "documents", reviews: "reviews", assets: "assets" }[collection] +
  "/" +
  item.id;
const today = (date) =>
  new Date(date).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
const error = (message) => {
  throw new Error(message);
};
export function validateToolArguments(schema, value, path = "参数") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      error(path + " 必须是对象");
    for (const key of schema.required || [])
      if (!(key in value)) error(path + "." + key + " 缺失");
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key))
        error(path + "." + key + " 不支持");
      validateToolArguments(schema.properties[key], child, path + "." + key);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) error(path + " 必须是列表");
    if (value.length > 2000) error(path + " 过长");
    value.forEach((child, i) =>
      validateToolArguments(schema.items, child, path + "[" + i + "]"),
    );
  } else if (schema.type === "integer") {
    if (
      !Number.isInteger(value) ||
      value < schema.minimum ||
      value > schema.maximum
    )
      error(path + " 超出范围");
  } else if (
    schema.type === "string" &&
    (typeof value !== "string" || value.length > 500000)
  )
    error(path + " 必须是有效文字");
  if (schema.enum && !schema.enum.includes(value)) error(path + " 选项无效");
}

export class WorkbenchTools {
  constructor({ store, task, skillRoot }) {
    Object.assign(this, { store, task, skillRoot });
    task.steps ||= [];
    task.results ||= [];
    task.reads ||= {};
    task.rules ||= [];
    this.calls = 0;
  }
  active() {
    if (
      this.task.cancelRequested ||
      this.store.get("tasks", this.task.id)?.status !== "running"
    )
      error("任务已停止，未执行此操作");
    if (++this.calls > 80)
      error("本次工具调用已达上限，请保留已完成结果后继续对话");
  }
  app() {
    const a = this.store.get("applications", this.task.applicationId);
    if (!a) error("请先选择或明确指出唯一岗位");
    return a;
  }
  stage(stageId) {
    const s = this.store.get("stages", stageId);
    if (!s || s.applicationId !== this.app().id) error("阶段与当前岗位不匹配");
    return s;
  }
  item(collection, objectId) {
    if (!["artifacts", "reviews", "assets"].includes(collection))
      error("资料类型无效");
    const value = this.store.get(collection, objectId);
    if (!value) error("资料不存在");
    if (
      collection !== "assets" &&
      value.applicationId &&
      value.applicationId !== this.task.applicationId
    )
      error("此资料属于其他岗位，请切换到对应岗位对话");
    return value;
  }
  requireRule(capability) {
    if (!this.task.rules.includes(capability))
      error("请先读取 " + capability + " 对应的任务规则");
  }
  requireRead(collection, objectId, complete = false) {
    const item = this.item(collection, objectId);
    const body = bodyOf(item),
      read = this.task.reads[collection + ":" + objectId];
    if (!read || read.fingerprint !== fingerprint(body))
      error("资料尚未读取或已更新，请先重新读取：" + item.title);
    if (complete) {
      let end = 0;
      for (const [a, b] of [...read.ranges].sort((x, y) => x[0] - y[0])) {
        if (a > end) break;
        end = Math.max(end, b);
      }
      if (end < body.length) error("逐字稿尚未完整读取，请继续读取剩余部分");
    }
    return item;
  }
  materials(inputIds) {
    const list = resolveTaskMaterials(
      this.store,
      inputIds,
      this.task.applicationId,
    );
    for (const m of list)
      this.requireRead(
        this.store.get("artifacts", m.id) ? "artifacts" : "reviews",
        m.id,
      );
    return list;
  }
  result(value) {
    if (value.route && !this.task.results.some((r) => r.route === value.route))
      this.task.results.push(value);
    return value;
  }
  key(name, a) {
    if (name === "save_review") return name + ":" + a.stageId;
    if (name === "save_document")
      return name + ":" + a.kind + ":" + a.stageId + ":" + a.assetId;
    return name + ":" + fingerprint(a);
  }
  async call(fullName, a) {
    this.active();
    const name = fullName.replace(/^workbench_/, "");
    const definition = agentTools.find((t) => t.name === fullName);
    if (!definition) error("无效工具请求");
    validateToolArguments(definition.inputSchema, a);
    const key = this.key(name, a);
    const write = [
      "progress",
      "save_review",
      "save_document",
      "add_practice",
      "bind",
    ].includes(name);
    if (write && this.task.question)
      error("已请求用户补充，收到回复后才能继续写入");
    if (
      ["save_review", "save_document", "add_practice"].includes(name) &&
      !/(复盘|准备|深挖|修改|优化|整理|分析|练习|完善|补充|生成|写|更新|继续|review|prepare)/i.test(
        this.task.prompt,
      )
    )
      error("用户本次只提供了信息，尚未要求生成或修改内容");
    const done = this.task.steps.find(
      (s) => s.key === key && s.status === "completed",
    );
    if (write && done) return { ...done.output, reused: true };
    let step = this.task.steps.find(
      (s) => s.key === key && s.status !== "completed",
    );
    if (!step) {
      step = {
        id: id(),
        key,
        tool: name,
        label: labels[name],
        status: "running",
        startedAt: now(),
      };
      this.task.steps.push(step);
    } else
      Object.assign(step, { status: "running", error: null, startedAt: now() });
    this.store.transaction(() => this.store.put("tasks", this.task));
    let checkpoint;
    try {
      const rules =
        name === "rules" ? await this.loadRules(a.capability) : null;
      this.active();
      checkpoint = structuredClone(this.task);
      return this.store.transaction(() => {
        const output = rules || this.execute(name, a);
        Object.assign(step, {
          status: "completed",
          completedAt: now(),
          output: write ? output : undefined,
        });
        this.store.put("tasks", this.task);
        return output;
      });
    } catch (e) {
      if (checkpoint) {
        for (const key of Object.keys(this.task))
          if (!(key in checkpoint)) delete this.task[key];
        Object.assign(this.task, checkpoint);
        step = this.task.steps.find((s) => s.id === step.id);
      }
      Object.assign(step, {
        status: "failed",
        error: e.message,
        completedAt: now(),
      });
      this.store.transaction(() => this.store.put("tasks", this.task));
      throw e;
    }
  }
  async loadRules(capability) {
    if (!files[capability]) error("未知能力");
    const parts = await Promise.all(
      files[capability].map(
        async (f) =>
          "### " +
          f +
          "\n" +
          (await readFile(join(this.skillRoot, "references", f), "utf8")),
      ),
    );
    if (!this.task.rules.includes(capability)) this.task.rules.push(capability);
    return { capability, instructions: parts.join("\n\n") };
  }
  execute(name, a) {
    const { store, task } = this;
    if (name === "need_input") {
      if (!a.question.trim() || a.question.length > 1200)
        error("请提出一个简短具体的问题");
      task.question = a.question;
      return { waitingForUser: true, question: a.question };
    }
    if (name === 'memory') return memoryContext(store, {...a, applicationId:task.applicationId || ''});
    if (name === "context") {
      const app = task.applicationId ? this.app() : null;
      const brief = (x) => ({
        id: x.id,
        title: x.title,
        kind: x.kind,
        stageId: x.stageId,
        source: x.source,
        updatedAt: x.updatedAt || x.createdAt,
      });
      return {
        personalMemory: memoryContext(store, {applicationId: task.applicationId || ''}),
        application: app,
        applications: app
          ? undefined
          : store
              .list("applications")
              .map((x) => ({
                id: x.id,
                company: x.company,
                role: x.role,
                batch: x.batch,
                status: x.status,
              })),
        stages: app
          ? store.list("stages").filter((s) => s.applicationId === app.id)
          : [],
        artifacts: store
          .list("artifacts")
          .filter(
            (x) => x.applicationId === task.applicationId && x.kind !== "audio",
          )
          .map(brief),
        reviews: store
          .list("reviews")
          .filter((x) => x.applicationId === task.applicationId)
          .map(brief),
        assets: store.list("assets").map(brief),
        selectedMaterialIds: task.materialIds,
        selectedAssetId: task.assetId,
        completedResults: task.results,
      };
    }
    if (name === "bind") {
      if (task.applicationId) {
        if (a.applicationId === task.applicationId)
          return { applicationId: task.applicationId };
        error("已有对话不能切换岗位，请新开对话");
      }
      const matches = store
        .list("applications")
        .filter(
          (x) =>
            task.prompt.includes(x.company) &&
            (store.list("applications").filter((j) => j.company === x.company)
              .length === 1 ||
              task.prompt.includes(x.role)),
        );
      if (matches.length !== 1 || matches[0].id !== a.applicationId)
        error("岗位不明确，请用户选择岗位后继续");
      task.applicationId = matches[0].id;
      task.stageId = matches[0].currentStageId;
      const c = store.get("conversations", task.conversationId);
      if (c)
        store.put("conversations", {
          ...c,
          applicationId: task.applicationId,
          stageId: task.stageId,
        });
      return { applicationId: task.applicationId, stageId: task.stageId };
    }
    if (name === "read") {
      const item = this.item(a.collection, a.id),
        body = bodyOf(item);
      if (item.kind === "audio")
        error("录音仅保留供人工按需回听，本次未接音频分析");
      const offset = a.offset ?? 0,
        length = a.length ?? 12000;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > body.length ||
        !Number.isInteger(length) ||
        length < 1 ||
        length > 20000
      )
        error("读取范围无效");
      const hash = fingerprint(body),
        key = a.collection + ":" + a.id;
      const previous = task.reads[key];
      task.reads[key] = {
        fingerprint: hash,
        ranges: [
          ...(previous?.fingerprint === hash ? previous.ranges : []),
          [offset, Math.min(body.length, offset + length)],
        ],
      };
      const step = task.steps.at(-1);
      step.label = "读取：" + item.title;
      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        source: item.source,
        stageId: item.stageId,
        route: routeOf(a.collection, item),
        content: body.slice(offset, offset + length),
        nextOffset: offset + length < body.length ? offset + length : null,
        totalLength: body.length,
      };
    }
    if (name === "progress") {
      this.requireRule("progress");
      const app = this.app(),
        stage = this.stage(a.stageId);
      if (app.currentStageId !== a.expectedCurrentStageId)
        error("岗位当前阶段已变化，请重新读取进度");
      if (!a.sourceQuote?.trim() || !task.prompt.includes(a.sourceQuote))
        error("进度依据必须逐字来自本次用户消息");
      const sourceSentence =
        task.prompt
          .split(/[。！？!?;；\n]/)
          .filter((s) => s.includes(a.sourceQuote))
          .at(-1) || a.sourceQuote;
      if (
        /(如果|假如|假设|可能|感觉|觉得|似乎|好像|应该|不确定|还没|尚未|未确认|猜|是否|能否|会不会|假定|示例|举例|没有通过通知)/.test(
          sourceSentence,
        )
      )
        error("这段话只是推测或假设，不能更新为已确认进度");
      const patterns = {
        advanced: /(通过|过了|进入.{0,8}(面|轮|阶段)|约.{0,5}(面|轮))/,
        failed: /(未通过|没通过|挂了|淘汰|拒绝)/,
        completed: /(结束|完成|面完|提交)/,
        withdrawn: /(退出|不继续|放弃)/,
        cancelled: /(取消|停止招聘)/,
        scheduled: /(约|安排|定于|面试|笔试)/,
        rescheduled: /(改期|改到|调整|推迟|提前)/,
      };
      if (
        !patterns[a.type]?.test(a.sourceQuote) ||
        (a.type === "advanced" &&
          /(没|未|不).{0,3}(通过|过了)/.test(a.sourceQuote))
      )
        error("进度类型与用户原话不一致，请确认实际结果");
      const occurredAt = a.occurredAt || today(task.createdAt);
      if (
        a.occurredAt &&
        !task.prompt.includes(a.occurredAt.slice(0, 10)) &&
        a.occurredAt.slice(0, 10) !== today(task.createdAt)
      )
        error("发生日期未明确，请询问或留空记录本次通知日期");
      if (a.date && !task.prompt.includes(a.date.slice(0, 10)))
        error("请确认安排的具体日期后再填写；可先留空");
      if (
        a.type === "advanced" &&
        (!a.nextStage || !task.prompt.includes(a.nextStage))
      )
        error("下一阶段名称尚未明确，请向用户确认");
      const updated = updateProgress(store, app.id, {
        stageId: stage.id,
        type: a.type,
        occurredAt,
        source: "用户明确告知：" + a.sourceQuote,
        nextStage: a.nextStage,
        ...(a.date ? { date: a.date } : {}),
      });
      return this.result({
        kind: "progress",
        id: app.id,
        title: app.company + " · 流程已更新",
        route: "/jobs/" + app.id,
        stageId: updated.currentStageId,
        summary:
          stage.title +
          "：" +
          {
            advanced: "通过",
            failed: "未通过",
            completed: "已结束，等待结果",
            withdrawn: "主动退出",
            cancelled: "岗位取消",
            scheduled: "已安排",
            rescheduled: "已改期",
          }[a.type],
      });
    }
    if (name === "save_review") {
      this.requireRule("review");
      const stage = this.stage(a.stageId);
      const materials = this.materials(a.materialIds);
      const transcripts = materials.filter((m) => m.kind === "transcript");
      if (!transcripts.length)
        error("需要用户提供的完整逐字稿；不能用摘要冒充原话");
      for (const t of transcripts) {
        if (t.stageId !== stage.id)
          error("逐字稿与复盘轮次不一致，请确认原稿所属阶段");
        this.requireRead("artifacts", t.id, true);
      }
      validateReview(a.review, transcripts.map((t) => t.content).join("\n"));
      const existing = store
        .list("reviews")
        .find(
          (r) =>
            r.applicationId === task.applicationId && r.stageId === stage.id,
        );
      if (existing)
        return this.result({
          kind: "review",
          id: existing.id,
          title: existing.title,
          route: "/reviews/" + existing.id,
          summary: "已存在本轮复盘，保留原始问答",
          reused: true,
        });
      for (const g of a.review.groups)
        for (const assetId of g.experienceIds || [])
          this.requireRead("assets", assetId);
      const review = {
        ...a.review,
        id: id(),
        applicationId: task.applicationId,
        stageId: stage.id,
        materialIds: a.materialIds,
        source: "Agent 基于用户逐字稿生成",
        createdAt: now(),
        taskId: task.id,
        result: stage.result || "结果待确认",
        status: "ready",
      };
      store.put("reviews", review);
      task.materialIds = [...new Set([...task.materialIds, review.id])];
      return this.result({
        kind: "review",
        id: review.id,
        title: review.title,
        route: "/reviews/" + review.id,
      });
    }
    if (name === "save_document") {
      if (!["prep", "experience", "resume"].includes(a.kind))
        error("文档类型无效");
      this.requireRule(a.kind);
      if (!a.title?.trim() || !a.content?.trim() || a.content.length > 150000)
        error("文档内容为空或过长");
      if (/(写回清单|Skill 实测|内部状态码|默认工作流)/.test(a.content))
        error("请移除文档中的流程维护说明");
      const stage = a.stageId ? this.stage(a.stageId) : null;
      if (
        a.kind === "prep" &&
        (!stage || stage.frozen || isClosed(this.app().status))
      )
        error("只能为进行中的未冻结阶段保存准备稿");
      const materials = this.materials(a.materialIds);
      const asset = a.assetId ? this.requireRead("assets", a.assetId) : null;
      if (a.kind === "experience" && !asset)
        error("经历深挖草稿必须关联已有经历资产");
      if (!materials.some((m) => m.content) && !asset)
        error("请先读取并引用本次使用的事实材料");
      const previous =
        a.kind === "prep"
          ? store
              .list("artifacts")
              .filter((d) => d.kind === "prep" && d.stageId === stage.id)
              .at(-1)
          : null;
      if (previous) this.requireRead("artifacts", previous.id);
      const reuse = previous && !previous.imported && !previous.frozen;
      const doc = {
        ...(reuse ? previous : {}),
        id: reuse ? previous.id : id(),
        title: a.title,
        kind: a.kind,
        content: a.content,
        applicationId: task.applicationId,
        stageId: stage?.id || "",
        assetId: asset?.id || "",
        assetFingerprint: asset ? fingerprint(asset.content) : undefined,
        materialIds: a.materialIds,
        source: a.materialIds.join(", "),
        status: "draft",
        taskId: task.id,
        createdAt: previous?.createdAt || now(),
        updatedAt: now(),
        versions: reuse
          ? [
              ...(previous.versions || []),
              {
                content: previous.content,
                source: previous.source,
                savedAt: now(),
              },
            ]
          : [],
        ...(previous && !reuse ? { supersedes: previous.id } : {}),
      };
      store.put("artifacts", doc);
      return this.result({
        kind: a.kind,
        id: doc.id,
        title: doc.title,
        route: "/documents/" + doc.id,
        ...(asset
          ? {
              assetRoute: "/assets/" + asset.id,
              summary: "经历修改草稿，待你审阅确认",
            }
          : {}),
      });
    }
    if (name === "add_practice") {
      const source = store.get("reviews", a.sourceId) ? "reviews" : "artifacts";
      this.requireRead(source, a.sourceId);
      this.stage(a.stageId);
      const action = addPractice(store, {
        title: a.title,
        applicationId: task.applicationId,
        stageId: a.stageId,
        sourceId: a.sourceId,
      });
      return this.result({
        kind: "practice",
        id: action.id,
        title: action.title,
        route: "/jobs/" + task.applicationId + "?tab=prep",
      });
    }
    error("工具尚未实现");
  }
}
