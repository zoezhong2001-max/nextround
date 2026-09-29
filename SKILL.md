---
name: pm-interview
description: >-
  帮助用户进行产品经理求职，包括简历优化、笔试与测评准备、定向面试准备、模拟面试、单场复盘和流程归档。
  Use only when the request clearly concerns product-management recruiting or interviews; do not trigger for generic reviews or resumes outside that context.
---

# PM Interview

把本 skill 当作公开、可复用的规则层。个人背景、真实简历、公司流程、面试记录与复盘必须保存在用户授权的私有知识库中，不得写入本 skill 或其 GitHub 仓库。

## Skill 维护与版本检查

只在用户要求维护、发布或检查本 skill，或有明确迹象表明安装版本过期时，对账远端、发布仓库和安装版本。普通面试准备、复盘和进度更新不获取远端引用，不让仓库维护增加任务耗时。

维护本 skill 后，若用户已经授权长期同步该仓库，则依次完成结构校验、隐私检查、人工 diff 复核、提交并推送；没有授权或检查失败时保留本地变更并明确说明未推送。

## 开始工作

1. 按 [user-journeys.md](references/user-journeys.md) 先判断用户当前发生的求职事件。用户只通知进入笔试、测评、Case、群面、面试、改期、通过、未通过或转推时，将其视为纯进度更新，直接按 [progress-update-routing.md](references/progress-update-routing.md) 完成状态闭环，不自动扩展为复盘或下一阶段准备。需要决定页面产出时读取 [task-output-contract.md](references/task-output-contract.md)。
2. 定位私有知识库，并按 [private-store-contract.md](references/private-store-contract.md) 只读取完成该用户旅程所需的最少材料。首次使用且已经进入明确招聘流程时，只建立完成当前筛选阶段所需的最小个人档案，然后在同一任务中继续准备，不先做全量建档。
3. 根据旅程组合加载对应能力模块：
   - 简历或经历整理：[resume.md](references/resume.md)
   - 系统整理实习/项目或修复经历深挖口径：[experience-cards.md](references/experience-cards.md)
   - 用户要求 grill、拷打或分轮深挖经历：[grill-mode.md](references/grill-mode.md)，并结合已安装的 `grilling` skill
   - 笔试、测评、Case、群面或面试准备，以及模拟：[interview-prep.md](references/interview-prep.md)
   - 面试复盘、状态更新或归档：[review-and-archive.md](references/review-and-archive.md)
   - 收到约面、改期、结果、转推等流程进度时：[progress-update-routing.md](references/progress-update-routing.md)
   - 判断产出写到哪里：[knowledge-routing.md](references/knowledge-routing.md)
   - 在 Codex 项目内长期协作或拆分对话：[project-workspace.md](references/project-workspace.md)
   - 只校准既有私有知识库的格式与结构：[format-calibration.md](references/format-calibration.md)
4. 用户提交面试材料并要求复盘时，默认完成复盘、必要的经历修复、状态更新，以及有实际准备内容时的下一阶段准备。纯进度通知和用户明确限定的单项任务只完成其范围；没有实质内容的页面或板块不创建。
5. 将个人化产出增量写回已选定的唯一私有知识库。一次任务可以更新多个页面，但 Review、Stage Prep、Experience Card 和 Process 仍保持分离；不为追求“一次完成”而合并成一篇大文档。

## 私有知识库边界

- 优先使用用户已经选定的长期工作区；可以是当前 Codex 项目，也可以是已经连接且获得授权的文档工具。选定后不得另建平行 Hub，除非用户明确要求迁移或切换。
- 首次使用时定位唯一的 `PM Interview Hub`。找不到时请用户提供入口；找到多个时请用户选择，禁止猜测。
- 只跟随 Hub 中登记的链接，不把私人文档 ID、URL、访问令牌或账号配置写进公开仓库。
- 读取个人事实时保留来源和不确定性。不得把推断改写为已确认事实，不得虚构指标、职责或面试反馈。
- 原始面试记录保持可追溯；结构化复盘和标准答案是派生产物，不能覆盖原始材料。
- 文档以链接和摘要衔接，不在 Process、Review 和 Experience Card 之间复制同一份长文；Process 只保留岗位当前事实、流程状态和索引。
- 简历、自我介绍、经历问答等包含数字、日期、职责边界或流程状态的产出，生成前必须读取最新事实源；不得仅凭旧对话或旧草稿复用。

## 内部规则与用户文档

