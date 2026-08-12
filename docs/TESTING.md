---
layer: knowledge
type: guide
last_verified: 2026-08-11
depends_on: [.agents/skills/dashboard-html/references/testing.md]
---

# 测试与验收

> 用途：说明这个仓库目前如何进行测试和验收。
> 什么时候更新：测试方式、验收标准、自动化覆盖情况变化时。
> 不要写什么：交接流水、产品介绍、无关实现细节。

## 自动检查

```bash
npm run check
npm run build:skill
npm run build:studio
npm run test:studio-build
npm run eval:generation
npm run test:browser
```

- `npm run check` 验证预览服务语法、workspace / generation 协议、固定色板、Skill 包清单和连续两次打包的逐字节可复现性。
- 同一命令要求预览 HTML 零内联脚本、独立解析 `studio/editor-runtime.js` 和 Studio 模块，并执行 workspace 迁移、字段与结构命令事务、精确数组反向命令、生成状态机、来源一致性、多领域口述首稿、Provider Gateway、Generation Job 租约/取消/恢复、页面级交互协议、跨组件数据联动，以及生成、局部精修、提交、撤销、历史查询和恢复 HTTP 接口测试。
- 浏览器生成流程还会通过可见自定义选择器手动切换图表类型，确认画布、手工 revision 和 standalone 中的受控 `props.chartType` 一致。
- 同一浏览器流程将当前 workspace 降为 v1，确认共享 core 恢复后得到 v2、默认 headerAlign 和 paletteVersion；随后提交非法快照，确认 bridge 抛出受控错误且当前画布标题不变。
- `npm run build:skill` 按显式清单生成 ZIP，解包后要求文件与清单完全一致，并在解包目录再次运行契约检查。
- `npm run test:studio-build` 连续构建两份 Studio Web，验证文件集合与逐文件摘要一致，并阻止 `.agents` 路径、服务端模块、内联脚本或服务端配置进入浏览器产物。
- `npm run build:studio` 的清单只允许 `index.html`、`studio/*` 浏览器模块和本地 portable core；部署验收还需验证 `/studio/*` fallback 与 `/api/*`、`/p/*`、`/embed/*` 排除规则。
- `npm run eval:generation` 运行 5 个多领域示例数据首稿、同一合成真实数据的 portable/non-portable 两个首稿和 1 个目标组件精修案例；真实数据案例额外验证 DataContext 字段、Semantic Model 聚合、binding、Query Snapshot 可见值、provenance 和 records 泄漏边界。单例至少 85、平均至少 90、通过率必须 100%，否则返回非零。默认确定性 provider 已加入 `npm run check`；完整 JSON 使用 `npm run eval:generation -- --json`。
- `eval:generation` 强制本地确定性 provider，避免 CI 宿主变量意外触发远程费用。真实模型发布候选需显式设置 `DASHBOARD_AI_PROVIDER=openai`、`DASHBOARD_AI_MODEL` 和 `OPENAI_API_KEY` 后运行 `npm run eval:generation:provider`；报告不包含 prompt、workspace、Provider 原文或密钥，也不会提交版本。
- Node HTTP 回归使用临时 Studio 构建启动正式静态模式：验证全部 `/studio/*` 无扩展名深链回退同一 HTML、模块保持 JavaScript MIME、缺失模块不回退 HTML、所有静态响应为 `no-cache`，且 `/api/*`、`/p/*`、`/embed/*` 仍由服务端权威路由处理。
- `npm run test:browser` 启动隔离的 8766 服务；启动前清理 `test-results` 下的 Project、Dataset、Publication 和 Job 测试仓库，使用固定 Playwright Chromium 验证 Studio 生成/接受/手工保存/精修/撤销/历史恢复/发布管理/版本导出及 standalone 筛选、Tab 和响应式。
- 浏览器回归同时从临时构建的独立 Studio `/studio/projects` 验证 token 登录、AI 首稿和组织治理视图，在 `/studio/projects/:projectId` 验证项目深链恢复，并从 `/studio/publications/:publicationId` 恢复所属项目和目标发布后继续 artifact/render/revoke 流程；旧预览文件名只保留兼容测试。
- 版本导出浏览器流程会显式关闭 `showSaveFilePicker`，验证标准下载降级路径真实产生 HTML 文件、文件名包含“版本成品”，且内容不含 Export Center、AI Composer 或设计器代码。
- 构建结果只是发布候选，不会自动发布或创建版本标签。
- GitHub Actions 在 push 和 pull request 上依次执行依赖安装、Chromium 安装、合同检查、Skill 打包和浏览器回归；失败时上传 trace/report。

