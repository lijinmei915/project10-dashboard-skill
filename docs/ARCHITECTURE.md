---
layer: knowledge
type: spec
last_verified: 2026-08-22
depends_on: [PROJECT.md, docs/SKILL_ENGINEERING.md]
---

# 架构说明

> 用途：说明仓库的主要模块、目录职责和信息流。
> 什么时候更新：目录结构、模块边界、核心依赖关系变化时。
> 不要写什么：交接流水、产品路线、一次性任务安排。

## 当前结构

- 根目录文档层：`README.md`、`AGENTS.md`、`PRODUCT.md`、`PROJECT.md`、`HANDOFF.md`
- 治理文档层：`docs/`
- Skill 执行层：`.agents/skills/dashboard-html/`
- Agent 预览运行层：`package.json` 与 `.agents/skills/dashboard-html/scripts/preview-server.mjs`
- Studio 前端层：`studio/` 保存只属于产品工作台的模块，不进入 Skill 或 standalone

## dashboard-html skill 结构

- `SKILL.md`
  定义 skill 的触发时机、边界和工作流
- `agents/openai.yaml`
  提供平台侧展示与描述信息
- `assets/templates/starter.html`
  提供默认 dashboard HTML 起始骨架
- `assets/palette.v1.json`
  提供图表、KPI、分组标题共用的轻量固定色板；完整规则按需读取 `references/color-system.md`
- `references/*.md`
  提供布局规则、输出约束、测试方式和测试样例
- `data/icon-aliases.zh.json`
  提供 Agent 侧的中文图标搜索别名
- `data/component-registry.json`
  定义 AI 可生成的组件类型、页面控件、必填内容属性、数据绑定和无资源降级类型；Provider、能力 API 与便携 Skill 共用该目录，契约检查负责阻止 Schema 和运行时类型漂移
- `scripts/preview-server.mjs`
  托管探索预览，提供统一组件能力目录，按需搜索与清洗 Phosphor SVG，并根据卡片实际宽度和深浅模式通过 ECharts SSR 渲染受控图表 SVG
- `schemas/dashboard-workspace.schema.json`
  定义 Skill、Studio 和导出器共享的版本化状态协议；`document` 保存内容，图表以可选 `props.chartType` 保存受控类型，`layout` 只引用稳定 ID
- `schemas/dashboard-generation.schema.json` 与 `references/generation-protocol.md`
  定义自然语言请求进入确定性渲染前的 `Prompt -> Plan -> Workspace -> Command Batch` 受控交换协议
- `package.manifest.json` 与 `scripts/build-package.mjs`
  显式列出便携 Skill 文件，构建 ZIP 后解包并运行同一份契约检查；Studio 服务和重型依赖不进入包
- `scripts/workspace-core.mjs`、`generation-pipeline.mjs` 与 `draft-generator.mjs`
  分别负责迁移/校验/原子命令/字段差异/反向命令、标准生成状态机与隔离预览，以及可替换 provider 的本地确定性首稿和组件级精修实现；稳定 ID 数组的增删和重排会生成精确 `insert / remove / move` 反向命令
- `scripts/project-store.mjs`
  保存不可变 revision、父子关系、正向/反向命令和摘要；提供历史摘要、最新结果撤销与指定版本恢复，二者都以新 revision 留痕并执行漂移检查
- `studio/ai-composer-center.mjs`
  在 AI 工作台编排生成、精修、撤销、历史恢复和只读版本比较；比较仅从 bridge 提供的已加载 revision/workspace 快照调用共享 `workspace-core` 差异函数，限制 12 项展示，不发起恢复请求或变更当前 Project
- `studio/workspace-core-client.mjs`
  是 Studio 对 portable `workspace-core` 的唯一浏览器适配入口；当前透明复用迁移、校验和差异函数，后续正式 Studio Web 可在此替换打包来源而不让业务模块直接依赖 Skill 目录
- `studio/workspace-structure-synchronizer.mjs`
  将版本化 Workspace 的 Section 与 Component 结构投影到 Studio DOM；按模型顺序创建、复用、移动和移除分区及卡片，Editor Runtime 只注入具体 DOM 工厂、编辑工具绑定和卡片模板，不另存结构真相
