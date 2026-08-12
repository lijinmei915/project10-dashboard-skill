---
layer: governance
type: spec
last_verified: 2026-08-11
depends_on: [docs/ARCHITECTURE.md, docs/ENVIRONMENT.md]
---

# 安全边界

> 用途：定义 Studio 身份、会话、授权、公开访问和敏感数据的安全边界。
> 什么时候更新：认证方式、权限模型、公开路由、凭证或审计策略变化时。
> 不要写什么：环境变量教程、产品路线、单次漏洞修复流水。

## 运行模式

- `disabled`：默认本地开发模式，服务端使用 `local-admin`；只能监听可信本机环境，不构成多用户认证。
- `token`：服务端环境配置用户与一次性登录令牌；令牌只进入登录请求，成功后换成服务端内存会话。
- `oidc`：服务端只允许 Provider 授权回调创建 session；token 登录端点返回拒绝。file 与 PostgreSQL storage 都可通过显式 Provider metadata、单独 client secret 和 HTTPS JWK URI 环境配置启用；PostgreSQL 使用共享 External Identity 仓储。
- token/OIDC 模式的管理 API 默认拒绝未登录请求；`/p/*` 与 `/embed/*` 继续按 Publication access 独立授权。
- `/api/platform/readiness` 与生成 health 可匿名用于进程探针；只返回 provider、布尔/枚举能力和各仓储检查状态，不返回存储目录、对象数量、业务内容、身份或凭证。
- OIDC 模式的 readiness 额外探测 Provider 编排和 External Identity 仓储；仅报告 `mode`、provider 数量及最小状态，缺少任一依赖时返回失败，不泄露 provider ID、issuer、JWK、identity 内容或 secret。

## 会话

- Cookie 为 `HttpOnly; SameSite=Strict; Path=/`，默认有效期 8 小时。
- HTTPS 部署必须设置 `DASHBOARD_AUTH_SECURE_COOKIE=true`。
- 会话 ID 使用 256-bit 随机值，只存在 HttpOnly Cookie；repository 仅保存其 SHA-256 摘要、actor/organization 引用和过期时间。访问令牌与原始会话 ID 不进入浏览器存储、URL、Project、Dataset、Publication、artifact、数据库或业务日志。
- file provider 默认使用内存 Session，服务重启后失效；PostgreSQL provider 使用共享 Session，支持跨实例读取和注销。人工组织成员暂停或移除会把按成员撤销写入组织更新的 durable outbox，再由 dispatcher 清理同组织全部 session；每次鉴权仍重新映射当前受控身份，因此延迟投递不会让已移除身份继续访问。

## 授权

| 角色 | 权限 |
|------|------|
| `viewer` | 管理资源只读、受控查询、导出 |
| `editor` | viewer 权限，加生成、编辑、数据刷新和发布 |
| `admin` | 当前等同 editor，保留后续用户、策略和组织管理入口 |

- 只读 POST 仅限图表渲染、Semantic Query 和 revision export；其他非 GET 请求视为写操作。
- token/OIDC 会话的所有非 GET 请求必须携带受信 Origin。生产反向代理部署必须通过 `DASHBOARD_PUBLIC_ORIGIN` 固化公网 HTTPS origin；服务端不信任客户端可伪造的 `X-Forwarded-Host/Proto`。未配置时仅为本地兼容而回退到当前请求 Host。
- 前端只读提示是体验层，服务端角色判断才是授权事实。

### Generation Job

- Generation Job 只能由同组织发起人或组织管理员读取、取消；跨组织管理员也无访问权。
- Job 持久化生成 request 与 baseline workspace 以支持刷新和进程恢复，但公开摘要不返回内部 input。DataContext、Dataset records、连接器配置和凭证不写入 Job；worker 执行时按服务端 Dataset ID 重新解析有界上下文。
- 浏览器只在当前 tab 的 `sessionStorage` 保存 active Job ID 和可选组件目标 ID，不保存 prompt、workspace、Provider 响应或数据。任务结束、失败或取消后删除指针。
- cancel 同时更新持久状态并传播 AbortSignal；租约 fencing 阻止已取消或失去租约的 worker 写回迟到结果。任务成功只产生隔离 preview，仍需显式 commit 才能创建 Project revision。
- 任务终态 telemetry 只保存 queue/execution/total 毫秒数与 repairAttempts。`GET /api/generation/metrics` 仅组织管理员可读，并只返回当前组织的计数、比率、延迟分位数和失败码；不得返回 Job ID、actorId、prompt、workspace、候选、Dataset、错误正文或跨组织统计。
- Generation Feedback 只允许 Job 原发起人在 succeeded 后提交一次 accepted/dismissed；管理员不能代填。协议不接受自由文本，只允许受控原因码和 accepted 对应的安全 revision ID；相同重试幂等，冲突修改拒绝。组织聚合只返回计数与可用率，不返回 Job、actor 或 revision。

