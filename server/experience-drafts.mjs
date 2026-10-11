import { createHash } from "node:crypto";
import { now } from "./store.mjs";
const hash = (value) =>
  createHash("sha256")
    .update(value || "")
    .digest("hex");
export function acceptExperienceDraft(store, draftId, input) {
  const draft = store.get("artifacts", draftId);
  if (!draft || draft.kind !== "experience" || !draft.assetId)
    throw new Error("这份文档不是关联经历的修改草稿");
  if (draft.acceptedAt) return store.get("assets", draft.assetId);
  const asset = store.get("assets", draft.assetId);
  if (!asset || hash(asset.content) !== draft.assetFingerprint)
    throw Object.assign(
      new Error("经历已在生成草稿后更新，请重新核对最新版本后再整理"),
      { status: 409 },
    );
  if (
    typeof input.source !== "string" ||
    !input.source.trim() ||
    input.source.length > 3000
  )
    throw new Error("请填写本次事实核对依据");
  const updated = {
    ...asset,
    content: draft.content,
    updatedAt: now(),
    confirmedAt: now(),
    source: input.source.trim(),
    versions: [
      ...(asset.versions || []),
      { content: asset.content, source: asset.source, savedAt: now() },
    ],
  };
  store.put("assets", updated);
  store.put("artifacts", { ...draft, status: "reviewed", acceptedAt: now() });
  return updated;
}
