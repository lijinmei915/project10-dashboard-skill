<!-- 以下为「智能填写」自动检测的项目快照，可以参考填写下方内容。删掉此整块也无影响。 -->

> **接手时间**：2026-06-30
> **项目根目录**：项目10-dashboard skill
> **当前状态**：M1/M2/M3 阶段门槛已通过；组织控制面、OIDC 邀请接受、组织审计、数据连接、刷新、发布与多格式交付均有自动证据。
> **下一步**：SCIM 已按产品决策暂缓；在真实 TLS ingress/静态托管和 IdP 环境验证已自动固化的公网 Origin、Cookie、OIDC callback 与缓存合同，并用最小只读账号执行真实 PostgreSQL connector smoke。
> **风险**：OIDC 邀请当前仅验证 file-storage 流程；identity 与 organization 是独立持久化边界，失败时授权 fail-closed 但不是跨仓库原子提交。远程适配器尚未用有效 API key 做真实联网验收；PostgreSQL connector 只有注入式回归，尚未连接部署数据库。

---
layer: knowledge
type: status
last_verified: 2026-08-11
depends_on: [PROJECT.md]
---

# 当前交接

> 用途：回答“上一轮做了什么、现在能不能继续、风险是什么、下一步具体干什么”。
> 什么时候更新：完成一次连续任务后，或风险、阻塞、下一步发生变化时。
> 不要写什么：长期路线图、完整历史、产品介绍、已经稳定的架构决策全文。

## 当前状态

- HTML 导入现支持表格与通用页面自动分流：表格进入结构化 Dataset，报告/Dashboard 提取标题、分区、正文和列表，并在生成时统一按当前 Workspace、主题和组件规范重建。通用 HTML 可不填写提示词直接生成；原脚本与样式不会执行或进入成品。
- Dashboard 独立 Provider 已完成第三阶段：组织管理员可新增、编辑、删除、切换、发现模型和测试连接；组织级档案与凭证分仓持久化，Generation Job 按 organizationId 解析 Provider，最后一个档案删除后回退本地演示。OmniDesk 仅作公开格式迁移兼容。19 项 Provider 定向测试、完整 177 项 Node 基线和 Playwright 18/18 通过。当前 file 凭证仓储仅适合单实例；下一阶段是共享 Profile Repository、Secret Manager/KMS 端口、密钥轮换和治理审计。
- 已完成可选组织级 Publication 审批：环境变量指定的组织创建 `pending` 发布，外部 share/embed 在批准前隐藏为 404；组织管理员批准后原链接生效。定向 Node 回归覆盖策略解析、状态转换、跨组织拒绝和 token 外链边界
- Publication 的创建、提交审批、批准和撤回现通过对象内 audit outbox 投递最小项目审计事件。审计故障不回滚业务，恢复后可从审计读取路径完成重投；file/PostgreSQL 适配器均隐藏内部 outbox，事件不含 token、URL、HTML 或 records
- 配置外部 audit anchor 时，Publication audit outbox 的每次成功投递会同步请求异步链头刷新，锚定失败保持不回滚业务或内部 audit；定向 Node 回归覆盖该链路
- Playwright 已补 Publication 审批真实 UI 证据：editor 提交 pending 后不显示批准按钮且 link 404；同组织管理员批准后 UI 和同一 link 同步变为已发布/200
- 项目记录现将发布相关审计事件显示为“发布版本 / 提交发布审批 / 批准发布 / 撤回发布”；审批 Playwright 从编辑者提交、管理员批准一直验证到可读的项目记录
- 当前做到：`M0-M3 阶段门槛已通过；自然语言生成、精修版本、真实数据、刷新调度、发布访问和多格式交付形成闭环。`
- 当前阻塞：`无硬阻塞；真实联网 smoke test 需要部署环境显式提供模型与 API key，其他平台工作可继续。`
- 组件能力已收口到统一目录入口：`/api/components/catalog` 返回 6 类内容组件、2 类页面控件和 5 类图表，AI Composer 与 Provider 共用该来源；契约门禁同步核对 Registry、Schema 和 Workspace Runtime，六类组件均有确定性导出证据，`text` 已补 Studio 显式渲染。便携 Skill 仍保持 29 文件。
- AI 浮层可从能力目录选择“要求首稿包含”的组件并写入提示词；`text` 现可由口径说明、备注或文本组件意图生成，并贯通 Section、布局、provenance、版本和导出。
- Workspace 结构协调层现已支持完整 Section 生命周期：动态创建、排序、标题/副标题更新、布局工具绑定和删除，再同步分区内卡片；浏览器回归证明新增“附录”分区进入画布与 revision 导出，恢复原 Workspace 后整区消失。
- AI Composer 现支持 Section 与 Component 双作用域：选中分区后可改标题/副标题、前移/后移、新增说明分区或删除分区；候选继续走字段级 Command Batch、隔离预览、revision 和整批撤销。删除会同步清理控件、交互、视觉和资源引用，最后一个分区受保护。
- Dataset 已建立组织硬边界和可选行级策略：服务端固化组织/owner，所有数据 API、刷新任务与 Generation Job 解析先校验组织；`DASHBOARD_DATA_POLICIES_JSON` 可按 actor/角色注入受控语义维度过滤。预览、查询、模型上下文、portable 副本和策略隔离缓存使用同一授权数据视图，跨组织访问与 ID 覆盖失败关闭。
- PostgreSQL Connector 已补齐：部署方在 `DASHBOARD_POSTGRES_CONNECTORS_JSON` 预注册连接引用、对应连接串环境变量和单条只读查询，Studio 仅可选择引用；结果复用 Dataset、行级策略、语义模型、查询缓存、生成、立即刷新、后台任务和固定间隔计划。SQL 与连接串不会落入浏览器、Workspace、Revision 或成品。
- PostgreSQL Connector 现有独立部署 smoke：`npm run smoke:postgres-connector` 只对一个显式受控引用执行临时创建与刷新，并输出行/列/语义计数和状态。未配置、连接串缺失或多引用未选择时失败关闭；本机未注入 connector，实际 smoke 因此按预期未运行成功。
- Report Publication 的 PDF 已补齐分页交付：渲染器只从不可变 artifact 的 `data-page-type="report"` 识别 Report，自动使用 A4 print media、标题页眉、页码 footer、固定边距和 Section/Card 防跨页规则；Dashboard PDF 保持既有宽度对应的长页输出。真实 revision exporter -> Chromium Report PDF 回归已通过。
- 是否可继续：`可继续`

## 本次已完成

- 当前 Dashboard 视觉配置已固化为“标准看板”预设，并同步到 Studio、standalone starter、Skill 规范和设计资源目录。浏览器实际恢复预设后确认 `#ff8000 / 14px 正文 / 10px 圆角 / 16px 卡片标题 / 多色图表 / 12px 间距 / 标准密度`，当前项目已保存为版本 `revision-user-1787225111993`。

- 资源中心 M2 已接入：Studio 选中 Workspace 图表卡片后，视觉设置旁入口携带临时目标上下文；资源页可发送受控图表应用意图，Studio 只接受会话一致、目标仍被选中且图表 ID 受控的操作。普通访问继续只读。
- 资源中心 M3 第一部分已完成：组件 Tab 直接展示 `/api/components/catalog` 的 6 类组件与 2 类页面控件；图标 Tab 直接使用 Phosphor 搜索与资源端点，支持四种粗细并可应用到当前卡片标题。桌面实测 8 个组件、48 个图标、搜索与卡片应用通过；本轮浏览器 viewport override 未作用于现有标签，M3 移动端仍需新标签补充真实证据。分组图标协议已实现，但当前 Dashboard 预设隐藏分组标题，需在可见分组标题预设中补 UI 验收。
- M4 已建立共享设计规范目录：`data/design-standards.json` 以现有 themes、color-system、palette 为来源，服务端通过 `/api/design/standards` 暴露，资源中心规范 Tab 可视化颜色、字号、间距、形状和可访问性门槛。合同检查固定版本、来源和五类结构。
- M5 已增加可见能力状态与自动门禁：浏览器实测图表 18、组件 v1/8 类、Phosphor 可用、设计规范 v1.0.0/5 类均为 ready；定向 Node 测试 5/5 通过。分组图标 UI 验收仍受窄屏设计抽屉覆盖画布限制，需要先提供移动端“画布/设置”切换或桌面宽度浏览上下文；协议与服务端图标复验已完成。
- 窄屏 Studio 已增加“查看画布 / 返回设置”切换并实测：设置抽屉隐藏后画布约 381px 宽、返回按钮可见，设计模式不退出。当前 Browser 自动化无法滚动命中抽屉内隐藏的原生分组控件，因此“开启分组标题后选择分组并应用图标”的最后一段 UI 证据仍待补；不要将其表述为已验收。
- 上述分组图标证据已在独立桌面宽度标签补齐：切换 Report 后“趋势与来源”分组标题可见并被选中，资源入口携带 `target=trends&targetType=section`；资源中心搜索并应用 `trend-up` 后，分组标题 SVG 非空、选区保留、Studio 进入待保存状态。验收后已放弃修改并恢复 Dashboard 原状态。资源中心长期目标 M1-M5 至此完成。

