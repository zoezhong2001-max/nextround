# NextRound 工作台架构

NextRound 是本地优先（local-first）的单用户求职 Agent 工作台。整体思路：**对话与执行由外部 Agent 宿主承担，工作台负责资料与成果的归属、结构化呈现、编辑、版本、来源与执行状态**。工作台自己不内置聊天窗口，不重复建设一套 Agent 运行时。

## 分层

```
┌─────────────────────────────────────────────────────┐
│ Agent 宿主（Codex / 其他兼容 app-server 协议的客户端） │
│  · 用户在这里表达目标、讨论、确认                       │
│  · 通过动态工具协议调用工作台能力                       │
└──────────────┬──────────────────────────────────────┘
               │ JSON-RPC（thread/start 注册动态工具，
               │ item/tool/call 按线程路由）
┌──────────────▼──────────────────────────────────────┐
│ NextRound 服务（Express，只监听 127.0.0.1）            │
│  ├─ agent.mjs        CodexBridge / SIWC 认证          │
│  ├─ tasks.mjs        TaskRunner：任务、步骤、恢复       │
│  ├─ workbench-tools  受约束的内部工具（read/rules/      │
│  │                   progress/save_review/…）          │
│  ├─ domain.mjs       岗位、阶段、进度事件、复盘领域逻辑   │
│  ├─ importer.mjs     外部文档只读导入（快照 + 映射预览）  │
│  ├─ memory.mjs       Agent 记忆检索（最小上下文读取）     │
│  ├─ rebuild-edits    人工编辑日志叠加、revision、迁移     │
│  └─ store.mjs        SQLite 存储与事务                  │
├─────────────────────────────────────────────────────┤
│ 前端（React SPA，Vite 构建）                            │
│  仪表盘 · 岗位流程 · 面试复盘 · 个人资产                  │
├─────────────────────────────────────────────────────┤
│ 私有数据区 .local-data/（git 忽略）                     │
│  SQLite · 原始附件 · 导入快照 · 凭据（0600）            │
└─────────────────────────────────────────────────────┘
```

## 关键设计

### 1. 回环绑定与请求校验

服务只监听 `127.0.0.1`，并逐请求校验 Host、Origin 与自定义工作台标识头（`x-workbench`），防止本机其他网页跨站调用。无云端服务、无多用户。

### 2. 受约束的内部工具，而不是自由读写

Agent 不能任意访问数据库，只能通过一组显式工具，在参数校验、岗位绑定、版本检查后读写：

- `context` / `bind`：读取岗位目录；从用户明确提及的唯一岗位绑定会话，歧义时要求选择。
- `read`：分页读取资料，记录内容指纹与读取范围。
- `rules`：按需读取领域 skill 的能力模块（不把整套规则塞进每轮对话）。
- `progress`：以用户原话为依据的事务式进度更新；推测不能当成已确认结果，旧阶段不能回退当前阶段。
- `save_review` / `save_document` / `add_practice`：保存复盘、准备稿、练习；同场复盘复用已有页，不覆盖历史原话。
- `need_input`：缺少决定性信息时保存一个问题，用户补充后原任务续做。

工具写入与任务步骤回执处于**同一 SQLite 事务**：要么一起成功，要么一起回滚，不存在「成果存了但任务记录丢失」的中间态。

### 3. 任务生命周期与恢复

任务状态：`running / waiting-input / completed / failed`。

- 失败保留已完成步骤与成果，续做不重复创建阶段或成果（重试按任务去重）。
- 停止只阻止后续写入，已提交结果保留。
- 服务重启将运行中任务标记为未完成，可恢复。

### 4. 领域能力的可替换性

业务规则（怎么复盘、怎么准备、事实边界是什么）不在工作台代码里硬编码，而是来自 `skills/` 下可替换的领域 skill。首个实现是 [`skills/pm-interview`](../skills/pm-interview/SKILL.md)（产品经理求职）。服务端按任务类型把 skill 的能力模块映射进指令（`skillInstructions(skillRoot, capability)`），换岗位方向时替换 skill 即可，工作台机制不变。

### 5. 导入是只读快照

外部文档（如飞书 Hub）导入只读快照、展示映射预览、按来源去重、原始版本保留；导入不回写来源，也不重新生成历史任务。历史问答只有摘要时明确标记为摘要，不假称逐字回答。

## 目录

```
server/     Express 服务、任务执行、领域逻辑、存储
src/        React 前端（仪表盘、岗位、复盘、资产四区）
skills/     可替换领域 skill（当前：pm-interview）
shared/     跨端共享逻辑
scripts/    导入、记忆读取、Agent 连接检查
tests/      node:test 单元与事务测试
docs/       架构、memory 机制、产品原则、Agent 工作流
```

## 运行

```sh
npm install
npm run dev        # http://127.0.0.1:4317
npm test           # 单元测试
npm run build      # 前端构建
```

环境变量：`PORT`、`PM_DATA_DIR`（私有数据目录）、`PM_SKILL_DIR`（领域 skill 目录，默认依次尝试仓库内 `skills/pm-interview`、相邻目录、`~/.codex/skills/pm-interview`）。
