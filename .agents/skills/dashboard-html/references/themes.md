# Theme and Header Reference

> 用途：定义生成时可选择的视觉预设，以及头部和分组标题的可变表达。

Dashboard 与 Report 共享底层 token 预设，但对用户展示不同的候选名称：Dashboard 为 `标准看板 / 企业分析 / 极简看板 / 运营深色`，Report 为 `品牌报告 / 企业报告 / 简洁报告 / 诊断报告`。切换页面类型只调整候选项，不得自动切换当前预设或改动用户已有配置。

## 配置层级

```txt
visualTheme  -> 页面整体色彩、字体、标题层级、圆角和阴影
mode         -> 浅色 / 深色 token 集合
headerStyle  -> 页面头部的表现方式
headerAlign  -> 页面头部的对齐方式
pageBackground -> 页面连续画布底色
sectionStyle -> 分组标题的表现方式
cardTitleSize -> 卡片标题字号
cardTitleIcon -> 普通卡片标题的可选图标装饰
cardTitleIconColor -> 标题图标使用中性色或主题色
kpiLayout    -> 指标卡上下排列或图标在左的左右排列
chartPalette -> 单色或彩色图表配色
accent       -> 非语义强调色 seed，由主题契约派生正文适配色
```

标题图标的形态与配色必须分离：`line / soft / solid` 只决定线型、浅色底或实色底，`neutral / accent` 决定中性色或主题色。默认使用中性色，避免所有卡片标题同时竞争视觉注意力。

主题色作为 seed 时采用“原色优先”：文字或结构使用场景中，原色达到大字/图形 `3:1` 或普通文字 `4.5:1` 的目标对比度时必须保留原值；只有不达标时才保持色相并调整明度。非文字装饰可直接使用原色，图表继续使用固定色板的邻近色相。

卡片阴影使用四档：`none / weak / medium / strong`，界面文案为“无 / 轻 / 中 / 重”。浅色与深色模式必须使用各自的阴影 token；阴影变化不得改变边框、布局、间距或卡片尺寸。

这些配置只改变视觉表达。Dashboard / Report 的编排由 `page-types.md` 决定；内容、组件数量、布局原语、列数、section 顺序和移动端堆叠规则由用户需求和 `topic.md` 决定。

## Visual Themes

| Preset | 方向 | 默认 mode | 适用场景 |
|---|---|---|---|
| `fx-orange` | 标准橙、浅灰页面、白色 surface、弱阴影、多色图表 | `light` | 标准看板 |
| `enterprise-blue` | 稳重蓝色、冷色页面、清晰边界 | `light` | 企业分析、业务管理 |
| `report-light` | 暖白页面、低对比 surface、青绿色强调 | `light` | 偏阅读的简洁视觉，可用于 Dashboard 或 Report |
| `operations-dark` | 深色页面、深色 surface、橙色状态强调 | `dark` | 运营、监控、运维 |

### Preset token baseline

这些是预设的起始值，不是业务内容模板。未列出的 token 继承 starter 基线；语义状态色仍使用独立的 success / warning / danger token。

| Preset | Page / surface | Muted surface | Text / secondary | Accent / soft | Shadow / radius |
|---|---|---|---|---|---|
| `fx-orange` | `#f5f7fa` / `#ffffff` | `#f8fafc` | `#111827` / `#6b7280` | `#ff8000` / `rgba(255,128,0,.12)` | `0 2px 10px rgba(15,23,42,.04)` / `10px` |
| `enterprise-blue` | `#f4f7fb` / `#ffffff` | `#f7faff` | `#172033` / `#60708a` | `#2563eb` / `rgba(37,99,235,.11)` | `0 2px 10px rgba(37,99,235,.05)` / `12px` |
| `report-light` | `#f7f5ef` / `#fffefa` | `#f1eee6` | `#20251f` / `#6d746b` | `#147d72` / `rgba(20,125,114,.12)` | `0 1px 4px rgba(32,37,31,.04)` / `10px` |
| `operations-dark` | `#10151f` / `#1b2430` | `#222d3b` | `#f4f7fb` / `#b9c4d2` | `#ff9b54` / `rgba(255,155,84,.15)` | `0 2px 10px rgba(0,0,0,.18)` / `12px` |

选择预设后，仍须保留 starter 的完整主题 token 结构。深色必须使用完整 `html[data-theme="dark"]` 覆盖和 `color-scheme: dark`；预设不能只改页面背景。

