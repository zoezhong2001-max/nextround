import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Store, id, now } from "../server/store.mjs";
import { createApplication, updateProgress } from "../server/domain.mjs";
import {
  WorkbenchTools,
  agentTools,
  fingerprint,
} from "../server/workbench-tools.mjs";
import { TaskRunner } from "../server/tasks.mjs";
import { acceptExperienceDraft } from "../server/experience-drafts.mjs";
import { CodexBridge } from "../server/agent.mjs";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "nextround-agent-test-"));
  const store = new Store(directory);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const skillRoot = join(directory, "skill");
  mkdirSync(join(skillRoot, "references"), { recursive: true });
  writeFileSync(join(skillRoot, "SKILL.md"), "使用用户事实，保存独立成果");
  for (const name of [
    "user-journeys",
    "task-output-contract",
    "review-and-archive",
    "feedback-loop",
    "question-forecasting",
    "interview-prep",
    "progress-update-routing",
    "experience-cards",
    "knowledge-routing",
    "resume",
  ])
    writeFileSync(join(skillRoot, "references", name + ".md"), "测试规则");
  const app = store.transaction(() =>
    createApplication(store, {
      company: "示例公司",
      role: "产品经理",
      stage: "一面",
      jd: "负责业务分析",
    }),
  );
  const transcript = {
    id: id(),
    kind: "transcript",
    title: "一面逐字稿",
    applicationId: app.id,
    stageId: app.currentStageId,
    content:
      "面试官：介绍一个项目。\n候选人：我负责访谈用户，整理问题清单。\n面试官：如何验证？\n候选人：我核对了访谈记录，没有完成量化验证。",
  };
  const asset = {
    id: id(),
    kind: "experience",
    title: "项目经历",
    content: "我负责访谈用户，整理问题清单。",
    source: "用户原始记录",
    versions: [],
  };
  store.put("artifacts", transcript);
  store.put("assets", asset);
  const task = {
    id: id(),
    kind: "chat",
    applicationId: app.id,
    stageId: app.currentStageId,
    prompt: "一面过了，下一阶段是二面。帮我复盘并准备二面，继续深挖经历。",
    status: "running",
    createdAt: now(),
    materialIds: [transcript.id],
    assetId: asset.id,
    conversationId: "",
  };
  store.put("tasks", task);
  const tools = new WorkbenchTools({ store, task, skillRoot });
  return { store, app, transcript, asset, task, tools, skillRoot };
}
const read = (tools, collection, objectId, offset = 0, length = 20000) =>
  tools.call("workbench_read", { collection, id: objectId, offset, length });
const reviewBody = () => ({
  title: "一面逐题复盘",
  summary: "量化验证尚未完成",
  groups: [
    {
      title: "项目验证",
      diagnosis: "验证证据不足",
      evidence: "没有完成量化验证",
      betterStructure: "先说明验证边界",
      example: "我核对了访谈记录，没有完成量化验证。",
      supplement: "补充当时约束",
      experienceIds: [],
      questions: [
        {
          question: "介绍一个项目。",
          answer: "我负责访谈用户，整理问题清单。",
          timestamp: "",
          diagnosis: "职责明确",
          sourceQuote: "我负责访谈用户",
        },
        {
          question: "如何验证？",
          answer: "我核对了访谈记录，没有完成量化验证。",
          timestamp: "",
          diagnosis: "缺少量化验证",
          sourceQuote: "没有完成量化验证",
        },
      ],
      practice: ["说明验证边界"],
    },
  ],
  uncertainties: [],
});
async function review(f) {
  await f.tools.call("workbench_rules", { capability: "review" });
  await read(f.tools, "artifacts", f.transcript.id);
  return f.tools.call("workbench_save_review", {
    stageId: f.app.currentStageId,
    materialIds: [f.transcript.id],
    review: reviewBody(),
  });
}
const progress = (f) => ({
  stageId: f.app.currentStageId,
  expectedCurrentStageId: f.app.currentStageId,
  type: "advanced",
  sourceQuote: "一面过了",
  occurredAt: "",
  date: "",
  nextStage: "二面",
});
async function idle(runner) {
  const deadline = Date.now() + 4000;
  while (runner.running && Date.now() < deadline) await delay(5);
  assert.equal(runner.running, false, "任务未在测试时间内完成");
}

