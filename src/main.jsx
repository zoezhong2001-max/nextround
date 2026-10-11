import React, {
  useEffect,
  useState,
  useId,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  MessageSquare,
  BriefcaseBusiness,
  NotebookPen,
  Shapes,
  FolderHeart,
  Search,
  Plus,
  Upload,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  ChevronRight,
  X,
  Check,
  LoaderCircle,
  AlertCircle,
  ExternalLink,
  FileText,
  Clock3,
  Download,
  MoreHorizontal,
  CheckCheck,
  AudioLines,
  Paperclip,
  Play,
  Send,
  ListFilter,
  ArrowLeft,
  History,
  ChevronDown,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  ReadingText,
  plainText,
  jobLabel,
  recordDate,
  newestFirst,
  localDocumentRoute,
  readingParts,
  documentHeadings,
  statusText,
} from "./reading.mjs";
import { parseHistoricalGroups } from "../shared/historical-review.mjs";
import "./styles.css";
import "./agent.css";
import RebuildPreview from "./rebuild.jsx";

const Context = createContext();
const useWorkbench = () => useContext(Context);
const closed = (s) => s?.startsWith("closed-");
const statusNames = {
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
const kindNames = {
  process: "岗位事实",
  prep: "阶段准备",
  review: "面试复盘",
  experience: "经历卡",
  resume: "简历版本",
  profile: "个人档案",
  learning: "可复用经验",
  transcript: "原始逐字稿",
  audio: "录音",
  jd: "岗位 JD",
  material: "材料",
  index: "目录",
  mock: "模拟面试",
  chat: "对话",
};
const capabilities = [
  {
    key: "prep",
    name: "岗位与阶段准备",
    sub: "从岗位事实出发，找到最值得准备的问题",
    icon: BriefcaseBusiness,
    color: "green",
  },
  {
    key: "review",
    name: "面试复盘",
    sub: "逐题还原问答，把追问变成下一步练习",
    icon: NotebookPen,
    color: "purple",
  },
  {
    key: "mock",
    name: "模拟面试",
    sub: "一次一道题，练习真实的连续追问",
    icon: MessageSquare,
    color: "orange",
  },
  {
    key: "experience",
    name: "经历深挖",
    sub: "梳理决策链、职责边界与三层追问",
    icon: FolderHeart,
    color: "blue",
  },
  {
    key: "resume",
    name: "简历优化",
    sub: "用真实证据，形成有针对性的简历版本",
    icon: FileText,
    color: "pink",
  },
  {
    key: "prep",
    name: "笔试与 Case",
    sub: "围绕题目、业务判断和提交要求准备",
    icon: Shapes,
    color: "yellow",
  },
];
const navigation = [
  ["/", "工作台", LayoutDashboard],
  ["/chat", "Agent 对话", MessageSquare],
  ["/jobs", "岗位流程", BriefcaseBusiness],
  ["/reviews", "复盘库", NotebookPen],
  ["/capabilities", "能力中心", Shapes],
  ["/assets", "个人资产", FolderHeart],
];
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "X-Workbench": "1",
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "请求失败");
  return value;
}
const json = (method, data) => ({ method, body: JSON.stringify(data) });
function Button({
  children,
  icon: Icon,
  variant = "",
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
function Badge({ status, children }) {
  return (
    <span
      className={`badge ${closed(status) ? "muted" : status === "needs-verification" ? "amber" : status === "waiting-result" ? "blue" : "green"}`}
    >
      {typeof children === "string"
        ? statusText(children)
        : children || statusNames[status] || status}
    </span>
  );
}
function Markdown({ text, inline = false, components }) {
  const { data, go } = useWorkbench();
  return (
    <ReadingText
      text={text}
      inline={inline}
      components={components}
      resolveLink={(href) => localDocumentRoute(href, data)}
      onNavigate={go}
    />
  );
}
function DocumentBody({ document }) {
  const prefix = useId();
  const { body, notes } = readingParts(document.content, document.title);
  const headings = documentHeadings(body);
  const components = Object.fromEntries(
    [1, 2, 3].map((level) => [
      `h${level}`,
      ({ node, children }) =>
        React.createElement(
          `h${level}`,
          { id: `${prefix}-${node.position?.start.offset}` },
          children,
        ),
    ]),
  );
  return (
    <>
      {headings.length >= 3 && (
        <details className="document-toc">
          <summary>文档目录 · {headings.length} 个章节</summary>
          <nav aria-label="文档章节">
            {headings.map((h) => (
              <a
                key={h.offset}
                href={`#${prefix}-${h.offset}`}
                className={`depth-${h.depth}`}
              >
                {h.title}
              </a>
            ))}
          </nav>
        </details>
      )}
      <Markdown text={body} components={components} />
      {notes && (
        <details className="reading-notes">
          <summary>历史维护与来源记录</summary>
          <Markdown text={notes} />
        </details>
      )}
    </>
  );
}
function Source({ source }) {
  if (!source) return null;
  return /^https:\/\//.test(source) ? (
    <a className="source" href={source} target="_blank" rel="noreferrer">
      <ExternalLink size={12} /> 查看来源
    </a>
  ) : (
    <span className="source">
      <Paperclip size={12} />
      {source.length > 90 ? "已关联本次原始材料" : source}
    </span>
  );
}
function Empty({ icon: Icon = FolderHeart, title, description, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const overlay = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (
        e.key === "Escape" &&
        Array.from(document.querySelectorAll(".overlay")).at(-1) ===
          overlay.current
      )
        onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return createPortal(
    <div
      ref={overlay}
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
function JobPicker({
  value,
  onChange,
  activeOnly = false,
  emptyLabel = "选择岗位",
  ...props
}) {
  const { data } = useWorkbench();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        {...props}
        value={value}
        onChange={(e) => {
          if (e.target.value === "__create_job__") setCreating(true);
          else
            onChange(
              e.target.value,
              data.applications.find((a) => a.id === e.target.value),
            );
        }}
      >
        <option value="">{emptyLabel}</option>
        {data.applications
          .filter((a) => !activeOnly || !closed(a.status))
          .map((a) => (
            <option key={a.id} value={a.id}>
              {jobLabel(a)}
              {closed(a.status) ? "（已归档）" : ""}
            </option>
          ))}
        <option value="__create_job__">＋ 新建岗位流程…</option>
      </select>
      {creating && (
        <NewJobModal
          onClose={() => setCreating(false)}
          onCreated={(a) => onChange(a.id, a)}
        />
      )}
    </>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{plainText(title)}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function DocumentRow({ document, onClick }) {
  return (
    <button className="document-row" onClick={onClick}>
      <span
        className={`file-icon ${document.kind === "review" ? "purple" : "green"}`}
      >
        <FileText size={18} />
      </span>
      <span className="row-main">
        <strong>{plainText(document.title)}</strong>
        <small>
          {kindNames[document.kind] || "材料"}
          {document.imported ? " · 飞书导入" : ""}
          {recordDate(document) && ` · ${recordDate(document)}`}
        </small>
      </span>
      <ArrowUpRight size={16} className="dim" />
    </button>
  );
}
function JobMark({ company }) {
  const color = /Sea|Shopee/i.test(company)
    ? "orange"
    : /字节|TikTok/i.test(company)
      ? "blue"
      : /腾讯/.test(company)
        ? "purple"
        : /淘宝/.test(company)
          ? "orange"
          : "green";
  return (
    <span className={`job-mark ${color}`}>
      {/Sea/i.test(company) ? "S" : company?.slice(0, 1) || "P"}
    </span>
  );
}
function ActionList({ actions, empty = "这里还没有待办", compact = false }) {
  const { mutate, go, data } = useWorkbench();
  actions = actions.filter((a) => !a.archivedAt);
  return actions.length ? (
    <div className={compact ? "action-list compact" : "action-list"}>
      {actions.map((a) => (
        <div className={`action-item ${a.done ? "done" : ""}`} key={a.id}>
          <button
            className="check-button"
            aria-label={`${a.done ? "取消完成" : "完成"} ${plainText(a.title)}`}
            onClick={() =>
              mutate(`/actions/${a.id}`, json("PATCH", { done: !a.done }))
            }
          >
            {a.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
          </button>
          <div>
            <Markdown inline text={a.title} />
            {a.applicationId && (
              <button
                className="text-link action-context"
                onClick={() => go(`/jobs/${a.applicationId}`)}
              >
                {
                  data.applications.find((j) => j.id === a.applicationId)
                    ?.company
                }{" "}
                · {data.stages.find((s) => s.id === a.stageId)?.title}
              </button>
            )}
          </div>
          {a.sourceId && (
            <button
              className="icon-button"
              aria-label="查看练习来源"
              onClick={() =>
                go(
                  data.reviews.some((r) => r.id === a.sourceId)
                    ? `/reviews/${a.sourceId}`
                    : `/documents/${a.sourceId}`,
                )
              }
            >
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="quiet-empty">{empty}</p>
  );
}

function App() {
  const [data, setData] = useState(null),
    [path, setPath] = useState(location.pathname + location.search),
    [agent, setAgent] = useState({
      connected: false,
      loading: true,
      models: [],
    }),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [assistantPath, setAssistantPath] = useState(null),
    [loadingError, setLoadingError] = useState("");
  const refresh = async () => {
    try {
      setData(await api("/state"));
      setLoadingError("");
    } catch (e) {
      setLoadingError(e.message);
    }
  };
  const refreshAgent = async () => {
    try {
      setAgent(await api("/agent/status"));
    } catch (e) {
      setAgent({ connected: false, error: e.message, models: [] });
    }
  };
  useEffect(() => {
    refresh();
    // Conversations run in Codex; opening the workbench must not start another Agent.
    const pop = () => setPath(location.pathname + location.search);
    window.addEventListener("popstate", pop);
    const interval = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("popstate", pop);
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (target) => {
    history.pushState({}, "", target);
    setPath(target);
    window.scrollTo(0, 0);
  };
  const mutate = async (endpoint, options) => {
    try {
      const result = await api(endpoint, options);
      await refresh();
      return result;
    } catch (e) {
      setToast(e.message);
      throw e;
    }
  };
  const notify = setToast;
  const context = {
    data,
    agent,
    go,
    refresh,
    refreshAgent,
    mutate,
    notify,
    setModal,
    openAssistant: ({
      applicationId = "",
      materialIds = [],
      assetId = "",
    } = {}) => {
      const params = new URLSearchParams();
      if (applicationId) params.set("job", applicationId);
      if (assetId) params.set("asset", assetId);
      materialIds.forEach((id) => params.append("material", id));
      setAssistantPath("/chat?" + params.toString());
    },
    path,
  };
  const route = path.split("?")[0];
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal({ type: "search" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!data)
    return (
      <div className="boot">
        <div className="brand-symbol">
          <img src="/brand-mark.svg" alt="" />
        </div>
        {loadingError ? (
          <>
            <p>{loadingError}</p>
            <Button onClick={refresh}>重试</Button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>正在打开你的工作台</p>
          </>
        )}
      </div>
    );
  const active = data.applications.filter((a) => !closed(a.status));
  const running = data.tasks.filter((t) => t.status === "running");
  if (
    ["/", "/rebuild", "/chat", "/jobs", "/reviews", "/assets"].includes(
      route,
    ) ||
    route.startsWith("/jobs/")
  )
    return (
      <RebuildPreview
        live={data}
        go={go}
        initialPage={
          route.startsWith("/jobs")
            ? "jobs"
            : route === "/reviews"
              ? "reviews"
              : route === "/assets"
                ? "assets"
                : "dashboard"
        }
        initialJob={route.startsWith("/jobs/") ? route.split("/")[2] : null}
      />
    );
  return (
    <Context.Provider value={context}>
      <div className={`shell ${assistantPath ? "with-agent-panel" : ""}`}>
        <aside className="sidebar">
          <a
            className="brand"
            aria-label="NextRound 首页"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go("/");
            }}
          >
            <span className="brand-symbol">
              <img src="/brand-mark.svg" alt="" />
            </span>
            <div>
              NextRound<small>下一程 · 把面试变成积累</small>
            </div>
          </a>
          <div className="workspace-label">
            <span className="tiny-avatar">Z</span>我的面试空间
            <span className="local-dot" />
            本地
          </div>
          <nav>
            {navigation.map(([url, label, Icon]) => (
              <button
                key={url}
                aria-label={label}
                title={label}
                className={`nav-item ${(url === "/" ? route === "/" : route.startsWith(url)) ? "active" : ""}`}
                onClick={() => go(url)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {url === "/jobs" && active.length > 0 && (
                  <span className="nav-count">{active.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-divider" />
          <div className="sidebar-caption">正在推进</div>
          <div className="sidebar-jobs">
            {active.slice(0, 4).map((j) => (
              <button key={j.id} onClick={() => go(`/jobs/${j.id}`)}>
                <span
                  className={`job-dot ${/Sea/i.test(j.company) ? "orange" : "green"}`}
                />
                <span>
                  {j.company.length > 23
                    ? j.company.slice(0, 23) + "…"
                    : j.company}
                </span>
              </button>
            ))}
            {active.length === 0 && <span className="dim">暂无进行中岗位</span>}
          </div>
          <div className="sidebar-bottom">
            <div
              className="agent-mini"
              onClick={() => go("/settings")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") go("/settings");
              }}
            >
              <div
                className={`connection-dot ${agent.connected ? "online" : ""}`}
              />
              <div>
                {agent.loading
                  ? "检查 Agent 连接"
                  : agent.connected
                    ? "Agent 已连接"
                    : "连接你的 Agent"}
                <small>
                  {agent.connected
                    ? agent.mode === "codex"
                      ? "ChatGPT · 本机 Codex"
                      : "ChatGPT · 计划授权"
                    : "在设置中连接 ChatGPT"}
                </small>
              </div>
              <ChevronRight size={15} />
            </div>
            <button className="nav-item" onClick={() => go("/settings")}>
              <Settings size={17} />
              设置与资料导入
            </button>
            <div className="sidebar-footer">个人使用 · v0.1</div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              我的空间
              <ChevronRight size={13} />
              <span>
                {navigation.find(([url]) =>
                  url === "/" ? route === "/" : route.startsWith(url),
                )?.[1] ||
                  (route.startsWith("/documents")
                    ? "材料阅读"
                    : route.startsWith("/settings")
                      ? "设置"
                      : "工作台")}
              </span>
            </div>
            <div className="top-actions">
              <button
                className="search-trigger"
                onClick={() => setModal({ type: "search" })}
              >
                <Search size={15} />
                搜索岗位、问题、经历…<kbd>⌘ K</kbd>
              </button>
              <button
                className={`task-indicator ${running.length ? "busy" : ""}`}
                onClick={() => go("/tasks")}
              >
                <span
                  className={`connection-dot ${running.length ? "online" : ""}`}
                />
                {running.length ? "任务运行中" : "任务记录"}
              </button>
              <button className="profile-avatar" onClick={() => go("/assets")}>
                Z
              </button>
            </div>
          </header>
          <main
            className={`main ${route.startsWith("/reviews/") ? "review-main" : ""}`}
          >
            {route === "/" ? (
              <Dashboard />
            ) : route === "/jobs" ? (
              <Jobs />
            ) : route.startsWith("/jobs/") ? (
              <JobDetail id={route.split("/")[2]} />
            ) : route === "/reviews" ? (
              <Reviews />
            ) : route.startsWith("/reviews/") ? (
              <ReviewDetail id={route.split("/")[2]} />
            ) : route === "/capabilities" ? (
              <Capabilities />
            ) : route === "/assets" ? (
              <Assets />
            ) : route.startsWith("/assets/") ? (
              <AssetDetail id={route.split("/")[2]} />
            ) : route.startsWith("/documents/") ? (
              <DocumentDetail id={route.split("/")[2]} />
            ) : route.startsWith("/chat") ? (
              <Chat conversationId={route.split("/")[2]} />
            ) : route === "/settings" ? (
              <SettingsPage />
            ) : route === "/tasks" ? (
              <Tasks />
            ) : (
              <Empty title="没有找到这个页面">
                <Button onClick={() => go("/")}>回到工作台</Button>
              </Empty>
            )}
          </main>
          <footer className="workspace-footer">
            <span>
              <span className="local-dot" />
              资料保存在本机
            </span>
            <span>下一次，答得更具体一点。</span>
          </footer>
        </div>
      </div>
      {assistantPath && (
        <aside className="context-agent-panel" aria-label="围绕当前资料的对话">
          <div className="context-agent-heading">
            <div>
              <Sparkles size={18} />
              <strong>围绕当前资料继续</strong>
            </div>
            <Button
              onClick={() => {
                go(assistantPath);
                setAssistantPath(null);
              }}
              icon={ArrowUpRight}
            >
              展开
            </Button>
            <button
              className="icon-button"
              aria-label="关闭侧边对话"
              onClick={() => setAssistantPath(null)}
            >
              <X size={20} />
            </button>
          </div>
          <Chat
            embedded
            localPath={assistantPath}
            navigate={setAssistantPath}
            conversationId={assistantPath.split("?")[0].split("/")[2]}
          />
        </aside>
      )}
      {modal?.type === "search" && (
        <SearchModal onClose={() => setModal(null)} />
      )}{" "}
      {modal?.type === "new-job" && (
        <NewJobModal onClose={() => setModal(null)} />
      )}{" "}
      {modal?.type === "upload" && (
        <UploadModal
          applicationId={modal.applicationId}
          stageId={modal.stageId}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "task" && (
        <TaskModal initial={modal} onClose={() => setModal(null)} />
      )}{" "}
      {modal?.type === "practice" && (
        <PracticeModal initial={modal} onClose={() => setModal(null)} />
      )}
      {modal?.type === "progress" && (
        <ProgressModal
          applicationId={modal.applicationId}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "new-asset" && (
        <NewAssetModal onClose={() => setModal(null)} />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={17} />
          {toast}
          <button onClick={() => setToast("")} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}

function Dashboard() {
  const { data, go, setModal } = useWorkbench();
  const active = data.applications.filter((a) => !closed(a.status));
  const focusJob = active.length === 1 ? active[0] : null;
  const hasPrep =
    focusJob &&
    data.artifacts.some(
      (a) =>
        a.applicationId === focusJob.id &&
        a.kind === "prep" &&
        (!a.stageId || a.stageId === focusJob.currentStageId),
    );
  const actions = data.actions.filter(
    (a) =>
      !a.done && !a.archivedAt && active.some((j) => j.id === a.applicationId),
  );
  const upcoming = data.stages
    .filter(
      (s) =>
        s.date &&
        !s.frozen &&
        new Date(s.date) >= new Date(new Date().toDateString()),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const recent = [
    ...data.artifacts.filter(
      (a) => !["transcript", "audio", "process"].includes(a.kind),
    ),
    ...data.reviews.map((r) => ({ ...r, kind: "review" })),
  ]
    .sort(newestFirst)
    .slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="YOUR INTERVIEW WORKSPACE"
        title="每一轮，都往前一步。"
        description="把准备、复盘和经历积累，放回同一条求职流程。"
      >
        <Button icon={Upload} onClick={() => setModal({ type: "upload" })}>
          上传材料
        </Button>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "new-job" })}
        >
          新岗位
        </Button>
      </PageHeading>
      <section className="hero-banner">
        <div>
          <span className="hero-label">
            <Sparkles size={15} /> {focusJob ? "当前重点" : "从这里开始"}
          </span>
          <h2>
            {focusJob
              ? `${focusJob.company} · ${data.stages.find((s) => s.id === focusJob.currentStageId)?.title || "当前阶段"}`
              : "下一场面试，准备得更有底气。"}
          </h2>
          <p>
            {focusJob
              ? plainText(focusJob.nextAction)
              : "沿着真实经历和上一轮反馈，找到这次最值得投入的地方。"}
          </p>
          <div className="hero-buttons">
            <Button
              variant="dark"
              icon={BriefcaseBusiness}
              onClick={() =>
                hasPrep
                  ? go(`/jobs/${focusJob.id}?tab=prep`)
                  : setModal({
                      type: "task",
                      kind: "prep",
                      applicationId: focusJob?.id,
                    })
              }
            >
              {hasPrep ? "继续当前准备" : "准备当前阶段"}
              <ArrowRight size={15} />
            </Button>
            <button
              className="hero-text"
              onClick={() => setModal({ type: "task", kind: "review" })}
            >
              复盘一场面试
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-card back">
            <div className="art-bar" />
            <div className="art-bar short" />
          </div>
          <div className="art-card front">
            <span className="art-check">
              <Check size={24} />
            </span>
            <div className="art-bar" />
            <div className="art-bar short" />
            <div className="art-progress">
              <span />
            </div>
          </div>
          <div className="art-spark">✦</div>
          <span className="art-caption">PREPARE · REFLECT · GROW</span>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <span className="section-marker green" />
              接下来做什么<span className="count">{actions.length}</span>
            </h2>
            <button className="text-link" onClick={() => go("/jobs")}>
              查看岗位
              <ArrowUpRight size={14} />
            </button>
          </div>
          <ActionList
            actions={actions.slice(0, 5)}
            empty="从岗位页添加行动，或把复盘建议加入练习。"
          />
          {active.length > 0 && actions.length === 0 && (
            <div className="next-suggestions">
              {active.slice(0, 3).map((j) => (
                <button key={j.id} onClick={() => go(`/jobs/${j.id}`)}>
                  <JobMark company={j.company} />
                  <span>
                    <strong>{j.company}</strong>
                    <small>{j.nextAction}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel schedule">
          <div className="panel-heading">
            <h2>
              <span className="section-marker orange" />
              近期安排
            </h2>
            <Clock3 size={16} className="dim" />
          </div>
          {upcoming.length ? (
            upcoming.slice(0, 3).map((s) => (
              <button
                className="schedule-row"
                key={s.id}
                onClick={() => go(`/jobs/${s.applicationId}?tab=timeline`)}
              >
                <div className="date-tile">
                  <span>
                    {new Date(s.date).toLocaleDateString("zh-CN", {
                      month: "short",
                    })}
                  </span>
                  <strong>{new Date(s.date).getDate()}</strong>
                </div>
                <div>
                  <strong>
                    {
                      data.applications.find((a) => a.id === s.applicationId)
                        ?.company
                    }
                  </strong>
                  <small>
                    {s.title} · {s.date.replace("T", " ")}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <div className="schedule-empty">
              <div className="calendar-glyph">
                <span />
                <b>—</b>
              </div>
              <strong>还没有确认的日程</strong>
              <p>在岗位页更新面试时间或笔试截止日期</p>
            </div>
          )}
        </section>
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>
            进行中的岗位<span className="count">{active.length}</span>
          </h2>
          <button className="text-link" onClick={() => go("/jobs")}>
            全部岗位
            <ArrowRight size={14} />
          </button>
        </div>
        {active.length ? (
          <div className="job-grid">
            {active.slice(0, 3).map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        ) : (
          <Empty
            icon={BriefcaseBusiness}
            title="从一个已经约面的岗位开始"
            description="添加 JD、当前阶段和安排，工作台会围绕它组织材料。"
          >
            <Button icon={Plus} onClick={() => setModal({ type: "new-job" })}>
              添加岗位
            </Button>
          </Empty>
        )}
      </section>
      <div className="dashboard-grid lower">
        <section className="panel">
          <div className="panel-heading">
            <h2>最近产物</h2>
            <button className="text-link" onClick={() => go("/reviews")}>
              复盘库
              <ArrowUpRight size={14} />
            </button>
          </div>
          {recent.length ? (
            recent.map((d) => (
              <DocumentRow
                key={d.id}
                document={d}
                onClick={() =>
                  go(
                    d.kind === "review"
                      ? `/reviews/${d.id}`
                      : `/documents/${d.id}`,
                  )
                }
              />
            ))
          ) : (
            <p className="quiet-empty">
              导入资料或完成任务后，产物会出现在这里。
            </p>
          )}
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <h2>把经验变成下一次的答案</h2>
            <Shapes size={17} className="dim" />
          </div>
          <div className="quick-tools">
            {capabilities.slice(2, 5).map((c) => (
              <button
                key={c.name}
                onClick={() => setModal({ type: "task", kind: c.key })}
              >
                <span className={`tool-icon ${c.color}`}>
                  <c.icon size={18} />
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.sub}</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function JobCard({ job }) {
  const { data, go } = useWorkbench();
  const stage = data.stages.find((s) => s.id === job.currentStageId);
  const reviews = data.reviews.filter((r) => r.applicationId === job.id).length;
  return (
    <button className="job-card" onClick={() => go(`/jobs/${job.id}`)}>
      <div className="job-card-top">
        <JobMark company={job.company} />
        <Badge status={job.status} />
      </div>
      <h3>{job.company}</h3>
      {job.role !== job.company && <p className="job-role">{job.role}</p>}
      <div className="job-stage">
        <span className="stage-dot" />
        {stage?.title || "阶段待确认"}
        {stage?.date && <span>{stage.date.slice(5).replace("T", " ")}</span>}
      </div>
      <div className="job-next">
        <span>{closed(job.status) ? "流程结果" : "下一步"}</span>
        <p>
          {closed(job.status)
            ? job.result || statusNames[job.status]
            : plainText(job.nextAction)}
        </p>
      </div>
      <div className="job-card-footer">
        <span>
          <NotebookPen size={13} />
          {reviews} 场复盘
        </span>
        <span>
          进入工作区
          <ArrowUpRight size={14} />
        </span>
      </div>
    </button>
  );
}
function Jobs() {
  const { data, setModal } = useWorkbench();
  const [filter, setFilter] = useState("active");
  const jobs = data.applications.filter(
    (a) =>
      filter === "all" ||
      (filter === "closed" ? closed(a.status) : !closed(a.status)),
  );
  return (
    <>
      <PageHeading
        eyebrow="APPLICATIONS"
        title="岗位流程"
        description="每个岗位一个完整工作区，准备与复盘沿着阶段推进。"
      >
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "new-job" })}
        >
          新岗位
        </Button>
      </PageHeading>
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ["active", "进行中"],
            ["closed", "已结束"],
            ["all", "全部"],
          ].map(([k, n]) => (
            <button
              className={filter === k ? "selected" : ""}
              key={k}
              onClick={() => setFilter(k)}
            >
              {n}
              <span>
                {
                  data.applications.filter(
                    (a) =>
                      k === "all" ||
                      (k === "closed" ? closed(a.status) : !closed(a.status)),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <span className="dim">
          <ListFilter size={15} />
          按岗位组织
        </span>
      </div>
      {jobs.length ? (
        <div className="job-grid full">
          {jobs.map((j) => (
            <JobCard job={j} key={j.id} />
          ))}
        </div>
      ) : (
        <Empty icon={BriefcaseBusiness} title="这里还没有岗位">
          <Button onClick={() => setModal({ type: "new-job" })}>
            添加岗位
          </Button>
        </Empty>
      )}
    </>
  );
}
function ContextChatButton(props) {
  const { openAssistant } = useWorkbench();
  return (
    <Button icon={MessageSquare} onClick={() => openAssistant(props)}>
      围绕此页对话
    </Button>
  );
}
function JobDetail({ id }) {
  const { data, go, path, setModal, mutate, notify } = useWorkbench();
  const app = data.applications.find((a) => a.id === id);
  const [newAction, setNewAction] = useState("");
  const tab =
    new URLSearchParams(path.split("?")[1] || "").get("tab") || "overview";
  if (!app) return <Empty title="没有找到这个岗位" />;
  const stages = data.stages
      .filter((s) => s.applicationId === id)
      .sort((a, b) => a.order - b.order),
    current = stages.find((s) => s.id === app.currentStageId),
    docs = data.artifacts.filter((a) => a.applicationId === id),
    reviews = data.reviews.filter((r) => r.applicationId === id),
    actions = data.actions.filter(
      (a) => a.applicationId === id && a.stageId === app.currentStageId,
    ),
    prep = docs.filter(
      (a) =>
        a.kind === "prep" &&
        (closed(app.status) || !a.stageId || a.stageId === app.currentStageId),
    );
  const tabs = [
    ["overview", "概览"],
    ["prep", closed(app.status) ? "历史准备" : "当前准备"],
    ["timeline", "阶段时间线"],
    ["facts", "岗位事实"],
    ["materials", "材料"],
  ];
  const add = async (e) => {
    e.preventDefault();
    if (!newAction.trim()) return;
    try {
      await mutate(
        "/actions",
        json("POST", {
          applicationId: id,
          stageId: app.currentStageId,
          title: newAction,
        }),
      );
      setNewAction("");
    } catch {}
  };
  return (
    <>
      <button className="back-link" onClick={() => go("/jobs")}>
        <ArrowLeft size={14} />
        岗位流程
      </button>
      <div className="job-detail-heading">
        <JobMark company={app.company} />
        <div>
          <h1>{app.company}</h1>
          <p>
            {[app.role !== app.company ? app.role : "", app.batch]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge status={app.status} />
        <div className="heading-actions">
          <ContextChatButton applicationId={id} />
          <Button
            icon={History}
            onClick={() => setModal({ type: "progress", applicationId: id })}
          >
            更新进度
          </Button>
          {!closed(app.status) && (
            <Button
              variant="primary"
              icon={Sparkles}
              onClick={() =>
                setModal({ type: "task", kind: "prep", applicationId: id })
              }
            >
              准备当前阶段
            </Button>
          )}
        </div>
      </div>
      <div className="job-current-strip">
        <span>
          <span className="stage-dot" />
          {current?.title}
        </span>
        {current?.date && (
          <span>
            <Clock3 size={14} />
            {current.date.replace("T", " ")}
          </span>
        )}
        <span className="current-next">
          {closed(app.status)
            ? `流程已结束 · ${app.result || statusNames[app.status]}`
            : `下一步：${plainText(app.nextAction)}`}
        </span>
        <Source source={app.source} />
      </div>
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => go(`/jobs/${id}?tab=${key}`)}
          >
            {label}
            {key === "materials" && <small>{docs.length}</small>}
          </button>
        ))}
      </div>
      <div className="job-workspace">
        <div className="job-content">
          {tab === "overview" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{closed(app.status) ? "历史行动记录" : "本阶段行动"}</h2>
                  <Badge status={app.status}>{current?.title}</Badge>
                </div>
                <ActionList
                  actions={actions}
                  empty={
                    closed(app.status)
                      ? "该流程已结束，可从复盘回看经验与改进建议。"
                      : "为这一阶段添加具体行动，或从复盘加入练习。"
                  }
                />
                {!closed(app.status) && (
                  <form className="add-action" onSubmit={add}>
                    <Plus size={16} />
                    <input
                      aria-label="新增阶段行动"
                      placeholder="添加一个具体行动…"
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                    />
                    <Button type="submit">添加</Button>
                  </form>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>阶段脉络</h2>
                  <button
                    className="text-link"
                    onClick={() => go(`/jobs/${id}?tab=timeline`)}
                  >
                    展开时间线
                    <ArrowRight size={14} />
                  </button>
                </div>
                <div className="stage-track">
                  {stages.map((s, index) => (
                    <div
                      className={`stage-node ${s.id === app.currentStageId ? "current" : ""}`}
                      key={s.id}
                    >
                      <span>
                        {s.result === "通过" ? <Check size={14} /> : index + 1}
                      </span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.result ||
                          (s.id === app.currentStageId
                            ? statusNames[app.status]
                            : "已记录")}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>准备与复盘</h2>
                </div>
                {[...prep, ...reviews.map((r) => ({ ...r, kind: "review" }))]
                  .length ? (
                  [
                    ...prep,
                    ...reviews.map((r) => ({ ...r, kind: "review" })),
                  ].map((d) => (
                    <DocumentRow
                      key={d.id}
                      document={d}
                      onClick={() =>
                        go(
                          d.kind === "review"
                            ? `/reviews/${d.id}`
                            : `/documents/${d.id}`,
                        )
                      }
                    />
                  ))
                ) : (
                  <p className="quiet-empty">
                    完成准备或复盘后，这里会自动关联产物。
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "prep" && (
            <>
              <div className="inline-heading">
                <h2>
                  {closed(app.status)
                    ? "历史准备"
                    : `${current?.title?.replace(/准备$/, "") || "当前阶段"}准备`}
                </h2>
                {!closed(app.status) && (
                  <Button
                    icon={Sparkles}
                    onClick={() =>
                      setModal({
                        type: "task",
                        kind: "prep",
                        applicationId: id,
                      })
                    }
                  >
                    生成新准备稿
                  </Button>
                )}
              </div>
              {prep.length ? (
                prep.map((d) => (
                  <section className="panel content-panel" key={d.id}>
                    <div className="panel-heading">
                      <h2>{d.title}</h2>
                      <button
                        className="text-link"
                        onClick={() => go(`/documents/${d.id}`)}
                      >
                        完整阅读
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <DocumentBody document={d} />
                  </section>
                ))
              ) : (
                <Empty
                  icon={FileText}
                  title="还没有当前阶段准备稿"
                  description="选择 JD、经历和题目，生成本阶段准备内容。"
                />
              )}
            </>
          )}
          {tab === "timeline" && (
            <section className="panel timeline-panel">
              {stages.map((s, index) => (
                <div className="timeline-stage" key={s.id}>
                  <div className="timeline-dot">
                    {s.result === "通过" ? <Check size={14} /> : index + 1}
                  </div>
                  <div className="timeline-body">
                    <h3>
                      {s.title}
                      <Badge
                        status={
                          s.id === app.currentStageId
                            ? app.status
                            : "waiting-result"
                        }
                      >
                        {plainText(s.result) || (s.date ? "已安排" : "已记录")}
                      </Badge>
                    </h3>
                    {(s.date || s.recordedDate) && (
                      <p className="dim">
                        {(s.date || s.recordedDate).replace("T", " ")}
                      </p>
                    )}
                    {app.events
                      .filter((e) => e.stageId === s.id)
                      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
                      .map((e) => (
                        <div className="timeline-event" key={e.id}>
                          <span>{e.occurredAt.slice(0, 10)}</span>
                          <strong>
                            {
                              {
                                scheduled: "已安排",
                                rescheduled: "安排变化",
                                completed: "已结束，等待结果",
                                advanced: "通过，进入下一阶段",
                                failed: "未通过",
                                withdrawn: "主动退出",
                                cancelled: "岗位取消",
                                reopened: "重新联系",
                              }[e.type]
                            }
                          </strong>
                          <p>{e.source}</p>
                        </div>
                      ))}
                    {docs
                      .filter((d) => d.stageId === s.id)
                      .map((d) => (
                        <DocumentRow
                          key={d.id}
                          document={d}
                          onClick={() => go(`/documents/${d.id}`)}
                        />
                      ))}
                    {reviews
                      .filter((r) => r.stageId === s.id)
                      .map((r) => (
                        <DocumentRow
                          key={r.id}
                          document={{ ...r, kind: "review" }}
                          onClick={() => go(`/reviews/${r.id}`)}
                        />
                      ))}
                  </div>
                </div>
              ))}
              {(docs.some((d) => !d.stageId) ||
                reviews.some((r) => !r.stageId)) && (
                <div className="timeline-unmapped">
                  <h3>历史材料</h3>
                  <p className="dim">保留原文，尚未明确对应阶段</p>
                  {[
                    ...docs.filter((d) => !d.stageId),
                    ...reviews
                      .filter((r) => !r.stageId)
                      .map((r) => ({ ...r, kind: "review" })),
                  ].map((d) => (
                    <DocumentRow
                      key={d.id}
                      document={d}
                      onClick={() =>
                        go(
                          d.kind === "review"
                            ? `/reviews/${d.id}`
                            : `/documents/${d.id}`,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "facts" && (
            <>
              {docs
                .filter((d) => ["process", "jd"].includes(d.kind))
                .map((d) => (
                  <section className="panel content-panel" key={d.id}>
                    <div className="panel-heading">
                      <h2>{d.title}</h2>
                      <Source source={d.source} />
                    </div>
                    <DocumentBody document={d} />
                  </section>
                ))}
              {!docs.some((d) => ["process", "jd"].includes(d.kind)) && (
                <Empty
                  icon={FileText}
                  title="补充岗位事实"
                  description="上传 JD、招聘通知或粘贴岗位材料。"
                >
                  <Button
                    onClick={() =>
                      setModal({ type: "upload", applicationId: id })
                    }
                  >
                    添加材料
                  </Button>
                </Empty>
              )}
            </>
          )}
          {tab === "materials" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  岗位材料<span className="count">{docs.length}</span>
                </h2>
                <Button
                  icon={Upload}
                  onClick={() =>
                    setModal({
                      type: "upload",
                      applicationId: id,
                      stageId: app.currentStageId,
                    })
                  }
                >
                  上传材料
                </Button>
              </div>
              {docs.map((d) => (
                <DocumentRow
                  key={d.id}
                  document={d}
                  onClick={() => go(`/documents/${d.id}`)}
                />
              ))}
              {!docs.length && (
                <p className="quiet-empty">上传逐字稿、录音、JD 或简历。</p>
              )}
            </section>
          )}
        </div>
        <aside className="context-panel">
          <span className="agent-symbol">
            <Sparkles size={20} />
          </span>
          <h3>
            {closed(app.status) ? "从这段经历继续积累" : "围绕这个岗位继续"}
          </h3>
          <p>
            {closed(app.status)
              ? "回看反馈，深挖可复用的经历。"
              : "结合本轮材料，推进下一步。"}
          </p>
          {[
            ["review", "复盘本场面试", NotebookPen],
            ["mock", "开始模拟练习", MessageSquare],
            ["experience", "深挖相关经历", FolderHeart],
          ]
            .filter(([kind]) => !closed(app.status) || kind !== "mock")
            .map(([kind, name, Icon]) => (
              <button
                className="context-task"
                key={kind}
                onClick={() =>
                  setModal({ type: "task", kind, applicationId: id })
                }
              >
                <Icon size={16} />
                {closed(app.status) && kind === "review"
                  ? "补充面试复盘"
                  : name}
                <ArrowUpRight size={14} />
              </button>
            ))}
          <Button
            icon={MessageSquare}
            className="full-width"
            onClick={() => go(`/chat?job=${id}`)}
          >
            向 Agent 提问
          </Button>
          <div className="context-divider" />
          <h4>相关经历</h4>
          {data.assets
            .filter((a) => a.kind === "experience")
            .slice(0, 4)
            .map((a) => (
              <button
                className="asset-link"
                key={a.id}
                onClick={() => go(`/assets/${a.id}`)}
              >
                <FolderHeart size={15} />
                {a.title}
                <ChevronRight size={12} />
              </button>
            ))}
        </aside>
      </div>
    </>
  );
}

function Reviews() {
  const { data, go, setModal } = useWorkbench();
  const [job, setJob] = useState(""),
    [filter, setFilter] = useState("all");
  const reviews = data.reviews
    .filter(
      (r) =>
        (!job || r.applicationId === job) &&
        (filter === "all" ||
          (filter === "ready"
            ? r.status === "ready"
            : r.status === "imported")),
    )
    .map((r) =>
      r.imported ? { ...r, groups: parseHistoricalGroups(r.content) } : r,
    )
    .sort(newestFirst);
  return (
    <>
      <PageHeading
        eyebrow="REFLECTIONS"
        title="面试复盘库"
        description="问题原话、当时回答和改进建议，保留在一起。"
      >
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "task", kind: "review" })}
        >
          复盘一场面试
        </Button>
      </PageHeading>
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ["all", "全部"],
            ["ready", "逐题复盘"],
            ["imported", "历史复盘"],
          ].map(([k, n]) => (
            <button
              key={k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {n}
            </button>
          ))}
        </div>
        <select
          aria-label="筛选复盘岗位"
          value={job}
          onChange={(e) => setJob(e.target.value)}
        >
          <option value="">全部岗位</option>
          {data.applications.map((a) => (
            <option value={a.id} key={a.id}>
              {jobLabel(a)}
            </option>
          ))}
        </select>
      </div>
      {reviews.length ? (
        <div className="review-grid">
          {reviews.map((r) => (
            <button
              className="review-card"
              key={r.id}
              onClick={() => go(`/reviews/${r.id}`)}
            >
              <div className="review-card-top">
                <span className="tool-icon purple">
                  <NotebookPen size={19} />
                </span>
                <Badge
                  status={
                    r.status === "imported" ? "waiting-result" : "preparing"
                  }
                >
                  {r.status === "imported" ? "历史复盘" : "逐题复盘"}
                </Badge>
              </div>
              <h3>{r.title}</h3>
              <p>
                {plainText(r.summary).slice(0, 140) || "查看已有复盘原文与来源"}
              </p>
              <div className="review-card-footer">
                <span>
                  {r.groups?.length
                    ? `${r.imported ? "旧记录 · " : `${r.groups.length} 组 · `}${r.groups.reduce((n, g) => n + g.questions.length, 0)} 道问题`
                    : data.applications.find((a) => a.id === r.applicationId)
                        ?.company || "历史记录"}
                </span>
                <ArrowUpRight size={16} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={NotebookPen}
          title="把一场面试变成可用的复盘"
          description="选择完整逐字稿，逐题保留原文，再形成具体改进建议。"
        />
      )}
    </>
  );
}
function ReviewDetail({ id }) {
  const { data, go, path, mutate, notify, setModal } = useWorkbench();
  const storedReview = data.reviews.find((r) => r.id === id);
  const review = storedReview?.imported
    ? { ...storedReview, groups: parseHistoricalGroups(storedReview.content) }
    : storedReview;
  const params = new URLSearchParams(path.split("?")[1] || "");
  const [groupIndex, setGroupIndex] = useState(
    Number(params.get("group")) || 0,
  );
  const [showTranscript, setShowTranscript] = useState(false);
  useEffect(
    () =>
      setGroupIndex(
        Number(new URLSearchParams(path.split("?")[1] || "").get("group")) || 0,
      ),
    [path],
  );
  if (!review) return <Empty title="没有找到这场复盘" />;
  const app = data.applications.find((a) => a.id === review.applicationId);
  const group = review.groups?.[groupIndex];
  const materials = data.artifacts.filter((a) =>
    review.materialIds?.includes(a.id),
  );
  const practice = (title) =>
    setModal({
      type: "practice",
      title,
      sourceId: id,
      applicationId: app && !closed(app.status) ? app.id : "",
    });
  return (
    <>
      <button className="back-link" onClick={() => go("/reviews")}>
        <ArrowLeft size={14} />
        复盘库
      </button>
      <PageHeading
        title={review.title}
        description={app ? jobLabel(app) : "历史面试记录"}
      >
        <ContextChatButton applicationId={app?.id} materialIds={[review.id]} />
        <Source source={review.source} />
        {app && (
          <Button onClick={() => go(`/jobs/${app.id}`)}>
            所属岗位
            <ArrowUpRight size={14} />
          </Button>
        )}
        {app && !closed(app.status) && (
          <Button
            variant="primary"
            icon={ArrowRight}
            onClick={() =>
              setModal({
                type: "task",
                kind: "prep",
                applicationId: app.id,
                materialIds: [review.id],
              })
            }
          >
            结合这场复盘准备下一步
          </Button>
        )}
        <Button
          icon={FolderHeart}
          onClick={() =>
            setModal({
              type: "task",
              kind: "experience",
              applicationId: app?.id,
              materialIds: [review.id],
            })
          }
        >
          结合追问深挖经历
        </Button>
      </PageHeading>
      {review.summary && (
        <div className="review-summary">
          <span className="tool-icon purple">
            <NotebookPen size={20} />
          </span>
          <div>
            <strong>本场结论</strong>
            <Markdown text={review.summary} />
          </div>
          <Badge
            status={
              review.result === "未通过" ? "closed-fail" : "waiting-result"
            }
          >
            {review.result || "结果待确认"}
          </Badge>
        </div>
      )}
      {!group ? (
        <section className="panel content-panel">
          <div className="panel-heading">
            <h2>已有复盘记录</h2>
            <span className="dim">保留历史原文</span>
          </div>
          <DocumentBody document={review} />
        </section>
      ) : (
        <div className="review-layout">
          <aside className="review-outline">
            <div className="outline-heading">
              {review.imported ? "题目目录" : "问题组"}
              <span>{review.groups.length}</span>
            </div>
            {review.groups.map((g, i) => (
              <button
                key={i}
                className={i === groupIndex ? "active" : ""}
                onClick={() => {
                  setGroupIndex(i);
                  setShowTranscript(false);
                }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{g.title}</strong>
                  <small>{g.questions.length} 道问题</small>
                </div>
              </button>
            ))}
            <div className="outline-footer">
              {materials
                .filter((m) => m.kind === "transcript")
                .map((m) => (
                  <button
                    className="text-link"
                    key={m.id}
                    onClick={() => setShowTranscript(!showTranscript)}
                  >
                    <FileText size={15} />
                    完整逐字稿
                  </button>
                ))}
              {materials
                .filter((m) => m.kind === "audio")
                .map((m) => (
                  <button
                    className="text-link"
                    key={m.id}
                    onClick={() => go(`/documents/${m.id}`)}
                  >
                    <AudioLines size={15} />
                    原始录音
                  </button>
                ))}
            </div>
          </aside>
          <section className="actual-answers">
            <div className="column-heading">
              <span className="section-marker green" />
              实际问答
              <small>{review.imported ? "历史问答记录" : "原稿逐字记录"}</small>
            </div>
            {showTranscript
              ? materials
                  .filter((m) => m.kind === "transcript")
                  .map((m) => (
                    <div className="transcript" key={m.id}>
                      <h3>{m.title}</h3>
                      {m.content}
                    </div>
                  ))
              : group.questions.map((q, i) => (
                  <article
                    className="question-card"
                    id={`question-${i}`}
                    key={i}
                  >
                    <div className="question-number">
                      Q
                      {review.groups
                        .slice(0, groupIndex)
                        .reduce((n, g) => n + g.questions.length, 0) +
                        i +
                        1}
                      {q.timestamp && (
                        <span>
                          <Clock3 size={12} />
                          {q.timestamp}
                        </span>
                      )}
                    </div>
                    {q.questionType === "summary" && (
                      <div className="answer-label">问题摘要（旧记录）</div>
                    )}
                    <h3>
                      <Markdown inline text={q.question} />
                    </h3>
                    <div className="answer-label">
                      {q.answerType === "summary"
                        ? "当时回答摘要（旧记录）"
                        : "我的实际回答"}
                    </div>
                    <div className="verbatim">
                      <Markdown text={q.answer} />
                    </div>
                    {q.diagnosis && q.diagnosis !== group.diagnosis && (
                      <div className="question-diagnosis">
                        <strong>具体诊断</strong>
                        <Markdown text={q.diagnosis} />
                        {q.sourceQuote && (
                          <blockquote>
                            <Markdown text={q.sourceQuote} />
                          </blockquote>
                        )}
                      </div>
                    )}
                  </article>
                ))}
          </section>
          <aside className="improvements">
            <div className="column-heading">
              <span className="section-marker purple" />
              复盘与改进
            </div>
            <h3>{group.title}</h3>
            <div className="improvement-section">
              <h4>这一组的核心差距</h4>
              <Markdown text={group.diagnosis} />
              {group.evidence && (
                <blockquote>
                  <Markdown text={group.evidence} />
                </blockquote>
              )}
            </div>
            <div className="improvement-section">
              <h4>更好的回答路径</h4>
              <Markdown text={group.betterStructure} />
            </div>
            {group.example && (
              <div className="example-answer">
                <span>
                  <Sparkles size={14} />
                  复盘后示范
                </span>
                <Markdown text={group.example} />
              </div>
            )}
            {group.supplement && (
              <div className="improvement-section">
                <h4>可以继续想深一层</h4>
                <Markdown text={group.supplement} />
              </div>
            )}
            {group.practice?.length > 0 && (
              <div className="improvement-section">
                <h4>下一步练习</h4>
                {group.practice.map((p, i) => (
                  <div className="practice-item" key={i}>
                    <Markdown text={p} />
                    <Button icon={Plus} onClick={() => practice(p)}>
                      {app?.status.startsWith("closed-")
                        ? "用于其他岗位练习"
                        : `加入${data.stages.find((s) => s.id === app?.currentStageId)?.title || "下一轮"}练习`}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {group.experienceIds?.map((eid) => {
              const a = data.assets.find((a) => a.id === eid);
              return (
                a && (
                  <button
                    className="asset-link"
                    key={eid}
                    onClick={() => go(`/assets/${eid}`)}
                  >
                    <FolderHeart size={15} />
                    {a.title}
                    <ArrowUpRight size={14} />
                  </button>
                )
              );
            })}
          </aside>
        </div>
      )}
      {group && review.content && (
        <details className="panel reading-notes complete-record">
          <summary>查看完整复盘记录与整体建议</summary>
          <DocumentBody document={review} />
        </details>
      )}
      {review.uncertainties?.length > 0 && (
        <section className="uncertainties">
          <h3>
            <AlertCircle size={16} />
            需要核实的原稿或事实
          </h3>
          {review.uncertainties.map((s, i) => (
            <Markdown key={i} text={s} />
          ))}
        </section>
      )}
    </>
  );
}

function Capabilities() {
  const { setModal } = useWorkbench();
  return (
    <>
      <PageHeading
        eyebrow="CAPABILITIES"
        title="让 Agent 帮你推进这一步"
        description="选择当前要解决的事，再绑定岗位和本次材料。"
      />
      <div className="capability-grid">
        {capabilities.map((c) => (
          <button
            className="capability-card"
            key={c.name}
            onClick={() => setModal({ type: "task", kind: c.key })}
          >
            <span className={`tool-icon ${c.color}`}>
              <c.icon size={24} />
            </span>
            <h3>{c.name}</h3>
            <p>{c.sub}</p>
            <span className="capability-footer">
              开始任务
              <ArrowUpRight size={16} />
            </span>
          </button>
        ))}
      </div>
      <div className="capability-note">
        <FileText size={18} />
        <p>
          复盘使用你提供的逐字稿。录音保留供局部回听，原始问答和复盘后示范分别展示。
        </p>
      </div>
    </>
  );
}
function Assets() {
  const { data, go, setModal } = useWorkbench();
  const [filter, setFilter] = useState("all");
  const list = data.assets.filter((a) => filter === "all" || a.kind === filter);
  return (
    <>
      <PageHeading
        eyebrow="PERSONAL KNOWLEDGE"
        title="个人资产"
        description="把稳定事实、经历答案和可复用教训，留给下一个岗位。"
      >
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "new-asset" })}
        >
          添加资产
        </Button>
      </PageHeading>
      <div className="tabs">
        {[
          ["all", "全部"],
          ["profile", "个人档案"],
          ["experience", "经历题卡"],
          ["resume", "简历版本"],
          ["learning", "可复用经验"],
        ].map(([k, n]) => (
          <button
            className={filter === k ? "active" : ""}
            key={k}
            onClick={() => setFilter(k)}
          >
            {n}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="asset-grid">
          {list.map((a) => (
            <button
              className="asset-card"
              key={a.id}
              onClick={() => go(`/assets/${a.id}`)}
            >
              <span
                className={`tool-icon ${a.kind === "experience" ? "blue" : "green"}`}
              >
                <FolderHeart size={20} />
              </span>
              <div>
                <span className="eyebrow">{kindNames[a.kind]}</span>
                <h3>{a.title}</h3>
                <p>
                  {plainText(readingParts(a.content, a.title).body).slice(
                    0,
                    95,
                  )}
                </p>
              </div>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={FolderHeart}
          title="积累属于你的经历与事实"
          description="可导入飞书经历卡，也可以先建立最小个人档案。"
        />
      )}
    </>
  );
}
function ExperienceDraftReview({ document: draft }) {
  const { data, mutate, go, notify } = useWorkbench();
  const asset = data.assets.find((a) => a.id === draft.assetId);
  const [reviewing, setReviewing] = useState(false),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false);
  if (!asset) return null;
  const accept = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await mutate(
        `/artifacts/${draft.id}/accept-experience`,
        json("POST", { source, revision: data.revision }),
      );
      setReviewing(false);
      notify("经历已更新，原版本已保留");
      go(`/assets/${saved.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="draft-review">
      <strong>
        {draft.acceptedAt ? "这份修改已确认并保存到经历" : "经历修改草稿"}
      </strong>
      <p>
        关联经历：{asset.title}
        {!draft.acceptedAt &&
          "。请核对事实、数字和职责边界；待核实内容应继续保留标记。"}
      </p>
      <Button onClick={() => go(`/assets/${asset.id}`)}>查看原经历</Button>{" "}
      {!draft.acceptedAt && (
        <Button variant="primary" onClick={() => setReviewing(true)}>
          对照并确认修改
        </Button>
      )}
      {reviewing && (
        <Modal
          title="核对经历新版本"
          subtitle="确认后更新同一张经历卡，并保留原版本"
          onClose={() => setReviewing(false)}
          wide
        >
          <div className="draft-review-grid">
            <div>
              <h3>当前经历</h3>
              <Markdown text={asset.content} />
            </div>
            <div>
              <h3>修改草稿</h3>
              <Markdown text={draft.content} />
            </div>
          </div>
          <form onSubmit={accept}>
            <Field label="本次事实核对依据">
              <input
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="例如：已对照项目原始记录核对职责与指标；其余保留待核实"
              />
            </Field>
            <div className="modal-actions">
              <Button onClick={() => setReviewing(false)}>暂不修改</Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !source.trim()}
              >
                已核对，保存经历新版本
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
function DocumentDetail({ id }) {
  const { data, go, mutate, notify, setModal } = useWorkbench();
  const d = data.artifacts.find((a) => a.id === id);
  const [editing, setEditing] = useState(false),
    [text, setText] = useState("");
  if (!d) return <Empty title="材料不存在" />;
  const save = async () => {
    try {
      const saved = await mutate(
        `/artifacts/${id}${d.imported || d.frozen || data.stages.find((s) => s.id === d.stageId)?.frozen ? "/version" : ""}`,
        json(
          d.imported ||
            d.frozen ||
            data.stages.find((s) => s.id === d.stageId)?.frozen
            ? "POST"
            : "PATCH",
          { content: text, revision: data.revision },
        ),
      );
      setEditing(false);
      if (saved.id !== id) go(`/documents/${saved.id}`);
      notify(saved.id !== id ? "新版本已保存，正在查看新版本" : "已保存");
    } catch {}
  };
  return (
    <>
      <button
        className="back-link"
        onClick={() =>
          go(d.applicationId ? `/jobs/${d.applicationId}?tab=materials` : "/")
        }
      >
        <ArrowLeft size={14} />
        {d.applicationId ? "岗位材料" : "工作台"}
      </button>
      <PageHeading
        title={d.title}
        description={`${kindNames[d.kind] || "材料"}${d.imported ? " · 飞书历史导入" : ""}`}
      >
        <ContextChatButton
          applicationId={d.applicationId}
          materialIds={d.kind === "audio" ? [] : [d.id]}
          assetId={d.assetId}
        />
        <Source source={d.source} />
        {d.kind !== "audio" && d.kind !== "transcript" && (
          <Button
            icon={NotebookPen}
            onClick={() => {
              setText(d.content);
              setEditing(!editing);
            }}
          >
            编辑{d.imported || d.frozen ? "新版本" : ""}
          </Button>
        )}
        {d.kind === "transcript" && (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={() =>
              setModal({
                type: "task",
                kind: "review",
                applicationId: d.applicationId,
                stageId: d.stageId,
                materialIds: [d.id],
              })
            }
          >
            用这份逐字稿复盘
          </Button>
        )}
      </PageHeading>
      {d.kind === "experience" && d.assetId && (
        <ExperienceDraftReview document={d} />
      )}
      {d.kind === "audio" ? (
        <section className="panel audio-panel">
          <AudioLines size={44} />
          <h2>原始录音</h2>
          <audio controls src={`/api/files/${d.id}`} />
          <p className="dim">按需回听对应片段</p>
        </section>
      ) : editing ? (
        <section className="panel editor-panel">
          <textarea
            aria-label="编辑材料正文"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="editor-actions">
            <Button onClick={() => setEditing(false)}>取消</Button>
            <Button variant="primary" onClick={save}>
              保存{d.imported || d.frozen ? "新版本" : ""}
            </Button>
          </div>
        </section>
      ) : (
        <section className="panel content-panel">
          {d.kind === "transcript" ? (
            <div className="transcript">{d.content}</div>
          ) : (
            <DocumentBody document={d} />
          )}
        </section>
      )}
      {d.file && (
        <a
          className="source download-original"
          href={`/api/files/${id}`}
          download={d.title}
        >
          <Download size={14} />
          下载原文件
        </a>
      )}
    </>
  );
}
function AssetDetail({ id }) {
  const { data, go, mutate, notify, setModal } = useWorkbench();
  const a = data.assets.find((a) => a.id === id);
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(""),
    [source, setSource] = useState("");
  if (!a) return <Empty title="没有找到这个资产" />;
  const save = async () => {
    try {
      await mutate(
        `/assets/${id}`,
        json("PATCH", { content: text, source, revision: data.revision }),
      );
      setEditing(false);
      notify("已保存确认口径，旧版本已保留");
    } catch {}
  };
  return (
    <>
      <button className="back-link" onClick={() => go("/assets")}>
        <ArrowLeft size={14} />
        个人资产
      </button>
      <PageHeading title={a.title} description={kindNames[a.kind]}>
        <ContextChatButton assetId={a.id} />
        <Source source={a.source} />
        <Button
          icon={NotebookPen}
          onClick={() => {
            setText(a.content);
            setSource("");
            setEditing(!editing);
          }}
        >
          更新事实
        </Button>
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={() =>
            setModal({ type: "task", kind: "experience", assetId: a.id })
          }
        >
          继续深挖
        </Button>
      </PageHeading>
      {editing ? (
        <section className="panel editor-panel">
          <textarea
            aria-label="编辑资产正文"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Field label="本次确认来源">
            <input
              placeholder="例如：我本人确认，或具体材料链接"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </Field>
          <div className="editor-actions">
            <Button onClick={() => setEditing(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!source.trim()}>
              确认并保存
            </Button>
          </div>
        </section>
      ) : (
        <section className="panel content-panel">
          <DocumentBody document={a} />
        </section>
      )}
      {a.versions?.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>已保留的历史版本</h2>
          </div>
          {a.versions.map((v, i) => (
            <details className="version-history" key={i}>
              <summary>
                {new Date(v.savedAt).toLocaleString("zh-CN")} · {v.source}
              </summary>
              <Markdown text={v.content} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}

function TaskActivity({ task }) {
  const { data, go, mutate } = useWorkbench();
  const [busy, setBusy] = useState(false);
  if (!task) return null;
  const retry = async () => {
    setBusy(true);
    try {
      await mutate(`/tasks/${task.id}/retry`, json("POST", {}));
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-activity" aria-live="polite">
      {task.results?.length > 0 && (
        <div className="agent-results">
          {task.results.map((r) => (
            <button
              key={r.route}
              className="agent-result-card"
              onClick={() => go(r.route)}
            >
              <CheckCircle2 size={17} />
              <span>
                <strong>{r.title}</strong>
                {r.summary && <small>{r.summary}</small>}
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      )}
      {task.steps?.length > 0 && (
        <details className="agent-steps">
          <summary>
            {task.status === "running"
              ? task.steps.filter((s) => s.status === "running").at(-1)
                  ?.label || "正在整理结果"
              : "查看执行记录"}{" "}
            · {task.steps.filter((s) => s.status === "completed").length}{" "}
            步已完成
          </summary>
          <ol>
            {task.steps.map((s) => (
              <li key={s.id} className={s.status}>
                {s.status === "completed" ? (
                  <Check size={13} />
                ) : s.status === "running" ? (
                  <LoaderCircle size={13} className="spin" />
                ) : (
                  <AlertCircle size={13} />
                )}
                <span>
                  {s.label}
                  {s.error && <small>{s.error}</small>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {task.status === "waiting-input" && (
        <div className="agent-recovery">
          <p>{task.question}</p>
          <small>在对话中补充后，将继续本次任务。</small>
        </div>
      )}
      {task.status === "failed" && (
        <div className="agent-recovery">
          <p>
            {task.error || "本次尚未完成"}
            {task.results?.length ? "。已完成的成果已保留。" : ""}
          </p>
          <Button
            onClick={retry}
            disabled={busy || data.tasks.some((t) => t.status === "running")}
            icon={ArrowRight}
          >
            继续未完成部分
          </Button>
        </div>
      )}
      {task.status === "running" && (
        <Button
          onClick={() =>
            mutate(`/tasks/${task.id}/interrupt`, json("POST", {})).catch(
              () => {},
            )
          }
          disabled={task.cancelRequested}
        >
          {task.cancelRequested ? "正在停止…" : "停止，保留已完成结果"}
        </Button>
      )}
    </div>
  );
}

function Chat({ conversationId, embedded = false, localPath, navigate }) {
  const {
    data,
    agent,
    go: pageGo,
    mutate,
    path: pagePath,
    setModal,
  } = useWorkbench();
  const path = embedded ? localPath : pagePath;
  const go = (target) =>
    embedded && target.startsWith("/chat") ? navigate(target) : pageGo(target);
  const params = new URLSearchParams(path?.split("?")[1]);
  const conversation = data.conversations.find((c) => c.id === conversationId);
  const [text, setText] = useState("");
  const [job, setJob] = useState(
    conversation?.applicationId || params.get("job") || "",
  );
  const [pendingTaskId, setPendingTaskId] = useState("");
  const [materials, setMaterials] = useState(params.getAll("material"));
  const [asset, setAsset] = useState(params.get("asset") || "");
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState("");
  const busyTask = data.tasks.find((t) => t.status === "running");
  const awaiting = data.tasks
    .filter(
      (t) =>
        conversationId &&
        t.conversationId === conversationId &&
        t.status === "waiting-input",
    )
    .at(-1);
  const running =
    busyTask &&
    (busyTask.id === pendingTaskId ||
      (conversationId && busyTask.conversationId === conversationId))
      ? busyTask
      : null;
  const end = useRef(null);
  useEffect(() => {
    const p = new URLSearchParams(path?.split("?")[1]);
    setJob(conversation?.applicationId || p.get("job") || "");
    setMaterials(p.getAll("material"));
    setAsset(p.get("asset") || "");
  }, [conversationId, path, conversation?.applicationId]);
  useEffect(() => {
    const task = data.tasks.find((t) => t.id === pendingTaskId);
    if (!conversationId && task?.conversationId)
      go(`/chat/${task.conversationId}`);
  }, [data.tasks, pendingTaskId, conversationId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversation?.messages.length]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending || busyTask) return;
    setSending(true);
    try {
      const task = await mutate(
        awaiting ? `/tasks/${awaiting.id}/continue` : "/tasks",
        json("POST", {
          kind: conversation?.kind || "chat",
          applicationId: job,
          conversationId,
          model,
          prompt: text,
          materialIds: materials,
          assetId: asset,
        }),
      );
      setPendingTaskId(task.id);
      setText("");
      if (task.conversationId && !conversationId)
        go(`/chat/${task.conversationId}`);
    } catch {
    } finally {
      setSending(false);
    }
  };
  const newChat = () => {
    setPendingTaskId("");
    setText("");
    go("/chat");
    setJob("");
    setMaterials([]);
    setAsset("");
  };
  return (
    <>
      {!embedded && (
        <PageHeading
          eyebrow="AGENT CONVERSATION"
          title="一起想清楚，再往前走"
          description="告诉我当前发生了什么，把资料、复盘和下一步连起来。"
        />
      )}
      <div className={`chat-layout ${embedded ? "embedded-chat" : ""}`}>
        <aside className="chat-sessions">
          <Button icon={Plus} onClick={newChat}>
            新对话
          </Button>
          {data.conversations
            .slice()
            .reverse()
            .map((c) => (
              <button
                className={c.id === conversationId ? "active" : ""}
                key={c.id}
                onClick={() => go(`/chat/${c.id}`)}
              >
                <MessageSquare size={15} />
                <span>{c.title}</span>
              </button>
            ))}
        </aside>
        <section className="chat-main">
          <div className="chat-context">
            <BriefcaseBusiness size={16} />
            <JobPicker
              aria-label="绑定对话岗位"
              disabled={!!conversation?.applicationId}
              value={job}
              onChange={(value) => {
                setJob(value);
                setMaterials([]);
              }}
              emptyLabel="通用面试讨论"
            />
            {conversation && (
              <Button icon={Plus} onClick={newChat}>
                新对话
              </Button>
            )}
            <select
              aria-label="对话模型"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">
                默认：
                {agent.models?.find((m) => m.isDefault)?.displayName ||
                  "账户模型"}
              </option>
              {agent.models?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName || m.id}
                </option>
              ))}
            </select>
          </div>
          <details className="chat-materials">
            <summary>
              指定参考资料 · {materials.length + (asset ? 1 : 0)} 份
            </summary>
            <p className="dim">
              优先读取指定资料，也会按需查找本岗位材料和个人经历。读取记录可展开查看；录音只供按需回听。
            </p>
            <Button
              icon={Upload}
              onClick={() => setModal({ type: "upload", applicationId: job })}
            >
              添加逐字稿或资料
            </Button>
            <Field label="相关经历或简历">
              <select value={asset} onChange={(e) => setAsset(e.target.value)}>
                <option value="">按任务查找相关经历</option>
                {data.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Field>
            {[...data.artifacts, ...data.reviews]
              .filter(
                (a) =>
                  (a.content || a.groups?.length) &&
                  a.kind !== "audio" &&
                  (!a.applicationId || a.applicationId === job),
              )
              .map((a) => (
                <label className="chat-material-option" key={a.id}>
                  <input
                    type="checkbox"
                    checked={materials.includes(a.id)}
                    onChange={(e) =>
                      setMaterials((list) =>
                        e.target.checked
                          ? [...list, a.id]
                          : list.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.title}
                </label>
              ))}
          </details>
          <div className="chat-messages">
            {conversation?.messages.length ? (
              conversation.messages.map((m, i) => {
                const task = data.tasks.find((t) => t.id === m.taskId);
                return (
                  <div className={`message ${m.role}`} key={i}>
                    <span className="message-avatar">
                      {m.role === "user" ? "你" : <Sparkles size={15} />}
                    </span>
                    <div className="message-body">
                      <small>{m.role === "user" ? "你" : "面试 Agent"}</small>
                      <Markdown text={m.text} />
                      {m.role === "assistant" &&
                        task?.agentVersion &&
                        task.status !== "running" &&
                        !conversation.messages
                          .slice(i + 1)
                          .some((next) => next.taskId === m.taskId) && (
                          <TaskActivity task={task} />
                        )}
                      {m.role === "user" &&
                        task?.agentVersion &&
                        task.status === "failed" &&
                        !conversation.messages
                          .slice(i + 1)
                          .some((next) => next.taskId === m.taskId) && (
                          <TaskActivity task={task} />
                        )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="chat-welcome">
                <span className="agent-symbol">
                  <Sparkles size={28} />
                </span>
                <h2>这次想一起解决什么？</h2>
                <p>可以准备一个岗位，复盘刚结束的面试，或继续深挖一段经历。</p>
                <div>
                  {[
                    "结合本岗位资料，帮我准备当前阶段",
                    "帮我复盘这轮面试，并梳理下一步",
                    "结合这份材料，继续深挖项目经历",
                  ].map((t) => (
                    <button key={t} onClick={() => setText(t)}>
                      {t}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {running && (
              <div className="message assistant">
                <span className="message-avatar">
                  <Sparkles size={15} />
                </span>
                <div className="message-body">
                  <small>
                    <LoaderCircle size={12} className="spin" /> 正在处理
                  </small>
                  {running.text && <Markdown text={running.text} />}
                  <TaskActivity task={running} />
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
          <form className="chat-composer" onSubmit={send}>
            <textarea
              aria-label="给 Agent 的消息"
              placeholder={
                agent.connected
                  ? awaiting?.question || "说说发生了什么，或想继续解决的问题…"
                  : "先到设置中连接 ChatGPT，再开始对话"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
              }}
            />
            <div>
              <span>
                ⌘ Enter 发送 ·{" "}
                {busyTask && !running
                  ? "其他任务正在运行"
                  : job
                    ? "已关联岗位"
                    : "通用讨论"}
              </span>
              <Button
                variant="primary"
                icon={sending || running ? LoaderCircle : Send}
                disabled={
                  !agent.connected || !text.trim() || sending || !!busyTask
                }
                type="submit"
              >
                {running ? "处理中" : "发送"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

function Tasks() {
  const { data, go, mutate } = useWorkbench();
  return (
    <>
      <PageHeading
        eyebrow="TASK HISTORY"
        title="任务记录"
        description="查看当前进度、完整结果，或重试未完成的任务。"
      />
      {data.tasks.length ? (
        <div className="task-list">
          {data.tasks
            .slice()
            .reverse()
            .map((t) => (
              <section className="panel task-card" key={t.id}>
                <div className="panel-heading">
                  <h2>
                    {t.status === "running" ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <Sparkles size={18} />
                    )}{" "}
                    {t.title}
                  </h2>
                  <Badge
                    status={
                      t.status === "failed" ? "needs-verification" : "preparing"
                    }
                  >
                    {
                      {
                        running: "处理中",
                        failed: "未完成",
                        "waiting-input": "待补充信息",
                        completed: "已完成",
                      }[t.status]
                    }
                  </Badge>
                </div>
                <p className="dim">
                  {data.applications.find((a) => a.id === t.applicationId)
                    ?.company || "通用任务"}{" "}
                  · {new Date(t.createdAt).toLocaleString("zh-CN")}
                  {t.model && ` · ${t.model}`}
                </p>
                {t.error && <p className="error-text">{t.error}</p>}
                {t.agentVersion && <TaskActivity task={t} />}
                {t.status === "running" && t.text && (
                  <details>
                    <summary>查看实时输出</summary>
                    <Markdown text={t.text} />
                  </details>
                )}
                {t.status === "failed" && t.text && (
                  <details>
                    <summary>查看保留的原始输出</summary>
                    <Markdown text={t.text} />
                  </details>
                )}
                <div className="task-buttons">
                  {t.resultRoute && (
                    <Button variant="primary" onClick={() => go(t.resultRoute)}>
                      查看结果
                      <ArrowUpRight size={14} />
                    </Button>
                  )}
                  {t.status === "failed" && !t.agentVersion && (
                    <Button
                      onClick={() =>
                        mutate(`/tasks/${t.id}/retry`, json("POST", {})).catch(
                          () => {},
                        )
                      }
                    >
                      重试
                    </Button>
                  )}
                  {t.status === "running" && t.turnId && !t.agentVersion && (
                    <Button
                      onClick={() =>
                        mutate(
                          `/tasks/${t.id}/interrupt`,
                          json("POST", {}),
                        ).catch(() => {})
                      }
                    >
                      中断任务
                    </Button>
                  )}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <Empty
          icon={Sparkles}
          title="还没有运行过任务"
          description="从能力中心或岗位页发起一个任务。"
        />
      )}
    </>
  );
}

function SettingsPage() {
  const { data, agent, refreshAgent, mutate, notify } = useWorkbench();
  const [url, setURL] = useState(""),
    [follow, setFollow] = useState(true),
    [busy, setBusy] = useState(false),
    [batch, setBatch] = useState(null),
    [mappings, setMappings] = useState([]);
  const connect = async (mode) => {
    setBusy(true);
    try {
      const r = await api("/agent/connect", json("POST", { mode }));
      if (r.url) location.href = r.url;
      else {
        await refreshAgent();
        notify("已连接本机 Codex 的 ChatGPT 账户");
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const preview = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await mutate(
        "/import/preview",
        json("POST", { url, followLinks: follow }),
      );
      setBatch(r);
      setMappings(
        r.documents.map((d) => ({
          sourceId: d.id,
          include: d.kind !== "index",
          kind: d.kind,
          applicationId: "",
        })),
      );
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const selectBatch = (b) => {
    setBatch(b);
    setMappings(
      b.documents.map((d) => ({
        sourceId: d.id,
        include: d.kind !== "index",
        kind: d.kind,
        applicationId: "",
      })),
    );
  };
  const commit = async () => {
    setBusy(true);
    try {
      await mutate(`/import/${batch.id}/commit`, json("POST", { mappings }));
      setBatch(null);
      notify("资料已导入，原始飞书快照已保留");
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="SETTINGS"
        title="设置与资料导入"
        description="连接个人 Agent，把原有积累带进工作台。"
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading">
            <h2>
              <Sparkles size={18} />
              Agent 连接
            </h2>
            <Badge
              status={agent.connected ? "preparing" : "needs-verification"}
            >
              {agent.connected ? "已连接" : "待连接"}
            </Badge>
          </div>
          <div className="connection-info">
            <strong>
              {agent.connected
                ? agent.mode === "codex"
                  ? "本机 Codex · ChatGPT 登录"
                  : "ChatGPT 计划授权"
                : "使用你的 ChatGPT 账户"}
            </strong>
            <p>{agent.account?.email}</p>
            <p className="dim">
              {agent.connected
                ? `当前计划：${agent.account?.plan || "ChatGPT"}。AI 请求使用该连接的计划用量。`
                : "连接后可进行准备、复盘和模拟。普通阅读与关键词检索无需模型。"}
            </p>
            {agent.error && <p className="error-text">{agent.error}</p>}
          </div>
          <div className="connection-buttons">
            <Button
              icon={CheckCheck}
              disabled={busy}
              onClick={() => connect("codex")}
            >
              连接本机 Codex
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => connect("siwc")}
            >
              Continue with ChatGPT
              <ArrowUpRight size={15} />
            </Button>
          </div>
          {agent.limits?.rateLimits?.primary && (
            <div className="usage-info">
              <span>当前用量窗口</span>
              <strong>
                已使用 {agent.limits.rateLimits.primary.usedPercent}%
              </strong>
              <div className="usage-bar">
                <span
                  style={{
                    width: `${Math.min(100, agent.limits.rateLimits.primary.usedPercent)}%`,
                  }}
                />
              </div>
            </div>
          )}
          <a
            className="text-link"
            href="https://chatgpt.com/#settings"
            target="_blank"
            rel="noreferrer"
          >
            查看 ChatGPT 设置与用量
            <ExternalLink size={13} />
          </a>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <h2>
              <Download size={18} />
              本地资料
            </h2>
          </div>
          <p>
            岗位、原始问答和个人资产保存在本机。导入资料保留飞书来源及读取版本。
          </p>
          <div className="data-counts">
            <div>
              <strong>{data.applications.length}</strong>
              <span>岗位流程</span>
            </div>
            <div>
              <strong>{data.reviews.length}</strong>
              <span>复盘</span>
            </div>
            <div>
              <strong>{data.assets.length}</strong>
              <span>个人资产</span>
            </div>
          </div>
          <a className="button" href="/api/export" download>
            <Download size={16} />
            导出文字与结构化数据
          </a>
          <small className="backup-note">
            完整备份需同时保留 .local-data 目录中的附件与数据库。
          </small>
        </section>
      </div>
      <section className="panel settings-panel import-panel">
        <div className="panel-heading">
          <h2>
            <Upload size={18} />
            导入飞书资料
          </h2>
        </div>
        <p>先读取并预览，再选择资料类型和所属岗位。历史内容原样保留。</p>
        <form onSubmit={preview} className="import-form">
          <input
            type="url"
            aria-label="飞书 Hub 链接"
            placeholder="粘贴 PM Interview Hub 或文档链接"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}
            读取预览
          </Button>
        </form>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          跟随入口中登记的文档链接
        </label>
        {data.imports.filter((b) => b.status === "preview").length > 0 &&
          !batch && (
            <div className="saved-previews">
              <span className="dim">已保存的导入预览</span>
              {data.imports
                .filter((b) => b.status === "preview")
                .map((b) => (
                  <Button key={b.id} onClick={() => selectBatch(b)}>
                    {b.documents.length} 份文档 ·{" "}
                    {new Date(b.createdAt).toLocaleDateString("zh-CN")}
                  </Button>
                ))}
            </div>
          )}
        {batch && (
          <div className="import-preview">
            <div className="inline-heading">
              <h3>{batch.documents.length} 份文档</h3>
              <Button variant="primary" disabled={busy} onClick={commit}>
                确认导入所选内容
              </Button>
            </div>
            {batch.errors?.map((e, i) => (
              <p className="error-text" key={i}>
                部分页面读取失败：{e.error}
              </p>
            ))}
            {batch.truncated && (
              <p className="error-text">
                本批次达到读取上限，剩余页面需另开批次。
              </p>
            )}
            <div className="import-table">
              <div className="import-table-head">
                <span>文档</span>
                <span>资料类型</span>
                <span>所属岗位</span>
              </div>
              {batch.documents.map((d, i) => (
                <div className="import-row" key={d.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={mappings[i]?.include || false}
                      onChange={(e) =>
                        setMappings((m) =>
                          m.map((x, j) =>
                            j === i ? { ...x, include: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span>{d.title}</span>
                  </label>
                  <select
                    aria-label={`文档 ${i + 1} 类型`}
                    value={mappings[i]?.kind || d.kind}
                    onChange={(e) =>
                      setMappings((m) =>
                        m.map((x, j) =>
                          j === i ? { ...x, kind: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    {[
                      "index",
                      "process",
                      "prep",
                      "review",
                      "experience",
                      "profile",
                      "learning",
                      "resume",
                      "material",
                    ].map((k) => (
                      <option key={k} value={k}>
                        {kindNames[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`文档 ${i + 1} 所属岗位`}
                    value={mappings[i]?.applicationId || ""}
                    onChange={(e) =>
                      setMappings((m) =>
                        m.map((x, j) =>
                          j === i ? { ...x, applicationId: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="">按流程链接关联</option>
                    {data.applications.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.company}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function SearchModal({ onClose }) {
  const { data, go } = useWorkbench();
  const [q, setQ] = useState(""),
    [results, setResults] = useState([]),
    [job, setJob] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      try {
        setResults(
          await api(
            `/search?${new URLSearchParams({ q, applicationId: job, kind, status })}`,
            { signal: controller.signal },
          ),
        );
      } catch {}
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, job, kind, status]);
  const highlight = (text) => {
    if (!q.trim()) return text;
    const needle = q.trim().split(/\s+/)[0];
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    return index < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, index)}
        <mark>{text.slice(index, index + needle.length)}</mark>
        {text.slice(index + needle.length)}
      </>
    );
  };
  return (
    <Modal
      title="搜索你的面试资料"
      subtitle="关键词检索岗位、实际问答、经历与文字材料"
      wide
      onClose={onClose}
    >
      <div className="search-input">
        <Search size={21} />
        <input
          autoFocus
          aria-label="全局搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例如：公司、指标、平台能力…"
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-filters">
        <select
          aria-label="搜索岗位筛选"
          value={job}
          onChange={(e) => setJob(e.target.value)}
        >
          <option value="">全部岗位</option>
          {data.applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.company}
            </option>
          ))}
        </select>
        <select
          aria-label="搜索类型筛选"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">全部类型</option>
          {["岗位", "问题与复盘", "个人资产", "材料"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <select
          aria-label="搜索状态筛选"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部流程</option>
          <option value="active">进行中</option>
          <option value="closed">已归档</option>
        </select>
      </div>
      <div className="search-results">
        {results.length ? (
          results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                go(r.route);
                onClose();
              }}
            >
              <div>
                <Badge status="waiting-result">{r.kind}</Badge>
                <strong>{highlight(r.title)}</strong>
              </div>
              <p>{highlight(plainText(r.snippet))}</p>
              <small>{r.company}</small>
            </button>
          ))
        ) : (
          <p className="quiet-empty">
            {q
              ? "没有找到匹配内容，试试更短的关键词。"
              : "输入关键词，结果会按资料类型呈现。"}
          </p>
        )}
      </div>
    </Modal>
  );
}
function NewJobModal({ onClose, onCreated }) {
  const { data, mutate, go } = useWorkbench();
  const [form, setForm] = useState({
      company: "",
      role: "",
      batch: "",
      stage: "一面",
      date: "",
      jd: "",
      source: "",
    }),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await mutate(
        "/applications",
        json("POST", { ...form, revision: data.revision }),
      );
      onClose();
      if (onCreated) onCreated(a);
      else go(`/jobs/${a.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="添加一个岗位"
      subtitle="从已经明确的筛选阶段开始"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="公司">
            <input
              autoFocus
              required
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="例如：Sea"
            />
          </Field>
          <Field label="岗位">
            <input
              required
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="例如：产品经理"
            />
          </Field>
          <Field label="批次">
            <input
              value={form.batch}
              onChange={(e) => set("batch", e.target.value)}
            />
          </Field>
          <Field label="当前阶段">
            <select
              value={form.stage}
              onChange={(e) => set("stage", e.target.value)}
            >
              {[
                "笔试",
                "测评",
                "Case",
                "群面",
                "一面",
                "二面",
                "三面",
                "HR 面",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="时间或截止日期（已确认时填写）">
          <input
            type="datetime-local"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </Field>
        <Field label="岗位 JD 或题目">
          <textarea
            value={form.jd}
            onChange={(e) => set("jd", e.target.value)}
            placeholder="可以现在粘贴，也可以创建后补充"
          />
        </Field>
        <Field label="来源">
          <input
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
            placeholder="招聘通知、JD 链接或用户确认"
          />
        </Field>
        <div className="modal-actions">
          <Button onClick={onClose} type="button">
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            创建岗位
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function UploadModal({ onClose, applicationId = "", stageId = "" }) {
  const { data, mutate, notify } = useWorkbench();
  const [job, setJob] = useState(applicationId),
    [stage, setStage] = useState(
      stageId ||
        data.applications.find((a) => a.id === applicationId)?.currentStageId ||
        "",
    ),
    [kind, setKind] = useState("transcript"),
    [mode, setMode] = useState("file"),
    [files, setFiles] = useState([]),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "file") {
        const form = new FormData();
        form.append("applicationId", job);
        form.append("stageId", stage);
        form.append("kind", kind);
        files.forEach((f) => form.append("files", f));
        await mutate("/upload", { method: "POST", body: form });
      } else
        await mutate(
          "/artifacts",
          json("POST", {
            applicationId: job,
            stageId: stage,
            kind,
            title,
            content,
          }),
        );
      notify("材料已保存");
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="添加面试材料"
      subtitle="完整逐字稿用于复盘；录音保留供按需回听"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="所属岗位">
            <JobPicker
              required
              value={job}
              onChange={(id, a) => {
                setJob(id);
                setStage(a?.currentStageId || "");
              }}
            />
          </Field>
          <Field label="所属阶段">
            <select
              required
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">选择阶段</option>
              {data.stages
                .filter((s) => s.applicationId === job)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="文字材料类型">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["transcript", "jd", "resume", "material"].map((k) => (
              <option value={k} key={k}>
                {kindNames[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="segmented upload-mode">
          <button
            type="button"
            className={mode === "file" ? "selected" : ""}
            onClick={() => setMode("file")}
          >
            上传文件
          </button>
          <button
            type="button"
            className={mode === "text" ? "selected" : ""}
            onClick={() => setMode("text")}
          >
            粘贴文字
          </button>
        </div>
        {mode === "file" ? (
          <label className="upload-zone">
            <Upload size={28} />
            <strong>
              {files.length
                ? files.map((f) => f.name).join("、")
                : "选择逐字稿、录音或其他材料"}
            </strong>
            <span>TXT · Markdown · DOCX · SRT · 音频</span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.docx,.srt,.vtt,.mp3,.m4a,.wav,.aac,.ogg,.mp4,.pdf"
              onChange={(e) => setFiles(Array.from(e.target.files))}
            />
          </label>
        ) : (
          <>
            <Field label="材料标题">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="完整正文">
              <textarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
              />
            </Field>
          </>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (mode === "file" && !files.length)}
          >
            {busy ? "保存中…" : "保存材料"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function PracticeModal({ initial, onClose }) {
  const { data, mutate, notify } = useWorkbench();
  const jobs = data.applications.filter((a) => !closed(a.status));
  const [job, setJob] = useState(
    initial.applicationId || (jobs.length === 1 ? jobs[0].id : ""),
  );
  const [busy, setBusy] = useState(false);
  const target = jobs.find((a) => a.id === job);
  const stage = data.stages.find((s) => s.id === target?.currentStageId);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate(
        "/actions",
        json("POST", {
          title: initial.title,
          sourceId: initial.sourceId,
          applicationId: job,
          stageId: stage?.id,
        }),
      );
      notify("已加入目标岗位的当前阶段，保留复盘来源");
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="加入岗位练习"
      subtitle="把这次改进用到正在准备的岗位"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Markdown text={initial.title} />
        <Field label="目标岗位">
          <JobPicker
            required
            activeOnly
            value={job}
            onChange={(id) => setJob(id)}
            emptyLabel="选择进行中的岗位"
          />
        </Field>
        {stage && <p className="dim">加入阶段：{stage.title}</p>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !stage}>
            {busy ? "保存中…" : "加入练习"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function TaskModal({ initial, onClose }) {
  const { data, agent, mutate, go } = useWorkbench();
  const activeJobs = data.applications.filter((a) => !closed(a.status));
  const defaultJob =
    initial.applicationId ||
    (["prep", "mock"].includes(initial.kind) && activeJobs.length === 1
      ? activeJobs[0].id
      : "");
  const [job, setJob] = useState(defaultJob),
    [stage, setStage] = useState(
      initial.stageId ||
        data.applications.find((a) => a.id === defaultJob)?.currentStageId ||
        "",
    ),
    [asset, setAsset] = useState(initial.assetId || ""),
    [materials, setMaterials] = useState(initial.materialIds || []),
    [prompt, setPrompt] = useState(""),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false);
  const kind = initial.kind || "prep";
  const names = {
    prep: "准备当前阶段",
    review: "复盘一场面试",
    mock: "开始模拟面试",
    experience: "继续深挖经历",
    resume: "优化简历",
  };
  const available = [
    ...data.artifacts,
    ...data.reviews.map((r) => ({
      ...r,
      kind: "review",
      content: r.content || JSON.stringify(r.groups),
    })),
  ].filter(
    (a) =>
      (!a.applicationId || a.applicationId === job) &&
      a.kind !== "audio" &&
      a.content,
  );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate(
        "/tasks",
        json("POST", {
          kind,
          applicationId: job,
          stageId: stage,
          assetId: asset,
          materialIds: materials,
          prompt,
          model,
        }),
      );
      onClose();
      go("/tasks");
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={names[kind]}
      subtitle="明确本次上下文，只带入需要的材料"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="所属岗位">
            <JobPicker
              value={job}
              activeOnly={kind === "prep"}
              required={["review", "prep"].includes(kind)}
              emptyLabel="通用任务 / 选择岗位"
              onChange={(id, a) => {
                setJob(id);
                setStage(a?.currentStageId || "");
                setMaterials([]);
              }}
            />
          </Field>
          <Field label="阶段">
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">不绑定阶段</option>
              {data.stages
                .filter((s) => s.applicationId === job)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {["experience", "resume", "prep"].includes(kind) && (
          <Field label="相关经历资产">
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">选择本次相关经历（可选）</option>
              {data.assets
                .filter((a) => ["experience", "resume"].includes(a.kind))
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.title}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="field">
          <span>
            本次材料{kind === "review" ? "（必须包含完整逐字稿）" : ""}
          </span>
          <div className="material-select">
            {available.length ? (
              available.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={materials.includes(a.id)}
                    onChange={(e) =>
                      setMaterials((m) =>
                        e.target.checked
                          ? [...m, a.id]
                          : m.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span>
                    {a.title}
                    <small>{kindNames[a.kind]}</small>
                  </span>
                </label>
              ))
            ) : (
              <p className="quiet-empty">先在岗位页上传或导入文字材料。</p>
            )}
          </div>
        </div>
        <Field label="这次特别想解决什么（可选）">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：重点看指标口径和连续追问中的职责边界"
          />
        </Field>
        <Field label="模型">
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">账户默认模型</option>
            {agent.models?.map((m) => (
              <option value={m.id} key={m.id}>
                {m.displayName || m.id}
              </option>
            ))}
          </select>
        </Field>
        {!agent.connected && (
          <p className="error-text">需要先在设置中连接 ChatGPT 账户。</p>
        )}
        <div className="modal-actions">
          <Button onClick={onClose} type="button">
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={Sparkles}
            disabled={busy || !agent.connected}
          >
            {busy ? "启动中…" : "开始任务"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ProgressModal({ applicationId, onClose }) {
  const { data, mutate, notify } = useWorkbench();
  const app = data.applications.find((a) => a.id === applicationId);
  const [form, setForm] = useState({
      stageId: app.currentStageId,
      type: "",
      occurredAt: new Date().toLocaleDateString("en-CA"),
      source: "",
      nextStage: "",
      date: "",
      nextAction: "",
    }),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate(
        `/applications/${applicationId}/progress`,
        json("POST", {
          ...form,
          ...(!form.nextAction ? { nextAction: undefined } : {}),
          revision: data.revision,
        }),
      );
      notify("岗位、阶段和已有复盘结果已同步更新");
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="更新岗位进度" subtitle={jobLabel(app)} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="本次通知对应的阶段">
            <select
              value={form.stageId}
              onChange={(e) => set("stageId", e.target.value)}
            >
              {data.stages
                .filter((s) => s.applicationId === applicationId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="发生了什么">
            <select
              value={form.type}
              required
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="" disabled>
                选择这次实际收到的通知
              </option>
              {[
                ["scheduled", "已确认安排"],
                ["rescheduled", "安排变化"],
                ["completed", "本阶段已结束 / 已提交"],
                ["advanced", "通过，进入下一阶段"],
                ["failed", "明确未通过"],
                ["withdrawn", "主动退出"],
                ["cancelled", "岗位取消"],
                ["reopened", "重新联系"],
              ].map(([k, n]) => (
                <option value={k} key={k}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="实际发生日期">
          <input
            type="date"
            required
            value={form.occurredAt}
            onChange={(e) => set("occurredAt", e.target.value)}
          />
        </Field>
        {form.type === "advanced" && (
          <Field label="下一阶段">
            <input
              required
              value={form.nextStage}
              onChange={(e) => set("nextStage", e.target.value)}
            />
          </Field>
        )}
        {["advanced", "scheduled", "rescheduled", "reopened"].includes(
          form.type,
        ) && (
          <Field label="面试时间或截止日期（已确认时填写）">
            <input
              type="datetime-local"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
        )}
        <Field label="通知来源或确认依据">
          <textarea
            required
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
            placeholder="例如：HR 今天通知一面通过；二面时间待定"
          />
        </Field>
        <Field label="下一步（可选）">
          <input
            value={form.nextAction}
            onChange={(e) => set("nextAction", e.target.value)}
            placeholder="留空时根据此次进度生成最小行动"
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            保存进度
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function NewAssetModal({ onClose }) {
  const { mutate, go } = useWorkbench();
  const [form, setForm] = useState({
      title: "",
      kind: "experience",
      content: "",
      source: "用户本人确认",
    }),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await mutate("/assets", json("POST", form));
      onClose();
      go(`/assets/${a.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="添加个人资产"
      subtitle="保留可以跨岗位复用的真实事实与答案"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field label="标题">
          <input
            required
            autoFocus
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="类型">
          <select
            value={form.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            {["experience", "profile", "resume", "learning"].map((k) => (
              <option value={k} key={k}>
                {kindNames[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="正文">
          <textarea
            required
            rows={9}
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
          />
        </Field>
        <Field label="事实来源">
          <input
            required
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            保存
          </Button>
        </div>
      </form>
    </Modal>
  );
}

createRoot(document.getElementById("root")).render(<App />);
