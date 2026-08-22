---
layer: knowledge
type: guide
last_verified: 2026-08-11
depends_on: [README.md, PROJECT.md]
---

# 环境说明

> 用途：记录当前仓库的环境依赖、启动方式和已知限制。
> 什么时候更新：启动方式、依赖、包管理或运行入口发生变化时。
> 不要写什么：产品定位、交接流水、长期决策背景。

## 当前环境形态

- 仓库类型：`文档 + skill 资源 + 本地 Agent 预览服务`
- 运行时：`Node.js`
- 包管理：`npm`
- Agent 图标资源：`@phosphor-icons/core@2.1.1`
- Agent 图表渲染：`echarts@6.1.0`
- CSV 解析：`csv-parse@6.1.0`
- Excel 解析：`read-excel-file@8.0.3`，仅用于 Studio 服务端 `.xlsx` 解包，不进入 Skill 包或 standalone
- PostgreSQL 客户端：`pg@8.23.0`，仅在选择 PostgreSQL storage provider 时用于 Studio 服务端
- AI provider：默认 `deterministic-local`；可选服务端 OpenAI Responses 适配器，不增加浏览器或成品依赖
- 浏览器回归：`@playwright/test@1.55.1` 开发依赖；只用于本地/CI 验证，不进入 Skill 或成品
- Publication PNG/PDF 渲染：`playwright@1.55.1` Studio 运行依赖；部署环境需安装 Chromium，浏览器二进制不进入 Skill 或成品

## 启动方式

```bash
npm install
npm start
```

