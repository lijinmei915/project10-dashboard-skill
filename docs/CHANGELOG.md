---
layer: knowledge
type: log
last_verified: 2026-08-24
depends_on: [PROJECT.md, HANDOFF.md]
---

# 结构性变更记录

> 用途：记录影响仓库结构、文档体系或 skill 资产组织方式的变更。
> 什么时候更新：发生结构性调整时。
> 不要写什么：纯文案小修、一次性讨论过程、未落地设想。

## 2026-08-24

- 修复项目中心删除操作：删除按钮统一使用危险操作样式；确认取消、请求失败或项目元数据过期后按钮可再次操作；提交前读取最新项目版本，减少并发编辑造成的误报失败。
- 产品入口收敛为 `Dashboard / Report` 两类：Report 默认生成可刷新在线分析报告，内部 `analysis-report` 仅作为兼容运行时保留；分享、下载和审计继续通过服务端生成 `Report · 静态快照`。
- 新增第三种页面模式 `analysis-report`（在线报告）：保留固定结构、筛选、在线数据绑定和刷新策略，图表/KPI 趋势使用服务端 SVG；Dashboard 继续使用客户端 ECharts，`report` 保持不可变快照语义。
- 项目中心和 AI 工作台增加“在线报告”选择与类型标识；在线报告可由服务端授权转换为新的快照 Report，转换会清理绑定、交互和刷新状态。
- 完成在线报告契约、生成器、编辑器刷新状态、项目复制、发布打印规则和 Node 回归覆盖。

- Dashboard 内容区新增页面级“刷新数据”入口：位于标题区域右上角，按 Dataset 合并触发在线 KPI、图表、表格和排行刷新；刷新期间保留旧数据，失败时显示保留上次数据，mock/无在线 Dataset 时按钮置灰。运行时新增受控 `refreshNow()`，不改变轮询、SSE 和 last-known-good 机制。
- Report 标题区同步保留刷新图标以维持页面工具位置一致，但明确置灰并提示“报告为快照，不支持刷新”，避免把静态 Report 误解为在线数据页面。
- 项目名称新增组织范围唯一性：创建、复制、Report 副本、AI 首次提交和重命名均按 trim、NFKC 归一化和不区分大小写校验；服务端使用组织级写入队列防止并发重名，冲突返回 409，删除后名称可复用。
- KPI 面积趋势升级为参考式纵向透明渐变：客户端 ECharts 使用 1.5px 平滑曲线和三段透明度衰减，Report 与独立导出使用同一平滑 SVG 边界与渐变；标准看板默认改为“渐变面积”，仍保留纯折线和平滑线选项。趋势线统一跟随当前主题强调色，不受图标和卡片多色设置影响；桌面端固定在卡片右下角，移动端继续回到文档流整行展示。
- 内置看板的三张 KPI 增加明确标记为 mock 的 7 周趋势数据，便于直接预览 Tooltip、指针和趋势样式；真实项目仍只使用 `props.sparkline` 或受控 `trendBinding` 产生的历史序列，不自动伪造数据。局部 KPI 设置增加独立“趋势线”分组，提高显示、周期和样式配置的可发现性。
- KPI 新增真实迷你趋势能力：Workspace 用独立 `trendBinding` 表达历史聚合，便携和在线数据运行时按同一筛选范围物化 `props.sparkline`；在线 KPI 分别查询当前值与趋势并合并，实时刷新继续保留 last-known-good。
- Dashboard KPI 趋势使用受控客户端 ECharts，支持 Tooltip、axisPointer、点击意图及生命周期回收；视觉设置提供自动/显示/隐藏、7/12/30 点和折线/平滑线/面积线。Report 编辑页与便携导出只输出静态 SVG，不加载客户端图表运行时；620px 以下改为趋势图整行置于数值下方，避免窄卡片交叠。
- Report 副本在授权数据物化后同步移除 `binding / trendBinding / dataRef`，保留有效静态趋势，避免孤立趋势绑定导致副本校验失败。专项合同、数据、运行时、构建与导出回归已补齐。

## 2026-08-23

- Dashboard 系统预设完成主题化：企业分析启用浅蓝头部、紧凑密度、发光分组短标、分组边界、卡片极弱边框和单色图表；极简看板启用居中阅读头部、可读宽度、暖色微粒纹理、宽松间距、低对比分组底和固定多色图表。运行时恢复 `sectionSurface` 映射，主题字段不再被固定为 `none`；浏览器已验证桌面与 390px 移动宽度无横向溢出，预览后恢复原配置且未保存试验选择。
- 交互式 BI M7 完成：新增版本化受控图表扩展注册表和首个 `bullet` 子弹图。扩展 manifest 声明唯一语义、数据形状、能力、Dashboard/Report 运行时和标准降级；ChartSpec 新增纯 JSON `bullet` 配置，本地 Builder 生成 ECharts Custom Series，普通用户和 AI 不能提交 Option、formatter、`renderItem` 或 JavaScript。
- 子弹图已贯通目录、自然语言起稿、Workspace Schema、Studio 类型选择、资源中心、客户端 Canvas、服务端 SVG 和独立 Studio 构建。异常 Builder 只降级当前图为横向条图；重复 ID、未知 capability 和可执行 manifest 输入失败关闭。完整 Node、生成评测、Playwright 及390px移动端双运行时验收通过。
- 自定义图表治理加固：manifest 递归冻结并拒绝重复 capability、未知 runtime 与非标准 fallback；目录和注册表由构建合同逐字段同步。Bullet 严格校验两组等长实际/目标数据，生成器不再附加无法表达目标值的单指标 binding，异常 Builder 按 manifest 声明的标准图表降级。
- KPI 多色线型、面型、浅底、光感和反白统一改用版本化 8 色 `categorical` 色板；移除独立写死的 fx-ui 四组颜色。多色卡片按数量均匀抽色，多色光感从每个分类基准色派生同色相亮阶，选择器四格预览同样均匀抽取。
- Studio 的 Report 下载与 Publication 创建现向便携导出器注入同一个服务端 ECharts SSR；不可变 artifact 标记 `data-chart-renderer="echarts-ssr"`。无宿主能力的便携 Skill 继续保留确定性静态 SVG 降级，不引入客户端 ECharts 或额外运行依赖。
- 图表资源库新增 `gauge` 仪表盘，使用“单值 + 范围 + 可选阈值”的稳定语义，贯通 AI 起稿与精修、Workspace、Studio 类型选择、资源中心指标图分类、ECharts SSR、便携 SVG 和 standalone 动态重算；目录扩展至 22 种，单值仪表盘不显示图例。仪表主弧按“主题色已完成 + 连续灰色未完成”表达，阈值保留在数据协议中但不覆盖主弧。
- 资源中心图表预览移除私有四色数组，改由 `/api/charts/catalog` 下发版本化正式色板；仪表盘固定单色，饼图、玫瑰图、雷达图和漏斗图固定分类多色，其余图表按一/二/三组以上系列自动使用单色、双色或分类色。预览与 Studio 继续共用 ECharts SSR，不引入 Chart.js 第二渲染协议。
- 交互式 BI 长目标进入 M0：新增纯 JSON `ChartSpec v1`、共享 ECharts Option Builder 和双渲染架构规范；Dashboard 定位为在线客户端运行时，Report 保持服务端 SVG，类型转换生成副本。ChartSpec 类型与22种目录、Workspace合同自动校验，AI输入中的可执行值和未知字段失败关闭。
- 交互式 BI M1 完成：新增客户端 ECharts 生命周期运行时，Dashboard 的21种绘图类型使用 Canvas 并支持实例复用、增量更新、ResizeObserver、迟到结果失效和销毁；Report 与表格保持静态 SVG，客户端失败自动降级。开发服务与独立 Studio 构建统一提供版本锁定的 `/vendor/echarts.mjs`，Report 直开不请求该资产。
- Workspace 恢复期间暂停图表渲染，待页面类型、主题、文档与布局原子恢复后统一绘制，消除 Report 初始状态短暂按 Dashboard 加载 ECharts 的竞态。新增 Node 生命周期测试、Studio 构建/静态服务测试和 Playwright 21图表/Report 零 vendor 请求回归。
- 交互式 BI M2 完成：新增 Dashboard 在线语义查询运行时，把现有受控 binding 映射为授权维度/指标 ID，支持取消、迟到结果门禁、并发元数据去重、服务端查询缓存和 last-known-good；非便携 Dashboard 的 Workspace 只保留 `{ portable: false }`，在线结果仅作为内存视图覆盖，Report 保持快照路径。
- 在线卡片新增 loading/ready/stale/error 状态与数据更新时间。Playwright 证明刷新后的 KPI、图表、排行和表格均使用在线数据，查询失败后旧 Canvas 与数值继续可见并标记 stale，本地 Workspace 全程无 records；跨组织查询继续统一返回 404。
- 交互式 BI M3 完成：新增纯 `AnalysisState` 选择状态模块和 ChartSpec `selection` 合同，ECharts 点击只产生受控意图；Editor 按 component/section/page 作用域和同 Dataset 边界驱动 portable 物化或在线语义查询，不允许图表相互直接调用。
- 图表标题新增当前选择提示与清除入口，选择状态经显式保存进入 Workspace 并可在刷新后恢复。Node 覆盖三种范围、切换清除和非法来源；Playwright 覆盖真实柱体选择、整页 KPI 联动、保存恢复、无循环查询、390px 无溢出及后续503降级。
- 交互式 BI M4 完成：Semantic Model 新增受控维度层级，Workspace 图表只引用层级 ID；`drilldown-state` 以路径深度推导当前维度，在线查询逐层复验授权模型并携带全部祖先过滤，不允许客户端自造字段或越过末层。
- 图表新增可恢复面包屑与三层 ECharts 点击下钻。Node 覆盖层级校验和纯状态转换；Playwright 覆盖区域到省份到城市、语义 ID 查询、祖先过滤、保存恢复和返回根层。390px 验收发现并修复面包屑负上边距导致的2px标题盒重叠，页面无横向溢出。
- 交互式 BI M5 完成：新增按 Dataset 合并的实时刷新协调器和授权 Dataset SSE。在线 Dashboard 默认事件刷新，并支持5秒到24小时轮询、页面隐藏暂停、显式后台例外、有界指数退避、游标重连、事件去重及多 Dataset 定向缓存失效；SSE 不携带 records 或查询结果。
- 数据刷新继续使用授权语义查询和 last-known-good，只更新内存视图。客户端 ECharts 更新同 zoom 模式时保留当前缩放窗口；Playwright 以真实刷新 API 和 SSE 验证 KPI 1,000→1,500，同时保持华东选择、Workspace interactions 和 zoom 20-80，390px 无横向溢出，后续503仍保留旧数据。
- 交互式 BI M6 完成：项目中心可从 Dashboard 创建独立固定 Report Project。服务端对在线 Dataset 重新执行行级授权，物化当前筛选、图表选择、下钻和图例结果，再移除 controls、binding、dataRef、records、刷新/缩放策略与 interactions；源 Dashboard 不追加 revision、不改内容。
- Project 列表新增不含 revision 正文的 `pageType` 安全摘要，修复真实列表无法显示“生成报告”的问题。项目深链在权威 revision 恢复前暂停默认 Dashboard 绘制，避免 Report 路由短暂请求客户端 ECharts；浏览器回归验证 Report 为 SVG且 vendor 请求为0，原 Dashboard 仍为 Canvas，390px无横向溢出。