## 人工验收

- 重点验证 `dashboard-html` Skill 的实际输出是否符合模板和规则。
- 逐项执行 `.agents/skills/dashboard-html/references/testing.md` 的页面、响应式和资源降级检查。

## 主要参考

- `.agents/skills/dashboard-html/references/testing.md`
- `.agents/skills/dashboard-html/references/test-cases.md`
- `.agents/skills/dashboard-html/references/test-log-template.md`

## 当前验收重点

- 是否输出完整 standalone HTML
- 是否保留轻量卡片式 dashboard 骨架
- 是否兼顾桌面端、平板和手机端
- 是否避免把内容类型写死
- 是否先形成可追踪的 Plan、Workspace、Command Batch，再确定性渲染
- 生成候选是否处于隔离预览；取消是否恢复原 workspace；接受后是否生成 revision 并继续支持手动编辑
- 长时间生成是否通过持久化 Job 轮询；刷新后是否恢复同一任务；停止生成是否中止 Provider 并阻止在途成功响应覆盖画布
- 组件级 AI 修改是否只产生目标字段命令；差异是否准确显示修改前后值；撤销是否在后续手动漂移时拒绝覆盖
- 复制、新增、删除、调宽和排序是否以 command batch 原子同步 workspace 与真实画布；取消、撤销、刷新及历史恢复后是否仍一致
- 指定 revision 恢复是否追加新 revision 并保留完整历史；当前 workspace 有手动漂移时是否拒绝覆盖
- Dashboard 隐藏分组标题时，示例数据标记是否仍在头部可见
- 便携 ZIP 是否不含 Studio 服务、测试 fixture、`node_modules` 或完整图标/图表运行时
- `filter-bar / view-tabs` 是否只按明确意图生成、引用存在的目标，并在保存和 standalone 导出后保持可用
- 自定义视觉预设是否通过统一预设栏末尾的 `+` 创建、在细分隔线后以直选 Tab 展示，并在悬停、聚焦或选中时提供不改变 Tab 宽度的管理入口和“已修改”反馈
- 图表卡片是否只使用折线、面积、柱状、条形、环形五类受控类型，并能经显式提示词、语义推断和局部设置稳定切换
- OIDC 邀请是否只接受受限时、单次 secret 启动的已验证目标身份；secret 不进入组织公开响应、持久化、审计或浏览器 session，错误 subject 不得绑定 identity 或创建成员
- ECharts 服务不可用时是否显示同数据的便携 SVG，而不是空图、错误文本或失效筛选
- 默认确定性与远程 provider 是否走同一 bundle 校验；远程 request、单次修复、限流、超时和未配置错误是否不泄漏密钥或改变当前 workspace
- CSV/JSON/Excel 导入是否正确处理引号、逗号、空值、工作表、重复表头与类型；超限、损坏工作簿和非法记录是否在持久化前拒绝
- 上传数据是否只以服务端身份进入生成请求；只有显式便携数据才进入 workspace、revision 和 standalone
- 字段类型修正是否从 rawRecords 重算并保留前导零；语义更新是否拒绝 stale 写入
- 用户确认的维度、指标、聚合、格式和时间粒度是否实际改变生成 binding 与成品，而不是只更新表单

