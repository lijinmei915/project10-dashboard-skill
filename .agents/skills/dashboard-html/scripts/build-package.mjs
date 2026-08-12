import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const manifest = JSON.parse(await readFile(path.join(skillDir, "package.manifest.json"), "utf8"));
const outputFlag = process.argv.indexOf("--output");
const defaultOutput = path.join(repoRoot, "dist", `${manifest.name}-${manifest.version}.zip`);
const outputPath = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : defaultOutput);
const archiveTime = new Date("2000-01-01T00:00:00.000Z");

if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error("--output requires a file path");
if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Package manifest must list files");
if (new Set(manifest.files).size !== manifest.files.length) throw new Error("Package manifest contains duplicate files");
if ([...manifest.files].sort().join("\n") !== manifest.files.join("\n")) throw new Error("Package manifest files must be sorted");

for (const relativePath of manifest.files) {
  if (path.isAbsolute(relativePath) || relativePath.split("/").includes("..")) throw new Error(`Unsafe package path: ${relativePath}`);
  const fileStat = await stat(path.join(skillDir, relativePath));
  if (!fileStat.isFile()) throw new Error(`Package entry is not a file: ${relativePath}`);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-skill-package-"));
const archiveDir = path.join(tempRoot, manifest.archiveRoot);
const verifyRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-skill-verify-"));

try {
  for (const relativePath of manifest.files) {
    const destination = path.join(archiveDir, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(skillDir, relativePath), destination);
    await utimes(destination, archiveTime, archiveTime);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  const archiveFiles = manifest.files.map((relativePath) => `${manifest.archiveRoot}/${relativePath}`);
  const zip = spawnSync("zip", ["-X", "-q", "-D", outputPath, ...archiveFiles], { cwd: tempRoot, encoding: "utf8" });
  if (zip.status !== 0) throw new Error(zip.stderr || "Unable to create Skill ZIP");

  const unzip = spawnSync("unzip", ["-q", outputPath, "-d", verifyRoot], { encoding: "utf8" });
  if (unzip.status !== 0) throw new Error(unzip.stderr || "Unable to verify Skill ZIP");
  const extractedSkill = path.join(verifyRoot, manifest.archiveRoot);
  const check = spawnSync(process.execPath, [path.join(extractedSkill, "scripts/check-contract.mjs")], {
    cwd: extractedSkill,
    encoding: "utf8",
    env: { ...process.env, DASHBOARD_PORTABLE_CHECK: "1" }
  });
  if (check.status !== 0) throw new Error(check.stderr || check.stdout || "Packaged Skill contract check failed");

  const bytes = await readFile(outputPath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  console.log(check.stdout.trim());
  console.log(`Skill package: ${outputPath}`);
  console.log(`Files: ${manifest.files.length}, bytes: ${bytes.length}, sha256: ${checksum}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  await rm(verifyRoot, { recursive: true, force: true });
}