- 默认产品入口：`http://127.0.0.1:8765/studio/projects?design=1`；旧的 `.dashboard-preset-preview.html` 地址继续作为本地兼容入口
- 可通过 `PORT` 和 `HOST` 修改监听地址，例如 `PORT=8766 npm start`
- 项目 revision 默认原子写入仓库根目录 `.dashboard-projects/`；可通过 `DASHBOARD_PROJECTS_DIR` 指向独立持久化目录
- 上传数据源默认写入 `.dashboard-data-sources/`；可通过 `DASHBOARD_DATA_SOURCES_DIR` 指向独立持久化目录
- 发布快照默认写入 `.dashboard-publications/`；可通过 `DASHBOARD_PUBLICATIONS_DIR` 指向独立持久化目录
- 发布访问事件默认写入 `.dashboard-publication-access/`；可通过 `DASHBOARD_PUBLICATION_ACCESS_DIR` 指向独立持久化目录
- `/p/*` 与 `/embed/*` 的已授权访客默认每分钟最多 120 次，可通过 `DASHBOARD_PUBLICATION_RATE_LIMIT` 和 `DASHBOARD_PUBLICATION_RATE_WINDOW_MS` 调整；超出后返回 `429` 与 `Retry-After`，限流状态只在进程内存保存
- `DASHBOARD_PUBLICATION_APPROVAL_ORGANIZATIONS=org-a,org-b` 可为指定组织开启发布审批。未配置时维持直接发布；已配置组织创建的 Publication 先为 `pending`，其 `/p/*` 与 `/embed/*` 在组织管理员批准前统一返回 `404`，避免泄露待审批对象。组织管理员通过 Studio 或 `POST /api/publications/:id/approve` 批准后，既有外链才生效
- Semantic Query 默认使用进程内 LRU 缓存，TTL 30 秒、最多 100 项；可通过 `DASHBOARD_QUERY_CACHE_TTL_MS` 和 `DASHBOARD_QUERY_CACHE_MAX_ENTRIES` 调整。PostgreSQL 模式改用共享 TTL 表；最多项仅影响 file LRU，数据库由 TTL 和 Dataset 定向清理回收
- `DASHBOARD_DATA_POLICIES_JSON` 可配置服务端行级策略数组。每项以 `id / organizationId / datasetId` 绑定一个组织 Dataset，并通过 `grants` 按 `actorIds / actorRoles / organizationRoles` 选择 1-12 个受控语义维度筛选；筛选只允许 `equals / in / contains / before / after` 和标量值。一个组织 Dataset 最多绑定一条策略，配置错误会在服务启动时 fail-fast
- 行级策略不会进入浏览器、Workspace、Generation Job input、模型请求或查询响应；`GET /api/data-access-policies/status` 仅组织管理员可读，返回当前组织是否配置及策略数量。Readiness 只返回全局配置状态和数量，不返回策略 ID、主体或过滤值
- REST 连接器默认关闭；`DASHBOARD_REST_ALLOWED_HOSTS` 使用逗号分隔的精确 `host[:port]` 白名单，`DASHBOARD_REST_CREDENTIALS_JSON` 保存服务端凭证引用到 `Authorization / X-API-Key / Accept` 请求头的映射
- REST 默认只允许 HTTPS、不跟随重定向、10 秒超时；`DASHBOARD_REST_TIMEOUT_MS` 可调整超时。`DASHBOARD_REST_ALLOW_INSECURE=true` 仅供明确隔离的本地开发和测试
- PostgreSQL 数据连接默认关闭；`DASHBOARD_POSTGRES_CONNECTORS_JSON` 只接受部署方预注册的连接引用，例如 `{"sales-readonly":{"connectionStringEnv":"SALES_ANALYTICS_DATABASE_URL","query":"SELECT region, revenue FROM dashboard_sales"}}`。连接串必须只存在于对应环境变量，查询必须为单条无注释、无参数的只读 `SELECT`/`WITH ... SELECT`，浏览器仅能选择 `connectionRef`
- PostgreSQL 查询单次最多 10,000 行、默认超时 10 秒；可在单个连接配置中以 `statementTimeoutMs` 收紧（100-10,000ms）。数据库账号必须由部署方授予最小只读权限；该连接器不接受浏览器提交的 SQL、连接串、主机或认证参数
- 在已配置最小只读数据库账号的部署环境，可运行 `npm run smoke:postgres-connector` 执行一次连接、字段识别和刷新验证。仅一个连接引用时自动选择；多个引用时必须显式设置 `DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF`。结果只返回引用、行/列/语义计数和刷新状态，不输出 SQL、连接串、记录或 Project；未配置 connector 或连接串时立即失败且不访问网络
- Refresh Job 与 Generation Job 默认写入 `.dashboard-jobs/`，可通过 `DASHBOARD_JOBS_DIR` 改目录，并按任务 `type` 隔离；刷新指数退避基准由 `DASHBOARD_REFRESH_RETRY_BASE_MS` 配置，默认 1000ms，单刷新任务最多 5 次。Generation Job 保存受控 request/baseline，不保存 DataContext 或凭证
- Refresh Schedule 默认写入 `.dashboard-refresh-schedules/`，可通过 `DASHBOARD_REFRESH_SCHEDULES_DIR` 改目录；固定间隔限制为 15 分钟至 30 天
- Organization 默认写入 `.dashboard-organizations/`，可通过 `DASHBOARD_ORGANIZATIONS_DIR` 指向独立目录；token 身份首次访问时按其 `organizationId` 引导初始成员，之后成员状态与组织角色由仓储控制
- `DASHBOARD_REFRESH_LEASE_MS` 控制 Refresh Job/Schedule 租约，默认 30000ms，服务端最小接受 5000ms；运行中 Job 约每三分之一租约时间 heartbeat 一次
- PNG/PDF 渲染默认 30 秒超时，可通过 `DASHBOARD_RENDER_TIMEOUT_MS` 调整；宽度限制 390-1920px。Dashboard PDF 保持 20,000px 长页限制；Report PDF 自动使用 A4 分页并允许最多 60,000px 的已渲染内容高度
- 身份默认 `DASHBOARD_AUTH_MODE=disabled`。启用 `token` 时，`DASHBOARD_AUTH_USERS_JSON` 使用 `{"user-id":{"name":"姓名","role":"admin|editor|viewer","token":"server-secret"}}`；会话时长由 `DASHBOARD_AUTH_SESSION_TTL_MS` 配置，默认 8 小时
- 在线个人账号使用 `DASHBOARD_AUTH_MODE=password`。账户默认写入 `.dashboard-accounts/`，可通过 `DASHBOARD_ACCOUNTS_DIR` 指向独立持久化目录；目录只保存邮箱、个人空间标识和带盐 `scrypt` 哈希，不保存明文密码。登录与注册默认 15 分钟最多 8 次尝试，可通过 `DASHBOARD_AUTH_RATE_LIMIT` 和 `DASHBOARD_AUTH_RATE_WINDOW_MS` 调整。
- `token` 模式仅供旧部署迁移，产品登录页不再提供访问令牌输入。迁移时应创建个人账号并转移 Project/Dataset 归属，完成后切换为 `password`；不得把 AI API Key 当作登录密码或访问令牌。
- `DASHBOARD_AUTH_MODE=oidc` 可在 file 或 PostgreSQL storage 下启用 Provider/start/callback、RS256 JWK 验签和 HttpOnly session；配置用户仍使用 `DASHBOARD_AUTH_USERS_JSON`，但不需要 token。file 的 External Identity 默认存入 `.dashboard-external-identities/`，可由 `DASHBOARD_EXTERNAL_IDENTITIES_DIR` 指向独立目录；PostgreSQL 使用共享的 `dashboard_entities` External Identity 记录
- `DASHBOARD_OIDC_PROVIDERS_JSON` 是不含 secret 的 provider 对象，例如 `{"acme":{"organizationId":"acme","issuer":"https://id.example.com/","authorizationEndpoint":"https://id.example.com/authorize","tokenEndpoint":"https://id.example.com/token","jwksUri":"https://id.example.com/keys","redirectUri":"https://studio.example.com/api/auth/oidc/acme/callback","clientId":"studio-client"}}`；必须提供 HTTPS endpoint、JWK URI 与 `openid` scope（未写时默认 `openid profile email`）
- `DASHBOARD_OIDC_CLIENT_SECRETS_JSON` 单独保存 provider ID 到 client secret 的映射，例如 `{"acme":"server-only-secret"}`。它不进入 provider 列表、授权 URL、Cookie、日志、Project、Skill 或 standalone；`DASHBOARD_OIDC_TIMEOUT_MS` 可设置授权码 exchange 超时，默认 15 秒
- PostgreSQL OIDC 使用共享、不可变的 `providerId / issuer / subject` 映射，不会回退到 file identity store；数据库只保存映射键与组织/成员引用，不保存 email、token 或 IdP assertion。组织管理员可调用 `POST /api/organizations/current/invitations` 创建目标身份邀请；接受方以 `POST /api/auth/oidc/:providerId/invitation-start` 提交一次性 secret 后进入 OIDC，不会直接获得 session。OIDC 仍缺邀请邮件、SCIM、MFA 与真实 IdP 联调，不应作为完整企业 SSO 生命周期宣称
- token 用户可增加 `organizationId`，未填写时使用 `default`；不同组织身份互不可见。项目审计默认写入 `.dashboard-audit/`，可通过 `DASHBOARD_AUDIT_DIR` 指定目录
- `GET /api/platform/readiness` 执行九个仓储端口的只读探针；OIDC 模式额外验证 Provider 编排和 External Identity 仓储，并仅返回模式、provider 数量和状态。响应同时报告行级策略是否配置及总数，不返回规则内容。默认 file provider 返回 `deployment: local-only` 和 `productionReady: false`，PostgreSQL 返回 `deployment: managed` 及其共享能力。响应不包含目录、对象正文、issuer、provider ID 或凭证
- HTTPS 部署必须设置 `DASHBOARD_AUTH_SECURE_COOKIE=true`；token 和 Cookie 安全边界见 `docs/SECURITY.md`
- 反向代理或静态/API 同源生产入口必须设置 `DASHBOARD_PUBLIC_ORIGIN=https://studio.example.com`。该值只能包含 scheme、host 和可选 port；服务端用它校验写请求 Origin，不读取 `X-Forwarded-*`。回环开发可用 HTTP，其他地址必须为 HTTPS
- 静态模板仍可直接打开，但分组图标搜索与替换需要本地 Agent 服务
- 图表目录与 SVG 渲染接口同样由本地 Agent 服务提供

