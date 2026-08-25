---
layer: skill-reference
type: spec
last_verified: 2026-08-13
---

# 图表语义目录

> 用途：定义 AI、Studio、workspace 和导出器共享的图表唯一语义。
> 什么时候更新：新增图表 ID、数据形状或选型规则时。
> 不要写什么：一次性页面文案或具体业务数据。

| ID | 中文名 | 唯一语义 | 数据形状 |
|---|---|---|---|
| `line` | 折线图 | 时间或有序维度的变化趋势 | 分类轴 + 一个或多个系列 |
| `time-series` | 时序图 | 按真实日期或时间戳展示趋势，可带阈值线 | 时间戳 + 一个或多个系列 + 可选 thresholds |
| `area` | 面积图 | 强调随时间变化的规模或累计量 | 分类轴 + 一个或多个系列 |
| `combo-bar-line` | 柱线复合图 | 在同一分类轴上同时比较一个柱状指标和一个折线指标，适合不同量纲的双指标趋势 | 分类轴 + 柱系列 + 折线系列 + 可选双 Y 轴 |
| `bar` | 基础柱图 | 单系列分类数值对比 | 分类轴 + 单系列 |
| `grouped-bar` | 分组柱图 | 同一分类下多个系列并排比较 | 分类轴 + 至少两个系列 |
| `stacked-bar` | 堆叠柱图 | 同时比较分类总量及其组成 | 分类轴 + 至少两个系列 |
| `percent-stacked-bar` | 百分比堆叠柱图 | 比较不同分类内部的构成比例 | 分类轴 + 至少两个系列，渲染时归一化为 100% |
| `histogram` | 直方图 | 连续数值的频数分布 | 单系列原始数值样本，渲染时自动分箱 |
| `horizontal-bar` | 基础条图 | 长标签分类数值对比 | 分类轴 + 单系列 |
| `grouped-horizontal-bar` | 分组条图 | 同一分类下多个系列横向并排比较 | 分类轴 + 至少两个系列 |
| `stacked-horizontal-bar` | 堆叠条图 | 横向比较分类总量及组成 | 分类轴 + 至少两个系列 |
| `percent-stacked-horizontal-bar` | 百分比堆叠条图 | 横向比较分类内部构成比例 | 分类轴 + 至少两个系列，渲染时归一化为 100% |
| `diverging-bar` | 双向条图 | 围绕零轴比较两个方向或对立群体 | 分类轴 + 两个系列 |
| `ranking-bar` | 排名图 | 按数值降序展示 Top N 和名次 | 分类轴 + 单系列 |
| `gantt` | 甘特图 | 在时间轴上表达任务开始和持续时长 | 任务标签 + 开始系列 + 工期系列 |
| `pie` | 环形图 | 一个总体内部的分类占比 | 分类标签 + 单系列非负数值 |
| `sector-pie` | 饼图 | 用实心扇区表达一个总体内部的分类占比 | 分类标签 + 单系列非负数值 |
| `rose` | 玫瑰图 | 用扇区半径强化分类规模差异 | 分类标签 + 单系列非负数值 |
| `bullet` | 子弹图 | 同时比较实际值、目标线和绩效区间 | 分类标签 + 实际系列 + 目标系列 + 可选 ranges |
| `gauge` | 仪表盘 | 展示单个当前值在有意义范围和阈值中的位置 | 单个数值 + 最小/最大范围 + 可选阈值 |
| `radar` | 雷达图 | 比较对象在多个统一维度上的能力轮廓 | 维度标签 + 一个或多个对象系列，各维度口径需一致 |
| `funnel` | 漏斗图 | 展示有序阶段中的规模递减与转化流失 | 有序阶段 + 单系列非负数值 |
| `data-table` | 表格 | 查询精确值并逐行对照多个字段 | 行标签 + 一个或多个数值列 |

## 选择规则

- “多层柱图、并列柱图、簇状柱图”统一映射为 `grouped-bar`。
- “堆积柱图、累计柱图”统一映射为 `stacked-bar`。
- “100% 堆叠、百分百堆叠”统一映射为 `percent-stacked-bar`。
- “频数、频率、区间、连续数值分布”映射为 `histogram`，不要映射为普通柱图。
- “排行、榜单、Top N”映射为 `ranking-bar`，不要仅用基础条图冒充排名语义。
- “项目排期、任务排期、里程碑计划”映射为 `gantt`。
- 数据不满足目标形状时，先补充系列或请求用户确认，不要用另一个图表冒充。
- 普通“趋势、走势”使用 `line`；明确出现时间戳、监控、阈值或时间轴时使用 `time-series`。
- “饼图”使用 `sector-pie`，“环图/环形图”使用兼容 ID `pie`，“玫瑰图”使用 `rose`。
- “子弹图、实际与目标、目标达成对比、绩效区间”映射为 `bullet`；第一系列是实际值，第二系列是目标值，不用普通分组条图冒充目标线。
- “仪表盘、进度仪表、完成率仪表、健康分仪表”映射为 `gauge`；只用于一个当前值相对明确上下界和阈值的位置，不用于历史趋势、分类对比或多个无关 KPI。
- “柱状图叠加折线图、柱线组合、复合图、双轴图”映射为 `combo-bar-line`；第一条 series 固定为柱状指标，第二条 series 固定为折线指标，不能用多条柱或多条线替代。
- “能力模型、多维对比、指标画像”映射为 `radar`；不同系列必须共享同一组维度。
- “转化路径、阶段流失、销售漏斗”映射为 `funnel`；阶段必须按业务顺序提供。
- “明细表、精确值、多字段对照”映射为 `data-table`，用于读取具体值而非观察视觉趋势。