- Provider 管理已从 `studio/project-center.mjs` 拆为独立原生组件 `studio/provider-connection-settings.mjs`，职责对齐 OmniDesk 的 React 组件，但不引入 React/Tauri：连接摘要、档案切换、新增/删除、模型探测、连接测试和保存启用统一由组件管理；项目中心只负责打开 AI 设置。Provider 定向测试 19/19、项目中心 Playwright 流程通过。
- 建立 Studio UI 组件分层第一阶段：新增平台侧 `studio/ui-kit.mjs`，并将 Button/Input/Select/Tabs/Dialog/Checkbox/Badge/Table 的语义契约放入轻量 Skill；尚未替换项目中心业务 DOM，下一步按组件逐步迁移并补回归。
- 已有项目 Tab 增加搜索、状态、排序和归属筛选；状态筛选按需请求归档数据，其他筛选在本地即时更新，空结果有明确提示。当前本机没有项目数据，真实排序行需在创建项目后回归。
- AI 设置已并入项目中心 Tab：点击“AI 设置”直接在同一弹窗内容区展示 Provider 管理，不再出现第二层弹窗或额外遮罩。
- 新建项目工作台完成一轮 B 端规范化：弱化嵌套卡片边界、统一表单节奏和控件高度，摘要区降噪，数据入口从装饰卡片调整为轻量操作区，桌面/移动结构保持不变。
- 新建项目参考稿已重新整理为项目自身主题：保留四步配置、实时摘要和底部操作，颜色统一到工具中性色 token，移除蓝色系统和彩色装饰，圆角回归项目规范。
- 新建项目已按用户确认参考图进一步高还原样式与文案：蓝色 Tab、数据接入卡片、浅蓝摘要和彩色状态、橙色提示、底部取消/生成；API 与 PostgreSQL 入口恢复，业务模板保留选中态。
- 项目工作台关闭入口收敛为外层右上角一个：嵌入式 AI 区域隐藏重复关闭按钮，项目弹窗移除重复底栏与关闭按钮。
- 新建项目已从纵向表单升级为两栏配置工作区：左侧四步配置，右侧实时 AI 摘要，底部集中生成操作；手机端自动单列。模板、组件、数据导入和生成接口仍复用原逻辑。
- 新建项目暂时隐藏“连接 API”和“连接 PostgreSQL”两个入口，底层 Connector、弹窗与服务能力保留，后续可直接恢复入口。
- 修复 AI 新建项目中 API / PostgreSQL 连接窗口被项目中心覆盖的层级问题；两个连接窗口现在会正常显示在项目工作台上方。
- 项目工作台三个状态已按同一响应式规范适配：空项目列表不再被最小高度撑开；新建项目的数据操作、说明和表单在窄屏自动换行且无横向溢出；AI 设置每次从顶部打开，编辑区不再抢焦点。桌面 `1440×900` 与手机 `390×844` 几何检查均通过。
- 项目中心与 AI 生成已合并成单一项目工作台：正式页面只显示左下角“项目 / AI”入口，工作台内提供已有项目、新建项目、当前项目 AI 编辑和 AI 设置；新建/编辑复用同一个 Composer。接受首稿后才创建项目，两个定向 Playwright 流程通过。Playwright 的 Provider profile/secret 目录已隔离，回归不再误用本机真实 `gpt` 档案。
- 原“组织设置”已收敛为单层“AI 设置”Provider 管理器：当前连接摘要、测试状态、连接卡片、内嵌编辑表单、读取模型和保存启用同层完成；组织名称、成员、AI 指标、平台状态和组织审计暂时隐藏且不再加载。定向 Playwright 管理流程通过。
- Provider 模型字段已按 OmniDesk 的轻量交互改为“获取模型后下拉选择 + 自定义兜底”。新连接可用当前表单中的地址和 Key 在保存前探测；编辑连接留空地址/Key 时复用服务端既有配置。19 项 Provider 定向测试通过，Provider 浏览器管理场景通过。完整 Playwright 中 7 个生成场景因本机已激活档案的模型仍为无效短名 `gpt` 而被外部 Provider 拒绝，其余 11 项通过；需在界面重新获取并选择真实模型 ID 后再做真实生成与完整回归。
- 真实 `smoke:provider` 现可输出 OpenAI Responses 的 input/output/total token 使用量，首稿与单次自动 repair 累加；数字只保留在隔离 Generation Run 与 smoke 结果，不估算价格，也不进入 Workspace、Revision、成品或普通浏览器状态。mock Gateway 回归覆盖两种调用次数。
- Token 管理员的浏览器主流程现从临时构建后的独立 Studio `/studio/projects` 启动，覆盖登录、AI 首稿、组织设置、AI 指标和平台运行状态；静态产物路径不再只依赖单独的 HTTP fallback 回归。
- 组织设置新增只读“平台运行状态”：将现有 readiness 的脱敏摘要以存储、身份、身份映射、分布式执行、审计锚定和数据权限六项呈现给组织管理员。读取与 AI 指标并行，失败不会阻断成员管理；浏览器回归验证 token 管理员会话、本地运行状态和 390px 两列无横向溢出。
- 新增无自由文本的 Generation Feedback：Composer 将成功 Job ID 保留到评审结束，接受版本后写 accepted/revision，取消预览后写 dismissed；仅任务发起人可一次写入，相同重试幂等、冲突改写拒绝，原因只允许受控码。反馈失败不回滚版本或取消；组织概览新增候选可用率和已评审数
- 组织设置已接入只读“AI 运行概览”：管理员可直接查看近 24 小时候选可用率、生成成功率、自动修复率、已评审数、p50/p95 与失败分类；指标加载失败不影响成员管理。浏览器已验证接受后显示两项 `100% / 1 次评审`、390px 两列无溢出、viewer 入口隐藏且直连 API `403`；standalone 不携带治理界面
- Generation Job 新增安全 telemetry 与组织指标：终态只固化排队/执行/总耗时和修复次数；组织管理员可读取 24 小时至最多 30 天的状态、成功/失败/修复率、p50/p95 和失败码，不返回 Job/actor、prompt、workspace、候选或错误正文。测试覆盖跨组织隔离、旧任务推导和 HTTP 脱敏
- 新增 `DASHBOARD_PUBLIC_ORIGIN` 部署真相：生产写请求按显式公网 HTTPS origin 做 CSRF，不信任转发头；OIDC redirect URI 必须精确匹配受控 callback。独立反向代理 conformance 已故意改写内部 Host，并验证 Studio fallback、Secure Cookie、正确/错误 Origin 与错配 OIDC 启动失败；真实 TLS ingress/IdP 仍需部署验收
- Generation Job 已补真实 PostgreSQL 多实例 conformance：双 worker 竞争只允许租约获胜者调用 Provider，过期 running lease 可恢复，跨实例取消能 fence 迟到结果；数据库 payload 明确不含 DataContext、records 或连接凭证。本机未配置 `DASHBOARD_TEST_POSTGRES_URL`，新增用例由 CI PostgreSQL 17 执行
- Studio AI Composer 已改走持久化 Generation Job：生成/精修任务可轮询、停止并在刷新后恢复；双 worker 通过租约与 fencing 只执行一次，取消向 OpenAI fetch 传播 AbortSignal，迟到结果不能覆盖画布。Job 只公开状态和最终 run，不公开内部 input，也不持久化 DataContext/records/凭证；同步端点继续兼容
- 真实数据 eval 进一步拆成 portable/non-portable 对照：non-portable 首稿不含 Dataset records 或 binding，只固化 Query Snapshot 派生的 KPI、趋势、排行和聚合表；泄漏 records 或篡改静态值的负例会失败
- Generation eval 已扩为 10 个案例：除多领域 draft、portable/non-portable 数据和 Component 精修外，新增 Section 标题 target-only 评分；通过正式 DataContext 验证数据源、binding、聚合、首屏值、来源和 records 边界，未知字段、非目标漂移、篡改值与 records 泄漏负例均能精确失败
- 新增 `evals/generation-cases.json` 与 `generation-evaluator.mjs`：5 个多领域 draft、1 个 target-only refine 通过同一 Provider Gateway 生成隔离 preview，按 100 分 rubric 和 85/90/100% 阈值阻断发布；默认输出不含 prompt/workspace/provider 原文，支持 `--json`
- `npm run eval:generation` 强制确定性 provider 并接入 `npm run check`，当前基线 8/8、平均 100、修复 0；评分器负例覆盖非目标组件漂移、未知绑定字段、可见值篡改和 records 泄漏。真实 OpenAI 需部署密钥显式运行 `eval:generation:provider`，避免 CI 环境变量意外产生费用
- 当前完整自动基线为 Generation eval `10/10`、平均 `100`，Node `161 passed / 6 PostgreSQL skips`、Playwright `18/18`、Skill 29 文件；可复现 Skill SHA-256 为 `5e25a12695a93407996018fea8d0d2259e0b17cfa0b7530c72f20cfb5cd38a46`
- Studio 导出已统一为 revision-only：`Export Center` 与 `Publication Center` 共用 `prepareRevision`，未保存的有效 workspace 自动追加 user revision 后再导出；空白视觉模板不能绕过 workspace 校验。旧 DOM 克隆 bridge 和 fallback API 已移除，契约禁止回流
- 删除 Editor Runtime 中已无调用者的旧 standalone 数据绑定 helper；新增 renderer parity 合同逐项验证 revision 的 section、component、顺序、span、主题和来源。完整基线为 Node `130 passed / 5 PostgreSQL skips`、Playwright `13/13`、Skill 29 文件，包哈希保持 `553463ad12cfc501d7eac5869b7915ab019660adc4bfac088ecf572f173b98fb`
- Studio Web 独立静态构建已落地：`npm run build:studio` 输出 21 个文件到 `dist/studio-web/`，包含确定性摘要清单；workspace core 的仓库路径只在构建副本中改为本地 runtime，便携 Skill 继续保持独立 29 文件边界
- 新增 `npm run test:studio-build` 并接入 `npm run check`，验证双构建一致、无 `.agents` 导入、无内联脚本、无服务端配置或后端模块；定向构建测试已通过
- Preview Server 新增 `DASHBOARD_STUDIO_WEB_ROOT` 和 `npm run start:studio`，让静态构建与 API 在同源网关运行；HTTP 回归已证明 `/studio/*` fallback、JavaScript MIME、`no-cache`、缺失模块 404 以及 `/api/*`、`/p/*`、`/embed/*` 不被 SPA 捕获
- Studio Web 已建立首批稳定入口：`/studio/projects` 与 `/studio/projects/:projectId` 由服务端返回现有编辑器壳，新增 `studio/studio-router.mjs` 解析深链并仅通过 Project Center 窄接口激活项目；项目变化同步规范 URL。定向 Playwright 已验证深链恢复、后续项目操作及 standalone 不携带 Router
- `/studio/organizations/current` 已接入同一渐进式壳层；Router 只触发 Project Center 的组织操作，不持有组织状态或复制授权。token 模式浏览器回归验证管理员会话保留、组织页自动打开和后续项目操作正常
- `/studio/publications/:publicationId` 已接入 Publication Center；深链先读取发布权威记录、恢复所属 Project，再打开并标记目标发布。真实浏览器流程从深链继续完成 HTML/PNG 读取和撤回，Router 不持有发布业务状态
- 新增 Studio-only External Identity Repository：以 SHA-256 派生的稳定 ID 将 `providerId / issuer / subject` 不可变映射到组织与 actor，不保存 email、IdP assertion 或 token；file 与 PostgreSQL 版均可持久化，PostgreSQL 通过事务级锁支持跨实例一致读取、绑定和解绑
- 新增 OIDC Login Transaction Store：服务端内存保存短期、单次 state hash、PKCE verifier、nonce 与只允许相对路径的回跳目标；重复消费、过期和外部回跳均拒绝。定向 Node 测试已覆盖映射改绑拒绝与事务重放/过期
- 新增 OIDC Provider Service：只按显式配置生成 Authorization Code + PKCE `S256` URL，回调必须经过注入式 code exchange 与 ID token verifier；仅当 issuer/audience/nonce 通过、External Identity 已映射且 actor 可解析时才返回登录结果。HTTP 路由、RS256 JWK verifier 与环境运行时装配已完成，真实 IdP adapter 联调仍需部署配置
- Preview Server 新增匿名 OIDC provider/start/callback 路由，成功 callback 会通过 `loginActor` 创建原有 HttpOnly Studio session；`oidc` auth mode 拒绝 token 登录，写请求沿用同源 Origin 检查。HTTP 回归覆盖 provider 列表、302 授权、callback、session 状态与 token 拒绝；仍需 JWK verifier 和环境 Provider 配置才可实际开启
- 新增可注入 OIDC RS256 verifier 与 authorization-code exchange：JWK HTTPS 缓存/unknown-kid 刷新、签名/issuer/audience/nonce/时限校验和 Basic client authentication 均有真实 RSA 签名回归；payload parsing、access token 与上游错误正文都不会成为信任或输出来源。环境 Provider 配置仍未接通
- 新增 OIDC runtime config：`DASHBOARD_AUTH_MODE=oidc` 在 file 与 PostgreSQL storage 均使用分离的 Provider metadata、client secret、RS256 verifier、code exchange、一次性事务和对应 External Identity store 完成启动装配；缺少 provider/JWK 直接 fail-fast。PostgreSQL 启动复用同一组织服务、Auth Service、共享 identity/session 仓储；环境回归覆盖 secret 不进入公开 provider/授权 URL 与缺配置拒绝
- Platform readiness 现在在 OIDC 模式探测 Provider 编排和 External Identity 仓储，仅返回模式、provider 数量与最小状态；任一依赖缺失即失败关闭，不泄露 provider/issuer/identity/secret
- OIDC 邀请生命周期已接通：组织管理员创建绑定 `providerId / issuer / subject` 的限时单次邀请，原始 acceptance secret 只在创建响应出现一次且仓储只保留 hash；匿名 invitation-start 仅建立 PKCE transaction，verified callback 匹配目标身份后才绑定 immutable identity、激活动态成员和创建 HttpOnly session。文件存储 Node/HTTP 回归已通过；邮件投递、SCIM、PostgreSQL invitation conformance 与跨仓库原子提交仍未完成
- 新增 `docs/architecture/scim-provisioning-contract.md`，先固定 SCIM 的 server-to-server 凭证边界、`providerId / externalResourceId / operationVersion` 幂等键、角色 allowlist、停用复用 session-revocation outbox 与审计脱敏要求；尚未开放 SCIM endpoint
- 人工组织成员暂停或移除现在以组织更新内的持久化 session-revocation outbox 驱动按成员/组织的 session 清理；dispatcher 失败保留事件并可在重启或下次成员更新后恢复。授权层仍按当前成员状态拒绝访问。邀请接受已接入；SCIM 暂缓，未来实现时必须复用这条边界
- PostgreSQL Audit Sink 已为每个新 chain head 持久化最小 anchor outbox；可选 HTTPS sink dispatcher 用稳定 anchor ID 投递并保存不透明 receipt，失败不影响业务或内部 audit。`GET /api/audit-events/anchor-status` 仅对组织管理员返回最小 freshness/status；真实独立 WORM/合规留存仍待部署验证
- 当前完整基线：Node `127 passed / 5 PostgreSQL skips`、Playwright `12/12`、Skill 29 文件、high-level audit `0`；可复现 Skill SHA-256 为 `553463ad12cfc501d7eac5869b7915ab019660adc4bfac088ecf572f173b98fb`。2026-08-11 曾出现 1 次历史恢复按钮稳定性超时，单独复跑及随后完整浏览器回归均通过，后续仍应留意该链路
- 图表目录扩展为折线、面积、柱状、条形和环形五类受控类型；“排行 / 横向对比 / 长标签”自动选择条形图，局部设置、AI 精修模板、服务端 ECharts SVG、编辑器/standalone SVG 回退和 ARIA 标签已同步。条形图可由用户直接选择或输入“用条形图展示客户贡献排名”。
- 已新增企业身份与外部审计架构合同：OIDC 固定为服务端 Authorization Code + PKCE 与不可变 `(issuer, subject)` 成员映射，默认禁用 JIT 组织入驻；邀请、SCIM 与手工成员操作后续必须共用成员生命周期和跨实例 session revocation
- 外部审计锚定固定为每组织 hash-chain head 的最小 payload，经 durable outbox 异步投递到独立 append-only sink；失败必须报告 freshness/status 且可恢复，但不得回滚 Project、成员或内部 audit 写入。当前只是设计，OIDC/SCIM/sink 均未接入
- 下一项应实现统一成员生命周期（邀请/SCIM/停用）及可验证的跨实例会话批量撤销，再补外部 audit chain head 锚定；不要在未完成这些验证前宣称完整 SSO 生命周期、SCIM 或外部审计已可用

