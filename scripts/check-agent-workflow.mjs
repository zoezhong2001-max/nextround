import { mkdtempSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Store, id } from "../server/store.mjs";
import { createApplication } from "../server/domain.mjs";
import { TaskRunner } from "../server/tasks.mjs";
import { CodexBridge } from "../server/agent.mjs";
const root = resolve(join(import.meta.dirname, ".."));
const directory = mkdtempSync(join(tmpdir(), "nextround-workflow-probe-"));
const store = new Store(directory);
const bridge = new CodexBridge({ directory });
try {
  const app = store.transaction(() =>
    createApplication(store, {
      company: "功能验证公司",
      role: "产品经理",
      stage: "一面",
      jd: "负责用户访谈、问题梳理和方案验证；二面重点讨论项目取舍与验证方法。",
    }),
  );
  const transcript = {
    id: id(),
    applicationId: app.id,
    stageId: app.currentStageId,
    kind: "transcript",
    title: "功能验证逐字稿",
    content:
      "面试官：你负责什么？\n候选人：我负责用户访谈和问题归类，没有负责开发。\n面试官：如何验证方案？\n候选人：我只做了访谈记录核对，尚未进行量化验证。",
  };
  store.put("artifacts", transcript);
  store.put("assets", {
    id: id(),
    kind: "profile",
    title: "功能验证档案",
    content: "候选人负责访谈与问题梳理。",
    source: "合成测试事实",
  });
  const runner = new TaskRunner({
    store,
    getBridge: async () => bridge,
    skillRoot:
      process.env.PM_SKILL_DIR ||
      (existsSync(resolve(root, "skills/pm-interview/SKILL.md"))
        ? resolve(root, "skills/pm-interview")
        : join(homedir(), ".codex/skills/pm-interview")),
  });
  const task = await runner.start({
    kind: "chat",
    applicationId: app.id,
    materialIds: [transcript.id],
    prompt:
      "一面通过了，下一轮是二面，日期暂未确定。请用完整逐字稿逐题复盘并保存，然后更新进度并保存二面准备稿。资料足够时直接完成，不要只列计划。示范只使用材料中的事实；不需要经历修改或额外练习清单。",
  });
  let last = "";
  while (runner.running) {
    await delay(1000);
    const current = store.get("tasks", task.id);
    const status = (current.steps || [])
      .map((s) => s.label + ":" + s.status)
      .join("|");
    if (status !== last) {
      console.log(
        JSON.stringify({
          completedSteps: current.steps?.filter((s) => s.status === "completed")
            .length,
          latest: current.steps?.at(-1)?.label,
          status: current.status,
        }),
      );
      last = status;
    }
  }
  const result = store.get("tasks", task.id);
  const final = store.get("applications", app.id);
  const reviews = store.list("reviews"),
    prep = store.list("artifacts").filter((a) => a.kind === "prep");
  const passed =
    result.status === "completed" &&
    reviews.length === 1 &&
    prep.length === 1 &&
    reviews[0].stageId === transcript.stageId &&
    prep[0].stageId === final.currentStageId &&
    final.currentStageId !== transcript.stageId &&
    reviews[0].result === "通过";
  console.log(
    JSON.stringify({
      passed,
      taskStatus: result.status,
      reviewCount: reviews.length,
      preparationCount: prep.length,
      error: result.error,
      question: result.question,
      failures: result.steps
        ?.filter((s) => s.status === "failed")
        .map((s) => ({ label: s.label, error: s.error })),
    }),
  );
  if (!passed) {
    console.log(result.text);
    process.exitCode = 1;
  }
} finally {
  bridge.stop();
  store.close();
}
