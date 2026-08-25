---
layer: knowledge
type: log
last_verified: 2026-08-24
depends_on: [docs/CHANGELOG.md]
---

# 关键决策

> 用途：记录已经明确做出的工程或内容决策，以及原因。
> 什么时候更新：确认一个会持续影响仓库的决策时。
> 不要写什么：临时想法、待办清单、交接流水。

## 2026-06-30

### 决策 1：skill 保持轻量

- 结论：`dashboard-html` 不引入复杂 token 体系和重组件分类
- 原因：当前目标是提供一个易复用、易编辑的 standalone HTML dashboard skill

### 决策 2：使用布局原语而不是固定业务组件

- 结论：以 `surface`、`stack`、`grid`、`split`、`canvas`、`table-area` 组织规则
- 原因：降低内容预设，让不同业务都能复用同一 skill 骨架

### 决策 3：界面不直接暴露原语标签

- 结论：原语保留在规则文档中，不直接显示在最终模板界面上
- 原因：避免打断成品感，同时保留底层结构约束

### 决策 4：视觉主题与头部分组样式分层

- 结论：使用 `visualTheme` 控制整体 token，使用 `headerStyle` 和 `sectionStyle` 控制头部与分组标题表现；三者不决定业务内容和布局原语
- 原因：参考报告型页面的层级表达，同时避免为不同主题维护多份固定 HTML 模板

### 决策 5：Dashboard 与 Report 共用一套 Skill

- 结论：新增独立 `pageType: dashboard | report` 编排层；两种页面类型共用 starter、视觉 token、布局原语和响应式规则
- 原因：两者差异主要是信息密度和阅读顺序，不应复制 Skill 或把页面类型绑定到视觉预设
- 边界：切换 `pageType` 不改变主题、字号、圆角、阴影、间距和用户数据

### 决策 6：布局编辑使用 DOM 顺序和离散栅格

- 结论：分组与同组卡片使用 DOM 顺序重排；卡片主体直接拖动换位，悬停时通过边缘把手调整尺寸；尺寸吸附到 12 列栅格的离散跨度，不支持任意像素缩放
- 原因：保证 standalone HTML 可固化、可响应且不产生卡片覆盖
- 边界：卡片不显示遮挡内容的浮动工具条；第一版不跨分组移动卡片；最终交付移除全部布局编辑控件

### 决策 7：设计状态本地保存，交付物保持纯净

- 结论：设计工具将主题、页面类型、Logo 和布局配置自动保存到浏览器本地存储，同时保留上一版完整设置用于一步撤销；导出时固化当前 DOM 和 token
- 原因：避免刷新丢失编辑，同时保持 standalone HTML 可直接分发
- 边界：撤销恢复上一版设置，不恢复 HTML 初始默认；导出文件不包含工具抽屉、编辑控件、编辑脚本和编辑器 CSS

### 决策 8：工程文件和成品文件分开保存

- 结论：工程 HTML 保留编辑器并内嵌当前配置，重新打开后可继续编辑；成品 HTML 只保留报告内容和最终样式
- 原因：浏览器本地存储只绑定当前浏览器和地址，不能随文件迁移；内嵌配置才能让工程文件独立、长期保存
- 边界：支持文件系统访问 API 时使用系统“另存为”，否则退回浏览器下载；网页不能静默覆盖本地文件

### 决策 9：Dashboard 用卡片层级，Report 用章节层级

- 结论：自动模式下 Dashboard 使用全宽流式内容区并省略可替代的分组标题，Report 使用阅读宽度并保留章节标题
- 原因：Dashboard 依赖并列扫描和卡片自身标题，Report 依赖顺序阅读和章节节奏
- 边界：页面宽度、分组标题显隐和卡片标题字号均可独立覆盖，不绑定业务模块或视觉主题

### 决策 10：Dashboard 使用连续画布而非报告封面

- 结论：自动模式下 Dashboard 使用居左的透明紧凑头部、连续页面底色和无外层大圆角；Report 保留统一整页外壳，并使用居中的 surface 头部
- 原因：业务 Dashboard 依靠卡片网格扫描，不需要报告式封面承载区
- 边界：Report 外壳不受卡片线框开关影响；头部样式和页面底色可独立覆盖；自定义底色碰巧与卡片同色且无边界时只补极浅线框，不改其他视觉 token

### 决策 11：主题色使用语义派生而非组件直读 seed

- 结论：用户主题色只写入 `--accent-seed`；结构色、浅底、浅底前景、实色前景、弱结构线和图表色分别派生为独立 token
- 原因：同一原色在浅色与深色 surface 上的可见性不同，组件直接读取 seed 会产生低对比文字、结构线消失和图表不可辨认
- 边界：结构色对所在 surface 至少 `3:1`，浅底文字至少 `4.5:1`；成功、警告、危险和信息色不跟随主题色；主题切换不改变字号、间距、布局和尺寸

### 决策 12：页面 surface 使用克制的主题同色相染色

- 结论：Report 的外部画布、页面背景、卡片背景分别从 seed 轻量派生；Dashboard 合并外部画布与页面背景，只保留页面和卡片层级
- 原因：只有结构线跟随主题会让页面整体割裂，而直接使用原色又会破坏阅读；低比例同色相混合可以保持主题统一和 surface 层次
- 边界：浅色三层 seed 比例为 `2% / 1% / 0–0.5%`，深色为 `2% / 3% / 4%`；文字对比度基于染色后的真实 surface 重新计算

### 决策 13：图表配色独立于主题色

- 结论：`chartPalette` 使用 `monochrome / bichrome / categorical`；三者共用产品固定 8 色分类色板，单色和双色按主题色相取最近一色或两色
- 原因：自动和状态映射增加理解成本，主题色直接进入图表也容易产生不稳定或不协调的配色
- 边界：8 色保持接近的感知饱和度和视觉强度，按连续色相环排序且不混入中性色；取色只比较色相距离，黑白灰回退色板前一/两色，双色只用于真实二分类

### 决策 14：页面纹理独立于底色

- 结论：页面底色负责色彩层级，页面纹理使用独立 `pageTexture` 属性控制，并可与任意底色组合
- 原因：将颜色和纹理绑定成预设会限制组合，也会让用户为改变材质被迫改变主题
- 边界：纹理只作用于外部画布和页面，不进入卡片；使用纯 CSS，确保 standalone HTML 离线可用

### 决策 15：卡片使用稀疏覆盖继承全局视觉

- 结论：全局配置作为默认值，单卡仅保存与全局不同的字段，并通过稳定 `data-item-id` 固化
- 原因：允许图表和 KPI 按业务需要局部表达，同时避免为每张卡片复制完整配置
- 边界：第一阶段仅覆盖图表配色、普通卡片标题图标、KPI 图标及其主题/中性配色；圆角、阴影和线框保持全局一致

### 决策 16：页面类型只改变预设入口，不重置视觉状态

- 结论：Dashboard 与 Report 共享底层预设 token，但分别显示适合看板和报告语境的名称与候选项
- 原因：用户需要更容易理解的选项，同时切换页面类型不能破坏已经完成的视觉配置
- 边界：切换类型时保留当前预设；若当前项不在目标类型的常规候选中，暂时显示到用户选择新预设为止

### 决策 17：主题色在安全范围内保留用户原值

- 结论：主题原色满足目标对比度时直接使用，不满足时保持色相并仅调整明度
- 原因：始终重算饱和度和明度会让最终页面明显偏离用户选择，同时文字仍需满足可读性要求
- 边界：大字和图形至少 `3:1`，普通文字至少 `4.5:1`；图表继续从固定色板按相近色相取色

## 2026-08-05

### 决策 18：完整图标资源留在 Agent，成品只固化选中 SVG

- 结论：Agent 预览服务持有 Phosphor 全量图标、中文别名和搜索接口；每个分组可独立搜索与覆盖图标，导出文件只保留最终选中的内联 SVG
- 原因：用户侧页面需要轻量、离线和可迁移，而图标检索需要较完整的资源与语义索引
- 边界：不提供强制所有分组使用同一图标的全局选择；成品不包含图标库、搜索界面、编辑脚本或 Agent API 依赖

### 决策 19：先稳定跨 Agent 协议，再拆分应用包

- 结论：当前仓库继续同时承载可移植 Skill 和本地 Studio；二者通过版本化 workspace JSON 交互，暂不提前拆成多个 npm 包
- 原因：主题和局部配置仍在演进，先建立协议可以避免拆包后多处状态定义漂移
- 边界：纯 Skill 不依赖 Studio 服务；平台适配保持轻薄；协议发生破坏性变化时必须升级版本并提供迁移

### 决策 20：图表库仅在 Agent 侧运行，默认导出静态 SVG

- 结论：Studio 使用 ECharts SSR 提供图表目录和 SVG 渲染；接口只接受受控的结构化图表模型，默认成品不包含 ECharts
- 原因：完整图表库适合 Agent 侧推荐与渲染，但会显著增加用户文件体积，并引入不必要的运行依赖
- 边界：当前白名单为折线、面积、柱状和环形图；只有用户明确要求交互时才允许另行加入最小交互运行时

### 决策 21：Dashboard 区分自由卡片与显式卡片组

- 结论：Dashboard 一级画布同时承载单卡与卡片组；单卡直接使用 12 列跨度，卡片组另有组宽和组内布局，组标题显隐不决定是否成组
- 原因：图表、表格等内容可以独立自由组合，KPI 等重复结构则需要稳定的内部排列，不能继续把所有语义 section 都当作视觉分组
- 边界：当前 KPI 默认为组，摘要、趋势、来源、健康和风险默认为自由卡片；Report 仍将语义 section 渲染为全宽章节；旧 workspace 缺少 `grouped` 时按内容类型迁移

### 决策 22：Dashboard 拖动使用 12 列占位吸附

- 结论：Dashboard 的自由卡片和显式卡片组共用 `canvasOrder`；拖动对象浮起跟随指针，原位置使用同高、同 `span` 的 12 列占位块，进入目标 40% 边缘区域后才切换槽位
- 原因：原生 HTML5 拖拽在频繁 `dragover`、跨原语义分组和拖影状态下反馈不稳定，与 Dashboard 的连续画布模型不一致
- 边界：只从拖动把手启动，不影响卡片点选和宽度调整；吸附只改位置，不改卡片宽度；KPI 组作为单个画布节点；Report 仍保持章节范围内的排序规则

### 决策 23：卡片与整组编辑入口互斥