- 新增 `npm run smoke:provider`：在显式 OpenAI 配置的部署环境执行一轮首稿与一轮组件精修，要求都进入 `preview-ready`；不提交 Project、不输出 prompt/workspace/密钥，未配置时本地安全失败
- 共享发布和嵌入新增授权后限流：默认每发布对象/连接来源每分钟 120 次，超限返回 `429` 与 `Retry-After`；来源只用于内存计数，不落入访问事件，同窗限流拒绝只记录一次
- 新增 `studio/workspace-core-client.mjs`：Studio 状态恢复与 AI 版本比较不再直接导入 Skill 路径，而经可替换的浏览器 core 边界复用迁移、校验和差异函数；Skill 包仍只含 portable core，不含 Studio
- 项目中心当前项目操作改为“重新加载”：保存时遇到 `409 stale` 会保留本地脏状态，用户确认后才从服务端恢复最新不可变 revision，不发生静默覆盖
- 新增双页面 Playwright 并发回归：一个页面保存手工 revision 后，另一个旧 revision 保存被拒绝；重新加载后恢复服务端版本
- AI 工作台的历史版本新增只读“比较”：用户可把任一非当前 revision 与当前版本逐字段比较，再决定是否恢复；比较复用共享 `workspace-core` 差异逻辑，最多展示 12 项，不调用恢复 API、不写入 Project 或画布
- 定向及完整浏览器回归已验证比较面板、历史恢复与撤销可连续执行；当前完整基线为 Node `112 passed / 5 PostgreSQL skips`、Playwright `12/12`、Skill 29 文件，包哈希 `931eacf77d23adcb1d889e0e6b58b0e39108852fa6d0d6ab9ff28a48292e298c`
- 项目中心新增“新建 AI 项目”：清除当前 Project/revision 身份并打开 AI 工作台，保留当前视觉和已选数据作为生成基线；只有用户接受候选时才由服务端创建 `source: agent` Project，不产生空项目
- 浏览器回归验证先接受一版、切换到新 AI 项目后当前 Project 为 null、再次接受后生成新 ID 且仅有首个 revision；未保存修改仍需用户确认才可切换
- AI 工作台的图表替换入口改为读取 `/api/charts/catalog`：当前目录返回折线、面积、柱状、条形和环形图，新增受控类型后无需同步修改工作台；目录请求失败时保留静态模板
- 浏览器回归验证首稿、选择图表、目录驱动模板、局部修改、撤销和历史恢复完整链路；用户可在首稿描述或选中图表后的局部 AI 面板直接调用受控图表类型
- 新增 `studio/studio-api-client.mjs`，为 Project、Publication 和 Data Source Center 提供一致的 JSON 请求、错误载体和 `GET/POST/PUT/PATCH` 快捷方法；客户端不持有 token、凭证或本地业务状态
- Data Source Center 通过注入式错误文案继续优先显示字段校验问题；Project/Publication 行为和 API 请求形状保持不变，预览契约阻止三处请求封装重新分叉
- 完整验证为 Node `109 passed / 5 PostgreSQL skips`、浏览器 `10/10`、Skill 29 文件、包哈希 `931eacf77d23adcb1d889e0e6b58b0e39108852fa6d0d6ab9ff28a48292e298c`
- 新增 Studio-only Organization Repository 与服务端组织控制 API；token 继续只负责受控身份校验，组织名、成员状态和 organizationRole 持久化到 file/PostgreSQL 仓储
- 每次请求重新解析组织成员，组织管理员暂停成员后其既有 Cookie 立即失效；组织更新需 `expectedUpdatedAt`，且不能移除最后一名活跃组织管理员
- 组织管理员可在项目中心打开组织设置并编辑组织名称、成员角色和启用状态；viewer 不显示入口，standalone 不含组织管理 UI
- 完整验证为 Node `105 passed / 4 environment skip`（数据库 `109/109`）、PostgreSQL Playwright 历史基线 `10/10`、Skill 29 文件、audit 0，包哈希 `931eacf77d23adcb1d889e0e6b58b0e39108852fa6d0d6ab9ff28a48292e298c`
- 下一步是组织级审计；SSO、邀请、跨组织委派和行级权限仍不在当前范围
- Semantic Query Cache 改为 Store 协议：file 继续使用 LRU，PostgreSQL 使用共享 TTL 表；缓存 key 加入 Dataset ID，缓存仅保存聚合结果
- Schema、手动刷新与后台 Job 成功后按 Dataset 主动清理；即使未清理，fingerprint/语义版本仍保证跨版本 miss
- 真实 PostgreSQL 已验证跨连接池 hit、数据库 TTL、定向失效和 readiness `shared/persistent`；缓存表不含 records 或 connector
- PostgreSQL Audit Sink 新增每组织 sequence/hash chain、append-only trigger 和可选 HMAC seal；普通 `UPDATE/DELETE` 被数据库拒绝，受权验证 API 只返回当前组织完整性摘要
- Sink 先 flush Project outbox 再验证；真实 PostgreSQL 已验证双连接池并发链、HMAC seal、篡改检测和 trigger，file 模式明确返回 `501`
- 当前完整验证为 Node `103 passed / 4 environment skip`（数据库 `107/107`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0，包哈希 `71fe3c5249e1b3c14f97235705e94ca454fa24cba3c89034500ac2bfc159db27`
- Refresh Job 新增 owner/token/expiry 租约、heartbeat 和 fencing；过期 Worker 即使晚返回也不能提交 Dataset 或终态，PostgreSQL 对每个 Dataset 的活跃 Job 加唯一约束
- Refresh Schedule 先领取租约再创建由 `scheduleId + scheduledFor` 派生的确定性 Job；故障接管会复用“已创建未确认”的 Job，不会重复触发
- readiness 新增 execution 能力并暴露 file/local 与 PostgreSQL/distributed 的差异；`DASHBOARD_REFRESH_LEASE_MS` 可调整租约时长，默认 30 秒、最小 5 秒
- 真实 PostgreSQL 17 已验证双 worker fencing、过期接管、双 scheduler 单次触发与确定性重放；完整验证为 Node `102 passed / 2 environment skip`（数据库 `104/104`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0
- 新增可插拔 Session Repository；Auth Service 的 status/login/logout/authorize 全部异步化，内存实现保留本地兼容，PostgreSQL 模式自动使用共享会话
- Session repository 仅保存 Cookie 随机值的 SHA-256 摘要、actor/organization 引用与过期时间；原始 Cookie、登录 token 和完整身份快照不落库
- 真实双 HTTP 实例已验证 A 登录、B 鉴权、B 注销、A 立即失效；认证 readiness 报告 PostgreSQL shared/multi-instance，探针失败不泄露底层错误
- 当前完整验证为 Node `101 passed / 1 environment skip`（真实数据库 `102/102`）、PostgreSQL Playwright `10/10`、Skill 29 文件、audit 0，包哈希 `5d4bef0de16f30488dd6a81c9f4d3763607d1c06b3bf90f828956f7c8ef8d9d0`
- 新增 `studio-postgres-storage.mjs`：PostgreSQL JSONB 实体表、独立 Audit/Access Event 表实现七仓端口；Project 以 advisory lock + row lock 执行条件写，并在同事务提交 outbox
- 预览服务接通 `DASHBOARD_STORAGE_PROVIDER=postgresql`、`DASHBOARD_DATABASE_URL` 与连接池配置；错误 provider 和连接失败 fail-fast，不静默回退 file；readiness 可区分 local-only file 与 managed PostgreSQL
- 真实 PostgreSQL 17 已验证 adapter `1/1`、双连接池共享、冲突、事务 outbox 和重启持久性；PostgreSQL provider 下完整 Playwright `10/10`
- 修复 JSONB 对象键规范化导致 undo/restore 漂移误报，改用结构深比较并补键重排回归；完整 Node 为 `98 passed / 1 environment skip`，Skill 29 文件、audit 0，包哈希 `c32e7300c96651b578589d48f0af5c01969d0d922ccc9fc4abd0a7ee889d0ea5`
- 新增 `studio-storage-runtime.mjs`，七个仓储端口在服务启动时 fail-fast 校验；匿名 readiness 执行只读探针并明确 file provider 为 local-only/non-production，且不泄露目录或对象正文
- 新增 4 项端口/能力/readiness 单测；token HTTP 测试验证 readiness 无需登录、全部探针正常、productionReady=false 且响应不包含实际存储路径
- 完整验证为 Node `97/97`、浏览器 `10/10`、Skill 29 文件、audit 0；可复现 Skill 哈希为 `49f656dfae607f1d9e16f5929c814943733add82bafb4dbfbaf151032d000853`
- 新增单机 Project transactional outbox：业务状态与事件意图同文件原子提交，Audit 按稳定 ID 幂等追加，启动/写后/查询前可恢复投递；`_outbox` 对 API、revision、导出与 Skill 不可见
- Project 管理七类审计路径已移除直接双写；故障注入证明 Audit 离线时 Project API 仍返回成功，恢复后只补投一条事件并清空 pending
- 审计事件 ID/ISO 时间进入文件名之前严格校验，客户端迁移 seed 中伪造的 `_outbox` 会在仓储边界剥离；完整验证为 Node `93/93`、浏览器 `10/10`、Skill 29 文件、audit 0，Skill 哈希 `a13698805c0895ed1c6d8ca53529d4ab393e0b825aa7bf0322b7a7ef2e4bf121`
- 新增 Studio-only `studio-json-file-store.mjs`，集中安全路径、确定性 JSON、`0600` 独占创建、同目录原子替换和失败清理；Job、Schedule、Dataset 与 Publication 仓库已迁移且领域队列/冲突规则保持不变
- 新增 3 项存储原语测试并将模块加入 Skill 禁止打包清单；Project revision 与追加式 Audit/Access Event 因事务语义不同继续保留专用实现
- 完整验证为 Node `88/88`、浏览器 `10/10`、Skill 29 文件、audit 0；可复现 Skill 哈希更新为 `6976e9ea196b5b550b68f372edc2d7ba9d9f01c080df8bd2ea7c5a622aa8b1a3`
- 新增 `studio/workspace-structure-synchronizer.mjs`，将卡片 create/move/update/remove 计划和注入式 DOM 应用移出 Editor Runtime；模板克隆、内部 ID 重写、选择与拖拽绑定继续由编辑器适配
- Node `85/85`、浏览器 `10/10`、Skill 29 文件、audit 0；覆盖新增、删除、跨分区、缺失 Layout item、旧 DOM 多余、顺序稳定和输入不变，预览契约升级为 external editor runtime + 13 Studio modules
- 新增 `studio/workspace-layout-controller.mjs`，Layout Config 的 get/apply、跨度回退、分组状态和顺序回放已移出 Editor Runtime；装配只注入 DOM 查询与单一 onChange
- Node `82/82`、浏览器 `10/10`；真实拖拽后保存本地 Workspace、刷新页面并恢复同一 canvasOrder，证明 Controller 与 Session 双向闭环
- 新增 `studio/workspace-layout-interaction.mjs`，统一 12 列跨度、5px 启动阈值、四向落点和带防抖区的画布重排；DOM 占位、动画和保存继续由 Editor Runtime 编排
- Node `80/80`、浏览器 `10/10`；新增真实 Chromium 指针拖拽验证跨行换位、目标高亮、占位/拖动态清理、dirty 与无 runtime error
- 新增 `studio/workspace-state-core.mjs`，统一 Workspace 快照 compose、共享迁移校验和恢复切片深克隆；Editor Runtime 不再直接调用 migrate/validate 或手写协议对象
- Node `76/76`、浏览器 `9/9`；非法 URL 快照原子拒绝后页面保持默认标题与可用状态且无 runtime error
- 新增 `studio/workspace-chart-adapter.mjs`，异步图表请求、缓存、竞态丢弃、容器 ARIA 和 portable fallback 已与 Editor Runtime 解耦；主运行时只注入受控类型、palette 和 fallback SVG
- Node `72/72`、浏览器 `9/9`；真实环形图 `823×260`、5 个绘图节点、ARIA 正确、busy 清除且无 runtime error
- 新增 `studio/workspace-control-renderer.mjs`，筛选栏和视图 Tab 的 DOM、ARIA 与显隐逻辑通过结构化动作接口和 Editor Runtime 解耦；初始默认 Tab 不污染 dirty 状态
- Node `68/68`、浏览器 `9/9`；真实页面把区域从华东切到华南后三项 KPI 同步变化且无 runtime error，证明筛选事件、数据物化和 Renderer 闭环正常
- 新增 `studio/workspace-renderer.mjs`，把已物化 document 的标题、数据来源、分区、摘要、KPI、基础图表、列表和表格投影移出 Editor Runtime；Renderer 不读取全局编辑状态或发起副作用
- Runtime 保留 document 克隆、筛选物化、控件和异步图表编排；真实页面实检标题/KPI 正常且无 runtime error，完整验证保持 Node `66/66`、浏览器 `9/9`
- 新增 `studio/workspace-session.mjs`，统一本地、URL/旧 hash、工程内嵌状态和旧历史键清理；Editor Runtime 只保留恢复优先级、dirty 状态与用户提示映射
- Session 采用可注入 storage/location/history/embedded reader，并以结构化结果覆盖坏 JSON、URL logo 脱敏、配额失败和兼容清理；完整验证为 Node `66/66`、浏览器 `9/9`、Skill 29 文件、audit 0，包哈希保持 `7caa05a3f4909e0b8a9a35717c5adfb106291a5450a1fc9d1747f0f19bec39cd`
- Editor Runtime 升级为 ESM 并直接复用便携 `workspace-core.mjs`；本地草稿、Project、AI preview、undo 和 history restore 统一经过 v1/v2 迁移与完整校验
- 浏览器已验证 v1 自动补齐 headerAlign/paletteVersion 并恢复为 v2；非法 workspace 在 DOM 写入前拒绝，当前标题与画布保持不变
- 完整验证保持 Node `59/59`、浏览器 `9/9`、Skill 29 文件、audit 0；新包哈希为 `7caa05a3f4909e0b8a9a35717c5adfb106291a5450a1fc9d1747f0f19bec39cd`
- 预览 HTML 的 4503 行内联编辑器已迁至 `studio/editor-runtime.js`；页面壳零内联脚本，运行时可独立严格解析，5 个业务模块装配顺序保持稳定
- 修复两个同名 `workspaceComponentById` 的返回形状冲突；真实浏览器已验证手动把生成图表改为面积图、保存 revision 并导出受控 `chartType`
- Skill 契约同步外部 editor runtime 后仍为 29 文件
- 新增 `studio/export-center.mjs`；revision artifact、旧项目迁移、HTML 保存、下载反馈和 `DashboardFileExporter` 已移出主 HTML，兼容 DOM 序列化留在编辑器内核
- 真实浏览器点击下载已验证版本文件名、Dashboard 内容与 Studio 依赖清理；完整验证保持 Node `59/59`、浏览器 `9/9`、Skill 29 文件、audit 0
- AI candidate、Review、commit 与 undo orchestration 已移入 `studio/ai-composer-center.mjs`；模块现在持有完整 AI 产品状态机，主编辑器不再保存 pending run 或调用 generation API
- `DashboardStudioBridge` 移除通用 AI command，改为 clone transaction context 和 preview/commit/undo/restore 四个单用途应用动作；契约检查阻止实现回流
- 完整验证保持 Node `59/59`、浏览器 `9/9`、Skill 29 文件、audit 0
- AI History/Restore orchestration 已移入 `studio/ai-composer-center.mjs`；历史 API、列表和恢复请求不再占用主 HTML，编辑器只提供 clone context 与受控恢复应用方法
- 历史恢复定向浏览器链已通过；恢复旧 revision 后创建新 revision、状态提示和历史计数保持一致
- 新增 `studio/ai-composer-center.mjs`；工作台开合、作用域呈现、模板、快捷键和操作按钮已移出主运行时，bridge 只暴露组件摘要与受控事务命令
- 首稿到发布、局部精修到撤销/历史恢复浏览器链保持通过；standalone 回归排除 editor runtime 与全部 5 个 Studio 业务模块
- 新增 `studio/data-source-center.mjs`；文件导入、REST、Semantic Model、刷新任务和 Schedule 已移出主运行时，bridge 只同步 clone 后的当前 Dataset
- Data Source 模块化后完整验证保持 Node `59/59`、浏览器 `9/9`、Skill 29 文件、audit 0
- 新增 `studio/publication-center.mjs`；发布、分享、嵌入、HTML/PNG/PDF、访问统计和撤回已移出单文件，bridge 只提供已保存 revision 上下文
- 现有真实浏览器发布链完整通过，fallback 干净导出同时排除 Project Center 与 Publication Center 模块
- 新增 `studio/project-center.mjs`，项目 API、列表、切换、成员与审计 UI 已从单文件预览移出；workspace 编辑器仅暴露冻结的窄 bridge
- 契约检查阻止 Project Center 实现回流单文件；浏览器证明模块化流程和 fallback 干净导出均稳定
- token 身份和新 Project 增加 organizationId；同组织身份目录不返回 token，Project 与审计查询均先做组织隔离，跨组织 admin 无权访问
- 项目中心新增成员管理，可将同组织身份设为无权限、只读或可编辑；全局 viewer 仍保持只读能力上限
- 新增追加式 Project Audit Store、受控 API 和“记录”界面，覆盖创建、复制、重命名、归档、恢复及 ACL 更新
- 新增悬浮项目中心：可打开服务端项目并恢复完整 workspace，支持重命名、复制当前 revision、归档、查看归档和恢复；全部 Studio UI 在导出时移除
- Project 元数据与 ACL 使用 `expectedUpdatedAt` 乐观并发；归档项目服务端只读，复制项目不继承来源成员和 revision 历史
- M4 Project 所有权与 ACL 已落地：admin 全局管理、owner 管理成员、项目 editor/viewer 分离读写；列表、revision、导出、Publication 和访问审计均按项目过滤
- Refresh Job `resume()` 改为单实例幂等，消除服务启动与调用方同时恢复造成的重复执行竞态
- M4 新增可选 token 身份、HttpOnly 内存会话、Origin 校验和 viewer/editor/admin 全局角色；默认本地模式保持兼容
- Studio 登录门禁、viewer 只读和固定退出入口已通过真实浏览器；standalone 导出不含认证 UI 或角色状态
- M3 路线范围与三条阶段门槛已逐项审计通过；新增跨 Project/Dataset 回归直接证明刷新不改变 revision、组件 ID、document 或 layout
- 修复 AI 接受后的延迟自动折叠覆盖用户主动展开，历史恢复回归改用真实可见点击
- Publication embed 复用共享访问策略和审计；Studio 支持一次性或公开 iframe 代码
- 指定 Publication artifact 可导出 HTML、真实 PNG 和保真长页 PDF；渲染不读取当前画布或最新数据
- Refresh Job 新增 canceled；排队/重试可立即移除定时器，运行中取消后迟到结果不会写入 Dataset
- 新增持久化固定间隔 Schedule、重启恢复和启停 API；Studio 可选择常用频率、查看任务并取消活跃任务
- Publication 新增 `/p/:id` 访客访问执行：private 隐藏、unlisted 令牌校验、public 稳定路径、revoked 返回 `410`
- unlisted 使用一次性 192-bit 随机令牌，服务端只存 SHA-256；摘要、访问日志和成品均不包含原始令牌
- 新增独立访问事件仓库和管理 API；Studio 显示一次性分享链接、公开打开入口及成功/拒绝访问次数
- Studio 顶部新增发布管理：当前 revision 可按 private/unlisted/public 发布，列表展示新鲜度并支持 artifact 下载
- Publication 支持确认撤回；撤回后 artifact 返回 `410`，旧对象保持不可变，重新发布创建新对象
- Playwright 启动前清理全部测试仓库，跨运行不继承项目、数据、发布、任务或计划；完整回归为 Node `57/57`、浏览器 `7/7`、audit 0