## 2026-08-22

- KPI 图标 UI 从形态与颜色双下拉改为固定样式单选，提供主题/多色成对的线型、面型、浅底、光感和反白预设；默认主题线型，单卡可跟随整组，底层状态协议保持兼容；自定义下拉优先使用显式 `aria-label`。主题预览现绑定当前主题派生图标色，多色预览从真实分类色板均匀抽取四色；画布 KPI 按卡片总数分散取色，避免少量卡片集中使用相邻冷色。
- KPI 线型浅底取消 `84%` glyph 缩放，并在较小带底尺寸上增加轻量 path 轮廓补偿，与对应无底线型保持相同视觉粗细。
- KPI 图标大小从“小 / 中 / 大”收敛为“标准 / 大”两档：无底映射原中/大尺寸，带底映射 `34/21px` 与原中号 `40/23px`，历史 `small` 自动迁移到标准。
- KPI “深底线型”替换为“光感渐变”，保留线型 glyph 并使用同色渐变容器和柔影；旧全局/单卡 `outline + solid` 配置自动迁移至 `glow`。
- KPI 视觉设置拆为“分组布局 / 指标图标 / 卡片外观”，并改为由现有“图标样式”组合器控制依赖字段：无图标时收起无效配置，无底/有底样式分别显示适用字段，卡片底色保持独立；整组与单卡交互规则一致。
- Studio 视觉设置新增 `fx-ui-report-skill` 风格的发光分组短标与 KPI 光感渐变容器；右侧分组横线统一为渐隐表达。新增值贯通全局/单卡状态白名单和自定义预设，默认视觉预设不变。
- Studio 登录门禁升级为个人账号完整状态机：本地模式免登录，在线密码模式支持注册/登录、服务故障重试、错误分类、限流提示、密码显隐、会话恢复和原项目深链回跳；旧 token 模式仅显示迁移提示。
- Auth status 增加 `registration / passwordRecovery` 能力合同；当前明确允许注册但不伪造密码找回。登录页使用正式 Dashboard Studio 品牌与个人工作台文案。
- 退出登录从隐藏的右上角控制改为项目中心标题栏图标；主画布保持简洁，Session 仍通过同源服务端注销撤销。
- 新增 password 模式 Playwright 端到端验收和移动端截图；旧浏览器回归同步到画布流式接受、个人 AI 设置、无成员/归档/记录入口及 21 种图表资源的当前产品行为。

## 2026-08-20

- Generation Job 新增持久化 `section.ready` 进度协议和脱敏 `sectionsReady / sectionCount` 权威摘要；事件只在完整 Generation Bundle、Workspace、命令物化与来源校验通过后生成，并与分区一一对应。AI Composer 移除定时模拟进度，按事件队列逐块呈现，重连快照直接恢复已完成数，终态等待队列收口后再原子应用完整预览
- Generation Job SSE 增加首帧 `job.snapshot`、显式响应刷新和 10 秒心跳；快照只包含状态、阶段、更新时间和终态标记，不包含 prompt、Workspace、Provider 输出或凭证。前端将传输连接与任务状态分离，断线期间每 4 秒查询权威 Job，重连后停止轮询，遗漏终态事件仍可恢复；收到终态事件后主动关流，避免正常 EOF 被误提示为连接恢复
- Generation worker 启动恢复补齐未过期旧租约：新进程等待租约到期后重新入队并通过 fencing 接管，不再把仍为 `running` 的任务永久跳过。浏览器已用慢速确定性 Provider 验证停服、恢复提示、重启接管、`preview.ready` 和最终可接受预览完整链路
- 图表资源库新增 `data-table` 表格图表，用于精确值与多字段明细对照，贯通资源预览、AI 语义、Workspace、Studio 和便携 SVG 导出；支持排序、Top N、数值格式、条件强调和合计行，目录扩展至 21 种。搜索、筛选、分页、固定列、选择和文件导出继续由独立表格组件负责。
- Studio 新增个人邮箱密码认证模式与 file 账户仓储，注册自动建立独立个人空间；密码使用带盐 scrypt 哈希，登录使用 HttpOnly Session 并按来源/邮箱摘要限流。登录 UI 移除访问凭证，旧 token 模式降为无产品入口的迁移兼容能力。
- 图表资源库新增 `radar` 雷达图与 `funnel` 漏斗图，贯通唯一语义、Workspace Schema、Studio 类型选择、ECharts SSR、便携 SVG 导出和自动配色；受控目录扩展至 20 种。
- 将当前 Dashboard 视觉配置固化为 `fx-orange / 标准看板` 基线：`#ff8000` 主题色、14px 正文、10px 卡片圆角、16px 卡片标题、12px 卡片间距、轻阴影、标准密度和智能图表配色。
- Studio 运行时、standalone starter、Skill 主题/输出规范和设计资源目录使用同一组默认值；入口模块增加版本参数，避免浏览器继续命中旧运行时缓存。
- 视觉预设收敛为一个分组选择器：系统预设与我的预设共用入口，自定义项悬停显示管理命令，创建命令位于列表底部；更新、重命名和删除使用不占布局的浮层菜单。
- 标准看板图表配色新增“智能适配”：单系列使用单色、双系列使用双色、三系列及以上使用多色，饼图/环图/玫瑰图按分类多色；单卡仍可显式覆盖单色、双色或多色。

## 2026-08-12

- HTML 导入新增自动分类：有效表格继续生成数据集，无表格的报告或 Dashboard 提取为页面内容上下文；摘要即时显示内容块、业务场景和推荐组件，允许不补提示词直接按当前主题与组件规范生成。原 CSS、脚本、iframe、SVG 和 Canvas 不进入生成上下文。
- 新建项目移除固定业务类型选择，改为根据需求和数据自动识别开放业务场景；右侧摘要新增“识别场景”，不明确时保持待识别且不阻止生成。
- 新建项目移除显式组件选择，组件目录继续作为 AI 内部能力；用户只需接入可选数据并描述目标，右侧摘要实时展示推荐组件。
- 数据导入新增 HTML 表格格式，服务端使用标准解析器仅读取首个有效表格并忽略脚本/样式；新建项目的数据入口图标统一改用 Phosphor 图标库。
- 图表交互补齐：`filter-bar` 支持放入指定图表标题区并保持目标范围；多系列图表新增可点击、可持久化、可导出的无障碍图例，AI 可识别“当前图表 / 当前分组 / 整页联动”等自然语言范围。
- 资源中心进入 M2：选中图表卡片后可从独立资源页应用受控图表类型；新增会话、目标和目录三重校验，普通浏览模式保持只读。
- 资源中心进入 M3：新增 6 类内容组件、2 类页面控件的真实结构目录，以及 Phosphor 图标搜索、细线/常规/粗线/填充预览；选中卡片后可通过同一受控协议应用标题图标，Studio 在写入前复验图标资源。
- 资源中心进入 M4：新增版本化 `design-standards.json` 与 `/api/design/standards`，把颜色、字号、间距、形状和可访问性规则做成可视规范；该摘要显式追溯 Skill themes、color-system 和 palette，合同检查防止三端语义漂移。
- 资源中心进入 M5：顶部增加四类能力状态与版本/数量摘要，目录失败独立降级；新增资源中心合同测试，自动核对共享 API、18 图表、8 类组件和五类设计规范，并禁止硬编码目录数量。
- 窄屏 Studio 新增“查看画布 / 返回设置”双向切换：设计模式与当前选区保持不变，用户可暂时收起全屏设置抽屉，在画布选择卡片或分组后返回局部设置；桌面模式不显示该控件。
- 资源中心 M1-M5 完成最终验收：桌面端分组图标受控应用通过，目标 ID、会话、资源存在性、可见 SVG、选区和待保存状态均有浏览器证据；验收修改已恢复。最终门禁确认独立页面 200、18 图表、6 类组件、2 类控件、5 类设计规范及 Studio/AI 共享目录一致。

- 项目中心弹窗、Tab、搜索/筛选表单和底部操作区按 shadcn 对话框与表单规范重新规整；保持原生 HTML 和现有业务逻辑，不把 React/Radix 运行时带入 Studio 或 Skill。
- Studio 项目中心开始使用独立 UI 原语层：动态项目操作、Provider 连接操作和成员权限下拉统一接入 `studio/ui-kit.mjs`，保留原业务类名与事件契约。
- 增加中性主题按钮 variant、统一下拉框、键盘焦点和禁用态样式；主操作与次操作层级不再由各模块分别手写。
- 平台 UI 组件迁移不进入 `dashboard-html` Skill 成品依赖；Skill 可复现包哈希保持不变，导出 Dashboard 继续为独立 HTML。

## 2026-08-11