test("工具按岗位隔离，参数和过期读取受校验", async (t) => {
  const f = fixture(t);
  const other = f.store.transaction(() =>
    createApplication(f.store, {
      company: "另一公司",
      role: "PM",
      jd: "其他公司的资料",
    }),
  );
  const foreign = f.store
    .list("artifacts")
    .find((a) => a.applicationId === other.id);
  await assert.rejects(read(f.tools, "artifacts", foreign.id), /其他岗位/);
  await assert.rejects(
    f.tools.call("workbench_read", {
      collection: "assets",
      id: f.asset.id,
      offset: -1,
      length: 100,
    }),
    /范围/,
  );
  await assert.rejects(
    f.tools.call("workbench_context", { unexpected: "参数" }),
    /不支持/,
  );
  await read(f.tools, "assets", f.asset.id);
  f.store.put("assets", { ...f.asset, content: "用户刚修改的事实" });
  assert.throws(() => f.tools.requireRead("assets", f.asset.id), /已更新/);
});

test("完整逐字稿读取与原话校验先于写入，失败不产生复盘", async (t) => {
  const f = fixture(t);
  await f.tools.call("workbench_rules", { capability: "review" });
  await read(f.tools, "artifacts", f.transcript.id, 0, 5);
  const args = {
    stageId: f.app.currentStageId,
    materialIds: [f.transcript.id],
    review: reviewBody(),
  };
  await assert.rejects(f.tools.call("workbench_save_review", args), /完整读取/);
  await read(f.tools, "artifacts", f.transcript.id, 5, 20000);
  args.review.groups[0].questions[0].answer = "我主导营收增长50%";
  await assert.rejects(f.tools.call("workbench_save_review", args), /原逐字稿/);
  assert.equal(f.store.list("reviews").length, 0);
  args.review = reviewBody();
  const saved = await f.tools.call("workbench_save_review", args);
  assert.equal(saved.kind, "review");
  assert.equal(f.store.list("reviews").length, 1);
});

test("同一任务续做复用成功结果；进度、旧轮次复盘与下一轮准备各自归位", async (t) => {
  const f = fixture(t);
  const savedReview = await review(f);
  await f.tools.call("workbench_rules", { capability: "progress" });
  const updated = await f.tools.call("workbench_progress", progress(f));
  assert.notEqual(updated.stageId, f.app.currentStageId);
  assert.equal(f.store.get("reviews", savedReview.id).result, "通过");
  const restarted = new WorkbenchTools({
    store: f.store,
    task: f.store.get("tasks", f.task.id),
    skillRoot: f.skillRoot,
  });
  const duplicate = await restarted.call("workbench_save_review", {
    stageId: f.app.currentStageId,
    materialIds: [f.transcript.id],
    review: reviewBody(),
  });
  assert.equal(duplicate.id, savedReview.id);
  assert.equal(duplicate.reused, true);
  assert.equal(f.store.list("reviews").length, 1);
  await restarted.call("workbench_rules", { capability: "prep" });
  await read(restarted, "reviews", savedReview.id);
  const prep = await restarted.call("workbench_save_document", {
    kind: "prep",
    stageId: updated.stageId,
    assetId: "",
    materialIds: [savedReview.id],
    title: "二面准备",
    content: "优先补齐量化验证的事实边界。",
  });
  assert.equal(f.store.get("artifacts", prep.id).stageId, updated.stageId);
  assert.equal(
    f.store.get("reviews", savedReview.id).stageId,
    f.app.currentStageId,
  );
});

test("推测不能通过截取肯定片段变成已确认结果，纯通知不扩展生成", async (t) => {
  const f = fixture(t);
  f.task.prompt = "感觉一面过了，下一阶段应该是二面。";
  await f.tools.call("workbench_rules", { capability: "progress" });
  await assert.rejects(f.tools.call("workbench_progress", progress(f)), /推测/);
  assert.equal(f.store.get("applications", f.app.id).status, "preparing");
  f.task.prompt = "一面过了，下一阶段是二面。";
  await assert.rejects(
    f.tools.call("workbench_save_review", {
      stageId: f.app.currentStageId,
      materialIds: [f.transcript.id],
      review: reviewBody(),
    }),
    /尚未要求/,
  );
});

