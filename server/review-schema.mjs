const string = { type: "string" };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const reviewSchema = object({
  title: string,
  summary: string,
  groups: {
    type: "array",
    items: object({
      title: string,
      diagnosis: string,
      evidence: string,
      betterStructure: string,
      example: string,
      supplement: string,
      experienceIds: { type: "array", items: string },
      questions: {
        type: "array",
        items: object({
          question: string,
          answer: string,
          timestamp: string,
          diagnosis: string,
          sourceQuote: string,
        }),
      },
      practice: { type: "array", items: string },
    }),
  },
  uncertainties: { type: "array", items: string },
});

export function validateReview(result, transcript) {
  if (!result || !Array.isArray(result.groups) || result.groups.length === 0)
    throw new Error("复盘未返回有效问题组");
  const normalize = (t) => (t || "").normalize("NFKC").replace(/\s+/g, "");
  const source = normalize(transcript);
  for (const group of result.groups) {
    if (!Array.isArray(group.questions) || !group.questions.length)
      throw new Error("问题组缺少逐题记录");
    for (const q of group.questions) {
      if (
        !q.question ||
        !q.answer ||
        !source.includes(normalize(q.question)) ||
        !source.includes(normalize(q.answer))
      )
        throw new Error("问题或实际回答与原逐字稿不一致，请检查后重试");
      if (q.timestamp && !transcript.includes(q.timestamp))
        throw new Error("时间戳在原稿中不存在");
      if (q.sourceQuote && !source.includes(normalize(q.sourceQuote)))
        throw new Error("诊断引用与原逐字稿不一致");
    }
  }
  return result;
}
