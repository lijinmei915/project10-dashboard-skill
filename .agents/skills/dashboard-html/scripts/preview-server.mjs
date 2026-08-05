import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as echarts from "echarts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../../..");
const iconRoot = path.join(rootDir, "node_modules/@phosphor-icons/core/assets");
const aliasesPath = path.resolve(scriptDir, "../data/icon-aliases.zh.json");
const chartCatalogPath = path.resolve(scriptDir, "../data/chart-catalog.json");
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const weights = new Set(["thin", "regular", "bold", "fill"]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

const aliases = JSON.parse(await readFile(aliasesPath, "utf8"));
const chartCatalog = JSON.parse(await readFile(chartCatalogPath, "utf8"));
const regularFiles = await readdir(path.join(iconRoot, "regular"));
const iconNames = regularFiles
  .filter((file) => file.endsWith(".svg"))
  .map((file) => file.slice(0, -4))
  .sort();

function iconFile(name, weight) {
  const suffix = weight === "regular" ? "" : `-${weight}`;
  return path.join(iconRoot, weight, `${name}${suffix}.svg`);
}

function sanitizeSvg(svg) {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match) throw new Error("Invalid SVG asset");
  const body = match[1]
    .replace(/<(?!\/?(?:path|circle|rect|line|polyline|polygon|g)\b)[^>]*>/gi, "")
    .replace(/\s(?:on\w+|style|href|xlink:href)=(?:"[^"]*"|'[^']*')/gi, "");
  return `<svg viewBox="0 0 256 256" aria-hidden="true">${body}</svg>`;
}

async function resolveIcon(name, weight = "regular") {
  if (!iconNames.includes(name) || !weights.has(weight)) return null;
  try {
    return sanitizeSvg(await readFile(iconFile(name, weight), "utf8"));
  } catch {
    return sanitizeSvg(await readFile(iconFile(name, "regular"), "utf8"));
  }
}

async function searchIcons(query, limit = 48) {
  const normalized = query.trim().toLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  const ranked = iconNames.map((name) => {
    const aliasText = (aliases[name] || []).join(" ").toLowerCase();
    const searchable = `${name.replaceAll("-", " ")} ${aliasText}`;
    let score = normalized ? 0 : 1;
    for (const term of terms) {
      if (name === term) score += 100;
      else if (name.startsWith(term)) score += 40;
      else if (name.includes(term)) score += 24;
      if (aliasText.includes(term)) score += 36;
      if (!searchable.includes(term)) return null;
    }
    return { name, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);

  return Promise.all(ranked.map(async ({ name }) => ({
    name,
    aliases: aliases[name] || [],
    svg: await resolveIcon(name, "regular")
  })));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeChartRequest(input) {
  const allowedTypes = new Set(chartCatalog.map(({ type }) => type));
  if (!allowedTypes.has(input.type)) throw new Error("Unsupported chart type");
  const labels = Array.isArray(input.labels) ? input.labels.slice(0, 100).map(String) : [];
  const series = Array.isArray(input.series) ? input.series.slice(0, 12).map((item, index) => ({
    name: String(item?.name || `Series ${index + 1}`).slice(0, 80),
    values: Array.isArray(item?.values) ? item.values.slice(0, 100).map((value) => Number.isFinite(Number(value)) ? Number(value) : 0) : []
  })) : [];
  if (!series.length || !series.some(({ values }) => values.length)) throw new Error("Chart series is required");
  return {
    type: input.type,
    labels,
    series,
    width: Math.max(240, Math.min(1600, Number(input.width) || 720)),
    height: Math.max(180, Math.min(1000, Number(input.height) || 360)),
    palette: Array.isArray(input.palette) ? input.palette.slice(0, 12).filter((color) => /^#[0-9a-f]{6}$/i.test(color)) : []
  };
}

function chartOption({ type, labels, series, palette }) {
  const colors = palette.length ? palette : ["#5b8ff9", "#5ad8a6", "#5d7092", "#f6bd16", "#e8684a", "#6dc8ec"];
  const textStyle = { color: "#71717a", fontFamily: "sans-serif", fontSize: 12 };
  if (type === "pie") {
    const values = series[0].values;
    return {
      animation: false,
      color: colors,
      textStyle,
      tooltip: { show: false },
      series: [{
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "50%"],
        label: { color: textStyle.color, formatter: "{b}  {d}%" },
        data: values.map((value, index) => ({ name: labels[index] || `Item ${index + 1}`, value }))
      }]
    };
  }
  return {
    animation: false,
    color: colors,
    textStyle,
    tooltip: { show: false },
    legend: { show: series.length > 1, top: 0, textStyle },
    grid: { left: 48, right: 20, top: series.length > 1 ? 42 : 20, bottom: 34 },
    xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: "#d4d4d8" } }, axisTick: { show: false }, axisLabel: textStyle },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#e4e4e7" } }, axisLabel: textStyle },
    series: series.map(({ name, values }) => ({
      name,
      type: type === "bar" ? "bar" : "line",
      data: values,
      smooth: type === "area",
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 2 },
      areaStyle: type === "area" ? { opacity: 0.18 } : undefined,
      barMaxWidth: 32,
      itemStyle: type === "bar" ? { borderRadius: [4, 4, 0, 0] } : undefined
    }))
  };
}

function renderChartSvg(input) {
  const config = normalizeChartRequest(input);
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: config.width, height: config.height });
  try {
    chart.setOption(chartOption(config));
    return chart.renderToSVGString()
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "");
  } finally {
    chart.dispose();
  }
}

function searchCharts(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return chartCatalog;
  return chartCatalog.filter(({ type, name, aliases: chartAliases }) =>
    `${type} ${name} ${chartAliases.join(" ")}`.toLowerCase().includes(normalized)
  );
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/.dashboard-preset-preview.html" : pathname;
  const filePath = path.resolve(rootDir, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) return sendJson(response, 403, { error: "Forbidden" });
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error("Not found");
  response.writeHead(200, { "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream" });
  response.end(await readFile(filePath));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === "/api/icons/search") {
      const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit")) || 48));
      return sendJson(response, 200, { icons: await searchIcons(url.searchParams.get("q") || "", limit) });
    }
    if (url.pathname.startsWith("/api/icons/phosphor/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/icons/phosphor/".length));
      const weight = url.searchParams.get("weight") || "regular";
      const svg = await resolveIcon(name, weight);
      return svg ? sendJson(response, 200, { name, weight, svg }) : sendJson(response, 404, { error: "Icon not found" });
    }
    if (url.pathname === "/api/charts/catalog") {
      return sendJson(response, 200, { charts: searchCharts(url.searchParams.get("q") || "") });
    }
    if (url.pathname === "/api/charts/render" && request.method === "POST") {
      return sendJson(response, 200, { svg: renderChartSvg(await readJsonBody(request)) });
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 404, { error: error.message || "Not found" });
  }
});

server.listen(port, host, () => {
  console.log(`Dashboard Agent preview: http://${host}:${port}/.dashboard-preset-preview.html?design=1`);
  console.log(`Phosphor icons indexed: ${iconNames.length}`);
  console.log(`ECharts render types: ${chartCatalog.map(({ type }) => type).join(", ")}`);
});