- Provider 设置从项目中心业务脚本中抽离为可复用的原生组件 `studio/provider-connection-settings.mjs`；组件复用当前 Studio API 和 UI primitive，保持 OmniDesk Provider 组件的职责划分，但不增加 React、Tauri 或 Skill 成品依赖。
- 建立平台 UI 组件与轻量 Skill 的分层契约：Studio 增加 `studio/ui-kit.mjs` 基础 DOM primitive；Skill 仅增加 `studio-component-contract.md` 语义、可访问性和导出边界，不携带完整 shadcn/Radix 源码或运行依赖。
- 已有项目增加第一版管理控件：项目名称搜索、进行中/全部/已归档状态筛选、最近更新/名称排序和“我可编辑”归属筛选；列表继续只展示服务端真实字段，不新增虚构统计。
- AI 设置改为项目中心内部 Tab 内容，不再打开独立遮罩弹窗；Provider 管理器复用原有节点直接挂入 Tab，加载、编辑、模型读取和保存逻辑不变。
- 新建项目工作台按主流 B 端表单规范规整：配置区与摘要区使用弱边界和统一间距，步骤分区增加轻分隔，数据入口、输入框、摘要信息和底部操作统一控件密度，保留现有主题 token 与响应式结构。
- 新建项目保留确认的信息架构与文案，但视觉重新映射项目工具主题规范：主操作和选中态使用 `--tool-accent`，背景/边界/弱文字使用既有中性 token，移除外来蓝色、彩色图标和浅蓝渐变，圆角回归 8px 以内。
- 新建项目视觉与文案按确认参考稿高还原：蓝色下划线 Tab、四步配置、卡片式数据入口、浅蓝 AI 摘要、彩色组件标识、橙色就绪提示及底部取消/生成操作；恢复 API/PostgreSQL 入口并保留真实连接逻辑。
- 新建项目改为两栏生成工作区：左侧按业务类型、组件、数据、需求四步配置，右侧实时汇总目标用户、页面类型、数据状态与推荐组件；生成状态和主操作统一置于底部，窄屏自动切换单列，原生成与数据逻辑继续复用。
- 修复项目中心内“连接 API”和“连接 PostgreSQL”点击后被父级弹窗覆盖的问题；连接窗口提升到项目工作台之上，确保表单可见并可操作。
- 项目工作台与 AI 设置统一采用居中弹层响应式合同：桌面限制最大宽高，窄屏保留 12px 安全边距，头尾固定且内容区独立滚动；空项目状态改为内容高度，AI 数据源控件支持换行，Provider 首次打开不再因自动聚焦跳到编辑区。
- 项目中心与 AI 首稿生成融合为同一“项目工作台”：正式页面只保留左下角“项目 / AI”统一入口，`已有项目 / 新建项目 / AI 编辑 / AI 设置` 在单一弹窗内切换；新建与编辑视图复用并嵌入原 AI Composer，不复制生成逻辑。空项目仍不持久化，接受首稿后才创建项目。Playwright Provider 存储同步隔离到测试目录，避免读取本机真实连接。
- AI 设置参考 OmniDesk 收敛为单层 Provider 管理器：顶部展示当前连接与测试状态，中部使用卡片切换已保存连接，底部内嵌地址、Key、模型读取和保存启用表单；新增/编辑不再打开第二层弹窗。暂时隐藏的组织成员、运行指标、平台状态和组织审计不再随弹窗加载，底层服务能力保持不变。
- Provider 编辑表单对齐 OmniDesk 的模型选择流程：地址与 Key 就绪后可在保存前探测 `/models`，从下拉框选择真实模型 ID；不支持模型目录的兼容服务仍可使用“自定义模型”。新增的组织管理员探测端点支持新连接临时凭证和编辑连接既有凭证，响应只返回模型 ID，不回显地址或密钥。
- Provider 管理升级为持久化 CRUD：用户可新增、编辑、删除连接，当前档案跨重启保存；API 地址作为非敏感连接配置在编辑时回显，API Key 继续独立保存且永不回显。Generation Job 按固化 organizationId 动态解析模型，双组织回归证明地址与密钥不串用；最后一个档案删除后自动回到本地演示模式。
- 组织设置新增 AI Provider 管理区：管理员可查看脱敏多档案、即时切换当前连接、发现模型和测试连接；普通成员 API 访问返回 403，浏览器不接收 endpoint、密钥引用或密钥。动态切换直接影响后续 Generation Job，重启仍回到部署配置。移动端无横向溢出，退出登录同步关闭管理弹窗，完整 Playwright 18/18 通过。
- Provider Gateway 新增 Dashboard 原生多档案与 OpenAI-compatible Chat Completions 适配：`activeProfileId` 选择当前模型档案，支持标准 `/chat/completions`、JSON 输出、一次 repair 和 prompt/completion token 归一化；同时接受 OmniDesk 公开档案结构用于迁移，但不读取其 secret 文件或形成运行依赖。新增 4 组安全与协议回归。
- OpenAI Responses Gateway 现在将上游 usage 归一化为 input/output/total token 计数并按首稿与单次 repair 累加至隔离 Generation Run；`smoke:provider` 输出该受控统计以支持真实部署验收，不计算价格，也不写入 Workspace、Revision、成品或普通浏览器状态。Mock 回归覆盖单次与 repair 累加。
- Token 管理员浏览器回归改为启动临时构建的独立 Studio 并从 `/studio/projects` 进入，继续覆盖登录、AI 首稿、组织成员、AI 运行概览和平台运行状态，证明治理模块随静态产物而非仅源码预览页面交付。
- 组织设置新增只读“平台运行状态”：组织管理员可在同一治理弹窗查看既有 readiness 的脱敏存储、身份、身份映射、执行、审计锚定与数据权限摘要。状态读取失败不阻断成员管理，移动端两列无溢出；不新增浏览器配置入口，也不暴露路径、provider、连接或策略内容。
- 新增可选组织级 Publication 审批策略：通过 `DASHBOARD_PUBLICATION_APPROVAL_ORGANIZATIONS` 配置的组织创建 `pending` 不可变快照，正确 unlisted token 在批准前也不能访问 share/embed；同组织管理员批准后沿用原链接生效。Studio 明确展示“待审批”并只向组织管理员显示批准操作，摘要不暴露请求者或审批者 ID
- Publication 创建、提交审批、批准和撤回现使用独立持久化 audit outbox：业务与最小审计意图同次提交，审计存储故障不回滚发布，服务启动、后续发布操作及审计读取均会重投。file 与 PostgreSQL Repository 统一隐藏内部 outbox，事件不包含 token、URL、HTML 或 Dataset records
- Playwright 新增真实 Studio 发布审批回归：editor 不能批准且 pending unlisted 链接为 404；同组织管理员批准后 UI 切换到已发布，创建时的一次性原链接返回 200
- Publication audit outbox 现复用配置的外部 audit anchor dispatcher：每次事件成功写入内部 audit 后异步刷新链头，anchor 故障保持既有“不回滚业务、可恢复”的边界；定向回归覆盖该调用
- 项目记录将 Publication 的内部 audit action 映射为“发布版本 / 提交发布审批 / 批准发布 / 撤回发布”；审批浏览器回归覆盖从批准到可读治理记录的完整操作链
- 新增 `smoke:postgres-connector`：部署环境可对单个显式只读 PostgreSQL 引用执行临时创建和刷新，结果只输出行/列/语义计数与状态；未配置、引用歧义和连接串缺失失败关闭，SQL、连接串、records、Dataset 和 Project 都不进入输出或持久化
- Report Publication 的 PDF 输出新增确定性分页：固定 revision artifact 内的 Report 自动使用 A4 print media、标题页眉、页码 footer、稳定边距和 Section/Card 防跨页规则；Dashboard 继续输出宽度对应的长页 PDF，Studio/Skill/standalone 边界不变
- 新增 Studio-only PostgreSQL Connector：部署方以环境变量预注册连接引用、连接串和单条只读查询，浏览器仅选择引用；连接结果复用 Dataset、语义模型、行级策略、缓存、生成、后台刷新和固定间隔计划，连接串与 SQL 不进入浏览器、Workspace、Revision 或成品
- 新增 Studio-only Data Access Policy Service：Dataset 导入/连接由服务端固化组织与 owner，列表、预览、Schema、刷新、任务、计划、查询和 AI 数据解析统一执行组织隔离；可选服务端策略按 actor/角色注入语义维度行过滤，缓存键包含授权 scope。安全回归证明跨组织隐藏、重复 ID 不能覆盖、策略结果不串缓存，持久化 Generation Job 与 portable Workspace 只获得授权行；便携 Skill 不包含策略服务。
- AI 局部修改从 Component 扩展为 Section + Component 双作用域：选中分区后可口述修改标题/副标题、前移/后移、新增说明分区或删除当前分区；命令同步维护 Document、Layout、canvasOrder、页面控件、交互状态、分区视觉、卡片覆盖和图表资源。Composer 新增分区专属范围、模板与状态恢复，生成评测扩为 10 个案例，浏览器回归覆盖接受、revision 导出和原子撤销。
- Workspace 结构协调层从卡片级扩展为 Section + Component 两级生命周期：可按 Workspace 创建、排序、更新和删除动态分区，再同步分区内卡片；动态分区具备标题/副标题、布局选择、整组拖动与上下移动入口。新增纯结构适配器回归和浏览器版本导出回归，证明新增分区进入画布与 standalone，恢复旧 Workspace 后完整移除。
- AI 浮层新增基于统一组件目录的“要求首稿包含的组件”选择器，选择结果以明确自然语言追加到提示词，不进入 Dashboard 成品。确定性生成器现能按“口径说明/备注/文本组件”等意图生成注册的 `text` 卡片，并同步进入现有内容区、布局、provenance、版本和导出；生成评测扩为 9 个案例，浏览器回归覆盖目录选择到版本导出。
- 新增统一只读组件能力 API `/api/components/catalog`，从便携 Skill 的 `component-registry.json` 与图表目录返回内容组件、页面控件和图表能力；AI Composer 改读该入口。契约门禁现强制注册表与 Workspace Schema、核心运行时必填属性及图表类型一致，并补全 `text` 的 Studio 显式渲染和六类组件确定性导出回归；便携 Skill 仍为 29 文件。
- Generation Job 新增最小终态 telemetry 与组织级指标 API：记录排队/执行/总耗时和修复次数，组织管理员可查看默认 24 小时、最多 30 天的状态、成功率、失败码和 p50/p95；响应不含 Job/用户身份、prompt、workspace、候选或错误正文。回归覆盖跨组织隔离、旧任务推导和窗口边界。
- 组织设置新增只读“AI 运行概览”，将近 24 小时候选可用率、生成成功率、自动修复率、已评审数、p50/p95 和失败分类投影为紧凑治理视图；指标失败不阻断成员管理，移动端使用两列且不横向溢出。viewer 无入口且直接 API 访问受服务端拒绝，standalone 与 Skill 均不包含该视图。
- 新增 Generation Feedback 质量闭环：Composer 保留成功 Job ID 到评审结束，接受版本后写 accepted/revision，取消预览后写 dismissed；服务端仅允许原发起人一次写入，相同反馈幂等、冲突拒绝，放弃原因只接受受控码且无自由文本。组织概览新增候选可用率与已评审数，反馈失败不回滚核心编辑动作。
- Studio 网关新增显式 `DASHBOARD_PUBLIC_ORIGIN`：生产 CSRF 校验不再依赖代理是否保留 Host，也不信任 `X-Forwarded-*`；非回环来源强制 HTTPS，OIDC redirect URI 必须精确匹配公网 origin 下的 callback。新增内部 Host 反向代理 conformance，覆盖 SPA 深链、Secure Cookie、正确/错误 Origin 写入与 OIDC 错配失败。
- Generation Job 新增真实 PostgreSQL 多实例 conformance：两个独立 worker 共享 Job 表时只有租约获胜者调用 Provider，过期 running lease 可由重启实例恢复，另一实例取消后迟到结果受 fencing 保护；数据库 payload 断言不持久化 DataContext、records 或连接凭证。普通本地环境未配置 PostgreSQL，因此该集成回归显式 skip，CI 由 PostgreSQL 17 执行。
- Studio 生成从同步请求迁移到持久化 Generation Job：新增 queued/running/succeeded/failed/canceled 生命周期、组织/发起人授权、租约 heartbeat/fencing、Provider AbortSignal、创建/轮询/取消 API 和 sessionStorage 任务指针。页面刷新可恢复同一任务，停止生成不会被在途成功响应覆盖；同步 draft/refine API 保留兼容，成功任务仍需用户接受才提交 revision。
- 真实数据 Generation eval 扩为 portable/non-portable 对照：non-portable workspace 必须保持 0 binding、0 Dataset records，但 KPI、图表、排行和聚合表仍与服务端 Query Snapshot 一致；负向测试向 workspace 注入 records 并篡改表格值时分别触发 portability 与 visible-value 失败。生成器不再为 non-portable 表格保留静态示例行。
- Generation eval 增加合成真实 CSV grounding 案例，并通过正式 Data Source/DataContext 路径验证 Dataset 引用、字段 binding、语义聚合、KPI/图表/排行/表格可见值、真实 provenance 与 portable 边界；负向测试证明未知字段和篡改值会失败。生成器同步修正 Query Snapshot 指标列错位、真实表格/排行静态占位和真实维度筛选字段不匹配。
- 新增 Studio-only AI generation eval：版本化 5 个多领域首稿与 1 个局部精修案例，按协议状态、修复预算、结构、意图、provenance、可编辑性和目标范围评分；确定性 `eval:generation` 以单例 85/平均 90/100% 通过率阻断检查，显式 `eval:generation:provider` 用于远程模型。评分负例证明非目标组件漂移会失败。
- Studio HTML 导出移除最后的 `serializeFallbackExport` DOM 克隆路径：导出与发布现在共用 `prepareRevision`，有效 workspace 的未保存修改先追加 user revision，空白视觉模板提示先生成首稿。契约禁止 fallback 回流，Chromium 新增自动版本化下载回归；完整浏览器基线升至 `13/13`。
- 删除 Editor Runtime 中失去调用者的旧 standalone 数据绑定/筛选/Tab helper；新增 renderer parity 合同，逐项核对 revision workspace 的 section、component、顺序、span、页面主题和来源标记，Node 基线升至 `130 passed / 5 PostgreSQL skips`。
- 新增确定性 `npm run build:studio`：Studio Web 可独立输出到 `dist/studio-web/`，构建时只在产物内把 workspace core 适配为本地 runtime，并生成逐文件 SHA-256 清单；双构建回归禁止仓库内部路径、服务端配置、后端模块和内联脚本进入静态产物。部署合同固定为根路径、同源 API、`/studio/*` SPA fallback 与未哈希资源重新验证缓存。
- Preview Server 新增可选 `DASHBOARD_STUDIO_WEB_ROOT` 正式静态模式和 `npm run start:studio`：API、发布与 embed 路由优先，Studio 深链最后回退构建 HTML，缺失脚本保持 404。新增临时构建 HTTP 集成回归覆盖 MIME、缓存、fallback 和服务端路由隔离。
- Studio Web 渐进迁移建立首批正式路由：`/studio/projects` 打开项目中心，`/studio/projects/:projectId` 可直接恢复指定项目；新增独立 Router 模块，只通过 Project Center 窄接口读取/激活项目并同步 URL。服务端继续复用现有编辑器壳，旧预览文件名保留兼容，standalone 导出移除 Router。
- 组织控制面接入 `/studio/organizations/current`：Router 仅调用 Project Center 的公开 `openOrganization` 操作，组织读取、管理员授权、成员更新和审计继续由现有服务端 API 负责。token 浏览器回归验证管理员会话深链可用。
- 发布管理接入 `/studio/publications/:publicationId`：Publication Center 根据服务端发布记录恢复所属 Project、打开发布面板并定位目标记录；Router 只传递 publication ID。浏览器回归从真实发布深链继续验证 artifact、PNG 和撤回流程。
- Studio 组织控制面新增 OIDC 邀请生命周期：管理员可创建绑定已知 immutable identity 的限时、单次邀请；接受 secret 只返回一次且仅持久化 hash。
- OIDC callback 在受邀身份通过 issuer/subject 验证后绑定 External Identity、激活动态成员并创建既有 HttpOnly session；不匹配身份保持 fail-closed。默认 file-storage OIDC 装配与 PostgreSQL 一致注入 Organization Service，新增 Node/HTTP 回归覆盖接受、拒绝和 secret 不持久化。邀请邮件、SCIM 和跨仓库原子提交仍未实现。
- 受控图表目录扩展为 `horizontal-bar` 条形图：Schema、Workspace 校验、提示词语义路由、AI 精修、卡片下拉、ECharts SSR、编辑器 SVG 回退、standalone 导出回退与 ARIA 统一同步。条形图承载长分类标签、排名和横向比较；节点和 Playwright 回归覆盖目录搜索、渲染和手工选择后的 revision 导出。
- 新增 Studio-only 外部身份基础：持久化 `providerId / issuer / subject` 不可变映射与短期单次 OIDC 登录事务，限定 PKCE verifier、nonce、state 和相对回跳路径只在服务端；新增 Node 回归覆盖身份改绑、状态重放、过期与开放回跳拒绝。未开放 OIDC 路由或接入具体 IdP，轻量 Skill 显式排除模块。
- 新增 Studio-only OIDC Provider Service：标准化 provider URL/scopes，生成 `Authorization Code + PKCE S256` 授权请求，将 code exchange、ID token 验签和 actor 解析保留为受控注入边界；完成前复核 issuer、audience、nonce、组织与 External Identity 映射，禁止 client secret 进入授权 URL。新增回归覆盖映射成员的成功完成与 state 重放拒绝。
- Preview Server 新增匿名 OIDC provider/start/callback 路由和 `oidc` Auth Service mode；只有注入 Provider 服务完成 exchange、验签和映射后才设置既有 HttpOnly session，token 登录被拒绝。HTTP 回归覆盖 302、回调、session 和 token 拒绝，默认服务仍未配置真实 Provider。
- 新增 Studio-only OIDC RS256 verifier 与 Authorization Code exchange：只从 HTTPS JWK 获取 RSA key，并验证签名、issuer、audience、nonce、时限与 `azp`；unknown `kid` 触发单次刷新，异常全部失败关闭。exchange 采用 Basic client authentication 且只交回 ID token。真实 RSA 签名回归覆盖成功、nonce/过期拒绝、JWK cache 与 secret 不进 POST body。
- 新增 OIDC runtime configuration：file storage 可通过分离的 `DASHBOARD_OIDC_PROVIDERS_JSON` 与 `DASHBOARD_OIDC_CLIENT_SECRETS_JSON` 装配 Provider、PKCE、code exchange、RS256 verifier 和 External Identity store；Provider/JWK 缺失 fail-fast，client secret 不进入公开 provider 或授权 URL。
- PostgreSQL 新增共享 External Identity 仓储：沿用 SHA-256 `providerId / issuer / subject` 键与不可改绑合同，使用事务级 advisory lock 保护并发首次绑定，并支持跨实例读取和解绑；配置式 OIDC 现在复用同一组织/认证服务与共享 identity/session 仓储启动。普通本地环境未配置 PostgreSQL，因此该集成回归保持显式 skip。
- Platform readiness 现在对 OIDC 额外验证 Provider 编排和 External Identity 仓储；成功只报告模式与 provider 数量，缺失依赖失败关闭且不泄露 provider/issuer/identity/secret。新增成功与失败关闭 Node 回归。
- 组织成员暂停或移除现在在同一组织更新中持久化 session-revocation outbox；独立 dispatcher 按成员/组织清理 session，失败会保留并在下次启动或成员更新后重试。鉴权层原有的成员状态复核继续作为投递延迟期间的拒绝边界；新增 session 实际撤销与 outbox 失败恢复回归。
- PostgreSQL Audit Sink 现在为每个已提交 chain head 同事务写入稳定、最小化的 anchor outbox；可选 HTTPS sink adapter 仅发送 anchor payload、接收不透明 receipt，失败分类重试而不回滚业务或内部 audit。新增管理员 anchor status API、sink 边界、失败重试和 PostgreSQL conformance（配置数据库时）回归；独立 WORM/合规留存仍由部署验证。
- 新增企业身份与外部审计架构合同：明确服务端 OIDC Authorization Code + PKCE、不可变 subject 成员映射、默认关闭 JIT、统一 invitation/SCIM 生命周期，以及不回滚业务写入的外部 audit chain head 异步锚定。
- AI Composer 的版本历史增加受限的只读比较面板：历史 revision 与当前 workspace 共用 `workspace-core` 差异计算，最多展示 12 项字段变化；比较不会恢复、提交或修改 Project，用户仍需显式点击恢复后才追加新的不可变 revision。
- 预览 HTML 契约与 Playwright 历史流程覆盖比较入口、可见差异、恢复和撤销的连续行为。
- Project Center 当前项目入口改为“重新加载”：服务端条件写拒绝旧 revision 后保留本地脏状态，用户确认后才从服务端取回最新 workspace；新增双页面浏览器回归覆盖冲突拒绝与显式恢复。
- 新增 `studio/workspace-core-client.mjs` 作为 Studio 浏览器对 portable core 的唯一入口；状态恢复和 AI 历史比较迁移到该边界，正式 Studio Web 可替换打包来源而不修改业务模块，新增导出契约单测。
- `/p/*` 与 `/embed/*` 对已授权访客新增进程内固定窗口限流；默认每分钟 120 次，超限返回 `429/Retry-After`，访问事件不保存连接来源且限流拒绝在同一窗口只记录一次。
- 新增显式 `smoke:provider` 命令，为有效 OpenAI 配置运行首稿与组件精修的隔离预览验收；无配置时不联网失败，结果不输出敏感请求或 workspace，也不产生 revision。

