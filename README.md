# NextRound · 下一程

本地优先的求职 Agent 工作台：以岗位与阶段为主线，连接面试准备、逐题复盘、经历深挖与个人资产。

> 2.0：本项目由 [pm-interview](https://github.com/zoezhong2001-max/pm-interview)（产品经理求职 skill，规则层）演进而来——从「一套领域规则」升级为「规则 + 工作台 + Agent 执行」的完整形态。skill 本身保留在 [`skills/pm-interview`](skills/pm-interview/SKILL.md)，作为可替换的领域能力继续独立演进。

## 是什么

求职准备的真实痛点不是缺模板，而是：资料散落在十几个文档里、面试复盘写完就沉底、上一场的教训带不到下一场、AI 生成的内容和人工修改互相覆盖。

NextRound 的做法是把分工拆干净：

- **Agent 宿主**（如 Codex，或其他兼容 app-server 协议的客户端）负责对话与执行——用户表达目标，Agent 读资料、分析、产出；
- **工作台**（本仓库）负责归属与可信——资料与成果的结构化呈现、编辑、版本、来源、执行状态；
- **领域 skill**（`skills/`）负责方法——怎么复盘、怎么准备、事实边界在哪，不硬编码在工作台里；
- **私有数据区**（`.local-data/`，git 忽略）保存全部个人记录，公开仓库不含任何私人内容。

## 核心设计

| 设计 | 文档 |
|---|---|
| 分层架构：回环绑定的 Express 服务 + React 四区工作台 + 受约束内部工具 + 事务写入 | [docs/architecture.md](docs/architecture.md) |
| Agent memory 机制：基础文档 + 人工编辑日志叠加、可编辑性白名单、revision 过期检测、事实分级 | [docs/agent-memory.md](docs/agent-memory.md) |
| 产品原则：Agent/工作台/skill 的职责边界与协作约定 | [docs/product-principles.md](docs/product-principles.md) |
| Agent 工作流：动态工具协议、任务生命周期、失败续做、人工确认语义 | [docs/agent-workflow.md](docs/agent-workflow.md) |

三个最值得展开的设计决策：

1. **工作台不内置聊天。** 对话与执行交给专业 Agent 宿主，工作台专注把「成果」做成可查看、可修改、可追溯、可继续迭代的一等对象，而不是又一条聊天记录。
2. **人工编辑以日志叠加，永不覆盖。** 用户的每次修改是追加在基础文档之上的编辑记录（含 before/after），Agent 重新生成内容时人工修改天然保留；原始逐字稿与实际问答对人和 Agent 都不可改写。
3. **事实分级，拒绝编造。** 每条档案事实带来源与核实状态（材料记载 / 本人确认 / 待验证）；历史面试原话只证明当时表达，不自动升级为事实；量化没有来源时明确标待核实。

## 快速开始

需要 Node.js 24+。

```sh
npm install
npm run dev        # 打开 http://127.0.0.1:4317（只监听回环地址）
npm test           # 单元与事务测试
npm run build      # 前端构建
```

可选环境变量：`PORT`、`PM_DATA_DIR`（私有数据目录）、`PM_SKILL_DIR`（领域 skill 目录，默认使用仓库内 `skills/pm-interview`）。

Agent 连接与验证方式见 [docs/agent-workflow.md](docs/agent-workflow.md)。

## 致谢

本项目的组织方式参考了 [ZJU-REAL/Easel](https://github.com/ZJU-REAL/Easel)（画像驱动 + 可执行 skill + Web 工作台的分层思路），在此致谢。

## License

[MIT](LICENSE)
