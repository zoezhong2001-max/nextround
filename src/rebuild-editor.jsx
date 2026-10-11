import React, { useEffect, useRef, useState } from "react";

export const editFields = {
  memory: [['text','内容 / 我的纠正'], ['note','补充说明']],
  profile: [
    ["value", "内容"],
    ["note", "补充说明"],
  ],
  experience: [
    ["subtitle", "职位 / 项目简介"],
    ["period", "时间"],
    ["gaps", "待补充的问题（每行一项）"],
  ],
  block: [["text", "内容"]],
  review: [
    ["conclusion", "本场结论"],
    ["roleFacts", "岗位信息"],
    ["feedback", "明确反馈"],
    ["actions", "后续行动（每行一项）"],
  ],
  question: [
    ["diagnosis", "具体诊断"],
    ["correction", "原文更正 / 补充说明"],
  ],
  group: [
    ["advice", "回答建议"],
    ["example", "示范 / 回答骨架"],
    ["gaps", "需要补充的事实（每行一项）"],
  ],
  family: [["summary", "跨场对照结论"]],
};
export default function RebuildEditor({ editing, revision, onSaved, onClose }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      editFields[editing.ref.kind].map(([k]) => [
        k,
        Array.isArray(editing.object[k])
          ? editing.object[k].join("\n")
          : editing.object[k] || "",
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const dirty = editFields[editing.ref.kind].some(
    ([k]) =>
      values[k] !==
      (Array.isArray(editing.object[k])
        ? editing.object[k].join("\n")
        : editing.object[k] || ""),
  );
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => {
    if (!busy && (!dirty || window.confirm("放弃尚未保存的修改？"))) onClose();
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const changes = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [
          k,
          ["gaps", "actions"].includes(k)
            ? v
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            : v,
        ]),
      );
      const response = await fetch("/api/rebuild", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-workbench": "1" },
        body: JSON.stringify({ ref: editing.ref, changes, revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="nr-edit-dialog"
      aria-labelledby="nr-edit-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form onSubmit={save}>
        <h2 id="nr-edit-title">编辑 · {editing.title}</h2>
        {editFields[editing.ref.kind].map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              value={values[key]}
              rows={key === "note" || key === "period" ? 2 : 5}
              maxLength={40000}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <p className="nr-caption">
          保存后保留修改前后的记录。来源原文可随时查看。
        </p>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={close} disabled={busy}>
            取消
          </button>
          <button type="submit" disabled={busy || !dirty}>
            {busy ? "保存中…" : "保存修改"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