## M1 浏览器回归记录

2026-08-07 已在本地预览服务完成：

- 口述销售需求生成 `preview-ready` 首稿，并显示“示例数据”
- 接受首稿后创建 revision，切换语言和修改圆角不会覆盖生成标题
- 保存配置后刷新可恢复生成文档、示例数据标记、语言和圆角
- 已有首稿上可再次生成 Report；取消后恢复原标题、布局和视觉配置
- 系统保存器真实导出的 HTML 含生成标题与示例数据标记，不含 AI composer、设计器、脚本、生成 API 和布局把手
- AI 工作台默认折叠且不改变画布位置；展开、折叠、重新展开后待确认首稿和状态保持不变
- 390px 移动视口下工作台显示为视觉设置之上的底部面板；折叠后不保留不可见键盘焦点
- 生成服务停止时显示可行动提示，恢复服务并重新展开后健康检查自动恢复正常状态
- 四类需求模板点击后只回填多行输入，不自动生成；修改模板并使用中文引号指定标题后可生成纯净标题
- 普通卡“跟随全局”和 KPI 单卡“跟随整组”均在触发器与菜单中显示上层当前值；修改全局设置后括号内容实时更新

## 交互组件浏览器回归记录

2026-08-08 已在本地预览服务完成：

- “按年份和区域筛选，并切换概览和明细视图”生成 2 个原生筛选器和 2 个 Tab；无交互意图的提示词不生成控件
- 桌面端控件继承当前 surface、边框、圆角、阴影、文字和主题强调色；切到明细后只显示目标 Section
- 筛选变化触发 `dashboard:filters-change` 并将 workspace 标记为待保存；页面无运行错误
- 移动视口下筛选器纵向铺满、Tab 等分，不产生控件自身横向溢出
- 区域从全部切到华东后，机会金额由 `3,750 万` 变为 `1,110 万`、趋势柱由 6 个变为 2 个、健康表由 8 行变为 4 行，排行同步重算
- 系统保存器生成的真实成品约 110 KB，仅含 1 段可编译运行脚本；设计器和 AI 工作台已移除，内嵌数据集、筛选重算和 Tab 代码完整存在
- 自定义预设已实测完成创建、自动选中、修改检测、更新、重命名和确认删除；内置与自定义项共用一条预设栏，390px 窄屏下选项可横向滚动且 `+` 固定可见，无页面横向溢出

## 图表类型浏览器回归记录

2026-08-09 已在本地预览服务完成：

- 局部设置可将图表切换为面积图；明确要求“渠道占比环形图”的首稿生成环形图，评审元数据同步显示类型并自动采用分类色
- 区域筛选会重算并改变实际 SVG 几何；接受首稿、手动改型、保存和刷新后仍恢复同一 `chartType`
- 深色模式下图表轴线、标签和图形可见，无运行错误；390px 视口下折线标签可读，环形图使用底部紧凑图例且不溢出
- 停止图表服务后触发筛选，页面使用本地响应式 SVG 降级且无运行错误
- `npm run check` 共 24 项测试通过，覆盖四类语义路由、非法类型、筛选联动和 HTTP 图表渲染

## M2 精修、结构与历史浏览器回归记录

2026-08-10 已在本地预览服务完成：

