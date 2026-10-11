// Parse only fields explicitly present in legacy reports. A question heading
// without an original quote stays labeled as a summary, never as verbatim.
export function parseHistoricalGroups(content) {
  const matches = [...content.matchAll(/^#{2,4}\s+Q\d+[：:]\s*(.+)$/gm)];
  return matches
    .map((m, i) => {
      const body = content.slice(
        m.index + m[0].length,
        matches[i + 1]?.index || content.length,
      );
      const field = (label) =>
        body.match(
          new RegExp(
            `^- \\*\\*(?:${label})[：:]?\\*\\*[：:]?\\s*([^\\n]+)`,
            "m",
          ),
        )?.[1] || "";
      const original = field("面试官原话");
      const summary = field("我的回答摘要");
      if (!summary) return null;
      const diagnosis = field("可改进处");
      return {
        title: m[1],
        diagnosis,
        evidence: field("答得好的地方"),
        betterStructure: field("理想答案要点"),
        example: "",
        supplement: field("面试官澄清"),
        experienceIds: [],
        practice: [field("行动项")].filter(Boolean),
        questions: [
          {
            question: original || m[1],
            questionType: original ? "verbatim" : "summary",
            answer: summary,
            answerType: "summary",
            timestamp: "",
            diagnosis,
            sourceQuote: "",
          },
        ],
      };
    })
    .filter(Boolean);
}
