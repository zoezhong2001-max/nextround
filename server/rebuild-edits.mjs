import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const fields = {
  memory: ['text', 'note'],
  profile: ["value", "note"],
  experience: ["subtitle", "period", "gaps"],
  block: ["text"],
  review: ["conclusion", "roleFacts", "feedback", "actions"],
  question: ["diagnosis", "correction"],
  group: ["advice", "example", "gaps"],
  family: ["summary"],
};
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function target(doc, ref) {
  switch (ref.kind) {
    case 'memory':
      return doc.memories?.find(x => x.id === ref.id);
    case "profile":
      return doc.profile?.find((x) => x.label === ref.id);
    case "experience":
      return doc.experiences?.find((x) => x.id === ref.id);
    case "block":
      return doc.experiences
        ?.find((x) => x.id === ref.parent)
        ?.blocks.find((x) => x.title === ref.id);
    case "review":
      return doc.fullReviews?.find((x) => x.sessionId === ref.id);
    case "question":
      return doc.fullReviews
        ?.find((x) => x.sessionId === ref.parent)
        ?.questions.find((x) => x.id === ref.id);
    case "group":
      return doc.fullReviews
        ?.find((x) => x.sessionId === ref.parent)
        ?.groups.find((x) => x.id === ref.id);
    case "family":
      return doc.questionFamilies?.find((x) => x.id === ref.id);
  }
}
export function readRebuild(store) {
  const doc =
    store.setting("workbenchDocument") ||
    JSON.parse(
      readFileSync(
        join(store.directory, "rebuild-2026-10/dossier.json"),
        "utf8",
      ),
    );
  const history = store.setting("rebuildEdits") || [];
  const revision = createHash("sha256")
    .update(JSON.stringify([doc, history]))
    .digest("hex");
  for (const edit of history) {
    const object = target(doc, edit.ref);
    if (object) Object.assign(object, edit.after, { userEditedAt: edit.at });
  }
  return { ...doc, editRevision: revision, editHistory: history };
}

// Keep stable references and the human-edit journal; the preview file becomes a source snapshot.
export function migrateWorkbench(store) {
  if (store.setting("workbenchDocument")) return readRebuild(store);
  return store.transaction(() => {
    const doc = readRebuild(store);
    delete doc.editRevision;
    delete doc.editHistory;
    doc.mode = "workspace";
    doc.version = 2;
    for (const job of doc.jobs || []) {
      const stages = job.stages.map((s, i) => ({
        ...s,
        id: `${job.id}-stage-${i + 1}`,
        applicationId: job.id,
        order: i + 1,
        date: "",
        frozen: true,
      }));
      for (const stage of stages) store.put("stages", stage);
      store.put("applications", {
        ...job,
        stages: undefined,
        events: [],
        facts: [],
        currentStageId: stages.at(-1)?.id,
        nextAction: "流程已结束，保留复盘用于后续准备。",
      });
    }
    const old =
      doc.replacesApplicationId &&
      store.get("applications", doc.replacesApplicationId);
    if (old)
      store.put("applications", {
        ...old,
        supersededBy: (doc.jobs || []).map((j) => j.id),
      });
    store.setting("workbenchDocument", doc);
    store.setting("workbenchMigration", {
      version: 2,
      at: new Date().toISOString(),
      source: "rebuild-2026-10/dossier.json",
    });
    return readRebuild(store);
  });
}
export function editRebuild(store, body) {
  return store.transaction(() => {
    const doc = readRebuild(store);
    if (body.revision !== doc.editRevision)
      fail("内容已更新。请先保留输入，刷新页面后再保存。", 409);
    const ref = body.ref;
    if (!ref || !Object.hasOwn(fields, ref.kind)) fail("不可编辑的内容类型");
    const object = target(doc, ref);
    if (!object) fail("内容不存在", 404);
    if (
      !body.changes ||
      typeof body.changes !== "object" ||
      Array.isArray(body.changes)
    )
      fail("修改内容无效");
    const before = {},
      after = {};
    for (const [key, value] of Object.entries(body.changes)) {
      if (!fields[ref.kind].includes(key))
        fail("原始问答、来源和流程结果不能通过内容编辑改写");
      const list = key === "gaps" || key === "actions";
      if (
        list
          ? !Array.isArray(value) ||
            value.length > 100 ||
            value.some((v) => typeof v !== "string" || v.length > 12000)
          : typeof value !== "string" || value.length > 40000
      )
        fail("修改格式或长度不合适");
      const old = object[key] ?? (list ? [] : "");
      if (JSON.stringify(old) !== JSON.stringify(value)) {
        before[key] = old;
        after[key] = value;
      }
    }
    if (!Object.keys(after).length) return doc;
    const edit = {
      id: randomUUID(),
      ref: {
        kind: ref.kind,
        id: ref.id,
        ...(ref.parent ? { parent: ref.parent } : {}),
      },
      before,
      after,
      at: new Date().toISOString(),
      author: "user",
    };
    // ponytail: single-user journal; move to indexed rows if its read cost becomes material.
    store.setting("rebuildEdits", [...doc.editHistory, edit]);
    return readRebuild(store);
  });
}