- 选中“来源表现构成”后，AI 工作台自动切换为组件作用域的“AI 修改卡片”，并显示当前目标
- 输入“改成面积图，卡片标题改为‘渠道机会趋势’，副标题改为‘近 6 周变化’”后只出现 3 个字段差异，原 workspace 在确认前保持不变
- 隔离预览只更新目标卡片，图表切为面积图，局部视觉设置同步读取候选 workspace
- 接受后创建带父 revision、正向命令和反向命令的 revision；一键撤销恢复原环形图、标题与副标题
- 取消候选恢复原卡片；后续手动修改会隐藏 Studio 撤销入口，服务端同时以 `drift` 错误拒绝覆盖
- 390px 视口下 AI 修改面板完整可操作，Dashboard 在底部面板后保持可见，视觉设置抽屉不与其重叠
- 复制卡片会在真实画布创建独立 ID 节点并重新绑定选择、拖动和左右调宽；接受、保存刷新、撤销后结构与 workspace 一致
- 删除、半宽和前后移动均在隔离预览中改变真实画布，取消恢复原结构；删除取消后仍保持目标卡片选中
- 版本历史面板可恢复指定 revision，恢复动作追加新 revision 并自动持久化；手动漂移时服务端和 UI 均拒绝覆盖
- 历史中任一非当前 revision 可与当前版本只读比较，面板显示受限的字段差异；比较后继续恢复同一版本与撤销均正常，不创建 revision 或改动画布
- 双页面项目回归中，一页先保存手工 revision，另一页以旧 revision 保存必须得到 `409` 提示并保留脏状态；用户确认“重新加载”后才恢复服务器最新 workspace，旧页面不可能静默覆盖
- Workspace Session 单测覆盖 localStorage 正常/坏 JSON、URL state 与旧 hash config、写回时移除 logo、配额失败、旧历史清理和工程内嵌状态
- 当前完整自动基线：Generation eval `8/8`、平均 `100`、修复 `0`；Node `141 passed / 6 PostgreSQL environment skip`、Playwright `15/15`、Skill 29 文件且可复现；Skill SHA-256 为 `8e39d228e9f3863c5da12a75286c27603817e01ba6dff520b4303c55408bb3a9`。
- Generation Job 定向回归覆盖公开摘要不返回 input、同组织发起人/管理员授权、双 worker 只调用一次 Provider、运行中取消 fencing、HTTP 创建/轮询、浏览器迟到结果拒绝和刷新后任务恢复。
- 浏览器导出回归证明：AI 首稿接受后产生未保存手动修改时，点击导出先追加新的 `revision-user-*`，再下载该不可变版本；产物不含 Studio 模块或 DOM fallback 标识。
- renderer parity 合同逐项验证同一 revision 的 section、component、顺序、跨度、页面类型、明暗主题和数据来源标记在 standalone 中无遗漏或重复；筛选、Tab 和响应式继续由 Chromium artifact 回归证明。
- Anchor 回归覆盖 HTTPS-only 最小 payload、bearer secret 不进入 payload、失败分类后保留稳定 anchor 重试和 receipt 最小持久化；配置 `DASHBOARD_TEST_POSTGRES_URL` 后，PostgreSQL conformance 额外验证 chain commit 同事务创建 anchor、跨连接池投递和 current status。
- OIDC Node 回归覆盖不可变外部身份映射、单次 PKCE 事务、RS256 JWK 验签、授权码 exchange、HttpOnly callback session 与 metadata/secret 分离；PostgreSQL conformance 在配置 `DASHBOARD_TEST_POSTGRES_URL` 后额外覆盖跨实例 identity 绑定、冲突改绑拒绝和解绑可见性。当前本地未提供该环境变量，因此 6 项 PostgreSQL 集成测试显式 skip
- Storage Runtime 回归覆盖端口缺失 fail-fast、file provider 的 local-only 能力、仓储探针失败 `503`、错误信息最小披露、伪造 production-ready 能力拒绝，以及 token 模式下匿名 HTTP readiness
- Audit outbox 回归覆盖同文件提交、内部状态隔离、非法事件文件名、客户端伪造 outbox 清理、投递失败恢复、append/ack 崩溃窗口幂等重放，以及 Audit 离线期间 Project API 成功后补投
- PostgreSQL conformance 使用真实 PostgreSQL 17 覆盖七仓端口、双连接池共享可见、Project advisory/row lock 条件写、事务 outbox、稳定事件 ID 幂等、冲突语义和 adapter restart 持久性；CI 通过 `postgres:17-alpine` service 注入 `DASHBOARD_TEST_POSTGRES_URL`
- PostgreSQL provider 下完整 Playwright `10/10`；回归包含 JSONB 键重排后 undo/restore 仍按结构语义判等，不误报手工漂移。无 `DASHBOARD_TEST_POSTGRES_URL` 的普通本地 `npm run check` 明确跳过六项 PostgreSQL 集成测试
- Session 回归覆盖内存隔离与过期、repository 契约、原始 Cookie 不落库、身份动态解析、readiness 错误最小化，以及两个独立 PostgreSQL HTTP 实例之间登录可见、注销立即失效
- Refresh lease 回归覆盖双 worker 抢占、过期租约接管、stale worker fencing、单 Dataset 活跃 Job 唯一性、双 scheduler 单次触发，以及“Job 已创建但 Schedule 未确认”后的确定性 Job 重放
- Generation Job PostgreSQL conformance 覆盖两个独立 worker 竞争时 Provider 仅调用一次、过期 running lease 恢复、跨实例取消后迟到结果不覆盖 canceled、另一实例可读取组织聚合指标，以及持久化 payload 不含 DataContext、records 或连接凭证
- Generation metrics 回归覆盖组织管理员授权、跨组织排除、旧任务耗时推导、成功/失败/修复率、平均/p50/p95、失败码聚合、30 天窗口拒绝和 HTTP 响应不含 prompt/workspace/actorId/Job ID
- Generation feedback 回归覆盖仅发起人可提交、accepted 关联安全 revision、dismissed 受控原因码、相同重试幂等、冲突反馈拒绝、非法自由原因拒绝，以及 HTTP 接受反馈进入候选可用率聚合
- Playwright token/组织流程在真实接受首稿并回写反馈后验证管理员组织设置显示 `100%` 成功率、`100%` 候选可用率、1 次请求与 1 次评审、失败摘要、390px 指标区无横向溢出；切换 viewer 后入口隐藏且直接请求 metrics API 返回 `403`。standalone 继续不含组织治理 DOM
- Studio deployment conformance 以独立 HTTP 代理改写后端 Host，验证 `/studio/*` fallback、token 登录、Secure Cookie、公网 Origin 写入、错误 Origin 拒绝，以及 OIDC redirect URI 与显式公网来源不一致时启动失败；不把该自动测试宣称为真实 TLS ingress 或 IdP 联调
- Audit Sink 回归覆盖 canonical hash、前序链、HMAC seal、跨连接池并发 append、append-only update/delete 拒绝、高权限篡改后的验证失败、file 模式 `501` 与 PostgreSQL 受权验证 API
- Shared Query Cache 回归覆盖 PostgreSQL 跨连接池 miss/hit、数据库 TTL 过期、按 Dataset 清理、结果不含 connector/records，以及 file/managed readiness 能力差异
- Organization 回归覆盖按受控身份目录引导、组织管理员边界、至少一名活跃管理员、成员暂停的即时拒绝、乐观并发，以及 token HTTP 会话在成员暂停后失效
- Playwright token 身份回归覆盖组织管理员从项目中心打开组织设置，viewer 不显示入口；standalone 导出不包含组织管理对话框
- Layout Controller 单测覆盖 summary/section span 回退；浏览器拖拽验收必须在换位后保存并刷新，确认 `canvasOrder` 由 applyConfig 恢复
- 布局规则单测覆盖跨度中点、5px 阈值、四向落点和 15% 防抖区；浏览器使用真实 mouse 路径验证跨行换位、落点高亮、占位清理和 dirty 状态
- Workspace State Core 单测覆盖快照深克隆、v1 迁移、非法状态无部分结果和恢复切片隔离；浏览器恢复链与非法 URL 状态共同证明应用原子性
- Chart Adapter 单测覆盖序列归一化、五类 ARIA、有效/非法服务响应；真实页面验收检查非空 SVG 尺寸、绘图节点、busy 清除与 runtime error
- 控件 Renderer 单测覆盖 falsey 筛选值和活动/默认/首项 Tab 回退；真实页面验收需切换筛选并确认 KPI 联动与 `runtimeError` 为空
- Renderer 模块化验收要求 Editor Runtime 不保留旧 document 投影助手；Playwright 首稿、真实数据和版本恢复链验证标题、KPI、列表、表格及来源投影，页面 `runtimeError` 必须为空
- 390px 下 8 张标准卡片保持无横向溢出、无重叠和无离屏节点
- `npm run check` 共 40 项测试通过，覆盖组件作用域、窄命令、精确数组反向命令、结构操作、Provider Gateway、重生成状态清理、持久化 Project Store、乐观并发、确定性 revision 导出、字段/结构差异、提交、漂移保护、历史恢复和真实 HTTP 生命周期

