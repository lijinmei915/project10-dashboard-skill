---
layer: knowledge
type: spec
last_verified: 2026-08-22
depends_on: [docs/ARCHITECTURE.md, docs/ROADMAP.md]
---

# AI 生成流水线

> 用途：定义 AI 首稿从需求进入到版本提交的标准阶段、对象边界和失败策略。
> 什么时候更新：生成阶段、状态机、provider 边界或提交语义变化时。
> 不要写什么：具体 UI 样式、单次生成记录、模型供应商密钥。

## 标准阶段

```txt
Intake
  -> Normalize
  -> Data & Semantic Context
  -> Plan
  -> Generate Candidate
  -> Validate
  -> Repair (最多一次)
  -> Isolated Preview
  -> Review
  -> Commit Revision
  -> Refine
  -> Export / Publish
  -> Observe
```

| 阶段 | 输入 | 输出 | 责任边界 |
|------|------|------|----------|
| Intake | 用户原始需求与可选数据身份 | 原始 request | 不推断业务事实 |
| Normalize | 原始 request | 结构化 request | 补平台默认值、保留原始 prompt |
| Data & Semantic Context | 数据身份、字段与口径 | 受控 data context | 凭证和任意查询不进 workspace |
| Plan | request + data context | 页面叙事与组件职责 | 不生成 DOM |
| Generate Candidate | plan + 当前 revision | generation bundle | provider 只产候选，不提交 |
| Validate | bundle + registry + schema | 校验结果 | 平台执行，模型不能绕过 |
| Repair | 校验错误 + 原候选 | 修复候选 | 最多一次，只修错误字段 |
| Isolated Preview | 已验证 workspace | 隔离预览 | 不污染当前草稿 |
| Review | 预览、假设、来源、diff | 接受或取消 | 明确示例数据和风险 |
| Commit Revision | 已接受预览 | 不可变 revision | command batch 原子提交 |
| Refine | revision + 局部请求/手动操作 | 字段或结构 command batch | 支持撤销、重放和审计 |
| Export / Publish | 指定 revision | 成品或 publication | 不从偶然 DOM 状态导出 |
| Observe | 安全阶段事件与终态 telemetry | 可恢复进度与质量指标 | 不记录凭证和敏感原始数据 |

## 状态机

```txt
intake -> normalized -> planning -> generating -> validating
                                         ^           |
                                         |           v
                                      repairing <- failed validation
                                                     |
                                                     v
                                               preview-ready
                                                     |
                                                     v
                                                 committed
```

任一非终态可进入 `failed` 或 `cancelled`。`committed / failed / cancelled` 是终态。未经 `preview-ready` 不得生成 revision。

## 领域对象

- `GenerationRequest`：原始 prompt、目标、受众、语言、页面类型、数据输入身份和 `workspace / component` 作用域；组件作用域必须带稳定 ID。
- `DataContext`：数据来源、字段和语义口径；与页面结构分离。
- `Plan`：Section 目的、组件职责和数据引用计划。
- `GenerationBundle`：request、plan、候选 workspace、command batch 与 provenance。
- `GenerationRun`：状态、阶段事件、修复次数、候选和错误。
- `Workspace.document`：标题、Section 与受组件注册表约束的内容。
- `Workspace.document.controls`：跨 Section 生效的页面级 `filter-bar / view-tabs`，只在用户明确要求交互时生成。
- `Workspace.interactions`：当前筛选值和活动视图；与内容定义分离并随 revision 持久化。
- `Workspace.resources.datasets`：可选轻量记录与明确的 `portable` 策略；组件通过 `dataRef + binding` 声明聚合、序列、行或排行映射。
- `Workspace.layout`：只引用稳定 Section/组件 ID，不保存正文。
- `Revision`：用户接受后产生的不可变 workspace 快照、父 revision、来源、摘要、正向命令和反向命令。

## 局部精修、结构命令与评审