- 结论：组内卡片悬停时只显示卡片拖动和卡片宽度把手；组左上边缘热区只显示整组拖动；选中整组后隐藏所有内部卡片编辑入口
- 原因：同时展示“拖动整组 / 拖动卡片”会迫使用户先理解布局数据结构，也会与宽度把手争夺空间
- 边界：自由卡片始终只有卡片层级；选中整组后点击任一内部卡片即切回卡片层级；KPI 单卡只能在本组内排序，组外释放回到当前占位，跨组移动必须使用明确的结构命令

## 2026-08-06

### 决策 24：Skill 携带轻量固定色板而非完整色彩运行时

- 结论：固定分类色、状态色和中性色以版本化小型 JSON 随 Skill 分发；详细规则放在按需读取的 reference，图标库、图表库和颜色计算运行时继续留在 Agent/Studio
- 原因：跨 Agent 生成需要稳定、可审计的颜色身份，但不需要把重型资源和完整实现注入用户侧或每次上下文
- 边界：图表、KPI 和分组标题多色共用固定 8 色分类色板；多色渐变使用当前索引到下一索引的完整不透明色，隐藏项不占色位；企业只能整组覆盖版本化 palette，不在组件内零散改色

### 决策 25：生成端可重，默认交付端只固化结果

- 结论：图标库、图表库、搜索索引和渲染服务作为生成期能力；默认成品只保留选中或渲染后的内联 SVG，并提供完整、宿主增强和便携降级三种模式
- 原因：企业用户需要丰富的生成与编辑能力，但最终文件仍需轻量、离线、可迁移；任意 Agent 又不能假设都具备同一套服务
- 边界：缺少图标资源时保留文字并移除空图标位；缺少成熟图表引擎时以同一数据生成表格、排行、进度或 KPI 摘要；只有用户明确要求交互时才加入最小运行时

### 决策 26：KPI 图标默认继承卡片颜色身份

- 结论：KPI 图标默认在渲染时按卡片实际底色解析；默认或白色底使用中性色，主题单色底使用品牌色，多色底使用该卡的分类色
- 原因：卡片底和图标分别配置时容易出现彩色卡片配固定主题色图标，破坏同一卡片的颜色一致性
- 边界：用户明确选择的中性色、主题色、多色或渐变优先；自动模式只解析最终表现，不在切换底色时改写保存状态；多色渐变继续连接当前与下一分类色

### 决策 27：指标卡整组样式属于分组级局部设置

- 结论：页面全局只承载跨页面或跨卡片通用规则；KPI 图标、位置、底色和组内呈现放在选中 KPI 分组后的“当前分组”，单张 KPI 仅保存覆盖项
- 原因：把指标卡整组样式放在全局或独立成第二张局部面板都会混淆页面、分组和单卡三个作用域
- 边界：分组宽度、布局与 KPI 整组样式共用一个局部面板；分组标题图标只有在标题及图标装饰可见时出现；新建组件的产品默认值仍由预设提供

## 2026-08-07

### 决策 28：图标形态与颜色使用正交的共享组件

- 结论：普通卡片标题图标、KPI 整组和 KPI 单卡共用“装饰样式 + 颜色”两组选项与下拉预览；KPI 单卡可分别继承整组形态和颜色
- 原因：将形态、容器和颜色预组合成样例卡会产生大量重复选项，也会让标题图标与 KPI 的能力长期不同步
- 边界：共享的是选项身份、预览和映射方式；KPI 继续保留“无”“跟随卡片”“跟随整组”等作用域特有项，旧保存状态在界面层推导为最近的共享形态而不强制重写

### 决策 29：AI 首稿是默认入口，手动编辑用于精修

- 结论：产品默认从自然语言需求生成完整 workspace 首稿，手动编辑器负责精确修正和兜底；M0 先稳定受控生成协议，M1 即交付 AI 首稿，不要求用户先完成空白搭建
- 原因：从空白模板手工搭建速度慢，也弱化了项目作为生成式产品的差异；但 AI 仍需通过 schema、组件注册表和 command batch 受控修改
- 边界：无真实数据时只能使用明确标记的示例数据；MVP 不包含任意 SQL、多人实时协同、完整 OLAP 或全量企业连接器

### 决策 30：Skill 使用显式便携包，Studio 作为独立增强层

- 结论：GitHub Releases 提供可直接下载的轻量 Skill ZIP；包内保留完整必要规则、模板、色板、schema、小型目录和确定性检查，完整图标/图表库及 Studio 服务不进入包
- 原因：轻量应通过按需读取和生成期资源分层实现，而不是删除规则；显式包清单与解包校验可以同时控制体积和遗漏风险
- 边界：当前 `v0.2.1` 下载包可用但早于本轮工作区；新版本必须在发布前完成包清单、解包契约和跨 Agent 降级检查，发布仍需用户明确确认

### 决策 31：生成采用平台受控状态机，模型只产候选

- 结论：完整流程按 Intake、Normalize、Data Context、Plan、Generate、Validate、Repair、Preview、Review、Commit、Refine、Export 和 Observe 分层；模型 provider 只产出 generation bundle 候选
- 原因：把 prompt 直接映射到 DOM 或正式 workspace 会混淆模型输出、编辑草稿和发布版本，无法保证失败回滚、来源审计和人工确认
- 边界：校验、一次修复上限、隔离预览、revision 提交和发布均由平台执行；本地确定性 provider 只用于无密钥原型和合同测试，未来真实模型继续使用同一协议

### 决策 32：颜色系统采用固定基准色与动态 UI 色阶

- 结论：BI 分类色和语义色保持版本化基准色；页面浅底、交互态、边框、卡片与图标容器围绕对应基准色生成同色相 UI 色阶，即“色相固定、色阶动态”
- 原因：固定基准色保证跨图表、跨页面和跨 Agent 的颜色身份稳定；动态色阶允许任意品牌种子色适配浅色、深色和不同承载面，又不需要在轻量 Skill 中携带完整 13×12 色表
- 边界：动态派生优先使用版本化 OKLCH 算法并执行 sRGB 色域裁切与对比度校验；不得用派生色替换 BI 系列基准色；旧成品继续固化实际色值，不因算法升级自动变化

## 2026-08-08

### 决策 33：跨分区交互使用页面级控件与独立状态

- 结论：`filter-bar / view-tabs` 注册为页面级组件，定义保存在 `document.controls`，当前值保存在 `workspace.interactions`；不把它们伪装成普通内容卡片
- 原因：筛选和视图切换会控制多个 Section/组件，若放入某张卡片会造成作用域、布局引用、持久化和导出语义混乱
- 边界：控件只在用户明确要求时生成；引用和默认值必须通过契约校验；默认使用原生 select/button 和最小离线 Controller，不引入前端框架

### 决策 34：筛选联动使用轻量数据集与声明式组件绑定

- 结论：交互 workspace 以 `resources.datasets` 保存轻量记录，KPI、图表、表格和列表通过 `dataRef + aggregate/series/rows/ranking binding` 声明计算，不使用按筛选项预制的展示变体
- 原因：统一数据计算可保证多个组件读取同一筛选状态、离线复算和字段校验，避免静态假结果与业务组件逐个同步
- 边界：dataset 必须显式声明 `portable`；只有允许嵌入的数据进入 standalone，不允许嵌入时保留当前静态结果并移除筛选栏

## 2026-08-09

### 决策 35：图表类型是受控内容属性，生成与交付使用分层渲染

- 结论：图表组件以 `props.chartType` 保存 `line / area / bar / horizontal-bar / pie` 五类受控内容；AI 按显式名称或趋势、累计、对比、排名、构成语义选择，用户可在局部设置中继续切换
- 原因：图表类型表达数据关系，不属于全局视觉主题；受控目录既让提示词可稳定调用，也避免模型生成任意配置或 DOM
- 边界：Studio 可用 ECharts SSR 生成高质量 SVG，默认成品只固化内联结果；需要筛选联动时仅嵌入轻量便携 SVG 更新器，不把 ECharts、Studio API 或任意图表配置带入 standalone

## 2026-08-10

### 决策 36：局部 AI 修改使用窄命令、字段差异与漂移安全撤销

- 结论：组件级请求必须声明稳定组件 ID，并只生成目标字段 command batch；平台在隔离 workspace 上计算字段级差异，接受时把正向命令和可逆反向命令共同写入 revision
- 原因：整页替换无法让用户确认 AI 实际改了什么，也会在撤销时覆盖后来手动完成的视觉或布局调整；字段级命令才能审计、评审和精确恢复
- 边界：当前只撤销最新且仍与提交快照一致的 revision；存在后续 revision 或手动漂移时拒绝执行。超过 500 个字段变化才允许反向批次退化为根快照恢复，组件局部修改不得触发该退化路径

### 决策 37：结构编辑以 Workspace 为真相，历史恢复只追加版本

- 结论：卡片新增、复制、删除、调宽和排序必须转成针对稳定 ID 的受控 command batch；Workspace 是结构真相，预览 DOM 只是可重建视图。恢复任意旧 revision 时追加新的恢复 revision，不改写或删除既有历史
- 原因：直接修改 DOM 会让文档、布局、画布顺序、筛选目标和视觉覆盖漂移；用根快照恢复又会隐藏实际结构变化并破坏审计。稳定 ID 数组的精确 `insert / remove / move` 命令可以原子同步关联状态，并生成无损反向命令
- 边界：新卡只能从注册组件类型和受控模板创建，必须分配独立 ID 并重新绑定编辑交互；摘要卡暂不复制，分区最后一张卡不得删除；历史恢复前必须确认当前 workspace 与 current revision 一致，存在手动漂移时拒绝覆盖

### 决策 38：远程模型通过服务端 Provider Gateway 接入，不提供隐式默认模型

- 结论：Studio 的 `draft / refine` 统一通过 Provider Gateway；默认使用确定性 provider，显式配置后使用 OpenAI Responses 适配器。远程模型必须由 `DASHBOARD_AI_MODEL` 指定，不由代码静默选择“最新模型”
- 原因：模型供应、版本和成本会变化，直接把 SDK 或默认模型写进 UI 会让生成行为不可复现；Gateway 可以让本地测试与真实模型复用同一 generation bundle、单次修复、隔离预览和 revision 协议
- 边界：API key、模型和 endpoint 仅在服务端环境；模型的 schema-guided JSON 仍是不可信候选，必须经过本地 schema、命令物化和 provenance 校验。当前已完成假上游 HTTP 合同测试，真实联网质量不能在无有效密钥时宣称通过

### 决策 39：Project Store 以服务端 revision 为真相并使用乐观并发