### Project ACL

- 每个 token 身份属于一个 `organizationId`；身份目录、Project 列表和审计事件先按组织隔离，再执行 Project ACL。跨组织 admin 不具有访问权。
- 新 Project 自动将创建者记录为 owner；owner 可授予其他身份 `viewer` 或 `editor` 项目角色。
- 全局 `admin` 可读取、编辑和管理所有 Project；全局 `editor` 仍须是 Project owner/editor 才能写入，全局 `viewer` 即使被授予项目 editor 也保持只读。
- Project 列表过滤不可见对象；读取、revision、历史、恢复、导出、Publication 管理和访问审计均在服务端执行资源授权。
- 历史无 owner Project 不自动开放给普通用户，只允许 admin 读取并通过受控迁移或 ACL 操作认领。

### Dataset 与行级权限

- 新建 Dataset 由服务端固化 `organizationId` 与 `ownerId`，忽略客户端伪造归属；列表、详情、预览、Schema、刷新、任务、计划、查询与 AI 数据解析都先执行组织隔离。跨组织对象统一按不存在处理，重复 ID 不能覆盖其他组织 Dataset。
- 行级策略只由 `DASHBOARD_DATA_POLICIES_JSON` 提供，绑定组织、Dataset、受控主体选择器和 Semantic Model 维度过滤；浏览器、Workspace、Prompt 与模型均不能提交策略引用或任意物理字段表达式。
- 策略先裁剪服务端 records，客户端查询筛选再与其取交集；同一裁剪结果用于预览、Semantic Query、Generation Job DataContext 和 portable 副本。没有匹配 grant 时失败关闭。
- Query Cache key 包含不透明策略 scope，避免相同查询在不同授权主体之间复用结果；API 只返回客户端查询条件，不回显策略 ID、grant、主体或过滤值。
- 本地 disabled 模式可读取历史无组织 Dataset 作为 `local` 迁移兼容；token/OIDC 模式对无组织 Dataset 失败关闭，必须经受控迁移归属后才能访问。

### 审计

- Project 创建、复制、重命名、归档、恢复和成员权限更新写入追加式审计仓库。
- 组织名称与组织成员状态/角色更新写入独立 `organization` scope 事件；只有当前组织管理员能读取该 scope，项目事件查询不会混入治理事件。
- 事件只保存时间、动作、Project、组织、操作身份和最小变更元数据，不保存 token、Cookie、workspace、Dataset 正文、URL 或 IP。
- 审计查询同时校验组织与 Project read 权限；Project 业务状态与待投递审计意图由 provider 在同一提交边界保存，投递按事件 ID 幂等并可在重启后恢复。file outbox 仅适合单机；PostgreSQL 使用共享事务 outbox、每组织 hash chain 和 append-only trigger。
- `GET /api/audit-events/verify` 仅验证当前身份所属组织，先尝试投递 outbox，再返回 eventCount、headHash、sealed 与完整性状态；它不返回原始 seal 或跨组织信息。file provider 明确返回 `501`。
- HMAC seal 能检测数据库侧重写链内容但不能取代数据库最小权限、备份保留、密钥隔离或独立第三方归档。拥有数据库 DDL 权限和 HMAC key 的同一主体仍可伪造历史，因此合规留存需将链头周期性锚定到独立账户/存储。
- PostgreSQL 外部审计锚定可选启用：每个已提交 audit chain head 在同一审计事务写入 durable outbox，HTTPS sink dispatcher 按稳定 anchor ID 异步投递。失败只记录最小错误类别并保留重试，绝不回滚业务或内部 audit；管理端只返回 anchor freshness/status，不返回事件正文、原始 receipt、密钥或敏感数据。部署方仍须选择独立 append-only/WORM sink 并验证其留存属性。

### 企业身份