- Dataset 新增服务端 `rawRecords`，字段类型修正始终从原始规范化值重算；已验证编码 `001` 自动误判为数字后可无损恢复为字符串
- 新增版本化 Semantic Model，维度、指标、聚合、格式与时间粒度和物理字段分离；支持 sum/average/min/max/count、倍率、前后缀和 0-6 位小数
- 新增字段配置 PATCH API 与 `expectedUpdatedAt` 乐观并发；转换失败、非法角色、重复字段和 stale 更新均原子拒绝
- Studio 增加字段与指标配置模态；真实浏览器已验证把收入改为最大值和人民币格式、转化率保持平均百分比后，首稿 KPI 显示 `¥1,800` 与 `35%`
- 生成器改为优先读取确认后的 Semantic Model，不再按数值字段位置猜测 KPI、图表和排行口径

- 新增 Studio-only 数据源服务与原子文件仓库，支持 CSV/JSON 可靠解析、2 MB/10,000 行/100 列限制、稳定字段 ID、类型推断、空值/唯一值/样例和质量提示
- 新增 Data Source 导入、列表、读取和受限预览 API；原始记录默认只驻留服务端，Provider 仅接收字段摘要和最多 12 行受控样本
- AI 工作台增加紧凑数据导入入口和显式“随成品携带”开关；便携数据最多 500 行进入 workspace，并由 KPI、图表、表格和排行使用真实声明式绑定
- 新增 3 项数据服务 Node 回归和 1 条 Playwright 上传生成流程；CSV 引号/逗号、非法 JSON、大小限制、持久化、请求防篡改、真实 KPI/图表/表格和成品数据均已覆盖
- AI 浮动工作台层级提升，避免 ECharts SVG 在重绘后拦截历史与生成控件

