import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildScript = path.join(repoRoot, ".agents/skills/dashboard-html/scripts/build-studio-web.mjs");

async function walk(root, current = "") {
  const entries = await readdir(path.join(root, current), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, relativePath));
    else files.push(relativePath);
  }
  return files;
}

function build(output) {
  const result = spawnSync(process.execPath, [buildScript, "--output", output], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("Studio Web build is deterministic, browser-only and independently deployable", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-studio-web-"));
  try {
    const first = path.join(tempRoot, "first");
    const second = path.join(tempRoot, "second");
    build(first);
    build(second);

    const firstFiles = await walk(first);
    const secondFiles = await walk(second);
    assert.deepEqual(firstFiles, secondFiles);
    assert(firstFiles.includes("index.html"));
    assert(firstFiles.includes("studio/workspace-core-runtime.mjs"));
    assert(firstFiles.includes("build-manifest.json"));
    assert(!firstFiles.some((name) => name.includes(".agents") || /(?:server|service|repository|test)\.mjs$/.test(name)));

    for (const relativePath of firstFiles) {
      const [firstBytes, secondBytes] = await Promise.all([
        readFile(path.join(first, relativePath)),
        readFile(path.join(second, relativePath))
      ]);
      assert.equal(digest(firstBytes), digest(secondBytes), `${relativePath} is not deterministic`);
      if (/\.(?:html|mjs|js)$/.test(relativePath)) {
        const source = firstBytes.toString("utf8");
        assert(!source.includes(".agents/"), `${relativePath} retains a repository-only import`);
        assert(!source.includes("DASHBOARD_AUTH_USERS_JSON"), `${relativePath} contains server configuration`);
      }
    }

    const html = await readFile(path.join(first, "index.html"), "utf8");
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "Studio HTML must not contain inline scripts");
    const coreClient = await readFile(path.join(first, "studio/workspace-core-client.mjs"), "utf8");
    assert(coreClient.includes('from "./workspace-core-runtime.mjs"'));

    const manifest = JSON.parse(await readFile(path.join(first, "build-manifest.json"), "utf8"));
    assert.equal(manifest.mountPath, "/");
    assert.equal(manifest.spaFallback, "/index.html");
    assert.deepEqual(Object.keys(manifest.assets).sort(), firstFiles.filter((name) => name !== "build-manifest.json").sort());
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
