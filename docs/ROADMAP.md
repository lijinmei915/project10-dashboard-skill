---
layer: knowledge
type: plan
last_verified: 2026-08-10
depends_on: [PRODUCT.md]
---

# 产品平台路线图

> 用途：定义从 Dashboard Skill / 本地 Studio 原型演进为产品平台的阶段、范围、依赖和验收门槛。
> 什么时候更新：产品阶段、里程碑顺序、阶段范围或验收标准变化时。
> 不要写什么：当前实现流水、单次 UI 调整、已经完成的详细变更历史。

## 目标形态

产品目标是 `AI Dashboard Studio`：用户口述业务目标并可选提供数据，系统生成结构化 Dashboard / Report，用户可继续编辑、保存版本并发布或导出。

北极星流程：

```txt
创建项目
  -> 描述业务问题
  -> 可选导入数据或选择数据源
  -> Agent 生成受控 workspace
  -> 用户编辑内容、布局与视觉
  -> 保存版本
  -> 发布链接或导出轻量成品
```

现有 `dashboard-html` Skill、workspace v2、探索预览、图标/图表生成能力和 standalone HTML 导出继续作为产品基础，不推倒重写。

## 产品边界

### 首要解决

- 从数据与目标生成可编辑 Dashboard / Report
- 用户可直接口述目标获得完整首稿，不从空白画布开始
- 用户可通过对话和必要的手动控件修正生成结果
- 项目可保存、恢复、比较和发布
- Agent 修改必须转换为受控 workspace 命令，并可预览和回退
- 默认交付继续保持轻量、可移植和离线可读

### 首期不做

- 任意 SQL 执行器或完整数据开发平台
- 多人光标级实时协同
- 全量数据库、SaaS 和行业连接器
- 复杂 OLAP、数据仓库建模和无限下钻
- 用平台专有运行时替代 standalone HTML 默认交付

这些能力只有在核心生成与编辑闭环稳定后，才进入企业阶段评估。

## 核心产品对象

- `Project`：项目元数据、所有者、当前草稿和发布状态
- `Workspace`：页面、卡片、布局、主题和局部覆盖的版本化协议
- `Dataset`：导入数据、字段类型、数据质量和刷新信息
- `SemanticModel`：对象、维度、指标、聚合、时间口径和格式
- `Command`：用户或 Agent 对 workspace 的原子修改，可撤销、重放和审计
- `Revision`：不可变版本快照及其来源
- `Publication`：从指定 revision 生成的发布快照、权限和导出产物

`Dataset / SemanticModel` 与 `Workspace` 必须分离，页面不能直接绑定企业原始字段或数据源凭证。

## 架构演进

```txt
studio-web
  -> workspace-core
  -> renderer
  -> agent-service
  -> data-service
  -> exporter

project-service -> PostgreSQL
asset-service   -> object storage
job-service     -> asynchronous generation / export / refresh
```

- `studio-web`：项目入口、编辑器、预览、版本和发布界面
- `workspace-core`：schema、迁移、校验、命令、撤销重做和差异计算
- `renderer`：确定性地将 workspace 渲染为预览或 standalone HTML
- `agent-service`：把用户意图转为规划和受控命令，不直接修改 DOM
- `data-service`：导入、字段目录、语义模型、受控查询与缓存
- `exporter`：HTML、图片、PDF、嵌入包和发布快照

当前单文件探索预览继续作为交互规范；先抽离可测试的核心逻辑，再迁移到正式应用，不进行一次性重写。

## 阶段规划

### M0：受控生成基础

目标：让 AI 能稳定生成和修改结构化 workspace，而不是直接操作任意 HTML 或 DOM。

交付范围：

- 固化 workspace schema、迁移器和运行时校验
- 定义 `Project / Revision / Command` 最小模型
- 抽离 workspace 状态、渲染和导出边界
- 建立组件注册表，统一卡片类型、默认值、属性面板和导出规则
- 建立命令栈、撤销重做和脏状态判断
- 定义 `Prompt -> Plan -> Workspace -> Command Batch` 生成协议
- 增加 workspace、迁移、命令和导出自动化回归

阶段门槛：

- 当前示例可从 workspace 稳定恢复并导出
- 所有编辑操作均能表示为命令并撤销重做
- 旧版本 workspace 有确定迁移结果
- 渲染与导出不依赖编辑器 DOM 的偶然状态
- 一次生成或修改失败不会破坏用户当前 workspace

### M1：AI 首稿 MVP

目标：用户通过自然语言直接获得可编辑、可导出的完整 Dashboard / Report 首稿。

交付范围：

- 输入业务目标、受众、页面类型、视觉偏好和可选数据说明
- Agent 先生成页面规划，再生成经过 schema 校验的 workspace
- 无真实数据时允许使用明确标记的示例数据，不伪装成业务事实
- 生成结果直接进入当前编辑器，并支持标题、卡片、布局和视觉的必要修正
- 生成过程提供规划中、生成中、校验失败、自动修复和降级状态
- 首稿可保存为项目 revision，并可导出 standalone HTML

阶段门槛：

- 用户只输入一段需求即可获得结构完整、可编辑的首稿
- 首稿 workspace 通过 schema、渲染和导出校验
- 用户无需从空白画布重建首稿的主要结构
- 示例数据、真实数据和推导数据具有明确来源标识

### M2：AI 修改与手动精修

目标：让用户通过对话完成主要修改，并用手动控件处理精确调整和兜底。

交付范围：

- 支持新增模块、替换图表、调整布局和改写摘要等局部指令
- 展示 Agent 变更范围、校验结果和前后差异
- AI 修改以 command batch 提交，可整体撤销
- 新增、删除、复制和替换卡片或卡片组
- 补齐内容、字段、组件目录、属性面板和响应式预览
- 项目复制、重命名、自动保存、版本历史和版本恢复
- 缺少数据或能力时使用明确的降级表达