- 新增服务端 Provider Gateway；默认确定性 provider 与可选 OpenAI Responses 适配器共用同一 generation bundle、一次修复、隔离预览和 revision 提交链路
- 无数据首稿在 Gateway 的 Data Context 阶段建立 `primary-data / sample` 身份；provider 返回的 request 被平台规范化值覆盖
- 远程适配器使用显式模型、`store: false` 和 schema-guided JSON；输出仍须通过本地 schema、provenance 和 command materialization 校验
- provider 配置、限流、超时、上游故障、拒绝、空输出和非法 JSON 已归一化；Studio 对 429/502/503/504 提供独立提示且失败不改变画布
- key/model/endpoint 仅来自服务端环境；`.env` 已忽略，health、input、run、workspace、日志、Skill 包和成品均不包含 key
- 自动回归增至 40 项；真实 Abort 超时、假 OpenAI HTTP、单次 repair、request 防篡改、自包含 schema、密钥泄漏边界、Project Store 并发恢复及确定性 revision 导出均通过
- Studio 新增服务端权威 Project Repository；revision 可跨服务重启恢复，同项目写入串行化并以 `expectedRevisionId` 拒绝过期覆盖，文件仓库不进入轻量 Skill
- 组件作用域确定性 provider 新增复制、新增同类、删除、`3 / 4 / 6 / 8 / 12` 列调宽和前后移动；一个 command batch 原子同步 document、layout、canvasOrder 与关联状态
- `workspace-core` 可为稳定 ID 数组生成精确 `insert / remove / move` 反向命令；摘要卡不可复制，分区最后一张卡不得删除
- 预览页增加 workspace 驱动的 DOM 协调层；新卡从受控模板注册表克隆，清理旧编辑状态后重新绑定选择、拖动、左右调宽和落点
- 删除、取消、撤销与历史恢复均同步真实画布；列表和表格按组件类型渲染，不再依赖固定示例卡 ID
- 新增 `history / restore` API 和 AI 工作台版本历史面板；指定旧 revision 恢复会追加新 revision，手动漂移时拒绝覆盖，接受/撤销/恢复均自动持久化
- 浏览器已实测复制、删除、半宽、前后移动、取消、接受、刷新、撤销、历史恢复和漂移拒绝；390px 下无横向溢出、卡片重叠或离屏节点
- generation request 增加 `workspace / component` scope；选中结构化卡片后，浮动工作台自动切换为“AI 修改卡片”并显示当前目标
- 当前确定性 provider 支持局部切换图表类型、修改标题/副标题及摘要正文；只输出目标字段命令，不支持的指令和失效目标返回可行动错误
- 隔离预览保存 baseline、candidate 和字段级差异；接受后的 revision 保存父 revision、正向/反向命令和摘要，取消不污染原 workspace
- `POST /api/generation/refine` 与 `POST /api/generation/undo` 已接通；只有最新且无后续手动漂移的 revision 可整批撤销，成功撤销以新 revision 留痕
- 浏览器已实测三字段局部修改、面积图候选、接受、取消及恢复原环形图；390px 底部面板与 Dashboard 背景层级正常
- 图表目录固定为折线、面积、柱状、条形和环形五类；`props.chartType` 进入 workspace 校验，旧 workspace 未保存该字段时保持兼容
- AI 首稿可按明确图表名或趋势、累计、对比、构成语义选择类型；图表提示词模板、生成评审元数据和局部选择器使用同一目录
- Studio 的折线、面积和环形图使用 ECharts SSR，柱状图保留原轻量样式；实际卡片宽度、深浅模式和窄屏图例均已接入
- standalone 与服务离线场景使用响应式内联 SVG 降级；筛选变化会重算图形，手动类型随接受、保存和刷新恢复
- 修复生成副标题更新破坏 `.panel-note` 子节点并导致筛选重绘报错的问题
- 视觉预设入口已收敛为内置与自定义共用的一条直选栏：细分隔线区分来源，栏末 `+` 负责另存当前视觉，自定义预设通过悬停/聚焦/选中后的 `···` 执行更新、重命名和确认删除；旧本地预设无需迁移
- 页面级 `filter-bar / view-tabs` 已进入组件注册表和 workspace v2；定义与状态分离，非法默认值、未知目标和无效 Section 引用会在预览前被拒绝
- 确定性首稿只在提示词明确要求筛选或视图切换时生成控件，筛选状态与活动视图可随 workspace、revision、URL 和本地保存持久化
- 新增可移植交互 Runtime；预览页控件继承主题 surface、边框、圆角、阴影和强调色，Tab 可访问语义与响应式布局已通过浏览器验证
- standalone 导出在存在交互控件时保留最小事件脚本，不携带 Studio、图标库、图表库或前端框架
- 新增轻量 dataset/binding 运行时；区域筛选已实测同步改变 KPI、趋势图、表格和排行，零结果使用统一空状态
- standalone 只嵌入 `portable: true` 数据集；不可嵌入时保留当前静态结果并移除筛选栏
- 便携 Skill 共 29 文件；新增文件是无 Studio 依赖的确定性 revision exporter；本地 Studio 产品入口为 `http://127.0.0.1:8765/studio/projects?design=1`，旧预览文件名保留兼容
- 正式保存成品已优先从服务端指定 revision 导出，同 revision 字节与 SHA-256 稳定；无 revision 手工草稿仍保留明确标识的兼容导出
- 新增 `npm run test:browser` 与 GitHub Actions：3 条 Playwright 测试覆盖 Studio 首稿接受、手工 revision、局部精修、撤销、历史恢复、版本导出，以及 standalone 筛选、图表、Tab 和 390px 响应式；测试使用独立 8766 临时仓库
- 结构化项目点击保存会追加 `source: user` revision 并立即成为确定性导出来源；并发冲突保持脏状态，初始非结构化空白模板仍只保存本地草稿
- Skill ZIP 已改为规范化时间与固定顺序的可复现构建；`npm run check` 会连续打包两次并逐字节比较

