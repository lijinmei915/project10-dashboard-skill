<!-- 以下为「智能填写」自动检测的项目快照，可以参考填写下方内容。删掉此整块也无影响。 -->

> **项目快照（自动检测）**
> - 项目名称：项目10-dashboard skill
> - 简介：一个用于沉淀 AI 工程文档与 Skill 骨架示例的轻量项目仓库
> - 技术栈：—
> - 当前阶段：原型
> - 待办标记数（TODO/FIXME）：0

---
layer: knowledge
type: status
last_verified: 2026-08-11
depends_on: [AGENTS.md, PRODUCT.md, docs/ROADMAP.md]
---

# 项目状态

> 用途：回答“这个项目现在是什么阶段、架构怎样、进度到哪、下一步重点是什么”。
> 什么时候更新：阶段、架构、当前进度、已知问题、下一步重点变化时。
> 不要写什么：交接流水、详细历史、面向新用户的教程、长期决策论证。

## 项目定位

- 项目名：`项目10-dashboard skill`
- 一句话定位：`可移植 Dashboard Skill 与 AI Dashboard Studio 产品原型。`
- 当前阶段：`可运行产品原型；M1/M2/M3 阶段门槛已通过，开始进入 M4 平台化`

## 当前架构

- 入口层：`README.md`、`AGENTS.md`、`PROJECT.md`、`HANDOFF.md` 提供项目入口、协作规则与状态说明。
- 规则层：`docs/SKILL_ENGINEERING.md` 定义 Skill 工程边界；`.agents/skills/dashboard-html/SKILL.md` 与 generation/workspace schema 定义触发、受控生成和状态协议。
- 执行层：`.agents/skills/dashboard-html/agents/openai.yaml`、`references/`、`assets/templates/` 提供 agent 配置、规则文档和输出模板。
- Agent 运行层：本地 Node 服务通过 Provider Gateway 与持久化 Generation Job 提供确定性或可选远程首稿/局部精修、轮询/取消/刷新恢复、受控提交/撤销 API、持久化 Project Repository、探索预览及 Phosphor/ECharts 生成期能力；导出层只输出已固化的 HTML、CSS 和内联 SVG。

## 当前进度

- 已完成：`自然语言通过持久化 Generation Job 生成受控首稿，支持取消、刷新恢复、接受/放弃质量反馈和组织级成功率/可用率/延迟/失败码观测；版本化 eval suite 对多领域首稿、合成真实数据 grounding 和目标组件精修执行结构、意图、字段绑定、可见值、来源、可编辑性与修改范围发布门槛；项目中心可启动新的 AI 项目而不持久化空模板，接受候选时才创建首个 revision；组件作用域支持字段修改、复制、新增同类、删除、调宽和排序；项目可比较和恢复不可变版本。`
- 正在做：`M4 从受控 token 身份与组织治理继续走向正式应用边界；Organization Repository、组织设置、AI 运行概览、组织级审计、成员即时停用和按组织可选的 Publication 审批已完成。Studio 已有正式路由、确定性独立静态构建、同源静态网关和反向代理 conformance，下一步在真实 TLS ingress 与 IdP 环境验收公网 Origin、Cookie 和身份回调。OIDC 已完成 file/PostgreSQL 登录、回调验签与共享不可变身份映射。`
- 已完成能力补充：`REST 连接器只使用服务端白名单和 credentialRef；PostgreSQL 连接器只使用部署方预注册的只读连接引用与查询，并提供不输出数据的真实部署 smoke；两类远程 Dataset 的 Refresh Job 可在重启后恢复并通过 Studio 显示排队、运行和重试状态。`
- 尚未开始：`SCIM。` Report Publication 的 PDF 已按不可变 artifact 自动采用 A4 分页、页眉页码和防跨页规则；行级数据权限已在服务端 Dataset 边界落地，策略管理 UI 与外部策略引擎尚未实现；邀请接受与外部审计 anchor outbox 已实现，Studio Web 的独立构建与本地部署合同已有自动证据，真实托管基础设施仍待验收。

## 已知问题

- 当前已有 PostgreSQL 共享仓储、Session、按成员撤销 outbox、Refresh 租约、Audit Sink、Shared Query Cache、组织隔离、Project ACL、组织管理控制面与组织审计；OIDC 的不可变外部身份映射、短期事务、HTTP 回调、RS256 验签与共享 PostgreSQL identity store 已完成。Audit chain head 已支持可选 HTTPS durable outbox 锚定；邀请/SCIM、行级数据权限、真实 IdP 与独立 WORM sink 联调尚未完成。
- 本地确定性 provider 用于无密钥开发和端到端测试，不等同于真实托管模型。
- OpenAI Responses 适配器尚未在有效 API key 下执行真实联网生成，当前证据只覆盖请求/响应协议、超时、错误和本地校验链路。
- 指定 revision 的确定性导出已验证稳定字节、SHA-256、真实浏览器交互与响应式；未保存的有效 workspace 会先自动追加 user revision，历史 DOM 兼容导出已移除。系统文件保存器分支仍保留人工浏览器验收。

## 下一步重点

1. 在有效服务端密钥环境执行真实模型首稿、局部命令、一次修复、延迟和成本 smoke test，不改变 bundle 契约。
2. 使用真实 TLS ingress/静态托管和 IdP 验证 `studio-web-app-boundary.md` 已自动覆盖的同源路由、公网 Origin、Secure Cookie、OIDC callback 和缓存合同；SCIM 按当前产品决策暂缓。
3. 在独立 WORM sink 验证审计锚定留存与告警，并继续缩减 Editor Runtime 中已外置模块的历史兼容代码。
4. 继续执行视觉、布局和导出回归，确保平台化不破坏 standalone 交付。

## 路线引用

- 产品平台阶段、范围、依赖和验收门槛统一维护在 `docs/ROADMAP.md`。
- 当前 M1 本地纵向验证已通过，M2 的组件字段/结构修改、可逆命令和版本恢复已通过自动与浏览器验收；AI 首稿是默认入口，空白手工搭建仅作备用。真实数据连接、发布和企业能力不得绕过前序阶段门槛提前扩张。

## 相关文件

| 文件 | 关系 |
|------|------|
| `HANDOFF.md` | 当前交接上下文（短期） |
| `docs/ROADMAP.md` | 产品平台长期路线和阶段门槛 |