## Studio Web 静态构建

```bash
npm run build:studio
npm run start:studio
```

- 输出目录为 `dist/studio-web/`，它与 29 文件便携 Skill ZIP、standalone HTML 和发布产物相互独立。
- 静态站点挂载在站点根路径；`/studio/*` 回退到 `/index.html`，`/api/*`、`/p/*`、`/embed/*` 不得进入 SPA fallback。
- 第一版要求静态资源和 API 同源，以保持 HttpOnly Cookie、Origin 校验和 OIDC callback 边界；反向代理把 `/api/*` 转发给 Studio 服务。
- 代理可把后端 Host 改为内部地址，但浏览器写请求 Origin 必须等于 `DASHBOARD_PUBLIC_ORIGIN`；后端不应直接暴露公网。OIDC `redirectUri` 必须精确使用 `${DASHBOARD_PUBLIC_ORIGIN}/api/auth/oidc/:providerId/callback`，同时启用 `DASHBOARD_AUTH_SECURE_COOKIE=true`。
- 当前模块文件名未带内容哈希，`index.html`、`studio/*` 和 `build-manifest.json` 使用 `Cache-Control: no-cache` 或等价重新验证策略，不能设置 immutable。
- `npm run start:studio` 先构建，再以 `DASHBOARD_STUDIO_WEB_ROOT=dist/studio-web` 启动同源 Node 网关；生产进程也可显式设置该变量指向只读构建目录。未设置时继续使用仓库预览壳，便于开发兼容。