test("补录旧轮次的今天通知，不把已结束的下一轮退回去", (t) => {
  const f = fixture(t);
  const next = f.store.transaction(() =>
    updateProgress(f.store, f.app.id, {
      stageId: f.app.currentStageId,
      type: "advanced",
      occurredAt: "2026-09-01",
      source: "用户通知",
      nextStage: "二面",
    }),
  );
  f.store.transaction(() =>
    updateProgress(f.store, f.app.id, {
      stageId: next.currentStageId,
      type: "failed",
      occurredAt: "2026-09-03",
      source: "用户通知",
    }),
  );
  f.store.transaction(() =>
    updateProgress(f.store, f.app.id, {
      stageId: f.app.currentStageId,
      type: "advanced",
      occurredAt: "2026-10-04",
      source: "迟到通知",
      nextStage: "二面",
    }),
  );
  const current = f.store.get("applications", f.app.id);
  assert.equal(current.status, "closed-fail");
  assert.equal(current.currentStageId, next.currentStageId);
});

test("经历草稿需确认，原经历修改后拒绝覆盖，重复确认不增版本", async (t) => {
  const f = fixture(t);
  await read(f.tools, "assets", f.asset.id);
  await f.tools.call("workbench_rules", { capability: "experience" });
  const result = await f.tools.call("workbench_save_document", {
    kind: "experience",
    stageId: f.app.currentStageId,
    assetId: f.asset.id,
    materialIds: [],
    title: "经历深挖",
    content: "已确认：负责用户访谈。待核实：量化验证方法。",
  });
  assert.equal(f.store.get("assets", f.asset.id).content, f.asset.content);
  f.store.put("assets", { ...f.asset, content: "用户手动更新" });
  assert.throws(
    () =>
      f.store.transaction(() =>
        acceptExperienceDraft(f.store, result.id, { source: "核对原记录" }),
      ),
    /经历已/,
  );
  f.store.put("assets", f.asset);
  const saved = f.store.transaction(() =>
    acceptExperienceDraft(f.store, result.id, {
      source: "核对原始项目记录，未知部分保留标记",
    }),
  );
  assert.equal(saved.versions.length, 1);
  const repeated = f.store.transaction(() =>
    acceptExperienceDraft(f.store, result.id, { source: "再次确认" }),
  );
  assert.equal(repeated.versions.length, 1);
});

test("等待补充时禁止后续写入；取消后也不能写入", async (t) => {
  const f = fixture(t);
  await f.tools.call("workbench_need_input", {
    question: "下一轮是什么阶段？",
  });
  await assert.rejects(
    f.tools.call("workbench_progress", progress(f)),
    /收到回复/,
  );
  f.task.question = null;
  f.task.cancelRequested = true;
  await assert.rejects(f.tools.call("workbench_context", {}), /已停止/);
});