## 2026-08-10

- 项目中心新增 AI-first 新项目命令：不创建空 Project，保留视觉/数据基线并清除当前 Project/revision，候选接受后才由现有 generation commit 原子创建首版；浏览器回归覆盖新旧项目身份隔离与单 revision 创建
- AI Composer 的图表局部修改模板改为从 `/api/charts/catalog` 动态读取，避免图表目录、生成器与工作台分叉；静态四项模板只作为目录不可用时的降级，浏览器回归覆盖目录驱动的选择、精修、撤销和历史恢复
- 新增 `studio/studio-api-client.mjs`，将 Project、Publication 和 Data Source Center 的重复 JSON HTTP 适配收敛为无状态共享边界；Data Source 保留字段校验错误优先级，预览契约新增 API client 导入、方法集和模块语法检查
- Editor Runtime 升级为 ESM，并直接导入便携 `workspace-core.mjs`；v1 草稿、Project、AI preview、undo 与 restore 统一迁移/校验，非法 workspace 在 DOM 写入前原子拒绝
- 新增 Studio-only `workspace-session.mjs`；本地草稿、URL/旧 hash、工程内嵌状态、logo 脱敏和旧历史清理从 Editor Runtime 抽离，并以结构化错误交回 UI 映射
- 新增 7 项 Session 单测，覆盖坏 JSON、URL 优先级与兼容清理、logo 排除、存储配额失败和内嵌工程状态；Node 回归增至 66 项
- 新增 Studio-only `workspace-renderer.mjs`；已物化 document 的标题、来源、分区、摘要、KPI、基础图表、列表和表格投影移出 Editor Runtime，运行时只保留编排调用
- 预览契约要求 Renderer 模块化且阻止旧投影助手回流；真实页面标题/KPI 与无 runtime error 实检、Node `66/66` 和浏览器 `9/9` 均通过
- 新增 `workspace-control-renderer.mjs`，筛选栏、视图 Tab、ARIA 状态、分区显隐和目标 pending 反馈移出 Editor Runtime；状态更新、事件、重算和保存通过窄回调编排
- 新增 2 项控件解析测试，覆盖 falsey 筛选值及活动/默认/首项 Tab 回退；Node 增至 `68/68`，浏览器 `9/9`，真实华东到华南筛选同步更新三项 KPI 且无 runtime error
- 新增 `workspace-chart-adapter.mjs`；ECharts SVG 请求、缓存、render-key 竞态保护、容器状态、ARIA 与 portable fallback 移出 Editor Runtime，并暴露 remote/cache/fallback/stale/native/empty 结果
- 新增 4 项 Chart Adapter 测试，覆盖多序列与单序列归一化、四类图表标签、有效 SVG 和非法响应；Node 增至 `72/72`，真实环形图尺寸、绘图节点、ARIA 与无 runtime error 已验证
- 新增 `workspace-state-core.mjs`；Workspace v2 快照组成、共享 v1/v2 迁移校验和 document/interactions/resources 恢复切片从 Editor Runtime 抽离，所有边界执行深克隆
- 新增 4 项状态内核测试，覆盖快照隔离、v1 默认值、非法状态无部分结果和恢复切片隔离；Node 增至 `76/76`，浏览器 `9/9`，非法 URL 状态回到完整默认页面且无 runtime error
- 新增 `workspace-layout-interaction.mjs`；跨度吸附、5px 指针阈值、四向落点、纵向插入与 canvasOrder 防抖重排从 Editor Runtime 抽离为纯规则
- 新增 4 项布局规则单测和 1 条 Chromium 指针拖拽回归；Node 增至 `80/80`、浏览器增至 `10/10`，真实卡片跨行换位、目标反馈、占位清理、dirty 与无 runtime error 均有证据
- 新增 `workspace-layout-controller.mjs`；Layout Config 的 DOM 序列化与回放从 setupLayoutEditor 抽离，覆盖 canvasOrder、summary/section/item span、grouped、layout 与稳定追加顺序
- 新增 2 项 Controller 跨度归一化测试；浏览器拖拽用例增强为换位后保存、刷新并验证顺序恢复，完整基线为 Node `82/82`、浏览器 `10/10`
- 新增 `workspace-structure-synchronizer.mjs`；纯计划层统一 Document/Layout 与现有 DOM 的 create/move/update/remove 差异，DOM 应用层通过注入适配器复用模板、选择和布局绑定
- 新增 3 项结构同步测试，覆盖新增、删除、跨分区、缺失 Layout item、旧 DOM 清理、稳定顺序和输入不变；完整基线为 Node `85/85`、浏览器 `10/10`、Skill 29 文件、audit 0
- 新增 Studio-only `studio-json-file-store.mjs`，集中 `0600` JSON 创建、确定性列表、坏 JSON 失败、同目录临时文件和原子替换；Job、Schedule、Dataset 与 Publication 仓库完成迁移，领域队列和冲突语义保持在各仓库
- 新增 3 项文件存储测试，覆盖安全 ID、文件权限、重复创建、确定性序列化/列表、原子替换、临时文件清理和坏 JSON；新模块明确进入 Skill 禁止打包清单，完整基线为 Node `88/88`、浏览器 `10/10`、Skill 29 文件、audit 0
- 新增 `studio-audit-outbox.mjs`；Project 写入与待投递审计事件进入同一原子快照，Audit Repository 按稳定事件 ID 幂等追加，dispatcher 在启动、写后和查询前恢复投递
- Project Repository 对外自动剥离 `_outbox`；复制、权限、重命名、归档/恢复、手工创建、迁移和 Agent 创建均移除直接双写，审计离线不再让已成功的业务请求伪失败
- 新增 5 项 outbox 测试，覆盖内部状态不泄露、非法文件名和伪造 outbox、投递失败恢复、append 成功但 ack 前崩溃的幂等重放，以及 Audit 离线时 Project API 仍成功并在恢复后补投；完整基线为 Node `93/93`、浏览器 `10/10`、Skill 29 文件、audit 0
- 新增 Studio-only `studio-storage-runtime.mjs`，显式定义七个仓储端口并在服务组合时 fail-fast 校验；readiness 对各仓库执行只读探针并报告存储 provider 与部署能力
- 新增匿名 `GET /api/platform/readiness`；file adapter 明确返回 local-only、非 shared、非 multi-instance、非 production-ready，响应不泄露目录或对象内容
- 新增 4 项 Storage Runtime 单测并在 token HTTP 回归中验证匿名 readiness；模块进入 Skill 禁止打包清单，完整基线为 Node `97/97`、浏览器 `10/10`、Skill 29 文件、audit 0
- 新增 Studio-only PostgreSQL storage adapter，以通用 JSONB 实体表和独立 Audit/Publication Access Event 表实现七仓端口；Project 使用 advisory lock、row lock 与事务 outbox，支持跨连接池条件写和幂等事件投递
- 预览服务支持 `DASHBOARD_STORAGE_PROVIDER=postgresql`、数据库 URL 与连接池上限；未知 provider 或连接失败均 fail-fast，不回退 file。GitHub Actions 新增 PostgreSQL 17 service
- 修复 PostgreSQL JSONB 规范化对象键序后 undo/restore 被误判为 workspace drift：改用结构深比较并增加键重排回归。真实 PostgreSQL adapter `1/1`、PostgreSQL Playwright `10/10`、完整 Node `98 passed / 1 environment skip`、Skill 29 文件、audit 0
- 新增 Studio-only Session Repository 契约与内存实现；Auth Service 会话操作改为异步，Cookie 原值只留在 HttpOnly Cookie，repository 仅持久化 SHA-256 摘要、身份引用和过期时间
- PostgreSQL adapter 新增共享 Auth Session 表；配置为 PostgreSQL 时认证自动使用同一连接池，readiness 单独报告认证会话 provider 与 shared/multi-instance 能力
- 新增跨实例 HTTP 回归：实例 A 登录后实例 B 可鉴权，B 注销后 A 立即失效；完整基线为 Node `101 passed / 1 environment skip`（真实数据库 `102/102`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0
- Refresh Job/Schedule 新增 PostgreSQL 兼容的过期租约、heartbeat、fencing token 与确定性 Schedule Job ID；过期 worker 的迟到 Dataset 结果被拒绝，同一到期点及“创建后崩溃”重放复用同一 Job
- PostgreSQL migration 为 queued/running/retrying 的同 Dataset Job 加唯一约束；readiness 新增 execution 能力，明确 file 为非分布式、PostgreSQL 为可协调 Refresh execution
- 新增真实 PostgreSQL 双 worker/scheduler 回归；完整基线为 Node `102 passed / 2 environment skip`（真实数据库 `104/104`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0
- Semantic Query Cache 改为 async Store 协议；file 保持内存 LRU，PostgreSQL 新增共享 TTL 表。缓存 key 加入 Dataset ID，Schema/手动刷新/后台 Job 成功后按 Dataset 清理，fingerprint/语义版本继续保证跨版本 miss
- readiness 增加 queryCache `shared/persistent` 能力；新增真实跨连接池缓存命中、TTL 与定向失效回归，缓存表只存聚合结果
- 新增 Studio-only Organization Repository 与 Organization Service：token identity 与组织成员治理分离，组织名、成员状态和 organizationRole 持久化；每次会话解析当前成员，暂停成员立即失效
- 新增 `/api/organizations/current` 与 `/api/organizations/current/members` 管理 API，组织管理员受 optimistic concurrency 和“至少一名活跃管理员”约束；file/ PostgreSQL 均进入 storage readiness 探针，轻量 Skill 明确排除相关模块
- 浏览器新增 v1 -> v2 恢复断言与非法快照不污染画布断言；共享缓存发布基线为 Node `103 passed / 4 PostgreSQL environment skip`（数据库 `107/107`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0，可复现哈希为 `71fe3c5249e1b3c14f97235705e94ca454fa24cba3c89034500ac2bfc159db27`
- 将 4503 行内联 workspace editor/runtime 从预览 HTML 抽至 `studio/editor-runtime.js`；页面壳现在零内联脚本，运行时可独立严格解析，五个业务模块继续通过冻结 bridge 装配
- 修复重复 `workspaceComponentById` 声明造成的返回形状冲突；手动图表类型现在更新生成 workspace 的 `props.chartType`，并经保存 revision 与浏览器导出验证
- Skill 契约检查改为从外部 editor runtime 核对固定分类色板；包仍为 29 文件，可复现哈希更新为 `0a31d8a9713cacb254350d4966e0644fc6b56b6e384b42fcee5af7c2907f27d7`
- 新增 `studio/export-center.mjs`，接管 revision artifact、旧项目迁移、文件保存、下载状态和公共导出 API；主 HTML 只保留兼容草稿 DOM 序列化与只读 export bridge
- 预览契约扩展为 5 个 Studio 模块；浏览器新增真实下载事件，验证版本文件名、内容和 Studio 代码清理
- AI candidate/Review/commit/undo orchestration 已完整移入 `studio/ai-composer-center.mjs`；主 HTML 删除 pending run、baseline、Review 渲染和 generation API 调用，冻结 bridge 改为结构化快照与四个单用途应用动作
- 预览契约新增 AI 事务归属检查：要求模块持有 draft/refine/commit/undo，并阻止相关网络和状态实现回流主运行时
- AI History/Restore orchestration 已移入 `studio/ai-composer-center.mjs`：模块负责历史 API、列表 DOM 与恢复请求，主编辑器仅通过冻结 bridge 提供克隆上下文并应用服务端已验证的 revision
- 新增 `studio/ai-composer-center.mjs`，抽离 AI 工作台开合、作用域文案、提示模板、快捷键和生成/接受/取消/撤销命令绑定；编辑器通过冻结 bridge 提供当前组件摘要和受控事务命令
- 预览契约扩展为 4 个 Studio 模块；干净导出明确排除 Project、Publication、Data Source 和 AI Composer 模块
- 新增 `studio/data-source-center.mjs`，将文件导入、REST 连接、字段语义、刷新任务与固定间隔调度从主预览运行时抽离；AI Composer 仅通过冻结 bridge 消费 clone 后的当前 Dataset
- 预览契约扩展为 3 个 Studio 模块并阻止 Data Source 实现回流；CSV、Excel、last-known-good 刷新和 REST 浏览器链路继续通过
- 新增 `studio/publication-center.mjs`，将发布列表、新鲜度、访问统计、一次性分享、嵌入、HTML/PNG/PDF 和撤回 UI 从单文件抽离
- `DashboardStudioBridge` 新增受控发布准备：只能确保当前 workspace 已保存并返回 projectId/revisionId，Publication 模块不能读取画布 DOM；契约与浏览器验证模块不进入干净导出
- 新增正式 `studio/project-center.mjs` 前端模块，将项目 API、列表、切换、成员和审计 UI 从单文件预览抽离；编辑器只暴露冻结的 `DashboardStudioBridge`
- 预览契约检查新增模块存在/语法/bridge/无重复实现约束；浏览器验证 fallback 干净导出不包含 Project Center 模块、入口或成员弹窗
- M4 增加组织范围：token 身份带 `organizationId`，身份目录只返回同组织公开字段，新 Project 固化组织归属，跨组织 admin 也不能读取项目或审计事件
- 项目中心新增成员管理和项目记录：owner/admin 可将同组织身份设为 viewer/editor，所有可读成员可查看创建、复制、重命名、归档、恢复和 ACL 更新事件
- 新增 `.dashboard-audit` 不可变事件仓库与受控查询 API；事件不保存 token、workspace、数据正文或客户端 IP，测试与真实仓库目录隔离
- Studio 新增不进入成品的悬浮项目中心，可打开服务端项目、恢复完整 workspace、重命名、复制当前 revision、归档和恢复；归档项目在服务端强制只读
- Project 元数据与 ACL 写入使用严格单调 `updatedAt` 和乐观并发；复制项目获得新身份、新 owner 和单一首版，不继承来源成员或历史
- M4 增加 Project 所有权与 ACL：全局 admin 可管理全部项目，owner 可管理成员，项目 editor/viewer 分别获得写入/只读能力；项目列表、版本、导出、Publication 和访问审计均执行资源级授权
- Refresh Job 的重启恢复改为单实例幂等，避免服务自动恢复与显式恢复并发时重复执行同一任务
- M4 新增 Studio Auth Service：可配置 token 身份源、256-bit 内存会话、HttpOnly/SameSite Cookie、可选 Secure、Origin 校验和 viewer/editor/admin 全局角色
- Studio 增加登录门禁、当前身份退出入口和 viewer 只读模式；会话状态不写 localStorage，兼容导出移除全部认证 UI、属性和 CSS
- 新增 `docs/SECURITY.md`，集中定义身份、会话、授权、Publication 和敏感数据边界；Node 与真实浏览器覆盖 401/403、错误令牌、Cookie、角色、CSRF 和退出
- M3 按 ROADMAP 完成正式门槛审计；新增提交 Project 后刷新 Dataset 的跨仓库不变量测试，证明 revision、组件 ID、document 和 layout 不变
- AI 工作台自动折叠改为可被用户主动开合取消，避免接受修改后的延迟定时器关闭正在操作的历史面板
- Publication 新增 `/embed/:id`，复用共享令牌、visibility、撤回与访问审计；Studio 可复制带完整 unlisted token 的 iframe，public 发布可持续复制稳定嵌入代码
- 新增 Studio-only Publication Renderer：指定已发布 artifact 可按受控宽度导出真实 PNG 和保真长页 PDF，关闭动画、等待字体并限制最大页面高度；撤回对象不可渲染
- 发布管理有效记录增加 HTML/PNG/PDF 下载，真实 Chromium 与浏览器端到端回归检查 PNG 签名、像素尺寸、PDF 文件头、embed frame header 和 revision 内容
- Refresh Job 增加 canceled 终态和取消 API；queued/retrying 清除待执行定时器，running 被取消后丢弃迟到结果，不更新 Dataset、不重试
- 新增持久化 Refresh Schedule Store 与服务：REST Dataset 支持 15 分钟至 30 天固定间隔、启停、nextRunAt、最近 Job、失败记录和重启恢复；超长定时器使用分段唤醒
- Studio REST 数据源增加“刷新设置”面板，可选择手动、15 分钟、每小时、每 6 小时、每天或每周，查看最近任务并取消活跃任务
- Publication 新增真正的访客访问执行：`/p/:id` 对 private 隐藏、对 unlisted 校验随机令牌、对 public 直接提供内联成品；撤回后共享路径返回 `410`
- unlisted 令牌只在创建时返回一次，Publication 仓库仅存哈希且管理摘要不返回哈希；新增独立 Access Store 记录 allowed/denied 事件，不保存令牌、URL、正文或 IP
- Studio 发布成功后显示一次性访问链接并支持复制/打开，公开记录提供持续打开入口，列表汇总成功访问与拒绝次数；移动端发布面板改为单列布局
- Studio 顶部新增发布管理入口：可把当前已保存 revision 发布为 private/unlisted/public，查看新鲜度、下载确定性 artifact，并经确认撤回；撤回后 artifact 返回 `410`，重新发布创建新 Publication
- Publication API 增加撤回终态，既有对象和审计元数据保留且不可覆盖；Playwright 覆盖发布、下载、撤回和失效链路
- 浏览器测试启动前只清理 `test-results` 下 Project、Dataset、Publication 和 Job 仓库，避免跨运行残留导致列表断言漂移
- 新增受控 REST Connector：HTTPS/主机白名单、服务端 credentialRef、禁重定向、超时与响应大小限制；REST 结果复用 Dataset、Semantic Model、Query 和 Publication 链路
- 新增持久化 Refresh Job Store 与 worker：queued/running/retrying/succeeded/failed、指数退避、最大尝试、活跃任务冲突和重启恢复；提供创建、列表和详情 API
- Studio 增加“连接 API”模态，用户只填 URL、recordsPath 和凭证引用；REST 的“立即刷新”改为后台任务轮询，显示排队、尝试和重试状态
- 新增 REST 安全合同、Job 重试/恢复/API 单测和真实浏览器连接/后台刷新回归
- Dataset 新增手工刷新状态机：同格式重新上传通过解析、字段和语义校验后原子替换；失败保留最后成功数据并记录 attempt/error，可继续重试
- Semantic Query 新增指纹与语义版本驱动的 TTL/LRU 缓存，响应暴露 hit/miss；成功刷新自动绕过旧缓存
- Publication 详情新增 `current / stale / missing / embedded` 新鲜度检测；Studio 数据入口新增“重新上传”，失败时保留当前 Dataset 和字段配置
- 新增刷新 API、缓存、发布过期单测和真实浏览器刷新成功/失败回归
- 新增 Semantic Query：只消费语义维度/指标 ID，支持受控筛选、分组、时间粒度和聚合，返回 Dataset 指纹与语义版本；非便携数据首稿可显示真实聚合值而不写入原始 records
- 新增不可变 Publication 对象与原子仓库：固定 project revision、确定性 artifact SHA、访问策略元数据和 Dataset 查询快照；提供创建、列表、详情与 artifact API
- Playwright 测试仓储增加 Publication 隔离目录；Publication 元数据不返回 HTML，重复 ID 以 `409` 拒绝覆盖
- 数据源导入扩展到 `.xlsx`：服务端受限解析工作簿，自动选择首个含数据工作表并支持显式切换；重复或空表头稳定规范化后继续复用既有字段画像与 Semantic Model
- Studio 数据入口支持 CSV、JSON、Excel；多工作表时显示紧凑工作表选择器，切换后重新解析字段，portable 授权和 2 MB/行列限制保持一致
- 新增 Excel 单元、HTTP API 与真实浏览器上传回归；测试夹具使用标准最小 XLSX，损坏工作簿在持久化前拒绝