### Preset boundaries

- `fx-orange` 是默认，不需要用户确认。
- `enterprise-blue`、`report-light`、`operations-dark` 只在用户指定或明确要求对应视觉方向时使用。
- 用户明确指定 accent 时，将其写入 `--accent-seed`，再派生完整 accent token；不覆盖语义状态色。
- 用户只要求切换浅色/深色时，保留 `visualTheme`、`headerStyle`、`sectionStyle`、字号、间距、圆角、尺寸和结构不变。
- 不把预设实现成多份完整 HTML；只覆盖 token 和样式变体。

## Accent Token Contract

用户只提供一个主题色 seed，组件不得直接消费 seed。生成时必须提供以下语义 token：

```css
--accent-seed;       /* 用户选择的真实主题色，只用于实色品牌承载 */
--accent-structure;  /* 适配当前 surface 后的结构强调色 */
--accent-soft;       /* 同色相浅底或深色 soft surface */
--accent-on-soft;    /* accent-soft 上的可读文字与图标 */
--accent-on-solid;   /* accent-seed 上自动选择的黑色或白色文字 */
--accent-line;       /* 分组横线、摘要分隔线等弱结构色 */
--icon-accent;       /* 低饱和图标色 */
--icon-soft;         /* 图标浅底 */
--icon-on-solid;     /* 图标实色底前景 */
--chart-accent;      /* 固定色板中最接近主题色相的一色 */
--chart-bi-1;        /* 双色主色 */
--chart-bi-2;        /* 双色相邻色 */
--accent: var(--accent-structure); /* 仅作旧样式兼容 */
```

派生规则：

- `--accent-structure` 与所在 page / surface 的对比度至少 `3:1`。深色模式保持色相并提高明度；浅色模式保持色相并在需要时降低明度。
- `--accent-on-soft` 与 `--accent-soft` 的文字对比度至少 `4.5:1`。
- `--accent-on-solid` 在 `#18181b` 与 `#ffffff` 中选择对 `--accent-seed` 对比度更高者。
- 饱和度低于约 `8%` 的黑、白、灰 seed 没有稳定色相：浅色使用可见深灰结构色，深色使用可见浅灰结构色。
- `--accent-line` 必须能随主题色识别，但弱于 `--accent-structure`；普通卡片边框仍使用中性 `--line-soft`。
- `--icon-accent` 保留主题色相，但降低饱和度；图标不得直接读取高饱和 `--accent-seed`。
- `--chart-accent` 从产品固定 8 色分类色板中选择与 accent seed 色相距离最近的一色。
- `--chart-bi-1 / --chart-bi-2` 从同一固定色板中选择与主题色相距离最近的两色，不重新计算明度或饱和度。

组件映射：分组竖线、摘要竖线使用 `--accent-structure`；分组横线、摘要分隔线使用 `--accent-line`；图标使用 `--icon-accent / --icon-soft / --icon-on-solid`；band 头部使用 `--accent-seed + --accent-on-solid`。图表单色、双色和彩色共用一套 AntV/G2 固定色板；成功、警告、危险、信息色保持独立。

## Theme Surface Contract

主题 seed 还必须轻量影响页面的三个 surface 层级，但不得直接把大面积背景设为原色：

| 层级 | Token | 浅色 seed 混入 | 深色 seed 混入 |
|---|---|---:|---:|
| 报告外部画布 | `--outer-bg` | `2%` | `2%` |
| 报告页面背景 | `--page-bg` | `1%` | `3%` |
| 卡片背景 | `--surface` | `0–0.5%` | `4%` |

`--surface-muted` 同样使用弱主题染色，浅色约 `2%`、深色约 `6%`。混色以当前视觉预设的中性 surface 为底，不覆盖文字层级和语义状态色。

- Report 保留 `outer-bg -> page-bg -> surface` 三层，使整页外壳和卡片可辨认。
- Dashboard 没有报告外壳，外部画布与 `page-bg` 合并，只保留页面与卡片两层。
- 用户显式选择 `pageBackground: neutral / custom` 时，只覆盖 `page-bg`；卡片 surface 仍可保留弱主题染色。
- 派生 accent 的对比度计算必须使用染色后的真实 `--surface`，不能继续使用染色前的基础色。

## Chart Palette

