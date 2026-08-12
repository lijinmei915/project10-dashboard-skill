import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(scriptDir, "build-package.mjs");
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dashboard-package-reproducibility-"));

function build(output) {
  const result = spawnSync(process.execPath, [buildScript, "--output", output], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Skill package build failed");
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

try {
  const first = path.join(tempDirectory, "first.zip");
  const second = path.join(tempDirectory, "second.zip");
  build(first);
  build(second);
  const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
  const firstHash = digest(firstBytes);
  const secondHash = digest(secondBytes);
  if (!firstBytes.equals(secondBytes)) throw new Error(`Skill package is not reproducible: ${firstHash} != ${secondHash}`);
  console.log(`Skill package reproducible: ${firstHash}`);
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
