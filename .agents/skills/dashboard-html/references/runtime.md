# Skill 与 Studio 运行边界

## 产品原则

生成端可以使用完整资源，默认交付端只保留结果。能力不足时允许降低表现能力，但必须保留数据、文字层级和可访问语义，不得输出空图标、空图表、断开的资源地址或失效控件。

## 能力路由

按以下顺序检测并选择当前任务的能力模式，不要求用户先理解运行环境：

1. 完整模式：本地 Agent/Studio API 可用时，使用 Phosphor 搜索与 ECharts SSR。
2. 通用 Agent 模式：没有 Studio，但宿主具备图标、图表或包管理能力时，仅在生成期使用宿主资源。
3. 便携降级模式：上述能力均不可用时，执行确定性降级，不阻塞整个页面交付。

### 图标降级

- 优先使用宿主可信图标库提供的 SVG，最终只内联选中的 SVG。
- 无可信图标资源时，移除可选图标和对应空容器，保留明确文字标签；不得手绘近似品牌图标或输出破损占位。
- 状态含义必须同时由文字、数值或标签表达，不能只依赖图标。

### 图表降级

- 优先使用 ECharts SSR 或宿主成熟图表引擎生成静态 SVG。
- 无图表引擎时，将同一结构化数据转成语义等价的数据表、排行列表、进度列表或 KPI 摘要；保留标题、单位、时间范围和来源说明。
- 不得留下空 canvas、伪造趋势、凭空补数据或用装饰图形冒充真实图表。

### 交互例外

默认导出静态结果。只有用户明确要求筛选联动、实时刷新、缩放、悬停明细或其他交互时，才加入实际使用能力所需的最小运行时，并在导出前确认离线与数据安全边界。

## 可移植核心

任何 Agent 都可以只携带以下内容运行：

- `SKILL.md` 与 `references/`：需求路由、设计规则和验收方式
- `assets/templates/starter.html`：standalone HTML 起始骨架
- `assets/palette.v1.json`：几 KB 的固定分类色、状态色和中性色数据
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
- `theme.paletteVersion` 可选记录固定色板版本；缺省时按当前 skill 版本处理
- `layout` 保存分组、卡片顺序和 12 列跨度
- `logo` 保存可选的可迁移资源
- `resources` 只保存选中结果的结构化描述，不保存全量索引或运行库

新增字段应保持可选；破坏性调整必须提升 `version` 并提供迁移逻辑。

## 导出策略

- 默认静态成品：图标和图表固化为内联 SVG，移除 Studio UI、脚本和 API 地址
- 可选交互成品：只在用户明确要求交互时，按实际使用能力加入最小运行时
- 工程文件：保留 workspace JSON，供任意兼容 Agent 或 Studio 继续编辑

完整 Phosphor、ECharts 或 AntV 资源只属于生成期的 Agent/Studio 或宿主能力，不属于默认导出文件。

## Agent 图表接口

本地 Studio 使用 ECharts SSR 生成 SVG，当前只开放受控模型：`line / area / bar / pie`。

- `GET /api/charts/catalog?q=趋势`：按中文或英文语义搜索图表类型
- `POST /api/charts/render`：接收 `type / labels / series / width / height / palette` 并返回 SVG

接口不接受任意 ECharts option、函数、HTML formatter 或事件处理器。返回 SVG 会再次移除脚本、事件属性和 `foreignObject`。
