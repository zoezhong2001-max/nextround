import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { id, now } from "./store.mjs";
import { parseHistoricalGroups } from "../shared/historical-review.mjs";
export { parseHistoricalGroups } from "../shared/historical-review.mjs";

const exec = promisify(execFile);
export const feishuURL = (value) =>
  /^https:\/\/[a-z0-9-]+\.(?:feishu\.cn|larksuite\.com)\/(?:wiki|docx)\/[a-zA-Z0-9]+(?:[?#].*)?$/.test(
    value,
  );
const key = (url) => new URL(url).pathname.split("/").filter(Boolean).at(-1);
export function documentTitle(content, fallback = "导入文档") {
  return (
    content.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/&amp;/g, "&") ||
    content.match(/^#\s+(.+)$/m)?.[1] ||
    fallback
  );
}
export function extractLinks(content) {
  return [
    ...new Set(
      content.match(
        /https:\/\/[a-z0-9-]+\.(?:feishu\.cn|larksuite\.com)\/(?:wiki|docx)\/[a-zA-Z0-9]+/g,
      ) || [],
    ),
  ];
}
export function classify(title) {
  if (/^\d{2}｜/.test(title) && !/^00｜/.test(title)) return "index";
  if (/流程总览|季终归档/.test(title)) return "material";
  if (
    /Hub|Current Plan|求职计划|当前计划|Processes|Interview Reviews|Experience Cards|Resumes|Reusable Learnings|Profile|个人档案|流程索引|复盘索引|经历索引/i.test(
      title,
    )
  )
    return /Profile|个人档案/i.test(title) ? "profile" : "index";
  if (/经历卡|经历题卡/.test(title)) return "experience";
  if (/教训|可复用|经验沉淀/.test(title)) return "learning";
  if (/简历|投递版/.test(title)) return "resume";
  if (
    /复盘/.test(title) ||
    /^20\d\d-\d{2}(?:-\d{2})?｜.+｜(?:一面|二面|三面|HR 面)$/.test(title)
  )
    return "review";
  if (/准备|题单|笔试|模拟/.test(title)) return "prep";
  if (/流程|2027 校招|2027 秋招|｜Offer｜|｜未通过｜|｜主动结束｜/.test(title))
    return "process";
  return "material";
}
export async function fetchFeishu(directory, url) {
  if (!feishuURL(url))
    throw Object.assign(new Error("请使用飞书文档或知识库页面链接"), {
      status: 400,
    });
  const { stdout } = await exec(
    "lark-cli",
    [
      "docs",
      "+fetch",
      "--as",
      "user",
      "--doc",
      url,
      "--doc-format",
      "markdown",
    ],
    { maxBuffer: 15 * 1024 * 1024, timeout: 60000 },
  );
  const json = JSON.parse(stdout);
  if (!json.ok || !json.data?.document?.content)
    throw new Error(json.error?.message || "飞书文档读取失败");
  const document = json.data.document;
  const sourceId = document.document_id || key(url);
  const snapshot = { ...json, sourceURL: url, fetchedAt: now() };
  await mkdir(join(directory, "sources"), { recursive: true, mode: 0o700 });
  await writeFile(
    join(directory, "sources", `${sourceId}.json`),
    JSON.stringify(snapshot, null, 2),
    { mode: 0o600 },
  );
  return {
    id: sourceId,
    title: documentTitle(document.content),
    content: document.content,
    url,
    revision: document.revision_id,
    kind: classify(documentTitle(document.content)),
  };
}
export async function previewImport(
  store,
  directory,
  url,
  { followLinks = true, maxDocuments = 60 } = {},
) {
  const queue = [url],
    seen = new Set(),
    documents = [],
    errors = [];
  while (queue.length && documents.length < maxDocuments) {
    const next = queue.shift();
    if (seen.has(key(next))) continue;
    seen.add(key(next));
    try {
      const document = await fetchFeishu(directory, next);
      if (documents.some((d) => d.id === document.id)) continue;
      documents.push(document);
      if (
        followLinks &&
        ["index", "process", "prep", "review"].includes(document.kind)
      )
        for (const link of extractLinks(document.content))
          if (!seen.has(key(link))) queue.push(link);
    } catch (e) {
      errors.push({ url: next, error: e.message });
    }
  }
  const batch = {
    id: id(),
    sourceURL: url,
    status: "preview",
    createdAt: now(),
    documents,
    errors,
    truncated: queue.length > 0,
  };
  store.transaction(() => store.put("imports", batch));
  return batch;
}
export function cleanContent(text) {
  // Original snapshots remain intact. The reading copy omits old maintenance sections.
  text = text
    .replace(
      /^(#{1,3})\s+(?:维护规则|本次 Skill 实测|Skill 实测|默认工作流)[^\n]*\n[\s\S]*?(?=^#{1,3}\s|$(?![\s\S]))/gm,
      "",
    )
    .replace(/^.*(?:记录原则：|结构化复盘是派生产物，不覆盖).*\n?/gm, "");
  return text
    .replace(/<title>(.*?)<\/title>/gs, (_, s) => `# ${s}\n`)
    .replace(/<\/?callout\b[^>]*>/g, "")
    .replace(/<\/?(?:b|strong)>/g, "")
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_, body) => {
      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
        [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
          c[1]
            .replace(
              /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
              "[$2]($1)",
            )
            .replace(/<[^>]+>/g, " ")
            .trim()
            .replace(/\|/g, "\\|"),
        ),
      );
      if (!rows.length) return body.replace(/<[^>]+>/g, " ");
      const columns = Math.max(...rows.map((r) => r.length));
      const formatted = rows.map(
        (r) =>
          `| ${Array.from({ length: columns }, (_, i) => r[i] || "").join(" | ")} |`,
      );
      formatted.splice(1, 0, `| ${Array(columns).fill("---").join(" | ")} |`);
      return "\n" + formatted.join("\n") + "\n";
    })
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
    .replace(/<br\s*\/?\s*>/g, "\n")
    .replace(/<\/?p\b[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function factLine(content, label) {
  return (
    [
      ...content.matchAll(
        new RegExp(`\\*\\*(?:${label})[：:]?\\*\\*\\s*([^\\n]+)`, "g"),
      ),
    ]
      .at(-1)?.[1]
      ?.replace(/[\*`]/g, "")
      .trim() || ""
  );
}
function tableRows(content, heading) {
  const start = content.search(new RegExp(`^#{1,3} ${heading}\\s*$`, "m"));
  if (start < 0) return [];
  const section = content.slice(start).split(/\n#{1,3} /)[0];
  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[-\s|:]+\|$/.test(l))
    .slice(1)
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim()),
    );
}
export function commitImport(store, batchId, mappings) {
  const batch = store.get("imports", batchId);
  if (!batch) throw new Error("导入批次不存在");
  if (batch.status === "imported") {
    associateImportedDocuments(store, batch);
    return batch;
  }
  const applications = new Map(
    store.list("applications").map((a) => [a.sourceId, a]),
  );
  const mapped =
    mappings ||
    batch.documents.map((d) => ({
      sourceId: d.id,
      kind: d.kind,
      applicationId: "",
      include: true,
    }));
  for (const mapping of mapped.filter(
    (m) => m.include && m.kind === "process",
  )) {
    const d = batch.documents.find((d) => d.id === mapping.sourceId);
    if (!d) continue;
    if (applications.has(d.id)) continue;
    const parts = d.title.split(/[｜|]/).map((s) => s.trim());
    const plain = cleanContent(d.content);
    const statusMatch =
      factLine(plain, "父流程状态|当前状态|终态|状态") ||
      plain.match(/\*\*终态[：:]([^*]+)/)?.[1] ||
      "";
    let status = "needs-verification";
    if (/未通过|closed-fail/.test(statusMatch)) status = "closed-fail";
    else if (/主动退出|主动结束|closed-withdrawn/.test(statusMatch))
      status = "closed-withdrawn";
    else if (/取消|closed-cancelled/.test(statusMatch))
      status = "closed-cancelled";
    else if (/等待|waiting-result/.test(statusMatch)) status = "waiting-result";
    else if (/准备|preparing|笔试|已进入/.test(statusMatch))
      status = "preparing";
    else if (/Offer/.test(statusMatch)) status = "closed-pass";
    const currentTitle = factLine(plain, "当前阶段|当前轮次");
    const company = mapping.company || parts[0];
    const role =
      mapping.role ||
      parts.find(
        (p) => !/^20\d\d|Offer|未通过|主动结束/.test(p) && p !== parts[0],
      ) ||
      parts[0];
    const app = {
      id: id(),
      sourceId: d.id,
      source: d.url,
      title: d.title,
      company,
      role,
      batch: parts.find((p) => /20\d\d/.test(p)) || "",
      status,
      nextAction: factLine(plain, "下一步") || "回看历史复盘，保留可复用经验",
      updatedAt: now(),
      events: [],
      facts: [],
      imported: true,
      result: /Offer/.test(statusMatch) ? "Offer" : "",
    };
    const rows = tableRows(plain, "阶段历史|流程");
    const stages = rows
      .filter((r) => r.length >= 3)
      .map((r, index) => ({
        id: id(),
        applicationId: app.id,
        title: r[1],
        order: index + 1,
        recordedDate: r[0],
        date: "",
        result: r[2],
        frozen: /通过|结束|Offer|未通过/.test(r[2]),
        imported: true,
      }));
    // Branch tables have their own heading; only create stages from explicit branch results.
    const explicitBranches = [
      ...plain.matchAll(/^\| (AI-native[^|]+|生态平台方向) \| ([^\n]+)$/gm),
    ];
    for (const b of explicitBranches) {
      const cols = b[0]
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim());
      for (const match of (cols[2] || "").matchAll(
        /(一面|二面|三面)(未通过|通过)/g,
      ))
        stages.push({
          id: id(),
          applicationId: app.id,
          title: `${cols[0]} · ${match[1]}`,
          order: stages.length + 1,
          recordedDate: "",
          date: "",
          result: match[2],
          frozen: true,
          branch: cols[0],
          imported: true,
        });
    }
    let current = stages.find(
      (s) => s.title.replace(/准备$/, "") === currentTitle.replace(/准备$/, ""),
    );
    if (!current && /笔试|Assessment/i.test(currentTitle))
      current = stages.find((s) => /笔试|Assessment/i.test(s.title));
    if (!current && currentTitle) {
      current = {
        id: id(),
        applicationId: app.id,
        title: currentTitle,
        order: stages.length + 1,
        result: "",
        date: "",
        frozen: false,
        imported: true,
      };
      stages.push(current);
    }
    if (!stages.length)
      stages.push({
        id: id(),
        applicationId: app.id,
        title:
          factLine(plain, "面试轮次") ||
          (/二面/.test(statusMatch)
            ? "二面"
            : /一面/.test(statusMatch)
              ? "一面"
              : /Offer/.test(statusMatch)
                ? "Offer"
                : "阶段待核对"),
        order: 1,
        result: statusMatch,
        date: "",
        frozen: status.startsWith("closed-"),
        imported: true,
      });
    app.currentStageId = current?.id || stages.at(-1).id;
    stages.forEach((s) => store.put("stages", s));
    store.put("applications", app);
    applications.set(d.id, app);
  }
  const docsToApp = new Map();
  for (const d of batch.documents.filter((d) => applications.has(d.id))) {
    const app = applications.get(d.id);
    docsToApp.set(d.id, app);
    for (const link of extractLinks(d.content)) {
      const linked = batch.documents.find(
        (x) => key(x.url) === key(link) || x.id === key(link),
      );
      if (linked && !docsToApp.has(linked.id)) docsToApp.set(linked.id, app);
    }
  }
  for (const mapping of mapped.filter((m) => m.include)) {
    const d = batch.documents.find((d) => d.id === mapping.sourceId);
    if (!d) continue;
    const app = mapping.applicationId
      ? store.get("applications", mapping.applicationId)
      : docsToApp.get(d.id);
    const objectId = `feishu-${createHash("sha256").update(d.id).digest("hex").slice(0, 24)}`;
    const kind = mapping.kind;
    if (kind === "index") continue;
    const target = ["experience", "profile", "learning", "resume"].includes(
      kind,
    )
      ? "assets"
      : kind === "review"
        ? "reviews"
        : "artifacts";
    if (store.get(target, objectId)) continue;
    const object = {
      id: objectId,
      title: d.title,
      content: cleanContent(d.content),
      originalContent: d.content,
      source: d.url,
      sourceId: d.id,
      sourceRevision: d.revision,
      kind,
      applicationId: app?.id || "",
      stageId: "",
      createdAt: now(),
      imported: true,
    };
    if (app && ["prep", "review"].includes(kind)) {
      const phase = d.title.match(/(一面|二面|三面|HR 面|线上笔试)/)?.[1];
      const stages = store
        .list("stages")
        .filter((s) => s.applicationId === app.id);
      let matched = stages.find((s) => phase && s.title.includes(phase));
      if (stages.some((s) => s.branch)) {
        // The final branch table explicitly associates each source document with a branch.
        const process = batch.documents.find((x) => x.id === app.sourceId);
        const row = process?.content
          .split("\n")
          .find(
            (l) =>
              l.startsWith("|") &&
              extractLinks(l).some((link) => key(link) === key(d.url)),
          );
        const branch = row?.split("|")[1]?.trim();
        if (branch)
          matched = stages.find(
            (s) => s.branch === branch && s.title.includes(phase),
          );
      }
      object.stageId =
        matched?.id || (kind === "prep" && !phase ? app.currentStageId : "");
      if (kind === "prep" && phase === "线上笔试")
        object.stageId = app.currentStageId;
    }
    if (target === "reviews") {
      object.groups = parseHistoricalGroups(object.content);
      object.status = "imported";
      object.summary = factLine(object.content, "核心诊断") || "";
      object.result =
        factLine(object.content, "结果|当时结果") ||
        factLine(object.content, "当前状态") ||
        store.get("stages", object.stageId)?.result ||
        "";
      if (app?.status.startsWith("closed-"))
        object.processResult =
          app.result ||
          {
            "closed-fail": "未通过",
            "closed-withdrawn": "主动结束",
            "closed-pass": "流程已结束",
          }[app.status];
    }
    if (kind === "process" && app) object.stageId = app.currentStageId;
    store.put(target, object);
    if (kind === "prep" && app && !app.status.startsWith("closed-")) {
      for (const match of object.content.matchAll(/^- \[ \] (.+)$/gm)) {
        if (
          store
            .list("actions")
            .some((a) => a.title === match[1] && a.applicationId === app.id)
        )
          continue;
        store.put("actions", {
          id: id(),
          title: match[1],
          applicationId: app.id,
          stageId: object.stageId || app.currentStageId,
          sourceId: object.id,
          done: false,
          createdAt: now(),
        });
      }
    }
  }
  batch.status = "imported";
  associateImportedDocuments(store, batch);
  batch.importedAt = now();
  batch.mappings = mapped;
  store.put("imports", batch);
  return batch;
}

// Legacy reports often link back to their process, while the process has no
// outward links. Resolve both directions without rewriting imported content.
export function associateImportedDocuments(store, batch) {
  const apps = store.list("applications");
  const documents = batch.documents;
  const resolves = (d, link) => key(d.url) === key(link) || d.id === key(link);
  for (const collection of ["reviews", "artifacts"]) {
    for (const object of store
      .list(collection)
      .filter((o) => o.imported && !o.applicationId)) {
      const source = documents.find((d) => d.id === object.sourceId);
      if (!source) continue;
      const app = apps.find((a) => {
        const process = documents.find((d) => d.id === a.sourceId);
        return (
          process &&
          (extractLinks(source.content).some((link) =>
            resolves(process, link),
          ) ||
            extractLinks(process.content).some((link) =>
              resolves(source, link),
            ))
        );
      });
      if (!app) continue;
      object.applicationId = app.id;
      const phase = object.title.match(/(一面|二面|三面|HR 面|线上笔试)/)?.[1];
      let stages = store
        .list("stages")
        .filter((s) => s.applicationId === app.id);
      const process = documents.find((d) => d.id === app.sourceId);
      const branchRow = process?.content
        .split("\n")
        .find(
          (line) =>
            line.startsWith("|") &&
            extractLinks(line).some((link) => resolves(source, link)),
        );
      const branch = branchRow?.split("|")[1]?.trim();
      let stage = stages.find(
        (s) =>
          phase &&
          s.title.includes(phase) &&
          (!branch || !s.branch || s.branch === branch),
      );
      if (!stage && phase && object.kind === "review") {
        stage = {
          id: id(),
          applicationId: app.id,
          title: phase,
          order:
            phase === "一面"
              ? Math.min(...stages.map((s) => s.order), 1) - 1
              : stages.length + 1,
          date: "",
          recordedDate: object.title.match(/20\d\d-\d{2}-\d{2}/)?.[0] || "",
          result: object.result || "",
          frozen: true,
          imported: true,
        };
        store.put("stages", stage);
      }
      object.stageId =
        stage?.id || (object.kind === "prep" ? app.currentStageId : "");
      store.put(collection, object);
    }
  }
}