## AI Provider 配置

默认无需密钥，使用确定性 provider，适合本地开发、演示和合同测试：

```bash
npm start
```

启用远程 OpenAI provider 时，必须在启动服务的 shell 中显式提供 provider、模型和密钥：

```bash
export DASHBOARD_AI_PROVIDER=openai
export DASHBOARD_AI_MODEL=<explicit-model-id>
export OPENAI_API_KEY=<server-side-key>
npm start
```

也可使用 Dashboard 原生的多档案配置接入任意 OpenAI-compatible 服务。公开配置只保存档案名称、接口地址、模型和密钥引用；真实密钥仍由服务端环境提供：

```bash
export DASHBOARD_AI_PROVIDER=managed
export DASHBOARD_AI_PROFILES_JSON='{"schemaVersion":"dashboard.ai-providers.v1","activeProfileId":"team","profiles":[{"id":"team","name":"团队模型","provider":"openai-compatible","apiBase":"https://gateway.example/v1","apiKeyEnv":"TEAM_AI_KEY","model":"model-id"}]}'
export TEAM_AI_KEY=<server-side-key>
npm start
```

- `activeProfileId` 决定当前生成使用哪个档案；档案类型首期支持 `openai-compatible`，调用标准 `/chat/completions`。
- 组织管理员可在 Studio 的“组织设置 > AI Provider”新增、编辑、删除和切换组织自己的档案，也可读取模型列表和测试连接。保存后写入组织级 file repository，服务重启后继续生效；`DASHBOARD_AI_PROFILES_JSON` 只作为未建立组织档案时的部署回退。
- 公开档案默认写入 `.dashboard-provider-profiles/`，密钥单独写入 `.dashboard-provider-secrets/`，两者均为 `0600` 文件并已加入 Git 忽略；可用 `DASHBOARD_PROVIDER_PROFILES_DIR` 和 `DASHBOARD_PROVIDER_SECRETS_DIR` 改目录。file 仓储只适合单实例，本地磁盘上的密钥不等同于加密 Secret Manager。
- 可读取同结构的 `omnidesk.desktop-provider.v0.1` 公开档案用于迁移，但 Dashboard 不依赖 OmniDesk，也不会读取 OmniDesk 的 `.env.local`。
- 浏览器提交新密钥后服务端不会回显；列表、Workspace、Project、日志和 health 响应都不会收到 API Key、密钥引用或 Provider endpoint。

- 不提供默认远程模型，避免模型升级静默改变生成结果。
- `OPENAI_BASE_URL` 可选，默认 `https://api.openai.com/v1`；只允许 HTTPS，测试时允许 loopback HTTP。
- `DASHBOARD_AI_TIMEOUT_MS` 可选，表示整个 Generation Job 的最大任务时长，默认 `300000`（5 分钟），限制范围为 `1000–600000`；首次生成与自动 repair 共享该窗口。
- `DASHBOARD_AI_FIRST_BYTE_TIMEOUT_MS` 可选，表示等待 Provider 返回响应头/首包的最长时间，默认 `120000`；不得超过最大任务时长。复杂推理模型可能在开始输出前先进行较长规划，连接测试成功不代表生成首包会同样快。
- `DASHBOARD_AI_IDLE_TIMEOUT_MS` 可选，表示流式响应相邻数据块之间允许的最长空闲时间，默认 `60000`；每收到一个数据块后重新计时，不得超过最大任务时长。
- OpenAI Responses 与 OpenAI-compatible Chat Completions 均以流式方式读取，但只有完整 JSON 通过 Workspace Schema、命令和安全校验后才进入预览；半截 JSON 不会写入 Workspace。
- Generation Job 同样以 `DASHBOARD_AI_TIMEOUT_MS` 作为包含首次生成与自动 repair 在内的整体硬上限，repair 不会重新获得一段新的 5 分钟窗口。
- 在具有受控预算的真实环境，可运行 `npm run smoke:provider` 验证一次首稿和一次局部精修均进入 `preview-ready`；脚本要求显式 `DASHBOARD_AI_PROVIDER=openai`、模型和密钥，绝不提交 Project 或输出 prompt/workspace/密钥。
- 密钥只用于 Node 服务端 Authorization header，不进入 prompt、workspace、health 响应、浏览器、本地项目、日志或 standalone HTML。
- `.env` 和 `.env.*` 已加入 Git 忽略；当前启动命令不会自动加载 `.env`，应由 shell、进程管理器或部署平台注入环境变量。