- Skill 保存“怎么读、怎么路由、怎么更新、怎么验收”；飞书只保存用户真正需要查看和行动的内容。
- 默认不把工作流、维护说明、Skill 测试记录、验收标准、迁移说明、路由清单、写回检查项或内部状态码写入 Hub、Current Plan、Process、Stage Prep 或 Review 正文。
- `confirmed`、`inferred`、`needs-verification`、`state-check-needed` 和内部流程状态可用于判断，但面向用户默认改写为自然中文；只在不确定性会影响决策时显示“待确认”及原因。
- 用户文档优先回答四件事：当前是什么、依据是什么、结论或差距是什么、下一步做什么。

## 核心路由

| 内容 | 私有知识库位置 | 规则 |
|---|---|---|
| 个人背景与跨文档高风险事实索引 | Profile | 保存任职、职责、数字等已确认口径及对应 Experience Card 来源 |
| 当前求职目标、节奏和底线 | Current Plan | 时效信息，不进入公开规则 |
| 某段经历的跨公司深挖答案 | Experience Cards | 可在不同流程中复用 |
| 某公司、某岗位的当前事实、状态与索引 | Processes | 一个公司与岗位对应一个轻量流程页 |
| 单场面试的原始记录与复盘 | Interview Reviews | 一场一页，链接回流程 |
| 跨流程但仍与用户相关的教训 | Reusable Learnings | 私有沉淀，不等于公开规则 |
| 已冻结简历和投递版本 | Resumes | 保留目标岗位、日期和来源 |
| 候选通用方法 | Rule Promotion Queue | 脱敏、验证后才可进入 GitHub |

## 用户旅程

顶层只按真实求职事件路由：

- 首次使用与最小建档。
- 已进入笔试、测评、Case、群面、面试等明确筛选阶段，开始新岗位准备。
- 一个筛选阶段结束，流程继续或结果待定。
- 流程未通过、主动退出或被取消。
- 收到 Offer，需要比较、补充信息或做决策。
- 求职季结束，需要整体归档与长期沉淀。
- 面试暴露某段经历不够深，需要沿真实追问修复 Experience Card。
- 用户明确只需要某个单项任务。

具体识别信号、输入、模块组合、状态分支和完成条件见 [user-journeys.md](references/user-journeys.md)。

## 规则主定义

- 页面是否创建或更新：[task-output-contract.md](references/task-output-contract.md)。
- 事实、答案和教训归属：[knowledge-routing.md](references/knowledge-routing.md)。
- 流程状态、事件去重和页面字段更新：[progress-update-routing.md](references/progress-update-routing.md)。
- 页面更新语义、读取预算和写入验收：[private-store-contract.md](references/private-store-contract.md)。

其他文件只描述场景如何使用这些规则；发生冲突时以上述主定义为准。

## 公开规则晋升门

把私有教训发布到 GitHub 前，必须同时满足：

1. 用户明确确认它具有通用价值，或它已在至少两个独立场景中得到验证。
2. 删除个人、学校、公司、岗位批次、日期、内部指标、原话和文档链接等识别信息。
3. 将经历描述改写为可执行的判断规则、模板或检查项。
4. 运行隐私检查并人工复核变更。
5. 获得用户对本次公开发布的授权；日常复盘不得自动推送 GitHub。

## 公开仓库维护

- 重要更新包括：改变核心路由、隐私边界、状态模型、产出模板或质量门的规则变更；个人记录增长不属于公开仓库更新。
- 仓库已配置 GitHub remote 且用户已授权同步时，重要更新在结构校验、隐私检查和人工 diff 复核全部通过后提交并推送。
- 仅修改措辞、排版或私有知识库内容时，不要求发布新版本。
- 推送失败、远端存在冲突或检查不通过时停止，不强制覆盖远端。

## 通用质量规则

- 默认使用中文；用户、JD 或面试语境要求英文时切换。
- 持续核对职责边界、数字口径、时间和状态；无法确认时明确标注待核实。
- 简历、自我介绍、经历题卡和公司定制答案必须与 Profile 一致。
- 量化不是编数字：没有可靠数据时，使用真实交付物、范围和验证状态。
- 提醒用户避免披露前公司机密、个人隐私和受限数据。
- 模拟面试一次只问一题；除非用户要求即时反馈，否则结束后统一点评。
- 多个 Codex 对话之间不假设自动共享聊天上下文；跨对话事实和状态必须先写入共同的 Hub、Profile、Current Plan 或 Process，再被其他对话复用。
- 先读 Process 的当前摘要和索引，再只跟随完成当前任务必需的链接；不默认读取全部历史准备、复盘或完整逐字稿。
- 准备与复盘在私有知识库中使用稳定板块和链接，按 [private-store-contract.md](references/private-store-contract.md) 的写入验收核对；没有实质内容的可选板块直接省略，只有缺失本身会影响判断时才自然地写“待确认”，不要用大量“未获取/不适用”占位。