- 新增 `package.json`、Phosphor 依赖和本地 Node 预览服务，默认通过 `npm start` 运行在 `127.0.0.1:8765`
- 新增中文图标别名与搜索/解析 API；图标资源经过白名单清洗后注入预览
- 分组标题支持语义自动匹配、按分组搜索覆盖和恢复自动匹配，不提供统一指定同一图标的全局入口
- 导出清理会移除图标搜索弹窗、编辑器 CSS、全部脚本和 API 逻辑，只保留已经渲染的官方内联 SVG
- 已建立 workspace v2 JSON Schema 与运行边界文档，明确纯 Skill、可选 Studio 和 standalone 导出的职责
- `npm run check` 现同时验证预览服务语法、Skill 必需资源和协议版本
- Agent 侧已接入 ECharts 6.1 SSR，提供 4 类受控图表目录和静态 SVG 渲染；依赖审计为 0 漏洞
- Dashboard 已区分自由卡片和显式卡片组：KPI 默认成组，其余示例卡按单卡跨度进入统一画布；`grouped` 已进入 layout 状态并兼容旧配置
- Dashboard 画布拖动已改为带 5px 启动阈值的指针排序；拖动卡跟随指针，同高同 `span` 占位块按 12 列网格吸附，目标中央留有防抖区；自由卡片可跨原 section 移动，KPI 作为整组节点并保存 `canvasOrder`
- KPI 组内卡片与整组的编辑入口已互斥：悬停卡片只显示单卡拖动/宽度，组左上边缘热区显示整组拖动，整组选中后内部把手全部隐藏，点击卡片可切回单卡层级
- KPI 单卡的跟手拖动只识别本 `.metric-grid` 内的兄弟卡片；组外显示禁止状态，松手不会进入 Dashboard 一级画布，跨组结构操作保留给后续明确命令
- Skill 新增版本化轻量色板 `assets/palette.v1.json` 和按需读取的 `references/color-system.md`；图表、KPI 与分组标题多色共用固定分类色，多色渐变使用相邻色板项
- 固定分类色板已升级到 `1.2.0` 的 8 色体系，按蓝、青、绿、黄绿、橙、红、洋红、紫形成连续色相环；预览器、starter、图表循环和 Agent 预览服务已同步
- 卡片标题图标已从旧组合预设改为横向“装饰样式 + 颜色”，选项与触发器均显示图标实例或真实 token 色样；局部选中任意带标题图标的非 KPI 卡后，可使用与分组标题相同的 Phosphor 搜索替换具体图标，旧 `cardTitleStyle` 状态仍可迁移
- 卡片标题已恢复独立的装饰类型：无、竖线、图标、序号；Dashboard 不提供序号，Report 的序号只统计可见卡片标题，图标样式和颜色仅在装饰选择图标时显示
- KPI 单色卡片底参考项目 9 的品牌种子浅色阶，浅色模式降为约 `4%` 弱染色，深色为 `10%`；多色卡片底使用独立 `6% / 12%` token，避免两种模式互相牵连
- KPI 图标颜色新增默认“跟随卡片”：默认/白色底使用中性色，单色底使用主题色，多色底与每张卡的分类色一致；单卡或全局手动选色仍优先
- KPI 整组设置已从独立的第二张局部面板合并进“当前分组”；选中 KPI 组时统一显示分组宽度、分组布局和指标卡样式，单卡继续使用稀疏覆盖
- KPI 与普通卡片标题图标共用同一套“装饰样式 + 颜色”选项源和横向双下拉组件；整组与单卡不再维护组合式样例卡，单卡两个维度可分别跟随整组
- 新增 `docs/ROADMAP.md`，正式确定 AI Dashboard Studio 的产品闭环、M0-M4 阶段、核心对象、架构演进和每阶段验收门槛
- 路线顺序改为 AI 首稿优先：M1 直接交付口述生成完整 workspace，M2 再补局部 AI 修改与完整手动精修；空白模板仅作备用入口
- 明确 Skill 与 Studio 分发边界：当前 GitHub `v0.2.1` ZIP 可下载但早于本轮改动，下一版需使用显式包清单和解包契约检查后再发布
- 新增 `dashboard-generation.schema.json` 与生成协议，统一 `Prompt -> Plan -> Workspace -> Command Batch`，并约束数据来源、局部修改和失败回滚
- 新增 `package.manifest.json` 与 `npm run build:skill`：只打包显式文件，解包后要求文件完全一致并复跑包内契约检查；构建不自动发布
- 新增 workspace-core 与 12 项 Node 回归，覆盖迁移、原子命令、来源一致性、修复上限、三类口述首稿和 revision 生命周期
- Studio 顶部增加 AI 首稿输入栏；候选通过校验后临时预览，取消完整恢复，接受调用 commit 接口并继续使用现有编辑与导出
- 多色按当前可见项分配，隐藏分组标题不再占色位；契约检查会阻止色板、starter 和探索预览之间的色值漂移
- 产品与 Skill 已定义完整模式、通用 Agent 模式和便携降级模式；图标/图表资源只参与生成，默认成品固化内联 SVG
- 无可信图标资源时回退纯文字，无成熟图表引擎时回退表格/排行/进度/KPI；对应验收用例已加入测试参考
- 标准生成流水线已实现 Intake、Normalize、Plan、Generate、Validate、单次 Repair、Isolated Preview、Review 与 Commit Revision；provider 只产候选，平台负责校验和提交
- 本地 HTTP API 已纳入自动回归，覆盖首稿、提交、防篡改、坏 JSON 和资源不存在的状态码语义
- 修复生成文档在切换语言或视觉设置后被静态示例文案覆盖的问题；生成内容现在始终作为视觉精修后的最终文案来源
- 修复摘要卡保存后丢失 layout item 引用的问题；已接受首稿可保存、刷新、再次生成并取消恢复
- 浏览器已验证生成、接受、手动调整、保存重载、连续生成与取消回退；真实导出文件包含生成标题和示例数据标记，并排除设计器、AI 输入栏、脚本、API 与布局把手
- 成品导出新增浏览器注入 UI 清理，避免 Codex 评论侧栏根节点进入 standalone HTML
- AI 首稿入口从画布顶部移到左下角悬浮工作台；桌面展开为浮层、移动端展开为底部面板，折叠不清空输入、生成状态或待确认预览
- 新增生成服务健康检查和状态圆点；旧服务、断连或 404 不再暴露 `ENOENT` 路径，统一提示运行 `npm start` 后重试
- `8765` 旧进程已替换为当前预览服务；生成 health、draft、折叠保留、移动端层级、故障提示和恢复重试均已通过真实浏览器验证
- AI 工作台增加销售经营、产品运营、项目交付和复盘报告四类需求模板；模板点击后只回填多行输入框，用户可继续修改，不会直接提交生成
- 示例数据来源标记收敛到头部信息条的单一“数据来源：示例数据”，不再占据标题上方或重复出现在分区标题旁
- 所有局部继承下拉项显示当前解析值，例如“跟随全局（标题下方）”或“跟随整组（右上）”，并随全局/整组设置实时同步
- Dashboard 的“标准看板”已固化为页面类型专属默认：橙色 `#ff7a2f`、透明极简头部、10px 卡片圆角、16px 卡片标题、无副标题、无边框、轻阴影、单色图表和标准间距；Report 的“品牌报告”继续使用共享基础预设，不受这些覆盖影响
- 色彩架构已确定为“色相固定、色阶动态”：固定 8 色承担 BI/KPI 数据身份，语义色保持独立；浅底、交互态、边框和图标容器可通过版本化 OKLCH 算法生成同色相 UI 色阶
- 修复 Report 分组无法向上移动：Report 现在忽略 Dashboard 连续画布残留的内联 `order`，视觉顺序、DOM 顺序、上下移动按钮与保存顺序重新一致；Dashboard 画布顺序不受影响
- 修复 Report KPI 卡片强制 `border: 0` 覆盖全局卡片规则的问题；KPI 现与普通卡片共同继承全局边框、圆角和阴影，专属配置只处理 KPI 内容、图标与底色
- 布局设置按实际职责重命名：`组内间距`改为`卡片间距`，`组间距`改为`内容密度`；底层 `cardGap / spacing` 保持兼容，尚未提供独立 `sectionGap`