- `scripts/project-access-service.mjs`
  在全局 viewer/editor/admin 之上执行 Project owner/editor/viewer 资源授权；项目列表、版本、导出和 Publication 管理共用该边界，不进入便携 Skill 包
- `scripts/project-management-service.mjs`
  负责 Project 名称、active/archived 生命周期和“仅复制当前 revision”的独立副本语义；元数据写入使用 `expectedUpdatedAt`，归档项目禁止产生新 revision
- `scripts/studio-audit-repository.mjs`
  以稳定事件 ID 幂等追加 Project 管理事件；API 查询先按 organizationId 再按 Project ACL 过滤，仓库属于 Studio，不进入便携 Skill
- `scripts/studio-audit-integrity.mjs`
  为集中 PostgreSQL sink 提供 canonical JSON、每组织 hash chain 和可选 HMAC seal；验证器只返回组织级完整性摘要，不把链内部列或密钥暴露给浏览器
- `scripts/studio-audit-outbox.mjs`
  扫描 Project 原子快照内的 `_outbox`，按稳定事件 ID 投递 Audit 后确认删除；服务启动、Project 写入后和审计查询前都会尝试恢复投递。Project Repository 对外读取始终剥离内部 outbox，不进入 API、revision、导出或便携 Skill
- `scripts/studio-audit-anchor-dispatcher.mjs` 与 `audit-anchor-sink.mjs`
  PostgreSQL Audit Sink 在内部 chain commit 同事务创建稳定、最小化的 chain-head anchor outbox；dispatcher 只向显式 HTTPS sink 投递 payload，失败分类与不透明 receipt reference 独立保存，不回写业务或 audit body。环境装配只接受服务端 bearer secret，具体 WORM/ledger 留存由部署方负责
- `scripts/studio-json-file-store.mjs`
  提供 Studio-only JSON 文件原语：安全 ID 到文件、确定性列表、`0600` 独占创建、临时文件清理和同目录原子替换；Job、Schedule、Dataset 与 Publication 仓库在其上保留各自的串行更新、乐观并发和领域冲突语义，不进入便携 Skill
- `scripts/studio-storage-runtime.mjs`
  定义 Project、Dataset、Publication、访问事件、Job、Schedule 与 Audit 七个仓储端口，服务组合时同步校验方法契约，readiness 通过只读探针报告 provider 与部署能力。文件适配器明确声明 `shared=false / multiInstance=false / productionReady=false`，共享适配器必须显式声明全部能力并通过同一 conformance suite
- `scripts/studio-postgres-storage.mjs`
  在 PostgreSQL 的 `JSONB` 实体表、独立 Audit、Audit Anchor Outbox、Publication Access Event 和 Auth Session 表上实现七个业务仓储端口及共享会话；Project 条件写使用事务级 advisory lock 与行锁，业务状态和 outbox 同事务提交，Audit 以稳定事件 ID 幂等消费。模块属于 Studio 部署层，不进入 Skill 包
- `scripts/studio-auth-service.mjs` 与 `studio-session-repository.mjs`
  Auth Service 负责受控身份目录、token 校验、Cookie/CSRF 和角色上限；Session Repository 只保存随机 Cookie 值的 SHA-256 摘要、actor/organization 引用与过期时间，并提供按 actor/organization 撤销。默认内存实现适合本地单实例，PostgreSQL 实现支持跨实例读取、撤销和过期清理
- `scripts/studio-organization-session-revocation-outbox.mjs`
  将组织成员暂停/移除产生的持久化 session-revocation intent 交给 Auth Service 按 actor/organization 清理 session；投递失败保留 intent 并可在服务重启或后续成员更新时重试。该 outbox 独立于组织审计 outbox，不把 session 事件伪装成 Audit Event