阶段门槛：

- 连续局部修改不会产生无效 workspace 或破坏已有手工设置
- 每次 Agent 修改可解释、可预览、可回退
- 用户可在对话与手动编辑之间切换，不丢失另一侧的改动

### M3：数据连接与发布

目标：从一次性生成工具升级为可持续使用的业务产品。

交付范围：

- CSV、Excel、JSON 和受控 REST API
- 字段识别、类型修正、质量提示和数据预览
- 指标、维度、聚合、格式与时间口径管理
- 受控查询、缓存、刷新任务和失败重试
- 草稿与发布版本分离
- 发布 URL、访问权限、嵌入代码、HTML、图片和 PDF

阶段门槛：

- 数据刷新不改变组件身份和手工布局
- 发布版本固定指向不可变 revision
- 数据源凭证不进入浏览器、workspace、成品或模型上下文

### M4：企业平台

目标：满足多团队、安全和规模化交付。

候选范围：

- 组织、租户、RBAC、行级权限和审计
- SSO、私有化部署和嵌入式运行态
- PostgreSQL、MySQL 和重点 SaaS 连接器
- 品牌资产、组织模板、组件治理和审批发布
- 配额、计费、任务监控、告警和运行审计
- 在实际需求验证后评估评论协作或实时协同

## 当前优先队列

交互式 BI 图表运行时 `M0-M7` 阶段门槛已全部通过：ChartSpec 与共享 Builder、客户端 ECharts 双渲染、在线语义查询、筛选与跨图联动、层级下钻、刷新与 Dataset SSE、Dashboard 生成固定 Report 副本，以及受控 Custom Series 与治理均有合同、故障和浏览器证据。详细产品边界、数据流和验收见 `docs/architecture/interactive-bi-runtime.md`；后续扩展继续复用同一门槛，不开放任意 Option 或 JavaScript。

按依赖顺序推进：

1. 在有效密钥环境验证远程 Provider Gateway 的真实首稿和局部命令质量
2. 在已完成的 Project ACL、组织成员管理、组织归属、组织审计、OIDC 共享身份映射、人工成员 session-revocation outbox 和 PostgreSQL audit-anchor outbox 边界上，实现邀请/SCIM 的统一成员生命周期，并在真实独立 sink 验证锚定留存、freshness 与告警
3. 在已完成 Project、AI、数据、发布、导出模块拆分、editor runtime ESM 化、共享 workspace-core、renderer adapter、持久化 session 和共享 API client 后，按 `studio-web-app-boundary.md` 逐步形成正式前端应用
4. 增加 PostgreSQL 等优先数据库连接器，并将凭证、任务和会话迁移到可横向部署的基础设施
5. 建立组织模板、组件治理与发布审批，再评估评论或实时协同

框架选型不能早于核心协议和边界验证；原型交互继续推进，但不得继续把新的产品状态只堆进单文件 DOM 逻辑。

企业身份与审计的实现顺序已固定：先实现 OIDC Authorization Code + PKCE 与不可变 subject 到组织成员的映射，再以统一成员生命周期接入邀请和 SCIM，最后接入异步外部审计链头锚定。默认禁用 JIT 组织入驻；锚定失败必须可观测，但不得回滚已提交业务写入。详细合同见 `docs/architecture/identity-and-audit-boundary.md`。

## Skill 分发策略

Skill 与 Studio 分别交付，不能把 Studio 依赖塞进便携 Skill，也不能为了缩小体积删掉完成任务所需的规则。

便携 Skill 必须包含：

- `SKILL.md` 与平台薄适配 `agents/openai.yaml`
- 全部必要 `references/`，通过按需读取控制上下文，而不是删除规则
- `assets/templates/starter.html` 与版本化轻量色板
- workspace schema 和小型图表/图标语义目录
- 用于检查文件完整性、schema、色板和模板同步的确定性脚本

便携 Skill 不包含：

- `node_modules`
- Phosphor、ECharts 等完整第三方运行库
- Studio UI、常驻服务、数据库或用户项目数据
- 调试截图、临时输出和本地缓存

发布前必须从显式包清单构建 ZIP，并在临时目录解包运行契约检查。完整资源缺失时按 `references/runtime.md` 降级，但不得遗漏页面结构、数据语义、可访问文字或导出规则。

## 产品指标

- 首次生成成功率：生成后 workspace 通过 schema 和渲染校验
- 首次可用率：用户无需重建即可保留并继续编辑生成结果
- 修改成功率：局部指令只改变目标范围
- 恢复可靠性：刷新、版本恢复和迁移后内容与布局一致
- 交付成功率：发布或导出产物可独立打开且无编辑器依赖
- 完成时间：从导入数据到获得首个可发布 Dashboard 的耗时

## 风险控制

- 不让 Agent 直接操作任意 SQL、凭证或原始 DOM
- 不让视觉编辑器状态兼任数据模型和发布模型
- 不在 schema 稳定前拆成多个发布包
- 不以增加组件数量替代真实用户闭环验证
- 每阶段只有通过验收门槛后才扩大数据源、协作或企业范围

## 相关文件

| 文件 | 关系 |
|------|------|
| `PRODUCT.md` | 产品定位、目标用户和稳定原则 |
| `PROJECT.md` | 当前所处阶段和正在推进的工作 |
| `docs/ARCHITECTURE.md` | 当前已实现的模块和边界 |
| `docs/DECISIONS.md` | 关键路线与架构决策原因 |
| `HANDOFF.md` | 当前轮次的短期交接 |
