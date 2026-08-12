import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const manifest = JSON.parse(await readFile(path.join(skillDir, "package.manifest.json"), "utf8"));
const requiredFiles = manifest.files;

if (!manifest.name || !manifest.version || !manifest.archiveRoot) throw new Error("Package manifest identity is incomplete");
if (!Array.isArray(requiredFiles) || !requiredFiles.length) throw new Error("Package manifest must list files");
if (new Set(requiredFiles).size !== requiredFiles.length) throw new Error("Package manifest contains duplicate files");
if ([...requiredFiles].sort().join("\n") !== requiredFiles.join("\n")) throw new Error("Package manifest files must be sorted");

for (const relativePath of requiredFiles) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error(`Unsafe package path: ${relativePath}`);
  }
}

for (const prefix of manifest.forbiddenPrefixes ?? []) {
  if (requiredFiles.some((file) => file.startsWith(prefix))) throw new Error(`Forbidden package prefix is included: ${prefix}`);
}
for (const file of manifest.forbiddenFiles ?? []) {
  if (requiredFiles.includes(file)) throw new Error(`Forbidden package file is included: ${file}`);
}

await Promise.all(requiredFiles.map((file) => access(path.join(skillDir, file))));

const schema = JSON.parse(await readFile(path.join(skillDir, "schemas/dashboard-workspace.schema.json"), "utf8"));
const generationSchema = JSON.parse(await readFile(path.join(skillDir, "schemas/dashboard-generation.schema.json"), "utf8"));
const chartCatalog = JSON.parse(await readFile(path.join(skillDir, "data/chart-catalog.json"), "utf8"));
const componentRegistry = JSON.parse(await readFile(path.join(skillDir, "data/component-registry.json"), "utf8"));
const { COMPONENT_RULES, CHART_TYPES } = await import("./workspace-core.mjs");
const palette = JSON.parse(await readFile(path.join(skillDir, "assets/palette.v1.json"), "utf8"));
const colorSystem = await readFile(path.join(skillDir, "references/color-system.md"), "utf8");
const starter = await readFile(path.join(skillDir, "assets/templates/starter.html"), "utf8");
const previewPath = path.resolve(skillDir, "../../../.dashboard-preset-preview.html");
const editorRuntimePath = path.resolve(skillDir, "../../../studio/editor-runtime.js");
let preview = null;
let editorRuntime = null;
try {
  preview = await readFile(previewPath, "utf8");
  editorRuntime = await readFile(editorRuntimePath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (schema.properties?.version?.const !== 2) throw new Error("Workspace schema version must be 2");
if (!schema.properties?.theme || !schema.properties?.layout) throw new Error("Workspace schema must define theme and layout");
const generationFields = ["request", "plan", "workspace", "commands", "provenance"];
if (generationSchema.properties?.version?.const !== 1 || generationFields.some((field) => !generationSchema.required?.includes(field) || !generationSchema.properties?.[field])) {
  throw new Error("Generation schema must define the complete request -> plan -> workspace -> commands -> provenance contract");
}
if (generationSchema.properties.workspace?.$ref !== "./dashboard-workspace.schema.json") {
  throw new Error("Generation schema must reference the portable workspace schema");
}
const generationScope = generationSchema.properties?.request?.properties?.scope;
if (!["section", "component"].every((kind) => generationScope?.properties?.kind?.enum?.includes(kind)) || generationScope.allOf?.length < 2) {
  throw new Error("Generation requests must support validated section and component refinement scopes");
}
if (!chartCatalog.length || chartCatalog.some(({ type }) => !type)) throw new Error("Chart catalog is invalid");
const schemaChartTypes = schema.$defs?.chartType?.enum ?? [];
const catalogChartTypes = chartCatalog.map(({ type }) => type);
if (schemaChartTypes.join("\n") !== catalogChartTypes.join("\n")) throw new Error("Chart catalog differs from workspace chart types");
if ([...CHART_TYPES].join("\n") !== catalogChartTypes.join("\n")) throw new Error("Chart catalog differs from workspace runtime");
const registeredComponents = componentRegistry.filter(({ role }) => role !== "page-control");
const registeredControls = componentRegistry.filter(({ role }) => role === "page-control");
const schemaComponentTypes = schema.properties?.document?.properties?.sections?.items?.properties?.components?.items?.properties?.type?.enum ?? [];
if (registeredComponents.map(({ type }) => type).join("\n") !== schemaComponentTypes.join("\n")) throw new Error("Component registry differs from workspace schema");
if (registeredComponents.map(({ type }) => type).join("\n") !== Object.keys(COMPONENT_RULES).join("\n")) throw new Error("Component registry differs from workspace runtime");
for (const component of registeredComponents) {
  if ((component.requiredProps ?? []).join("\n") !== COMPONENT_RULES[component.type].join("\n")) throw new Error(`${component.type} required props differ from workspace runtime`);
}
const schemaControlTypes = (schema.$defs?.pageControl?.oneOf ?? []).map(({ $ref }) => {
  const definitionName = $ref?.split("/").at(-1);
  return schema.$defs?.[definitionName]?.properties?.type?.const;
}).filter(Boolean);
if (registeredControls.map(({ type }) => type).join("\n") !== schemaControlTypes.join("\n")) throw new Error("Page-control registry differs from workspace schema");
for (const [type, binding] of [["kpi", "aggregate"], ["chart", "series"], ["table", "rows"], ["list", "ranking"]]) {
  if (!componentRegistry.find((component) => component.type === type)?.bindings?.includes(binding)) throw new Error(`${type} must register ${binding} data binding`);
}
for (const type of ["filter-bar", "view-tabs"]) if (componentRegistry.find((component) => component.type === type)?.role !== "page-control") throw new Error(`${type} must be a page control`);
if (palette.version !== "1.2.0") throw new Error("Palette version must be 1.2.0");
const paletteVersionRule = schema.properties?.theme?.properties?.paletteVersion;
const acceptedPaletteVersions = paletteVersionRule?.enum ?? (paletteVersionRule?.const ? [paletteVersionRule.const] : []);
if (!acceptedPaletteVersions.includes(palette.version)) throw new Error(`Workspace schema does not accept palette ${palette.version}`);
if (!Array.isArray(palette.categorical) || palette.categorical.length !== 8) throw new Error("Categorical palette must contain exactly 8 colors");
if (new Set(palette.categorical).size !== palette.categorical.length || palette.categorical.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
  throw new Error("Categorical palette colors must be unique 6-digit hex values");
}
palette.categorical.forEach((color, index) => {
  if (!starter.includes(`--chart-${index + 1}: ${color};`)) throw new Error(`Starter chart token ${index + 1} differs from palette`);
});
if (preview && (!preview.includes('type="module" src="/studio/editor-runtime.js"') || !editorRuntime?.includes(`const DASHBOARD_CATEGORICAL_PALETTE = ${JSON.stringify(palette.categorical)};`))) {
  throw new Error("Preview categorical palette differs from palette.v1.json");
}
for (const rule of ["色相固定，色阶动态", "sRGB 色域裁切", "动态算法必须版本化", "非数据身份 token"]) {
  if (!colorSystem.includes(rule)) throw new Error(`Color-system contract is missing: ${rule}`);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error(`Portable package contains unsupported entry: ${relativePath}`);
  }
  return files.sort();
}

if (process.env.DASHBOARD_PORTABLE_CHECK === "1") {
  const packagedFiles = await listFiles(skillDir);
  if (packagedFiles.join("\n") !== requiredFiles.join("\n")) {
    const missing = requiredFiles.filter((file) => !packagedFiles.includes(file));
    const extra = packagedFiles.filter((file) => !requiredFiles.includes(file));
    throw new Error(`Portable package differs from manifest; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`);
  }
}

console.log(`Dashboard contract OK: generation v${generationSchema.properties.version.const}, workspace v${schema.properties.version.const}, palette ${palette.version}, ${chartCatalog.length} chart types, ${requiredFiles.length} packaged files`);