- `scripts/studio-external-identity-repository.mjs`、`studio-postgres-storage.mjs` 与 `oidc-login-transaction-store.mjs`
  为 OIDC 提供 Studio-only 基础：External Identity 以不可变 `providerId / issuer / subject` 映射受控 actor 与组织，不保存 email、token 或 assertion；file 为本地持久化实现，PostgreSQL 通过共享实体表、事务级 advisory lock 和行锁实现多实例一致映射。Login Transaction 在服务端内存中保存短期、单次的 state hash、PKCE verifier、nonce 与允许的相对回跳路径。两者只由 Provider Service 使用，不直接暴露 repository 或事务 API
- `scripts/oidc-provider-service.mjs` 与 `organization-service.mjs`
  OIDC provider 配置、PKCE `S256` 授权 URL、授权码交换、已验证 ID token claims 与 External Identity/成员解析；组织管理员可创建绑定目标 issuer/subject 的限时邀请，匿名入口仅用一次性 secret 建立 OIDC transaction，回调验证身份后再绑定 identity、激活动态成员并记录组织审计。交换和验签必须注入实现，服务本身拒绝未验证 claims；邮件投递、SCIM 与跨仓库原子提交不在本实现范围
- `scripts/oidc-token-verifier.mjs`
  提供服务端 Authorization Code exchange 与 `RS256` JWK 验签：JWK 仅 HTTPS 获取且按 `kid` 缓存/刷新，验证签名、issuer、audience、nonce、expiry、not-before、issued-at 和多 audience 的 `azp`。它不接受 JWT payload 解析降级，也不保存 access token；仅在显式注入 Provider Service 时使用
- `scripts/provider-gateway.mjs`
  在 Studio 服务端统一确定性、OpenAI Responses 与 OpenAI-compatible Chat Completions provider；支持 Dashboard 原生多档案和 OmniDesk 公开档案迁移格式。组织管理员可通过脱敏 API 查看档案、切换当前连接、发现模型和测试连接，动态代理让后续 Generation Job 立即使用新档案。它负责当前档案解析、Data Context 补全、结构化输出请求、候选归一化、一次修复、超时和上游错误映射，不读取其他产品的 secret 文件，也不负责提交 revision
- `scripts/provider-profile-service.mjs`
  为每个组织持久化独立 Provider 档案、当前连接和凭证；公开档案与密钥写入不同的 `0600` JSON 存储，列表/API 只返回名称、模型、启用状态和凭证是否存在。Generation Job 将固化的 organizationId 传给动态 Provider 解析，避免跨组织串用模型或密钥。file 实现只适合单实例，生产需替换为共享 Profile Repository 与 Secret Manager
- `scripts/generation-job-service.mjs`
  为 draft/refine 提供持久化 queued/running/succeeded/failed/canceled 生命周期；任务按组织与发起人隔离，以租约、heartbeat 和 fencing 防止多 worker 重复执行，并把取消信号传给 Provider。重启时等待未过期旧租约，过期后才重新入队接管。完整候选校验通过后持久化不含业务内容的逐分区 `section.ready` 和 `preview.ready`，公开摘要只提供完成数/总数；持久记录不保存 DataContext 或 Dataset records，成功结果仍只是隔离 preview，不直接提交 revision
- `scripts/interaction-runtime.mjs`
  负责页面级筛选栏与视图 Tab 的主题化 HTML、最小 Controller 和可序列化交互状态；不依赖 Studio 或组件库
- `scripts/data-runtime.mjs`
  负责在结构化 dataset 上执行筛选、聚合、分组、表格列映射和排行，向 KPI、图表、表格与列表返回确定性 props
- `scripts/data-source-service.mjs`、`semantic-query-cache.mjs` 与 `studio-data-source-repository.mjs`
  负责 CSV/JSON/Excel 的受限解析、多工作表选择、字段 ID 规范化、类型推断、质量画像、字段修正、版本化 Semantic Model、受控 Data Context 和服务端持久化；仓库复用 Studio JSON 原子替换并保留 `expectedUpdatedAt` 乐观并发。portable 数据可将授权 records 与 binding 写入 workspace；non-portable 数据只向生成链提供有界 DataContext，并在 workspace 固化 Query Snapshot 派生值，不写入 Dataset records 或客户端 binding
