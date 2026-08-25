import { chromium } from "playwright";
import { ContractError } from "./workspace-core.mjs";

const formats = new Set(["png", "pdf"]);
const reportPrintStyles = `
  @page { size: A4; margin: 15mm 12mm 18mm; }
  html,body { background:#fff !important; }
  .dashboard[data-page-type="report"], .dashboard[data-page-type="analysis-report"] { width:auto !important; margin:0 !important; padding:0 !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }
  .dashboard[data-page-type="report"] .section, .dashboard[data-page-type="analysis-report"] .section,
  .dashboard[data-page-type="report"] .card, .dashboard[data-page-type="analysis-report"] .card,
  .dashboard[data-page-type="report"] .section-header, .dashboard[data-page-type="analysis-report"] .section-header,
  .dashboard[data-page-type="report"] table, .dashboard[data-page-type="analysis-report"] table { break-inside:avoid-page; page-break-inside:avoid; }
  .dashboard[data-page-type="report"] .section + .section, .dashboard[data-page-type="analysis-report"] .section + .section { break-before:auto; page-break-before:auto; }
  .dashboard[data-page-type="report"] .table-wrap, .dashboard[data-page-type="analysis-report"] .table-wrap { overflow:visible !important; }
`;
const reportHeaderTemplate = `<div style="width:100%;padding:0 12mm;font:8px 'Segoe UI','PingFang SC',sans-serif;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="title"></span></div>`;
const reportFooterTemplate = `<div style="width:100%;padding:0 12mm;font:8px 'Segoe UI','PingFang SC',sans-serif;color:#667085;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`;

function isReportArtifact(artifact) {
  return /data-page-type\s*=\s*["']report["']/i.test(String(artifact?.html || ""));
}

export function createPublicationRenderService({ browserType = chromium, timeoutMs = 30_000 } = {}) {
  return {
    async render(artifact, { format = "png", width = 1440 } = {}) {
      if (!formats.has(format)) throw new ContractError("Render format is invalid", [{ path: "/format", code: "enum", message: "Use png or pdf" }]);
      const viewportWidth = Number(width);
      if (!Number.isInteger(viewportWidth) || viewportWidth < 390 || viewportWidth > 1920) throw new ContractError("Render width is invalid", [{ path: "/width", code: "range", message: "Use 390 to 1920 pixels" }]);
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(timeoutMs);
        const reportPdf = format === "pdf" && isReportArtifact(artifact);
        await page.emulateMedia({ media: reportPdf ? "print" : "screen", reducedMotion: "reduce" });
        await page.setContent(artifact.html, { waitUntil: "load", timeout: timeoutMs });
        await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
        if (reportPdf) await page.addStyleTag({ content: reportPrintStyles });
        await page.evaluate(() => document.fonts?.ready);
        const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
        const maxHeight = reportPdf ? 60_000 : 20_000;
        if (!Number.isFinite(height) || height < 1 || height > maxHeight) throw new ContractError("Rendered page height is invalid", [{ path: "/height", code: "range", message: `Rendered height must be 1 to ${maxHeight} pixels` }]);
        const bytes = format === "png"
          ? await page.screenshot({ type: "png", fullPage: true })
          : reportPdf
            ? await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: reportHeaderTemplate, footerTemplate: reportFooterTemplate, margin: { top: "15mm", right: "12mm", bottom: "18mm", left: "12mm" } })
            : await page.pdf({ width: `${viewportWidth}px`, height: `${height}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
        return {
          bytes,
          mediaType: format === "png" ? "image/png" : "application/pdf",
          filename: artifact.filename.replace(/\.html$/i, `.${format}`),
          width: viewportWidth,
          height,
          layout: reportPdf ? "a4-paginated" : "long-page"
        };
      } finally {
        await browser.close();
      }
    }
  };
}