- 目标 OIDC 模式为服务端 confidential client 的 Authorization Code + PKCE；服务器验证 `state`、`nonce`、issuer、audience、签名与 expiry，浏览器不接收 client secret、refresh token、ID token 或 provider access token。
- 外部身份以不可变 `(issuer, subject)` 绑定到一个已存在的组织成员；email、display name 与 group 只是可变属性，不能作为授权主键。JIT 组织入驻默认关闭，未映射且活跃的 IdP 身份不得因邮箱域或 group 自动获得访问权。
- 组织管理员可为已知 OIDC `(providerId, issuer, subject)` 创建一次性、限时邀请；原始接受 secret 仅在创建响应中出现一次，持久化和公开组织响应仅保留 hash/非敏感摘要。接受必须经过已验证的 OIDC callback，不能以浏览器提交的身份资料激活成员。邀请接受产生动态成员与组织审计事件；identity 与组织存储跨仓库的失败场景保持 fail-closed，尚不宣称分布式原子事务。
- 邀请与未来 SCIM 都经组织成员生命周期服务更新成员；暂停或 deprovision 必须立即拒绝现有会话并跨实例撤销，不能删除历史 Project 或审计归属。SCIM service credential 只可在服务端保存。
- 完整协议、成员供给和外部 anchor 契约见 `docs/architecture/identity-and-audit-boundary.md`；`disabled/token` 与 file/PostgreSQL storage 的 OIDC 都可通过环境直接配置，OIDC provider metadata 与 client secret 必须分离，具体字段见 `docs/ENVIRONMENT.md`。
- Provider 编排与匿名 `/api/auth/oidc/:providerId/start|callback` 路由由 OIDC 环境配置装配：回调仅在 code exchange、token verifier、immutable identity 映射和 actor 解析全部成功后才创建既有 HttpOnly session。PostgreSQL 映射按外部身份 ID 进行事务级锁定；未配置 provider 时 OIDC 启动 fail-fast。这不等同于已配置的完整企业 SSO 生命周期。
- 设置 `DASHBOARD_PUBLIC_ORIGIN` 后，OIDC provider 的 redirect URI 必须精确匹配 `${publicOrigin}/api/auth/oidc/:providerId/callback`；错源、错路径或降级 HTTP 在启动时失败，不能依赖转发头动态拼接 callback。
- 可注入的标准 verifier 仅允许 `RS256`，从 HTTPS JWK URI 获取并缓存 RSA 公钥，验证签名、issuer、audience、nonce、`exp`、`nbf`、`iat` 和多 audience 场景的 `azp`；不支持的算法、未知 key、过期 token 和 JWK 故障均失败关闭。code exchange 仅返回 `id_token` 给编排层，access token 和上游响应正文不进入 session、日志或 API 响应。

## Publication

- private 对访客返回 404；unlisted 校验只存哈希的随机令牌；public 无令牌。
- 可选部署策略 `DASHBOARD_PUBLICATION_APPROVAL_ORGANIZATIONS` 允许按组织把新 Publication 置为 `pending`。待审批对象的 public/unlisted share 与 embed 均返回 404，即使请求持有正确 unlisted token；只有同组织 `organizationRole=admin` 能批准为 `published`。默认不配置该策略时仍直接发布。
- 创建、提交审批、批准和撤回均记录最小项目审计事件，只包含 Publication ID、revision ID 与 visibility，不保存 HTML、分享 token、URL、artifact 或 Dataset 记录。事件先随 Publication 进入持久化 outbox；审计存储短暂不可用时业务不回滚，恢复后自动重投。若部署配置外部 audit anchor，每次成功投递 Publication 事件都会异步刷新链头；anchor 失败同样不会回滚业务或内部 audit。
- 撤回后的 share、embed 和 render 返回 410。
- embed 与 share 记录允许/拒绝事件，但不保存令牌、URL、正文或客户端 IP。
- 已授权访客按发布对象和连接来源在内存固定窗口中限流；`429` 提供 `Retry-After`。连接来源仅用于进程内计数，不写入 access event；同一窗口只记录首次 `rate_limited` 拒绝，避免日志被拒绝请求放大。

## 敏感数据

- REST 凭证只在服务端环境中按 `credentialRef` 解析；PostgreSQL 连接串只按部署方预注册的 `connectionStringEnv` 解析，查询文本同样仅保留在服务端配置。
- Provider key、REST 认证头、数据库连接串/查询和登录令牌不得进入模型上下文、workspace、revision、成品或错误响应。
- AI Provider 档案按组织隔离；只有组织管理员可新增、编辑、删除、启用、发现模型或测试连接。浏览器可提交一次新密钥，但服务端响应永不回显密钥、密钥引用或 endpoint。file 模式将公开档案和密钥拆到不同的 `0600` 文件并排除 Git；它不提供加密、轮换、HSM/KMS 或多实例共享，生产必须替换为集中 Secret Manager。
- 原始 Dataset 默认服务端驻留，portable 副本必须显式授权且受行数限制。

## 当前非目标

- 当前没有跨组织委派、邀请邮件投递、SCIM、MFA、密码找回、分布式/账户级速率限制、策略管理 UI、独立验证的审计链头外部保留或合规保留策略。
- token 身份源适合受控部署，不替代企业 IdP、SSO 或 MFA。
- PostgreSQL 已提供共享数据库事务、Session、Organization、Refresh 租约、集中审计与共享查询缓存；多实例生产部署仍须补集中运维、密钥管理与组织策略治理。