- `scripts/revision-exporter.mjs`
  从指定不可变 Project revision 确定性生成 standalone HTML、内联 SVG、最小便携交互和 SHA-256；不读取编辑器 DOM
- `references/runtime.md`
  定义纯 Skill 降级、Studio 增强和静态/交互导出边界

## 信息流

1. 使用者通过自然语言触发 `dashboard-html`
2. 数据源服务先将上传数据解析为服务端 Dataset，并以原始规范化值支持可逆类型修正；用户确认维度、指标、聚合、格式和时间粒度后形成版本化 Semantic Model。Provider Gateway 只接收字段摘要、语义模型和最多 12 行受控样本，再由确定性或远程 provider 生成候选
3. 校验通过后，平台在克隆 workspace 上应用 command batch，计算字段和结构差异并进入隔离预览；组件级请求只能修改声明作用域内的受控字段或关联结构，不得替换根 workspace
4. 复制、新增、删除、调宽和排序会原子更新 `document / layout / canvasOrder` 及必要关联状态；预览协调层依据 workspace 创建、移除和重排真实卡片 DOM，并为新节点绑定同一套编辑交互
5. 用户接受 AI 候选或显式保存手工修改后，Project store 写入 workspace 快照和父 revision；AI revision 额外保存正向/反向命令。取消不产生 revision，撤销或指定版本恢复都追加新 revision，并执行 current revision 与 workspace 漂移检查
6. Skill 从指定 revision 的 workspace 确定性组织输出；`document.controls` 在内容区之前渲染，`interactions` 保存筛选值和当前视图，`data-runtime` 依据组件 binding 重算展示数据，图表由 `props.chartType` 决定受控表达
7. 参考 `references/` 里的布局、输出和测试规则约束结果
8. 编辑分组标题图标时，预览页向本地 Agent API 查询 Phosphor 全量资源
9. 页面状态只记录各分组最终选择的图标名，预览 DOM 按需注入对应 SVG
10. 导出时移除设计器、搜索弹窗、历史面板和 Agent API 依赖；静态成品只保留结果，交互成品只内嵌标记 `portable: true` 的数据集、最小 Controller 与便携 SVG 图表更新器
11. 最终交付可离线使用的 standalone HTML 页面；不可嵌入的数据保留当前静态结果并移除无效筛选栏

## Studio 前端边界