- 结论：Studio 将每个 Project 作为版本化 JSON 文档原子落盘；接受、撤销和恢复均针对服务端当前 revision 执行，使用 `expectedRevisionId` 检测过期写入，同项目操作在单进程内串行化
- 原因：让浏览器携带完整项目只能形成客户端快照，服务重启、多个标签页或未来多人访问时会丢失或覆盖 revision；服务端权威状态和条件写入是版本产品的最小可靠边界
- 边界：当前文件仓库适合单机 Studio；多实例部署必须替换为支持事务或 compare-and-swap 的共享数据库。纯 revision 领域规则继续进入轻量 Skill，文件 repository、API 和项目数据不得进入 Skill 或 standalone

### 决策 40：正式 standalone 从指定 revision 确定性导出

- 结论：正式成品由可移植 `revision-exporter` 从显式 Project revision 渲染，输出 HTML 与 SHA-256；相同 revision 产生相同字节，Studio 的保存成品入口优先调用服务端 revision 导出
- 原因：克隆编辑器 DOM 会把临时预览、未提交修改、运行时注入和 CSS 偶然状态带入成品，无法复现、审计或验证发布内容
- 边界：portable dataset 才能进入最小交互运行时；有效 workspace 必须先保存为 revision，空白视觉模板不能导出。旧浏览器项目只允许在服务端无同 ID 时迁移一次，不得覆盖已有 revision

### 决策 41：显式保存将手工修改追加为用户 revision

- 结论：结构化项目中的视觉、布局、筛选和其他手工修改在用户点击保存时，以 `source: user` 追加不可变 revision，并使用当前 revision ID 做乐观并发检查；本地存储只作为草稿缓存和重载加速
- 原因：只把手工修改写入 localStorage 会让版本历史、撤销、恢复和确定性导出看不到用户实际编辑结果，也无法处理多标签页冲突
- 边界：不对每次输入自动产生 revision，避免历史噪声；尚未迁移为结构化 `document` 的初始空白模板只能明确保存为本地草稿，不能伪装成平台 revision

### 决策 42：原始数据驻留服务端，便携副本必须由用户显式授权

- 结论：CSV/JSON/Excel 原始记录保存为 Studio 服务端 Dataset；Excel 在服务端选择工作表并只读取保存的单元格值，不执行公式。Provider 只接收字段摘要和受控样本。只有用户明确选择“随成品携带”时，受限记录副本才进入 workspace、revision 和 standalone
- 原因：把上传文件默认塞入浏览器项目、模型上下文或成品会扩大数据泄漏面，也会让刷新、版本与发布边界混乱；显式便携策略能同时支持离线交付和敏感数据隔离
- 边界：当前便携副本最多 500 行，Provider 样本最多 12 行；非便携数据暂不生成运行时绑定，后续由 Publication 数据快照与服务端查询补齐，不得用隐藏复制绕过限制

### 决策 43：物理字段与语义模型分层，自动推断必须允许人工确认

- 结论：Dataset 保存稳定字段、原始规范化值、转换记录和质量画像；Semantic Model 独立保存维度、指标、聚合、数字格式和时间粒度。AI 生成优先消费语义模型，不把字段顺序当业务口径
- 原因：类型推断可能把编码当数字并丢失前导零，数值字段也不天然等于可求和指标；把语义直接写进卡片会导致多个组件口径漂移，且无法在数据刷新后复用
- 边界：字段修正必须从服务端 `rawRecords` 重算；语义更新以 `expectedUpdatedAt` 拒绝过期覆盖。当前支持 `sum / average / min / max / count`、数字/整数/百分比/人民币格式和自动/日/周/月/季度/年时间粒度

### 决策 44：数据消费必须经过 Semantic Query

- 结论：组件、刷新任务和 Publication 不接受任意物理字段或 SQL，只通过已确认的维度/指标 ID 发起受控查询；查询结果携带 Dataset 指纹、更新时间和语义版本
- 原因：直接让页面绑定原始字段会绕过业务口径、扩大数据暴露面，并在字段修正或刷新后静默漂移；受控查询可以统一聚合、筛选、时间粒度和过期判断
- 边界：当前单次最多 3 个维度、12 个指标、12 个筛选和 200 个结果组；非便携首稿只固化聚合显示值，不把明细 records、凭证或运行时 binding 写入 workspace

### 决策 45：Publication 固定不可变 revision 和数据快照元数据

- 结论：发布必须创建独立 Publication，对应指定 project revision、确定性 HTML artifact 与 SHA，并记录所引用 Dataset 的指纹、语义版本和聚合查询快照；同一 Publication ID 不允许覆盖
- 原因：把当前编辑画布直接当发布会使手工草稿、数据刷新和后续 revision 改变既有 URL 内容，也无法审计发布时看到的数据版本
- 边界：当前 `private / unlisted / public` 只是单机 Studio 的访问策略元数据，不构成网络身份鉴权；正式公开 URL、令牌、RBAC、撤回和重新发布仍需后续访问层实现

### 决策 46：数据刷新使用 last-known-good，查询缓存绑定数据与语义版本

- 结论：上传型 Dataset 刷新必须在新文件解析、字段兼容和 Semantic Model 校验全部成功后原子替换；失败只更新独立 refresh 状态并继续服务最后成功版本。Semantic Query 缓存键必须包含 Dataset 指纹和 Semantic Model 版本
- 原因：先清空再导入会让一次坏文件造成看板不可用；只按查询文本缓存会在数据或业务口径改变后返回旧结果。last-known-good 与版本化缓存共同保证失败隔离和刷新一致性
- 边界：当前是用户重新上传触发的同步刷新和单进程 TTL/LRU 缓存；连接器调度、指数退避、共享缓存和任务监控进入后续 job-service，不用同步 API 冒充后台任务

### 决策 47：REST 数据连接必须由服务端白名单和凭证引用控制

- 结论：REST Connector 只允许服务端配置的精确 HTTPS 主机和 GET 请求，不跟随重定向；客户端只能提交 URL、recordsPath 和 `credentialRef`，实际认证头只在服务端解析
- 原因：允许任意 URL、浏览器密钥或自动重定向会引入 SSRF、凭证泄漏和不可审计的数据出口；服务端策略可以在抓取发生前拒绝越界请求
- 边界：当前凭证来自服务端环境映射，只允许 Authorization、X-API-Key 和 Accept；企业部署需要 Secret Manager/KMS、网络出口控制和凭证审计。开发环境的 HTTP 必须显式开启，生产默认禁止

### 决策 48：自动刷新必须建模为可恢复 Job

- 结论：REST 自动刷新创建持久化 Job，状态为 queued/running/retrying/succeeded/failed；失败使用有上限指数退避，服务重启恢复未完成任务，同一 Dataset 只允许一个活跃刷新 Job
- 原因：同步 HTTP 请求无法可靠承担长耗时、退避重试、服务重启和可观察状态；把重试藏在请求内部也会让用户无法区分排队、运行和失败
- 边界：当前 Job 仅支持 REST Dataset 刷新，最多 5 次，错误信息脱敏且不保存响应正文；上传文件没有可重用的新载荷，只支持人工重新上传。固定间隔与取消后来由决策 51 补齐，优先级和分布式队列仍未实现

### 决策 49：撤回 Publication 只关闭 artifact，不改写发布历史

- 结论：撤回将 Publication 标记为 `revoked`，artifact 访问统一返回 `410 Gone`；既有发布元数据、revision、SHA 和数据快照继续保留，重新发布必须创建新的 Publication
- 原因：删除或覆盖发布对象会破坏审计链，也无法区分“从未发布”和“曾发布后撤回”；明确终态可让管理 UI、访问层和后续审计使用同一事实
- 边界：当前撤回已同时关闭管理 artifact 和访客共享路径，但不是完整 RBAC；组织身份、细粒度权限、审批和合规留存仍由后续企业访问层实现

### 决策 50：共享访问与管理下载分离，持链接令牌只存哈希

- 结论：管理端 artifact API 继续服务 Studio；访客只通过 `/p/:publicationId` 进入访问策略执行。unlisted 使用 192-bit 随机令牌，创建时展示一次，仓库只保存 SHA-256；public 不使用令牌，private 对访客返回 `404`
- 原因：把 visibility 仅作为标签无法形成真实安全边界；让访客复用管理 API 又会绕过策略。不可恢复令牌降低仓库泄漏后的直接访问风险，`404` 避免区分私有对象是否存在
- 边界：访问事件仅记录 publication、时间、允许/拒绝及原因，不记录令牌、URL、正文或 IP；当前管理 API 依赖单机可信环境，正式托管前仍需身份认证、RBAC、速率限制和集中审计

### 决策 51：自动刷新使用固定间隔计划，执行仍复用可取消 Job

- 结论：首个产品版本只开放 15 分钟至 30 天的固定间隔，不接受任意 cron；Schedule 保存 nextRunAt 并在到期时创建普通 Refresh Job。取消 running Job 后，连接器迟到结果必须丢弃，不得写入 Dataset
- 原因：固定间隔覆盖常见 Dashboard 刷新需求，避免 cron 时区、夏令时和表达式误配；调度与执行分离可复用既有退避、冲突和可观察状态。只改变 UI 状态而继续提交迟到响应不构成真正取消
- 边界：file provider 仍为单进程定时器；PostgreSQL provider 通过持久租约、确定性 Job ID 和活动 Dataset 唯一约束实现多实例接管。服务停机期间不会补跑全部历史周期，只处理最近到期计划；外部连接器不是幂等时仍只能提供 at-least-once，不能声称 exactly-once

### 决策 52：图片、PDF 与嵌入必须消费已发布 artifact

- 结论：PNG/PDF 渲染和 iframe embed 都以 Publication 内固定 HTML 为唯一输入，不读取当前编辑 DOM、最新 revision 或刷新后的 Dataset；PNG/PDF 使用受控 Chromium，embed 复用共享访问策略
- 原因：从当前画布截图或重新查询数据会让同一发布 ID 的 HTML、图片、PDF 和嵌入内容不一致，破坏审计与可复现性；同一 artifact 是多格式交付的共同事实
- 边界：当前 PDF 是与 Dashboard 高度一致的单页长 PDF，优先视觉保真，不宣称具备分页报告的页眉页脚、目录和断页编排；后者应作为独立 paged-report renderer

### 决策 53：登录令牌只换取 HttpOnly 服务端会话

- 结论：单机 M4 身份源使用服务端配置 token，浏览器登录后只持有 HttpOnly、SameSite=Strict 会话 Cookie；管理 API 统一执行 viewer/editor/admin 角色与同源 Origin 校验，share/embed 保持独立 Publication 授权
- 原因：把长期 token 写入 localStorage 或每次 API 请求会扩大 XSS 和日志泄漏面；服务端会话可以撤销、过期并让浏览器代码无法读取凭证。公开访问与管理身份分离可避免共享链接获得 Studio 权限
- 边界：会话当前在单进程内存中，服务重启后失效；admin 暂无用户管理入口。正式企业部署仍需要 IdP/SSO、共享会话、MFA、速率限制、组织策略和集中审计

