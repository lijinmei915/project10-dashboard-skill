import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendProjectRevision, createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { exportProjectRevision } from "../.agents/skills/dashboard-html/scripts/revision-exporter.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));

test("persists projects atomically, restores after restart, and rejects stale concurrent writes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-project-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = createProjectRepository({ directory });
  const seed = createProject({ id: "project-durable", name: "持久化项目", createdAt: "2026-08-10T02:00:00.000Z" });
  const first = await repository.update(seed.id, { expectedRevisionId: null, seed }, (project) => appendProjectRevision(project, {
    id: "revision-1",
    createdAt: "2026-08-10T02:00:01.000Z",
    source: "agent",
    workspace: fixture.workspace
  }));
  assert.equal(first.currentRevisionId, "revision-1");

  const restartedRepository = createProjectRepository({ directory });
  assert.deepEqual(await restartedRepository.get(seed.id), first);
  assert.deepEqual((await restartedRepository.list()).map(({ id, revisionCount }) => ({ id, revisionCount })), [{ id: seed.id, revisionCount: 1 }]);

  const write = (id) => restartedRepository.update(seed.id, { expectedRevisionId: "revision-1" }, (project) => appendProjectRevision(project, {
    id,
    createdAt: `2026-08-10T02:00:0${id.endsWith("2") ? "2" : "3"}.000Z`,
    source: "user",
    workspace: fixture.workspace
  }));
  const results = await Promise.allSettled([write("revision-2"), write("revision-3")]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.match(rejected.reason.message, /stale/);
  assert.equal((await restartedRepository.get(seed.id)).revisions.length, 2);
});

test("exports an immutable revision to deterministic standalone HTML", () => {
  const firstWorkspace = structuredClone(fixture.workspace);
  firstWorkspace.document.title = `<script>alert("x")</script> 销售看板`;
  let project = appendProjectRevision(createProject({ id: "project-export", name: "确定性导出", createdAt: "2026-08-10T03:00:00.000Z" }), {
    id: "revision-export-1",
    createdAt: "2026-08-10T03:00:01.000Z",
    source: "agent",
    workspace: firstWorkspace
  });
  const secondWorkspace = structuredClone(firstWorkspace);
  secondWorkspace.document.title = "第二版销售看板";
  project = appendProjectRevision(project, {
    id: "revision-export-2",
    createdAt: "2026-08-10T03:00:02.000Z",
    source: "user",
    workspace: secondWorkspace
  });
  const first = exportProjectRevision(project, "revision-export-1");
  const repeated = exportProjectRevision(project, "revision-export-1");
  const second = exportProjectRevision(project, "revision-export-2");
  assert.equal(first.html, repeated.html);
  assert.equal(first.sha256, repeated.sha256);
  assert.notEqual(first.sha256, second.sha256);
  assert.match(first.html, /^<!DOCTYPE html>/);
  assert.match(first.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; 销售看板/);
  assert.doesNotMatch(first.html, /<script>alert\("x"\)<\/script>/);
  assert.doesNotMatch(first.html, /design-drawer|ai-composer|provider-gateway|preview-server|node_modules/);
  assert.match(first.html, /data-component-id="opportunity-trend"/);
});

test("revision export preserves every workspace section, component, span, and provenance marker", () => {
  const project = appendProjectRevision(createProject({ id: "project-renderer-parity", name: "渲染一致性", createdAt: "2026-08-11T12:00:00.000Z" }), {
    id: "revision-renderer-parity",
    createdAt: "2026-08-11T12:00:01.000Z",
    source: "agent",
    workspace: fixture.workspace
  });
  const { html } = exportProjectRevision(project);
  const componentIds = fixture.workspace.document.sections.flatMap(({ components }) => components.map(({ id }) => id));
  const exportedComponentIds = [...html.matchAll(/data-component-id="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(exportedComponentIds, componentIds);
  assert.equal(new Set(exportedComponentIds).size, componentIds.length);
  assert.match(html, new RegExp(`data-page-type="${fixture.workspace.theme.pageType}"`));
  assert.match(html, new RegExp(`data-theme="${fixture.workspace.theme.mode}"`));
  assert.match(html, new RegExp(`<span class="sample-label">${fixture.workspace.document.sampleDataLabel}</span>`));

  const layoutSpans = new Map(fixture.workspace.layout.sections.flatMap(({ items }) => items.map(({ id, span }) => [id, span])));
  for (const section of fixture.workspace.document.sections) {
    assert.match(html, new RegExp(`data-section-id="${section.id}"`));
    assert.match(html, new RegExp(`<h2>${section.title}</h2>`));
    for (const component of section.components) {
      assert.match(html, new RegExp(`data-component-id="${component.id}" style="--span:${layoutSpans.get(component.id)}"`));
      assert.match(html, new RegExp(`<h3>${component.title}</h3>`));
    }
  }
});
