import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const requiredFiles = [
  "SKILL.md",
  "assets/templates/starter.html",
  "data/chart-catalog.json",
  "references/runtime.md",
  "schemas/dashboard-workspace.schema.json"
];

await Promise.all(requiredFiles.map((file) => access(path.join(skillDir, file))));

const schema = JSON.parse(await readFile(path.join(skillDir, "schemas/dashboard-workspace.schema.json"), "utf8"));
const chartCatalog = JSON.parse(await readFile(path.join(skillDir, "data/chart-catalog.json"), "utf8"));
if (schema.properties?.version?.const !== 2) throw new Error("Workspace schema version must be 2");
if (!schema.properties?.theme || !schema.properties?.layout) throw new Error("Workspace schema must define theme and layout");
if (!chartCatalog.length || chartCatalog.some(({ type }) => !type)) throw new Error("Chart catalog is invalid");

console.log(`Dashboard contract OK: v${schema.properties.version.const}, ${chartCatalog.length} chart types`);