### 决策 54：全局角色限制能力上限，Project ACL 决定资源范围

- 结论：Project 保存单一 owner 和 viewer/editor 成员；全局 admin 可管理全部项目，全局 editor 只有获得项目 owner/editor 后才能写入，全局 viewer 始终只读。Publication 管理和访问审计继承所属 Project 权限，访客 share/embed 继续独立授权
- 原因：只使用全局角色会让任意 editor 修改全部项目，只使用项目角色又无法表达平台管理员和只读账户的能力上限；两层取交集是主流且可继续扩展到组织角色的授权模型
- 边界：历史无 owner 项目只允许 admin 访问，不自动暴露给普通用户；当前成员来自服务端 token 身份源，尚无组织、邀请、SSO、行级数据权限或集中策略引擎

### 决策 55：Project 复制只复制当前版本，归档是可恢复只读状态

- 结论：复制 Project 时创建新 ID、新 owner 和一个以来源 current revision 为内容的 system revision，不复制旧成员或完整历史；归档保留对象与版本但禁止新写入，owner/admin 可恢复
- 原因：完整克隆成员与历史会把来源项目的权限和审计身份错误带入副本；删除项目又会破坏 revision 和 Publication 引用。单版复制与可恢复归档分别满足复用和生命周期管理
- 边界：名称、ACL、归档使用 `expectedUpdatedAt` 乐观并发，不产生内容 revision；当前项目中心使用浏览器原生确认/命名对话，正式前端拆分时可替换交互而不改变 API 语义

### 决策 56：组织范围先于 Project ACL，管理写入必须产生最小审计事件

- 结论：身份与新 Project 固化 organizationId，所有目录、项目和审计查询先隔离组织，再计算全局角色与 Project ACL；项目创建、复制、重命名、归档、恢复和成员更新追加审计事件
- 原因：仅靠 Project 成员列表无法阻止跨租户管理员或错误成员 ID 越界；没有服务端审计又无法回答谁在何时改变了项目生命周期或权限。组织硬边界与资源 ACL 必须分层执行
- 边界：当前组织来自受控 token 配置，没有组织管理后台或跨组织委派；单机 Project 使用嵌入式 transactional outbox，PostgreSQL 使用共享事务 outbox、hash chain 和 append-only trigger。HMAC seal 不是外部锚定或合规保留策略，仍需独立归档/保留控制

### 决策 57：Studio 按业务模块渐进拆分，通过窄 bridge 连接现有编辑器

- 结论：不一次性重写单文件编辑器；先把已稳定的 Project Center 抽为 `studio/project-center.mjs`，编辑器只暴露冻结的结构化 bridge。后续 AI、数据和发布模块沿同一模式迁移
- 原因：一次性框架重写会同时改变 workspace、渲染、交互和导出，难以定位回归；按稳定业务边界抽离可以保持真实浏览器证据，并逐步减少 DOM 与 API 耦合
- 边界：bridge 不提供任意 DOM 访问或内部状态引用，只提供 clone 后的 Project 和受控应用方法；Studio 模块不进入便携 Skill 或 standalone，正式框架选型仍需在模块边界稳定后决定

### 决策 58：Data Source 生命周期独立于 workspace 编辑

- 结论：文件导入、REST 连接、Semantic Model、刷新 Job 和 Schedule 由 `studio/data-source-center.mjs` 负责；主编辑器只保存当前 Dataset 的 clone，并把其 ID 作为结构化 Data Context 交给 AI 请求
- 原因：数据连接生命周期与画布 revision 不同，直接共享 DOM 或可变对象会让刷新、字段修正和 AI 生成互相污染；窄 bridge 可让模块独立演进并保持 workspace 提交边界
- 边界：当前浏览器刷新后只同步当前会话选中的 Dataset；文件载荷不写 workspace，REST 凭证仍只由服务端 credentialRef 解析；多数据源目录与共享数据资产管理留到后续平台阶段

### 决策 59：AI Composer 先拆 UI 控制器，再拆生成事务编排

- 结论：`studio/ai-composer-center.mjs` 先接管工作台壳层和用户事件，通过 bridge 获取只读组件摘要并发出受控命令；候选、隔离预览、commit、undo 和历史恢复暂留编辑器内核
- 原因：UI 状态与 revision 事务同时迁移会扩大回归面，难以判断问题来自交互还是版本语义；先切断 DOM 事件耦合，可在保持既有生成证据的同时形成稳定 orchestration 接口
- 边界：bridge 命令是显式白名单，不接受脚本、DOM selector 或任意 workspace patch；下一阶段迁移事务状态时仍必须保持 preview-before-commit、乐观并发和无损反向命令不变量

### 决策 60：History 模块发起恢复，编辑器只应用已验证结果

- 结论：AI Composer 模块拥有 history/restore 网络请求和历史 DOM；bridge 只返回 clone 后的 Project、当前 workspace 与 revision ID，并提供单一 `applyRestoredRevision` 方法
- 原因：历史查询属于工作台业务编排，但 workspace DOM、选择状态和持久化仍是编辑器内核职责；把任意 workspace patch 能力交给模块会破坏既有校验与恢复不变量
- 边界：模块不能直接读取或修改编辑器局部状态；恢复 payload 必须先由服务端验证，编辑器应用失败时整体拒绝。候选、commit 和 undo 后续已按同样的窄 bridge 原则由决策 61 完成迁移

### 决策 61：AI 事务状态归 Composer，编辑器只执行单用途应用动作

- 结论：pending run、baseline、目标组件、health、candidate、Review、commit 和 undo 全部由 `studio/ai-composer-center.mjs` 持有；编辑器 bridge 只提供 clone context，以及 `applyAiPreview / applyAiCommit / applyAiUndo / applyRestoredRevision`
- 原因：候选生命周期属于同一产品状态机，分散在模块按钮和主 HTML 事务函数中会形成双重状态源；四个单用途动作既能让 AI 流程独立演进，又保持 workspace DOM、选择状态、Project 与本地持久化只有编辑器内核能修改
- 边界：bridge 不接受任意 command 名、selector 或 JSON Patch；preview 仍先由服务端校验，commit/undo/restore 仍使用 Project revision 乐观并发。模块拥有编排不代表可绕过服务端生成协议或直接写 Project Store

### 决策 62：导出编排只接受不可变 revision

- 结论：`studio/export-center.mjs` 在导出前调用共享 `prepareRevision`，把有效 workspace 的未保存修改追加为 user revision，再从服务端请求确定性 artifact；无 document 的空白视觉模板不能导出。历史 `serializeFallbackExport` DOM 克隆入口已移除
- 原因：两条导出路径会让同一画布产生不同结构、样式和交互结果，也让未校验 DOM 绕过 workspace/revision 审计。自动版本化保留“一键导出”体验，同时让下载、发布和历史使用同一个事实源
- 边界：Export Center 只能读取 clone 后的 Project/Revision/workspace 摘要并请求 artifact，不能读取或序列化编辑器 DOM；发布复用同一 `prepareRevision`。文件系统选择器仍只是 artifact 的保存介质，不参与内容生成

### 决策 63：先外置 Editor Runtime，再拆状态内核与 Renderer

- 结论：预览 HTML 不再承载内联 JavaScript，workspace 编辑器先整体迁到 `studio/editor-runtime.js`；Project、AI、Data、Publication 和 Export 模块继续独立加载
- 原因：内联 classic runtime 无法在初始化前复用 ESM workspace-core，也无法单独执行严格语法检查；先建立明确文件入口，后续才能按状态、renderer、interaction adapter 逐层拆分，而不同时改变页面结构和全部行为
- 边界：外置文件仍是现有 editor 的过渡实现，不等同于 renderer 已完成解耦；每次后续拆分必须保持零内联脚本、standalone 移除全部 Studio 脚本，以及 workspace/revision 浏览器回归

### 决策 64：浏览器与服务端共用同一 Workspace Core

- 结论：Editor Runtime 以 ESM 直接导入便携 Skill 的 `migrateWorkspace/validateWorkspace`；所有恢复来源先规范化和校验，再进入主题、布局、文档与 Logo DOM 应用
- 原因：编辑器原先只检查版本号、主题和预设，服务端却执行完整 schema 语义，可能让本地草稿或 Project 在浏览器中接受服务端会拒绝的结构；共享 core 消除双重事实源
- 边界：workspace-core 只处理结构状态，不接触 DOM、localStorage 或网络；renderer adapter 仍由 Editor Runtime 负责。恢复失败必须保持当前画布不变，调用方只能收到受控失败，不能部分应用

### 决策 65：持久化介质通过可注入 Workspace Session 隔离

- 结论：本地草稿、URL state、旧 hash config、工程内嵌状态和旧历史键清理由 `studio/workspace-session.mjs` 统一处理，并返回结构化成功或错误结果
- 原因：localStorage、location、history 和 DOM 脚本读取原先直接混在 Editor Runtime，既难以覆盖坏 JSON、配额失败和兼容 URL，也让渲染入口承担介质策略；注入依赖后可在 Node 中确定性测试
- 边界：Session 不迁移或校验 workspace，不显示文案、不维护 dirty 状态，也不决定恢复后的 DOM；Editor Runtime 保留 URL > 本地 > 工程的优先级和错误文案，所有成功输入仍必须经过共享 Workspace Core

### 决策 66：Renderer 只接收已物化 Document

- 结论：`studio/workspace-renderer.mjs` 只把已完成数据绑定物化的 document 投影到既有 Dashboard DOM，不读取 workspace、theme、selection 或 revision 状态
- 原因：结构状态迁移、筛选计算、网络图表和编辑器事件具有不同生命周期；先隔离同步 DOM 投影，可以消除主运行时中的组件类型分支，同时避免一次迁移全部交互造成回归面失控
- 边界：Renderer 不创建卡片结构、不绑定控件、不请求图表服务，也不持久化；Editor Runtime 仍负责 materialize、结构同步、控件与异步图表，后续分别抽成 Interaction Renderer 和 Chart Adapter

### 决策 67：控件 Renderer 使用单向结构化动作

- 结论：`workspace-control-renderer.mjs` 接收 controls 与 interactions 快照，负责 filter-bar、view-tabs、ARIA 和目标反馈，只通过 `onFilterChange/onViewChange` 回传值与目标 ID
- 原因：控件 DOM 与 Workspace 事务混写会让一次选择同时修改状态、重绘、派发事件和保存，难以验证所有权；单向动作让 Editor Runtime 继续作为唯一状态写入者
- 边界：Renderer 不持有 interactions 引用、不调用 document 重算或持久化；初始 Tab 解析以 `initial` 动作写回默认值但不标记 dirty，用户点击才触发保存

