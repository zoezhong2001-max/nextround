import express from "express";
import { readRebuild, editRebuild } from "./rebuild-edits.mjs";
import { memoryContext } from "./memory.mjs";
import { acceptExperienceDraft } from "./experience-drafts.mjs";
import multer from "multer";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Store, id, now } from "./store.mjs";
import {
  createApplication,
  updateProgress,
  addPractice,
  searchSnapshot,
  required,
} from "./domain.mjs";
import { CodexBridge } from "./agent.mjs";
import { ChatGPTAuth } from "./auth.mjs";
import { TaskRunner } from "./tasks.mjs";
import { previewImport, commitImport } from "./importer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(process.env.PM_DATA_DIR || join(root, ".local-data"));
const port = Number(process.env.PORT || 4317);
const store = new Store(directory),
  auth = new ChatGPTAuth(directory, port);
const exec = promisify(execFile);
await mkdir(join(directory, "attachments"), { recursive: true, mode: 0o700 });
for (const task of store.list("tasks").filter((t) => t.status === "running"))
  store.transaction(() =>
    store.put("tasks", {
      ...task,
      status: "failed",
      error: "应用重启，任务未完成；材料已保留，可重试",
    }),
  );
let bridge, bridgeToken;
async function getBridge(mode = store.setting("agentMode") || "codex") {
  const token = mode === "siwc" ? await auth.token() : null;
  if (!bridge || bridge.mode !== mode || token !== bridgeToken) {
    bridge?.stop();
    bridge = new CodexBridge({ directory, mode, accessToken: token });
    bridgeToken = token;
  }
  await bridge.start();
  return bridge;
}
const runner = new TaskRunner({
  store,
  getBridge,
  skillRoot:
    process.env.PM_SKILL_DIR ||
    (existsSync(resolve(root, "skills/pm-interview/SKILL.md"))
      ? resolve(root, "skills/pm-interview")
      : existsSync(resolve(root, "../pm-interview-skill/SKILL.md"))
        ? resolve(root, "../pm-interview-skill")
        : join(homedir(), ".codex/skills/pm-interview")),
});
const app = express();
app.use((req, res, next) => {
  const host = req.headers.host?.split(":")[0];
  if (!["127.0.0.1", "localhost"].includes(host))
    return res.status(403).json({ error: "工作台仅接受本机访问" });
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)
    )
      return res.status(403).json({ error: "请求来源不匹配" });
    if (req.headers["x-workbench"] !== "1")
      return res.status(403).json({ error: "请求缺少工作台标识" });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "15mb" }));
