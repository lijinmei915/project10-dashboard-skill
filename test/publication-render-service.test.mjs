import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPublicationRenderService } from "../.agents/skills/dashboard-html/scripts/publication-render-service.mjs";
import { renderStandaloneWorkspace } from "../.agents/skills/dashboard-html/scripts/revision-exporter.mjs";

const workspaceFixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8")).workspace;

const artifact = {
  filename: "render-test.html",
  html: "<!DOCTYPE html><html><head><style>html,body{margin:0}main{height:320px;background:#fff;color:#111}</style></head><body><main>Dashboard render test</main></body></html>"
};

test("renders publication HTML to bounded PNG and PDF artifacts", async () => {
  const renderer = createPublicationRenderService({ timeoutMs: 15_000 });
  const png = await renderer.render(artifact, { format: "png", width: 800 });
  assert.equal(png.mediaType, "image/png");
  assert.equal(png.filename, "render-test.png");
  assert.deepEqual([...png.bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.bytes.readUInt32BE(16), 800);
  assert.equal(png.bytes.readUInt32BE(20), 900);
  const pdf = await renderer.render(artifact, { format: "pdf", width: 800 });
  assert.equal(pdf.mediaType, "application/pdf");
  assert.equal(pdf.filename, "render-test.pdf");
  assert.match(pdf.bytes.subarray(0, 8).toString("ascii"), /^%PDF-/);
  assert.equal(pdf.width, 800);
  assert.equal(pdf.height, 900);
  assert.equal(pdf.layout, "long-page");
});

test("renders report publications as paginated A4 PDFs with stable chrome", async () => {
  const calls = { media: [], styles: [], pdf: null, closed: false };
  const page = {
    setDefaultTimeout() {},
    async emulateMedia(options) { calls.media.push(options); },
    async setContent() {},
    async addStyleTag({ content }) { calls.styles.push(content); },
    async evaluate() { return 24_000; },
    async pdf(options) { calls.pdf = options; return Buffer.from("%PDF-report"); }
  };
  const renderer = createPublicationRenderService({
    browserType: { async launch() { return { async newPage() { return page; }, async close() { calls.closed = true; } }; } }
  });
  const result = await renderer.render({ filename: "monthly-report.html", html: '<main class="dashboard" data-page-type="report">report</main>' }, { format: "pdf", width: 390 });
  assert.equal(result.layout, "a4-paginated");
  assert.equal(result.height, 24_000);
  assert.equal(calls.media[0].media, "print");
  assert.equal(calls.pdf.format, "A4");
  assert.equal(calls.pdf.displayHeaderFooter, true);
  assert.match(calls.pdf.footerTemplate, /pageNumber/);
  assert(calls.styles.some((content) => content.includes("break-inside:avoid-page")));
  assert.equal(calls.closed, true);
});

test("detects an exported report workspace and produces a real paginated PDF", async () => {
  const workspace = structuredClone(workspaceFixture);
  workspace.theme.pageType = "report";
  const renderer = createPublicationRenderService({ timeoutMs: 15_000 });
  const pdf = await renderer.render({ filename: "exported-report.html", html: renderStandaloneWorkspace(workspace) }, { format: "pdf", width: 800 });
  assert.equal(pdf.layout, "a4-paginated");
  assert.match(pdf.bytes.subarray(0, 8).toString("ascii"), /^%PDF-/);
});
