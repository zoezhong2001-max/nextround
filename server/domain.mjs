import { id, now } from "./store.mjs";
import { parseHistoricalGroups } from "../shared/historical-review.mjs";

export const statuses = {
  preparing: "准备中",
  "waiting-result": "等待结果",
  "advanced-to-next-round": "进入下一阶段",
  "closed-fail": "未通过",
  "closed-withdrawn": "主动退出",
  "closed-cancelled": "岗位取消",
  "closed-pass": "已结束",
  "offer-received": "已收到 Offer",
  "needs-verification": "状态待确认",
};
export const isClosed = (status) => status?.startsWith("closed-");
export function required(value, label, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    const e = new Error(`${label}不能为空，且不能超过 ${max} 字`);
    e.status = 400;
    throw e;
  }
  return value.trim();
}
export function createApplication(store, input) {
  const app = {
    id: id(),
    company: required(input.company, "公司"),
    role: required(input.role, "岗位"),
    batch: input.batch || "",
    status: "preparing",
    nextAction: input.nextAction || "补充岗位材料，准备当前阶段",
    updatedAt: now(),
    source: input.source || "",
    events: [],
    facts: [],
  };
  const stage = {
    id: id(),
    applicationId: app.id,
    title: required(input.stage || "一面", "阶段"),
    order: 1,
    date: input.date || "",
    result: "",
    frozen: false,
  };
  app.currentStageId = stage.id;
  store.put("applications", app);
  store.put("stages", stage);
  if (input.jd?.trim())
    store.put("artifacts", {
      id: id(),
      applicationId: app.id,
      stageId: stage.id,
      title: `${app.company}｜岗位 JD`,
      kind: "jd",
      content: input.jd,
      source: input.source || "用户输入",
      createdAt: now(),
    });
  return app;
}
export function updateProgress(store, applicationId, input) {
  const app = store.get("applications", applicationId);
  if (!app) throw Object.assign(new Error("岗位不存在"), { status: 404 });
  const stage = store.get("stages", input.stageId || app.currentStageId);
  if (!stage || stage.applicationId !== app.id)
    throw Object.assign(new Error("阶段不属于此岗位"), { status: 400 });
  const eventType = input.type;
  const allowed = [
    "scheduled",
    "rescheduled",
    "completed",
    "advanced",
    "failed",
    "withdrawn",
    "cancelled",
    "reopened",
  ];
  if (!allowed.includes(eventType))
    throw Object.assign(new Error("无效进度事件"), { status: 400 });
  const occurredAt = required(input.occurredAt, "发生日期");
  if (
    !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(occurredAt) ||
    !Number.isFinite(Date.parse(occurredAt))
  )
    throw Object.assign(new Error("发生日期无效"), { status: 400 });
  const source = required(input.source, "通知来源", 3000);
  const eventKey = `${stage.id}:${eventType}:${occurredAt.slice(0, 10)}`;
  const existing = app.events.find((e) => e.key === eventKey);
  if (existing) {
    existing.source = source;
    store.put("applications", app);
    return app;
  }
  const event = {
    id: id(),
    key: eventKey,
    stageId: stage.id,
    type: eventType,
    occurredAt,
    source,
    recordedAt: now(),
  };
  app.events.push(event);
  const currentStage = store.get("stages", app.currentStageId);
  const newest =
    (!currentStage || stage.order >= currentStage.order) &&
    (!app.lastEventAt || Date.parse(occurredAt) >= Date.parse(app.lastEventAt));
  if (
    ["completed", "advanced", "failed", "withdrawn", "cancelled"].includes(
      eventType,
    )
  )
    stage.frozen = true;
  if (eventType === "advanced") stage.result = "通过";
  if (eventType === "failed") stage.result = "未通过";
  if (eventType === "completed") stage.result ||= "等待结果";
  if (newest) {
    const map = {
      scheduled: "preparing",
      rescheduled: app.status,
      completed: "waiting-result",
      advanced: "advanced-to-next-round",
      failed: "closed-fail",
      withdrawn: "closed-withdrawn",
      cancelled: "closed-cancelled",
      reopened: "preparing",
    };
    app.status = map[eventType];
    app.lastEventAt = occurredAt;
    app.updatedAt = now();
    if (input.nextAction !== undefined) app.nextAction = input.nextAction;
    else
      app.nextAction =
        eventType === "advanced"
          ? "确认下一阶段安排"
          : isClosed(app.status)
            ? "回看复盘，整理可复用经验"
            : eventType === "completed"
              ? "复盘本场面试，等待招聘方反馈"
              : app.nextAction;
    if (input.date !== undefined) stage.date = input.date;
    if (eventType === "advanced") {
      const nextTitle = required(input.nextStage, "下一阶段");
      let next = store
        .list("stages")
        .find(
          (s) =>
            s.applicationId === app.id &&
            s.order > stage.order &&
            s.title === nextTitle,
        );
      if (!next)
        next = {
          id: id(),
          applicationId: app.id,
          title: nextTitle,
          order: stage.order + 1,
          date: input.date || "",
          result: "",
          frozen: false,
        };
      else if (input.date !== undefined) next.date = input.date;
      store.put("stages", next);
      app.currentStageId = next.id;
    }
  }
  store.put("stages", stage);
  for (const review of store
    .list("reviews")
    .filter((r) => r.applicationId === app.id && r.stageId === stage.id)) {
    if (["advanced", "failed"].includes(eventType)) {
      review.result = stage.result;
      review.feedbackSource = source;
    }
    if (newest && isClosed(app.status))
      review.processResult = statuses[app.status];
    store.put("reviews", review);
  }
  store.put("applications", app);
  return app;
}
export function addPractice(store, input) {
  const title = required(input.title, "练习内容", 3000);
  const app = store.get("applications", input.applicationId);
  const stage = store.get("stages", input.stageId || app?.currentStageId);
  if (!app || !stage || stage.applicationId !== app.id)
    throw Object.assign(new Error("请先选择目标岗位与阶段"), { status: 400 });
  if (isClosed(app.status))
    throw Object.assign(new Error("该流程已归档，请选择进行中的目标岗位"), {
      status: 400,
    });
  const existing = store
    .list("actions")
    .find(
      (a) =>
        a.title === title &&
        a.stageId === stage.id &&
        a.sourceId === input.sourceId,
    );
  if (existing) return existing;
  const action = {
    id: id(),
    applicationId: app.id,
    stageId: stage.id,
    title,
    done: false,
    sourceId: input.sourceId || "",
    createdAt: now(),
  };
  return store.put("actions", action);
}
export function searchSnapshot(snapshot, query, filters = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const apps = new Map(snapshot.applications.map((a) => [a.id, a]));
  const results = [];
  const add = (entity, kind, text, route) => {
    const app = apps.get(
      entity.applicationId || (kind === "岗位" ? entity.id : ""),
    );
    if (filters.applicationId && app?.id !== filters.applicationId) return;
    if (filters.kind && filters.kind !== kind) return;
    if (filters.status === "active" && (!app || isClosed(app.status))) return;
    if (filters.status === "closed" && !isClosed(app?.status)) return;
    const haystack = `${entity.title || ""} ${text || ""}`;
    if (!terms.every((t) => haystack.toLocaleLowerCase().includes(t))) return;
    const at = haystack.toLocaleLowerCase().indexOf(terms[0]);
    results.push({
      id: entity.id,
      title: entity.title || `${entity.company}｜${entity.role}`,
      kind,
      applicationId: app?.id,
      company: app?.company,
      snippet: haystack.slice(Math.max(0, at - 35), at + 130),
      route,
    });
  };
  snapshot.applications.forEach((a) =>
    add(
      a,
      "岗位",
      `${a.company} ${a.role} ${a.batch} ${a.nextAction} ${JSON.stringify(a.facts)}`,
      `/jobs/${a.id}`,
    ),
  );
  snapshot.artifacts.forEach((a) =>
    add(a, "材料", a.content, `/documents/${a.id}`),
  );
  snapshot.assets.forEach((a) =>
    add(a, "个人资产", a.content, `/assets/${a.id}`),
  );
  snapshot.reviews.forEach((r) => {
    add(r, "问题与复盘", r.summary || r.content, `/reviews/${r.id}`);
    (r.imported
      ? parseHistoricalGroups(r.content || "")
      : r.groups || []
    ).forEach((g, gi) =>
      (g.questions || []).forEach((q, qi) =>
        add(
          { ...r, id: `${r.id}:${gi}:${qi}`, title: q.question },
          "问题与复盘",
          q.answer,
          `/reviews/${r.id}?group=${gi}&question=${qi}`,
        ),
      ),
    );
  });
  return results.slice(0, 100);
}