- M3 Dataset 新增原始规范化记录、无损字段类型修正和版本化 Semantic Model；维度、指标、聚合、格式和时间粒度可在 Studio 中确认
- 新增数据源 schema PATCH API、类型转换校验和 `expectedUpdatedAt` 乐观并发；生成器改为消费确认语义，不再按字段顺序猜测
- 数据运行时、Studio 兼容导出和 revision exporter 统一支持 min/max 聚合与格式 multiplier，0.35 可按确认口径渲染为 35%

- M3 新增 Studio-only CSV/JSON 数据源服务与原子仓库：可靠解析、受控大小/行列限制、字段规范化、类型推断、质量画像、列表和预览 API
- Provider Gateway 在生成前解析上传数据身份，只向 Provider 暴露字段摘要和最多 12 行受控样本；客户端名称不能篡改服务端数据源身份
- AI 工作台新增数据导入与显式便携开关；便携副本最多 500 行进入 workspace/revision/standalone，并驱动 KPI、图表、表格和排行绑定
- 自动回归增至 43 项，Playwright 增至 4 条；新增真实 CSV 文件选择、画像反馈、数据首稿、KPI `4,500`、图表/表格记录和成品数据验证

- 新增手工 revision API 与 Studio 显式保存编排：结构化项目的视觉、布局和筛选修改会追加 `source: user` revision，过期 current revision 返回 `409` 并保持画布脏状态
- Playwright CI 扩展到 3 条：新增局部精修、接受、整批撤销、历史列表和追加式恢复流程；首稿接受后手工筛选保存也验证会生成 `revision-user-*` 并进入确定性导出
- Skill 打包归一化文件时间、排除目录条目并按 manifest 顺序写入；新增 `test:package` 连续构建并逐字节比较，当前哈希由每次构建输出记录
- 新增 GitHub Actions 产品验证流水线与 2 条 Playwright 回归：真实驱动 Studio 自然语言首稿/接受/版本导出，并验证 standalone 筛选、图表、Tab、桌面和 390px 响应式
- 浏览器测试使用独立 8766 服务和临时 Project store，不复用或污染用户正在运行的 8765 项目；失败时保留 trace/report
- Playwright 固定为已修复下载证书校验漏洞的 `1.55.1`，`npm audit` 为 0 漏洞
- 新增可移植 `revision-exporter.mjs`，从指定不可变 revision 确定性生成 standalone HTML、四类轻量内联 SVG、portable 筛选/Tab 运行时和 SHA-256，不读取编辑器 DOM
- 新增 Project revision 导出与仅创建式旧项目迁移 API；正式保存成品入口优先导出服务端 revision，无 revision 手工草稿才使用明确标识的兼容导出
- 产物浏览器验收通过：筛选同步更新 KPI/图表/表格/排行，Tab 隐藏目标外分区，桌面与 390px 横向溢出均为 0，无页面运行错误
- 自动回归增至 40 项；便携 Skill 增至 29 个文件，新增文件为无 Studio 依赖的纯导出器
- 新增 Studio-only 持久化 Project Repository：项目 JSON 使用临时文件原子替换，同项目写入串行化，并通过 `expectedRevisionId` 以 `409 stale` 拒绝并发覆盖
- `commit / undo / restore / history` 改为读取服务端权威项目，新增项目列表与单项目读取 API；旧客户端项目快照仅作为首次迁移 seed，服务端已有项目不会被回传快照覆盖
- 自动回归增至 39 项，新增真实临时目录落盘、repository 重建恢复、并发写竞争、HTTP 项目读取和过期提交验证
- 新增 Studio 服务端 `provider-gateway.mjs`，统一确定性 provider 与可选 OpenAI Responses 适配器；`draft / refine` 不再在 HTTP 路由中直接调用确定性生成器
- Gateway 在 provider 前建立规范化 request 与显式 Data Context，无数据首稿统一补 `primary-data / sample` 身份；provider 返回的 request 不能覆盖平台真相
- 远程适配器使用 schema-guided JSON 输出并继续执行本地 generation/workspace/provenance/command 校验；首次失败最多修复一次，第二次失败不污染当前 workspace
- 新增显式 provider/model/key/endpoint/timeout 环境配置；默认不需要密钥且不隐式选择远程模型，API key 不进入 prompt、run、workspace、health、日志、便携 Skill 或成品
- Provider 错误统一区分未配置、拒绝、限流、超时、上游故障、无输出和非法 JSON；Studio 对 429/502/503/504 显示对应可行动提示
- 自动回归由 29 项增至 39 项，覆盖 provider 路由、结构化请求、request 防篡改、单次修复、限流、真实 Abort 超时、未配置、HTTP 状态、schema 自包含、密钥泄漏边界、重生成状态清理和持久化并发控制
- 组件作用域 AI 精修扩展为受控结构命令：支持复制、新增同类、删除卡片，切换 `3 / 4 / 6 / 8 / 12` 列跨度，以及前移/后移；文档、布局、Dashboard `canvasOrder`、筛选目标、视觉覆盖和资源引用保持原子同步
- `workspace-core` 为稳定 ID 数组生成精确 `insert / remove / move` 反向命令，结构撤销不再退化为根 workspace 覆盖；摘要卡不可复制，分区最后一张卡不可删除
- Studio 增加 workspace 驱动的真实画布协调层：新卡从受控类型模板克隆并重新绑定选择、拖动、左右调宽和落点，删除、取消、撤销及历史恢复都会同步真实 DOM
- Project store 与生成 API 增加版本历史查询和指定 revision 恢复；恢复旧版本会追加新的恢复 revision，保留完整历史，并在当前 workspace 发生手动漂移时拒绝覆盖
- AI 工作台新增版本历史面板；接受、撤销和历史恢复会自动持久化 workspace 与 URL，历史 UI 与结构状态继续从 standalone 导出中移除
- 自动回归由 27 项增至 29 项，并完成复制、删除、调宽、前后移动、刷新持久化、历史恢复、漂移拒绝及 390px 响应式浏览器验收
- generation request 增加 `workspace / component` 作用域；Studio 选中结构化卡片后切换为“AI 修改卡片”，当前确定性 provider 支持图表类型、标题、副标题和摘要正文的受控局部修改
- 局部生成只提交目标字段 command batch，不允许用 workspace 根替换模拟精修；不支持的指令、缺失目标或失效组件 ID 返回可行动的契约错误
- 隔离预览增加字段级 `before -> after` 差异；接受后 revision 同时保存正向命令、字段级反向命令、摘要和父 revision，取消继续完整恢复基线 workspace
- 新增 `POST /api/generation/refine` 与 `POST /api/generation/undo`；撤销仅允许作用于当前 revision，且当前 workspace 与已提交快照一致，避免覆盖后续手动编辑
- 移动端 AI 修改工作台改为底部面板，打开时暂时隐藏视觉设置抽屉但不清除选中卡片；Dashboard 仍在面板后方可见
- 自动回归由 24 项增至 27 项，并完成真实浏览器局部修改、三字段差异、接受、取消和整批撤销验收

