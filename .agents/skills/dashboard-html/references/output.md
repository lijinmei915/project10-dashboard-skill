# Output Rules

> 用途：定义独立 HTML dashboard 的交付底线。

## 必须满足

- 输出完整独立 HTML（含 `<!DOCTYPE html>`、`html`、`head`、`body`），复用 `assets/templates/starter.html` 的视觉 token、主题逻辑和响应式基础，而非固定模块。
- 默认保留 page header 和 card / surface 信息组织；Dashboard 使用全宽流式内容区，Report 使用阅读宽度，除非用户明确覆盖。
- 支持 `pageType: dashboard | report`；按 `references/page-types.md` 选择默认编排，不把页面类型绑定到视觉预设。
- 支持 `visualTheme`、`headerStyle`、`pageBackground` 和 `sectionStyle` 的明确选择；未指定时使用 `fx-orange`、自动头部、主题默认底色和普通分组样式。
- 头部与分组标题使用 starter 已有的可选槽位；未提供 Logo、编号、更新时间、辅助说明或操作时隐藏对应槽位。
- Dashboard 中每张独立卡片已有标题或 KPI 标签时，可隐藏分组标题且不得留下占位高度；Report 默认保留章节标题。
- Dashboard 自动头部必须与页面画布连续，不使用独立大白块或外层大圆角；Report 使用统一整页外壳，并由 surface 承载自动头部。
- 自定义页面底色恰好与卡片同色且线框、阴影都关闭时，自动补极浅边线；除此之外不得顺手改变用户的线框和阴影设置。
- 卡片标题使用 `--font-size-surface-title`，默认 `14px`，只从规定档位调整，不用基础字号间接猜测。
- 普通卡片标题图标默认不显示；启用后使用内联 SVG，导出单文件不得依赖外部图标资源，也不得连带改变 KPI 图标。
- 选择非默认 `visualTheme` 时，按 `references/themes.md` 写入对应 token 覆盖，并保留 `data-visual-theme` 元数据；不能只改一个 accent 色值冒充完整预设。
- 复用 starter 的弱阴影、圆角、间距和 token；只在空内容根节点内生成请求所需内容，不添加可见占位。
- starter 已有对应组件或布局 class 时直接复用，只填内容，不重写其背景、圆角、阴影、间距或排版；仅对未覆盖的新内容类型新增样式。
- 页面同时适配桌面、平板和手机；多列与侧栏在窄屏自然收缩或堆叠，触控区域不拥挤。
- 需要固化用户布局时，使用 `data-section-id`、`data-item-id`、`data-layout` 和 `data-span`；最终 HTML 只保留布局结果，不包含拖动手柄、尺寸菜单或设计工具代码。

## 主题与边界

- 深色模式使用完整 `html[data-theme="dark"]` token 覆盖和 `color-scheme: dark`，不能只改 `data-theme` 或 `:root`。
- 只切换主题时，非颜色属性和页面结构保持原样；不自行加入可读性优化或页面内主题切换控件。
- 主题色写入 `--accent-seed`，并完整派生 `--accent-structure / --accent-soft / --accent-on-soft / --accent-on-solid / --accent-line`；图表使用独立固定色板，成功、提醒、错误等语义色保持含义。
- 同一 seed 轻量派生 `--outer-bg / --page-bg / --surface / --surface-muted`；Report 保留三层背景，Dashboard 合并外部画布与页面背景。
- 页面纹理由独立 `pageTexture` 控制，只使用纯 CSS 作用于画布，不进入卡片或依赖外部资源。
- 图表声明 `data-chart-palette="monochrome|bichrome|categorical"`；单色和双色使用 `--chart-accent / --chart-bi-1 / --chart-bi-2` 从固定 AntV/G2 色板按色相最近邻取色，彩色使用完整 `--chart-1...6`，双色仅用于真实的两组数据或二分类。
- 单卡覆盖使用稳定 `data-item-id` 与卡片自身的视觉 `data-*` 属性固化；编辑选中态、上下文控件和 `data-selected` 不得进入成品 HTML。
- 选择视觉预设或头部/分组标题样式时，只改变 token 和表现方式，不改变内容、模块数量、布局原语、section 顺序或移动端规则。
- 只切换 `pageType` 时，保留视觉主题、深浅模式、主题色、字号、圆角、阴影和用户数据，只调整编排策略。
- 不自动补 KPI、图表、筛选、导出、动画、厚边框、重阴影、玻璃拟态或另一套组件语言。
- 调整分组顺序、同组卡片顺序、列数或跨度时，不改写内容、主题 token、组件样式和语义层级；不使用绝对定位。

## 交付检查

- [ ] 完整 HTML，保留 header、starter 视觉基线和真实内容区
- [ ] 深色模式有完整 token 覆盖与 `color-scheme: dark`
- [ ] 只切主题时，非颜色属性与结构未变化
- [ ] 主题色未改写语义状态色
- [ ] 桌面、平板、手机均可用，多列在窄屏收缩或堆叠
- [ ] 最终交付不包含布局编辑控件；手机端布局为单列且无横向溢出
