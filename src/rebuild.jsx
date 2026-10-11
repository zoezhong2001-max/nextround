import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  NotebookPen,
  FolderHeart,
  ChevronRight,
  ArrowUpRight,
  X,
  Check,
  CalendarDays,
  FileText,
} from "lucide-react";
import "./rebuild.css";
import RebuildEditor from "./rebuild-editor.jsx";
import { ReadingText } from "./reading.mjs";
import { ReviewDetail, QuestionFamilies } from "./rebuild-reviews.jsx";

const pages = [
  ["dashboard", "仪表盘", LayoutDashboard],
  ["jobs", "岗位流程", BriefcaseBusiness],
  ["reviews", "面试复盘", NotebookPen],
  ["assets", "个人资产", FolderHeart],
];
const labels = {
  preparing: "准备中",
  "waiting-result": "等待结果",
  "closed-fail": "未通过",
  "closed-pass": "已结束",
  "closed-withdrawn": "主动结束",
  "offer-received": "收到 Offer",
  "advanced-to-next-round": "进入下一轮",
};
export default function Workspace({
  live,
  go,
  initialPage = "dashboard",
  initialJob = null,
}) {
  const savedLocation = new URLSearchParams(location.hash.slice(1));
  const [d, setD] = useState(null),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(null),
    [showHistory, setShowHistory] = useState(false);
  const edit = (kind, id, object, title, parent) =>
    setEditing({
      ref: { kind, id, ...(parent ? { parent } : {}) },
      object,
      title,
    });
  const editButton = (kind, id, object, title, parent) => (
    <button
      className="nr-edit-button"
      onClick={() => edit(kind, id, object, title, parent)}
      aria-label={`编辑${title}`}
    >
      编辑
    </button>
  );
  const [page, setPage] = useState(savedLocation.get("page") || initialPage),
    [asset, setAsset] = useState(savedLocation.get("asset") || "profile"),
    [review, setReviewId] = useState(savedLocation.get("review")),
    [reviewGroup, setReviewGroup] = useState(""),
    [reviewTab, setReviewTab] = useState("sessions"),
    [batch, setBatch] = useState("全部"),
    [job, setJob] = useState(savedLocation.get("job") || initialJob),
    [source, setSource] = useState(null),
    [sourceText, setSourceText] = useState("");
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const setReview = (id, group = "") => {
    setReviewId(id);
    setReviewGroup(group);
  };
  useEffect(() => {
    const hash = new URLSearchParams({ page });
    if (page === "assets") hash.set("asset", asset);
    if (page === "reviews" && review) hash.set("review", review);
    if (page === "jobs" && job) hash.set("job", job);
    history.replaceState({}, "", "/#" + hash);
  }, [page, asset, review, job]);
  useEffect(() => {
    let active = true;
    fetch("/api/rebuild")
      .then((r) => {
        if (!r.ok) throw new Error("资料读取失败，请重试");
        return r.json();
      })
      .then((v) => {
        if (active) setD(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!source || source.path || source.content !== undefined) {
      setSourceText("");
      return;
    }
    let active = true;
    setSourceText("读取原文…");
    fetch(`/api/rebuild/sources/${source.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("原文读取失败");
        return r.json();
      })
      .then((v) => {
        if (active) setSourceText(v.content);
      })
      .catch((e) => {
        if (active) setSourceText(e.message);
      });
    return () => {
      active = false;
    };
  }, [source]);
  if (!d)
    return (
      <div className="nr-boot">
        {error || "正在读取资料…"}
        <button onClick={() => location.reload()}>重试</button>
      </div>
    );
  const allSources = [
    ...d.sources.map((s) => ({ id: s.id, title: s.filename })),
    ...d.projectSources,
  ];
  const showAsset = (id) => {
    setAsset(id);
    setPage("assets");
  };
  const citations = (ids) => (
    <div className="nr-citations">
      {ids.map((id) => {
        const s = allSources.find((x) => x.id === id);
        return (
          s && (
            <button key={id} onClick={() => setSource(s)}>
              <FileText size={12} />
              {s.title}
            </button>
          )
        );
      })}
    </div>
  );
  const conflicts = (ids) =>
    d.conflicts
      .filter((c) => ids?.includes(c.id))
      .map((c) => (
        <div className="nr-check" key={c.id}>
          <b>{c.title}</b>
          <p>{c.detail}</p>
          {citations(c.sources)}
        </div>
      ));
  const selectedAsset = d.experiences.find((a) => a.id === asset);
  const memoryCards = (items) => items.filter(m => !m.retiredAt).map(m => (
    <section className="nr-block" key={m.id}>
      <h3>{m.title}{editButton('memory',m.id,m,m.title)}</h3>
      <small className="nr-caption">{m.userEditedAt ? '本人已修改 · ' : ''}{m.status}</small>
      <ReadingText text={m.text} />
      {m.note && <p>{m.note}</p>}
      {citations(m.sources || [])}
      {(m.evidence || []).map(e => <button className="nr-link" key={e.sessionId} onClick={() => {setReview(e.sessionId);setReviewTab('sessions');setPage('reviews');}}>
        查看原始回答 · {d.reviewQueue.find(r=>r.id===e.sessionId)?.title || e.sessionId} · {e.questionIds.join('、').replaceAll(e.sessionId+'-','')}
      </button>)}
    </section>
  ));
  const selectedReview = d.reviewQueue.find((r) => r.id === review);
  const fullReview = d.fullReviews?.find((r) => r.sessionId === review);
  const samples = d.samples.filter((s) => s.sessionId === review);
  const jobs = live.applications.filter((a) => !a.supersededBy?.length);
  const batches = ["全部", ...new Set(jobs.map((a) => a.batch || "未分类"))];
  const selectedJob = jobs.find((a) => a.id === job);
  const correctedProcess = d.jobs?.find((a) => a.id === job);
  const actions = live.actions.filter(
    (a) =>
      !a.done &&
      !a.archivedAt &&
      live.applications.some(
        (j) => j.id === a.applicationId && !j.status?.startsWith("closed-"),
      ),
  );
  const dated = live.stages.filter(
    (s) =>
      s.date &&
      !s.frozen &&
      live.applications.some(
        (a) => a.id === s.applicationId && !a.status?.startsWith("closed-"),
      ),
  );
  const pad = (month.getDay() + 6) % 7,
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dateKey = (day) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const title = pages.find((p) => p[0] === page)[1];
  return (
    <div className="nr-layout">
      <aside className="nr-nav">
        <a className="nr-brand" href="/">
          <img src="/brand-mark.svg" alt="" />
          NextRound
        </a>
        <span className="nr-space">我的面试空间</span>
        <nav>
          {pages.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="nr-nav-bottom">
          <span>本地私有工作区</span>
          <span>与 Codex 协作 · 在这里核对成果</span>
        </div>
      </aside>
      <main className="nr-main">
        <header className="nr-top">
          <span>
            我的空间 <ChevronRight size={13} /> {title}
          </span>
          <span className="nr-preview-tag">本地保存 · 可人工编辑</span>
          <button
            className="nr-edit-button"
            onClick={() => setShowHistory(true)}
          >
            修改记录
          </button>
        </header>
        <div className="nr-page">
          <div className="nr-heading">
            <div>
              <span className="nr-overline">
                {page === "dashboard"
                  ? "TODAY"
                  : page === "assets"
                    ? "ABOUT ME"
                    : page === "reviews"
                      ? "INTERVIEW LEARNING"
                      : "APPLICATIONS"}
              </span>
              <h1>{title}</h1>
            </div>
            <span className="nr-date">{d.updatedAt}</span>
          </div>
          {page === "dashboard" && (
            <>
              <p className="nr-intro">
                安排接下来要做的事，也留一点空间给新的机会。
              </p>
              <div className="nr-dashboard">
                <section>
                  <div className="nr-section-head">
                    <h2>待办</h2>
                    <span>{actions.length}</span>
                  </div>
                  {actions.length ? (
                    actions.map((a) => (
                      <button
                        className="nr-task"
                        key={a.id}
                        onClick={() => {
                          setJob(a.applicationId);
                          setPage("jobs");
                        }}
                      >
                        <span className="nr-checkbox" />
                        <div>
                          {a.title.replace(/\*\*/g, "")}
                          <small>
                            {
                              live.applications.find(
                                (j) => j.id === a.applicationId,
                              )?.company
                            }
                          </small>
                        </div>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p className="nr-empty">
                      暂无待办。后续由岗位任务和已采纳的复盘行动汇入。
                    </p>
                  )}
                  <div className="nr-section-head">
                    <h2>待核实</h2>
                    <span>{d.conflicts.length}</span>
                  </div>
                  {d.conflicts.map((c) => (
                    <button
                      className="nr-line"
                      key={c.id}
                      onClick={() =>
                        showAsset(
                          d.experiences.find((a) => a.conflicts.includes(c.id))
                            ?.id || "checks",
                        )
                      }
                    >
                      <span>{c.title}</span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </section>
                <section className="nr-calendar">
                  <div className="nr-section-head">
                    <h2>
                      <CalendarDays size={18} />
                      日程
                    </h2>
                    <div>
                      <button
                        aria-label="上个月"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        ‹
                      </button>
                      <strong>
                        {month.getFullYear()} 年 {month.getMonth() + 1} 月
                      </strong>
                      <button
                        aria-label="下个月"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="nr-calendar-grid">
                    {["一", "二", "三", "四", "五", "六", "日"].map((n) => (
                      <span className="nr-weekday" key={n}>
                        {n}
                      </span>
                    ))}
                    {Array.from({ length: pad }, (_, i) => (
                      <div key={`pad${i}`} />
                    ))}
                    {Array.from({ length: days }, (_, i) => i + 1).map(
                      (day) => (
                        <div
                          className={`nr-day ${dateKey(day) === new Date().toLocaleDateString("sv-SE") ? "today" : ""}`}
                          key={day}
                        >
                          <span>{day}</span>
                          {dated
                            .filter((s) => s.date.slice(0, 10) === dateKey(day))
                            .map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  setJob(s.applicationId);
                                  setPage("jobs");
                                }}
                              >
                                {s.title}
                              </button>
                            ))}
                        </div>
                      ),
                    )}
                  </div>
                  <p className="nr-caption">
                    只呈现已记录的安排；空白日期没有日程。
                  </p>
                </section>
              </div>
              <section className="nr-plan">
                <h2>最近整理的复盘</h2>
                {d.reviewQueue
                  .filter((r) =>
                    d.fullReviews.some((v) => v.sessionId === r.id),
                  )
                  .slice(0, 5)
                  .map((r) => (
                    <button
                      className="nr-line"
                      key={r.id}
                      onClick={() => {
                        setPage("reviews");
                        setReview(r.id);
                      }}
                    >
                      <span>
                        {r.title}
                        <small>{r.status}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </section>
            </>
          )}
          {page === "assets" && (
            <>
              <p className="nr-intro">
                每段经历都有事实、证据和仍需补齐的地方。
              </p>
              <div className="nr-assets">
                <div className="nr-object-list">
                  <button
                    className={asset === "profile" ? "active" : ""}
                    onClick={() => setAsset("profile")}
                  >
                    关于我
                  </button>
                  {["实习", "个人项目", "校园经历"].map((cat) => (
                    <React.Fragment key={cat}>
                      <h3>{cat}</h3>
                      {d.experiences
                        .filter((a) => a.category === cat)
                        .map((a) => (
                          <button
                            key={a.id}
                            className={asset === a.id ? "active" : ""}
                            onClick={() => setAsset(a.id)}
                          >
                            {a.title}
                            <small>{a.subtitle}</small>
                          </button>
                        ))}
                    </React.Fragment>
                  ))}
                  <h3>表达与核对</h3>
                  <button onClick={() => setAsset('learning')} className={asset === 'learning' ? 'active' : ''}>表达与成长</button>
                  <button
                    onClick={() => setAsset("resume")}
                    className={asset === "resume" ? "active" : ""}
                  >
                    简历母版
                  </button>
                  <button
                    onClick={() => setAsset("checks")}
                    className={asset === "checks" ? "active" : ""}
                  >
                    待核实项
                  </button>
                </div>
                <article className="nr-content">
                  {asset === "profile" && (
                    <>
                      <h2>关于我</h2>
                      <p className="nr-caption">
                        从本次材料提取。联系方式留在私有来源中，默认不展示。
                      </p>
                      <dl className="nr-facts">
                        {d.profile.map((f) => (
                          <div key={f.label}>
                            <dt>{f.label}</dt>
                            <dd>
                              {f.value}
                              {editButton("profile", f.label, f, f.label)}
                              <small>
                                {f.userEditedAt ? "本人修改 · " : ""}
                                {f.note ||
                                  (f.userEditedAt
                                    ? new Date(
                                        f.userEditedAt,
                                      ).toLocaleDateString("zh-CN")
                                    : f.status)}
                              </small>
                              {citations(f.sources)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {memoryCards((d.memories || []).filter(m => ['preference','understanding'].includes(m.kind)))}
                    </>
                  )}
                  {asset === 'learning' && <><h2>表达与成长</h2><p>保留有效的判断与讲法，也记录下一次需要验证的改进。</p>{memoryCards((d.memories || []).filter(m => m.kind === 'learning'))}</>}
                  {selectedAsset && (
                    <>
                      <span className="nr-overline">
                        {selectedAsset.category} · {selectedAsset.status}
                      </span>
                      <h2>{selectedAsset.title}</h2>
                      {editButton(
                        "experience",
                        selectedAsset.id,
                        selectedAsset,
                        selectedAsset.title,
                      )}
                      <p className="nr-caption">
                        {selectedAsset.subtitle} · {selectedAsset.period}
                      </p>
                      {conflicts(selectedAsset.conflicts)}
                      {memoryCards((d.memories || []).filter(m => m.kind === 'story' && m.experienceIds?.includes(selectedAsset.id)))}
                      {selectedAsset.blocks.map((b, i) => (
                        <section className="nr-block" key={i}>
                          <h3>{b.title}</h3>
                          {editButton(
                            "block",
                            b.title,
                            b,
                            b.title,
                            selectedAsset.id,
                          )}
                          <p>{b.text}</p>
                          {citations(b.sources)}
                        </section>
                      ))}
                      <section className="nr-gaps">
                        <h3>下一次深挖</h3>
                        {selectedAsset.gaps.map((g) => (
                          <p key={g}>{g}</p>
                        ))}
                      </section>
                      {selectedAsset.reviewLinks?.length > 0 && (
                        <section className="nr-block">
                          <h3>真实面试里被追问的地方</h3>
                          {selectedAsset.reviewLinks.map((link) => (
                            <button
                              className="nr-line"
                              key={`${link.sessionId}-${link.groupId}`}
                              onClick={() => {
                                setReview(link.sessionId, link.groupId);
                                setReviewTab("sessions");
                                setPage("reviews");
                              }}
                            >
                              <span>
                                {link.title}
                                <small>
                                  {
                                    d.reviewQueue.find(
                                      (r) => r.id === link.sessionId,
                                    )?.title
                                  }
                                </small>
                              </span>
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </section>
                      )}
                    </>
                  )}
                  {asset === "checks" && (
                    <>
                      <h2>待核实项</h2>
                      {conflicts(d.conflicts.map((c) => c.id))}
                    </>
                  )}
                  {asset === "resume" && (
                    <>
                      <h2>简历母版</h2>
                      <p>
                        个人档案提供身份与教育信息；经历提供已核对的事实和可选表达。针对岗位的取舍和实际投递稿留在对应岗位中。
                      </p>
                      <div className="nr-check">
                        可用事实按经历整理。待确认的日期、职责与指标不进入投递稿。
                      </div>
                      {d.experiences.map((a) => (
                        <button
                          key={a.id}
                          className="nr-line"
                          onClick={() => setAsset(a.id)}
                        >
                          <span>
                            {a.title}
                            <small>{a.subtitle}</small>
                          </span>
                          <span>
                            查看可用事实 <ChevronRight size={13} />
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </article>
              </div>
            </>
          )}
          {page === "jobs" && (
            <>
              <div className="nr-tabs" aria-label="求职批次">
                {batches.map((b) => (
                  <button
                    className={batch === b ? "active" : ""}
                    key={b}
                    onClick={() => {
                      setBatch(b);
                      setJob(null);
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
              {!selectedJob ? (
                <div className="nr-job-list">
                  {jobs
                    .filter(
                      (a) =>
                        batch === "全部" || (a.batch || "未分类") === batch,
                    )
                    .map((a) => (
                      <button
                        className="nr-job"
                        key={a.id}
                        onClick={() => setJob(a.id)}
                      >
                        <span>
                          <small>
                            {a.company} · {a.batch || "未分类"}
                          </small>
                          <h2>{a.role}</h2>
                        </span>
                        <span>
                          {labels[a.status] || "状态待核实"}
                          <ChevronRight size={15} />
                        </span>
                      </button>
                    ))}
                </div>
              ) : (
                <>
                  <button className="nr-back" onClick={() => setJob(null)}>
                    ← 全部岗位
                  </button>
                  <h2>
                    {selectedJob.company} · {selectedJob.role}
                  </h2>
                  <p>{labels[selectedJob.status] || "状态待核实"}</p>
                  {selectedJob.nextAction && <p>{selectedJob.nextAction}</p>}
                  {correctedProcess ? (
                    <section className="nr-plan">
                      <h2>本岗位面试记录</h2>
                      <p>{correctedProcess.focus}</p>
                      {live.stages
                        .filter((s) => s.applicationId === job)
                        .sort((a, b) => a.order - b.order)
                        .map((b, i) => (
                          <div key={b.title}>
                            <span>{i + 1}</span>
                            <div>
                              <b>{b.title}</b>
                              <p>{b.result}</p>
                              {[b.sessionId].map((id) => (
                                <button
                                  key={id}
                                  className="nr-link"
                                  onClick={() => {
                                    setPage("reviews");
                                    setReviewTab("sessions");
                                    setReview(id);
                                  }}
                                >
                                  {
                                    d.reviewQueue.find((r) => r.id === id)
                                      ?.title
                                  }
                                  <ArrowUpRight size={13} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      <button
                        className="nr-link"
                        onClick={() =>
                          setJob(
                            correctedProcess.referralTo ||
                              correctedProcess.referralFrom,
                          )
                        }
                      >
                        {correctedProcess.referralLabel}
                        <ArrowUpRight size={13} />
                      </button>
                      {correctedProcess.directions?.length > 0 && (
                        <section className="nr-block">
                          <h3>面试官介绍的招聘方向</h3>
                          {correctedProcess.directions.map((t) => (
                            <p key={t}>{t}</p>
                          ))}
                        </section>
                      )}
                      {citations([correctedProcess.sourceId])}
                    </section>
                  ) : (
                    <div className="nr-stage-list">
                      {live.stages
                        .filter((s) => s.applicationId === job)
                        .sort((a, b) => a.order - b.order)
                        .map((s) => (
                          <div key={s.id}>
                            <span className="nr-stage-dot" />
                            <b>{s.title}</b>
                            <span>{s.result}</span>
                            <span>{s.date || "未记录时间"}</span>
                          </div>
                        ))}
                    </div>
                  )}
                  {d.reviewQueue
                    .filter((r) => r.jobId === job)
                    .map((r) => (
                      <button
                        className="nr-line"
                        key={r.id}
                        onClick={() => {
                          setPage("reviews");
                          setReview(r.id);
                          setReviewTab("sessions");
                        }}
                      >
                        <span>
                          {r.title}
                          <small>{r.status}</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  <section className="nr-block">
                    <h3>岗位资料与历史准备</h3>
                    {live.artifacts
                      .filter((a) => a.applicationId === job)
                      .map((a) => (
                        <button
                          key={a.id}
                          className="nr-line"
                          onClick={() => setSource(a)}
                        >
                          <span>
                            {a.title}
                            <small>
                              {a.frozen ? "历史准备资料" : "已有记录"}
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                  </section>
                </>
              )}
            </>
          )}
          {page === "reviews" && (
            <>
              <p className="nr-intro">
                保留每一次实际回答，再看跨场次有什么改变。
              </p>
              <div className="nr-tabs">
                <button
                  className={reviewTab === "sessions" ? "active" : ""}
                  onClick={() => {
                    setReviewTab("sessions");
                    setReview(null);
                  }}
                >
                  按场次
                </button>
                <button
                  className={reviewTab === "families" ? "active" : ""}
                  onClick={() => {
                    setReviewTab("families");
                    setReview(null);
                  }}
                >
                  跨场问题
                </button>
              </div>
              {reviewTab === "families" ? (
                <QuestionFamilies
                  families={d.questionFamilies}
                  onEdit={edit}
                  queue={d.reviewQueue}
                  reviews={d.fullReviews || []}
                  onReview={(id) => {
                    setReviewTab("sessions");
                    setReview(id);
                  }}
                />
              ) : !selectedReview ? (
                [1, 2, 3].map((p) => (
                  <section className="nr-review-batch" key={p}>
                    <h2>
                      {
                        [
                          "先处理 · 当前重点",
                          "第二批 · 项目补全与跨场对照",
                          "第三批 · 扩展问题积累",
                        ][p - 1]
                      }
                    </h2>
                    {d.reviewQueue
                      .filter((r) => r.priority === p)
                      .map((r) => (
                        <button
                          className="nr-review"
                          key={r.id}
                          onClick={() => setReview(r.id)}
                        >
                          <span>
                            <b>{r.title}</b>
                            <p>{r.reason}</p>
                            <small>
                              {r.characters.toLocaleString()} 字符 ·{" "}
                              {r.timestampCount} 处时间标记 · 未核实日期
                            </small>
                          </span>
                          <span>
                            {d.fullReviews?.some((s) => s.sessionId === r.id)
                              ? r.status
                              : d.samples.some((s) => s.sessionId === r.id)
                                ? "有两题样例"
                                : "待逐题整理"}
                            <ChevronRight size={15} />
                          </span>
                        </button>
                      ))}
                  </section>
                ))
              ) : (
                <>
                  <button className="nr-back" onClick={() => setReview(null)}>
                    ← 复盘队列
                  </button>
                  <h2>{selectedReview.title}</h2>
                  <p className="nr-caption">
                    {selectedReview.result}（
                    {selectedReview.resultSourceId ? "本人确认" : "文件名记载"}
                    ） · {selectedReview.status}
                  </p>
                  <p>{selectedReview.reason}</p>
                  {citations([selectedReview.sourceId])}
                  {fullReview ? (
                    <ReviewDetail
                      key={`${fullReview.sessionId}-${reviewGroup}`}
                      initialGroup={reviewGroup}
                      onEdit={edit}
                      review={fullReview}
                      onExperience={showAsset}
                    />
                  ) : samples.length ? (
                    <>
                      <div className="nr-check">
                        两题审阅样例，展示实际回答、诊断和建议如何分开阅读。整场尚未完成逐题整理。
                      </div>
                      {samples.map((s, i) => (
                        <section className="nr-question" key={s.id}>
                          <h3>
                            {i + 1}. {s.title}
                          </h3>
                          <div className="nr-question-columns">
                            <div>
                              <h4>面试官原话</h4>
                              <p className="nr-quote">{s.question.text}</p>
                              <details open>
                                <summary>我的实际回答</summary>
                                <p className="nr-quote">{s.answer.text}</p>
                              </details>
                            </div>
                            <div>
                              <h4>具体诊断</h4>
                              <p>{s.diagnosis}</p>
                              <h4>如何答得更好</h4>
                              <p>{s.suggestion}</p>
                              <details>
                                <summary>复盘后示范</summary>
                                <p>{s.example}</p>
                              </details>
                              <h4>需要补的事实</h4>
                              <p>{s.followup}</p>
                              <button
                                className="nr-link"
                                onClick={() => showAsset(s.experienceId)}
                              >
                                查看关联经历 <ArrowUpRight size={13} />
                              </button>
                            </div>
                          </div>
                        </section>
                      ))}
                    </>
                  ) : (
                    <div className="nr-empty">
                      已保留完整逐字稿。后续将拆出每个问题、追问、实际回答与建议。
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      {editing && (
        <RebuildEditor
          editing={editing}
          revision={d.editRevision}
          onSaved={setD}
          onClose={() => setEditing(null)}
        />
      )}
      {showHistory && (
        <div className="nr-modal-backdrop">
          <section
            className="nr-source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="修改记录"
          >
            <header>
              <h2>修改记录</h2>
              <button
                onClick={() => setShowHistory(false)}
                aria-label="关闭修改记录"
              >
                <X size={20} />
              </button>
            </header>
            {!d.editHistory?.length && (
              <p>还没有人工修改。保存后会在这里保留修改前后的内容。</p>
            )}
            {[...(d.editHistory || [])].reverse().map((item) => (
              <details className="nr-block" key={item.id}>
                <summary>
                  {item.ref.id} · {new Date(item.at).toLocaleString("zh-CN")}
                </summary>
                <h4>修改前</h4>
                <pre>
                  {Object.values(item.before)
                    .map((v) => (Array.isArray(v) ? v.join("\n") : v))
                    .join("\n\n")}
                </pre>
                <h4>修改后</h4>
                <pre>
                  {Object.values(item.after)
                    .map((v) => (Array.isArray(v) ? v.join("\n") : v))
                    .join("\n\n")}
                </pre>
              </details>
            ))}
          </section>
        </div>
      )}
      {source && (
        <div className="nr-modal-backdrop" onClick={() => setSource(null)}>
          <section
            className="nr-source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="来源原文"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{source.title}</h2>
              <button aria-label="关闭来源" onClick={() => setSource(null)}>
                <X size={20} />
              </button>
            </header>
            {source.content !== undefined ? (
              <ReadingText text={source.content} />
            ) : source.path ? (
              <>
                <p>来源项目文件</p>
                <code>{source.path}</code>
                <p>项目当前状态与旧面试时的版本分别记录。</p>
              </>
            ) : (
              <pre>{sourceText}</pre>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