test("真实任务执行器失败续做：同一个任务、对话和复盘，接着生成准备稿", async (t) => {
  const f = fixture(t);
  f.store.db
    .prepare("DELETE FROM objects WHERE collection=? AND id=?")
    .run("tasks", f.task.id);
  let attempt = 0;
  const bridge = {
    account: async () => ({ type: "chatgpt" }),
    run: async ({ onToolCall: call, onProgress }) => {
      attempt++;
      onProgress({
        type: "started",
        threadId: "isolated-thread",
        turnId: "turn-" + attempt,
        model: "fixture-model",
      });
      await call("workbench_rules", { capability: "review" });
      await call("workbench_read", {
        collection: "artifacts",
        id: f.transcript.id,
        offset: 0,
        length: 20000,
      });
      const r = await call("workbench_save_review", {
        stageId: f.app.currentStageId,
        materialIds: [f.transcript.id],
        review: reviewBody(),
      });
      if (attempt === 1) throw new Error("模拟连接中断");
      await call("workbench_rules", { capability: "progress" });
      const next = await call("workbench_progress", progress(f));
      await call("workbench_rules", { capability: "prep" });
      await call("workbench_read", {
        collection: "reviews",
        id: r.id,
        offset: 0,
        length: 20000,
      });
      await call("workbench_save_document", {
        kind: "prep",
        stageId: next.stageId,
        assetId: "",
        materialIds: [r.id],
        title: "二面准备",
        content: "说明量化验证边界。",
      });
      return {
        text: "复盘和二面准备已保存。",
        threadId: "isolated-thread",
        model: "fixture-model",
      };
    },
  };
  const runner = new TaskRunner({
    store: f.store,
    skillRoot: f.skillRoot,
    getBridge: async () => bridge,
  });
  const first = await runner.start({
    kind: "chat",
    applicationId: f.app.id,
    prompt: f.task.prompt,
    materialIds: [f.transcript.id],
  });
  assert.ok(first.conversationId);
  await idle(runner);
  assert.equal(f.store.get("tasks", first.id).status, "failed");
  assert.equal(f.store.list("reviews").length, 1);
  const retry = await runner.retry(first.id);
  assert.equal(retry.id, first.id);
  await idle(runner);
  const completed = f.store.get("tasks", first.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.results.length, 3);
  assert.equal(f.store.list("reviews").length, 1);
  assert.equal(f.store.list("tasks").length, 1);
  assert.equal(f.store.list("conversations").length, 1);
  assert.equal(
    f.store.get("conversations", first.conversationId).messages.length,
    2,
  );
});

test("用户补充沿原任务继续，保留提问历史；并发启动被拒绝", async (t) => {
  const f = fixture(t);
  let attempts = 0,
    release;
  const blockedAccount = new Promise((resolve) => {
    release = resolve;
  });
  const bridge = {
    account: async () => {
      await blockedAccount;
      return { type: "chatgpt" };
    },
    run: async ({ onToolCall, onProgress }) => {
      attempts++;
      onProgress({
        type: "started",
        threadId: "clarify-thread",
        turnId: "turn-" + attempts,
      });
      if (attempts === 1)
        await onToolCall("workbench_need_input", {
          question: "下一轮是二面吗？",
        });
      return {
        text: attempts === 1 ? "下一轮是二面吗？" : "已收到补充。",
        threadId: "clarify-thread",
        model: "fixture",
      };
    },
  };
  const runner = new TaskRunner({
    store: f.store,
    skillRoot: f.skillRoot,
    getBridge: async () => bridge,
  });
  const pending = runner.start({
    kind: "chat",
    applicationId: f.app.id,
    prompt: "一面过了，帮我准备下一轮",
  });
  await assert.rejects(
    runner.start({ kind: "chat", prompt: "并发请求" }),
    /已有任务/,
  );
  release();
  const task = await pending;
  await idle(runner);
  assert.equal(f.store.get("tasks", task.id).status, "waiting-input");
  await runner.retry(task.id, { prompt: "是二面", materialIds: [] });
  await idle(runner);
  assert.equal(f.store.get("tasks", task.id).status, "completed");
  assert.equal(
    f.store.get("conversations", task.conversationId).messages.length,
    4,
  );
});

test("Codex 工具请求按线程隔离，错误回执明确，不能执行不匹配线程请求", async () => {
  const bridge = new CodexBridge({ directory: tmpdir() });
  const sent = [];
  bridge.send = (message) => sent.push(message);
  bridge.child = { stdin: { writable: true } };
  let calls = 0;
  const handler = {
    active: true,
    turnId: "turn",
    queue: Promise.resolve(),
    call: async () => {
      calls++;
      throw new Error("材料不匹配");
    },
  };
  bridge.toolHandlers.set("thread", handler);
  bridge.receive({
    id: 1,
    method: "item/tool/call",
    params: {
      threadId: "other",
      turnId: "turn",
      tool: "workbench_context",
      arguments: {},
    },
  });
  bridge.receive({
    id: 2,
    method: "item/tool/call",
    params: {
      threadId: "thread",
      turnId: "turn",
      tool: "workbench_context",
      arguments: {},
    },
  });
  await handler.queue;
  assert.equal(calls, 1);
  assert.equal(sent[0].result.success, false);
  assert.equal(sent[1].result.success, false);
  assert.match(sent[1].result.contentItems[0].text, /材料不匹配/);
});