### 决策 68：异步图表生命周期归 Chart Adapter

- 结论：`workspace-chart-adapter.mjs` 负责受控组件的序列归一化、服务请求、payload 缓存、render key 竞态保护、容器 ARIA 和 portable SVG 降级，并返回可观测状态
- 原因：异步 SVG 响应可能晚于筛选、改类型或卡片删除；若网络和 DOM 生命周期留在 Editor Runtime，状态事务会与渲染竞态耦合。Adapter 用 render key 在写 DOM 前验证目标仍有效
- 边界：Editor Runtime 仍决定受控图表类型、主题 palette 和静态示例模型；Adapter 不修改 Workspace、不选择图表、不保存 revision。柱状图继续使用轻量原生 DOM，其他类型走服务端 SVG 并在失败时使用注入的便携 SVG

### 决策 69：Workspace 快照由独立状态内核组成和拆分

- 结论：`workspace-state-core.mjs` 统一 `composeWorkspaceSnapshot / normalizeWorkspaceSnapshot / workspaceSlices`，并直接复用便携 workspace-core 的迁移与校验
- 原因：保存时引用当前可变 theme/document，恢复时再在 Editor Runtime 手写 JSON clone，会让快照隔离与校验边界分散；状态内核确保输出快照和恢复切片都与调用方可变对象隔离
- 边界：状态内核不持有长期可变 store，不操作 DOM、布局编辑器或 localStorage；Editor Runtime 仍是当前会话状态所有者，但不得自行迁移、校验或拼装 Workspace 协议对象

### 决策 70：布局手势规则与 DOM 拖动生命周期分离

- 结论：`workspace-layout-interaction.mjs` 负责 12 列跨度吸附、5px 启动阈值、四向落点、纵向插入限制和带 15% 防抖区的 canvasOrder 重排
- 原因：这些几何规则必须在鼠标、触控和键盘路径间一致，混在 DOM 监听器中只能靠人工拖动发现边界回归；纯函数可确定性覆盖中点和防抖区
- 边界：规则模块不访问 DOM、不捕获指针、不创建占位或动画；Editor Runtime 继续拥有实时 rect、elementFromPoint、FLIP 动画和 dirty 状态，后续再抽 DOM Layout Controller

### 决策 71：Layout Controller 独占配置与 DOM 双向映射

- 结论：`workspace-layout-controller.mjs` 通过注入的 canvas node、选择器同步和变更回调实现 `getConfig/applyConfig`，负责 summary/section/item 跨度、grouped/layout、分区与卡片顺序
- 原因：布局序列化和恢复原先嵌在 setup 函数中，任何 schema 字段变化都需要同时修改保存与回放分支；Controller 把双向映射放在同一职责边界，并可独立约束跨度回退
- 边界：Controller 只接受已验证 Layout Config，不校验 Workspace、不创建卡片、不绑定拖拽；缺失 DOM ID 被忽略，未知配置由上游 State Core 拒绝。每次 apply 完成后通过单一 onChange 交回 dirty 编排

### 决策 72：Workspace 结构同步分为纯计划与注入式 DOM 应用

- 结论：`workspace-structure-synchronizer.mjs` 先以 Document 为成员真相、Layout 为顺序与跨度真相生成 create/move/update/remove 计划，再通过注入的查找、创建、追加、清理和绑定适配器应用到 DOM
- 原因：结构精修和历史恢复同时涉及缺失卡片创建、旧卡清理、跨分区移动与事件重绑；这些规则混在 Editor Runtime 时只能依赖整页回归，且容易误读上一次 workspace 状态。纯计划可独立证明顺序稳定和输入不可变
- 边界：同步器不迁移或校验 Workspace，不选择模板、不维护 selection/dirty，也不拥有拖拽监听；Editor Runtime 仍负责克隆模板、重写内部 ID，并把既有选择和布局绑定作为窄适配器注入

### 决策 73：Studio 文件仓库共享原子 JSON 原语但保留领域事务

- 结论：Job、Schedule、Dataset 与 Publication 仓库复用 `studio-json-file-store.mjs` 的安全路径、读取、列表、独占创建和原子替换；按 ID 串行队列、乐观并发和冲突错误继续由领域仓库负责
- 原因：四个仓库重复实现目录创建、JSON 格式、`0600` 权限、临时文件命名、rename 和失败清理，任何安全或耐久性修正都可能只落到部分仓库；集中原语建立一致基础设施边界，同时避免通用层理解业务状态机
- 边界：文件原语不验证实体 schema、不生成 ID、不执行 compare-and-swap 或跨对象事务；Project revision、追加式 Audit/Access Event 具有不同提交语义，不为减少文件数强行迁移。该模块属于单机 Studio，明确不进入轻量 Skill 或 standalone

### 决策 74：单机 Project 审计使用嵌入式 transactional outbox

- 结论：Project Repository 在同一次原子文件替换中提交业务状态与 `_outbox` 审计意图；dispatcher 将事件按稳定 ID 幂等追加到 Audit Repository，成功后再从 Project 快照确认删除
- 原因：原先 Project 写成功、Audit append 失败会让 API 报错但业务已生效，客户端重试可能遇到 stale/conflict 且记录永久丢失。嵌入同一 Project 文件是当前单机存储下唯一能消除该双写窗口的提交边界
- 边界：`_outbox` 是仓储内部元数据，对外 get/list/update、revision、导出和 Skill 一律不可见；投递失败不回滚已提交业务，启动、写后和查询前都会重试。文件方案不提供多实例锁、全局顺序或防篡改能力，托管部署必须替换为共享数据库事务 outbox 和集中审计 sink

### 决策 75：仓储 provider 必须通过显式端口与能力证明部署等级

- 结论：`studio-storage-runtime.mjs` 统一校验七个仓储端口并提供只读 readiness；provider 必须声明 durability、shared、multi-instance、条件写、事务、outbox 与 production-ready 能力
- 原因：服务原先通过运行时偶然调用隐式判断 repository 接口，缺方法只在用户走到特定功能时暴露；同时“服务能启动”容易被误解为“可多实例部署”。fail-fast 契约与能力响应把功能完整性和部署等级变成可观测事实
- 边界：readiness 不写业务数据、不泄露目录或对象数量；file adapter 可 operational 但固定 local-only。接口不是 PostgreSQL 实现，也不允许仅更改 provider 名称宣称生产就绪；共享 adapter 仍需真实事务、并发和故障测试

### 决策 76：PostgreSQL 条件写使用事务级 advisory lock 与行锁

- 结论：PostgreSQL adapter 在 Project 写事务内先按 Project ID 获取 `pg_advisory_xact_lock`，再以 `SELECT ... FOR UPDATE` 读取当前记录并比较 revision/metadata 版本；Project 状态和 `_outbox` 在同一事务提交，Audit 以事件 ID 幂等写入独立表
- 原因：仅依赖进程内队列无法跨实例串行同一 Project，单独 compare 后 update 又存在检查与写入窗口；事务级 advisory lock 同时覆盖尚未创建和已存在的 Project，行锁则固定已有记录的读取与更新边界
- 边界：锁只保证仓储写入一致性，不提供任务租约或合规级审计；共享 Session 由独立 repository 契约负责。JSONB 对象键序不是业务语义，revision 漂移判断必须使用结构深比较，不能使用 `JSON.stringify` 字节比较

### 决策 77：共享 Session 只持久化 Cookie 摘要与身份引用

- 结论：Auth Service 通过异步 Session Repository 读写会话；Cookie 保存 256-bit 随机值，repository 以其 SHA-256 摘要为主键，只记录 actorId、organizationId 和 expiresAt。file 默认使用内存实现，PostgreSQL 自动使用共享表
- 原因：原始 Session ID 一旦数据库泄露即可直接重放；完整 actor 快照又会让角色或身份配置变更无法及时生效。摘要索引兼顾精确查找与泄露防护，身份引用使每次请求都重新服从当前受控目录
- 边界：摘要不能替代数据库访问控制和传输加密；当前 token 目录仍由服务端环境提供，不是 IdP。共享 Session 解决跨实例登录状态；Refresh 租约由独立执行协议负责，二者都不解决速率限制、SSO/MFA 或集中策略管理

### 决策 78：Refresh 执行使用可过期租约与 fencing token

- 结论：Job 领取时写入 owner、随机 token 和 expiresAt；正常执行以 heartbeat 续租，所有成功、失败、取消和 Dataset 写入前都核对 token。Schedule 先领取同类租约，再用 `scheduleId + scheduledFor` 派生确定性 Job ID；PostgreSQL 对同 Dataset 的 queued/running/retrying Job 加唯一约束
- 原因：仅在进程内 `resume()` 去重无法阻止多实例同时执行，单纯锁定 Schedule 又会在“Job 已创建、Schedule 未确认”崩溃窗口产生重复任务。过期接管提供故障恢复，fencing 阻止旧 worker 的迟到结果覆盖接管者，确定性 ID 让崩溃重放复用原 Job
- 边界：外部 REST 刷新本身不具备分布式事务或幂等键时，平台语义是 at-least-once；租约不能保证 exactly-once，也不承担共享 Query Cache、全局限流或合规审计

### 决策 79：集中审计以 append-only hash chain 和可选 HMAC seal 验证

- 结论：PostgreSQL Audit Sink 对每个 organization 使用 advisory lock 分配连续 sequence；每行保存 previousHash、payloadHash、eventHash，数据库 trigger 拒绝普通 update/delete。配置 `DASHBOARD_AUDIT_HMAC_KEY` 时，以独立 key seal 每个 event hash；受权 API 只返回当前组织的验证摘要
- 原因：稳定 event ID 只能防止重复写，不能发现记录被改、删或重新排序。每组织链使并发写入不分叉，canonical payload hash 检查内容，HMAC 把数据库与应用密钥分离，使仅拥有数据库写权限的主体不能重算可信链
- 边界：HMAC key 仍由当前应用进程使用，未提供 key 轮换、外部链头锚定、WORM 存储或法定保留期；拥有数据库 DDL 权限和 key 的同一主体仍能伪造历史，不能用此实现宣称完整合规审计

### 决策 80：语义查询缓存以数据版本正确性优先于命中率

- 结论：缓存 key 固化 Dataset ID、fingerprint、Semantic Model version 与规范化查询；file 使用受限 LRU，PostgreSQL 使用共享 TTL 表。Schema、手动刷新与后台 Refresh 成功后按 Dataset 清理，查询结果只缓存已聚合响应
- 原因：只按 Dataset ID 缓存会在刷新或口径变更后返回错误数据；只等待 TTL 则会遗留大量旧版本项。版本键保证任何失效漏信号仍安全 miss，定向清理缩短旧项生命周期并降低托管数据库空间消耗
- 边界：缓存不是事务快照、分布式锁或持久查询历史；并发 cache miss 可重复计算同一个纯查询，优先保持简单可验证，不在当前阶段引入单飞锁、跨请求配额或全局缓存预热

