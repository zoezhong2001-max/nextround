import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ReadingText,
  plainText,
  readingParts,
  recordDate,
  newestFirst,
  localDocumentRoute,
  jobLabel,
  documentHeadings,
} from "../src/reading.mjs";
import { parseHistoricalGroups } from "../shared/historical-review.mjs";
import { resolveTaskMaterials } from "../server/task-materials.mjs";

const render = (text, props = {}) =>
  renderToStaticMarkup(createElement(ReadingText, { text, ...props }));
test("中文标点紧贴加粗也能阅读，真实代码与转义星号保留", () => {
  const html = render(
    "- **当前状态：**准备笔试\n- **职责：**用户研究\n\n普通**加粗**。\n\n`a ** b` 与 \\*\\*原样星号\\*\\*",
  );
  assert.match(html, /<strong>当前状态：<\/strong>准备笔试/);
  assert.match(html, /<strong>职责：<\/strong>用户研究/);
  assert.match(html, /<code>a \*\* b<\/code>/);
  assert.match(html, /\*\*原样星号\*\*/);
  assert.equal(
    plainText("**标签：**正文，[经历卡](https://example.com) 与 `x * y`"),
    "标签：正文，经历卡 与 x * y",
  );
});
test("阅读保留列表、表格和安全链接，不能执行导入 HTML", () => {
  const html = render(
    "# 题目\n\n- 第一项\n- 第二项\n\n| 项目 | 数值 |\n| --- | --- |\n| **结果：**CVR | +1.64% |\n\n<script>alert(1)</script>\n\n[错误链接](javascript:alert(1))",
  );
  assert.match(html, /<ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>结果：<\/strong>/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
});
test("长文正文与维护记录可分别阅读，用户内容未丢失", () => {
  const source =
    "# 准备\n\n## 一、问题\n**重点：**案例\n\n## 十、本次 Skill 测试记录\n内部维护说明\n\n## 十一、JD 原文\n原始岗位内容";
  const parts = readingParts(source, "准备");
  assert.doesNotMatch(parts.body, /内部维护说明|^# 准备/);
  assert.match(parts.notes, /内部维护说明/);
  assert.match(parts.body, /原始岗位内容/);
  assert.equal(documentHeadings(parts.body).length, 2);
  assert.match(source, /内部维护说明/);
});
test("历史资料按记录日期排序，不把同批导入时间当作最新成果", () => {
  const old = {
    title: "2026-04-10｜复盘",
    imported: true,
    createdAt: "2026-10-04T00:00:02Z",
  };
  const recent = {
    title: "准备稿",
    content: "**更新时间：**2026-09-29",
    imported: true,
    createdAt: "2026-10-04T00:00:01Z",
  };
  assert.equal(recordDate(recent), "2026-09-29");
  assert.deepEqual([old, recent].sort(newestFirst), [recent, old]);
  assert.equal(recordDate({ ...old, title: "未知日期记录" }), "");
});
test("飞书内部链接回到本地岗位和经历，未知来源仍保留外链", () => {
  const data = {
    applications: [],
    assets: [
      {
        id: "asset",
        sourceId: "DocA",
        source: "https://x.feishu.cn/wiki/WikiA",
      },
    ],
    reviews: [],
    artifacts: [
      {
        id: "process",
        kind: "process",
        applicationId: "job",
        sourceId: "DocP",
      },
    ],
  };
  assert.equal(
    localDocumentRoute("https://x.feishu.cn/docx/DocA", data),
    "/assets/asset",
  );
  assert.equal(
    localDocumentRoute("https://x.feishu.cn/docx/DocP", data),
    "/jobs/job",
  );
  assert.equal(localDocumentRoute("https://example.com/docx/DocA", data), null);
  assert.equal(jobLabel({ company: "测试岗位", role: "测试岗位" }), "测试岗位");
});
test("旧复盘只有摘要也可逐题阅读，但不冒充原话", () => {
  const groups = parseHistoricalGroups(
    "### Q1：如何衡量效果？\n- **我的回答摘要**：介绍主指标。\n- **可改进处**：缺少护栏指标。\n- **理想答案要点**：先说明目标。\n### Q2：追问\n- **面试官原话**：分母是什么？\n- **我的回答摘要**：活跃用户。",
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].questions[0].questionType, "summary");
  assert.equal(groups[1].questions[0].questionType, "verbatim");
  assert.equal(groups[0].questions[0].answerType, "summary");
});
test("下一轮准备可选上一轮复盘，仍拒绝串岗和不存在的材料", () => {
  const review = {
    id: "r",
    applicationId: "a",
    summary: "改进指标",
    groups: [{ title: "指标" }],
  };
  const store = {
    get: (collection, id) =>
      collection === "reviews" && id === "r" ? review : null,
  };
  const materials = resolveTaskMaterials(store, ["r", "r"], "a");
  assert.equal(materials.length, 1);
  assert.equal(materials[0].kind, "review");
  assert.match(materials[0].content, /改进指标/);
  assert.throws(() => resolveTaskMaterials(store, ["r"], "b"), /不匹配/);
  assert.throws(() => resolveTaskMaterials(store, ["missing"], "a"), /不存在/);
});