```txt
auto         -> 单系列单色、双系列双色、三系列及以上与饼图分类多色
monochrome   -> 使用固定色板中最接近主题色相的一色
bichrome     -> 使用固定色板中最接近主题色相的两色
categorical  -> 不同类别或系列使用产品固定 8 色分类色板
```

`auto` 是标准看板默认值，根据图表类型和系列数量解析为其余三种模式；饼图、环图和玫瑰图始终按分类多色。`monochrome` 按主题色相从固定色板取最近一色；`bichrome` 取最近两色；`categorical` 使用完整固定色板。色值、可见项排序、多色和多色渐变规则以 `color-system.md` 与 `assets/palette.v1.json` 为准。不得把单系列时间序列或单系列柱状图按数据项交替着色。

## Card Overrides

单卡覆盖优先级为：`card override > global setting > preset default`。

- chart 卡可覆盖 `data-chart-palette` 和 `data-card-title-icon`。
- KPI 卡可覆盖 `data-kpi-icon` 和 `data-icon-color="neutral|accent"`。
- generic 卡可覆盖 `data-card-title-icon`。
- “跟随全局”必须删除对应单卡属性，而不是复制当前全局值。
- 单卡覆盖不得改变卡片内容、布局跨度、圆角、阴影或线框。

## Header Styles

头部样式可以独立于 `visualTheme` 选择。starter 已提供可选槽位：品牌、eyebrow、标题、副标题、头部元信息和操作区。没有内容的槽位必须隐藏。

| `headerStyle` | 表现 |
|---|---|
| `auto` | Dashboard 使用 `minimal`，Report 使用 `surface`；显式覆盖后不再跟随页面类型 |
| `minimal` | 透明紧凑头部：标题和必要元信息直接位于页面画布上，无独立容器 |
| `surface` | 使用卡片 surface 承载标题区，适合 Report |
| `tinted` | 使用 `accent-soft` 或 `surface-muted` 形成轻量头部承载区，不使用强渐变 |
| `brand` | 品牌/报告头部：允许 Logo 或品牌名槽位，标题层级更突出 |
| `compact` | 高密度后台头部：缩小上下留白，保留标题和必要元信息 |
| `band` | 使用主题色块承载头部，文字必须保持对比度 |
| `hidden` | 完全隐藏头部，仅用于页面已嵌入其他系统且外层已有标题时 |

头部样式允许改变背景承载、标题字号层级、标签样式、标题间距、元信息位置和操作区对齐；不改变页面容器宽度、正文布局和移动端堆叠规则。

参考报告型页面时，可使用 `headerStyle: brand`，但 Logo、品牌副标题和操作入口仍是可选内容，不得自动补齐。

`headerAlign: auto` 时 Dashboard 居左、Report 居中；`left` 或 `center` 是显式覆盖，切换主题时不得改写。

## Page Background

| `pageBackground` | 表现 |
|---|---|
| `auto` | 使用当前视觉预设的 `--page-bg` |
| `neutral` | 使用适配当前深浅模式的中性画布 |
| `accent-soft` | 将少量 accent 混入中性画布，不改变卡片底色 |
| `custom` | 使用用户指定色值写入 `--page-bg-custom` |

自定义页面底色如果恰好与卡片底色相同，且线框和阴影都为 `none`，必须自动补 `1px solid var(--line-soft)`；不得让卡片边界消失。其他组合不自动改写用户选择。

## Page Texture

| `pageTexture` | 表现 |
|---|---|
| `none` | 无纹理，默认值 |
| `dots` | 低对比点阵 |
| `grid` | 低对比细网格 |
| `lines` | 低对比横线 |

纹理使用纯 CSS 和 `--texture-color` 生成，颜色约为当前主文字的 `7%`，仅作用于外部画布与页面背景。卡片、图表承载区和表格单元保持纯色；纹理不改变底色、布局、字号、间距或尺寸。

## Page Text Contrast

页面文字与卡片文字必须分开计算：

- `--page-text-main / --page-text-secondary` 按最终 `--page-bg` 计算，普通文字对比度至少 `4.5:1`。
- `--text-main / --text-secondary` 按最终 `--surface` 计算，不因用户设置深色页面底色而改成浅色卡片文字。
- 透明头部和分组标题读取 page text；surface、brand 头部和卡片读取 surface text；band 头部读取 `--accent-on-solid`。
- 自定义页面底色不能只替换背景 token，必须同时重新计算 page text token。

