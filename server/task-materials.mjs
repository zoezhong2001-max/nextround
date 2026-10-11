export function resolveTaskMaterials(store, ids, applicationId) {
  return [...new Set(ids || [])].map((id) => {
    const artifact = store.get("artifacts", id);
    const review = artifact ? null : store.get("reviews", id);
    if (!artifact && !review)
      throw Object.assign(new Error("选择的材料已不存在，请重新选择"), {
        status: 400,
      });
    const item = artifact || {
      ...review,
      kind: "review",
      content:
        review.content ||
        JSON.stringify({
          summary: review.summary,
          groups: review.groups,
          uncertainties: review.uncertainties,
        }),
    };
    if (item.applicationId && item.applicationId !== applicationId)
      throw Object.assign(new Error("材料与岗位不匹配"), { status: 400 });
    return item;
  });
}
