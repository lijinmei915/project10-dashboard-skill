---
layer: knowledge
type: spec
last_verified: 2026-08-11
depends_on: [docs/architecture/generation-pipeline.md, docs/TESTING.md]
---

# Generation Evaluation

> 用途：定义 AI 首稿和局部精修的可重复质量评测、评分与发布阈值。
> 什么时候更新：评测案例、rubric、Provider 质量门槛或报告字段变化时。
> 不要写什么：真实 API key、用户 prompt、Project 数据或单次调试输出。

## 评测层级

1. 协议测试证明候选可校验、可修复、可预览和可回退。
2. `npm run eval:generation` 证明一组固定业务意图达到结构、语义、来源和可编辑性阈值。
3. `npm run smoke:provider` 在部署环境验证一次真实远程首稿与精修链路。
4. 远程发布候选还应使用同一 eval suite 运行 `DASHBOARD_AI_PROVIDER=openai npm run eval:generation:provider`，不能用 smoke 成功替代质量评测。

## Suite

`evals/generation-cases.json` 是版本化评测数据集。当前覆盖：

- 销售趋势 Dashboard
- 带筛选和视图切换的运营 Dashboard
- 项目交付 Report
- 渠道占比环形图
- 客户排行条形图
- 合成销售数据在 portable 与 non-portable 两种策略下的字段、指标、可见值、来源和泄漏边界
- 目标组件面积图精修

案例只包含合成业务描述、非敏感 fixture 和结构期望，不包含用户数据或凭证。带数据案例通过正式 `parseDataSource -> createDataContext` 路径构建输入，不在 evaluator 复制数据解析逻辑。Refine 案例引用同套件的 draft 输出，并在运行时解析目标组件，不依赖模型生成固定 ID。

## Rubric

每个案例将适用检查的权重归一为 100 分。公共硬门槛为 `preview-ready` 和最多一次修复。Draft 继续评分 section/组件覆盖、组件类型、页面类型、图表与控件意图、provenance 完整性、唯一组件 ID 和 Layout 引用闭合。Refine 评分预期类型、目标组件确实变化、非目标组件深度不变和组件身份稳定。

真实数据 grounding 案例额外要求：

- 所有数据型组件引用预期 Dataset，来源条目保留同一 `dataInputId`
- 可移植 Dataset 的 KPI、图表、排行和表格都有结构化 binding，字段存在于 DataContext
- 聚合操作与 Semantic Model 一致
- KPI 格式化值、图表标签/数值、排行项和表格行与 Query Snapshot 或便携 records 一致
- `provenance.mode` 为 `real`，页面不显示“示例数据”
- portable records 仅在案例明确允许时进入 workspace

同一 fixture 同时覆盖两种交付策略：portable 模式要求 records 与 binding 完整闭合；non-portable 模式要求 workspace 中没有 Dataset records 和客户端 binding，只固化服务端 Query Snapshot 派生的 KPI、图表、排行与聚合表。两者都必须保持真实来源标记和可核对的可见值。

负向单测会篡改绑定字段、图表或聚合表可见值，并向 non-portable workspace 注入 records；必须分别触发字段、visible-value 与 portability 失败。叙事组件可以继承真实来源说明，但不会被误判为直接数据绑定组件。

当前发布阈值：

- 单案例至少 85 分
- 平均至少 90 分
- 通过率 100%

Runner 达不到阈值时退出码非零。`eval:generation` 强制确定性 provider，避免 CI 环境变量触发远程费用；`eval:generation:provider` 才读取显式 Provider 配置。默认只输出摘要和失败项，追加 `-- --json` 输出完整机器报告。报告不包含 prompt、workspace、Provider 响应或凭证，不创建 Project、Revision 或 Publication。

## 边界

- 确定性 provider eval 是 CI 回归基线，不代表真实模型质量。
- 远程 eval 使用显式模型 ID 和服务端密钥；模型或 prompt protocol 变化后必须重跑。
- 自动 rubric 只证明可机器验证的产品约束，不替代视觉人工评审、真实用户任务完成率或领域数据口径验收。
- Fixture、evaluator 和报告属于 Studio/CI，不进入便携 Skill。
- 调整阈值必须记录原因，不能为了让失败模型通过而静默降低门槛。
