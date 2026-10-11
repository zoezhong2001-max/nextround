import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import {
  createApplication,
  updateProgress,
  addPractice,
  searchSnapshot,
} from "../server/domain.mjs";
import { validateReview } from "../server/tasks.mjs";
import {
  cleanContent,
  classify,
  feishuURL,
  commitImport,
} from "../server/importer.mjs";
const fixture = () =>
  new Store(mkdtempSync(join(tmpdir(), "pm-workbench-test-")));
test("历史复盘反向链接能关联岗位，重复导入不改写摘要", () => {
  const store = fixture();
  store.put("imports", {
    id: "reverse",
    status: "preview",
    documents: [
      {
        id: "process",
        title: "测试产品｜未通过｜2026",
        kind: "process",
        url: "https://x.feishu.cn/wiki/processwiki",
        content: "# 流程\n**终态：**二面未通过",
      },
      {
        id: "review",
        title: "2026-05-01｜测试产品｜一面",
        kind: "review",
        url: "https://x.feishu.cn/wiki/reviewwiki",
        content:
          "# 复盘\n[岗位](https://x.feishu.cn/docx/process)\n## Q1：经历\n- **面试官原话**：介绍经历\n- **我的回答摘要**：做过产品",
      },
    ],
  });
  store.transaction(() => commitImport(store, "reverse"));
  const review = store.list("reviews")[0];
  assert.equal(review.applicationId, store.list("applications")[0].id);
  assert.equal(store.get("stages", review.stageId).title, "一面");
  assert.equal(review.groups[0].questions[0].answerType, "summary");
  store.transaction(() => commitImport(store, "reverse"));
  assert.equal(store.list("reviews").length, 1);
  assert.equal(store.list("reviews")[0].content, review.content);
  assert.equal(classify("历史投递版｜2026-04-12"), "resume");
  store.close();
});
test("一面通过原子更新，并且重复通知不创建新阶段", () => {
  const store = fixture();
  const app = store.transaction(() =>
    createApplication(store, {
      company: "测试公司",
      role: "PM",
      stage: "一面",
    }),
  );
  store.transaction(() =>
    store.put("reviews", {
      id: "review",
      applicationId: app.id,
      stageId: app.currentStageId,
      groups: [{ questions: [{ question: "原始问题", answer: "原始回答" }] }],
    }),
  );
  const event = {
    type: "advanced",
    stageId: app.currentStageId,
    occurredAt: "2026-09-23",
    source: "HR 确认",
    nextStage: "二面",
  };
  store.transaction(() => updateProgress(store, app.id, event));
  store.transaction(() => updateProgress(store, app.id, event));
  assert.equal(store.list("stages").length, 2);
  assert.equal(store.get("applications", app.id).events.length, 1);
  assert.equal(
    store.get("applications", app.id).status,
    "advanced-to-next-round",
  );
  assert.equal(store.get("reviews", "review").result, "通过");
  assert.equal(
    store.get("reviews", "review").groups[0].questions[0].answer,
    "原始回答",
  );
  store.close();
});
test("补录旧的一面结果不会把二面结束后的当前状态退回去", () => {
  const store = fixture();
  const app = store.transaction(() =>
    createApplication(store, {
      company: "测试公司",
      role: "PM",
      stage: "一面",
    }),
  );
  const first = app.currentStageId;
  store.transaction(() =>
    updateProgress(store, app.id, {
      type: "advanced",
      occurredAt: "2026-09-23",
      source: "HR",
      nextStage: "二面",
    }),
  );
  store.transaction(() =>
    updateProgress(store, app.id, {
      type: "failed",
      occurredAt: "2026-09-26",
      source: "HR 明确未通过",
    }),
  );
  store.transaction(() =>
    updateProgress(store, app.id, {
      type: "advanced",
      stageId: first,
      occurredAt: "2026-09-22",
      source: "补录早期通知",
      nextStage: "二面",
    }),
  );
  assert.equal(store.get("applications", app.id).status, "closed-fail");
  assert.equal(store.list("stages").length, 2);
  store.close();
});
test("日期已过去不会自动改变结果；冲突保存回滚所有写入", () => {
  const store = fixture();
  const app = store.transaction(() =>
    createApplication(store, {
      company: "公司",
      role: "PM",
      date: "2025-01-01",
    }),
  );
  assert.equal(store.get("applications", app.id).status, "preparing");
  assert.throws(
    () => store.transaction(() => store.put("actions", { id: "x" }), 0),
    /刷新/,
  );
  assert.equal(store.get("actions", "x"), null);
  store.close();
});
test("复盘实际问题与回答必须保留逐字原文，不能把示范充作历史回答", () => {
  const transcript =
    "00:12 面试官：你为什么先做这个功能？\n我：因为我们先验证了运营的使用场景，然后决定做。";
  const result = {
    groups: [
      {
        questions: [
          {
            question: "你为什么先做这个功能？",
            answer: "因为我们先验证了运营的使用场景，然后决定做。",
            timestamp: "00:12",
          },
        ],
      },
    ],
  };
  assert.equal(validateReview(result, transcript), result);
  assert.throws(
    () =>
      validateReview(
        {
          groups: [
            {
              questions: [
                {
                  question: "你为什么先做这个功能？",
                  answer: "我先完成了十次用户访谈。",
                  timestamp: "",
                },
              ],
            },
          ],
        },
        transcript,
      ),
    /不一致/,
  );
  assert.throws(
    () =>
      validateReview(
        {
          groups: [
            {
              questions: [
                { ...result.groups[0].questions[0], timestamp: "00:99" },
              ],
            },
          ],
        },
        transcript,
      ),
    /时间戳/,
  );
});
test("练习来源去重，跨阶段练习仍是独立动作", () => {
  const store = fixture();
  const app = store.transaction(() =>
    createApplication(store, { company: "公司", role: "PM" }),
  );
  const input = {
    applicationId: app.id,
    title: "讲清指标分母",
    sourceId: "review",
  };
  store.transaction(() => addPractice(store, input));
  store.transaction(() => addPractice(store, input));
  assert.equal(store.list("actions").length, 1);
  store.close();
});
test("关键词搜索定位到实际问题，并支持归档与岗位过滤", () => {
  const snapshot = {
    applications: [
      {
        id: "a",
        company: "测试",
        role: "PM",
        status: "closed-fail",
        facts: [],
      },
    ],
    artifacts: [],
    assets: [],
    reviews: [
      {
        id: "r",
        applicationId: "a",
        title: "复盘",
        groups: [
          { questions: [{ question: "指标的分母是什么", answer: "活跃用户" }] },
        ],
      },
    ],
  };
  const results = searchSnapshot(snapshot, "分母", { status: "closed" });
  assert.equal(results.length, 1);
  assert.equal(results[0].route, "/reviews/r?group=0&question=0");
  assert.equal(
    searchSnapshot(snapshot, "分母", { status: "active" }).length,
    0,
  );
});
test("飞书预览只允许文档 URL；导入重复执行不重复创建资产", () => {
  assert.equal(feishuURL("https://x.feishu.cn/wiki/Abc123"), true);
  assert.equal(feishuURL("http://127.0.0.1/wiki/abc"), false);
  assert.equal(feishuURL("https://example.com/wiki/abc"), false);
  const store = fixture();
  store.put("imports", {
    id: "batch",
    status: "preview",
    documents: [
      {
        id: "source",
        title: "测试经历卡",
        kind: "experience",
        url: "https://x.feishu.cn/wiki/a",
        content: "# 原始经历",
        revision: 1,
      },
    ],
  });
  store.transaction(() => commitImport(store, "batch"));
  store.transaction(() => commitImport(store, "batch"));
  assert.equal(store.list("assets").length, 1);
  assert.equal(store.list("assets")[0].originalContent, "# 原始经历");
  store.close();
});
test("富文本清理保留正文与链接，表格可阅读", () => {
  const content = cleanContent(
    '<title>标题</title><callout emoji="x"><p>内容</p></callout><table><tr><th>列</th></tr><tr><td><a href="https://example.com">来源</a></td></tr></table>',
  );
  assert.ok(content.includes("# 标题"));
  assert.ok(content.includes("[来源](https://example.com)"));
  assert.ok(content.includes("| --- |"));
  assert.equal(classify("Sea｜线上笔试准备"), "prep");
});