## 2026-08-09

- 图表卡片新增受控 `chartType` 内容属性与局部“图表类型”选择器，完整支持折线图、面积图、柱状图和环形图；旧 workspace 未保存该字段时继续兼容
- 确定性 AI provider 增加显式名称优先和趋势、累计、对比、构成语义路由，环形图自动采用分类色板；生成评审区与提示词模板同步展示可调用类型
- 折线、面积和环形图在 Studio 中按卡片实际宽度、深浅模式调用 ECharts SSR，柱状图保留原有轻量实现；服务不可用或 standalone 交互重算时使用响应式内联 SVG 降级
- 修复生成副标题覆盖 `.panel-note` 结构后导致筛选重绘报错的问题；图表类型现可随筛选、保存、刷新和生成 revision 稳定恢复
- 自动回归由 22 项增至 24 项，并增加四类语义路由、非法类型以及预览图表控件契约检查

## 2026-08-08

- 视觉预设将内置与自定义项合并为一条直选栏，以细分隔线区分来源并把无外框 `+` 固定在栏末；自定义项悬停、聚焦或选中时显示单项管理入口，并补齐命名、已修改、更新、重命名和确认删除流程，顶部保存仍只负责当前 Dashboard
- workspace v2 增加页面级 `document.controls` 与独立 `interactions` 状态，注册 `filter-bar / view-tabs` 并校验默认值、唯一 ID、目标组件和 Section 引用
- 本地确定性 provider 可从年份、月份、区域、行业、筛选、视图和 Tab 等明确意图按需生成控件；普通首稿不增加交互 UI
- 新增轻量 `interaction-runtime.mjs`，以原生 select/button 输出主题化控件和最小 Controller；便携 Skill 清单同步纳入
- 预览 Studio 接入筛选状态持久化、Tab 分区显隐和 `dashboard:filters-change` 事件；standalone 导出仅为实际存在的控件保留最小事件运行时
- 新增 `data-runtime.mjs` 与 dataset/binding 协议，支持 KPI 聚合、图表序列、表格行映射和列表排行共用筛选状态；绑定字段、筛选字段与数据引用在渲染前严格校验
- dataset 增加显式 `portable` 策略；standalone 只嵌入允许的数据，不可嵌入时固化当前结果并移除筛选栏
- 自动回归由 16 项增至 22 项；完成桌面/移动视觉、Tab 显隐、四类组件联动、revision 状态恢复和真实成品落盘结构验收