- `.dashboard-preset-preview.html` 只承载页面结构、视觉样式和 Studio 模块装配，不再包含内联应用脚本。
- `studio/auth-session-controller.mjs` 负责 `disabled / password / token / oidc` 四种前端认证状态投影：本地模式直接放行；个人模式处理注册、登录、错误分类、限流提示、服务重试和会话恢复；旧 token 模式只显示迁移提示。控制器不保存凭证，登录成功通过 `dashboard-auth-ready` 重新激活当前路由，使 `/studio/projects/:id` 深链不因门禁丢失。
- `studio/editor-runtime.js` 是 workspace editor/orchestrator 的 ESM 入口；State Core、Session、Renderers 和 Chart Adapter 分别处理状态协议、介质和渲染。所有浏览器侧 core 调用先经过 `workspace-core-client.mjs`，避免业务模块直接耦合 Skill 路径。布局层由纯规则 `workspace-layout-interaction.mjs` 与 DOM 配置映射 `workspace-layout-controller.mjs` 组成；`workspace-structure-synchronizer.mjs` 依据已验证 Document/Layout 计算并应用卡片创建、删除、跨分区移动、顺序、跨度和类型。Editor Runtime 只保留模板克隆、编辑器绑定、指针监听、占位和动画适配。
- `studio/project-center.mjs` 独立负责项目列表、切换、显式重新加载、AI-first 新项目和个人 AI 设置入口，以及相关 API 调用。退出登录位于项目中心标题栏，不占用主画布；当前个人产品面不展示成员、归档和审计入口。新项目只断开当前 Project/revision 身份并打开 AI 工作台，首次接受候选才创建服务端 Project；旧 revision 条件写冲突后，重新加载须由用户确认才恢复服务端最新版本。
- `studio/publication-center.mjs` 独立负责发布、分享、嵌入、多格式下载、访问统计和撤回；只从 bridge 获取已保存的 projectId/revisionId，不读取编辑 DOM。
- `studio/data-source-center.mjs` 独立负责 CSV/JSON/Excel 导入、REST 连接、Semantic Model、刷新任务和调度 UI；只通过 bridge 读写 clone 后的当前 Dataset，不修改 workspace。
- `studio/studio-api-client.mjs` 是无状态 HTTP 边界，统一 JSON 解析、标准错误载体和 `GET/POST/PUT/PATCH` 请求构造；模块不持有身份、凭证或界面状态，领域模块可按需注入错误文案策略。
- `studio/ai-composer-center.mjs` 独立负责 AI 工作台、health、受控组件/图表目录、候选请求、Section/Component 局部作用域、隔离预览状态、Review、commit、undo、版本历史和恢复编排；编辑器内核不持有 pending run，只通过冻结 bridge 提供 clone context 和受控 workspace/Project 应用方法。目录不可用时保留静态受控模板，不阻断局部编辑。
- `studio/export-center.mjs` 独立负责 revision artifact 请求、旧项目迁移、HTML 文件保存、下载状态和 `DashboardFileExporter` 公共接口；导出前通过共享 `prepareRevision` 自动固化有效 workspace 的未保存修改，不读取或序列化编辑器 DOM。
- Project Center 不读取编辑器局部变量；编辑器只暴露冻结的 `DashboardStudioBridge`，包含当前 Project、actor role、dirty 状态、应用 Project snapshot 和同步当前 Project 元数据。
- revision exporter 从不可变 workspace 独立生成 standalone，Export Center 只编排版本准备、获取与保存；空白视觉模板必须先生成有效 workspace，不能绕过协议导出当前 DOM。
- AI Composer 通过 clone 后的 `{ kind: section|component, id }` target、Dataset、Project、Revision 和 workspace context 发起事务；Section 命令可改标题/副标题、前后移动和增删分区，Component 命令继续处理卡片内容/结构/布局。编辑器 bridge 分别提供 preview、commit、undo、restore 四个受控应用方法，不开放通用命令、DOM selector 或任意 patch。
- 本地草稿、Project 打开、AI preview、undo 和 history restore 最终都进入同一个 `normalizeWorkspaceSnapshot -> migrateWorkspace -> validateWorkspace` 恢复入口；非法快照在任何主题或 DOM 写入前原子拒绝。

AI 首稿的完整阶段、状态机、provider 与 revision 边界见 `docs/architecture/generation-pipeline.md`。`Prompt -> Plan -> Workspace -> Command Batch` 是其中的生成内核，不代表完整产品流程。

## 生成能力分层

```txt
真实数据与用户意图
  -> 完整模式：Agent/Studio 的 Phosphor + ECharts SSR
  -> 通用模式：宿主 Agent 的图标、图表或包管理能力
  -> 降级模式：纯文字图标位 + 表格/排行/KPI 数据表达
  -> 统一固化为 standalone HTML
```

- 图标库和图表库是生成期依赖，不是默认成品依赖。
- 完整模式和通用模式都把最终选中的 SVG 内联到 HTML；默认导出后不再需要原始库。
- 降级模式保留数据与语义完整性。缺少图标时不保留空容器，缺少图表引擎时不保留空 canvas。
- 交互图表属于显式增强交付，按实际功能加入最小运行时，不改变静态导出的默认边界。

## 当前边界