## Provider Gateway 自动回归记录

2026-08-10 已完成：

- 2026-08-11 新增 file-storage OIDC 邀请回归：组织管理员创建已知 issuer/subject 的限时邀请后，只有匹配的已验证 callback 才会绑定 immutable identity、激活动态成员并创建 HttpOnly session；错误 subject 不绑定也不创建成员。原始 acceptance secret 仅出现在创建响应，仓储与公开 invitation 摘要均不保存它。HTTP 流程覆盖 `POST /api/organizations/current/invitations`、匿名 `invitation-start` 与 callback；PostgreSQL invitation conformance 仍需要 `DASHBOARD_TEST_POSTGRES_URL`。

- 默认确定性 provider 经 Gateway 仍生成相同的隔离首稿；无数据 request 在平台层建立显式 sample identity
- 假 OpenAI Responses 上游验证 schema-guided 请求、显式模型、`store: false`、request 防篡改和自包含 workspace schema
- 首次非法候选进入一次 repair 后成功；限流映射 429，上游 5xx 映射 502，真实 Abort 映射 504，缺 key/model 映射 503
- health 只返回 provider 身份、模式、配置状态和显式模型，不返回 key；run、input context 和错误对象同样不含 key
- 当前未提供有效服务端 API key，因此真实 OpenAI 网络调用、模型质量、延迟和成本尚未验收
- 提供 `npm run smoke:provider` 作为部署环境的显式真实 Provider 验收：首稿和局部精修必须均为 `preview-ready`，结果只输出 provider、模型、耗时、受控摘要和上游 input/output/total token 计数；不计算价格、不输出 prompt、workspace 或凭证。该命令不属于默认离线 CI，也不提交 revision
- 提供 `npm run smoke:postgres-connector` 作为部署环境的显式真实连接器验收：只对一个受控 PostgreSQL 引用执行创建与刷新，输出行/列/语义计数和状态，不保存 Dataset/Project，也不输出 SQL、连接串或 records；未配置或多引用未选择时失败关闭，不属于默认离线 CI

