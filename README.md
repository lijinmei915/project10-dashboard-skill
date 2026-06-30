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

### Trigger

- Skill name: `$dashboard-html`
- Output format: `standalone HTML`
- Best for: `dashboard`, `analytics panel`, `status page`, `internal report page`, `generic card-based UI`

### Install Or Share

If someone only needs the skill itself, share this directory:

- `/.agents/skills/dashboard-html/`

That folder already includes:

- `SKILL.md`
- `agents/openai.yaml`
- `assets/templates/starter.html`
- `references/*.md`
- `examples/*.md`

### Distribution

Recommended distribution unit:

- `/.agents/skills/dashboard-html/`

Latest package download:

- [dashboard-html.zip](https://github.com/lijinmei915/project10-dashboard-skill/releases/download/v0.1.0/dashboard-html.zip)

Keep these files:

- `SKILL.md`
- `agents/openai.yaml`
- `assets/templates/starter.html`
- `references/topic.md`
- `references/output.md`
- `examples/*.md`

No `dist` directory is required.

This skill is distributed as source files because:

- there is no build step
- there is no compiled runtime artifact
- the skill directory itself is the final usable form

### Usage Rules

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

Another example:

```txt
Use $dashboard-html to build a lightweight dashboard in standalone HTML.
Make it responsive across desktop, tablet, and mobile.
Do not lock the content into fixed business widgets.
```

### What The Skill Will Try To Preserve

- a single centered page shell
- lightweight card-based dashboard structure
- responsive behavior across desktop, tablet, and mobile
- generic layout primitives instead of hard-coded business modules
- editable placeholders when the user does not define exact content

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