- `Refine` 以当前 workspace 和 `{ kind: "component", id }` 为基线；provider 只能返回目标组件及必要关联 token 的窄 command batch，不得使用根路径替换模拟局部修改。
- 平台在克隆 workspace 上原子应用命令，再通过 `diffWorkspaces()` 计算有界字段差异；Review 展示实际 `before -> after`，不以模型摘要代替差异真相。
- 当前确定性 provider 支持图表类型、卡片标题、副标题、摘要正文，以及复制、新增同类、删除、调宽、前移和后移；未支持的请求必须返回可行动错误，不猜测或扩大作用域。
- 结构命令必须同步维护 `document.sections[].components`、`layout.sections[].items`、可选 `layout.canvasOrder`，并清理或复制必要的筛选目标、视觉覆盖和资源引用；整个批次任一操作失败时不提交任何一项。
- 新增或复制的组件必须使用独立稳定 ID。摘要卡暂不允许复制，分区最后一张卡不得删除，卡片跨度只使用 `3 / 4 / 6 / 8 / 12` 受控档位。
- Studio 依据 candidate workspace 协调真实画布 DOM。模板只决定受控组件的初始结构；DOM 不得反向成为内容或布局真相。
- 隔离预览同时保留 baseline 与 candidate。接受前原 workspace 不变；取消直接丢弃 candidate。
- Studio 中的项目中心只承载 Intake；Generation Job 创建成功后关闭模态浮层，画布生成浮条接管运行状态和 Review 操作。浮条复用同一 Composer 状态机，不持有第二份 candidate 或 baseline。
- 进度连接首帧发送 `job.snapshot`，并以 10 秒 heartbeat 保持代理链路；快照只包含任务状态、阶段、更新时间、终态和 `sectionsReady / sectionCount`，不包含 request、候选或结果正文。
- 成功候选在完整 Generation Bundle、Workspace、Command materialization 和 provenance 校验通过后，按 Workspace 分区持久化 `section.ready`，最后持久化 `preview.ready`。单个事件只含分区序号、总数和组件数；失败任务不得产生 `section.ready`。
- AI Composer 按 `section.ready` 顺序更新进度骨架；同一网络批次到达多个事件时仍逐项呈现。重连时以快照恢复权威完成数，不补演历史动画；完整 Workspace 只在成功终态后原子应用。

## 反向命令与撤销

- Commit 根据 baseline 与正向命令生成无损反向命令，并验证反向应用后与 baseline 完全一致。
- 常规对象字段使用 `set / replace / unset` 反向命令；稳定 ID 数组使用精确 `insert / remove / move` 逆操作。只有不可表达的差异超过 500 项时才允许退化为根快照替换。
- Undo 只允许最新 `currentRevisionId`，且当前 workspace 必须与该 revision 快照完全一致；否则以 `stale` 或 `drift` 拒绝，不能覆盖后续 revision 或手动修改。
- 成功撤销不会删除历史，而是以 `source: user` 和被撤销 revision 为父节点追加一个恢复 revision。

## 版本历史与恢复

- 历史查询只返回可展示的 revision 摘要和当前版本身份；完整 workspace 快照继续保存在 Project store，不进入 Dashboard 正文。
- Studio Project store 是项目状态真相：项目按 ID 存储为服务端 JSON 文档，写入使用同目录临时文件原子替换；浏览器回传的项目只用于旧客户端首次迁移，已有服务端项目不得被客户端快照覆盖。
- 同一项目写入在单进程内串行化，并以 `expectedRevisionId` 执行乐观并发检查；当前 revision 已变化时返回 `409 stale`，调用方必须刷新后重新评审，不能静默覆盖。
- 用户可以选择任意已有 revision 作为恢复来源。平台先校验当前 workspace 与 `currentRevisionId` 对应快照一致，再把目标 workspace 作为新的 revision 追加到历史尾部。
- 恢复 revision 的父节点是恢复前的当前 revision，用摘要记录来源版本；目标旧 revision 保持不可变，历史不重排、不截断。
- 接受、撤销和历史恢复都是明确版本动作，Studio 应立即持久化新的 current revision 与 workspace；普通未保存手动编辑仍按脏状态处理。
- 用户点击保存时，结构化手工修改以 `source: user` 追加 revision；不为每次控件输入自动建版本。条件写入失败时保留脏状态并要求刷新历史，不覆盖服务端 current revision。
- `project-store.mjs` 保持纯领域规则并随 Skill 分发；文件 repository 和项目 HTTP API 属于 Studio-only 能力，不进入轻量 Skill 或 standalone。

## 确定性导出