## Section Header Styles

分组标题是主题的一部分，但不决定 section 内容。使用 starter 的 `.section-header`、`.section-heading`、`.section-index`、`.section-title` 和 `.section-note`。

Studio 的分组标题装饰可使用 `marker-glow`：左侧为 `6px × 12px` 的主题色短标，并以主题浅色形成 `3px` 柔光。`sectionDivider: trailing` 使用从 `--accent-line` 到透明的右侧渐隐横线，不使用贯穿整行的实色硬线。这两项只改变标题视觉，不改变分组结构、顺序或内容。

KPI 图标不向用户暴露形态、容器和颜色的任意组合，而使用固定样式：无、主题/多色线型、主题/多色面型、主题/多色浅底、主题/多色光感、主题/多色反白。默认是无底的“主题线型”，单卡额外支持“跟随整组”。固定样式仍序列化到 `kpiIcon / kpiIconContainer / kpiIconColor`，保持 Workspace 和导出兼容。选择器中的主题预览必须读取当前主题派生图标色；多色使用 fx-ui-report-skill 的橙、蓝、绿、紫四组 KPI 色，并以四枚独立色块表达。画布中的多色语义是多张 KPI 分别使用 `#FF8000→#FFB347`、`#2563EB→#60A5FA`、`#16A34A→#4ADE80`、`#8B5CF6→#C4B5FD`，不是在一张图标中混合多个色相；卡片少于四张时按卡片总数均匀抽取。

“主题光感 / 多色光感”使用线型图标和 `glow` 容器，替代旧“深底线型”。容器默认 `34px` 方形、`16px` 图标、`135deg` 同色渐变和同色柔影。容器颜色必须读取每卡 `--icon-solid / --icon-solid-alt`；多色模式按 KPI 分类色分别呈现，不能把全部 KPI 强制为同一主题色。

“主题浅底 / 多色浅底”的线型 glyph 与对应无底线型保持相同视觉粗细；浅底不再使用整体 `84%` 缩放，并在较小标准尺寸上使用轻量 path 轮廓补偿，避免 glyph 缩小后线条变细。面型和反白样式可继续按容器密度控制 glyph 比例。

KPI 图标大小只提供“标准 / 大”两档，默认标准。无底图标的标准/大分别使用 `40px / 48px` 占位盒与 `23px / 28px` glyph；带底图标的标准/大分别使用 `34px / 40px` 容器与 `21px / 23px` glyph。历史 `small` 统一迁移为 `medium / 标准`，不再向用户显示“小 / 中 / 大”三档。

| `sectionStyle` | 表现 |
|---|---|
| `plain` | 普通分组标题，标题和辅助说明左右对齐 |
| `indexed` | 可选编号或短标签 + 分组标题，适合报告型页面 |
| `accent-rule` | 标题旁使用细 accent 线或小标记，不使用厚边框 |
| `compact` | 更小的标题间距和辅助文字，适合信息密集页面 |

没有编号、图标或辅助说明时隐藏对应槽位。不得因为选择 `indexed` 就自动生成固定的 `01/02/03` section，也不得改变 section 顺序。

## Title Hierarchy Tokens

所有预设都应保持以下语义层级，具体值可随预设轻微变化：

```css
--font-size-page-title
--font-size-section-title
--font-size-surface-title
--font-size-subtitle
--font-size-meta
--font-weight-page-title
--font-weight-section-title
--font-weight-surface-title
--line-height-title
--line-height-body
```

页面标题 > 分组标题 > 卡片标题 > 正文 / 辅助说明。主题可以改变字号、字重、行高和标题间距，但不能抹平这四级层次。

标准看板的卡片标题默认 `16px`，允许使用 `12 / 14 / 16 / 18 / 20px` 档位。分组标题隐藏时，卡片标题仍须保留；没有标题内容时直接省略标题节点，不生成空槽位。

`cardTitleIcon` 默认 `none`。启用时使用与卡片语义匹配的内联 SVG，并通过 `.surface-title-icon` 承载；`line` 只显示线型图标，`soft` 使用主题浅色底，`solid` 使用主题实色底。它只改变普通卡片标题装饰，不影响 KPI 图标、分组标题、内容或布局。没有合适语义图标时保持 `none`，不得为了装饰重复使用同一个图标。
