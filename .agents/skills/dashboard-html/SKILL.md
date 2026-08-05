---
name: dashboard-html
description: >
  Create or refine a lightweight standalone HTML dashboard for generative UI. Use when the user asks for a dashboard, KPI overview, analytics panel, status page, internal report page, or card-based HTML UI that must work across desktop and mobile. Triggers include requests to make a dashboard, redesign a dashboard layout, keep a dashboard lightweight, preserve card-based structure, or produce standalone dashboard HTML from the local starter template.
---

# Dashboard Card Layout Skill

> Package refreshed: 2026-08-05

## What This Skill Preserves

This skill keeps dashboard output:

1. Layout-flexible: allow different module combinations and layout primitives
2. Style-stable: preserve the starter template's visual baseline unless the user explicitly asks for a visual redesign
3. Responsive by default: keep the result usable across desktop, tablet, and mobile

中文说明：
生成轻量的 dashboard 独立 HTML 页面，默认从本地模板出发，并按参考文件控制布局、输出和验收。

## 可选视觉设置

用户可在提示词中指定：

- `pageType`：`dashboard` 或 `report`；未指定时按用户主要阅读任务判断。
- `visualTheme`：整体视觉预设；未指定时使用 `fx-orange`。
- `mode`：浅色或深色；未指定时使用浅色。
- `headerStyle`：`auto`、`minimal`、`surface`、`tinted`、`brand`、`compact`、`band` 或 `hidden`；`auto` 下 Dashboard 使用极简透明头部，Report 使用 surface 头部。
- `headerAlign`：`auto`、`left` 或 `center`；`auto` 下 Dashboard 居左、Report 居中。
- `pageBackground`：`auto`、`neutral`、`accent-soft` 或自定义色值；未指定时跟随视觉主题。
- `pageTexture`：`none`、`dots`、`grid` 或 `lines`；默认无纹理，纹理只作用于页面画布，不覆盖卡片。
- `sectionStyle`：分组标题处理方式；未指定时使用 `plain`。
- `contentWidth`：`auto`、`fluid` 或 `readable`；`auto` 下 Dashboard 全宽、Report 使用阅读宽度。
- `sectionVisibility`：`auto`、`visible` 或 `hidden`；`auto` 下 Dashboard 可省略分组标题、Report 显示章节标题。
- `cardTitleSize`：卡片标题字号；默认 `14px`，可使用 `12 / 14 / 16 / 18 / 20px`。
- `cardTitleIcon`：普通卡片标题图标样式，可使用 `none / line / soft / solid`；默认 `none`，与 KPI 图标独立。
- `cardTitleIconColor`：普通卡片标题图标配色，可使用 `neutral / accent`；默认中性色，并允许单卡覆盖。
- `kpiLayout`：指标卡内容排列，可使用 `stacked / horizontal`；默认上下排列，并允许单张 KPI 卡片覆盖。
- `chartPalette`：图表配色方式，可使用 `monochrome / bichrome / categorical`；默认 `monochrome`。单色和双色按主题色相从固定 AntV/G2 色板取最近的一色或两色，彩色使用完整色板。
- `accent`：任意明确的主题色名称或 CSS 色值，例如 `蓝色`、`墨绿`、`#0f766e`。

`pageType` 只决定默认编排策略，规则见 `references/page-types.md`。主题预设和头部/分组样式只改变视觉表达，不固定内容、模块数量、布局原语或 section 顺序，详细选项见 `references/themes.md`。用户没有指定时直接路由，不先弹选择表单。

卡片可使用稳定 `data-item-id` 和 `data-card-type="chart|kpi|generic"` 接受单卡视觉覆盖。全局设置是默认值，卡片自身的 `data-chart-palette / data-card-title-icon / data-kpi-icon / data-icon-color` 优先；没有单卡属性时必须继续继承全局。

对话决定页面的初始主题，不生成页面内主题切换控件。主题色作为 `accent seed` 输入，并按 `references/themes.md` 派生结构色、浅底、对比前景、实色前景、弱结构线和页面 surface 层级；图表按 `chartPalette` 使用独立的固定单色或彩色色板，不跟随主题色，也不改变成功、提醒、错误等状态色。

## Boundaries

- Do not introduce a large-scale token architecture, complex animation system, or unnecessary component taxonomy.
- Keep `SKILL.md` light: prefer `references/` and `assets/templates/starter.html` for concrete rules.
- Output must stay in standalone HTML and must remain usable on desktop and mobile.
- Complete icon libraries, aliases, and search stay in the Agent runtime. Output only the selected sanitized inline SVGs; never add an icon-library or API dependency to the exported HTML.
- Section title icons are selected per section. Do not force one user-selected icon across every section.

## Workflow

1. Reuse `assets/templates/starter.html` for visual tokens, theme logic, and responsive foundations; do not inherit its fixed modules, section order, or placeholder content.
2. Route Dashboard vs Report through `references/page-types.md`; route visual preset, mode, header style, section style, and accent through `references/themes.md`; route layout choices through `references/topic.md`.
3. When exchanging editable state with an Agent or Studio, follow `references/runtime.md` and `schemas/dashboard-workspace.schema.json`.
4. Route output guardrails such as HTML completeness, optional header slots, starter style preservation, and visual baseline through `references/output.md`.
5. Validate the result with `references/testing.md`.

## Verification

- Use the sample prompts in `references/test-cases.md` and check the manual acceptance list in `references/testing.md`.
