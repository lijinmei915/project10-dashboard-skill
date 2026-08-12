---
layer: knowledge
type: spec
last_verified: 2026-08-11
depends_on: [docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/SECURITY.md]
---

# Studio Web App Boundary

> Purpose: define the migration boundary from the preview shell to a formal Studio web application.
> Update when: routing, application state ownership, build delivery, or API contracts change.
> Do not include: a framework decision before deployment requirements are agreed.

## Migration Rule

The current preview shell remains the interaction reference and continues to serve lightweight local development. A formal `studio-web` application is introduced beside it, never embedded in the Skill or standalone export.

```txt
studio-web
  -> Studio API client
  -> workspace-core / generation protocol
  -> renderer adapters
  -> Preview or standalone exporter
```

The server remains the authority for authentication, organization, Project, Revision, Dataset, Publication, Audit and provider access. Browser state is only an editable projection of a revision or draft.

`/studio/projects`, `/studio/projects/:projectId`, `/studio/organizations/current` and `/studio/publications/:publicationId` are now stable browser entry points. During migration they resolve to the existing editor shell, while `studio/studio-router.mjs` owns path parsing and delegates activation through narrow Project Center or Publication Center APIs. A publication deep link first resolves its authoritative publication, restores the owning Project, then opens and selects the publication record. The legacy preview filename remains a local compatibility route, not the product URL.

`studio/workspace-core-client.mjs` is the only Studio browser import boundary for the portable workspace core. It currently re-exports the shared implementation, preserving one protocol truth while allowing a future independently deployed Studio bundle to replace only that adapter source.

## Static Build Boundary

`npm run build:studio` creates the independently deployable browser build in `dist/studio-web/`. It contains only `index.html`, browser-owned `studio/*` modules, a local `workspace-core-runtime.mjs` copy and a deterministic `build-manifest.json` with byte counts and SHA-256 digests. Node services, repositories, tests, credentials, Skill documentation, Dataset records, Projects and publications are excluded. The portable Skill remains a separate 29-file artifact.

The source adapter continues to import the portable core from its repository path. The build rewrites only the output copy of `workspace-core-client.mjs` to use `./workspace-core-runtime.mjs`, so source ownership and protocol truth do not fork.

The initial deployment contract is root-mounted and same-origin:

- `/studio/*` uses `/index.html` as its SPA fallback.
- `/studio/*` browser modules and `/api/*` share one origin so HttpOnly Cookie and Origin checks retain their current security model.
- OIDC callback URLs use that same public origin and remain server routes.
- `/api/*`, `/p/*` and `/embed/*` bypass the SPA fallback. Publication authorization remains server-side.
- Until asset filenames are content-hashed, HTML, JavaScript and the manifest use `Cache-Control: no-cache` or equivalent revalidation. Only a future hashed JavaScript pipeline may use immutable caching.

The Node gateway accepts an optional `DASHBOARD_STUDIO_WEB_ROOT` and applies this contract after all API, publication and embed handlers. Missing JavaScript assets return `404` rather than the HTML fallback. `npm run start:studio` builds and starts this same-origin topology for local conformance testing. Reverse-proxy deployments additionally set an explicit `DASHBOARD_PUBLIC_ORIGIN`; CSRF and OIDC callback validation use this trusted value rather than forwarding headers or the backend's internal Host.

## Application Routes

| Route | Responsibility | Authorization |
|------|----------------|---------------|
| `/studio/projects` | project list, creation and archive navigation | viewer+
| `/studio/projects/:projectId` | workspace editor, AI composer, history and data | Project ACL
| `/studio/organizations/current` | organization profile, members, generation operations and audit | organization admin
| `/studio/publications/:publicationId` | publication management | Project ACL
| `/p/:publicationId` | published artifact | Publication policy
| `/embed/:publicationId` | embedded artifact | Publication policy

`/p/*` and `/embed/*` never load editor modules. A standalone HTML export remains self-contained and has no Studio API client, auth UI, project history or provider runtime.

## State Ownership

| State | Owner | Browser behavior |
|-------|-------|------------------|
| identity and session | server / HttpOnly Cookie | request status only |
| organization and members | Organization Repository | cached read, server mutation |
| Project, Revision and ACL | Project Repository | optimistic command/revision requests |
| Dataset and Semantic Model | Data Source Repository | selected identity and bounded preview |
| candidate generation | Generation Service | isolated, discardable preview |
| generation operations metrics | Generation Job Service | organization-admin aggregate read only |
| layout and visual draft | workspace-core | local dirty projection, never authority |
| publication artifact | Publication Repository | immutable read only |

## Migration Gates

Before a formal framework application is created, the following must be true:

1. API contracts have browser tests for token, organization, Project ACL, generation, Dataset, publication and audit errors.
2. The editor bridge exposes only typed operations; no module reaches into another module's private DOM state.
3. Preview and standalone exporter both pass their existing deterministic and responsive checks.
4. Build output can be deployed separately from the Skill package and from published artifacts. `build:studio` and its deterministic boundary test now meet the build portion of this gate.
5. Chosen deployment documents its origin, cookie, OIDC callback and asset-cache rules. Automated HTTP conformance now proves local same-origin fallback, MIME/cache headers, API/publication route exclusion, an internal-Host reverse proxy, Secure Cookie, public-origin CSRF and exact OIDC redirect matching; real TLS ingress and IdP infrastructure remain deployment evidence.

## Non-Goals

- Do not select React, Vue, Vite or another runtime solely to replace working ESM modules.
- Do not move Provider credentials, raw Dataset records, token values or audit seals into browser state.
- Do not make an SPA router responsible for publication authorization.
- Do not remove the local preview shell until the formal app covers its generation, edit, history, export and accessibility regressions.