- `revision-exporter.mjs` 只接受已校验 Project 和显式 revision ID，恢复该不可变 workspace 后渲染；相同输入产生相同 HTML 字节和 SHA-256。
- 导出覆盖全部注册内容组件、12 列跨度、Dashboard/Report 页面类型、深浅模式、页面控件和 portable dataset；图表使用四类受控内联 SVG，不携带 ECharts。
- 只有 `portable: true` 数据进入交互成品；否则筛选栏被移除并固化当前结果。Tab 可保留原生 button 交互。
- Studio UI、Provider、API key、编辑状态、Project 历史和服务端运行库均不得进入产物。

## Provider 边界

真实模型、本地确定性 provider 或其他 Agent 都实现同一职责：根据结构化 request、data context 和当前 revision 产出候选 generation bundle。

- Provider Gateway 是平台层入口：默认路由到确定性 provider；显式配置后可路由到服务端 OpenAI Responses 适配器。
- 平台在调用 provider 前拥有规范化 request 和 Data Context 真相；无数据首稿使用显式 `primary-data / sample` 身份，provider 返回的 request 会被平台值覆盖。
- 远程适配器请求 schema-guided JSON，但不把模型结构化输出视为可信结果；候选仍必须通过本地 generation schema、workspace schema、命令物化和 provenance 一致性校验。
- 第一次候选校验失败时，Gateway 只把原候选和结构化 issues 交给 provider 修复一次；第二次失败进入 `failed`。
- provider 的认证、模型和 endpoint 仅来自服务端环境；密钥不进入 input、run、workspace、health、日志或成品。

Provider 不负责：

- 直接修改当前 workspace 或 DOM
- 决定 schema 是否通过
- 跳过数据来源标记
- 提交 revision、发布或执行任意 SQL
- 无限自动修复

当前本地确定性 provider 用于无模型密钥环境下的端到端合同测试。OpenAI Responses 适配器已复用同一协议，并对未配置、拒绝、限流、超时、上游故障和无效 JSON 做稳定错误映射；真实模型联网质量仍需在有效密钥环境中单独验收。

部署环境使用 `npm run smoke:provider` 运行一次受控首稿和一次组件精修。两步都必须停在 `preview-ready`，脚本不调用 commit/publish API，只输出 provider、模型、耗时和受控摘要；未显式配置 OpenAI provider 时立即失败且不发起网络请求。

## 失败与恢复

- 命令批次在克隆 workspace 上执行，任何操作失败则整批不提交。
- 校验失败最多自动修复一次；再次失败进入 `failed`，保留当前 revision。
- 隔离预览取消时不产生 revision，也不覆盖用户手动编辑。
- 局部精修找不到目标、无法解析受控操作或命令越界时保留当前 workspace，并返回可行动错误。
- 结构命令找不到关联布局、触发受保护卡片规则或无法生成无损反向命令时保留当前 workspace，并返回可行动错误。
- 示例数据必须在 document 和 provenance 中同时可见。
- Provider chunk 只在服务端内存中累积；完整候选通过校验后，客户端一次应用原子隔离 Workspace，再按分区渐进揭示。渐进效果不构造或持久化部分 Workspace。
- SSE 是通知通道而不是任务真相。连接失败只进入恢复提示；断线期间浏览器每 4 秒查询一次权威 Job，连接恢复后停止回退查询，遗漏的成功、失败或取消终态通过同一幂等收口恢复。
- SSE 每次连接从 `Last-Event-ID` 后续传持久事件并先发送当前 `job.snapshot`。服务端读取仓储失败时主动结束连接，让 EventSource 自动重连，而不是伪造任务失败。
- 服务重启时，新 worker 对仍持有未过期租约的 `running` Job 等待到期后复查；租约持续续期则继续等待，过期后才重新入队并以新 fencing token 接管，避免双执行和迟到结果覆盖。
- Generation Job 终态持久化最小 telemetry：排队、执行、总耗时和修复次数，不复制 prompt、workspace、候选或 DataContext。`GET /api/generation/metrics` 只允许组织管理员读取默认 24 小时、最多 30 天的状态计数、成功/失败/修复率、p50/p95 与失败码聚合；不返回 Job 或用户身份。
- 候选评审保留 Job ID 直到用户接受或取消预览。版本提交成功后写入一次 `accepted`（可关联 revision ID），取消预览后写入 `dismissed`；反馈只允许任务发起人提交，重试幂等、冲突不可改写，不采集自由文本。组织指标只增加 accepted/dismissed/unrated 和候选可用率。