### 决策 81：认证身份源与组织成员治理分离

- 结论：token 环境配置只提供受控身份与凭证验证；Organization Repository 持久化组织名、成员状态和组织角色。每个请求重新解析当前成员状态，暂停成员会立即失去现有会话的访问权；组织管理员可变更组织元数据和成员角色，但不能跨组织拉取身份
- 原因：将 organizationId 固化在 token 配置中只能做粗隔离，无法撤销成员或提供持久化治理。把凭证和成员状态混在 Project ACL 中会让组织范围与资源范围相互污染
- 边界：当前不是 IdP 或邀请系统，成员仍须预先存在于服务端受控身份目录；未提供跨组织委派、SSO、MFA 或行级数据权限

### 决策 82：外部身份与行级策略必须以声明契约和数据策略为先

- 结论：下一阶段优先定义 OIDC/SAML 的 issuer、audience、回调 URL、稳定 subject、组织/角色声明映射与 JWK 轮换契约；行级权限只接受服务端 Semantic Query 中可验证的策略引用，不接受模型、浏览器或 workspace 传入任意表达式
- 原因：在未明确 IdP 声明和数据源策略维度时直接实现“SSO”会把供应商字段、token 解析和组织归属硬编码进 Studio。行级过滤若由 Agent 或前端拼接会绕过现有受控查询与审计边界
- 边界：当前 token 身份源继续作为开发/受控部署回退；未配置受信 IdP 时不声称 SSO 已启用。具体 IdP 连接、SCIM 邀请与行级字段策略需在租户数据合同确定后实现

### 决策 83：企业身份使用服务端 OIDC 与不可变 subject 绑定

- 结论：正式 SSO 采用 OIDC Authorization Code + PKCE，Studio 服务端作为 confidential client；以 `(issuer, subject)` 创建或查询 `ExternalIdentity -> OrganizationMember` 映射，默认禁用 JIT 组织入驻
- 原因：浏览器保存 provider token 会扩大泄漏与会话撤销面；以 email/domain/group 作为身份主键会在改名、域重用或 IdP 配置错误时改变授权归属。不可变 subject 和现有服务端 Cookie/session 模型可保持身份验证与组织/Project 授权分离
- 边界：此决策定义实现合同，并不表示 OIDC、SAML、MFA 或 provider logout 已实现；token 身份源继续作为本地/受控回退。邀请与 SCIM 只提供成员生命周期输入，不可凭外部声明绕过组织角色或 Project ACL

### 决策 84：邀请、SCIM 与手工成员操作共用一个可撤销生命周期

- 结论：邀请与未来 SCIM 通过同一个成员生命周期服务写入成员、外部身份映射、session revocation 和组织审计；SCIM deprovision 采取暂停而非删除，并保留历史归属
- 原因：多套写入路径会让“最后一名管理员”、角色上限、乐观并发、审计和跨实例会话失效产生不同语义。统一服务可让成员来源扩展而不改变授权事实
- 边界：SCIM 是服务端到服务端接口，凭证只存 secret reference；group 映射仅能写配置允许的组织角色，不能自动授予 Project owner。当前没有 invitation delivery 或 SCIM endpoint

### 决策 85：外部审计锚定采用异步 outbox，不参与业务写入提交结果

- 结论：每组织 audit hash chain 的已提交 head 通过 durable anchor outbox 异步投递给独立 append-only sink；以稳定 anchor ID 幂等重试，报告 freshness/status，但 sink 失败不回滚业务或内部 audit 事件
- 原因：把第三方存储可用性放入 Project、成员或审计业务事务会让正常操作因外部网络故障失败；仅保留内部 HMAC seal 又无法防御同一主体同时持有数据库 DDL 与密钥的历史重写。独立 sink 增加证据边界，同时保留可用性
- 边界：anchor payload 只含组织引用、head sequence/hash、时间与算法版本，不含 audit body、workspace、Dataset、IP、token、URL、模型内容或 secret。当前无外部 sink、WORM 留存或合规保留声明

### 决策 86：模型质量使用版本化 eval suite 和固定发布阈值

- 结论：多领域 draft 与目标组件 refine 共用 `evals/generation-cases.json`，通过 Provider Gateway 生成隔离 preview，并按 100 分 rubric 评分；单例 85、平均 90、通过率 100% 是当前发布门槛
- 原因：schema 通过只证明输出合法，smoke 通过只证明接口连通，都不能证明页面类型、图表语义、来源标记、可编辑结构和局部修改范围符合产品预期。版本化案例让模型、prompt 和协议变更可比较
- 边界：确定性 eval 进入 CI，远程 eval 由显式模型与密钥触发；runner 不提交 Project、不保存候选正文，也不以自动分数替代视觉人工评审或真实用户任务指标。降低阈值必须作为架构决策记录

### 决策 87：Studio 生成默认使用持久化 Generation Job

- 结论：Studio 通过 `POST /api/generation/jobs` 创建 draft/refine 任务，再按任务 ID 轮询、取消或在刷新后恢复；同步 `draft/refine` 端点仅保留兼容。Generation Job 与 Refresh Job 共用仓储端口但以 `type` 严格隔离，并使用 owner/token/expiry、heartbeat 和 fencing 控制多实例执行
- 原因：真实模型延迟不能长期占用一次浏览器请求，也不能在页面刷新后丢失状态。只在前端 AbortController 取消无法恢复任务；只保存进程内 Promise 又无法跨重启或多实例。持久任务让状态、取消和恢复可观察，同时继续把候选隔离在 revision 提交之前
- 边界：任务持久化受控 request 和 baseline workspace 以支持恢复，但不持久化 DataContext、Dataset records 或凭证；执行时重新按服务端 Dataset 身份构建有界上下文。任务只允许同组织发起人或管理员访问。取消会向 Provider 传播 AbortSignal，并以 fencing 阻止迟到结果写回；成功任务仍须用户接受后才创建 revision

### 决策 88：反向代理部署使用显式公网 Origin，不信任转发头

- 结论：生产入口通过 `DASHBOARD_PUBLIC_ORIGIN` 固化 Studio 的 HTTPS origin；CSRF 校验使用该值而不是后端内部 Host 或客户端可提交的 `X-Forwarded-*`。配置 OIDC 时，每个 redirect URI 必须精确等于该 origin 下的受控 callback 路径
- 原因：代理不保留公网 Host 时，按内部请求 URL 校验会误拒浏览器写请求；无条件信任转发头则允许绕过代理直接访问后端的客户端伪造 origin。显式来源同时固定 Cookie、浏览器 API 与 IdP callback 的部署事实
- 边界：回环开发可使用 HTTP，其他来源只允许 HTTPS 且不得包含路径、查询、凭据或 hash。该配置不终止 TLS、不验证代理网络身份，也不替代代理层 Host allowlist、HSTS 和后端网络隔离

### 决策 89：生成可观测性使用最小任务 telemetry 与组织级聚合

- 结论：Generation Job 终态固化 queue/execution/total 毫秒数和 repairAttempts；组织管理员可读取默认 24 小时、最多 30 天的状态计数、成功/失败/修复率、p50/p95 与失败码分布
- 原因：单个任务轮询只能服务当前用户，不能回答模型升级后成功率、延迟或自动修复是否恶化。直接导出完整 GenerationRun 又会把 prompt、workspace、候选和用户身份带入监控面
- 边界：聚合 API 不返回 Job ID、actorId、prompt、workspace、候选、Dataset 或错误正文；取消不进入成功率分母，旧任务可由时间戳推导耗时。当前指标不是不可变计费账本、全局告警系统或 token 成本明细，大规模留存需替换为专用 telemetry store

### 决策 90：候选质量反馈使用接受/放弃行为，不采集自由文本

- 结论：成功 Generation Job 可由原发起人写入一次不可变 `accepted` 或 `dismissed` 反馈；接受可关联安全 revision ID，放弃可选最多三个受控原因码。AI Composer 在版本提交成功后记录接受，在取消预览后记录放弃
- 原因：schema 成功和 Provider 延迟不能说明用户是否保留结果；自由文本反馈会重复收集业务内容并扩大敏感数据、审核与注入面。稳定行为信号可计算候选可用率，并与自动 eval 和技术成功率分开观察
- 边界：相同反馈重试幂等，冲突改写拒绝；管理员不能代替用户提交，聚合不返回 Job/actor/revision。反馈上报失败不得回滚版本提交或恢复已放弃的预览；可用率是产品信号，不单独作为模型上线或员工绩效结论

### 决策 91：组件能力以注册表为目录真相，以跨层门禁保证执行一致

- 结论：`component-registry.json` 是内容组件和页面控件的能力目录，Studio 通过 `/api/components/catalog` 读取同一目录，Provider 继续直接接收该目录；Workspace Schema 和核心运行时保留各自适合校验执行的表示，由契约检查强制类型、必填属性、数据绑定和图表目录一致
- 原因：让 Schema、浏览器、导出器在运行时直接读取 JSON 会增加便携 HTML 和浏览器构建耦合；继续完全手写而不比对则会出现“Agent 能生成，但 Studio 不会渲染”或“目录有类型，导出器拒绝”的漂移。构建期门禁保留轻量部署，同时让新增能力必须一次通过全链路
- 边界：能力 API 只返回公开类型元数据，不返回模板、Workspace、数据、提示词或 Provider 配置；它不是插件安装接口。新增组件仍必须实现生成、校验、Studio 渲染、确定性导出和测试，不能仅修改注册表宣称可用

### 决策 92：Studio DOM 必须投影完整 Workspace 结构，不预置固定 Section

- 结论：结构协调层同时管理 Section 和 Component 生命周期；每次应用生成预览、项目版本或历史恢复时，先按 Workspace 删除废弃结构，再创建/复用并按模型顺序挂载 Section，最后同步卡片。动态 Section 的标题、布局和编辑工具由 Editor Runtime 注入，但结构身份只来自 Workspace
- 原因：仅同步既有 Section 内卡片会让合法 Workspace 出现“模型有、画布无”，预览通过却无法编辑；继续扩充静态 HTML 占位分区又会让模板决定 Agent 能生成什么。两级投影使自然语言可改变页面结构，并让版本恢复真正还原整页而非局部卡片
- 边界：协调层不决定业务分区内容，也不绕过 Workspace Schema；Section 删除必须随其卡片和布局引用一并由原子命令或完整 Workspace 产生。编辑工具只存在 Studio，standalone 仍由 revision exporter 直接按 Workspace 确定性输出

