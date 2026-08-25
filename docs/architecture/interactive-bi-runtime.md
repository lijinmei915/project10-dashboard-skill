---
layer: architecture
type: spec
last_verified: 2026-08-23
depends_on: [docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/SECURITY.md, .agents/skills/dashboard-html/schemas/chart-spec.schema.json]
---

# 交互式 BI 运行时

> 用途：定义 Dashboard、Report、ChartSpec、在线查询、下钻、刷新和自定义图表的稳定边界。
> 什么时候更新：图表运行时、分析状态、转换流程或扩展协议变化时。
> 不要写什么：单次实现流水、页面样式细节、未通过阶段门槛的完成声明。

## 产品边界

- Dashboard 是在线分析应用，使用客户端 ECharts，允许查询、筛选、联动、下钻和刷新；不承诺离线 HTML 导出。
- Report 是稳定阅读成品，使用服务端 ECharts SVG 和固定数据快照，允许发布、打印和 PDF。
- Dashboard 生成 Report、Report 转换为 Dashboard 都创建新项目或副本，不在成品页面提供即时类型切换。
- 两种产品共用 ChartSpec、图表目录、Option Builder、色板、数字格式和业务语义；渲染方式不同，图表规则不能分叉。
- ECharts 是唯一底层绘图引擎。Chart.js 不进入运行时；自定义能力优先使用标准系列组合和受控 Custom Series。

## ChartSpec

`schemas/chart-spec.schema.json` 是 AI、Studio 和运行时之间的图表合同。ChartSpec 只允许纯 JSON，禁止函数、类实例、Symbol、BigInt、未知字段和任意 ECharts Option。

ChartSpec v1 包含：

- `chartType`：图表目录中的稳定 ID。
- `data`：标签、系列、阈值及仪表盘/表格专用配置。
- `dataBinding`：可选的 Dataset、维度和指标引用，不包含 SQL 或凭证。
- `appearance`：模式、尺寸和已解析色板。
- `interactions`：图例、Tooltip、缩放和受控下钻层级。
- `refreshPolicy`：手动、轮询或 Dataset 事件刷新策略。

运行时先归一化和验证 ChartSpec，再由 `chart-spec-runtime.mjs` 构造 ECharts Option。Formatter 等必要函数只能由本地 Builder 产生，AI输出不得携带可执行代码。

## 双渲染

```text
Workspace / Semantic Query
          ↓
       ChartSpec
          ↓
Shared ECharts Option Builder
     ↙                 ↘
Dashboard Client       Report SSR
Canvas/SVG + events     static SVG
```

- Dashboard Runtime 负责 ECharts 实例生命周期、`setOption`、Resize、可见区延迟加载和事件转译。
- Report Renderer 负责 SSR SVG、静态图例、下载、发布和打印；Studio 导出与 Publication 创建必须注入同一个宿主 `renderChartSvg`。便携 Skill 缺少宿主 ECharts 时才允许使用确定性静态 SVG 降级，不得加载客户端 ECharts。
- `data-table` 使用语义 DOM 表格，不伪装为 Canvas 图表。
- 服务端 SVG继续承担资源预览、Report、加载占位和 Dashboard 故障降级。

### 客户端运行时边界

- `studio/client-echarts-runtime.mjs` 只接收经共享运行时归一化的 ChartSpec，负责按容器复用实例、`setOption`、ResizeObserver、迟到渲染失效和确定性销毁。
- `studio/workspace-chart-adapter.mjs` 以页面类型分流：Dashboard 的 22 种绘图类型进入客户端运行时，Report 与 `data-table` 进入静态 SVG 路径；客户端加载失败时回退到同一服务端 SVG。
- Studio 开发与独立部署统一从 `/vendor/echarts.mjs` 加载锁定版本的 ECharts 6；独立构建复制该资产并记录 hash，Report 直开不得请求该文件。
- Workspace 恢复期间暂停图表渲染，完成主题、文档、布局和交互状态恢复后只渲染一次，避免 Report 被默认 Dashboard 状态提前加载客户端运行时。