### 看板级表格配置

`data-table` 可在图表组件的 `props.table` 使用以下受控配置：

- `sort: none | asc | desc` 与 `sortBy`：按指定数值列排序。
- `limit: 1-20`：只展示 Top N 行。
- `formats[]`：按列设置 `prefix / suffix / decimals`。
- `conditional: true`：强调每个数值列中的最大值。
- `summary: true`：在末行展示当前可见行合计。

搜索、筛选、分页、固定列、行选择、展开详情和文件导出属于独立 `table` 组件，不进入 SVG 图表协议。

### 柱线复合图配置

`combo-bar-line` 是受控的双指标图表，不接受任意 ECharts Option、`formatter`、`renderItem` 或 JavaScript。它必须满足：

- `series` 必须正好两条，第一条是柱状指标，第二条是折线指标；两条 series 的值数量必须与分类轴一致。
- 默认 `dualAxis: true`，柱状指标使用左侧 Y 轴，折线指标使用右侧 Y 轴。两条指标同量纲且需要直接对照时，才允许显式关闭双轴。
- `barUnit` 和 `lineUnit` 是可选的短单位文本，例如 `万元`、`%`、`ms`；它们只影响轴名和刻度显示，不改变原始数据。
- 不具备两条真实指标时，不得复制同一指标伪造复合图；应请求补充指标或选择 `bar` / `line`。首版 AI 生成没有双指标数据绑定时只生成受控示例，不宣称已绑定业务数据。

Dashboard 使用客户端 ECharts Canvas，以支持 tooltip、图例、选择、下钻和刷新；Report 使用同一份 ChartSpec Option Builder 输出服务端 SVG。客户端图表异常时降级为 `grouped-bar`，不能留下空白容器。

### KPI 迷你趋势配置

KPI 当前值与历史趋势使用两个独立的受控绑定：`binding.kind = aggregate` 计算当前值，`trendBinding.kind = series` 按真实维度聚合历史序列。两者必须引用同一授权 Dataset 并共享筛选条件，但不得把当前值绑定重复解释为历史。

- `trendBinding` 只允许用于 KPI，包含 `categoryField / valueField / operation` 和可选 `limit: 7 | 12 | 30`。
- 已物化数据写入 `props.sparkline.labels / values`，两者必须对齐，长度为 2-30，值必须有限；可选 `unit` 只影响 Tooltip 文案。
- Dashboard 使用客户端 ECharts，提供 Tooltip、axisPointer 和受控点击意图；Report 与便携导出使用静态 SVG，不加载客户端 ECharts。
- 在线 KPI 分别执行当前值和趋势查询，再合并到同一组件；刷新、筛选和 last-known-good 对两者使用同一运行时边界。
- 没有真实时间或顺序维度、有效点少于 2 个时不显示趋势。禁止从单值、环比、同比、目标或随机数推演历史序列。

### 仪表盘配置

`gauge` 读取第一条 series 的第一个值，并在 `props.gauge` 使用以下受控配置：

- `min / max`：数值范围，`max` 必须大于 `min`。
- `unit`：中心数值后缀，例如 `%`、`分` 或 `ms`。
- `precision: 0-4`：中心数值小数位。
- `thresholds[]`：范围内、升序的阈值边界；它们不是额外数据系列。

单值仪表盘不显示图例。值超出范围时在显示位置上截断到边界，原始业务值应在数据进入 workspace 前完成口径校验。

### 子弹图配置

`bullet` 读取第一条 series 为实际值、第二条 series 为目标值，并在 `props.bullet` 使用以下纯 JSON 配置：

- `min / max`：统一数值范围，`max` 必须大于 `min`。
- `unit`：坐标轴与 Tooltip 数值后缀。
- `precision: 0-4`：Tooltip 小数位。
- `ranges[]`：最多三个范围内、升序的绩效区间边界。

子弹图由已打包的版本化扩展注册表生成受控 ECharts Custom Series。Workspace 和 ChartSpec 不保存 `renderItem`、formatter、任意 Option 或 JavaScript；扩展异常时降级为基础横向条图，Report 仍必须输出 SVG。