### 决策 93：Section 与 Component 共用局部 AI 事务，但作用域必须显式区分

- 结论：局部生成请求使用 `{ kind: section|component, id }` 目标；Section 只允许标题、副标题、顺序和受控增删，Component 继续处理卡片内容、图表、尺寸和结构。两者都生成非根路径 Command Batch，经隔离预览、用户接受和 revision 提交，并保存精确 inverse batch
- 原因：把分区指令伪装成卡片修改会让 UI 选区、Provider 提示和引用清理产生歧义；另建一套分区提交机制又会破坏现有预览、历史和撤销一致性。显式 scope 在复用事务链路的同时，把可修改边界固定在协议层
- 边界：新增分区使用一张注册的 `text` 组件作为有效初始内容；删除分区必须同步清理 Document/Layout、canvasOrder、筛选/视图引用、交互状态、分区与卡片视觉覆盖及图表资源，且不得删除最后一个分区。当前不支持跨分区自然语言移动单卡或任意嵌套分区

### 决策 94：行级权限在服务端 Dataset 边界执行，并进入缓存身份

- 结论：Dataset 由服务端固化组织归属；可选行级策略以部署配置绑定 `organizationId + datasetId`，按受控 actor/角色 grant 产生 Semantic Model 维度过滤。策略裁剪先于预览、查询、AI DataContext 与 portable 副本，Query Cache key 必须包含不透明授权 scope
- 原因：只在浏览器隐藏行或让 Agent 附加筛选既可绕过，也会让查询、首稿和导出看到不同数据；缓存若只按 Dataset 与查询键命中，还可能把一个主体的聚合结果返回给另一个主体。统一服务端投影保证所有消费路径使用同一授权视图
- 边界：浏览器、Workspace 和模型不能提交策略引用或物理表达式；无匹配 grant 失败关闭，跨组织按不存在处理。当前策略目录由环境配置管理，没有策略管理 UI、属性表达式语言或外部策略引擎；disabled 本地模式仅为历史无组织 Dataset 保留 `local` 兼容

### 决策 95：数据库连接使用预注册只读查询和显式部署 smoke，不开放浏览器 SQL

- 结论：PostgreSQL Connector 以 `DASHBOARD_POSTGRES_CONNECTORS_JSON` 的连接引用为目录，连接串从单独环境变量读取，查询由部署方固化为单条 `SELECT`/`WITH ... SELECT`。浏览器只能选择引用；结果以普通远程 Dataset 进入现有语义、权限、刷新、生成和发布链路
- 原因：直接让浏览器或 Agent 提交 SQL、主机和连接参数会把凭证、越权查询、资源消耗和注入风险带进产品边界。受控的部署配置仍能覆盖常用指标视图，同时保留与 REST 数据源一致的可观察刷新闭环
- 边界：该实现不是通用数据库浏览器、SQL 编辑器或任意数据库连接平台；部署方仍需使用最小只读数据库账号、网络隔离和数据库侧查询治理。`smoke:postgres-connector` 只做一次临时创建/刷新并输出最小计数，不保存 Dataset/Project；未配置或多连接未显式选择时失败关闭。当前只实现 PostgreSQL，MySQL/SaaS 连接器与策略管理 UI 尚未实现

### 决策 96：Report PDF 自动采用分页，Dashboard 保持长页导出

- 结论：Publication Renderer 只根据已固化 artifact 内的 `data-page-type="report"` 选择 A4 print media，并加入固定边距、标题页眉、页码 footer 与 Section/Card 防跨页 CSS；Dashboard 的 PDF 继续按用户选择的画布宽度输出保真长页
- 原因：报表的阅读、打印和归档需要稳定页面边界与引用页码；把所有 Dashboard 强制 A4 分页会破坏大屏看板的视觉节奏和既有下载行为。以同一 artifact 的页面类型做服务端渲染决策，无需将编辑器状态、浏览器参数或新的发布模型写入产物

### 决策 97：发布审批按组织策略和不可变 Publication 状态执行

- 结论：默认 Publication 直接进入 `published`；仅 `DASHBOARD_PUBLICATION_APPROVAL_ORGANIZATIONS` 中的组织创建 `pending` Publication。待审批对象保留不可变 artifact 和一次性 unlisted token，但 `/p/*`、`/embed/*` 始终以 404 隐藏；只有同组织的 organization admin 能转换至 `published`，原链接随后生效
- 原因：审批是部署组织的治理要求，不应迫使本地/小团队用户多一步操作；把状态放在 Publication 对象而不是 URL、浏览器或草稿上，能保证已审批内容、导出和共享引用同一个不可变事实
- 边界：这是一条受控审批状态机，不包含多级工作流、审批人配置、通知、SLA、电子签名或合规留存；管理端项目成员仍可读取待审批 artifact 用于内部审阅

### 决策 98：Publication 治理动作使用对象内持久化审计 outbox

- 结论：Publication 的创建、提交审批、批准和撤回与最小 project audit event 同次写入 Publication record 的内部 outbox；file 与 PostgreSQL adapter 都支持列出和确认这类事件。dispatcher 失败不会回滚不可变发布或状态转换，并会在启动、后续治理操作和 audit API 读取时恢复投递；若配置外部 anchor，Publication 事件写入内部 audit 后同样触发异步链头刷新
- 原因：直接在 HTTP 成功后追加审计会在审计短暂不可用时留下不可追溯的发布动作；Publication 不属于 Project revision 写路径，复用 Project outbox 会破坏对象归属和并发边界
- 边界：当前仍是内部 audit 的可靠投递，并非外部 WORM 证明；事件只记录 Publication/revision/visibility，绝不包含 artifact、分享 token、URL、Dataset records 或审批人身份以外的额外数据
- 边界：当前是浏览器 print engine 的自动分页，不提供人工拖分页、目录、章节封面或企业级排版编辑器。页数由 Chromium 生成，服务端不保存 PDF；仍只从指定不可变 revision 渲染，不能从当前画布或最新数据重建

### 决策 99：Dashboard 原生拥有 Provider 管理边界，OmniDesk 仅作为兼容来源

- 结论：Dashboard 使用版本化多档案配置选择当前 AI Provider，首期原生支持 OpenAI Responses 与 OpenAI-compatible Chat Completions；允许读取 OmniDesk 的公开档案结构用于迁移，但不把 OmniDesk 作为运行依赖
- 原因：绑定单个桌面产品只能服务当前机器，无法覆盖其他用户、组织和托管部署；完全复制密钥又会扩大泄漏和轮换范围。统一 Provider 接口可让上层 AI 生成保持不变，并让每个部署选择自己的模型服务
- 边界：登录用户可读取自己连接档案中的名称、模型和 HTTPS API 地址，以便重新编辑；真实密钥进入独立凭证仓储，浏览器响应、Workspace、Project、health、日志和便携 Skill 永不回显密钥。当前 file adapter 已支持新增/编辑/删除、持久切换、模型发现和连接测试，并以独立 `0600` 文件保存凭证；这仍不是加密 Secret Manager，也不满足多实例、轮换、KMS 或企业密钥托管，生产适配器完成前不得据此宣称企业凭证平台就绪
### 决策 100：资源中心独立成页并复用能力目录

- 结论：Studio 使用 `/studio/resources` 作为资源与规范的独立 HTML 页面，视觉设置标题旁只提供入口；图表、组件和图标分别读取既有公开目录和渲染 API，不在页面内复制清单
- 原因：右侧设置适合调整当前对象，不适合同时浏览大量资源；弹窗会压缩画布并形成叠层。独立页面既能完整展示和验收，也能让 AI、Studio 和用户共享同一能力真相
- 边界：首期只读浏览图表和规范；后续应用资源必须生成受控 Workspace 修改，不能跨页面直接操作画布 DOM。资源页不是插件市场、模板商城或第二套设计系统

### 决策 101：图表筛选复用页面控件协议，图例状态独立持久化

- 结论：图表标题下拉继续使用 `filter-bar`，通过 `placement: component-header` 指定展示位置，并用 `targets` 明确当前图表、分组或整页范围；多系列图例由 DOM 按钮承载，显隐状态写入 `interactions.chartSeriesVisibility`。
- 原因：筛选会改变数据范围，图例只临时隐藏系列，两者不能混成同一种状态；复用既有筛选协议可保证 Studio、数据重算与 standalone 使用同一语义，DOM 图例则解决静态 SVG 无法点击和无障碍状态缺失的问题。
- 边界：默认至少保留一个系列可见；单系列图表不显示图例。图例状态不修改源数据，便携交互 HTML 继续支持切换。

### 决策 102：HTML 导入只迁移内容语义，统一用当前 Workspace 规范重建

- 结论：HTML 有有效表格时按数据集导入；否则提取标题、分区、正文和列表为页面内容上下文。生成阶段保留业务内容与信息层级，但必须使用当前主题、组件目录和 Workspace 协议重新编排
- 原因：完整 HTML 与表格 HTML 的意图不同；强制要求表格会拒绝报告和 Dashboard，直接复制原 DOM/CSS 又会引入样式漂移、脚本风险和不可编辑结构。自动分类既保持单一导入入口，也确保生成结果属于本产品设计系统
- 边界：不执行或携带原页面的 script、style、template、iframe、SVG 和 Canvas；通用 HTML 只能恢复可见内容语义，不能保证找回 Canvas/SVG 图表的原始数据。本产品未来若提供完整 Workspace 元数据，可另走精确项目恢复协议

### 决策 103：项目中心只承载生成输入，Job 创建后画布接管状态与评审

- 结论：项目中心继续使用浮层完成数据、需求和页面类型输入；服务端返回 Generation Job ID 后立即关闭浮层，由主画布生成浮条提供状态、停止、接受和放弃操作
- 原因：生成阶段需要观察画布变化，长时间保持模态浮层会遮挡用户最需要检查的内容。保留 Composer 作为唯一状态源，画布只投影其状态和调用原操作，可避免形成第二套生成事务
- 边界：完整候选通过校验后才替换隔离预览，不将半截 JSON 或未校验分区写入 Workspace。任务进度由 SSE 的安全阶段事件和 `section.ready` 接管；接受前不创建 revision，放弃和失败必须恢复 baseline

### 决策 104：生成进度与 Provider 内容流分层，使用三段超时