## 2026-08-07

- 产品路线由“完整手动 Studio 后接 AI”调整为“AI 首稿优先”：M0 稳定受控生成，M1 交付口述首稿，M2 提供局部 AI 修改与手动精修；同步明确轻量 Skill ZIP 与 Studio 的独立分发边界
- 新增 generation bundle schema 与生成协议，固定 `Prompt -> Plan -> Workspace -> Command Batch -> Validation -> Render` 链路，并记录真实、推导和示例数据来源
- 新增便携 Skill 显式包清单、构建脚本和解包契约检查；正式包只携带必要规则、schema、模板和小型目录，排除 Studio 服务与重型运行时
- 新增 workspace-core、组件注册表和标准生成状态机，覆盖 v1→v2 迁移、命令批次原子提交、一次修复上限、隔离预览与 revision 提交
- 预览 Studio 增加自然语言首稿入口；支持销售、运营和项目类本地确定性首稿，取消恢复原草稿，接受后继续复用手动编辑、保存与导出
- 预览服务拆出可测试的 HTTP handler 和启停入口，生成接口按坏请求、契约错误、缺失资源和内部错误返回对应状态码
- 修复生成内容在视觉精修后被静态翻译覆盖、摘要卡保存后缺失布局引用以及已有首稿无法再次生成的问题
- standalone 导出增加浏览器注入 UI 清理；真实导出文件已验证不含设计器、AI composer、脚本、生成 API 或布局把手
- AI 首稿入口改为可折叠悬浮工作台，桌面固定左下、移动端使用底部面板，不再参与 Dashboard 正文排版；折叠状态保留待确认首稿
- 生成服务新增健康检查端点与可行动错误提示，避免旧服务把 API 路由当作静态文件后直接展示 `ENOENT`
- AI 工作台新增“对象 + 场景 + 指标 + 时间”需求结构提示和四类可编辑模板，单行输入升级为多行输入，模板回填不自动生成
- 生成页面的数据来源标记从标题上方徽标改为头部信息条，并去除分区标题中的重复“示例数据”
- 局部属性中的“跟随全局/跟随整组”选项增加当前解析值，并在上层设置变化时同步更新原生与自定义下拉显示
- 将 Dashboard“标准看板”固化为页面类型专属默认配置，并让预设初始化、恢复默认共同读取专属覆盖；避免同一 `fx-orange` 标识下的 Report“品牌报告”被 Dashboard 参数污染
- 颜色规范正式采用“色相固定、色阶动态”：BI 与语义基准色保持版本化固定，浅底、交互态、边框和图标容器使用版本化 OKLCH 同色相派生，并增加契约与验收检查
- 修复 Report 分组排序被 Dashboard 画布内联 `order` 覆盖的问题；Report 改为按 DOM 顺序渲染，整组拖动和上下移动重新生效，同时保留 Dashboard 独立画布顺序
- 移除 Report KPI 卡片对边框的高优先级清零规则；KPI 与普通卡片重新共用全局边框、圆角和阴影设置，并增加预览契约与验收项
- 修正布局控件命名：`cardGap` 显示为“卡片间距”，同时影响页面/卡片内边距的 `spacing` 显示为“内容密度”，不再误称组内/组间距

## 2026-08-06
- 新增 `docs/ROADMAP.md` 作为产品平台规划 SSOT，定义 AI Dashboard Studio 的 M0-M4 路线、核心对象、模块边界、暂缓范围和阶段验收门槛；产品、项目、治理入口和交接文档同步引用
- 固定分类色板由 6 色升级为更明亮的 8 色，并按连续色相环排序；图表、KPI、分组标题及 Skill 模板统一使用相邻色渐变和同一循环顺序
- 卡片标题图标全局设置拆分为横向“装饰样式 + 颜色”，下拉与当前值显示真实图标实例和色样；所有实际显示标题图标的非 KPI 卡可在局部复用 Phosphor 搜索并按卡片保存具体图标
- 修复卡片标题图标全局内联 token 覆盖颜色模式的问题；中性色、主题色、多色及两类渐变现在按实际 token 分别渲染
- 修复 Phosphor 卡片标题线型图标被当作手绘 SVG 二次描边的问题；`regular / fill` 均按官方填充路径渲染，中性色不再因极细轮廓而看似浅灰
- 恢复卡片标题装饰层，支持无、竖线、图标和序号；Dashboard 隐藏并禁止序号，Report 仅对当前可见卡片标题连续编号，选择图标时才展开样式与颜色
- KPI 卡片单色浅底参考 FX UI 种子色阶收敛为浅色 `4%`、深色 `10%` 的品牌弱染色；多色底独立使用 `6% / 12%` 分类色弱染色
- KPI 图标颜色增加“跟随卡片”默认模式，按默认/单色/多色卡片底分别解析为中性、主题和同卡分类色；显式颜色覆盖继续保留
- 局部设置将 KPI 整组样式合并进“当前分组”，移除重复的独立指标卡面板；分组标题图标仅在标题与图标装饰实际显示时提供
- KPI 整组与单卡图标样式改为横向“装饰样式 + 颜色”双下拉，并与普通卡片标题图标共用选项和预览组件；移除组合式样例卡的同步负担

- 新增轻量版本化色板 `assets/palette.v1.json`，集中维护固定分类色、语义色和中性色
- 新增按需读取的 `references/color-system.md`，Skill 主说明只保留颜色任务路由
- workspace theme 增加可选 `paletteVersion`，运行边界和架构文档同步色板职责
- 图表、KPI 与分组标题多色统一使用固定分类色；多色渐变使用当前色与下一色，隐藏项不占色位
- 契约检查新增色板结构、唯一性及 starter/探索预览同步校验
- 产品定义增加“生成端可重、交付端轻”和完整/通用 Agent/便携降级三种能力模式
- runtime、output、architecture 与 Skill 路由同步生成期资源、静态固化、交互例外和无资源降级规则
- 测试指南和测试用例增加完整资源、宿主增强与完全离线三种验收场景

## 2026-08-05

- 新增 Node Agent 预览服务和 npm 启动入口，提供本地静态预览及 Phosphor 图标搜索/解析 API
- 新增 Phosphor 依赖与中文图标别名数据；全量资源仅存在于 Agent 运行层
- 分组标题支持按分组搜索和替换官方图标，并保留语义自动匹配与单组恢复
- 成品导出继续移除设计器、搜索弹窗与全部脚本，只固化当前选中的内联 SVG
- 新增 Dashboard workspace v2 JSON Schema，作为 Skill、Studio 与导出器的跨 Agent 状态协议
- 新增 Skill/Studio 运行边界说明和协议确定性检查；纯 Skill 可独立降级运行，Studio 作为可选增强层
- Agent 侧新增 ECharts 6.1 SSR 图表服务，支持中文目录搜索及折线、面积、柱状、环形图的受控 SVG 渲染
- workspace schema 增加结构化图表资源定义；默认导出仍只固化 SVG，不携带图表库
- Dashboard 布局模型拆分为自由卡片与显式卡片组：KPI 默认成组，其他内容卡直接进入统一 12 列画布；Report 继续保持语义章节
- Dashboard 拖动改为画布级指针排序，自由卡片可跨原语义分组换位，KPI 组整体移动；拖动卡跟随指针，同 `span` 占位块按 12 列网格吸附，并持久化 `canvasOrder`
- Dashboard 组内卡片与整组编辑入口改为互斥显示：卡片悬停操作单卡，组左上边缘热区操作整组，整组选中时隐藏内部把手
- KPI 单卡拖动限定为本组内占位排序；指针移出组边界时显示禁止反馈，组外释放不创建画布落点且完整清理拖动状态

## 2026-08-04

