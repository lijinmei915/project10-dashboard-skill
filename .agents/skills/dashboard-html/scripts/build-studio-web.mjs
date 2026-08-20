import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error("--output requires a directory path");

const outputRoot = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : path.join(repoRoot, "dist/studio-web"));
const studioSource = path.join(repoRoot, "studio");
const studioOutput = path.join(outputRoot, "studio");
const coreSource = path.join(scriptDir, "workspace-core.mjs");
const sourceModules = (await readdir(studioSource)).filter((name) => /\.(?:mjs|js)$/.test(name)).sort();

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(studioOutput, { recursive: true });
await copyFile(path.join(repoRoot, ".dashboard-preset-preview.html"), path.join(outputRoot, "index.html"));
await copyFile(path.join(repoRoot, ".studio-resources.html"), path.join(outputRoot, "studio", "resources.html"));

for (const name of sourceModules) {
  const sourcePath = path.join(studioSource, name);
  const destinationPath = path.join(studioOutput, name);
  if (name !== "workspace-core-client.mjs") {
    await copyFile(sourcePath, destinationPath);
    continue;
  }
  const source = await readFile(sourcePath, "utf8");
  const built = source.replace(
    '"../.agents/skills/dashboard-html/scripts/workspace-core.mjs"',
    '"./workspace-core-runtime.mjs"'
  );
  if (built === source) throw new Error("Studio core client no longer contains the expected portable-core import");
  await writeFile(destinationPath, built, "utf8");
}

await copyFile(coreSource, path.join(studioOutput, "workspace-core-runtime.mjs"));

const files = ["index.html", "studio/resources.html", ...sourceModules.map((name) => `studio/${name}`), "studio/workspace-core-runtime.mjs"].sort();
const assets = {};
for (const relativePath of files) {
  const bytes = await readFile(path.join(outputRoot, relativePath));
  assets[relativePath] = { bytes: bytes.length, sha256: sha256(bytes) };
}

const manifest = {
  format: "dashboard-studio-web-build",
  version: 1,
  mountPath: "/",
  spaFallback: "/index.html",
  assets
};
await writeFile(path.join(outputRoot, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Studio Web build: ${outputRoot}`);
console.log(`Files: ${files.length + 1}`);