- Node 运行时只服务于 Agent 的编辑和预览能力，不进入生成的 dashboard 成品
- `@phosphor-icons/core` 是 Agent 侧资源依赖；成品不打包图标库，也不依赖网络或搜索 API
- `echarts` 只在 Agent/Studio 服务端执行；默认成品固化 SVG，不加载 ECharts 运行时；筛选交互所需的重新绘制由内联最小 SVG 更新器完成
- 预览仍为单文件 HTML，没有前端构建步骤
- Studio 默认通过 Generation Job API 创建、轮询、取消和恢复 draft/refine；同步 `draft / refine` 仅保留兼容。`commit / undo / history / restore` 继续处理不可变版本事务；provider 和任务 worker 都不直接写 Project store
- Generation Job 与 Refresh Job 共用受类型隔离的 Job Repository，但独立执行协议；生成 worker 在执行时重建 DataContext，只持久化 request、基线 workspace、状态、租约、安全阶段事件和最终 run。SSE 首帧返回权威 `job.snapshot`、每 10 秒发送 heartbeat，并从 `Last-Event-ID` 后续传；断线期间客户端用低频 HTTP 摘要兜底。PostgreSQL 双连接池 conformance 验证竞争租约、过期恢复和跨实例取消 fencing，数据库不保存 DataContext、Dataset records 或连接凭证
- Generation Job 终态额外保存不含内容的 queue/execution/total 毫秒数与 repairAttempts；组织管理员指标 API 在组织边界内聚合成功率、失败码和延迟分位数。指标不返回任务/用户身份、prompt、workspace、候选或错误正文，当前复用 Job Repository 而非独立长期 telemetry warehouse
- 组织设置将上述聚合投影为只读“AI 运行概览”，展示近 24 小时候选可用率、生成成功率、修复率、已评审数、p50/p95 和失败分类；加载失败与成员编辑隔离，viewer 不显示入口且服务端仍返回 `403`。该治理视图不属于 Dashboard workspace、standalone 或 Skill
- 组织设置将既有平台 readiness 投影为只读“平台运行状态”，显示脱敏的存储、身份、身份映射、执行、审计锚定和数据权限摘要。状态读取失败只影响该网格，不影响成员编辑；该视图不新增浏览器配置权，也不进入 Dashboard workspace、standalone 或 Skill
- Generation Feedback 将技术成功与用户保留行为分离：只有任务发起人能对 succeeded Job 一次写入 accepted/dismissed，接受可引用 revision，放弃只接受受控原因码。Composer 在提交或取消后 best-effort 上报，失败不改变 workspace/revision；组织概览聚合候选可用率和已评审数，不暴露个体反馈
- Data Source API 提供 CSV/JSON/Excel 导入、Excel 工作表选择、列表、字段画像和受限预览；Excel 公式不在平台执行，只消费工作簿保存的缓存值。只有用户明确选择 `portable: true` 时，最多 500 行副本可进入 workspace/revision/standalone
- Dataset 物理字段与 Semantic Model 分离；语义修改使用 `expectedUpdatedAt` 乐观并发，生成绑定优先读取已确认指标和维度，不按字段顺序猜测
- Semantic Query 只接受已确认的维度/指标 ID，支持受控筛选、最多 3 个维度、12 个指标和 200 个结果组；响应携带 Dataset 指纹、更新时间和语义版本，供刷新与发布判断过期
- Data Access Policy Service 在 Data Source API 和 Generation Job 解析之前执行组织隔离与可选行级 grant；策略仅接受服务端配置的语义维度筛选，并将裁剪后的同一 Dataset 投影交给预览、查询、模型上下文和 portable 副本。策略状态 API 不返回规则正文
- Query Cache 以授权 scope、Dataset ID、指纹、Semantic Model 版本和规范化查询为键；file 使用进程内 LRU，PostgreSQL 使用共享 TTL 表。fingerprint 使成功刷新天然绕过旧结果，Schema/手动刷新/后台刷新再按 Dataset 主动清理旧条目；缓存仅存聚合 query result，不存凭证或 records
- Publication Store 将指定不可变 revision、确定性 HTML artifact、SHA-256、访问策略元数据和 Dataset 查询快照原子保存；列表/详情不返回 HTML，管理端 artifact 使用独立端点。发布、提交审批、批准和撤回同时写入 Publication 内部 audit outbox，审计仓储暂时不可用不回滚业务对象，后续启动、管理动作或审计读取会重试投递；配置外部 audit anchor 时，每次成功投递 Publication 事件也会请求刷新链头。部署可按组织启用 `pending -> published` 审批生命周期：编辑者只创建待审批快照，组织管理员批准前外部 share/embed 隐藏为 404
- 共享运行入口使用 `/p/:publicationId`：private 对访客隐藏，unlisted 校验一次性展示的随机令牌且仓库只保存 SHA-256，public 使用稳定路径；共享访问与管理下载分离，撤回后统一返回 `410`。授权通过后按发布对象和连接来源执行进程内固定窗口限流，超限返回 `429/Retry-After`
- Publication Access Store 追加 allowed/denied 审计事件并按发布汇总；事件不保存 URL、令牌、响应正文或客户端 IP。当前仍是单机管理边界，不等同于组织身份、RBAC 或合规审计
- Embed 入口使用 `/embed/:publicationId` 并复用同一 private/unlisted/public 校验和撤回状态；Studio 生成 iframe 代码，embed 访问作为独立 channel 进入 Access Store
- Publication Renderer 只读取已固化 artifact，通过 Studio-only Playwright Chromium 在 390-1920px 受控视口中关闭动画、等待字体并输出 PNG 或 PDF。Dashboard 保持宽度对应的保真长页 PDF；Report 自动以 A4 print media 输出，加入标题页眉、页码、稳定页边距和 Section/Card 防跨页规则。长页高度上限 20,000px，分页 Report 为 60,000px；渲染器和浏览器不进入 Skill 或 standalone
- Studio Auth Service 支持默认 disabled 本地身份与可选 token 身份源；token 登录换取 HttpOnly 服务端会话，管理 API 统一执行 viewer/editor/admin 角色和同源 Origin 检查。file 模式默认使用进程内 Session，PostgreSQL 模式自动使用共享 Session 表；share/embed 不复用管理会话
- 生产代理入口以显式 `DASHBOARD_PUBLIC_ORIGIN` 作为 CSRF 与 OIDC callback 的部署真相，不信任转发头；未配置时只为本地兼容使用请求 Host。公网来源只允许 HTTPS（回环开发除外），OIDC redirect URI 必须精确匹配受控 callback 路径
- 外部身份仓储在 file 与 PostgreSQL 中均提供持久化、不可变 subject 映射；OIDC 一次性登录事务暂为服务端内存实现。它们不保存 token、授权码或用户 profile。组织服务持久化邀请、动态成员 profile 与生命周期审计；接受 secret 只保存 hash，公开组织响应不会返回它
- OIDC Provider Service 可生成授权 URL 并编排交换/验签后的成员映射检查；Preview Server 的匿名 start/callback 与 invitation-start 路由在 file 与 PostgreSQL OIDC 环境配置下可用，回调仅在身份验证、邀请目标比对和成员激活成功后通过 `authService.loginActor` 创建 HttpOnly Studio session。Provider metadata、client secret、RS256 JWK verifier 与 code exchange 由运行时配置装配；邀请在 file store 的回归已覆盖，PostgreSQL invitation conformance、SCIM 与真实 IdP 联调仍待完成
- Project 在兼容 version 1 的前提下保存 owner 与成员 ACL；全局角色限制能力上限，资源角色决定具体 Project 可见性。历史无 owner 对象仅 admin 可见，公开 share/embed 继续由 Publication 策略独立授权
- token 身份与新 Project 固化 `organizationId`；组织范围是 Project ACL 之前的硬边界，同组织安全目录只返回 id/name/role/organizationId，不返回登录 token
- Project 管理写入与审计意图由当前 provider 在同一提交边界保存，dispatcher 负责幂等补投；file 使用单文件原子快照，PostgreSQL 使用同事务 Project row outbox。PostgreSQL Audit Sink 按组织顺序写入 hash chain，并以 append-only trigger 阻止普通更新/删除；设置独立 HMAC key 后链头由 seal 保护。每个新链头同步写入稳定 anchor outbox，配置 HTTPS sink 后由异步 dispatcher 投递；项目记录 UI 只读取当前用户可见项目
- Studio 项目中心通过 Project API 列出可见对象并从服务端 current revision 恢复 workspace；重命名、归档和 ACL 不改变 revision，复制只把选定不可变 revision 作为新项目首版，避免复制来源协作者和历史审计身份
- Uploaded Dataset 刷新使用乐观并发和 last-known-good：同格式新文件只有在解析、字段兼容和语义模型校验全部成功后才原子替换；失败仅记录 attempt/error/failedAt，旧 records、fingerprint 和 successful updatedAt 不变
- REST Connector 只允许服务端精确白名单中的 HTTPS GET，禁止 URL 用户名/密码、敏感查询参数和重定向；浏览器只提交 `credentialRef`，真实认证头由服务端环境解析且不进入 Dataset、Provider、Workspace、Revision、Publication 或 artifact
- PostgreSQL Connector 只允许部署方预注册的连接引用；连接串由服务端环境变量解析，单条只读查询由部署配置固化，浏览器不能提交 SQL 或连接参数。查询结果与 REST 一样先物化为受限 Dataset，再进入语义模型、行级策略、缓存、生成、发布和远程刷新链路
- Refresh Job Store 持久化 `queued / running / retrying / succeeded / failed / canceled`，worker 对 REST 刷新执行有上限的指数退避并在重启后恢复未完成任务；租约含 owner/token/expiry，heartbeat 续租，fencing token 阻止过期 worker 写入 Dataset。PostgreSQL 对活动 Dataset Job 施加唯一约束，执行语义为可恢复 at-least-once
- 取消 queued/retrying 会清除定时器；取消 running 会立即固化 canceled，迟到的连接器结果不得写入 Dataset 或重新排队。上传型 Dataset 不保存新文件载荷，因此不进入后台自动重试
- Refresh Schedule Store 为 REST Dataset 保存 15 分钟到 30 天的固定间隔、启停状态、nextRunAt 和最近 Job；到期 Schedule 先领取租约，再以 `scheduleId + scheduledFor` 派生确定性 Job ID。实例故障后由过期租约接管，已创建未确认的 Job 会幂等复用；长于 Node 单定时器上限的间隔分段唤醒
- 远程适配器只存在于 Studio 服务端，使用 schema-guided JSON 输出后仍执行本地 workspace/generation 校验；API key、模型接口和 provider 响应不进入便携 Skill 或成品
- `evals/generation-cases.json` 与 `generation-evaluator.mjs` 形成 Studio-only AI 质量门槛：固定业务案例经同一 Provider Gateway 生成隔离 preview，按结构、意图、provenance、可编辑性和局部修改范围评分，不提交 Project；详细合同见 `docs/architecture/generation-evaluation.md`
- Organization Repository 持久化组织名称及成员的 organizationRole/status；Auth Service 每次会话解析均从该仓储重读成员状态，组织管理员通过项目中心的组织设置调用 `/api/organizations/current` 与 `/members` 管理组织。项目 ACL 继续只处理组织内 Project 资源授权
- Organization 更新使用独立 transactional outbox 写入 `organization` scope 审计事件；项目中心的组织设置可读取受权治理记录。PostgreSQL 事件进入同一组织 hash chain，file 模式使用组织文件原子快照并在后续请求恢复投递
- PostgreSQL provider 的业务仓储、Auth Session、Organization、Refresh Job、Generation Job、Schedule、Audit Sink 与 Query Cache 支持 durable/shared/multi-instance，并通过真实双连接池、双 HTTP 实例、事务冲突、两类 worker fencing、生成任务过期恢复与跨实例取消、schedule 单次触发、append-only trigger、hash/HMAC 篡改检测、共享缓存 TTL/失效和 adapter restart 测试；行级策略在查询前由服务端执行，策略目录本身仍由部署配置管理
- 当前先保持单仓库开发；待协议稳定后再按 core、exporter、resources、studio 拆包
- 正式 `studio-web` 采用与预览壳并行的渐进迁移：路由、状态所有权、API authority 与迁移门槛见 `docs/architecture/studio-web-app-boundary.md`。框架选型不先于部署和身份回调约束
## Studio UI 组件

Studio 的项目中心使用平台侧基础交互组件；组件边界和与轻量 Skill 的关系见 `docs/architecture/studio-ui-components.md`。Skill 只携带组件契约，不携带平台组件源码或运行依赖。
