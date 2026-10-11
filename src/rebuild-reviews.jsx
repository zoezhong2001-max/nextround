import React, { useState } from "react";

export function ReviewDetail({ review, onExperience, initialGroup, onEdit }) {
  const [group, setGroup] = useState(
    initialGroup || review.groups[0]?.id || "",
  );
  const selected = review.groups.find((g) => g.id === group);
  return (
    <div className="nr-review-detail">
      <section className="nr-block">
        <h3>本场结论</h3>
        <button
          className="nr-edit-button"
          onClick={() => onEdit("review", review.sessionId, review, "本场复盘")}
        >
          编辑本场复盘
        </button>
        <p>{review.conclusion}</p>
      </section>
      <details className="nr-block">
        <summary>岗位信息与面试官明确反馈</summary>
        <h4>岗位范围</h4>
        <p>{review.roleFacts}</p>
        <h4>明确反馈 · 根据逐字稿整理</h4>
        <p>{review.feedback}</p>
        <p className="nr-caption">
          仅把可定位的面试官原话记为直接反馈；缺失或未明确告知的原因保持未知。
        </p>
      </details>
      <div className="nr-section-head">
        <h3>问题地图</h3>
        <span>{review.questions.length} 个问答片段</span>
      </div>
      <div className="nr-review-map" aria-label="问题组筛选">
        <button aria-pressed={!group} onClick={() => setGroup("")}>
          全部
        </button>
        {review.groups.map((g) => (
          <button
            key={g.id}
            aria-pressed={group === g.id}
            onClick={() => setGroup(g.id)}
          >
            {g.title}
            <small>{g.questionIds.length}</small>
          </button>
        ))}
      </div>
      <p className="nr-caption">{review.coverageNote}</p>
      {(selected ? [selected] : review.groups).map((g) => (
        <section className="nr-review-group" key={g.id}>
          <h3>{g.title}</h3>
          {review.questions
            .filter((q) => q.group === g.id)
            .map((q) => (
              <details className="nr-review-item" key={q.id}>
                <summary>
                  <small>
                    Q{q.number} · {q.time || "开场"} · {q.speaker}
                  </small>
                  <span>
                    {q.question.text.trim() || q.topic || "问题原话缺失"}
                  </span>
                </summary>
                <div className="nr-question-columns">
                  <div>
                    <h4>
                      {q.speaker === "候选人反问"
                        ? "面试官回应所在原文"
                        : "我的回答所在原文"}
                    </h4>
                    <p className="nr-quote">{q.answer.text}</p>
                    {q.correction && (
                      <p className="nr-check">我的更正与补充：{q.correction}</p>
                    )}
                  </div>
                  <div>
                    <h4>具体诊断</h4>
                    <button
                      className="nr-edit-button"
                      onClick={() =>
                        onEdit(
                          "question",
                          q.id,
                          q,
                          `Q${q.number} 诊断与更正`,
                          review.sessionId,
                        )
                      }
                    >
                      编辑诊断 / 补充更正
                    </button>
                    <p>{q.diagnosis}</p>
                    <p className="nr-caption">
                      共享的回答结构、示范与待补事实见本问题组末尾。
                    </p>
                  </div>
                </div>
              </details>
            ))}
          <div className="nr-group-guidance">
            <h4>这一组怎么答得更好</h4>
            <button
              className="nr-edit-button"
              onClick={() =>
                onEdit("group", g.id, g, g.title, review.sessionId)
              }
            >
              编辑建议与示范
            </button>
            <p>{g.advice}</p>
            <details>
              <summary>复盘后示范 / 回答骨架 · 非历史事实</summary>
              <p>{g.example}</p>
            </details>
            <details>
              <summary>需要补的事实与思考</summary>
              <ul>
                {g.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </details>
            {g.experienceId && (
              <button
                className="nr-link"
                onClick={() => onExperience(g.experienceId)}
              >
                查看关联经历 →
              </button>
            )}
          </div>
        </section>
      ))}
      <section className="nr-block">
        <h3>优先修复</h3>
        <ol>
          {review.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </section>
      <details className="nr-block">
        <summary>开场原文</summary>
        <p className="nr-quote">{review.opening}</p>
      </details>
    </div>
  );
}

export function QuestionFamilies({
  families,
  queue,
  reviews,
  onReview,
  onEdit,
}) {
  const [selectedFamily, setSelectedFamily] = useState(families?.[0]?.id || "");
  if (!families?.length)
    return (
      <p className="nr-empty">
        完成场次复盘后，这里会呈现有实际回答证据的问题组。
      </p>
    );
  return (
    <div>
      <div className="nr-review-map" aria-label="跨场问题筛选">
        {families.map((family) => (
          <button
            key={family.id}
            aria-pressed={selectedFamily === family.id}
            onClick={() => setSelectedFamily(family.id)}
          >
            {family.title}
          </button>
        ))}
      </div>
      {families
        .filter((family) => family.id === selectedFamily)
        .map((family) => (
          <section className="nr-review-group" key={family.id}>
            <h2>{family.title}</h2>
            <button
              className="nr-edit-button"
              onClick={() => onEdit("family", family.id, family, family.title)}
            >
              编辑对照结论
            </button>
            <p>{family.summary}</p>
            {[...family.items]
              .sort(
                (a, b) =>
                  queue.findIndex((q) => q.id === a.sessionId) -
                  queue.findIndex((q) => q.id === b.sessionId),
              )
              .map((item) => {
                const r = reviews.find((v) => v.sessionId === item.sessionId);
                const s = queue.find((v) => v.id === item.sessionId);
                const qs =
                  r?.questions.filter((q) => item.questionIds.includes(q.id)) ||
                  [];
                return (
                  <div className="nr-family-session" key={item.sessionId}>
                    <button
                      className="nr-link"
                      onClick={() => onReview(item.sessionId)}
                    >
                      {s?.title || "查看本场复盘"} →
                    </button>
                    {qs.map((q) => (
                      <details className="nr-review-item" key={q.id}>
                        <summary>
                          <small>
                            Q{q.number} · {q.time} 附近
                          </small>
                          <span>{q.question.text.trim() || q.topic || "问题原话缺失"}</span>
                        </summary>
                        <h4>当时回答所在原文</h4>
                        <p className="nr-quote">{q.answer.text}</p>
                        {q.correction && (
                          <p className="nr-check">
                            我的更正与补充：{q.correction}
                          </p>
                        )}
                        <h4>该次回答的诊断</h4>
                        <p>{q.diagnosis}</p>
                      </details>
                    ))}
                  </div>
                );
              })}
            <p className="nr-caption">
              这里比较的是回答与追问，不以通过/未通过作为质量评分，也不把同公司样本当成所有岗位的规则。
            </p>
          </section>
        ))}
    </div>
  );
}
