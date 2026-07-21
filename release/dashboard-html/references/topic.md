# Dashboard Layout Reference

> 用途：定义轻量生成式 UI dashboard 的视觉基线、布局选择和多端规则。

## 页面基线

- 复用 `assets/templates/starter.html` 的视觉 token、主题逻辑和响应式基础；固定模块、section 顺序和占位内容可按需求替换或删除。
- 默认：页面背景 `#f5f7fa`、容器最大宽度 `1160px`、桌面左右内边距 `24px`、移动端 `16px`、section 间距 `28px`。
- starter 不包含 KPI、图表、表格或可见占位；正文完全按请求生成。
- 固定的是视觉基线与页面骨架，不是业务模块、数量或顺序。

## 默认 Token

| Token | 默认值 |
|---|---|
| Page background | `#f5f7fa` |
| Card background | `#ffffff` |
| Card shadow | `0 2px 10px rgba(15,23,42,0.04)` |
| Card radius / padding | `14px` / `20px` |
| Dense card padding | `16px` |
| Accent / soft | `#ff7a2f` / `rgba(255,122,47,0.12)` |

## 主题

- 默认浅色；深色使用 page `#111827`、surface `#1f2937`、muted surface `#172033`、主文字 `#f9fafb`、次文字 `#cbd5e1`。
- 深色输出必须保留完整的 `html[data-theme="dark"]` token 覆盖和 `color-scheme: dark`；只改 `data-theme` 或 `:root` 无效。
- 只切换主题时，只改颜色 token（必要时阴影 token）；不改字号、行高、间距、布局、尺寸、圆角或结构，也不自行做可读性优化。
- 主题色可为任意明确 CSS 色值或中文/英文颜色名；只覆盖 `--accent`、`--accent-soft`，用于选中态和非语义强调，不替换成功、提醒、错误状态色。
- 主题色覆盖放在 `:root` 与 `html[data-theme="dark"]` 之后，使用 `html[data-theme]`，确保两种模式均生效；不生成页面内主题切换控件。

## 卡片与内容

- `surface` 使用默认 card token，无外描边；只有层次不足时才用 `1px solid rgba(15,23,42,0.04)`。
- `content-area` 是 card 内的图表、列表、媒体或自定义内容区；`placeholder` 只在无真实内容时保留。
- 用户只要求换布局时，保留 starter 的背景、圆角、阴影、留白和 header，不重做视觉语言。

## 布局原语

| 原语 | 适用场景 | 不要用于 |
|---|---|---|
| `surface` | 独立卡片或面板 | 与其他原语竞争；它是基础承载单元 |
| `grid` | 同级重复单元、横向比较 | 有明确主辅关系的内容 |
| `split` | 主内容与辅助区并列 | 两侧同级的重复单元 |
| `stack` | 纵向连续的小块、说明、事件、操作 | 复杂复合区域；此时升级为 `surface` |
| `canvas` | 图表、地图、媒体、嵌入内容 | 普通说明或短列表 |
| `table-area` | 行列型、字段型、可扫描明细 | 以浏览大块内容为主的区域 |

组合顺序：先判断外层是否为 `surface`，再按内部结构选 `grid`、`split`、`stack`、`canvas` 或 `table-area`。`grid`、`split`、`stack` 可嵌套，但不要为了完整而使用全部原语。

## 快速路由

| 用户目标 | 默认组合 |
|---|---|
| 摘要、KPI、并列模块 | `grid` + `surface` |
| 主图表加说明或告警 | `split` + `surface`；主区 `canvas`，辅助区 `stack` |
| 事件、状态、操作、筛选 | `surface` + `stack` |
| 表格、记录、结构化明细 | `surface` + `table-area` |
| 大面积图表、地图、媒体 | `surface` + `canvas` |
| 未指定组件 | 先按内容判断；不要自动补 KPI、图表或待办 |

## 排版与多端

- 页面标题 > section 标题 > 正文/注释；一个 card 通常只保留一个主标题层级。
- 桌面可使用 2-4 列 `grid` 或主辅 `split`；列宽由内容决定，不写死。
- 窄屏下多列降为 2 列或 1 列，`split` 堆叠为单列；表格允许横向滚动，但关键内容不得挤压或溢出。
- 不用重阴影、厚边框、复杂动画、玻璃拟态或超宽表格传达关键信息。
