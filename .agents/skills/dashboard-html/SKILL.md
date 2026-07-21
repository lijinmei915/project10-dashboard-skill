---
name: dashboard-html
description: >
  Create or refine a lightweight standalone HTML dashboard for generative UI. Use when the user asks for a dashboard, KPI overview, analytics panel, status page, internal report page, or card-based HTML UI that must work across desktop and mobile. Triggers include requests to make a dashboard, redesign a dashboard layout, keep a dashboard lightweight, preserve card-based structure, or produce standalone dashboard HTML from the local starter template.
---

# Dashboard Card Layout Skill

> Package refreshed: 2026-07-21

## What This Skill Preserves

This skill keeps dashboard output:

1. Layout-flexible: allow different module combinations and layout primitives
2. Style-stable: preserve the starter template's visual baseline unless the user explicitly asks for a visual redesign
3. Responsive by default: keep the result usable across desktop, tablet, and mobile

中文说明：
生成轻量的 dashboard 独立 HTML 页面，默认从本地模板出发，并按参考文件控制布局、输出和验收。

## 可选视觉设置

用户可在提示词中指定深色或浅色，也可指定任意明确的主题色名称或 CSS 色值，例如 `蓝色`、`墨绿`、`#0f766e`。未指定时，默认浅色与橙色主题；对话决定页面的初始主题，不生成页面内切换控件。主题色只影响非语义强调，不改变成功、提醒、错误等状态色。

## Boundaries

- Do not introduce a large-scale token architecture, complex animation system, or unnecessary component taxonomy.
- Keep `SKILL.md` light: prefer `references/` and `assets/templates/starter.html` for concrete rules.
- Output must stay in standalone HTML and must remain usable on desktop and mobile.

## Workflow

1. Reuse `assets/templates/starter.html` for visual tokens, theme logic, and responsive foundations; do not inherit its fixed modules, section order, or placeholder content.
2. Route layout and theme choices such as summary, split view, stack, canvas, table-like content, dark mode, or any explicit theme accent through `references/topic.md`.
3. Route output guardrails such as HTML completeness, header retention, starter style preservation, and visual baseline through `references/output.md`.
4. Validate the result with `references/testing.md`.

## Verification

- Use the sample prompts in `references/test-cases.md` and check the manual acceptance list in `references/testing.md`.
