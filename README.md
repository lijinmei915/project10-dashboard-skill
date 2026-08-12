---
layer: entry
type: guide
last_verified: 2026-08-10
depends_on: [PROJECT.md, AGENTS.md, docs/SKILL_ENGINEERING.md, docs/ROADMAP.md]
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
- `/.agents/skills/dashboard-html/schemas/dashboard-workspace.schema.json`
  Portable state contract shared by agents, Studio, and exporters.
- `/.agents/skills/dashboard-html/scripts/`
  Deterministic checks and the optional local Studio preview service.
- `/docs/SKILL_ENGINEERING.md`
  Higher-level notes about how the skill is structured and maintained.
- `/docs/ROADMAP.md`
  Product-platform milestones, scope boundaries, and acceptance gates.

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
- `schemas/dashboard-workspace.schema.json`
- `schemas/dashboard-generation.schema.json`

The skill works without the local Studio. Start the optional enhanced preview with:

```bash
npm install
npm start
```

Studio provides full icon search, chart rendering, controlled AI generation, revision history and export. Exported HTML remains standalone and does not depend on the Studio service.

The Studio defaults to its deterministic local provider. To use the server-side OpenAI Responses adapter, explicitly set `DASHBOARD_AI_PROVIDER=openai`, `DASHBOARD_AI_MODEL`, and `OPENAI_API_KEY` before `npm start`. The key never enters the browser, workspace, portable Skill, or exported HTML. Detailed variables and limits are documented in `docs/ENVIRONMENT.md`.

### Distribution

Recommended distribution unit:

- `/.agents/skills/dashboard-html/`

Latest package download:

- [dashboard-html.zip](https://github.com/lijinmei915/project10-dashboard-skill/releases/download/v0.2.1/dashboard-html.zip)
- Last package refresh: `2026-07-21`
- Status: verified downloadable legacy package; it predates the current platform-planning and editor changes

`v0.2.1` contains the original minimal `SKILL.md`, platform adapter, `topic/output` references, and starter template. It does not yet contain the newer workspace schema, palette, runtime/testing references, or package contract checks, so it should not be treated as the next complete portable release.

The next portable package contract keeps:

- `SKILL.md`
- `agents/openai.yaml`
- `assets/templates/starter.html`
- `assets/palette.v1.json`
- required `references/*.md`
- `schemas/dashboard-workspace.schema.json`
- `schemas/dashboard-generation.schema.json`
- small semantic catalogs and deterministic contract checks

The portable package excludes `node_modules`, complete icon/chart runtimes, the Studio service, user data, and local caches. Rules remain complete through on-demand references; lightweight distribution does not mean deleting required behavior.

Build and verify the next portable ZIP with:

```bash
npm run build:skill
```

The command copies only `package.manifest.json` entries, unpacks the ZIP, runs its packaged contract check, and writes `dist/dashboard-html-0.3.0-dev.zip`. This is a release candidate only; building it does not publish or tag a release.

This skill is distributed as source files because:

- the source directory remains directly usable without compilation
- there is no compiled runtime artifact
- the downloadable ZIP uses a packaging step only to prevent missing or accidental files

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

### Optional Visual Settings

You may add either or both of these to a prompt:

- Theme: `light` or `dark`
- Theme accent: any clear color name or CSS color value, such as `blue`, `墨绿`, or `#0f766e`

When omitted, the skill uses a light theme with an orange accent. The
conversation determines the initial theme; generated pages do not include a
theme switcher. The accent changes non-semantic emphasis only; success,
warning, and error colors keep their meaning.

```txt
Use $dashboard-html to create a responsive project status dashboard.
Use dark mode with a teal theme accent, and preserve semantic status colors.
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

Minimal visual base source (no fixed dashboard modules):

- [`starter.html`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/.agents/skills/dashboard-html/assets/templates/starter.html)

## Collaboration Docs

- [`AGENTS.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/AGENTS.md)
- [`PROJECT.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/PROJECT.md)
- [`HANDOFF.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/HANDOFF.md)
- [`docs/ROADMAP.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/docs/ROADMAP.md)
- [`docs/SKILL_ENGINEERING.md`](/Users/heqiao/Desktop/Claude练习/项目10-dashboard%20skill/docs/SKILL_ENGINEERING.md)