- 已保留内容自由的 dashboard 布局原语，不引入固定业务模块
- 已增加 `references/themes.md`，定义主题、头部和分组标题的职责边界
- 已扩展 starter 的标题层级 token、品牌槽位、头部元信息/操作槽位和 section marker 槽位
- 已新增 `references/page-types.md`，定义 Dashboard / Report 的路由和独立性边界
- 已在探索预览加入页面类型控制，并验证切换时数据和视觉 token 不变
- 已增加布局编辑层和可序列化配置；卡片直接拖动换位、悬停尺寸把手和分组列数已接入
- 已验证主题与布局修改可在刷新后恢复，并可导出无工具栏、无编辑控件、无脚本的独立 HTML
- 当前配置由用户点击软盘按钮保存到浏览器本地，不再自动写入，也不再提供工程 HTML 导出入口
- 已增加卡片间距视觉设置，独立于内容间距，并随浏览器本地状态一起保存
- 已增加页面宽度、分组标题显隐和卡片标题字号配置；Dashboard 自动使用全宽卡片层级，Report 自动使用阅读型章节层级
- 已增加 Dashboard 连续画布、自动极简头部、页面底色和头部显隐配置；同底色卡片在无阴影/线框时自动保留极浅边界
- 已恢复 Report 独有的整页外壳；Dashboard 仍无外层边界，两种页面类型不再共用外壳表现
- Report 最外层整页框调整为响应式最大 `1000px`；框内头部与正文自动撑满，不再叠加内容宽度限制
- 头部对齐增加 `auto`：Dashboard 默认居左、Report 默认居中，并兼容迁移旧的本地保存状态
- 卡片级浮动工具条已移除；编辑模式改为直接拖动卡片换位、悬停显示边缘尺寸把手，尺寸吸附到 12 列栅格档位
- 工具栏说明改为用户语言；圆箭头改为跨刷新保留的一步撤销，恢复上一版完整主题、布局和 Logo，不再清空到 HTML 初始默认
- 卡片设置增加普通标题图标属性，默认无图标，可选线型、浅色底和实色底；使用内联 SVG 且不影响 KPI 图标
- 视觉设置工具改为黑白中性色右侧栏；`1480px` 以上推开画布，其余宽度右侧覆盖，移除底部弹出模式
- 视觉设置侧栏头部已压缩为单行；分组标题使用总开关并收起关闭后的子项，头部隐藏和自定义底色也会同步隐藏无关配置
- 顶部软盘按钮只保存浏览器本地配置，不产生文件；有更改时按钮高亮，点击后才写入。下载按钮只输出无编辑工具的成品 HTML，旧工程 HTML 仍可读取兼容
- 恢复配置时优先读取 URL 保存快照，其次读取本地手动保存结果；旧工程 HTML 的内嵌配置只在前两者均不存在时使用
- 手动保存还会把不含 Logo 位图的主题与布局状态写入当前地址 `state` 查询参数；恢复顺序为 URL、本地存储、旧工程内嵌配置，保存与下载使用图标按钮和悬浮提示
- 点击保存后页面会通过 `location.replace` 正式加载带配置的新地址；之后刷新恢复该快照，未保存修改刷新后丢弃
- 主题色已拆为 seed、结构色、浅底、两类对比前景、弱结构线和图表色；分组线、摘要、卡片/KPI 图标与图表已映射，语义状态色保持独立
- 主题 seed 同时轻量派生外部画布、页面、卡片和 muted surface；Report 使用三层背景，Dashboard 使用连续页面与卡片两层，对比度基于最终卡片色计算
- 图表 `chartPalette` 支持 `monochrome / bichrome / categorical`：三者共用产品固定 8 色分类色板，单色按主题色相取最近一色，双色取最近两色；旧自动/状态配置迁移为单色
- 卡片标题与 KPI 图标使用独立 `icon-accent / icon-soft / icon-on-solid`，不再直接使用高饱和主题原色
- 设计模式支持点击选中具体卡片；图表、KPI、普通卡按类型显示上下文设置，单卡 override 随保存恢复并固化到导出 HTML，选中态不导出
- 侧栏使用全局/局部 Tab 分离设置范围；默认全局，点击卡片自动切至局部，局部无选择时仅显示引导文案
- 局部字段按当前真实 DOM 可见性过滤：Report 摘要卡使用外部分组标题时不再显示无效的标题图标配置
- 视觉预设按 `pageType` 显示不同名称与候选项，底层 token 继续复用；切换 Dashboard / Report 不会自动选择其他预设
- Dashboard 在分组标题隐藏时可通过整组左上角的悬停把手调整组顺序；把手属于编辑器 UI，不进入导出文件
- KPI 支持全局和单卡 `stacked / horizontal` 排列；`filled` 使用内联 mask 实心图标，不依赖外部资源，也不添加图标底色
- 卡片阴影使用 `none / weak / medium / strong` 四档，界面显示无/轻/中/重；starter 与预览工具已同步深浅模式 token
- 标题图标形态与 `neutral / accent` 配色已拆分，默认中性色；全局无图标时隐藏配色，单卡覆盖继续使用稀疏继承
- 设计模式悬停整组显示“拖动整组”，悬停单卡显示“拖动卡片”；两类提示和调整宽度把手均不会进入导出 HTML
- 主题强调色采用原色优先；原色不满足 `3:1 / 4.5:1` 时才按同色相调整明度
- 预览报告新增“客户健康与风险”组，两张 mock 卡片已纳入布局编辑、保存、导出和中英文切换
- “拖动整组”把手 hover/drag 时使用 `layout-group-active` 高亮整个 section，并暂时隐藏内部单卡选中框；状态不导出
- 卡片 hover 时按其当前位置动态对齐整组把手，“拖动整组 / 拖动卡片”在卡片左上方并排显示
- 每张布局卡片现创建左右两个 `layout-resize-handle`，向外增大、向内减小，仍吸附 `3/4/6/8/9/12` 跨度
- 页面底色和自定义色已合并为一个紧凑控件；新增页面纹理 `none / dots / grid / lines`，纹理只进入画布、不进入卡片，并随保存与导出保留
- 大面积背景的主题染色已收敛：浅色外层/页面/卡片约 `2% / 1% / 0–0.5%`，深色约 `2% / 3% / 4%`
- 页面文字与卡片文字已拆分；自定义页面底色会按最终色值自动选择深色或浅色页面文字并校验 `4.5:1`，卡片文字继续按 surface 独立处理
- 页面底色已移除“与卡片同色”选项；历史 `surface` 状态在应用时自动迁移为 `auto`

