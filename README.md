---
layer: entry
type: guide
last_verified: 2026-06-30
depends_on: [PROJECT.md, AGENTS.md, docs/SKILL_ENGINEERING.md]
---

# project10-dashboard-skill

Lightweight standalone HTML dashboard skill for generative UI.

This repository packages a small Codex skill focused on generating or refining dashboard-style HTML pages that:

- stay in standalone HTML
- work across desktop, tablet, and mobile
- use lightweight layout primitives instead of rigid business components
- preserve a reusable starter template for card-based dashboards

## What Is In This Repo

- `/.agents/skills/dashboard-html/`
  The main skill directory.
- `/.agents/skills/dashboard-html/SKILL.md`
  Skill entry, role, boundaries, and workflow.
- `/.agents/skills/dashboard-html/assets/templates/starter.html`
  The local starter template for dashboard generation.
- `/.agents/skills/dashboard-html/references/`
  Layout, output, testing, and prompt reference docs.
- `/docs/SKILL_ENGINEERING.md`
  Higher-level notes about how the skill is structured and maintained.

## Skill Positioning

- Name: `dashboard-html`
- Format: `standalone HTML`
- Primary use case: `generative UI dashboards`
- Design goal: `lightweight, editable, responsive, and content-agnostic`

## Layout Model

The skill is intentionally based on generic layout primitives instead of fixed dashboard modules.

Current primitives:

- `surface`
- `stack`
- `grid`
- `split`
- `canvas`
- `table-area`

These rules are documented in:

- [`references/topic.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/references/topic.md)

## How To Use

Use the skill when you want Codex to create or refine a lightweight dashboard page such as:

- KPI overview
- analytics panel
- status page
- internal report page
- generic card-based dashboard shell

Example prompt style:

```txt
Use $dashboard-html to create a responsive standalone HTML dashboard.
Keep the layout generic, avoid business-specific components, and preserve editable placeholders.
```

## Testing

Suggested validation lives here:

- [`references/testing.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/references/testing.md)
- [`references/test-cases.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/references/test-cases.md)
- [`references/test-log-template.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/references/test-log-template.md)

Starter template preview source:

- [`starter.html`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/assets/templates/starter.html)

## Collaboration Docs

- [`AGENTS.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/AGENTS.md)
- [`PROJECT.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/PROJECT.md)
- [`HANDOFF.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/HANDOFF.md)
- [`docs/SKILL_ENGINEERING.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/docs/SKILL_ENGINEERING.md)