### 在线语义查询边界

- 非便携 Dashboard 只在 Workspace 保存 `{ portable: false }`、`dataRef` 和受控 binding，不保存 records；Report 继续使用生成时的数据快照。
- `studio/online-data-runtime.mjs` 先读取已授权 Dataset 语义模型，再把物理 binding 映射为维度/指标语义 ID。查询正文只允许 `dimensions / metrics / filters / limit`，不接受物理字段查询或任意表达式。
- 同一 Dataset 的并发元数据读取共享一个在途请求；组件查询可取消，并以序号门禁拒绝迟到结果。成功结果仅作为内存中的视图覆盖，不修改 Workspace 或 revision。
- 查询失败时保留 last-known-good，并将组件标记为 `stale`；首次失败标记为 `error`。跨组织 Dataset 统一按不存在处理，行级策略在每次元数据和查询请求时重新执行。

## 分析状态

Dashboard 的筛选、图例、下钻、缩放、选中和刷新状态必须集中管理。图表只能发出受控意图，不能直接修改其他图表或拼接查询。

```text
Chart event → AnalysisState command → authorized semantic query → latest-result gate → setOption
```

- 联动范围只能是 component、section 或 page。
- 下钻只使用预注册维度层级，每层查询重新执行身份、项目、Dataset 和行级授权。
- 请求必须支持取消和序号门禁，迟到结果不得覆盖当前状态。

### 选择联动

- `studio/analysis-state.mjs` 是图表选择的纯状态边界。ECharts Runtime 只把点击翻译为 `chart.select` 意图，Workspace Adapter 和 Editor 不允许图表直接调用其他图表。
- 图表必须以 `props.selection.enabled` 显式开启，并声明 `component / section / page` 之一；选择字段只能从该图表的分类 binding 推导，状态只保存 `{ sourceComponentId: scalarValue }`。
- 目标按作用域解析后仍必须与来源图表引用同一 Dataset。一个选择命令只触发一次统一重绘和一轮目标查询；渲染、查询完成或状态恢复不会反向产生选择事件。
- 再次选择同一个值或点击卡片标题中的当前筛选提示会清除选择。保存版本后 `chartSelections` 随 Workspace 恢复；Report 不启用客户端选择联动。

### 层级下钻

- Dataset 的 `semanticModel.hierarchies` 只允许引用 2-8 个已注册且不重复的语义维度；数据刷新和字段修正必须保留合法层级，不能由 Workspace 临时声明物理字段。
- `studio/drilldown-state.mjs` 以 `hierarchyId + path depth` 推导当前维度。Workspace 只保存组件的受控层级声明和 `{ componentId: { path: scalar[] } }` 分析状态，不保存客户端拼接的查询表达式。
- 每次进入下一层都重新读取授权 Semantic Model，并严格比较 Workspace 层级与服务端注册层级；查询保留全部祖先过滤，层级不一致、未知值或越过最后一层时失败关闭。
- ECharts 点击在组件启用下钻时优先产生下钻意图；面包屑可返回任意已有深度。保存和刷新恢复路径，渲染、查询和状态恢复不会产生新的下钻意图。

## 数据刷新

- `studio/live-data-refresh-runtime.mjs` 按 Dataset 合并组件订阅；在线 Dashboard 默认使用 `dataset-event`，显式 `poll` 的间隔限制为5秒到24小时，`manual` 不建立后台任务。
- 分钟级经营数据可使用 HTTP 轮询。失败按有界指数退避重试，成功后恢复正常间隔；同一 Dataset 的刷新只失效对应元数据与查询键，不驱逐其他 Dataset。
- Dataset 更新通知使用可恢复 SSE，只传 Dataset ID、语义版本和更新时间，不推送敏感记录。客户端按事件 ID 和版本时间去重，断线后携带游标重连，再通过授权语义查询获取权威数据。
- WebSocket 只在确有高频双向需求时评估，不是默认能力。
- 默认在页面隐藏后关闭 SSE 并暂停轮询，恢复可见时立即补查；只有显式 `pauseWhenHidden: false` 的目标允许继续后台刷新。
- 查询失败保留 last-known-good 并显示数据时间和陈旧状态。刷新只替换运行时数据覆盖，不写 Workspace；筛选、图例、下钻和缩放状态不得重置，同 zoom 模式的 ECharts 实例更新会保留当前窗口。