## Revision 导出浏览器回归记录

2026-08-10 已完成：

- 同一 revision 重复导出 HTML 与 SHA-256 完全一致；不同 revision 的 SHA-256 不同，标题中的 HTML 注入被转义
- 服务端导出响应包含 Project、revision 和 SHA-256 ETag，产物不含 Studio、Provider、生成 API 或 Node 依赖
- 区域从全部切到华东后，机会金额由 `3,750 万` 变为 `1,110 万`，图表、表格和排行同步更新
- Tab 切换后隐藏 2 个非目标分区；桌面与 390px 视口横向溢出均为 0，主画布非空且无控制台错误
- 上述产物流程与 Studio 自然语言首稿接受、手工 revision、局部精修、撤销、历史恢复和版本导出已固化为 3 条 Playwright 测试，并使用独立端口和临时仓库避免污染用户项目

## M3 数据导入回归记录

2026-08-10 已完成：

- CSV 引号内逗号、数字千分位、空值、中文表头与 JSON 对象数组均经可靠 parser 和画像器处理；非法 JSON 行与超过 2 MB 输入被拒绝
- Studio 上传 3 行 4 列 CSV 后显示行列和质量状态；显式选择便携后生成首稿，首个 KPI 真实聚合为 `4,500`
- Studio 上传多工作表 Excel 后自动选择首个含数据工作表，展示工作表选择器、行列画像和字段配置入口；切换工作表重新生成独立 Dataset 画像
- Semantic Query 拒绝物理字段名和未知语义 ID，验证总计、分组、筛选、结果上限、Dataset 指纹与语义版本；非便携首稿只固化聚合显示值，不写入 records 或 binding
- Publication 创建固定 revision、数据指纹和查询快照；元数据响应不含 HTML，artifact SHA/ETag 一致，重复 ID 返回 `409` 且不会覆盖旧发布
- 配置组织审批时，editor 创建的 unlisted Publication 为 `pending`，正确 token 的 share/embed 在批准前仍为 `404`；仅同组织管理员可批准，批准后原链接生效，审批人/请求人 ID 不进入公开摘要
- Publication 的创建、提交审批、批准和撤回会生成最小 project audit event；审计仓储故障时 Publication 仍写入并保留内部 outbox，恢复后从审计读取路径重投，audit API 不返回 token、URL 或内部 outbox
- Playwright 以真实 Studio token 会话覆盖审批交互：editor 提交 unlisted 发布后仅看到“待审批”且原链接为 404；切换为同组织管理员后显示“批准发布”，批准完成后同一链接返回 200
- 同一审批流程还验证项目记录把 `publication.submitted / publication.approved` 显示为“提交发布审批 / 批准发布”，管理员无需理解内部审计 action 才能复核治理决策
- 相同 Semantic Query 二次请求命中缓存；TTL 到期、Dataset 指纹变化或语义版本变化必须 miss。成功刷新返回最新聚合，失败刷新保留上一版 records/fingerprint 并可再次上传重试
- Publication 详情在 Dataset 成功刷新后显示 `stale`，数据源不存在时显示 `missing`，便携内嵌数据标记为 `embedded`
- Studio 发布管理已验证发布当前 revision、选择 unlisted、下载 artifact、确认撤回和撤回后返回 `410`；重新运行测试不会继承上一轮 Publication
- unlisted 共享已验证缺令牌/错令牌返回 `404`、正确令牌返回内联 standalone、摘要不泄漏哈希、访问日志不保存令牌；Studio 显示一次性链接并汇总访问次数
- 发布 HTTP 回归验证授权后的 share/embed 在固定窗口内限流：超限返回 `429` 和 `Retry-After`，同一窗口只追加一条不含来源信息的 `rate_limited` 拒绝记录
- embed 已验证继承 unlisted 令牌和撤回状态并返回 frame-ancestors header；真实 Chromium 回归验证 800px PNG 像素尺寸、PNG 签名、Dashboard PDF 文件头与长页高度，以及 revision exporter 生成的 Report artifact 自动切换 A4 print media、页码 footer 和防跨页规则；HTTP render 只消费固定 Publication artifact