app.get("/api/state", (_, res) => res.json(store.snapshot()));
app.get('/api/memory', (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.json(memoryContext(store,req.query));
});
app.get("/api/rebuild", async (_, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(readRebuild(store));
  } catch {
    res.status(404).json({ error: "改版资料尚未就绪" });
  }
});
app.get("/api/rebuild/sources/:id", async (req, res) => {
  try {
    const dossier = readRebuild(store);
    const source = dossier.sources.find((s) => s.id === req.params.id);
    if (!source || !/^[a-f0-9]{12}\.txt$/.test(source.textFile))
      return res.status(404).json({ error: "来源不存在" });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      content: await readFile(
        join(directory, "rebuild-2026-10", source.textFile),
        "utf8",
      ),
    });
  } catch {
    res.status(404).json({ error: "来源读取失败" });
  }
});
app.patch("/api/rebuild", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(editRebuild(store, req.body));
});
app.get('/api/search', (req,res) => {
  const legacy = searchSnapshot(store.snapshot(), req.query.q || '', req.query);
  const current = req.query.q && !req.query.kind && !req.query.status && !req.query.applicationId ? memoryContext(store, {q:req.query.q}).results : [];
  res.setHeader('Cache-Control','no-store');
  res.json([...current.map(r => ({id:r.id,title:r.title,kind:r.kind,snippet:r.text.slice(0,180),route:r.route})), ...legacy].slice(0,100));
});
app.post("/api/applications", (req, res) =>
  res.json(
    store.transaction(
      () => createApplication(store, req.body),
      req.body.revision,
    ),
  ),
);
app.post("/api/applications/:id/progress", (req, res) =>
  res.json(
    store.transaction(
      () => updateProgress(store, req.params.id, req.body),
      req.body.revision,
    ),
  ),
);
app.patch("/api/applications/:id", (req, res) =>
  res.json(
    store.transaction(() => {
      const a = store.get("applications", req.params.id);
      if (!a) throw Object.assign(new Error("岗位不存在"), { status: 404 });
      const patch = {};
      for (const field of ["company", "role", "nextAction", "batch"])
        if (req.body[field] !== undefined)
          patch[field] = required(req.body[field], field, 3000);
      return store.put("applications", { ...a, ...patch, updatedAt: now() });
    }, req.body.revision),
  ),
);
app.post("/api/actions", (req, res) =>
  res.json(
    store.transaction(() => addPractice(store, req.body), req.body.revision),
  ),
);
app.patch("/api/actions/:id", (req, res) =>
  res.json(
    store.transaction(() => {
      const action = store.get("actions", req.params.id);
      if (!action)
        throw Object.assign(new Error("行动不存在"), { status: 404 });
      return store.put("actions", { ...action, done: !!req.body.done });
    }),
  ),
);
app.post("/api/artifacts", (req, res) =>
  res.json(
    store.transaction(() => {
      const a = req.body;
      if (a.applicationId && !store.get("applications", a.applicationId))
        throw new Error("岗位不存在");
      const stage = a.stageId ? store.get("stages", a.stageId) : null;
      if (a.stageId && (!stage || stage.applicationId !== a.applicationId))
        throw new Error("阶段不匹配");
      return store.put("artifacts", {
        id: id(),
        title: required(a.title, "标题"),
        content: required(a.content, "正文", 1000000),
        kind: a.kind || "material",
        applicationId: a.applicationId || "",
        stageId: a.stageId || "",
        source: a.source || "用户输入",
        createdAt: now(),
        status: "draft",
      });
    }),
  ),
);
app.patch("/api/artifacts/:id", (req, res) =>
  res.json(
    store.transaction(() => {
      const a = store.get("artifacts", req.params.id);
      if (!a) throw new Error("材料不存在");
      if (
        a.kind === "transcript" ||
        a.imported ||
        a.frozen ||
        store.get("stages", a.stageId)?.frozen
      )
        throw Object.assign(
          new Error("原始材料或已冻结版本不能覆盖，请保存新版本"),
          { status: 409 },
        );
      return store.put("artifacts", {
        ...a,
        content: required(req.body.content, "正文", 1000000),
        updatedAt: now(),
      });
    }, req.body.revision),
  ),
);
app.post("/api/artifacts/:id/version", (req, res) =>
  res.json(
    store.transaction(() => {
      const a = store.get("artifacts", req.params.id);
      if (!a) throw new Error("材料不存在");
      return store.put("artifacts", {
        ...a,
        id: id(),
        imported: false,
        originalContent: undefined,
        sourceId: undefined,
        frozen: false,
        title: `${a.title} · 新版本`,
        content: required(req.body.content, "正文", 1000000),
        supersedes: a.id,
        source: a.source,
        createdAt: now(),
        status: "draft",
        kind: a.kind === "transcript" ? "material" : a.kind,
      });
    }),
  ),
);
app.post("/api/artifacts/:id/accept-experience", (req, res) =>
  res.json(
    store.transaction(
      () => acceptExperienceDraft(store, req.params.id, req.body),
      req.body.revision,
    ),
  ),
);
app.post("/api/assets", (req, res) =>
  res.json(
    store.transaction(() =>
      store.put("assets", {
        id: id(),
        title: required(req.body.title, "标题"),
        content: required(req.body.content, "正文", 1000000),
        kind: req.body.kind || "experience",
        source: required(req.body.source || "用户确认", "来源", 3000),
        createdAt: now(),
        confirmedAt: now(),
        versions: [],
      }),
    ),
  ),
);
app.patch("/api/assets/:id", (req, res) =>
  res.json(
    store.transaction(() => {
      const a = store.get("assets", req.params.id);
      if (!a) throw new Error("资产不存在");
      return store.put("assets", {
        ...a,
        content: required(req.body.content, "正文", 1000000),
        confirmedAt: now(),
        updatedAt: now(),
        source: required(req.body.source, "本次确认来源", 3000),
        versions: [
          ...(a.versions || []),
          { content: a.content, source: a.source, savedAt: now() },
        ],
      });
    }, req.body.revision),
  ),
);
const upload = multer({
  storage: multer.diskStorage({
    destination: join(directory, "attachments"),
    filename: (_, file, cb) =>
      cb(null, id() + extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 512 * 1024 * 1024, files: 10 },
});
app.post("/api/upload", upload.array("files", 10), async (req, res) => {
  const appId = req.body.applicationId || "",
    stageId = req.body.stageId || "";
  if (appId && !store.get("applications", appId)) throw new Error("岗位不存在");
  if (stageId && store.get("stages", stageId)?.applicationId !== appId)
    throw new Error("阶段不匹配");
  const files = [];
  for (const file of req.files || []) {
    const extension = extname(file.filename);
    let content = "";
    if ([".md", ".txt", ".srt", ".vtt", ".csv"].includes(extension))
      content = await readFile(file.path, "utf8");
    if (extension === ".docx") {
      try {
        const { stdout } = await exec(
          "textutil",
          ["-convert", "txt", "-stdout", file.path],
          { maxBuffer: 20 * 1024 * 1024 },
        );
        content = stdout;
      } catch {
        content = "";
      }
    }
    const original = Buffer.from(file.originalname, "latin1").toString("utf8");
    const kind = [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".mp4"].includes(
      extension,
    )
      ? "audio"
      : req.body.kind || "transcript";
    files.push({
      id: id(),
      title: original,
      kind,
      applicationId: appId,
      stageId,
      content,
      file: file.filename,
      mime: file.mimetype,
      size: file.size,
      source: "用户上传原文件",
      createdAt: now(),
      frozen: true,
    });
  }
  store.transaction(() => files.forEach((f) => store.put("artifacts", f)));
  res.json(files);
});
app.get("/api/files/:id", async (req, res) => {
  const f = store.get("artifacts", req.params.id);
  if (!f?.file) return res.status(404).end();
  const file = join(directory, "attachments", f.file);
  if (!existsSync(file)) return res.status(404).end();
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(f.title)}`,
  );
  res.type(f.mime || "application/octet-stream");
  res.sendFile(file);
});
app.get("/api/agent/status", async (_, res) => {
  try {
    const b = await getBridge();
    const account = await b.account();
    let limits = null;
    if (account.type === "chatgpt")
      try {
        limits = await b.request("account/rateLimits/read");
      } catch {}
    const connected = ["chatgpt", "chatgptAuthTokens", "siwc"].includes(
      account.type,
    );
    res.json({
      connected,
      mode: b.mode,
      account,
      limits,
      models: connected ? await b.models() : [],
      error: connected ? "" : "请连接 ChatGPT 账户",
    });
  } catch (e) {
    res.json({
      connected: false,
      error: e.message,
      mode: store.setting("agentMode") || "codex",
      models: [],
    });
  }
});
app.post("/api/agent/connect", async (req, res) => {
  if (runner.running) throw new Error("任务运行中，完成后再切换连接");
  if (req.body.mode === "siwc") return res.json(await auth.begin());
  if (req.body.mode !== "codex") throw new Error("无效连接方式");
  const b = await getBridge("codex");
  const account = await b.account();
  if (account.type !== "chatgpt")
    throw new Error(
      "本机 Codex 尚未通过 ChatGPT 登录，请先在终端运行 codex login",
    );
  store.setting("agentMode", "codex");
  res.json({ connected: true, account });
});
app.get("/auth/callback", async (req, res) => {
  try {
    await auth.exchange(new URLSearchParams(req.url.split("?")[1] || ""));
    store.setting("agentMode", "siwc");
    bridge?.stop();
    bridge = null;
    res.redirect("/settings?connected=1");
  } catch (e) {
    res.status(400).type("text/plain").send(e.message);
  }
});
app.post("/api/tasks", async (req, res) =>
  res.json(await runner.start(req.body)),
);
app.post("/api/tasks/:id/retry", async (req, res) => {
  res.json(await runner.retry(req.params.id));
});
app.post("/api/tasks/:id/continue", async (req, res) => {
  res.json(await runner.retry(req.params.id, req.body));
});
app.post("/api/tasks/:id/interrupt", async (req, res) => {
  await runner.interrupt(req.params.id);
  res.json({ ok: true });
});
app.post("/api/import/preview", async (req, res) =>
  res.json(
    await previewImport(store, directory, req.body.url, {
      followLinks: !!req.body.followLinks,
      maxDocuments: 60,
    }),
  ),
);
app.post("/api/import/:id/commit", (req, res) =>
  res.json(
    store.transaction(() =>
      commitImport(store, req.params.id, req.body.mappings),
    ),
  ),
);
app.get("/api/export", (_, res) => {
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="pm-interview-backup.json"',
  );
  res.json({ version: 1, exportedAt: now(), ...store.snapshot() });
});
app.get("/api/health", (_, res) => res.json({ ok: true, version: "0.1.0" }));
app.use("/api", (_, res) => res.status(404).json({ error: "接口不存在" }));
if (process.argv.includes("--production")) {
  if (!existsSync(join(root, "dist", "index.html")))
    throw new Error("请先运行 npm run build");
  app.use(express.static(join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(join(root, "dist", "index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((error, _, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 400).json({ error: error.message || "请求失败" });
});
const server = app.listen(port, "127.0.0.1", (error) => {
  if (error) {
    console.error(
      `工作台启动失败：${error.code === "EADDRINUSE" ? `${port} 端口已被占用` : error.message}`,
    );
    store.close();
    process.exitCode = 1;
    return;
  }
  console.log(`PM Interview Workbench → http://127.0.0.1:${port}`);
});
function shutdown() {
  bridge?.stop();
  server.close();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
