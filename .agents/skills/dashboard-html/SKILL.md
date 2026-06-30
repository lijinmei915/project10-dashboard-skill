---
name: dashboard-html
description: >
  Create or refine a lightweight standalone HTML dashboard for generative UI. Use when the user asks for a dashboard, KPI overview, analytics panel, status page, internal report page, or card-based HTML UI that must work across desktop and mobile. Start from the local starter template and apply the referenced layout and output rules.
---

# Dashboard Card Layout Skill

## Role

Create lightweight standalone HTML dashboards for generative UI.

中文说明：
生成轻量的 dashboard 独立 HTML 页面，默认从本地模板出发，并按参考文件控制布局、输出和验收。

## Boundaries

- Do not introduce a large-scale token architecture, complex animation system, or unnecessary component taxonomy.
- Keep `SKILL.md` light: prefer `references/` and `assets/templates/starter.html` for concrete rules.
- Output must stay in standalone HTML and must remain usable on desktop and mobile.

## Workflow

1. Start from `assets/templates/starter.html`.
2. If the user request implies layout choices such as summary, split view, stack, canvas, or table-like content, route those choices through `references/topic.md`.
3. Read the primitive layout rules in `references/topic.md` and the output constraints in `references/output.md` only when needed.
4. Validate the result with `references/testing.md`.

## Verification

- Run the sample prompts in `examples/` and check the manual acceptance list in `references/testing.md`.