## M4 身份回归记录

2026-08-10 已完成：

- Organization HTTP 回归验证组织管理员可读取、更新组织和成员；非管理员读取组织审计返回 `403`，组织变更会进入 organization scope 记录，暂停成员后既有会话立即失效
- Project Center 浏览器回归验证新建 AI 项目不会落库空 Project：先接受现有项目、确认切换后桥接返回 null Project，第二次接受候选后才获得不同 ID 的单 revision Project
- AI Composer 浏览器回归验证图表局部修改模板由 `/api/charts/catalog` 返回的受控目录生成；目录路径与首稿、精修、撤销和历史恢复共用同一条版本事务链
- token 模式未登录管理 API 返回 401，错误 token 不进入响应；登录 Cookie 包含 HttpOnly 与 SameSite=Strict，HTTPS 配置增加 Secure
- viewer 可读取 Project，但写入返回 403；editor 缺失或伪造 Origin 的非 GET 请求返回 403，同源写入成功
- 退出清除服务端会话和 Cookie，旧 Cookie 再访问返回 401
- 真实浏览器验证登录门禁、错误令牌、viewer 只读、固定退出入口、editor 登录和 Cookie 会话；默认 disabled 模式既有 8 条流程继续兼容
- REST Connector 验证精确主机白名单、HTTPS、敏感查询参数、服务端凭证引用、禁止重定向、JSON recordsPath、2 MB 上限和凭证不落盘；未配置连接器返回 `503`
- Refresh Job 验证指数退避、最大尝试、同 Dataset 活跃任务冲突、重启恢复、成功/失败终态和 `/api/jobs` 可观察性；Studio 连接 API 后通过 job 刷新并读取最新 Dataset
- Refresh Job 取消验证 queued 定时器被移除、running 迟到结果不写入 Dataset；Schedule 验证固定间隔、触发 Job、禁用、持久化 API 和 Studio 频率/任务管理
- 趋势图使用导入月份，表格显示全部四列记录；revision standalone 内含授权副本，不含 Studio 数据仓库或上传交互
- Node 回归 `57/57` 通过；浏览器回归 `7/7` 通过
- 编码 `001` 已验证可从误推断数字无损恢复为文本；语义模型版本递增，过期 schema 更新返回 `409`
- 浏览器字段配置将收入设为 `max + 人民币`、转化率设为 `average + 百分比`，生成 KPI 分别显示 `¥1,800` 和 `35%`