## PostgreSQL Storage

默认继续使用适合本地开发的 file provider。托管存储必须显式选择 PostgreSQL，连接失败会终止启动且不会静默回退：

```bash
export DASHBOARD_STORAGE_PROVIDER=postgresql
export DASHBOARD_DATABASE_URL=postgresql://user:password@host:5432/database
export DASHBOARD_DATABASE_POOL_MAX=10
npm start
```

- `DASHBOARD_DATABASE_URL` 在 PostgreSQL 模式必填；`DASHBOARD_DATABASE_POOL_MAX` 可选，必须是正整数。
- 启动时幂等创建 `dashboard_entities`、`dashboard_audit_events` 与 `dashboard_publication_access_events`。
- token/OIDC auth 在 PostgreSQL 模式自动使用 `dashboard_auth_sessions` 共享会话表；数据库只保存 Cookie 随机值的 SHA-256 摘要、身份引用和过期时间。
- `DASHBOARD_AUDIT_HMAC_KEY` 可选但生产建议设置，至少 32 字符且必须由独立 Secret Manager/运行环境注入；它为每个 PostgreSQL 审计事件 hash chain 生成 seal，绝不能写入 Project、日志、浏览器或 Skill 包。
- `DASHBOARD_AUDIT_ANCHOR_URL` 可选，仅 PostgreSQL 模式使用，必须为独立审计 sink 的 HTTPS endpoint；设置后会将最小 audit chain head payload 经 durable outbox 异步 POST。`DASHBOARD_AUDIT_ANCHOR_AUTH_TOKEN` 可选 bearer secret，`DASHBOARD_AUDIT_ANCHOR_TIMEOUT_MS` 默认 15 秒，`DASHBOARD_AUDIT_ANCHOR_MAX_ATTEMPTS` 默认 8；响应只接受不透明 receipt reference，完整响应正文、凭据和原始 receipt 不会持久化或返回浏览器。
- 使用 HMAC seal 的部署必须保持同一 key；当前不支持在线重签名或自动轮换，变更 key 前需完成受控迁移并保留旧 key 的验证能力。
- `DASHBOARD_STORAGE_PROVIDER` 只接受 `file` 或 `postgresql`；未知值会 fail-fast。
- PostgreSQL readiness 同时证明业务仓储、Auth Session、Organization、Refresh execution 与 Query Cache 可共享，并报告 Audit 是否 append-only、hash chained、sealed；这些能力仍不替代集中化运维。
- readiness 的 `queryCache` 显示 `shared/persistent`：file 为 `false/false`，PostgreSQL 为 `true/true`。缓存 key 已包含 Dataset fingerprint 与语义版本，TTL 失效或跨版本 cache miss 不会返回旧版本结果。

## 运行限制

- 服务脚本语法检查：`npm run check`
- 浏览器流程：先执行 `npx playwright install chromium`，再运行 `npm run test:browser`；测试服务固定使用 8766 和 `test-results/project-store`
- 自动测试覆盖 provider 成功、单次修复、限流、超时、未配置、HTTP 状态、密钥泄漏边界、项目重启恢复和乐观并发冲突；真实模型联网 smoke test 仍需有效服务端密钥
- file provider 使用进程内写入队列和文件原子替换，只适合单实例；PostgreSQL provider 使用数据库事务、advisory lock 与行锁完成共享条件写
- PostgreSQL adapter 已提供共享业务仓储、按成员 session 撤销、Query Cache、带 fencing 的 Refresh Job/Schedule 租约及集中 Audit Sink；组织成员暂停/移除的撤销 outbox 会在服务启动及成员更新后重试投递。Audit chain head 可经可选 HTTPS sink 以 durable outbox 锚定；真实独立 WORM/合规账户与告警运营仍须部署验证
- `unlisted` 分享令牌只在创建响应中展示一次，服务端仅持久化 SHA-256；丢失后不能找回，应撤回并重新发布
- CSV/JSON/Excel 首期限制为 2 MB、10,000 行、100 列；Excel 支持工作表选择并只读取单元格缓存值，不执行公式；浏览器预览最多返回 20 行，Provider Data Context 最多包含 12 行受控样本，显式便携副本最多 500 行
- `node_modules/` 仅为本地依赖，不提交仓库，也不会进入导出的 standalone HTML