- 视觉预设改为按页面类型展示：Dashboard 使用 `标准看板 / 企业分析 / 极简看板 / 运营深色`，Report 使用 `品牌报告 / 企业报告 / 简洁报告 / 诊断报告`
- 页面类型切换仅更新预设入口，不自动重置主题、字号、间距、布局和单卡覆盖
- Dashboard 隐藏分组标题时增加独立的悬停拖拽把手，使整组排序不再依赖标题工具条
- KPI 增加全局与单卡的上下/左右排列；修正“面型”为图标自身实心，不再用实色容器伪装面型
- 卡片阴影扩展为无/轻/中/重四档，并为浅色与深色模式提供独立 token
- 标题图标增加中性色/主题色独立配置，默认中性色，并支持单卡覆盖
- 设计模式为整组与单卡分别增加“拖动整组 / 拖动卡片”悬停提示，避免与宽度调整把手混淆
- 主题色改为原色优先，仅在文字或结构对比不足时保持色相并调整明度
- mock 报告增加“客户健康与风险”数据组，包含客户健康度明细和风险事项
- “拖动整组”增加整组边界高亮，操作期间暂时弱化单卡选中框
- 整组与单卡拖拽提示改为在当前卡片左上方紧凑并排，并保持各自高亮范围
- 卡片宽度编辑从单侧把手扩展为左右双把手，两侧共用宽度档位和保存逻辑
- 新增 `references/page-types.md`，将 Dashboard / Report 作为独立编排层
- Skill、输出规则和项目路由接入 `pageType`，并保持页面类型与视觉主题正交
- 预览工具增加 Dashboard / Report 对照控制，共用同一份数据、DOM 和视觉 token
- 增加页面类型路由及主题独立性测试用例
- 预览工具增加分组排序、同组卡片排序、卡片宽度和分组列数编辑
- 定义布局序列化属性和最终 HTML 移除编辑控件的交付边界
- 设计状态支持浏览器本地自动保存和刷新恢复
- 增加干净 HTML 导出，固化当前主题与布局并移除编辑器代码
- 增加可继续编辑的工程 HTML 导出，配置直接内嵌到文件；保存时优先使用系统“另存为”，并保留普通下载回退
- 预览工具增加独立卡片间距 token，提供 `4–40px` 的 4px 步进档位，默认 `12px`
- Dashboard 自动模式改为全宽内容区并隐藏可替代的分组标题；新增页面宽度、分组标题显隐和卡片标题字号配置
- starter 增加对应数据属性与 token，Dashboard/Report 继续共用同一 HTML 骨架
- Dashboard 自动头部改为透明紧凑样式并移除外层大圆角；新增页面底色、自定义底色和头部显隐配置
- 恢复 Report 的整页外壳、整体圆角、细边界和轻阴影；Dashboard 继续使用无外壳连续画布
- 头部对齐增加跟随页面类型的自动模式：Dashboard 默认居左、Report 默认居中
- 卡片布局编辑改为无浮动工具条交互：直接拖动卡片换位，悬停显示边缘尺寸把手并吸附到离散栅格档位
- 设计工具圆箭头由“恢复初始默认”改为“撤销上一次设置”，上一版主题、布局和 Logo 随本地状态跨刷新保留
- 增加独立的普通卡片标题图标配置，默认无图标，可选线型、浅色底和实色底，并与 KPI 图标解耦
- 设计工具改为黑白中性色右侧栏；宽屏为画布让位，普通与窄屏从右侧覆盖，不再使用底部抽屉
- starter 与输出规则增加页面底色元数据，以及同底色且无阴影/线框时的卡片边界兜底
- 预览侧栏压缩为单行标题，并按当前选择隐藏无关配置；分组标题改为总开关，Dashboard 默认关闭、Report 默认开启
- 预览侧栏将保存定义为浏览器本地配置保存：更改后按钮高亮并提示未保存，点击后才写入；下载按钮仅导出干净成品 HTML
- 配置恢复改为本地手动保存优先，旧工程 HTML 的内嵌配置仅作首次打开兜底，避免刷新覆盖用户刚保存的设置
- 手动保存同时将主题与布局写入当前 URL 的 `state` 查询参数，兼容内置浏览器刷新时重建标签并丢失页面存储上下文的情况；保存与下载使用图标按钮和悬浮提示
- 点击保存配置后实际重新加载带 `state` 的正式地址，不再只修改浏览器内存地址，确保后续刷新稳定恢复已保存快照
- 主题色升级为 seed + 语义派生 token：结构线、摘要、标题图标和图表随主题变化，并按深浅 surface 自动满足文字与结构对比度
- 报告外部画布、报告背景、卡片与 muted surface 增加主题同色相弱染色；Report 保留三层，Dashboard 合并为连续画布与卡片两层
- 增加图表配色配置：自动、主题单色、多色分类、按状态着色；修复单系列柱状图无意义的奇偶深浅交替
- 页面底色与自定义色合并为一个紧凑控件；新增无、点阵、细网格、横线四档页面纹理，并保持离线导出
- 大面积 surface 的主题染色进一步收敛为中性同色相弱染色
- 页面文字与卡片文字拆分为独立对比 token；自定义页面底色会自动重算头部和分组文字，普通文字至少满足 `4.5:1`
- 页面底色移除“与卡片同色”，避免默认弱边界下页面与卡片层级消失；旧配置自动回退为跟随主题
- 图表配色收敛为“单色 / 彩色”，改用独立固定通用色板；移除自动和按状态着色，旧配置自动迁移为单色
- 单色图表改为主题同色相的低饱和色，彩色改用 Tableau 风格低饱和分类色；卡片与 KPI 图标增加独立柔和色 token
- 图表配色进一步统一为主流 AntV/G2 色板：单色使用默认蓝，彩色使用默认六色，不再自行派生
- 图表配色增加双色模式，使用 AntV/G2 默认蓝与青绿，并限定用于两组数据或明确二分类
- 单色图表改为主题色相推演，双色改为主题色相加相邻色相推演；彩色继续使用 AntV/G2 六色
- 图表取色统一为固定六色色板：单色按主题色相取最近一色，双色取最近两色，不再推演新颜色
- 增加卡片选中与单卡视觉覆盖：图表可独立配色，KPI 可独立设置图标与中性/主题配色，普通卡可独立设置标题图标
- 视觉设置侧栏增加“全局 / 局部”顶部 Tab；选中卡片自动进入局部，未选中时显示空状态引导
- 局部标题图标配置改为按卡片内部标题的实际可见性显示；没有可用局部属性的卡片显示明确空状态

## 2026-07-25

- 为 `dashboard-html` 增加 `visualTheme`、`mode`、`headerStyle` 和 `sectionStyle` 的独立选择规则
- 新增 `references/themes.md`，定义内置视觉预设、标题层级和可选头部/分组标题样式
- 扩展 starter 的品牌、头部元信息、操作区、分组编号和标题 token 槽位
- 增加主题与头部样式的组合测试用例，并保持内容和布局原语不固定

## 2026-06-30

- 初始化 Git 仓库并发布到 GitHub
- 将示例 skill 收敛为 `dashboard-html`
- 建立 `dashboard-html` 的 `SKILL.md`、`references/`、`assets/templates/` 结构
- 调整 starter 模板为轻量、响应式、通用占位的 dashboard 骨架
- 补齐治理文档最小集合，消除主文档中的断链引用
- Provider 管理新增停用接口与开启前校验：关闭连接保留配置并回退本地演示；连接测试新增模型可用性检查、稳定错误码和前端诊断提示，模型不匹配时自动载入可选模型
- AI 设置改为个人作用域：本地免登录兼容旧连接，登录用户按自身 ID 隔离连接；项目中心不再加载组织信息，入口和说明改为“我的 AI 设置”
## 2026-08-13 - 柱图家族与唯一图表语义

- 图表目录新增 `grouped-bar`、`stacked-bar`、`percent-stacked-bar`、`histogram`，保留原有 `bar` 兼容语义。
- workspace、Studio、ECharts SSR、便携导出与 AI 中文路由统一使用稳定图表 ID。
- 新增图表语义和数据形状规范，单色多系列图使用同色深浅区分。
- 条图家族新增分组、堆叠、百分比堆叠、双向和排名语义，并增加甘特图；受控图表目录扩展至 15 种。
- 线图和饼图家族新增 `time-series`、`sector-pie`、`rose`，保留 `pie` 作为环图兼容 ID；受控图表目录扩展至 18 种。
## 2026-08-13 - Studio 资源中心 M1

- 新增独立 `/studio/resources` HTML 页面，从公开目录和图表渲染 API 动态展示全部受控图表。
- 视觉设置标题旁增加资源中心入口；新标签页打开以保留当前编辑状态。
- 新增资源中心架构规划，后续阶段覆盖应用到画布、组件、图标、规范和质量治理。
## 2026-08-18 画布生成模式

- 项目中心在 Generation Job 创建成功后自动关闭，不再遮挡首稿预览。
- 主画布新增生成浮条，支持停止、接受、放弃和失败后返回设置。
- 修复首稿摘要读取未定义图表名称映射导致的预览失败。
- Generation Job HTTP 测试显式注入确定性 Provider，不再受本机已保存远程模型配置影响。
- Generation Job 新增可恢复 SSE 事件流，前端移除 250ms 高频轮询；事件只包含受控阶段、序号、时间和安全错误码，终态再读取一次经校验的完整预览。
- OpenAI Responses 与 OpenAI-compatible Provider 改为流式读取，固定 45 秒超时拆为默认 120 秒首包、60 秒流空闲和 5 分钟最大任务时长；完整 JSON 校验前不写入 Workspace。真实复杂推理模型验收发现 60 秒首包不足，已按证据调整。
- 完整候选通过 Workspace 校验后在画布按分区渐进呈现，减少动态效果模式直接完整显示；原子 Workspace 不随动画拆分。
- Provider 首次候选在计划或 Bundle 结构校验失败时也可自动 repair 一次；Generation Job 对首次生成与 repair 施加共享的 5 分钟整体硬上限，并保留受控 HTTP 错误分类。
- 完整门禁通过：Generation eval 10/10、Node 189 passed / 6 PostgreSQL skips、Skill 包 31 文件且 SHA-256 可复现。
- 项目中心增加永久删除：管理员/所有者可在二次确认后删除项目及全部版本，服务端通过元数据版本校验避免误删并记录删除审计。
- 项目中心暂时隐藏“生成报告”操作入口，Report 副本 API 与底层导出能力保留，后续可重新启用。
- 卡片标题装饰新增“发光短标”，复用分组标题的主题色短标尺寸与柔光规则，并保持旧配置默认行为不变。
- KPI 卡片外观新增“独立卡片 / 整组一体”组织方式，可与白色、单色和多色底色自由组合；旧配置默认保持独立卡片。
- “整组一体” KPI 改为统一组底容器，内部卡片与组底四周使用等值内边距，卡片之间使用同等间距，取消紧贴的表格式分隔。
- “整组一体” KPI 强制显示整组标题；外层继承卡片圆角、阴影和边框，标题继承卡片标题字号、短标、发光短标、图标形态及配色。
- 整组 KPI 的四周内边距、标题到内容距离和内部卡间距统一跟随全局卡片间距，与同层卡片之间的留白保持一致。
- 将当前 Dashboard 视觉配置固化到“标准看板”专属预设：整组多色 KPI、彩色光感图标、卡片标题短标和标题右侧副标题；Report “品牌报告”不受影响。
- 修复 Dashboard 信息条“圆点 / 竖线”连接符不生效：仅隐藏示例数据来源的附加连接符，保留数据截止与创建人之间的可配置连接符。
- 项目中心暂时隐藏“全部项目 / 我可编辑”归属筛选，界面暂不暴露权限概念；底层访问控制保留。