## M3 阶段门槛审计

2026-08-10 按 `docs/ROADMAP.md` 的 M3 范围完成审计，结果：通过。

| 要求 | 直接证据 | 结果 |
|------|----------|------|
| CSV、Excel、JSON、受控 REST | parser、XLSX fixture、REST 白名单/credentialRef HTTP 合同与 Studio 浏览器流程 | 通过 |
| 字段识别、类型修正、质量与预览 | rawRecords 无损重算、Semantic Model PATCH、质量画像和字段配置浏览器流程 | 通过 |
| 指标、维度、聚合、格式、时间口径 | Semantic Model 版本、sum/average/min/max/count、格式和 timeGrain 回归 | 通过 |
| 受控查询、缓存、刷新、失败重试 | Semantic Query ID 白名单、TTL/LRU、last-known-good、Job 退避/恢复/取消和固定间隔 Schedule | 通过 |
| 草稿与发布版本分离 | Project revision、Publication 不可变对象、重复 ID 409、重新发布新对象 | 通过 |
| URL、访问、嵌入、HTML、图片、PDF | private/unlisted/public、哈希令牌、撤回 410、embed、artifact、Dashboard 长页 PDF、Report A4 分页 PDF、真实 Chromium PNG/PDF | 通过 |
| 刷新不改变组件身份和手工布局 | 提交 data-bound Project 后刷新 Dataset，再读取 Project；revision 数、currentRevisionId、组件 ID、document、layout 深比较不变 | 通过 |
| 发布固定不可变 revision | 同 revision HTML/SHA 稳定，Publication 保存 revisionId/artifact SHA，Dataset 刷新只改变 freshness | 通过 |
| 凭证不进入浏览器、workspace、成品或模型上下文 | 浏览器仅提交 credentialRef；服务端认证头测试；Dataset/context/run/workspace/artifact 泄漏断言 | 通过 |

边界不计为 M3 失败：真实远程模型质量需要有效 API key；组织身份、RBAC、数据库连接器、分布式队列和分页报告属于 M4 或后续专项。
