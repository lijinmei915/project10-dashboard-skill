# Skill 与 Studio 运行边界

## 可移植核心

任何 Agent 都可以只携带以下内容运行：

- `SKILL.md` 与 `references/`：需求路由、设计规则和验收方式
- `assets/templates/starter.html`：standalone HTML 起始骨架
- `schemas/dashboard-workspace.schema.json`：工程状态交换协议
- 确定性导出脚本：将工程状态固化为无编辑器依赖的 HTML

纯 Skill 模式不能依赖本地 HTTP 服务。缺少 Studio 时，Agent 使用语义默认图标和预设图表，仍须生成完整可用的成品。

## 可选 Studio

Studio 是 Skill 的增强运行时，负责：

- 可视化编辑和实时预览
- 完整图标库、中文别名、搜索与 SVG 清洗
- 后续的完整图表库、图表推荐和静态 SVG 渲染
- 工程状态保存、迁移和导出

Studio 可以更重，但不得让其依赖进入默认成品。

## 交换协议

Skill、Studio 和导出器只通过版本化 workspace JSON 交换状态。当前协议版本为 `2`，定义见 `schemas/dashboard-workspace.schema.json`。

- `theme` 保存视觉选择和稀疏局部覆盖
- `layout` 保存分组、卡片顺序和 12 列跨度
- `logo` 保存可选的可迁移资源
- `resources` 只保存选中结果的结构化描述，不保存全量索引或运行库

新增字段应保持可选；破坏性调整必须提升 `version` 并提供迁移逻辑。

## 导出策略

- 默认静态成品：图标和图表固化为内联 SVG，移除 Studio UI、脚本和 API 地址
- 可选交互成品：只在用户明确要求交互时，按实际使用能力加入最小运行时
- 工程文件：保留 workspace JSON，供任意兼容 Agent 或 Studio 继续编辑

完整 Phosphor、ECharts 或 AntV 资源只属于 Agent/Studio 侧，不属于默认导出文件。

## Agent 图表接口

本地 Studio 使用 ECharts SSR 生成 SVG，当前只开放受控模型：`line / area / bar / pie`。

- `GET /api/charts/catalog?q=趋势`：按中文或英文语义搜索图表类型
- `POST /api/charts/render`：接收 `type / labels / series / width / height / palette` 并返回 SVG

接口不接受任意 ECharts option、函数、HTML formatter 或事件处理器。返回 SVG 会再次移除脚本、事件属性和 `foreignObject`。