## 风险与待确认

- AI 首稿流式画布长目标已完成并验收：Job 创建后关闭项目中心，画布浮条提供运行/停止/接受/放弃和刷新恢复；Generation Job 以可恢复 SSE 事件替代 250ms 轮询；Provider 使用默认 120 秒首包、60 秒流空闲和 5 分钟整体时长；完整 Workspace 校验后按分区渐进呈现。确定性浏览器捕获到 1/4 分区显示、3/4 待呈现及最终 4/4 完整状态，桌面与窄屏无新增横向溢出；完整 `npm run check` 为 189 passed / 6 PostgreSQL skips，Generation eval 10/10。
- 当前真实 `gpt-5.6-sol` 连接可持续运行并越过旧 45 秒限制，但一次复杂首稿在 5 分钟整体上限内未产出可用终态；应用会停止并保持原画布。该模型/网关的生成质量与时延仍需单独调优，不应继续放宽产品级硬上限。

- Studio Provider 已支持停用连接并回退本地演示；重新开启前会真实校验连接。测试会先验证模型列表，再验证最小聊天请求，并区分模型不存在与 Key/权限失败；错误响应不包含密钥或上游正文
- Provider 编辑现会回显已保存的 API 地址，并在任一表单字段变化后显示“有未保存修改”；API Key 仍只保存在服务端且永不回显。服务层回归覆盖地址跨读取持久化与密钥隔离
- Provider 第一版已切换为个人设置语义：本地 `local-admin` 保留旧连接作用域，正式用户按自身用户 ID 隔离 AI 连接；项目中心隐藏组织读取，入口显示“我的 AI 设置”。正式登录页仍沿用现有 token 会话，后续可单独产品化视觉

- 受控 REST 和持久化 Refresh Job 已落地：服务端主机白名单、credentialRef、禁重定向、指数退避、活跃任务冲突和重启恢复均有合同测试
- 当前凭证通过环境 JSON 注入，适合单机原型；企业阶段需接 Secret Manager/KMS、凭证轮换、网络出口策略和审计，不能把环境 JSON 当最终凭证平台
- Job 当前只处理 REST Dataset 刷新；固定间隔计划、取消和管理面板已完成，优先级、并发配额和分布式执行留到企业阶段
- Uploaded Dataset 已支持 last-known-good 手工刷新、失败保留与重试；Semantic Query 使用指纹/语义版本缓存，Publication 详情可检测刷新后的 stale 状态
- 上传型 Dataset 仍由用户重新上传；REST 已支持服务端连接、固定间隔调度、退避重试和任务监控，数据库连接器与正式凭证仓库尚未实现
- Semantic Query 和 Publication 最小闭环已落地：非便携数据首稿固化受控聚合值，发布对象固定 revision、artifact SHA、Dataset 指纹和查询快照
- Publication 已有单机共享路由、unlisted 哈希令牌、public/private 执行与访问事件；尚无用户身份或 RBAC，不得把单机管理 API 宣称为企业级权限
- 下一步应实现 Dataset refresh 状态机、失败重试和快照过期检测，再做发布管理 UI 与重新发布流程
- CSV/JSON/Excel、字段画像和 Semantic Model 已形成同一条数据导入链；Excel 多工作表可切换，公式只读取工作簿缓存值，不在平台执行
- 内置浏览器已完成桌面和 390px 设置面板视觉检查，无横向溢出；其自动文件选择事件未触发，真实上传由 Playwright CSV/Excel 流程覆盖
- 下一阶段应实现非 portable 数据的服务端查询/发布快照；当前这类 Dataset 仍不能在 standalone 中继续动态查询
- 需要用真实模型 provider 验证 Dashboard / Report 与各视觉预设、深浅模式组合时是否保持边界稳定
- Dashboard 指针拖动需用真实悬停把手再做一次主观手感确认；当前浏览器自动化不会触发仅 hover 显示的把手
- 独立 `file://` 自动渲染检查受浏览器安全策略限制；导出文件已完成结构检查
- 系统 `showSaveFilePicker` 的窗口交互仍需人工浏览器回归；导出文件结构与真实落盘内容已检查
- AI 工作台是 Studio 浮层并由导出器完整移除，不属于 Dashboard 成品布局
- 版本历史已可浏览和恢复，但仓储仍在浏览器本地；撤销与历史恢复遇到后续手动编辑时都会主动阻止覆盖

## 下一步

1. 继续把项目中心的静态按钮、输入框、Tab 与弹窗逐步接入 Studio UI 原语，保持现有业务 ID、事件和主题 token 不变
2. 在有效服务端密钥环境执行真实模型首稿、局部精修、一次 repair、延迟和成本 smoke test
3. 在 PostgreSQL 共享仓储、Session 与 Refresh 租约之上补组织管理入口、集中不可篡改审计 sink 和共享 Query Cache 策略
4. 增加数据库 migration 发布/回滚演练与多进程故障注入，并最终移除无 revision DOM 兼容导出

## 相关文件

| 文件 | 关系 |
|------|------|
| `PROJECT.md` | 项目全局状态（本文件只记当前轮次） |
| `docs/ROADMAP.md` | 产品平台阶段、范围和验收门槛 |
| `AGENTS.md` | AI 行为规则 |
## 2026-08-13 图表能力扩展

- 已将柱图扩展为基础柱图、分组柱图、堆叠柱图、百分比堆叠柱图，并新增直方图。
- 唯一语义与数据形状见 `.agents/skills/dashboard-html/references/charts.md`。
- 多系列 workspace 使用 `props.series: [{ name, values }]`；直方图使用首个系列的原始样本自动分箱。
- 条图家族和甘特图已接入同一协议：甘特图使用“开始 + 工期”两系列，排名图由渲染端降序并显示名次；当前目录共 15 种图表。
- 线图/饼图家族新增时序图、实心饼图和玫瑰图；`pie` 保持环图兼容，当前受控目录共 18 种图表。
## 2026-08-13 资源中心长目标

- M1 已实现 `/studio/resources` 独立资源页，包含图表和规范双 Tab，图表数量由 `/api/charts/catalog` 动态决定并调用 `/api/charts/render` 生成真实预览。
- 视觉设置标题旁已增加资源中心入口；M2 计划通过受控 Workspace 修改将资源应用到当前画布，不直接跨页操作 DOM。
- 完整阶段与验收见 `docs/architecture/resource-center.md`。

## 2026-08-13 图表筛选与图例交互

- 图表标题下拉已复用 `filter-bar` 协议，`placement.kind = component-header` 控制位置，`targets` 继续控制数据联动范围。
- 多系列图表图例已改为真实 DOM 按钮，状态保存在 `interactions.chartSeriesVisibility`，Studio 与 standalone 均支持点击显隐。
- 用户可直接说：“这个图表右上角加区域筛选，只控制当前图表”或“显示图例，点击可隐藏对应数据”。