- 结论：浏览器通过可恢复 SSE 只接收受控 Job 阶段；服务端对 Provider 请求使用默认 120 秒首包、60 秒流空闲和 5 分钟最大任务时长，并在内存中拼接完整候选 JSON。
- 原因：固定总超时会误杀持续输出的复杂生成，高频轮询又产生无意义请求；分段时限既允许长任务持续推进，也能识别未响应、输出中断和无限生成三种故障。
- 边界：Provider 原始 chunk、prompt、Key、DataContext 和半截 JSON 不进入 Job SSE、Workspace 或日志。只有完整候选通过 Schema、命令和安全校验后才能成为预览；取消始终优先映射为 `provider_canceled`。

### 决策 105：进度传输状态与 Generation Job 状态分离

- 结论：SSE 只承担可恢复的进度通知，每次连接首帧必须发送不含输入或结果的 `job.snapshot`；浏览器断线时只在该时段以低频 HTTP 查询权威 Job，连接恢复后停止回退查询。SSE 错误本身不得把任务标为失败。成功任务在完整 Generation Bundle、Workspace、Command materialization 与 provenance 校验通过后，持久化与分区一一对应的 `section.ready`，再写入 `preview.ready`
- 原因：浏览器、代理或服务重启都可能中断长连接，但持久化任务仍可继续；若把 EventSource 错误直接映射为生成失败，用户会看到与服务端事实冲突的状态，也可能错过已持久化的终态事件
- 边界：任务进程重启后必须等待旧 worker 租约到期再重新入队，避免双执行；当前仍是 Web 进程内 worker 与 file/PostgreSQL Job Repository，尚未拆为独立队列 worker。`section.ready` 只携带分区序号、总数和组件数，表示已验证分区的顺序呈现，不是 Provider partial JSON、独立分区模型调用或部分 Workspace 提交；完整 Workspace 仍只在终态后原子替换画布

## 2026-08-22

### 决策 106：个人账号作为默认在线身份

- 结论：本地可信单机场景继续使用 `disabled`；在线个人场景使用邮箱密码账号，每个账号自动创建独立个人空间。`token` 只保留旧部署服务端迁移兼容，不恢复令牌输入框，也不把 AI Provider Key 当作 Studio 登录凭证
- 原因：当前产品面向个人使用，不需要管理员分发凭证或组织配置；账号密码更符合普通用户认知，也能让项目、数据和 AI 连接按个人身份隔离
- 边界：当前没有邮件投递、重置令牌仓储和重置页面，因此公开 `passwordRecovery=false`；界面只说明联系维护者，不得伪造“邮件已发送”

### 决策 107：登录门禁保持原始深链

- 结论：身份状态在 Studio 壳层读取，不用独立登录路由替换目标地址。认证成功派发 `dashboard-auth-ready`，Router 重新激活当前 `/studio/projects/:id` 或其他站内路由
- 原因：用户通常从具体项目链接进入；登录后退回列表会丢失任务上下文。保持 pathname 和 query 可以让认证只作为门禁，不改变用户目标
- 边界：服务状态未知时隐藏提交表单并只提供重新连接；邮箱可保留，密码不持久化。退出入口融合进项目中心标题栏，主画布不增加账号浮动控件

## 2026-08-23

### 决策 108：Dashboard 与 Report 共用 ChartSpec 和 ECharts Builder，但使用不同运行时

- 结论：Dashboard 是在线分析应用，使用客户端 ECharts；Report 是固定阅读成品，使用服务端 ECharts SVG。两者共用版本化纯 JSON ChartSpec、图表目录、Option Builder、色板和数字格式。类型转换创建新项目或副本，不作为成品页面显示开关；Dashboard 不承诺离线 HTML 导出
- 原因：客户端运行时才能以低延迟承载 Tooltip、缩放、跨图联动、下钻和持续刷新；服务端 SVG 更适合 Report 的稳定阅读、发布和 PDF。复用同一个 Builder 可避免 Dashboard 与 Report 出现两套视觉和语义，继续使用 ECharts 也避免 Chart.js 插件与第二渲染协议的维护成本
- 边界：AI和普通用户只能生成经 Schema 校验的 ChartSpec，不得提交任意 ECharts Option、formatter、renderItem 或 JavaScript。自定义图表按标准系列组合、受控 Custom Series、审核式插件逐级开放；每项扩展必须声明 Report 静态降级

### 决策 109：Dataset SSE 只通知变化，语义查询仍是数据真相

- 结论：在线 Dashboard 默认按 Dataset 建立一个可恢复 SSE，事件只携带 Dataset ID、语义版本和更新时间；客户端收到变化后重新执行授权语义查询。分钟级场景可显式使用 HTTP 轮询，WebSocket 不作为默认能力
- 原因：SSE 足以承载单向变化通知，浏览器原生支持重连；不在长连接中发送 records 可以复用现有组织隔离、行级策略、查询缓存和迟到结果门禁，也避免建立第二套数据授权协议
- 边界：客户端按事件 ID 与版本时间去重，失败有界退避并保留 last-known-good；页面隐藏默认暂停。刷新只替换运行时数据覆盖，不写 Workspace 或清空筛选、选择、图例、下钻和 zoom。SSE 不是持久任务真相，也不保证逐条业务事件回放，只保证重连后观察当前最新版本

### 决策 110：Dashboard 转 Report 使用授权快照与新 Project

- 结论：Dashboard 生成 Report 时，服务端从指定不可变 revision 创建新 Project；在线 Dataset 按发起者重新授权，当前筛选、图表选择、下钻和图例状态物化为静态值，随后删除全部数据绑定与交互运行态。源 Project 完全不变
- 原因：Report 是可复现的阅读成品，不应依赖后续数据刷新、浏览器会话或 Dashboard 交互状态；新 Project 让两种生命周期、权限审计和后续编辑相互独立
- 边界：Dataset 缺失或越权必须整次失败，不能使用浏览器缓存或 last-known-good 替代授权查询；列表只暴露 `pageType` 摘要，Report 深链在 revision 恢复前不得先按模板 Dashboard 加载客户端 ECharts

### 决策 111：自定义图表使用版本化本地注册表，不开放任意 ECharts Option

- 结论：标准系列无法准确表达的稳定 BI 语义可进入受控扩展注册表。首个扩展 `bullet` 只接受实际系列、目标系列和绩效区间的纯 JSON ChartSpec；审核过的本地 Builder 才生成 ECharts Custom Series。每个 manifest 必须声明版本、稳定 ID、唯一语义、数据形状、能力、Dashboard/Report 运行时和标准降级
- 原因：直接开放 Option、formatter 或 `renderItem` 等同于允许模型或用户向运行时注入程序，也会让 Dashboard 与 Report、版本迁移和故障隔离失去合同。受控注册表保留 ECharts 的表达能力，同时让 AI 只面对可验证的业务语义
- 边界：普通用户和 AI 永远不能提交 JavaScript。manifest 及嵌套字段递归不可变；重复 ID/capability、未知 capability/runtime、非标准 fallback、可执行 manifest 和缺少本地 Builder 的扩展失败关闭；目录 extension 元数据必须与注册表一致。Builder 异常只降级当前图为 manifest 指定的标准类型。Bullet 必须有非空分类和等长的实际/目标两系列；通用单指标 binding 不得冒充双指标数据源。当前注册表是随产品发布的审核清单，不是用户插件市场或远程代码加载器

### 决策 112：指标卡组织方式与底色正交配置

- 结论：KPI 整组新增 `separate / joined` 组织方式，与 `default / white / single / multi` 卡片底色分开保存。白色独立指标卡由 `separate + white` 组合表达；`joined` 使用统一组底，四周内边距、标题到内容距离和内部卡间距统一继承全局 `cardGap`，不使用紧贴分隔线。整组语义下必须显示标题，外层与标题分别继承卡片圆角、阴影、边框及卡片标题视觉 token
- 原因：“是否独立成卡”是组级布局边界，“使用什么底色”是卡片表面样式，两者绑定会阻断后续主题组合
- 边界：组织方式暂不提供单卡覆盖；旧 Workspace 和新预设均默认 `separate`，不改变已有项目视觉

## 2026-08-24

### 决策 113：KPI 当前值与历史趋势使用独立受控绑定

- 结论：KPI 主 `binding` 只计算当前聚合值，新增 `trendBinding` 只计算真实历史序列；两者引用同一授权 Dataset 并共享筛选条件。Dashboard 用客户端 ECharts 交互呈现，Report 和便携导出物化为静态 SVG
- 原因：当前值和历史序列的数据形状、查询维度与刷新成本不同。分离绑定可防止模型根据单值或环比伪造走势，也让在线查询、筛选、权限和静态快照各自保持明确口径
- 边界：趋势必须有 2-30 个对齐的有限值，受控周期只允许 7/12/30；没有真实顺序维度或少于 2 点时隐藏。Workspace 不接受任意 ECharts Option、formatter 或 JavaScript。Report 副本必须删除两个绑定和 `dataRef`，但保留已经授权物化的 `props.sparkline`

### 决策 114：在线分析报告独立于快照 Report

- 结论：新增 `pageType: analysis-report`。它保留固定布局、页面筛选、非便携 Dataset 身份、组件 binding/trendBinding 和 refreshPolicy；编辑器中的图表统一走服务端 SVG，允许受控手动、轮询或 Dataset 事件刷新，并显示最后更新时间。`pageType: report` 继续表示已固化的不可变快照，不显示可用刷新。
- 原因：用户既需要“每次打开都看最新数据的固定分析版式”，也需要“不会变化、可分享和审计的报告副本”。把两者都叫 Report 会让刷新按钮、数据绑定、导出和权限边界互相冲突；把在线报告当成 Dashboard 又会引入不必要的 Canvas 交互。
- 边界：在线报告不承诺 Dashboard 的图表下钻、跨图联动和离线可用；需要这些能力时使用 Dashboard。在线报告需要分享、导出或审计时，必须通过服务端授权数据转换为新的 `report` 快照，源项目不变。自定义图表扩展必须同时声明 `analysis-report: server-svg`。

### 决策 115：产品入口只保留 Dashboard 与 Report 两类

- 结论：用户创建和编辑时只显示 `Dashboard` 与 `Report` 两个页面类型。用户选择的 `Report` 对应内部 `analysis-report` 在线运行时，支持绑定数据、筛选和刷新；静态 `report` 只作为在线 Report 经过服务端授权固化后的交付快照。
- 原因：在线分析和静态分享是同一份报告在不同生命周期的状态，不应让用户在创建时面对两个容易混淆的 Report 选项。两类入口足以表达核心差异：Dashboard 是交互操作台，Report 是固定分析版式。
- 边界：内部 `analysis-report` 和 `report` 类型继续保留以兼容历史项目、渲染器和快照转换；项目列表统一显示为 Report，并在静态快照上追加“静态快照”标识。分享、下载、PDF、图片和审计仍必须基于新建的静态快照，不能直接公开在线 Report。
