import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const requiredFiles = [
  "SKILL.md",
  "assets/palette.v1.json",
  "assets/templates/starter.html",
  "data/chart-catalog.json",
  "references/color-system.md",
  "references/runtime.md",
  "schemas/dashboard-workspace.schema.json"
];

await Promise.all(requiredFiles.map((file) => access(path.join(skillDir, file))));

const schema = JSON.parse(await readFile(path.join(skillDir, "schemas/dashboard-workspace.schema.json"), "utf8"));
const chartCatalog = JSON.parse(await readFile(path.join(skillDir, "data/chart-catalog.json"), "utf8"));
const palette = JSON.parse(await readFile(path.join(skillDir, "assets/palette.v1.json"), "utf8"));
const starter = await readFile(path.join(skillDir, "assets/templates/starter.html"), "utf8");
const previewPath = path.resolve(skillDir, "../../../.dashboard-preset-preview.html");
let preview = null;
try {
  preview = await readFile(previewPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (schema.properties?.version?.const !== 2) throw new Error("Workspace schema version must be 2");
if (!schema.properties?.theme || !schema.properties?.layout) throw new Error("Workspace schema must define theme and layout");
if (!chartCatalog.length || chartCatalog.some(({ type }) => !type)) throw new Error("Chart catalog is invalid");
if (palette.version !== "1.2.0") throw new Error("Palette version must be 1.2.0");
if (!Array.isArray(palette.categorical) || palette.categorical.length !== 8) throw new Error("Categorical palette must contain exactly 8 colors");
if (new Set(palette.categorical).size !== palette.categorical.length || palette.categorical.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
  throw new Error("Categorical palette colors must be unique 6-digit hex values");
}
palette.categorical.forEach((color, index) => {
  if (!starter.includes(`--chart-${index + 1}: ${color};`)) throw new Error(`Starter chart token ${index + 1} differs from palette`);
});
if (preview && !preview.includes(`const DASHBOARD_CATEGORICAL_PALETTE = ${JSON.stringify(palette.categorical)};`)) {
  throw new Error("Preview categorical palette differs from palette.v1.json");
}

console.log(`Dashboard contract OK: workspace v${schema.properties.version.const}, palette ${palette.version}, ${chartCatalog.length} chart types`);
