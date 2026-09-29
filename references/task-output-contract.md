# 任务页面产出契约

在用户旅程确定后读取本文件，用来决定本次任务应新建、更新或不应生成哪些页面。表中的“必须”是完成该事件的最小闭环，不代表必须重写整页；已有页面应增量更新。

任务包含流程进度变化时，同时按 [progress-update-routing.md](progress-update-routing.md) 更新状态、轮次、结果和下一步。

先判断输入强度：只有进度消息时使用“纯进度通知”行；用户同时提供面试材料或明确要求复盘/准备时，才使用后续完整旅程行。

## 旅程到页面

| 用户事件 | 必须新建或更新 | 满足条件才输出 | 默认不输出 |
|---|---|---|---|
| 纯进度通知 | Process、Current Plan；已有对应 Review 时按事件补结果 | 用户同时要求复盘/准备，或提供的材料足以支撑对应产出时，进入相关旅程 | 新 Review、Experience Card、Reusable Learning 或 Stage Prep |
| 首次使用且已进入明确筛选阶段 | 最小 Profile、Current Plan 当前行、Process、当前 Stage Prep | 核心经历口径不足时建或修 Experience Card；用户要定向简历或事实需要修正时生成 Resume Version | 全量个人档案、无关经历卡、Review、Reusable Learning |
| 已有档案，准备笔试／测评／Case／群面／首轮面试 | Process、Current Plan 当前行、当前 Stage Prep | Experience Card、Resume Version；用户明确要求时单独生成自我介绍或模拟记录 | Review、结案内容 |
| 互动面试结束，结果待定 | 本轮 Interview Review、Process、Current Plan 当前行 | 暴露稳定经历缺口时更新 Experience Card；跨流程规律已成立时更新 Reusable Learning | 正式下一阶段 Stage Prep、结案内容 |
| 互动面试结束，已进入下一阶段 | 本轮 Interview Review、Process、Current Plan 当前行 | 有可执行准备内容或用户同时要求准备时生成下一阶段 Stage Prep；必要时更新 Experience Card、Reusable Learning 或 Resume Version | 空的下一阶段准备页；把复盘和下一阶段准备合并成同一页 |
| 笔试／测评／Case 已提交或出结果 | Process、Current Plan；冻结已有 Stage Prep 的提交版 | 用户明确要求复盘提交内容时在独立补充页或对话中完成；进入下一阶段且有实质准备内容时新建 Stage Prep | Interview Review；把下一阶段内容追加到已提交页面 |
| 未通过、主动退出或岗位取消 | 有互动面试复盘材料时生成最后一轮 Review；更新 Process 结案和 Current Plan 最近结束 | Experience Card、Reusable Learning、Resume Version | 下一阶段 Stage Prep；无证据的失败归因 |
| 面试触发经历修复 | 对应 Experience Card | 当前岗位仍在继续时同步 Process / Stage Prep；简历事实、职责或指标口径受影响时生成 Resume Version；形成跨流程规律时更新 Reusable Learning | 重写无关 Review 或全部经历卡 |
| 单独模拟面试 | 使用中的 Stage Prep 或用户指定的模拟记录 | 模拟暴露事实冲突时更新 Experience Card / Profile | 新 Process、Review 或 Resume Version，除非任务中确有对应事件 |
| 既有 Hub 格式校准 | 用户点名的目录页、稳定页和必要索引 | 当前活跃流程确实缺少 Process 时补最小页面；自然化内部状态码 | 重新执行历史准备／复盘；默认拆分历史合并页；机械补空页 |
| 明确单项任务 | 用户点名的目标页面或成品 | 只有事实、状态或索引确实变化时才同步相关稳定页 | 以“完整旅程”为由扩展用户明确限制的范围 |

Offer 决策与求职季总结当前只按 `user-journeys.md` 更新已有页面，不设专门页面模板。

## 页面创建与更新规则

- **Profile：** 尚无个人事实主记录时创建；后续只更新经确认的跨场景事实和高风险口径索引，不为每个岗位复制一份。
- **Current Plan：** 只就地更新当前目标、优先行动和流程行；流程结束时把原行移至“最近结束”，不追加状态日志小节。
- **Process：** 每个公司、岗位、批次一页。创建时写当前岗位事实与材料索引；之后覆盖当前状态、当前阶段和下一步，只向阶段历史追加事件。
- **Stage Prep：** 每个明确筛选阶段一页，使用 `assets/templates/stage-prep.md`。笔试、Case 在提交后冻结；互动阶段在开始后冻结。下一阶段必须新建，不在旧页末尾追加复盘或新阶段。
- **Interview Review：** 每场一页。实际问题和回答冻结；后续只补明确反馈、本轮结果、后续流程结果或经确认的事实更正。
- **Experience Card：** 按稳定经历或项目组织，跨公司复用；同一项目优先更新旧卡，不因每场面试新建副本。
- **Reusable Learning：** 单场证据形成的个人改进可以记录为“待验证”；至少两个独立流程支持且无关键反证后，才能标记为“已验证”。
- **Resume Version：** 每个实际投递或冻结版本单独记录；同一文件的小措辞草稿不建立多个版本页。

格式校准只调整信息架构和显示方式，详细边界按 [format-calibration.md](format-calibration.md) 执行。

## 一次任务的交付说明

完成写回后，在对话中只列出：新建了什么、更新了什么、哪些条件产物因证据不足而未生成。不要把内部写回清单复制进飞书页面。