## Dashboard 生成 Report

- 转换只创建新的 Project 与单一 system revision，不修改源 Dashboard、追加源 revision 或提供原地页面类型开关。
- 服务端从源 revision 复制 Workspace；每个在线 Dataset 都按发起者重新执行组织与行级权限，再把当前筛选、图表选择、下钻路径及图例可见性物化为固定组件值。
- Report 副本删除 controls、binding、dataRef、Dataset records、selection、drilldown、refreshPolicy、zoom 与 interactions，只保留可独立验证和渲染的静态文档、布局与视觉配置。
- 项目列表仅返回当前 revision 的 `pageType` 摘要以决定可用操作，不返回 revision、records 或数据绑定正文。
- `/studio/projects/:id` 在权威 revision 恢复前暂停首次图表绘制；Report 深链只请求服务端 SVG，Dashboard 深链才按需加载客户端 ECharts。
- Dataset 缺失、权限拒绝、非 Dashboard revision 或新 Project ID 冲突都失败关闭，不能生成部分 Report。

## 自定义图表

扩展顺序固定为：标准 ECharts 系列组合、受控 Custom Series、审核式开发者插件。

每个扩展必须声明稳定 ID、业务语义、数据 Schema、Dashboard/Report 支持、交互能力、静态降级和版本。普通用户与 AI 不得粘贴任意 Option、`renderItem` 或 JavaScript；插件异常必须隔离，不能阻断同页其他图表。

首个受控扩展为 `bullet`：ChartSpec 只保存分类、实际系列、目标系列和 `min/max/unit/precision/ranges`；本地审核 Builder 才生成 ECharts `custom` series。版本化 manifest 声明 `client-echarts` Dashboard、`server-svg` Report、`horizontal-bar` 降级和能力清单。重复 ID、未知 capability、可执行 manifest 输入和非本地 Builder 均失败关闭；Builder 异常只降级当前图，不影响同页其他图表。

## 阶段门槛

| 阶段 | 交付 | 进入下一阶段的门槛 |
|---|---|---|
| M0 | ChartSpec v1、共享 Builder、产品决策 | 23种类型一致，22种 ECharts 配方通过，纯 JSON 门禁生效，SSR无回归 |
| M1 | 客户端 ECharts Runtime | 已通过：23种资源可呈现，实例可更新/Resize/销毁，Report不加载客户端运行时 |
| M2 | 在线语义查询 | 已通过：授权绑定、取消、并发元数据缓存、last-known-good、迟到结果门禁和 Workspace 零 records 通过 |
| M3 | 筛选与跨图联动 | 已通过：component/section/page 范围、同 Dataset 限制、无循环、清除及保存恢复通过 |
| M4 | 层级下钻 | 已通过：三层语义层级、祖先过滤、面包屑返回、逐层授权、保存恢复及390px布局通过 |
| M5 | 刷新与 SSE | 已通过：轮询、隐藏暂停、退避、SSE重连去重、定向失效、last-known-good及交互状态保持通过 |
| M6 | Dashboard 生成 Report | 已通过：授权数据与当前交互固化到新 Project，原项目不变，Report 深链零客户端 ECharts，390px布局通过 |
| M7 | 自定义图表与治理 | 已通过：版本化 manifest、受控 Bullet Custom Series、异常隔离、标准条图降级、纯 JSON 安全和 Dashboard Canvas / Report SVG 移动端回归通过 |

任何阶段不得仅凭可见演示标记完成；必须同时通过合同测试、数据正确性、安全、桌面/移动浏览器和故障路径验收。
