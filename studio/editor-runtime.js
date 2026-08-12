import { composeWorkspaceSnapshot, normalizeWorkspaceSnapshot, workspaceSlices } from "/studio/workspace-state-core.mjs";
import { createWorkspaceSession, PROJECT_STATE_SCRIPT_ID } from "/studio/workspace-session.mjs";
import { createWorkspaceRenderer } from "/studio/workspace-renderer.mjs";
import { createWorkspaceControlRenderer } from "/studio/workspace-control-renderer.mjs";
import { createWorkspaceChartAdapter } from "/studio/workspace-chart-adapter.mjs";
import { LAYOUT_SPAN_STEPS, layoutDropSide, nearestLayoutSpan, reorderCanvasIds, shouldInsertBefore, shouldStartPointerDrag } from "/studio/workspace-layout-interaction.mjs";
import { createWorkspaceLayoutController } from "/studio/workspace-layout-controller.mjs";
import { createWorkspaceStructureSynchronizer } from "/studio/workspace-structure-synchronizer.mjs";
import { createAuthSessionController } from "/studio/auth-session-controller.mjs";

    window.addEventListener("error", (event) => {
      if (/ResizeObserver loop/i.test(event.message || "")) return;
      document.documentElement.dataset.runtimeError = `${event.message} @ ${event.lineno}:${event.colno}`;
    });
    const presets = {
      "fx-orange": { label: "默认后台", accent: "#ff8000", mode: "light", header: "plain", headerAlign: "left", sectionLeading: "none", sectionCopy: "title", sectionDivider: "none", sectionSurface: "none", sectionFont: 15, radius: 12, cardGap: 12, font: 14, shadow: "weak", spacing: "standard", light: { page: "#f5f7fa", surface: "#ffffff", mutedSurface: "#f8fafc", text: "#172033", secondary: "#667085", muted: "#98a2b3", line: "rgba(15, 23, 42, .08)" } },
      "enterprise-blue": { label: "企业分析", accent: "#2563eb", mode: "light", header: "plain", headerAlign: "left", sectionLeading: "none", sectionCopy: "bilingual", sectionDivider: "trailing", sectionSurface: "none", sectionFont: 15, radius: 8, cardGap: 12, font: 14, shadow: "none", spacing: "standard", light: { page: "#f4f7fb", surface: "#ffffff", mutedSurface: "#f7faff", text: "#172033", secondary: "#60708a", muted: "#91a0b5", line: "rgba(37, 99, 235, .14)" } },
      "report-light": { label: "阅读简洁", accent: "#147d72", mode: "light", header: "plain", headerAlign: "center", sectionLeading: "none", sectionCopy: "bilingual", sectionDivider: "none", sectionSurface: "none", sectionFont: 16, radius: 6, cardGap: 16, font: 15, shadow: "none", spacing: "relaxed", light: { page: "#f7f5ef", surface: "#fffefa", mutedSurface: "#f1eee6", text: "#20251f", secondary: "#6d746b", muted: "#92998d", line: "rgba(32, 37, 31, .10)" } },
      "operations-dark": { label: "运营深色", accent: "#ff9b54", mode: "dark", header: "plain", headerAlign: "left", sectionLeading: "none", sectionCopy: "bilingual", sectionDivider: "trailing", sectionSurface: "none", sectionFont: 15, radius: 6, cardGap: 8, font: 13, shadow: "medium", spacing: "compact", light: { page: "#f4f6f8", surface: "#ffffff", mutedSurface: "#f7f8fa", text: "#172033", secondary: "#64748b", muted: "#94a3b8", line: "rgba(15, 23, 42, .09)" } },
      "diagnostic-report": { label: "诊断风格", accent: "#4f8fe8", mode: "light", header: "brand", headerAlign: "center", sectionLeading: "number", sectionCopy: "bilingual", sectionDivider: "none", sectionSurface: "none", sectionFont: 15, frame: "none", radius: 8, cardGap: 12, font: 14, shadow: "weak", spacing: "standard", light: { page: "#fbfdff", surface: "#ffffff", mutedSurface: "#edf4ff", text: "#102754", secondary: "#64748b", muted: "#8da0bc", line: "#e6edf7" } }
    };

    const pagePresetDefaults = {
      dashboard: {
        "fx-orange": {
          accent: "#ff7a2f",
          mode: "light",
          header: "plain",
          headerBackgroundType: "none",
          headerAlign: "left",
          headerTitleFont: 32,
          subtitle: "none",
          headerMetaStyle: "plain",
          headerMetaSeparator: "dot",
          headerDecoration: "none",
          pageBackground: "neutral",
          pageTexture: "none",
          contentWidth: "auto",
          sectionVisibility: "auto",
          frame: "none",
          radius: 10,
          cardGap: 12,
          cardTitleFont: 16,
          cardSubtitle: "none",
          cardTitleStyle: "none",
          cardTitleLeading: "none",
          chartPalette: "monochrome",
          font: 14,
          shadow: "weak",
          spacing: "standard"
        }
      }
    };

    const presetViews = {
      dashboard: {
        allowed: ["fx-orange", "enterprise-blue", "report-light", "operations-dark"],
        labels: { "fx-orange": "标准看板", "enterprise-blue": "企业分析", "report-light": "极简看板", "operations-dark": "运营深色", "diagnostic-report": "诊断看板" }
      },
      report: {
        allowed: ["fx-orange", "enterprise-blue", "report-light", "diagnostic-report"],
        labels: { "fx-orange": "品牌报告", "enterprise-blue": "企业报告", "report-light": "简洁报告", "operations-dark": "深色报告", "diagnostic-report": "诊断报告" }
      }
    };

    const translations = {
      zh: {
        title: "客户经营分析报告", dashboardTitle: "客户经营分析", subtitle: "CUSTOMER ANALYTICS · PERIODIC REPORT", dataThrough: "数据截止 2026-07-30 18:00", createdBy: "创建人：李金金",
        sectionSummary: "经营摘要", sectionSummaryKicker: "Executive Summary", completionLabel: "综合目标完成率",
        sectionMetrics: "核心经营指标", sectionMetricsKicker: "Key Metrics", customerLabel: "重点客户", customerValue: "128 家", customerTrend: "较上期 +12.4%",
        opportunityLabel: "机会金额", opportunityValue: "2,460 万", opportunityTrend: "较上期 +8.2%", conversionLabel: "转化率", conversionTrend: "较上期 +3.6%",
        sectionTrends: "趋势与来源表现", sectionTrendsKicker: "Trend & Source Performance", trendPanelTitle: "机会金额趋势", weekly: "按周统计", weekOne: "第 1 周", weekSeven: "第 7 周",
        sourcePanelTitle: "来源表现 Top 5", contribution: "本周期贡献占比", sourceCore: "核心渠道", sourceOrganic: "自然流量", sourcePartner: "合作伙伴", sourceContent: "内容触达", sourceReferral: "客户推荐",
        sectionHealth: "客户健康与风险", sectionHealthKicker: "Customer Health & Risk", healthPanelTitle: "重点客户健康度", healthPanelNote: "最近 30 天综合表现", healthCustomer: "客户", healthOwner: "负责人", healthScore: "健康分", healthStatus: "状态", healthStable: "稳健", healthWatch: "关注", healthRisk: "风险", healthCustomerEast: "华东智造集团", healthCustomerVoyage: "远航零售", healthCustomerNewPath: "新程科技", healthCustomerUnited: "联合服务", healthOwnerWang: "王琳", healthOwnerChen: "陈昊", healthOwnerZhao: "赵丹", healthOwnerLi: "李敏", riskPanelTitle: "风险事项", riskPanelNote: "当前待处理事项", riskRenewal: "续约风险", riskFollowup: "跟进停滞", riskPayment: "回款延期",
        summaryHtml: "本周期客户经营表现整体稳健，重点客户覆盖与机会转化均有提升。目标完成率达到 <strong>91.30%</strong>，核心业务转化率为 <strong>32.8%</strong>，仍需关注少数风险事项。",
        logoAlt: "品牌 Logo"
      },
      en: {
        title: "Customer Business Performance Report", dashboardTitle: "Customer Business Analytics", subtitle: "CUSTOMER ANALYTICS · PERIODIC REPORT", dataThrough: "Data through Jul 30, 2026, 18:00", createdBy: "Created by Li Jinjin",
        sectionSummary: "Executive Summary", sectionSummaryKicker: "", completionLabel: "Overall target completion",
        sectionMetrics: "Key Business Metrics", sectionMetricsKicker: "", customerLabel: "Priority customers", customerValue: "128", customerTrend: "vs. prior period +12.4%",
        opportunityLabel: "Opportunity value", opportunityValue: "CNY 24.6M", opportunityTrend: "vs. prior period +8.2%", conversionLabel: "Conversion rate", conversionTrend: "vs. prior period +3.6%",
        sectionTrends: "Trend and Source Performance", sectionTrendsKicker: "", trendPanelTitle: "Opportunity Value Trend", weekly: "Weekly view", weekOne: "Week 1", weekSeven: "Week 7",
        sourcePanelTitle: "Top 5 Sources", contribution: "Share of period contribution", sourceCore: "Core channels", sourceOrganic: "Organic traffic", sourcePartner: "Partners", sourceContent: "Content outreach", sourceReferral: "Customer referrals",
        sectionHealth: "Customer Health and Risk", sectionHealthKicker: "", healthPanelTitle: "Priority Customer Health", healthPanelNote: "Composite performance over the last 30 days", healthCustomer: "Customer", healthOwner: "Owner", healthScore: "Score", healthStatus: "Status", healthStable: "Stable", healthWatch: "Watch", healthRisk: "At risk", healthCustomerEast: "East China Manufacturing", healthCustomerVoyage: "Voyage Retail", healthCustomerNewPath: "NewPath Technology", healthCustomerUnited: "United Services", healthOwnerWang: "Wang Lin", healthOwnerChen: "Chen Hao", healthOwnerZhao: "Zhao Dan", healthOwnerLi: "Li Min", riskPanelTitle: "Risk Items", riskPanelNote: "Open items requiring attention", riskRenewal: "Renewal risk", riskFollowup: "Stalled follow-up", riskPayment: "Delayed payment",
        summaryHtml: "Customer performance remained stable during the period, with stronger priority-account coverage and opportunity conversion. Overall target completion reached <strong>91.30%</strong>, while the core business conversion rate was <strong>32.8%</strong>. A small number of risk items still require attention.",
        logoAlt: "Brand logo"
      }
    };

    const darkTokens = { page: "#10151f", surface: "#1b2430", mutedSurface: "#222d3b", text: "#f4f7fb", secondary: "#b9c4d2", muted: "#8492a4", line: "rgba(226, 232, 240, .12)" };
    const shadows = { none: "none", weak: "0 2px 8px rgba(15, 23, 42, .06)", medium: "0 6px 18px rgba(15, 23, 42, .10)", strong: "0 12px 28px rgba(15, 23, 42, .16)" };
    const darkShadows = { none: "none", weak: "0 2px 8px rgba(0, 0, 0, .22)", medium: "0 8px 22px rgba(0, 0, 0, .30)", strong: "0 14px 32px rgba(0, 0, 0, .42)" };
    const spaces = { compact: 14, standard: 18, relaxed: 22 };
    const cardGapSteps = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
    const frameTokens = {
      none: { width: "0", contrast: "0%" },
      hairline: { width: "1px", contrast: "12%" },
      soft: { width: "1px", contrast: "20%" },
      standard: { width: "1px", contrast: "32%" },
      strong: { width: "1.5px", contrast: "46%" }
    };
    // Phosphor Icons Core 2.1.1, MIT. Only selected SVG paths are embedded for offline export.
    const phosphorKpiIcons = {
      "users-three": {
        thin: '<path d="M237,147.44a4,4,0,0,1-5.48-1.4c-8.33-14-20.93-22-34.56-22a4,4,0,0,1-1.2-.2,36.76,36.76,0,0,1-3.8.2,4,4,0,0,1,0-8,28,28,0,1,0-27.12-35,4,4,0,0,1-7.75-2,36,36,0,1,1,54,39.48c10.81,3.85,20.51,12,27.31,23.48A4,4,0,0,1,237,147.44ZM187.46,214a4,4,0,0,1-1.46,5.46,3.93,3.93,0,0,1-2,.54,4,4,0,0,1-3.46-2,61,61,0,0,0-105.08,0,4,4,0,0,1-6.92-4,68.35,68.35,0,0,1,39.19-31,44,44,0,1,1,40.54,0A68.35,68.35,0,0,1,187.46,214ZM128,180a36,36,0,1,0-36-36A36,36,0,0,0,128,180ZM64,116A28,28,0,1,1,91.12,81a4,4,0,0,0,7.75-2A36,36,0,1,0,45.3,118.75,63.55,63.55,0,0,0,12.8,141.6a4,4,0,0,0,6.4,4.8A55.55,55.55,0,0,1,64,124a4,4,0,0,0,0-8Z"/>',
        regular: '<path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z"/>',
        bold: '<path d="M164.38,181.1a52,52,0,1,0-72.76,0,75.89,75.89,0,0,0-30,28.89,12,12,0,0,0,20.78,12,53,53,0,0,1,91.22,0,12,12,0,1,0,20.78-12A75.89,75.89,0,0,0,164.38,181.1ZM100,144a28,28,0,1,1,28,28A28,28,0,0,1,100,144Zm147.21,9.59a12,12,0,0,1-16.81-2.39c-8.33-11.09-19.85-19.59-29.33-21.64a12,12,0,0,1-1.82-22.91,20,20,0,1,0-24.78-28.3,12,12,0,1,1-21-11.6,44,44,0,1,1,73.28,48.35,92.18,92.18,0,0,1,22.85,21.69A12,12,0,0,1,247.21,153.59Zm-192.28-24c-9.48,2.05-21,10.55-29.33,21.65A12,12,0,0,1,6.41,136.79,92.37,92.37,0,0,1,29.26,115.1a44,44,0,1,1,73.28-48.35,12,12,0,1,1-21,11.6,20,20,0,1,0-24.78,28.3,12,12,0,0,1-1.82,22.91Z"/>',
        fill: '<path d="M64.12,147.8a4,4,0,0,1-4,4.2H16a8,8,0,0,1-7.8-6.17,8.35,8.35,0,0,1,1.62-6.93A67.79,67.79,0,0,1,37,117.51a40,40,0,1,1,66.46-35.8,3.94,3.94,0,0,1-2.27,4.18A64.08,64.08,0,0,0,64,144C64,145.28,64,146.54,64.12,147.8Zm182-8.91A67.76,67.76,0,0,0,219,117.51a40,40,0,1,0-66.46-35.8,3.94,3.94,0,0,0,2.27,4.18A64.08,64.08,0,0,1,192,144c0,1.28,0,2.54-.12,3.8a4,4,0,0,0,4,4.2H240a8,8,0,0,0,7.8-6.17A8.33,8.33,0,0,0,246.17,138.89Zm-89,43.18a48,48,0,1,0-58.37,0A72.13,72.13,0,0,0,65.07,212,8,8,0,0,0,72,224H184a8,8,0,0,0,6.93-12A72.15,72.15,0,0,0,157.19,182.07Z"/>',
        duotone: '<path d="M168,144a40,40,0,1,1-40-40A40,40,0,0,1,168,144ZM64,56A32,32,0,1,0,96,88,32,32,0,0,0,64,56Zm128,0a32,32,0,1,0,32,32A32,32,0,0,0,192,56Z" opacity="0.2"/><path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1,0-16,24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.85,8,57,57,0,0,0-98.15,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z"/>'
      },
      "currency-dollar": {
        thin: '<path d="M152,124H132V52h12a36,36,0,0,1,36,36,4,4,0,0,0,8,0,44.05,44.05,0,0,0-44-44H132V24a4,4,0,0,0-8,0V44H112a44,44,0,0,0,0,88h12v72H104a36,36,0,0,1-36-36,4,4,0,0,0-8,0,44.05,44.05,0,0,0,44,44h20v20a4,4,0,0,0,8,0V212h20a44,44,0,0,0,0-88Zm-40,0a36,36,0,0,1,0-72h12v72Zm40,80H132V132h20a36,36,0,0,1,0,72Z"/>',
        regular: '<path d="M152,120H136V56h8a32,32,0,0,1,32,32,8,8,0,0,0,16,0,48.05,48.05,0,0,0-48-48h-8V24a8,8,0,0,0-16,0V40h-8a48,48,0,0,0,0,96h8v64H104a32,32,0,0,1-32-32,8,8,0,0,0-16,0,48.05,48.05,0,0,0,48,48h16v16a8,8,0,0,0,16,0V216h16a48,48,0,0,0,0-96Zm-40,0a32,32,0,0,1,0-64h8v64Zm40,80H136V136h16a32,32,0,0,1,0,64Z"/>',
        bold: '<path d="M152,116H140V60h4a28,28,0,0,1,28,28,12,12,0,0,0,24,0,52.06,52.06,0,0,0-52-52h-4V24a12,12,0,0,0-24,0V36h-4a52,52,0,0,0,0,104h4v56H104a28,28,0,0,1-28-28,12,12,0,0,0-24,0,52.06,52.06,0,0,0,52,52h12v12a12,12,0,0,0,24,0V220h12a52,52,0,0,0,0-104Zm-40,0a28,28,0,0,1,0-56h4v56Zm40,80H140V140h12a28,28,0,0,1,0,56Z"/>',
        fill: '<path d="M160,152a16,16,0,0,1-16,16h-8V136h8A16,16,0,0,1,160,152Zm72-24A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-56,24a32,32,0,0,0-32-32h-8V88h4a16,16,0,0,1,16,16,8,8,0,0,0,16,0,32,32,0,0,0-32-32h-4V64a8,8,0,0,0-16,0v8h-4a32,32,0,0,0,0,64h4v32h-8a16,16,0,0,1-16-16,8,8,0,0,0-16,0,32,32,0,0,0,32,32h8v8a8,8,0,0,0,16,0v-8h8A32,32,0,0,0,176,152Zm-76-48a16,16,0,0,0,16,16h4V88h-4A16,16,0,0,0,100,104Z"/>'
      },
      "chart-line-up": {
        thin: '<path d="M228,208a4,4,0,0,1-4,4H32a4,4,0,0,1-4-4V48a4,4,0,0,1,8,0V166.34l57.17-57.17a4,4,0,0,1,5.66,0L128,138.34,190.34,76H160a4,4,0,0,1,0-8h40a4,4,0,0,1,4,4v40a4,4,0,0,1-8,0V81.66l-65.17,65.17a4,4,0,0,1-5.66,0L96,117.66l-60,60V204H224A4,4,0,0,1,228,208Z"/>',
        regular: '<path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z"/>',
        bold: '<path d="M236,208a12,12,0,0,1-12,12H32a12,12,0,0,1-12-12V48a12,12,0,0,1,24,0v99l43.51-43.52a12,12,0,0,1,17,0L128,127l43-43H160a12,12,0,0,1,0-24h40a12,12,0,0,1,12,12v40a12,12,0,0,1-24,0V101l-51.51,51.52a12,12,0,0,1-17,0L96,129,44,181v15H224A12,12,0,0,1,236,208Z"/>',
        fill: '<path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM200,192H56a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v76.69l34.34-34.35a8,8,0,0,1,11.32,0L128,132.69,172.69,88H144a8,8,0,0,1,0-16h48a8,8,0,0,1,8,8v48a8,8,0,0,1-16,0V99.31l-50.34,50.35a8,8,0,0,1-11.32,0L104,131.31l-40,40V176H200a8,8,0,0,1,0,16Z"/>',
        duotone: '<path d="M224,64V208H32V48H208A16,16,0,0,1,224,64Z" opacity="0.2"/><path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z"/>'
      },
      pulse: {
        thin: '<path d="M236,128a4,4,0,0,1-4,4H202.47l-38.89,77.79A4,4,0,0,1,160,212h-.2a4,4,0,0,1-3.54-2.58l-60.59-159-36,79.28A4,4,0,0,1,56,132H24a4,4,0,0,1,0-8H53.42L92.36,38.35a4,4,0,0,1,7.38.23L160.5,198.06l35.92-71.85A4,4,0,0,1,200,124h32A4,4,0,0,1,236,128Z"/>',
        regular: '<path d="M240,128a8,8,0,0,1-8,8H204.94l-37.78,75.58A8,8,0,0,1,160,216h-.4a8,8,0,0,1-7.08-5.14L95.35,60.76,63.28,131.31A8,8,0,0,1,56,136H24a8,8,0,0,1,0-16H50.85L88.72,36.69a8,8,0,0,1,14.76.46l57.51,151,31.85-63.71A8,8,0,0,1,200,120h32A8,8,0,0,1,240,128Z"/>',
        bold: '<path d="M244,128a12,12,0,0,1-12,12H207.42l-36.69,73.37A12,12,0,0,1,160,220h-.6a12,12,0,0,1-10.61-7.72L95,71.15,66.92,133A12,12,0,0,1,56,140H24a12,12,0,0,1,0-24H48.27L85.08,35a12,12,0,0,1,22.13.7l54.28,142.46,27.78-55.56A12,12,0,0,1,200,116h32A12,12,0,0,1,244,128Z"/>',
        fill: '<path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-8,96H188.64L159,188a8,8,0,0,1-6.95,4h-.46a8,8,0,0,1-6.89-4.84L103,89.92,79,132a8,8,0,0,1-7,4H48a8,8,0,0,1,0-16H67.36L97.05,68a8,8,0,0,1,14.3.82L153,166.08l24-42.05a8,8,0,0,1,6.95-4h24a8,8,0,0,1,0,16Z"/>',
        duotone: '<path d="M96,40l33.52,88H56Zm104,88H129.52L160,208Z" opacity="0.2"/><path d="M240,128a8,8,0,0,1-8,8H204.94l-37.78,75.58A8,8,0,0,1,160,216h-.4a8,8,0,0,1-7.08-5.14L95.35,60.76,63.28,131.31A8,8,0,0,1,56,136H24a8,8,0,0,1,0-16H50.85L88.72,36.69a8,8,0,0,1,14.76.46l57.51,151,31.85-63.71A8,8,0,0,1,200,120h32A8,8,0,0,1,240,128Z"/>'
      }
    };

    const dashboard = document.querySelector("#dashboardPreview");
    const designDrawer = document.querySelector("#designDrawer");
    const designDrawerClose = document.querySelector("#designDrawerClose");
    const designSaveStatus = document.querySelector("#designSaveStatus");
    const designSaveControl = document.querySelector("#designSaveControl");
    const designResetControl = document.querySelector("#designResetControl");
    const designPresetResetControl = document.querySelector("#designPresetResetControl");
    const studioAuthGate = document.querySelector("#studioAuthGate");
    const studioAuthForm = document.querySelector("#studioAuthForm");
    const studioAuthToken = document.querySelector("#studioAuthToken");
    const studioAuthSubmit = document.querySelector("#studioAuthSubmit");
    const studioAuthStatus = document.querySelector("#studioAuthStatus");
    const studioAuthControl = document.querySelector("#studioAuthControl");
    const studioProjectControl = document.querySelector("#studioProjectControl");
    const publicationDialog = document.querySelector("#publicationDialog");
    const publicationClose = document.querySelector("#publicationClose");
    const publicationCancel = document.querySelector("#publicationCancel");
    const publicationSubmit = document.querySelector("#publicationSubmit");
    const publicationVisibility = document.querySelector("#publicationVisibility");
    const publicationRevisionLabel = document.querySelector("#publicationRevisionLabel");
    const publicationProjectLabel = document.querySelector("#publicationProjectLabel");
    const publicationStatus = document.querySelector("#publicationStatus");
    const publicationList = document.querySelector("#publicationList");
    const accentControl = document.querySelector("#accentControl");
    const pageBackgroundControl = document.querySelector("#pageBackgroundControl");
    const pageBackgroundColorControl = document.querySelector("#pageBackgroundColorControl");
    const customPageBackgroundField = document.querySelector("#customPageBackgroundField");
    const pageTextureControl = document.querySelector("#pageTextureControl");
    const radiusControl = document.querySelector("#radiusControl");
    const cardGapControl = document.querySelector("#cardGapControl");
    const cardTitleFontControl = document.querySelector("#cardTitleFontControl");
    const cardSubtitleControl = document.querySelector("#cardSubtitleControl");
    const cardTitleLeadingControl = document.querySelector("#cardTitleLeadingControl");
    const cardTitleIconComposerField = document.querySelector("#cardTitleIconComposerField");
    const cardTitleDecorationControl = document.querySelector("#cardTitleDecorationControl");
    const cardTitleColorControl = document.querySelector("#cardTitleColorControl");
    const fontControl = document.querySelector("#fontControl");
    const sectionFontControl = document.querySelector("#sectionFontControl");
    const sectionWeightControl = document.querySelector("#sectionWeightControl");
    const shadowControl = document.querySelector("#shadowControl");
    const frameControl = document.querySelector("#frameControl");
    const kpiIconControl = document.querySelector("#kpiIconControl");
    const kpiWeightField = document.querySelector("#kpiWeightField");
    const kpiWeightControl = document.querySelector("#kpiWeightControl");
    const kpiIconColorField = document.querySelector("#kpiIconColorField");
    const kpiIconColorControl = document.querySelector("#kpiIconColorControl");
    const kpiContainerField = document.querySelector("#kpiContainerField");
    const kpiContainerControl = document.querySelector("#kpiContainerControl");
    const kpiShapeField = document.querySelector("#kpiShapeField");
    const kpiShapeControl = document.querySelector("#kpiShapeControl");
    const kpiSizeField = document.querySelector("#kpiSizeField");
    const kpiSizeControl = document.querySelector("#kpiSizeControl");
    const kpiLayoutControl = document.querySelector("#kpiLayoutControl");
    const kpiCardBackgroundControl = document.querySelector("#kpiCardBackgroundControl");
    const kpiStyleSamples = document.querySelector("#kpiStyleSamples");
    const chartPaletteControl = document.querySelector("#chartPaletteControl");
    const headerBand = document.querySelector("#headerBand");
    const headerVisibilityToggle = document.querySelector("#headerVisibilityToggle");
    const headerControl = document.querySelector("#headerControl");
    const headerSolidColorField = document.querySelector("#headerSolidColorField");
    const headerSolidColorControl = document.querySelector("#headerSolidColorControl");
    const headerGradientTrigger = document.querySelector("#headerGradientTrigger");
    const headerGradientPopover = document.querySelector("#headerGradientPopover");
    const headerGradientPreview = document.querySelector("#headerGradientPreview");
    const headerGradientStopColorControl = document.querySelector("#headerGradientStopColorControl");
    const headerGradientStopOpacityControl = document.querySelector("#headerGradientStopOpacityControl");
    const headerGradientStopOpacityValue = document.querySelector("#headerGradientStopOpacityValue");
    const headerGradientStopPositionControl = document.querySelector("#headerGradientStopPositionControl");
    const headerGradientStopRemove = document.querySelector("#headerGradientStopRemove");
    const headerGradientDirectionControl = document.querySelector("#headerGradientDirectionControl");
    const headerGradientAngleField = document.querySelector("#headerGradientAngleField");
    const headerGradientAngleControl = document.querySelector("#headerGradientAngleControl");
    const headerGradientAngleScrubber = headerGradientAngleControl.closest(".header-gradient-angle-control");
    const headerAlignControl = document.querySelector("#headerAlignControl");
    const headerTitleFontControl = document.querySelector("#headerTitleFontControl");
    const headerTitleFontValue = document.querySelector("#headerTitleFontValue");
    const subtitleControl = document.querySelector("#subtitleControl");
    const headerMetaControl = document.querySelector("#headerMetaControl");
    const headerMetaSeparatorControl = document.querySelector("#headerMetaSeparatorControl");
    const headerDecorationControl = document.querySelector("#headerDecorationControl");
    const headerTitleGroup = document.querySelector("#headerTitleGroup");
    const headerSubtitleGroup = document.querySelector("#headerSubtitleGroup");
    const headerMetaGroup = document.querySelector("#headerMetaGroup");
    const headerBrandGroup = document.querySelector("#headerBrandGroup");
    const headerAlignField = document.querySelector("#headerAlignField");
    const headerTitleFontField = document.querySelector("#headerTitleFontField");
    const subtitleField = document.querySelector("#subtitleField");
    const headerMetaField = document.querySelector("#headerMetaField");
    const headerMetaSeparatorField = document.querySelector("#headerMetaSeparatorField");
    const headerDecorationField = document.querySelector("#headerDecorationField");
    const logoField = document.querySelector("#logoField");
    const logoControl = document.querySelector("#logoControl");
    const logoClearControl = document.querySelector("#logoClearControl");
    const logoStatus = document.querySelector("#logoStatus");
    const brandSlot = document.querySelector("#brandSlot");
    const brandLogo = document.querySelector("#brandLogo");
    const contentWidthControl = document.querySelector("#contentWidthControl");
    const sectionTitleBand = document.querySelector("#sectionTitleBand");
    const sectionVisibilityToggle = document.querySelector("#sectionVisibilityToggle");
    const sectionLeadingControl = document.querySelector("#sectionLeadingControl");
    const sectionIconStyleField = document.querySelector("#sectionIconStyleField");
    const sectionIconStyleControl = document.querySelector("#sectionIconStyleControl");
    const sectionIconColorControl = document.querySelector("#sectionIconColorControl");
    const sectionCopyControl = document.querySelector("#sectionCopyControl");
    const sectionSubtitleEditor = document.querySelector("#sectionSubtitleEditor");
    const sectionSubtitleControls = [...document.querySelectorAll("[data-section-subtitle]")];
    const sectionDividerControl = document.querySelector("#sectionDividerControl");
    const cardContextControls = document.querySelector("#cardContextControls");
    const cardContextName = document.querySelector("#cardContextName");
    const cardContextTitle = document.querySelector("#cardContextTitle");
    const cardContextHint = document.querySelector("#cardContextHint");
    const cardOverrideReset = document.querySelector("#cardOverrideReset");
    const sectionIconPickerField = document.querySelector("#sectionIconPickerField");
    const sectionWidthField = document.querySelector("#sectionWidthField");
    const sectionWidthControl = document.querySelector("#sectionWidthControl");
    const sectionLayoutField = document.querySelector("#sectionLayoutField");
    const sectionLayoutControl = document.querySelector("#sectionLayoutControl");
    const sectionKpiControlsField = document.querySelector("#sectionKpiControlsField");
    const sectionIconPickerTrigger = document.querySelector("#sectionIconPickerTrigger");
    const sectionIconPickerPreview = document.querySelector("#sectionIconPickerPreview");
    const sectionIconPickerName = document.querySelector("#sectionIconPickerName");
    const sectionIconPickerDialog = document.querySelector("#sectionIconPickerDialog");
    const sectionIconPickerClose = document.querySelector("#sectionIconPickerClose");
    const sectionIconPickerSearch = document.querySelector("#sectionIconPickerSearch");
    const sectionIconPickerResults = document.querySelector("#sectionIconPickerResults");
    const cardChartPaletteField = document.querySelector("#cardChartPaletteField");
    const cardChartPaletteControl = document.querySelector("#cardChartPaletteControl");
    const cardChartTypeField = document.querySelector("#cardChartTypeField");
    const cardChartTypeControl = document.querySelector("#cardChartTypeControl");
    const cardSubtitleField = document.querySelector("#cardSubtitleField");
    const cardSubtitleOverrideControl = document.querySelector("#cardSubtitleOverrideControl");
    const cardSubtitleTextControl = document.querySelector("#cardSubtitleTextControl");
    const cardTitleIconField = document.querySelector("#cardTitleIconField");
    const cardTitleIconPickerTrigger = document.querySelector("#cardTitleIconPickerTrigger");
    const cardTitleIconPickerPreview = document.querySelector("#cardTitleIconPickerPreview");
    const cardTitleIconPickerName = document.querySelector("#cardTitleIconPickerName");
    const cardKpiIconField = document.querySelector("#cardKpiIconField");
    const cardKpiIconOverrideControl = document.querySelector("#cardKpiIconOverrideControl");
    const cardKpiWeightField = document.querySelector("#cardKpiWeightField");
    const cardKpiWeightControl = document.querySelector("#cardKpiWeightControl");
    const cardKpiContainerField = document.querySelector("#cardKpiContainerField");
    const cardKpiContainerControl = document.querySelector("#cardKpiContainerControl");
    const cardKpiShapeField = document.querySelector("#cardKpiShapeField");
    const cardKpiShapeControl = document.querySelector("#cardKpiShapeControl");
    const cardKpiSizeField = document.querySelector("#cardKpiSizeField");
    const cardKpiSizeControl = document.querySelector("#cardKpiSizeControl");
    const cardKpiLayoutField = document.querySelector("#cardKpiLayoutField");
    const cardKpiLayoutControl = document.querySelector("#cardKpiLayoutControl");
    const cardKpiBackgroundField = document.querySelector("#cardKpiBackgroundField");
    const cardKpiBackgroundControl = document.querySelector("#cardKpiBackgroundControl");
    const cardIconColorField = document.querySelector("#cardIconColorField");
    const cardIconColorControl = document.querySelector("#cardIconColorControl");
    const cardKpiStyleSamples = document.querySelector("#cardKpiStyleSamples");
    const settingsTabControls = document.querySelector("#settingsTabControls");
    const kpiBand = document.querySelector("#kpiBand");
    const kpiControls = document.querySelector("#kpiControls");
    const sharedIconDecorationOptions = [
      { value: "line", label: "线型", group: "无底" },
      { value: "filled", label: "面型", group: "无底" },
      { value: "line-soft", label: "浅底线型", group: "有底" },
      { value: "filled-soft", label: "浅底面型", group: "有底" },
      { value: "line-solid", label: "深底线型", group: "有底" },
      { value: "filled-solid", label: "深底面型", group: "有底" }
    ];
    const sharedIconColorOptions = [
      { value: "neutral", label: "中性色" },
      { value: "accent", label: "主题色" },
      { value: "gradient-accent", label: "主题渐变" },
      { value: "colorful", label: "多色" },
      { value: "gradient-colorful", label: "多色渐变" }
    ];

    function iconOptionsMarkup(options) {
      const groups = new Map();
      options.forEach((option) => {
        const group = option.group || "";
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(`<option value="${option.value}">${option.label}</option>`);
      });
      return [...groups].map(([group, optionsMarkup]) => group
        ? `<optgroup label="${group}">${optionsMarkup.join("")}</optgroup>`
        : optionsMarkup.join("")).join("");
    }

    function setupKpiStyleComposer(container, local = false) {
      const scopePrefix = local ? "cardKpi" : "kpi";
      const decorationOptions = [
        ...(local ? [{ value: "inherit", label: "跟随整组" }] : []),
        { value: "none", label: "无", group: "无底" },
        ...sharedIconDecorationOptions
      ];
      const colorOptions = [
        ...(local ? [{ value: "inherit", label: "跟随整组" }] : []),
        { value: "auto", label: "跟随卡片" },
        ...sharedIconColorOptions
      ];
      container.className = "control-group kpi-style-composer";
      container.innerHTML = `<span>图标样式</span><span class="card-title-icon-composer"><select class="control-select" id="${scopePrefix}DecorationControl" aria-label="KPI 图标样式">${iconOptionsMarkup(decorationOptions)}</select><select class="control-select" id="${scopePrefix}StyleColorControl" aria-label="KPI 图标颜色">${iconOptionsMarkup(colorOptions)}</select></span>`;
    }

    cardTitleDecorationControl.innerHTML = iconOptionsMarkup(sharedIconDecorationOptions);
    cardTitleColorControl.innerHTML = iconOptionsMarkup(sharedIconColorOptions);
    setupKpiStyleComposer(kpiStyleSamples);
    setupKpiStyleComposer(cardKpiStyleSamples, true);
    const kpiDecorationControl = document.querySelector("#kpiDecorationControl");
    const kpiStyleColorControl = document.querySelector("#kpiStyleColorControl");
    const cardKpiDecorationControl = document.querySelector("#cardKpiDecorationControl");
    const cardKpiStyleColorControl = document.querySelector("#cardKpiStyleColorControl");
    sectionKpiControlsField.append(kpiControls);
    kpiBand.remove();
    const groupKpiIconComposer = kpiIconControl.closest(".kpi-icon-composer");
    const groupKpiLayoutField = kpiLayoutControl.closest(".control-group");
    const groupKpiBackgroundField = kpiCardBackgroundControl.closest(".control-group");
    kpiStyleSamples.before(groupKpiIconComposer, groupKpiLayoutField, groupKpiBackgroundField);
    [cardKpiIconOverrideControl, cardKpiWeightControl, cardIconColorControl, cardKpiContainerControl, cardKpiShapeControl, cardKpiSizeControl, cardKpiLayoutControl].forEach((control) => {
      control.options[0].textContent = "跟随整组";
    });
    kpiSizeField.closest(".kpi-icon-composer").querySelector(".kpi-icon-composer-label").textContent = "图标大小";
    cardKpiSizeField.closest(".kpi-icon-composer").querySelector(".kpi-icon-composer-label").textContent = "图标大小";
    dashboard.querySelectorAll(".panel").forEach((panel) => {
      const title = panel.querySelector(":scope > .card-title");
      const subtitle = panel.querySelector(":scope > .panel-note");
      if (!title || !subtitle) return;
      const heading = document.createElement("div");
      heading.className = "card-heading";
      panel.insertBefore(heading, title);
      heading.append(title, subtitle);
      const subtitleText = document.createElement("span");
      subtitleText.className = "card-subtitle-text";
      subtitleText.textContent = subtitle.textContent.trim();
      subtitle.replaceChildren(subtitleText);
      subtitle.insertAdjacentHTML("afterbegin", '<svg class="card-subtitle-icon" viewBox="0 0 256 256" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"/></svg>');
      subtitle.tabIndex = 0;
      subtitle.dataset.tooltip = subtitleText.textContent.trim();
    });
    let state = {};
    let workspaceDocument = null;
    let workspaceInteractions = null;
    let workspaceResources = null;
    let currentRevision = null;
    let currentProject = null;
    const aiComposer = document.querySelector("#aiComposer");
    const aiComposerToggle = document.querySelector("#aiComposerToggle");
    const aiComposerLauncherLabel = document.querySelector("#aiComposerLauncherLabel");
    const aiComposerTitle = document.querySelector("#aiComposerTitle");
    const aiComposerClose = document.querySelector("#aiComposerClose");
    const aiComposerPanel = document.querySelector("#aiComposerPanel");
    const aiHistoryToggle = document.querySelector("#aiHistoryToggle");
    const aiHistory = document.querySelector("#aiHistory");
    const aiScope = document.querySelector("#aiScope");
    const aiScopeName = document.querySelector("#aiScopeName");
    const aiPromptGuide = document.querySelector("#aiPromptGuide");
    const aiDraftTemplates = document.querySelector("#aiDraftTemplates");
    const aiRefineTemplates = document.querySelector("#aiRefineTemplates");
    const aiDataSource = document.querySelector("#aiDataSource");
    const aiDataSourceButton = document.querySelector("#aiDataSourceButton");
    const aiRestConnectButton = document.querySelector("#aiRestConnectButton");
    const aiDataSourceInput = document.querySelector("#aiDataSourceInput");
    const aiDataSourceName = document.querySelector("#aiDataSourceName");
    const aiDataSourceMeta = document.querySelector("#aiDataSourceMeta");
    const aiDataSheet = document.querySelector("#aiDataSheet");
    const aiDataRefreshButton = document.querySelector("#aiDataRefreshButton");
    const aiDataScheduleButton = document.querySelector("#aiDataScheduleButton");
    const refreshScheduleDialog = document.querySelector("#refreshScheduleDialog");
    const refreshScheduleClose = document.querySelector("#refreshScheduleClose");
    const refreshScheduleCancel = document.querySelector("#refreshScheduleCancel");
    const refreshScheduleSave = document.querySelector("#refreshScheduleSave");
    const refreshScheduleInterval = document.querySelector("#refreshScheduleInterval");
    const refreshScheduleDataset = document.querySelector("#refreshScheduleDataset");
    const refreshScheduleMeta = document.querySelector("#refreshScheduleMeta");
    const refreshScheduleStatus = document.querySelector("#refreshScheduleStatus");
    const refreshJobList = document.querySelector("#refreshJobList");
    const restConnectorDialog = document.querySelector("#restConnectorDialog");
    const restConnectorClose = document.querySelector("#restConnectorClose");
    const restConnectorCancel = document.querySelector("#restConnectorCancel");
    const restConnectorSubmit = document.querySelector("#restConnectorSubmit");
    const restConnectorName = document.querySelector("#restConnectorName");
    const restConnectorUrl = document.querySelector("#restConnectorUrl");
    const restConnectorPath = document.querySelector("#restConnectorPath");
    const restConnectorCredential = document.querySelector("#restConnectorCredential");
    const restConnectorStatus = document.querySelector("#restConnectorStatus");
    const aiDataPortable = document.querySelector("#aiDataPortable");
    const aiDataSchemaButton = document.querySelector("#aiDataSchemaButton");
    const dataSchemaDialog = document.querySelector("#dataSchemaDialog");
    const dataSchemaSummary = document.querySelector("#dataSchemaSummary");
    const dataSchemaRows = document.querySelector("#dataSchemaRows");
    const dataSchemaStatus = document.querySelector("#dataSchemaStatus");
    const dataSchemaClose = document.querySelector("#dataSchemaClose");
    const dataSchemaCancel = document.querySelector("#dataSchemaCancel");
    const dataSchemaSave = document.querySelector("#dataSchemaSave");
    const aiGenerationStatus = document.querySelector("#aiGenerationStatus");
    let selectedDataSource = null;
    const cardTitleStylePresets = {
      none: { cardTitleIcon: "none", cardTitleIconColor: "neutral", cardTitleIconEffect: "none" },
      "line-neutral": { cardTitleIcon: "line", cardTitleIconColor: "neutral", cardTitleIconEffect: "none" },
      "line-theme": { cardTitleIcon: "line", cardTitleIconColor: "accent", cardTitleIconEffect: "none" },
      "gradient-theme": { cardTitleIcon: "line", cardTitleIconColor: "accent", cardTitleIconEffect: "gradient-theme" },
      "gradient-multi": { cardTitleIcon: "line", cardTitleIconColor: "colorful", cardTitleIconEffect: "gradient-multi" },
      "line-soft": { cardTitleIcon: "soft", cardTitleIconColor: "accent", cardTitleIconEffect: "none" },
      "filled-soft": { cardTitleIcon: "soft", cardTitleIconColor: "accent", cardTitleIconEffect: "none" },
      "line-solid": { cardTitleIcon: "solid", cardTitleIconColor: "accent", cardTitleIconEffect: "none" },
      "filled-solid": { cardTitleIcon: "solid", cardTitleIconColor: "accent", cardTitleIconEffect: "none" },
      "filled-multi": { cardTitleIcon: "solid", cardTitleIconColor: "colorful", cardTitleIconEffect: "multi-solid" }
    };

    function deriveCardTitleControls(source) {
      const legacyStyle = source.cardTitleStyle && cardTitleStylePresets[source.cardTitleStyle]
        ? cardTitleStylePresets[source.cardTitleStyle]
        : source;
      const container = legacyStyle.cardTitleIcon || "none";
      const filled = source.cardTitleStyle?.startsWith("filled-");
      const decoration = container === "none" ? "none" : `${filled ? "filled" : "line"}${container === "soft" ? "-soft" : container === "solid" ? "-solid" : ""}`;
      const color = legacyStyle.cardTitleIconEffect === "gradient-theme" ? "gradient-accent"
        : legacyStyle.cardTitleIconEffect === "gradient-multi" || legacyStyle.cardTitleIconEffect === "multi-solid" ? "gradient-colorful"
        : legacyStyle.cardTitleIconColor === "colorful" ? "colorful"
        : legacyStyle.cardTitleIconColor === "accent" ? "accent" : "neutral";
      return { decoration, color };
    }

    function applyCardTitleControls(target, decoration, color) {
      const hasBackground = decoration.endsWith("-soft") || decoration.endsWith("-solid");
      target.cardTitleDecoration = decoration;
      target.cardTitleColor = color;
      target.cardTitleIcon = decoration === "none" ? "none" : decoration.endsWith("-soft") ? "soft" : decoration.endsWith("-solid") ? "solid" : "line";
      target.cardTitleIconForm = decoration.startsWith("filled") ? "filled" : "line";
      target.cardTitleIconColor = color.includes("colorful") ? "colorful" : color.includes("accent") ? "accent" : "neutral";
      target.cardTitleIconEffect = color === "gradient-accent" ? "gradient-theme" : color === "gradient-colorful" ? (hasBackground ? "multi-solid" : "gradient-multi") : "none";
    }

    let kpiColorContext = null;
    let selectedHeaderGradientStopId = null;
    let selectedCardId = null;
    let selectedSectionId = null;
    let iconSearchTimer = null;
    let iconPickerTarget = "section";
    const sectionIconSvgCache = new Map();
    const chartSvgCache = new Map();
    let logoFileName = "";
    let customPresetDialogMode = "create";
    let customPresetDialogTargetId = null;
    let customPresetActionTargetId = null;
    let customPresetActionTrigger = null;
    const customSelects = new Map();
    const CUSTOM_PRESET_STORAGE_KEY = "dashboard-preset-preview:custom-presets:v1";
    const workspaceSession = createWorkspaceSession({
      storage: localStorage,
      location: window.location,
      history: window.history,
      readEmbeddedState: () => document.querySelector(`#${PROJECT_STATE_SCRIPT_ID}`)?.textContent || null
    });
    let workspaceIsRestoring = true;
    let savedWorkspaceSnapshot = null;

    function readCustomPresets() {
      try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_PRESET_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved.filter((preset) => preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.theme && typeof preset.theme === "object") : [];
      } catch { return []; }
    }
    let customPresets = readCustomPresets();
    function writeCustomPresets() { localStorage.setItem(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(customPresets)); }
    function getCustomPreset(id) { return customPresets.find((preset) => preset.id === id); }
    function createCustomPresetTheme() {
      const { preset, pageType, language, cardOverrides, sectionIcons, sectionSubtitles, ...theme } = state;
      return JSON.parse(JSON.stringify(theme));
    }

    function stablePresetValue(value) {
      if (Array.isArray(value)) return value.map(stablePresetValue);
      if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stablePresetValue(value[key])]));
      return value;
    }

    function isCurrentCustomPresetModified() {
      const preset = getCustomPreset(state.preset);
      return Boolean(preset && JSON.stringify(stablePresetValue(preset.theme)) !== JSON.stringify(stablePresetValue(createCustomPresetTheme())));
    }

    function nextCustomPresetName() {
      let index = customPresets.length + 1;
      while (customPresets.some((preset) => preset.name === `自定义预设 ${index}`)) index += 1;
      return `自定义预设 ${index}`;
    }

    function setCustomPresetDialogError(message = "") {
      customPresetDialogError.textContent = message;
      customPresetDialogError.hidden = !message;
      customPresetName.setAttribute("aria-invalid", String(Boolean(message)));
    }

    function closeCustomPresetMenu({ focus = false } = {}) {
      const trigger = customPresetActionTrigger;
      trigger?.setAttribute("aria-expanded", "false");
      customPresetPopover.hidden = true;
      customPresetActionTargetId = null;
      customPresetActionTrigger = null;
      if (focus && trigger?.isConnected) trigger.focus();
    }

    function openCustomPresetMenu(presetId, trigger) {
      const preset = getCustomPreset(presetId);
      if (!preset) return;
      closeCustomPresetMenu();
      customPresetActionTargetId = presetId;
      customPresetActionTrigger = trigger;
      trigger.setAttribute("aria-expanded", "true");
      const rowRect = customPresetRow.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = 190;
      const left = Math.max(0, Math.min(rowRect.width - menuWidth, triggerRect.right - rowRect.left - menuWidth));
      customPresetRow.style.setProperty("--custom-preset-menu-left", `${left}px`);
      customPresetUpdate.disabled = state.preset !== presetId || !isCurrentCustomPresetModified();
      customPresetPopover.hidden = false;
    }

    function openCustomPresetDialog(mode, presetId = state.preset) {
      const preset = getCustomPreset(presetId);
      if (mode === "rename" && !preset) return;
      customPresetDialogMode = mode;
      customPresetDialogTargetId = mode === "rename" ? preset.id : null;
      customPresetDialogTitle.textContent = mode === "rename" ? "重命名自定义预设" : "保存为自定义预设";
      customPresetDialogSubmit.textContent = mode === "rename" ? "重命名" : "保存";
      customPresetName.value = mode === "rename" ? preset.name : nextCustomPresetName();
      setCustomPresetDialogError();
      closeCustomPresetMenu();
      if (!customPresetDialog.open) customPresetDialog.showModal();
      requestAnimationFrame(() => { customPresetName.focus(); customPresetName.select(); });
    }

    function closeCustomPresetDialog() {
      if (customPresetDialog.open) customPresetDialog.close();
      customPresetDialogTargetId = null;
      setCustomPresetDialogError();
    }

    function renderCustomPresetTabs() {
      const modified = isCurrentCustomPresetModified();
      closeCustomPresetMenu();
      customPresetList.replaceChildren();
      const selectedPreset = getCustomPreset(state.preset);
      const dropdown = document.createElement("div"); dropdown.className = "custom-select custom-preset-dropdown"; dropdown.dataset.open = "false";
      const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "custom-select-trigger"; trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false");
      const triggerLabel = document.createElement("span"); triggerLabel.textContent = selectedPreset ? `${selectedPreset.name}${modified ? " · 已修改" : ""}` : "自定义预设";
      const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg"); chevron.classList.add("custom-select-chevron"); chevron.setAttribute("viewBox", "0 0 24 24"); chevron.setAttribute("aria-hidden", "true"); chevron.innerHTML = "<path d=\"m6 9 6 6 6-6\"/>";
      trigger.append(triggerLabel, chevron);
      const list = document.createElement("div"); list.className = "custom-select-listbox"; list.setAttribute("role", "listbox");
      customPresets.forEach((preset) => {
        const option = document.createElement("button"); option.type = "button"; option.className = "custom-select-option"; option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(state.preset === preset.id));
        const name = document.createElement("span"); name.textContent = preset.name;
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg"); check.classList.add("custom-select-check"); check.setAttribute("viewBox", "0 0 24 24"); check.innerHTML = "<path d=\"m5 12 4 4L19 6\"/>";
        option.append(name, check); option.addEventListener("click", () => selectPreset(preset.id)); list.append(option);
      });
      const create = document.createElement("button"); create.type = "button"; create.className = "custom-select-option custom-preset-create"; create.textContent = "+ 新建自定义预设"; create.addEventListener("click", () => openCustomPresetDialog("create")); list.append(create);
      dropdown.append(trigger, list);
      trigger.addEventListener("click", () => { const open = dropdown.dataset.open !== "true"; dropdown.dataset.open = String(open); trigger.setAttribute("aria-expanded", String(open)); });
      dropdown.addEventListener("focusout", () => requestAnimationFrame(() => { if (!dropdown.contains(document.activeElement)) { dropdown.dataset.open = "false"; trigger.setAttribute("aria-expanded", "false"); } }));
      const more = document.createElement("button"); more.type = "button"; more.className = "custom-preset-more"; more.dataset.customPresetMore = selectedPreset?.id || ""; more.setAttribute("aria-label", selectedPreset ? `管理预设 ${selectedPreset.name}` : "管理自定义预设"); more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false"); more.textContent = "···"; more.hidden = !selectedPreset;
      more.addEventListener("click", () => { if (!selectedPreset) return; if (customPresetActionTargetId === selectedPreset.id && !customPresetPopover.hidden) closeCustomPresetMenu({ focus: true }); else openCustomPresetMenu(selectedPreset.id, more); });
      customPresetList.append(dropdown, more);
    }

    function setSaveStatus(message) {
      designSaveStatus.textContent = message;
    }

    function setWorkspaceDirty(dirty) {
      designSaveControl.disabled = !dirty;
      designResetControl.disabled = !dirty || !savedWorkspaceSnapshot;
      designSaveControl.classList.toggle("is-dirty", dirty);
      designSaveControl.setAttribute("aria-label", dirty ? "保存配置，有未保存更改" : "保存配置");
      designSaveControl.title = dirty ? "保存配置（有未保存更改）" : "保存配置";
      setSaveStatus(dirty ? "有未保存更改" : "配置已保存");
    }

    function createWorkspaceState() {
      return composeWorkspaceSnapshot({
        document: workspaceDocument,
        interactions: workspaceInteractions,
        resources: workspaceResources,
        theme: state,
        layout: window.DashboardLayoutEditor.getConfig(),
        logo: brandSlot.hidden ? null : { src: brandLogo.src, alt: brandLogo.alt, name: logoFileName }
      });
    }

    function applyWorkspaceDocument(documentModel) {
      if (!documentModel?.sections) return;
      workspaceDocument = JSON.parse(JSON.stringify(documentModel));
      renderWorkspaceControls();
      documentModel = materializeWorkspaceDocumentForPreview();
      workspaceRenderer.render(documentModel);
      renderWorkspaceCharts(documentModel);
      documentModel.sampleDataLabel
        ? aiGenerationStatus.setAttribute("data-sample", "true")
        : aiGenerationStatus.removeAttribute("data-sample");
    }

    const workspaceRenderer = createWorkspaceRenderer({ document, dashboard });

    const workspaceControlRenderer = createWorkspaceControlRenderer({
      document,
      dashboard,
      onFilterChange({ filterId, value, targets }) {
        workspaceInteractions.filters[filterId] = value;
        dashboard.dispatchEvent(new CustomEvent("dashboard:filters-change", { bubbles: true, detail: { filters: JSON.parse(JSON.stringify(workspaceInteractions.filters)), targets } }));
        applyWorkspaceDocument(workspaceDocument);
        requestAnimationFrame(() => dashboard.querySelectorAll('[data-filter-pending="true"]').forEach((section) => delete section.dataset.filterPending));
        scheduleWorkspaceSave();
      },
      onViewChange({ viewId, initial = false }) {
        workspaceInteractions.activeView = viewId;
        if (!initial) scheduleWorkspaceSave();
      }
    });

    function workspaceFilterDefinitions(componentId, sectionId) {
      return (workspaceDocument?.controls || []).filter(({ type, props }) => type === "filter-bar" && props.targets.some((target) => target === componentId || target === sectionId)).flatMap(({ props }) => props.controls);
    }

    function aggregateWorkspaceRecords(records, operation, field) {
      if (operation === "count") return records.length;
      const values = records.map((record) => Number(record[field])).filter(Number.isFinite);
      if (!values.length) return 0;
      const total = values.reduce((sum, value) => sum + value, 0);
      if (operation === "average") return total / values.length;
      if (operation === "min") return Math.min(...values);
      if (operation === "max") return Math.max(...values);
      return total;
    }

    function materializeWorkspaceDocumentForPreview() {
      const result = JSON.parse(JSON.stringify(workspaceDocument));
      result.sections.forEach((section) => section.components.forEach((component) => {
        if (!component.binding || !component.dataRef) return;
        const filters = workspaceFilterDefinitions(component.id, section.id);
        const records = (workspaceResources?.datasets?.[component.dataRef]?.records || []).filter((record) => filters.every((filter) => {
          const selected = workspaceInteractions?.filters?.[filter.id] ?? filter.defaultValue;
          return selected === "" || selected === null || selected === undefined || String(record[filter.field]) === String(selected);
        }));
        const binding = component.binding;
        const group = (labelField, valueField, operation) => {
          const groups = new Map();
          records.forEach((record) => groups.set(String(record[labelField] ?? ""), [...(groups.get(String(record[labelField] ?? "")) || []), record]));
          return [...groups].map(([label, rows]) => ({ label, value: aggregateWorkspaceRecords(rows, operation, valueField) }));
        };
        if (binding.kind === "aggregate") {
          const value = aggregateWorkspaceRecords(records, binding.operation, binding.field);
          component.props.value = `${binding.format?.prefix || ""}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: binding.format?.maximumFractionDigits ?? 0 }).format(value * (binding.format?.multiplier ?? 1))}${binding.format?.suffix || ""}`;
        } else if (binding.kind === "series") {
          const points = group(binding.categoryField, binding.valueField, binding.operation);
          component.props.labels = points.map(({ label }) => label);
          component.props.values = points.map(({ value }) => value);
        } else if (binding.kind === "rows") {
          component.props.columns = binding.columns.map(({ label }) => label);
          component.props.rows = records.slice(0, binding.limit || 100).map((record) => binding.columns.map(({ field }) => record[field] ?? ""));
        } else if (binding.kind === "ranking") {
          component.props.items = group(binding.labelField, binding.valueField, binding.operation).sort((left, right) => right.value - left.value).slice(0, binding.limit || 10);
        }
        component.props.empty = records.length === 0;
      }));
      return result;
    }

    function createPortableChartSvg({ type, labels, values, colors, title, width: requestedWidth = 720 }) {
      const namespace = "http://www.w3.org/2000/svg";
      const width = Math.max(280, Math.min(1200, Number(requestedWidth) || 720));
      const height = 260;
      const safeValues = values.map((value) => Number(value)).map((value) => Number.isFinite(value) ? Math.max(0, value) : 0);
      const safeColors = colors.length ? colors : ["#5b8ff9"];
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", title || "数据图表");
      svg.style.color = "var(--text-muted)";
      const append = (name, attributes = {}, text = "") => {
        const node = document.createElementNS(namespace, name);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
        if (text) node.textContent = text;
        svg.append(node);
        return node;
      };
      append("title", {}, title || "数据图表");
      if (!safeValues.length || !safeValues.some((value) => value > 0)) {
        append("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "currentColor", "font-size": 13 }, "暂无可绘制数据");
        return svg;
      }
      if (type === "pie") {
        const total = safeValues.reduce((sum, value) => sum + value, 0);
        const compact = width < 520;
        const centerX = compact ? width / 2 : 190;
        const centerY = compact ? 92 : 130;
        const radius = compact ? 58 : 82;
        const strokeWidth = compact ? 28 : 38;
        let angle = -Math.PI / 2;
        safeValues.forEach((value, index) => {
          const sweep = total ? value / total * Math.PI * 2 : 0;
          const color = safeColors[index % safeColors.length];
          if (sweep >= Math.PI * 2 - 0.0001) {
            append("circle", { cx: centerX, cy: centerY, r: radius, fill: "none", stroke: color, "stroke-width": strokeWidth });
          } else if (sweep > 0) {
            const startX = centerX + Math.cos(angle) * radius;
            const startY = centerY + Math.sin(angle) * radius;
            const endAngle = angle + sweep;
            const endX = centerX + Math.cos(endAngle) * radius;
            const endY = centerY + Math.sin(endAngle) * radius;
            append("path", {
              d: `M ${startX} ${startY} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${endX} ${endY}`,
              fill: "none",
              stroke: color,
              "stroke-width": strokeWidth,
              "stroke-linecap": "butt"
            });
          }
          angle += sweep;
        });
        append("text", { x: centerX, y: centerY - 2, "text-anchor": "middle", fill: "var(--text-main)", "font-size": 24, "font-weight": 700 }, "100%");
        append("text", { x: centerX, y: centerY + 22, "text-anchor": "middle", fill: "currentColor", "font-size": 12 }, "总占比");
        labels.slice(0, compact ? 4 : 6).forEach((label, index) => {
          const y = compact ? 194 + index * 18 : 68 + index * 28;
          const markerX = compact ? 20 : 390;
          const labelX = compact ? 34 : 405;
          append("circle", { cx: markerX, cy: y - 4, r: compact ? 4 : 5, fill: safeColors[index % safeColors.length] });
          append("text", { x: labelX, y, fill: "currentColor", "font-size": 12 }, String(label).slice(0, compact ? 10 : 16));
          append("text", { x: compact ? width - 20 : 680, y, "text-anchor": "end", fill: "var(--text-main)", "font-size": 12, "font-weight": 600 }, `${total ? (safeValues[index] / total * 100).toFixed(1) : "0.0"}%`);
        });
        return svg;
      }
      const horizontal = type === "horizontal-bar";
      const margin = horizontal ? { left: width < 420 ? 78 : 110, right: 20, top: 18, bottom: 24 } : { left: 48, right: 20, top: 20, bottom: 36 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const maximum = Math.max(1, ...safeValues);
      for (let index = 0; index < 5; index += 1) {
        const coordinate = horizontal ? margin.left + plotWidth * index / 4 : margin.top + plotHeight * index / 4;
        append("line", horizontal ? { x1: coordinate, x2: coordinate, y1: margin.top, y2: height - margin.bottom, stroke: "var(--line)", "stroke-width": 1 } : { x1: margin.left, x2: width - margin.right, y1: coordinate, y2: coordinate, stroke: "var(--line)", "stroke-width": 1 });
      }
      if (horizontal) {
        const rowHeight = plotHeight / safeValues.length;
        safeValues.forEach((value, index) => {
          const y = margin.top + rowHeight * index + 3;
          const barWidth = value / maximum * plotWidth;
          append("rect", { x: margin.left, y, width: barWidth, height: Math.max(10, rowHeight - 7), rx: 4, fill: safeColors[index % safeColors.length] });
          append("text", { x: margin.left - 8, y: y + rowHeight / 2 + 1, "text-anchor": "end", fill: "currentColor", "font-size": 12 }, String(labels[index] || "").slice(0, width < 420 ? 8 : 14));
        });
      } else if (type === "bar") {
        const slot = plotWidth / safeValues.length;
        const barWidth = Math.min(34, slot * 0.62);
        safeValues.forEach((value, index) => {
          const barHeight = value / maximum * plotHeight;
          append("rect", { x: margin.left + slot * index + (slot - barWidth) / 2, y: margin.top + plotHeight - barHeight, width: barWidth, height: barHeight, rx: 4, fill: safeColors[index % safeColors.length] });
        });
      } else {
        const points = safeValues.map((value, index) => {
          const x = margin.left + (safeValues.length === 1 ? plotWidth / 2 : plotWidth * index / (safeValues.length - 1));
          const y = margin.top + plotHeight - value / maximum * plotHeight;
          return [x, y];
        });
        const linePath = points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
        if (type === "area") {
          const areaPath = `${linePath} L ${points.at(-1)[0]} ${margin.top + plotHeight} L ${points[0][0]} ${margin.top + plotHeight} Z`;
          append("path", { d: areaPath, fill: safeColors[0], opacity: 0.16 });
        }
        append("path", { d: linePath, fill: "none", stroke: safeColors[0], "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" });
        points.forEach(([x, y]) => append("circle", { cx: x, cy: y, r: 4, fill: "var(--surface)", stroke: safeColors[0], "stroke-width": 2 }));
      }
      if (labels.length && !horizontal) {
        append("text", { x: margin.left, y: height - 10, fill: "currentColor", "font-size": 12 }, String(labels[0]));
        append("text", { x: width - margin.right, y: height - 10, "text-anchor": "end", fill: "currentColor", "font-size": 12 }, String(labels.at(-1)));
      }
      return svg;
    }

    function workspaceComponentModelById(componentId) {
      return workspaceDocument?.sections?.flatMap(({ components }) => components).find(({ id }) => id === componentId) || null;
    }

    function effectiveChartType(card, component = workspaceComponentModelById(card?.dataset.itemId)) {
      const type = component?.props?.chartType || state.cardOverrides?.[card?.dataset.itemId]?.chartType || card?.dataset.chartType || "bar";
      return ["line", "area", "bar", "horizontal-bar", "pie"].includes(type) ? type : "bar";
    }

    function chartPaletteForCard(card) {
      const styles = getComputedStyle(card);
      const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      const mode = card.dataset.chartPalette || dashboard.dataset.chartPalette || "monochrome";
      if (mode === "categorical") return Array.from({ length: 8 }, (_, index) => read(`--chart-${index + 1}`, DASHBOARD_CATEGORICAL_PALETTE[index]));
      if (mode === "bichrome") return [read("--chart-bi-1", DASHBOARD_CATEGORICAL_PALETTE[0]), read("--chart-bi-2", DASHBOARD_CATEGORICAL_PALETTE[1])];
      return [read("--chart-accent", DASHBOARD_CATEGORICAL_PALETTE[0])];
    }

    function staticChartModel() {
      const card = dashboard.querySelector('[data-item-id="opportunity-trend"]');
      if (!card) return null;
      const values = [...card.querySelectorAll(".bar-chart .bar")].map((bar) => Number.parseFloat(bar.style.getPropertyValue("--height")) || 0);
      const labels = values.map((_, index) => state.language === "en" ? `Week ${index + 1}` : `第 ${index + 1} 周`);
      return { id: "opportunity-trend", title: cardLabel(card), props: { chartType: effectiveChartType(card), labels, values } };
    }

    const workspaceChartAdapter = createWorkspaceChartAdapter({
      document,
      dashboard,
      cache: chartSvgCache,
      resolveType: effectiveChartType,
      resolvePalette: chartPaletteForCard,
      getMode: () => state.mode,
      createFallbackSvg: createPortableChartSvg
    });

    function renderWorkspaceCharts(documentModel = null) {
      const charts = documentModel?.sections
        ? documentModel.sections.flatMap(({ components }) => components).filter(({ type }) => type === "chart")
        : workspaceDocument
          ? materializeWorkspaceDocumentForPreview().sections.flatMap(({ components }) => components).filter(({ type }) => type === "chart")
          : [staticChartModel()].filter(Boolean);
      charts.forEach((component) => workspaceChartAdapter.render(component));
    }

    function setSelectedChartType(type) {
      if (!selectedCardId || !["line", "area", "bar", "horizontal-bar", "pie"].includes(type)) return;
      const component = workspaceComponentModelById(selectedCardId);
      if (!component || component.type !== "chart") {
        state.cardOverrides ||= {};
        const override = { ...(state.cardOverrides[selectedCardId] || {}), chartType: type };
        if (type === "pie" && !override.chartPalette) override.chartPalette = "categorical";
        state.cardOverrides[selectedCardId] = override;
        applyCardOverrides();
        updateCardContext();
        scheduleWorkspaceSave();
        return;
      }
      component.props.chartType = type;
      if (state.cardOverrides?.[selectedCardId]?.chartType) {
        delete state.cardOverrides[selectedCardId].chartType;
        if (!Object.keys(state.cardOverrides[selectedCardId]).length) delete state.cardOverrides[selectedCardId];
      }
      if (type === "pie" && !state.cardOverrides?.[selectedCardId]?.chartPalette) {
        state.cardOverrides ||= {};
        state.cardOverrides[selectedCardId] = { ...(state.cardOverrides[selectedCardId] || {}), chartPalette: "categorical" };
      }
      applyWorkspaceDocument(workspaceDocument);
      applyCardOverrides();
      updateCardContext();
      scheduleWorkspaceSave();
    }

    function renderWorkspaceControls() {
      const controls = workspaceDocument?.controls || [];
      workspaceInteractions ||= { filters: {} };
      workspaceInteractions.filters ||= {};
      workspaceControlRenderer.render(controls, workspaceInteractions);
    }

    function readSessionValue(result, errorMessage) {
      if (result.ok) return result.value;
      setSaveStatus(errorMessage);
      return null;
    }

    function clearWorkspaceHistory() { workspaceSession.clearLegacyHistory(); }

    function persistWorkspaceState(workspaceState = createWorkspaceState()) {
      if (workspaceIsRestoring || !state.preset || !window.DashboardLayoutEditor) return;
      const persisted = workspaceSession.persistLocal(workspaceState);
      if (persisted.ok) {
        clearWorkspaceHistory();
        savedWorkspaceSnapshot = persisted.value;
        setWorkspaceDirty(false);
      } else {
        setSaveStatus("保存空间不足");
      }
      workspaceSession.writeUrl(workspaceState);
    }

    async function ensureCurrentProjectOnServer() {
      if (!currentProject?.id) return;
      const endpoint = `/api/projects/${encodeURIComponent(currentProject.id)}`;
      const existing = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (existing.ok) return;
      if (existing.status !== 404) throw Object.assign(new Error("项目状态检查失败"), { responseStatus: existing.status });
      const migration = await fetch(`${endpoint}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: currentProject })
      });
      if (!migration.ok) {
        const payload = await migration.json().catch(() => ({}));
        throw Object.assign(new Error(payload.error || "旧项目迁移失败"), { responseStatus: migration.status });
      }
    }

    async function saveWorkspaceRevision() {
      if (workspaceIsRestoring || !state.preset || !window.DashboardLayoutEditor) return;
      const workspace = createWorkspaceState();
      if (location.protocol === "file:" || !workspace.document) {
        persistWorkspaceState(workspace);
        setSaveStatus(workspace.document ? "配置已保存到本地草稿" : "空白模板已保存到本地，生成首稿后可保存版本");
        return;
      }
      if (currentRevision && JSON.stringify(currentRevision.workspace) === JSON.stringify(workspace)) {
        persistWorkspaceState(workspace);
        setSaveStatus(`版本 ${currentRevision.id} 已保存`);
        return;
      }
      designSaveControl.disabled = true;
      setSaveStatus("正在保存项目版本...");
      try {
        if (currentProject) await ensureCurrentProjectOnServer();
        const projectId = currentProject?.id || `project-manual-${Date.now()}`;
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace,
            revisionId: `revision-user-${Date.now()}`,
            expectedRevisionId: currentProject?.currentRevisionId || null,
            projectName: workspace.document?.title || "未命名项目",
            summary: currentProject ? "保存手工修改" : "创建手工项目"
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.project || !payload.revision) throw Object.assign(new Error(payload.issues?.[0]?.message || payload.error || "项目版本保存失败"), { responseStatus: response.status });
        currentProject = payload.project;
        currentRevision = payload.revision;
        localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        window.dispatchEvent(new Event("dashboard-project-change"));
        persistWorkspaceState(workspace);
        window.DashboardAiComposerCenter?.invalidateUndo();
        setSaveStatus(`已保存版本 ${currentRevision.id}`);
        await window.DashboardAiComposerCenter?.refreshHistory();
      } catch (error) {
        setWorkspaceDirty(true);
        setSaveStatus(error.responseStatus === 409 ? "项目已有更新，请刷新版本历史后重试" : `保存失败：${error.message}`);
      } finally {
        designSaveControl.disabled = !designSaveControl.classList.contains("is-dirty");
      }
    }

    function resetUnsavedWorkspaceState() {
      if (!savedWorkspaceSnapshot) return;
      try {
        workspaceIsRestoring = true;
        const restored = restoreWorkspaceState(JSON.parse(savedWorkspaceSnapshot));
        workspaceIsRestoring = false;
        if (!restored) throw new Error("无法恢复已保存配置");
        setWorkspaceDirty(false);
        setSaveStatus("已放弃未保存修改");
      } catch (error) {
        workspaceIsRestoring = false;
        setSaveStatus("已保存配置无法恢复");
      }
    }

    function scheduleWorkspaceSave() {
      if (workspaceIsRestoring) return;
      window.DashboardAiComposerCenter?.invalidateUndo();
      setWorkspaceDirty(true);
    }

    function restoreWorkspaceState(input) {
      const normalized = normalizeWorkspaceSnapshot(input);
      if (!normalized.ok) {
        console.warn("Workspace snapshot rejected", normalized.issues.length ? normalized.issues : normalized.error?.message);
        return false;
      }
      const saved = normalized.value;
      if (!saved || (!presets[saved.theme.preset] && !getCustomPreset(saved.theme.preset))) return false;
      selectPreset(saved.theme.preset);
      const restoredTheme = { ...saved.theme };
      state = { ...state, ...restoredTheme, preset: saved.theme.preset };
      if (!Object.prototype.hasOwnProperty.call(restoredTheme, "headerBackgroundDefaultVersion")) delete state.headerBackgroundDefaultVersion;
      if (!Object.prototype.hasOwnProperty.call(restoredTheme, "headerMetaDefaultVersion")) delete state.headerMetaDefaultVersion;
      applyState();
      ({ document: workspaceDocument, interactions: workspaceInteractions, resources: workspaceResources } = workspaceSlices(saved));
      if (workspaceDocument && saved.layout) synchronizeWorkspaceCardStructure(workspaceDocument, saved.layout);
      if (saved.layout) window.DashboardLayoutEditor.applyConfig(saved.layout);
      if (workspaceDocument) {
        applyWorkspaceDocument(workspaceDocument);
        applyCardOverrides();
      }
      if (saved.logo?.src) {
        brandLogo.src = saved.logo.src;
        brandLogo.alt = saved.logo.alt || translations[state.language].logoAlt;
        brandSlot.hidden = false;
        logoClearControl.hidden = false;
        logoFileName = saved.logo.name || "已上传 Logo";
        logoStatus.textContent = logoFileName;
        logoStatus.title = logoFileName;
      } else {
        brandLogo.removeAttribute("src");
        brandSlot.hidden = true;
        logoClearControl.hidden = true;
        logoFileName = "";
        logoStatus.textContent = "未上传";
        logoStatus.removeAttribute("title");
      }
      if (selectedCardId || selectedSectionId) updateCardContext();
      return true;
    }

    function setDesignMode(open, updateUrl = true) {
      document.body.dataset.designMode = String(open);
      designDrawer.setAttribute("aria-hidden", String(!open));
      designDrawer.inert = !open;
      if (open) setSettingsTab("global");
      if (!open) closeAllCustomSelects();
      if (!open) selectCard(null);
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (open) url.searchParams.set("design", "1");
        else url.searchParams.delete("design");
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }

    window.DashboardThemeEditor = Object.freeze({
      open: () => setDesignMode(true),
      close: () => setDesignMode(false),
      toggle: () => setDesignMode(document.body.dataset.designMode !== "true")
    });

    function cardLabel(card) {
      const label = card.querySelector(".card-title, .metric-label, .summary-card-title");
      if (!label) return card.dataset.itemId;
      const cleanLabel = label.cloneNode(true);
      cleanLabel.querySelectorAll(".card-title-icon, .card-title-marker, .card-title-number").forEach((decoration) => decoration.remove());
      return cleanLabel.textContent.trim() || card.dataset.itemId;
    }

    function cardHasVisibleTitle(card) {
      const title = card.querySelector(".card-title");
      return Boolean(title && getComputedStyle(title).display !== "none" && title.getClientRects().length);
    }

    function cardHasVisibleTitleIcon(card) {
      const icon = card.querySelector(".card-title-icon");
      return Boolean(icon && getComputedStyle(icon).display !== "none" && icon.getClientRects().length);
    }

    function cardContextEmptyMessage(card, type) {
      if (type !== "kpi" && cardHasVisibleTitle(card) && !cardHasVisibleTitleIcon(card)) {
        return state.cardTitleLeading === "icon"
          ? "此卡片当前未显示标题图标，可恢复全局设置后再配置。"
          : "请先在“全局 > 卡片”开启标题图标，开启后可在此单独设置。";
      }
      return "此卡片暂无可单独设置的项目。";
    }

    function setSettingsTab(tab) {
      const nextTab = tab === "local" ? "local" : "global";
      designDrawer.dataset.settingsTab = nextTab;
      setPressed("settingsTabControls", nextTab);
      closeAllCustomSelects();
      if (!sectionIconPickerDialog.hidden) closeSectionIconPicker();
    }

    function selectedCard() {
      return selectedCardId ? dashboard.querySelector('[data-item-id="' + CSS.escape(selectedCardId) + '"]') : null;
    }

    function selectedSection() {
      return selectedSectionId ? dashboard.querySelector('.section[data-section-id="' + CSS.escape(selectedSectionId) + '"]') : null;
    }

    function sectionLabel(section) {
      return section.querySelector(".section-heading h2")?.textContent.trim() || section.dataset.sectionId;
    }

    function setCardContextFields(type) {
      sectionWidthField.hidden = true;
      sectionLayoutField.hidden = true;
      sectionKpiControlsField.hidden = true;
      sectionIconPickerField.hidden = true;
      cardChartTypeField.hidden = type !== "chart";
      cardChartPaletteField.hidden = type !== "chart";
      cardSubtitleField.hidden = true;
      cardTitleIconField.hidden = type !== "generic";
      cardKpiIconField.hidden = type !== "kpi";
      cardKpiStyleSamples.hidden = type !== "kpi";
      cardKpiLayoutField.hidden = type !== "kpi";
      cardKpiBackgroundField.hidden = type !== "kpi";
      cardIconColorField.hidden = type !== "kpi";
      cardKpiContainerField.hidden = type !== "kpi";
      cardKpiShapeField.hidden = type !== "kpi";
      cardKpiSizeField.hidden = type !== "kpi";
    }

    async function updateSectionIconPickerPreview(sectionId) {
      const iconName = state.sectionIcons?.[sectionId] || defaultSectionIcons[sectionId] || "circle";
      sectionIconPickerName.textContent = state.sectionIcons?.[sectionId] ? iconName : `自动匹配 · ${iconName}`;
      try {
        sectionIconPickerPreview.innerHTML = await resolveSectionIconSvg(iconName, "regular");
      } catch {
        sectionIconPickerPreview.replaceChildren();
      }
    }

    async function updateCardTitleIconPickerPreview(card) {
      const iconName = state.cardOverrides?.[card.dataset.itemId]?.cardTitleIconName || defaultCardTitleIcons[card.dataset.itemId] || defaultCardTitleIcons[sourceComponentId(card.dataset.itemId)] || "square";
      cardTitleIconPickerName.textContent = state.cardOverrides?.[card.dataset.itemId]?.cardTitleIconName ? iconName : `自动匹配 · ${iconName}`;
      try {
        cardTitleIconPickerPreview.innerHTML = await resolveSectionIconSvg(iconName, "regular");
      } catch {
        cardTitleIconPickerPreview.replaceChildren();
      }
    }

    function updateCardContext() {
      const card = selectedCard();
      const section = selectedSection();
      dashboard.querySelectorAll("[data-item-id][data-selected]").forEach((item) => delete item.dataset.selected);
      dashboard.querySelectorAll(".section[data-selected]").forEach((item) => delete item.dataset.selected);
      if (!card) {
        selectedCardId = null;
        if (section) {
          section.dataset.selected = "true";
          designDrawer.dataset.localContext = section.dataset.sectionId === "metrics" ? "kpi-group" : "section";
          document.querySelector("#cardContextBand").dataset.empty = "false";
          cardContextTitle.textContent = "当前分组";
          cardContextName.textContent = `${sectionLabel(section)}（整组）`;
          cardContextHint.hidden = true;
          cardContextControls.hidden = false;
          setCardContextFields("section");
          const isGrouped = section.dataset.grouped === "true";
          const isKpiGroup = section.dataset.sectionId === "metrics";
          sectionWidthField.hidden = state.pageType !== "dashboard" || !isGrouped;
          sectionKpiControlsField.hidden = !isKpiGroup;
          sectionWidthControl.value = section.dataset.span || "12";
          syncCustomSelect(sectionWidthControl);
          const sectionGroup = section.querySelector(":scope > .layout-group");
          sectionLayoutField.hidden = !sectionGroup || (state.pageType === "dashboard" && !isGrouped);
          if (sectionGroup) {
            sectionLayoutControl.value = sectionGroup.dataset.layout || "responsive";
            syncCustomSelect(sectionLayoutControl);
          }
          const sectionHeading = section.querySelector(":scope > .section-heading");
          const hasVisibleSectionIcon = state.sectionLeading === "icon"
            && sectionHeading
            && getComputedStyle(sectionHeading).display !== "none";
          sectionIconPickerField.hidden = !hasVisibleSectionIcon;
          cardOverrideReset.textContent = "恢复自动匹配";
          cardOverrideReset.hidden = !state.sectionIcons?.[section.dataset.sectionId];
          if (hasVisibleSectionIcon) updateSectionIconPickerPreview(section.dataset.sectionId);
          syncKpiStyleSamples();
          return;
        }
        delete designDrawer.dataset.localContext;
        document.querySelector("#cardContextBand").dataset.empty = "true";
        cardContextName.textContent = "请选择一个分组或一张卡片";
        cardContextHint.hidden = true;
        cardContextControls.hidden = true;
        cardOverrideReset.hidden = true;
        return;
      }
      designDrawer.dataset.localContext = "card";
      document.querySelector("#cardContextBand").dataset.empty = "false";
      cardContextTitle.textContent = "当前卡片";
      card.dataset.selected = "true";
      const type = card.dataset.cardType || "generic";
      const subtitle = card.querySelector(".panel-note");
      const hasTitleIcon = type !== "kpi" && cardHasVisibleTitle(card) && cardHasVisibleTitleIcon(card);
      const hasControls = type === "chart" || type === "kpi" || hasTitleIcon || Boolean(subtitle);
      const override = state.cardOverrides?.[selectedCardId] || {};
      const effectiveTitleStyle = override.cardTitleStyle || state.cardTitleStyle;
      const effectiveTitleIcon = cardTitleStylePresets[effectiveTitleStyle]?.cardTitleIcon || state.cardTitleIcon;
      const effectiveKpiIcon = override.kpiIcon || state.kpiIcon;
      cardOverrideReset.textContent = type === "kpi" ? "恢复跟随整组" : "恢复全局";
      cardKpiIconField.dataset.showWeight = String(type === "kpi" && effectiveKpiIcon === "outline");
      cardContextName.textContent = cardLabel(card);
      cardContextControls.hidden = !hasControls;
      cardContextHint.hidden = hasControls;
      cardContextHint.textContent = cardContextEmptyMessage(card, type);
      cardOverrideReset.hidden = !Object.keys(override).length;
      setCardContextFields(type === "kpi" ? "kpi" : type === "chart" ? "chart" : hasTitleIcon ? "generic" : "none");
      cardTitleIconField.hidden = !hasTitleIcon;
      cardSubtitleField.hidden = !subtitle;
      cardIconColorField.hidden = type !== "kpi" || effectiveKpiIcon === "none";
      cardKpiContainerField.hidden = type !== "kpi" || effectiveKpiIcon === "none";
      cardKpiShapeField.hidden = type !== "kpi" || effectiveKpiIcon === "none";
      cardChartPaletteControl.value = override.chartPalette || "inherit";
      cardChartTypeControl.value = effectiveChartType(card);
      cardSubtitleOverrideControl.value = override.cardSubtitle || "inherit";
      cardSubtitleTextControl.value = override.cardSubtitleText ?? subtitle?.textContent.trim() ?? "";
      if (hasTitleIcon) updateCardTitleIconPickerPreview(card);
      cardKpiIconOverrideControl.value = override.kpiIcon || "inherit";
      cardKpiWeightControl.value = override.kpiIconWeight || "inherit";
      cardKpiContainerControl.value = override.kpiIconContainer || "inherit";
      cardKpiShapeControl.value = override.kpiIconShape || "inherit";
      cardKpiSizeControl.value = override.kpiIconSize || "inherit";
      cardKpiLayoutControl.value = override.kpiLayout || "inherit";
      cardKpiBackgroundControl.value = override.kpiCardBackground || "inherit";
      cardIconColorControl.value = override.iconColor || "inherit";
      syncCustomSelects();
      syncKpiStyleSamples();
    }

    function selectCard(card) {
      selectedCardId = card?.dataset.itemId || null;
      selectedSectionId = null;
      if (card) setSettingsTab("local");
      updateCardContext();
      syncAiComposerScope();
    }

    function selectSection(section) {
      selectedCardId = null;
      selectedSectionId = section?.dataset.sectionId || null;
      if (section) setSettingsTab("local");
      updateCardContext();
      syncAiComposerScope();
    }

    function closeSectionIconPicker() {
      sectionIconPickerDialog.hidden = true;
      sectionIconPickerSearch.value = "";
      sectionIconPickerResults.replaceChildren();
    }

    async function searchSectionIcons(query) {
      sectionIconPickerResults.innerHTML = '<div class="icon-picker-empty">正在搜索…</div>';
      try {
        const response = await fetch(`/api/icons/search?q=${encodeURIComponent(query)}&limit=48`);
        if (!response.ok) throw new Error("搜索服务不可用");
        const { icons } = await response.json();
        sectionIconPickerResults.replaceChildren();
        icons.forEach(({ name, aliases, svg }) => {
          const button = document.createElement("button");
          button.className = "icon-picker-item";
          button.type = "button";
          button.dataset.iconName = name;
          button.setAttribute("role", "option");
          button.title = aliases.length ? `${name} · ${aliases.join("、")}` : name;
          button.innerHTML = `${svg}<span>${name}</span>`;
          sectionIconPickerResults.appendChild(button);
        });
        if (!icons.length) sectionIconPickerResults.innerHTML = '<div class="icon-picker-empty">没有匹配图标</div>';
      } catch {
        sectionIconPickerResults.innerHTML = '<div class="icon-picker-empty">请通过 Agent 预览服务使用图标搜索</div>';
      }
    }

    function openSectionIconPicker() {
      const section = selectedSection();
      if (!section) return;
      iconPickerTarget = "section";
      sectionIconPickerDialog.hidden = false;
      sectionIconPickerSearch.focus();
      searchSectionIcons(sectionLabel(section));
    }

    function openCardTitleIconPicker() {
      const card = selectedCard();
      if (!card) return;
      iconPickerTarget = "card";
      sectionIconPickerDialog.hidden = false;
      sectionIconPickerSearch.focus();
      searchSectionIcons(cardLabel(card));
    }

    function setSectionIconOverride(iconName) {
      if (!selectedSectionId || !iconName) return;
      state.sectionIcons ||= {};
      state.sectionIcons[selectedSectionId] = iconName;
      closeSectionIconPicker();
      applyState();
    }

    function setCardTitleIconOverride(iconName) {
      if (!selectedCardId || !iconName) return;
      setCardOverride("cardTitleIconName", iconName);
      closeSectionIconPicker();
      applyState();
    }

    function setCardOverride(key, value) {
      if (!selectedCardId) return;
      state.cardOverrides ||= {};
      const override = { ...(state.cardOverrides[selectedCardId] || {}) };
      if (value === "inherit") delete override[key];
      else override[key] = value;
      if (Object.keys(override).length) state.cardOverrides[selectedCardId] = override;
      else delete state.cardOverrides[selectedCardId];
      applyCardOverrides();
      updateCardContext();
      scheduleWorkspaceSave();
    }

    function setCardTitleStyleOverride(style) {
      if (!selectedCardId) return;
      state.cardOverrides ||= {};
      const override = { ...(state.cardOverrides[selectedCardId] || {}) };
      ["cardTitleStyle", "cardTitleIcon", "cardTitleIconColor", "cardTitleIconEffect"].forEach((key) => delete override[key]);
      if (style !== "inherit" && cardTitleStylePresets[style]) override.cardTitleStyle = style;
      if (Object.keys(override).length) state.cardOverrides[selectedCardId] = override;
      else delete state.cardOverrides[selectedCardId];
      applyCardOverrides();
      updateCardContext();
      scheduleWorkspaceSave();
    }

    function deriveKpiDecoration(source) {
      if (source.kpiIcon === "none") return "none";
      const form = source.kpiIcon === "filled" ? "filled" : "line";
      const container = ["outline", "soft"].includes(source.kpiIconContainer) ? "soft"
        : ["solid", "gradient", "bigradient"].includes(source.kpiIconContainer) ? "solid" : "none";
      return `${form}${container === "none" ? "" : `-${container}`}`;
    }

    function applyKpiDecoration(target, decoration, local = false) {
      const keys = ["kpiIcon", "kpiIconWeight", "kpiIconContainer"];
      if (local) keys.forEach((key) => delete target[key]);
      if (decoration === "inherit") return;
      target.kpiIcon = decoration === "none" ? "none" : decoration.startsWith("filled") ? "filled" : "outline";
      target.kpiIconWeight = "regular";
      target.kpiIconContainer = decoration.endsWith("-soft") ? "soft" : decoration.endsWith("-solid") ? "solid" : "none";
    }

    function applyCardTitleStyle(style, target) {
      const preset = cardTitleStylePresets[style] || cardTitleStylePresets.none;
      Object.assign(target, preset);
    }

    function renderCardTitleIconEffects() {
      dashboard.querySelectorAll("[data-item-id]").forEach((card, index) => {
        const svg = card.querySelector(".card-title-icon svg");
        if (!svg) return;
        const effect = card.dataset.cardTitleIconEffect || dashboard.dataset.cardTitleIconEffect;
        svg.style.fill = "";
        const existingDefs = svg.querySelector("defs[data-title-icon-gradient]");
        if (!effect.startsWith("gradient-")) {
          existingDefs?.remove();
          svg.querySelectorAll(":scope > path").forEach((path) => { path.style.fill = ""; });
          return;
        }
        const gradientId = `card-title-gradient-${index}`;
        const end = effect === "gradient-multi" ? "var(--chart-2)" : "var(--icon-theme-accent-alt)";
        const start = effect === "gradient-multi" ? "var(--chart-1)" : "var(--icon-theme-accent)";
        const defs = existingDefs || document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.dataset.titleIconGradient = "true";
        defs.innerHTML = `<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient>`;
        if (!existingDefs) svg.prepend(defs);
        svg.querySelectorAll(":scope > path").forEach((path) => { path.style.fill = `url(#${gradientId})`; });
      });
    }

    function optionLabel(control, value) {
      return [...control.options].find((option) => option.value === value)?.textContent || String(value);
    }

    function setInheritedOptionLabel(control, sourceControl, sourceValue, scopeLabel) {
      const inherited = [...control.options].find((option) => option.value === "inherit");
      if (!inherited) return;
      const label = `${scopeLabel}（${optionLabel(sourceControl, sourceValue)}）`;
      inherited.textContent = label;
      const component = customSelects.get(control);
      const visibleOption = component?.options.find((option) => option.dataset.value === "inherit");
      const visibleLabel = visibleOption?.querySelector(":scope > span:not(.custom-select-option-preview)");
      if (visibleLabel) visibleLabel.textContent = label;
    }

    function syncInheritedOptionLabels() {
      setInheritedOptionLabel(cardChartPaletteControl, chartPaletteControl, state.chartPalette, "跟随全局");
      setInheritedOptionLabel(cardSubtitleOverrideControl, cardSubtitleControl, state.cardSubtitle, "跟随全局");
      setInheritedOptionLabel(cardKpiIconOverrideControl, kpiIconControl, state.kpiIcon, "跟随整组");
      setInheritedOptionLabel(cardKpiWeightControl, kpiWeightControl, state.kpiIconWeight, "跟随整组");
      setInheritedOptionLabel(cardIconColorControl, kpiIconColorControl, state.kpiIconColor, "跟随整组");
      setInheritedOptionLabel(cardKpiContainerControl, kpiContainerControl, state.kpiIconContainer, "跟随整组");
      setInheritedOptionLabel(cardKpiShapeControl, kpiShapeControl, state.kpiIconShape, "跟随整组");
      setInheritedOptionLabel(cardKpiSizeControl, kpiSizeControl, state.kpiIconSize, "跟随整组");
      setInheritedOptionLabel(cardKpiLayoutControl, kpiLayoutControl, state.kpiLayout, "跟随整组");
      setInheritedOptionLabel(cardKpiBackgroundControl, kpiCardBackgroundControl, state.kpiCardBackground, "跟随整组");
      setInheritedOptionLabel(cardKpiDecorationControl, kpiDecorationControl, kpiDecorationControl.value, "跟随整组");
      setInheritedOptionLabel(cardKpiStyleColorControl, kpiStyleColorControl, kpiStyleColorControl.value, "跟随整组");
    }

    function syncKpiStyleSamples() {
      const globalHasBackground = state.kpiIconContainer !== "none";
      kpiShapeControl.disabled = !globalHasBackground;
      kpiDecorationControl.value = deriveKpiDecoration(state);
      kpiStyleColorControl.value = state.kpiIconColor;
      kpiStyleColorControl.disabled = false;
      syncInheritedOptionLabels();
      if (!selectedCardId) {
        syncCustomSelects();
        return;
      }
      const override = state.cardOverrides?.[selectedCardId] || {};
      const hasDecorationOverride = ["kpiIcon", "kpiIconWeight", "kpiIconContainer"].some((key) => key in override);
      const localSource = { kpiIcon: override.kpiIcon || state.kpiIcon, kpiIconContainer: override.kpiIconContainer || state.kpiIconContainer };
      const localDecoration = hasDecorationOverride ? deriveKpiDecoration(localSource) : "inherit";
      const localContainer = override.kpiIconContainer || state.kpiIconContainer;
      cardKpiShapeControl.disabled = localContainer === "none";
      cardKpiDecorationControl.value = localDecoration;
      cardKpiStyleColorControl.value = override.iconColor || "inherit";
      cardKpiStyleColorControl.disabled = false;
      syncCustomSelects();
    }

    function applyGlobalKpiDecoration(decoration) {
      applyKpiDecoration(state, decoration);
      applyState();
    }

    function applyCardKpiDecoration(decoration) {
      if (!selectedCardId) return;
      state.cardOverrides ||= {};
      const override = { ...(state.cardOverrides[selectedCardId] || {}) };
      applyKpiDecoration(override, decoration, true);
      if (Object.keys(override).length) state.cardOverrides[selectedCardId] = override;
      else delete state.cardOverrides[selectedCardId];
      applyCardOverrides();
      updateCardContext();
      scheduleWorkspaceSave();
    }

    function applyCardKpiColor(color) {
      if (!selectedCardId) return;
      state.cardOverrides ||= {};
      const override = { ...(state.cardOverrides[selectedCardId] || {}) };
      if (color === "inherit") delete override.iconColor;
      else override.iconColor = color;
      if (Object.keys(override).length) state.cardOverrides[selectedCardId] = override;
      else delete state.cardOverrides[selectedCardId];
      applyCardOverrides();
      updateCardContext();
      scheduleWorkspaceSave();
    }

    function applyCardOverrides() {
      state.cardOverrides ||= {};
      dashboard.querySelectorAll("[data-item-id]").forEach((card) => {
        delete card.dataset.chartPalette;
        delete card.dataset.chartType;
        delete card.dataset.cardTitleIcon;
        delete card.dataset.cardTitleIconColor;
        delete card.dataset.cardTitleIconEffect;
        delete card.dataset.cardSubtitle;
        delete card.dataset.kpiIcon;
        delete card.dataset.kpiIconWeight;
        delete card.dataset.kpiIconContainer;
        delete card.dataset.kpiIconShape;
        delete card.dataset.kpiIconSize;
        delete card.dataset.kpiLayout;
        delete card.dataset.kpiCardBackground;
        delete card.dataset.iconColor;
        const override = state.cardOverrides[card.dataset.itemId];
        if (!override) return;
        if (["monochrome", "bichrome", "categorical"].includes(override.chartPalette)) card.dataset.chartPalette = override.chartPalette;
        if (["line", "area", "bar", "horizontal-bar", "pie"].includes(override.chartType)) card.dataset.chartType = override.chartType;
        if (cardTitleStylePresets[override.cardTitleStyle]) {
          const titleStyle = cardTitleStylePresets[override.cardTitleStyle];
          card.dataset.cardTitleIcon = titleStyle.cardTitleIcon;
          card.dataset.cardTitleIconColor = titleStyle.cardTitleIconColor;
          card.dataset.cardTitleIconEffect = titleStyle.cardTitleIconEffect;
        } else {
          if (["none", "line", "soft", "solid"].includes(override.cardTitleIcon)) card.dataset.cardTitleIcon = override.cardTitleIcon;
          if (["neutral", "accent", "colorful"].includes(override.cardTitleIconColor)) card.dataset.cardTitleIconColor = override.cardTitleIconColor;
        }
        if (override.cardSubtitle === "right") override.cardSubtitle = "title-right";
        if (["none", "below", "title-right", "card-right", "icon"].includes(override.cardSubtitle)) card.dataset.cardSubtitle = override.cardSubtitle;
        const subtitle = card.querySelector(".panel-note");
        if (subtitle) {
          let subtitleText = subtitle.querySelector(".card-subtitle-text");
          if (!subtitleText) {
            subtitleText = document.createElement("span");
            subtitleText.className = "card-subtitle-text";
            subtitleText.textContent = subtitle.textContent.trim();
            subtitle.replaceChildren(subtitleText);
          }
          const translatedText = translations[state.language]?.[subtitle.dataset.i18n] || subtitleText.textContent.trim();
          subtitleText.textContent = typeof override.cardSubtitleText === "string" ? override.cardSubtitleText : translatedText;
          subtitle.dataset.tooltip = subtitleText.textContent.trim();
        }
        if (["none", "outline", "filled"].includes(override.kpiIcon)) card.dataset.kpiIcon = override.kpiIcon;
        if (["thin", "regular", "bold"].includes(override.kpiIconWeight)) card.dataset.kpiIconWeight = override.kpiIconWeight;
        if (["none", "outline", "soft", "solid", "gradient", "bigradient"].includes(override.kpiIconContainer)) card.dataset.kpiIconContainer = override.kpiIconContainer;
        if (["rect", "circle"].includes(override.kpiIconShape)) card.dataset.kpiIconShape = override.kpiIconShape;
        if (["small", "medium", "large"].includes(override.kpiIconSize)) card.dataset.kpiIconSize = override.kpiIconSize;
        if (["default", "white", "single", "multi"].includes(override.kpiCardBackground)) card.dataset.kpiCardBackground = override.kpiCardBackground;
        if (override.kpiLayout === "stacked") override.kpiLayout = "right-top";
        if (override.kpiLayout === "horizontal") override.kpiLayout = "left-top";
        if (["left-top", "left-middle", "right-top", "right-middle"].includes(override.kpiLayout)) card.dataset.kpiLayout = override.kpiLayout;
        if (["auto", "neutral", "accent", "colorful", "gradient-neutral", "gradient-accent", "gradient-colorful"].includes(override.iconColor)) card.dataset.iconColor = override.iconColor;
      });
      applyKpiColorTokens();
      renderKpiIcons();
      renderCardTitleIcons();
      renderWorkspaceCharts();
    }

    function resolveKpiIconColorMode(card) {
      const configuredMode = card.dataset.iconColor || state.kpiIconColor;
      if (configuredMode !== "auto") return configuredMode;
      const backgroundMode = card.dataset.kpiCardBackground || state.kpiCardBackground;
      if (backgroundMode === "multi") return "colorful";
      if (backgroundMode === "single") return "accent";
      return "neutral";
    }

    function renderKpiIcons() {
      const iconNames = {
        "priority-customers": "users-three",
        "opportunity-value": "currency-dollar",
        "conversion-rate": "pulse"
      };
      dashboard.querySelectorAll('.metric[data-item-id] .metric-icon svg').forEach((svg) => {
        const card = svg.closest('.metric[data-item-id]');
        const iconName = iconNames[card.dataset.itemId] || iconNames[sourceComponentId(card.dataset.itemId)];
        const icon = phosphorKpiIcons[iconName];
        const style = card.dataset.kpiIcon || state.kpiIcon;
        if (!icon || !["outline", "filled"].includes(style)) return;
        const weight = card.dataset.kpiIconWeight || state.kpiIconWeight;
        const pathStyle = style === "filled" ? "fill" : ["thin", "bold"].includes(weight) ? weight : "regular";
        const colorMode = card.dataset.resolvedIconColor || resolveKpiIconColorMode(card);
        const gradientId = `kpi-gradient-${card.dataset.itemId}`;
        const gradientEnd = colorMode === "gradient-colorful"
          ? '<stop offset="1" style="stop-color:var(--icon-accent-alt)"/>'
          : '<stop offset="1" style="stop-color:var(--icon-accent-alt)"/>';
        svg.setAttribute("viewBox", "0 0 256 256");
        svg.innerHTML = colorMode.startsWith("gradient-")
          ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--icon-accent)"/>${gradientEnd}</linearGradient></defs>${icon[pathStyle]}`
          : icon[pathStyle];
        if (colorMode.startsWith("gradient-")) {
          svg.querySelectorAll(":scope > path").forEach((path) => { path.style.fill = `url(#${gradientId})`; });
        }
      });
      renderCardTitleIconEffects();
    }

    function applyKpiColorTokens() {
      if (!kpiColorContext) return;
      const cards = [...dashboard.querySelectorAll('.metric[data-item-id]')];
      cards.forEach((card, index) => {
        ["--icon-accent", "--icon-accent-alt", "--icon-soft", "--icon-solid", "--icon-solid-alt", "--icon-on-solid", "--kpi-card-palette"].forEach((name) => card.style.removeProperty(name));
        const paletteSeed = kpiColorContext.palette[index % kpiColorContext.palette.length];
        const paletteTokens = deriveIconTokens(paletteSeed, state.mode, kpiColorContext.surface);
        card.style.setProperty("--kpi-card-palette", paletteSeed);
        const colorMode = resolveKpiIconColorMode(card);
        card.dataset.resolvedIconColor = colorMode;
        if (!["colorful", "gradient-colorful"].includes(colorMode)) return;
        const tokens = paletteTokens;
        card.style.setProperty("--icon-accent", paletteSeed);
        card.style.setProperty("--icon-accent-alt", kpiColorContext.palette[(index + 1) % kpiColorContext.palette.length]);
        card.style.setProperty("--icon-soft", tokens.soft);
        card.style.setProperty("--icon-solid", tokens.solid);
        card.style.setProperty("--icon-solid-alt", deriveIconGradientAlternate(paletteSeed, state.mode, kpiColorContext.surface));
        card.style.setProperty("--icon-on-solid", tokens.onSolid);
      });
    }

    function applySectionIconColorTokens(palette, surface) {
      const sections = [...dashboard.querySelectorAll('.section[data-section-id]')];
      sections.forEach((section) => {
        ["--section-icon-accent", "--section-icon-accent-alt"].forEach((name) => section.style.removeProperty(name));
      });
      if (!['colorful', 'gradient-colorful'].includes(state.sectionIconColor)) return;
      const visibleSections = sections.filter((section) => {
        const heading = section.querySelector(':scope > .section-heading');
        return heading && getComputedStyle(heading).display !== 'none';
      });
      visibleSections.forEach((section, index) => {
        const seed = palette[index % palette.length];
        section.style.setProperty("--section-icon-accent", seed);
        section.style.setProperty("--section-icon-accent-alt", palette[(index + 1) % palette.length]);
      });
    }

    let layoutDragState = null;
    const cardTemplateRegistry = new Map();
    let bindLayoutCard = () => {};
    const layoutSpanSteps = LAYOUT_SPAN_STEPS;

    function cleanLayoutCardClone(card) {
      card.querySelectorAll(".layout-resize-handle, .component-empty-state, .chart-render").forEach((element) => element.remove());
      card.classList.remove("layout-dragging", "layout-pointer-dragging", "layout-drag-outside", "layout-drop-candidate", "layout-drop-target", "layout-drop-landed");
      ["selected", "resizing", "dropSide", "layoutBound", "selectionBound", "chartRendered", "empty"].forEach((key) => delete card.dataset[key]);
      card.draggable = false;
      ["position", "left", "top", "width", "height", "transform", "transition", "order"].forEach((property) => { card.style[property] = ""; });
      return card;
    }

    function registerCardTemplate(card) {
      if (!card?.dataset.itemId) return;
      cardTemplateRegistry.set(card.dataset.itemId, cleanLayoutCardClone(card.cloneNode(true)));
    }

    function bindCardSelection(card) {
      if (!card || card.dataset.selectionBound === "true") return;
      card.dataset.selectionBound = "true";
      card.addEventListener("click", (event) => {
        if (document.body.dataset.designMode !== "true" || event.target.closest(".layout-resize-handle")) return;
        event.stopPropagation();
        selectCard(card);
      });
    }

    function sourceComponentId(componentId) {
      return String(componentId).replace(/-(?:copy|new)(?:-\d+)?$/, "");
    }

    function rewriteClonedIds(card, componentId) {
      const idMap = new Map();
      card.querySelectorAll("[id]").forEach((element, index) => {
        const previous = element.id;
        const safeId = previous.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `node-${index + 1}`;
        const next = `${componentId}--${safeId}`;
        idMap.set(previous, next);
        element.id = next;
      });
      if (!idMap.size) return;
      const tokenAttributes = ["for", "aria-labelledby", "aria-describedby", "aria-controls", "headers"];
      card.querySelectorAll("*").forEach((element) => {
        tokenAttributes.forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map((token) => idMap.get(token) || token).join(" "));
        });
        ["href", "xlink:href"].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (value?.startsWith("#") && idMap.has(value.slice(1))) element.setAttribute(attribute, `#${idMap.get(value.slice(1))}`);
        });
        ["fill", "stroke", "filter", "clip-path", "mask", "style"].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (!value?.includes("url(#")) return;
          element.setAttribute(attribute, value.replace(/url\(#([^)]+)\)/g, (match, id) => `url(#${idMap.get(id) || id})`));
        });
      });
    }

    function createWorkspaceCard(component, sectionModel) {
      const parentId = sourceComponentId(component.id);
      const liveSource = dashboard.querySelector(`[data-item-id="${CSS.escape(parentId)}"]`);
      const sectionCandidates = sectionModel.components
        .filter(({ id, type }) => id !== component.id && type === component.type)
        .map(({ id }) => dashboard.querySelector(`[data-item-id="${CSS.escape(id)}"]`) || cardTemplateRegistry.get(id))
        .filter(Boolean);
      const registeredTypeMatch = [...cardTemplateRegistry.values()].find((card) => card.dataset.cardType === (component.type === "kpi" ? "kpi" : component.type === "chart" ? "chart" : "generic"));
      const source = liveSource || cardTemplateRegistry.get(parentId) || sectionCandidates[0] || registeredTypeMatch;
      if (!source) return null;
      const card = cleanLayoutCardClone(source.cloneNode(true));
      rewriteClonedIds(card, component.id);
      card.dataset.itemId = component.id;
      card.dataset.cardType = component.type === "kpi" ? "kpi" : component.type === "chart" ? "chart" : "generic";
      return card;
    }

    function bindDynamicWorkspaceSection(section) {
      if (section.dataset.workspaceSectionBound === "true" || section.querySelector(":scope > .layout-section-handle")) return;
      section.dataset.workspaceSectionBound = "true";
      const body = dashboard.querySelector(":scope > .report-body");
      const heading = section.querySelector(":scope > .section-heading");
      const group = section.querySelector(":scope > .layout-group");
      if (!body || !heading || !group) return;
      const tools = document.createElement("div");
      tools.className = "layout-section-tools";
      const upButton = createLayoutButton("上移分组", '<path d="m6 15 6-6 6 6"></path>');
      const downButton = createLayoutButton("下移分组", '<path d="m6 9 6 6 6-6"></path>');
      upButton.dataset.layoutMove = "up";
      downButton.dataset.layoutMove = "down";
      upButton.addEventListener("click", () => moveLayoutElement(section, -1, ".section[data-section-id]"));
      downButton.addEventListener("click", () => moveLayoutElement(section, 1, ".section[data-section-id]"));
      const layoutSelect = createLayoutSelect("分组布局", [["responsive", "自适应"], ["custom", "自由尺寸"], ["2", "2 列"], ["3", "3 列"], ["4", "4 列"], ["stack", "1 列"]], group.dataset.layout || "responsive");
      layoutSelect.select.dataset.layoutGroup = section.dataset.sectionId;
      layoutSelect.select.addEventListener("change", () => {
        group.dataset.layout = layoutSelect.select.value;
        scheduleWorkspaceSave();
      });
      tools.append(layoutSelect.field, upButton, downButton);
      heading.append(tools);
      const sectionHandle = createLayoutButton("拖动整组", '<circle cx="8" cy="7" r="1.5"></circle><circle cx="16" cy="7" r="1.5"></circle><circle cx="8" cy="12" r="1.5"></circle><circle cx="16" cy="12" r="1.5"></circle><circle cx="8" cy="17" r="1.5"></circle><circle cx="16" cy="17" r="1.5"></circle>', true);
      sectionHandle.className = "layout-section-handle";
      sectionHandle.addEventListener("pointerdown", () => selectSection(section));
      setupDashboardPointerDrag(sectionHandle, section, body);
      section.append(sectionHandle);
    }

    const workspaceStructureSynchronizer = createWorkspaceStructureSynchronizer({
      beforeSynchronize: () => dashboard.querySelectorAll(".surface[data-item-id]").forEach(registerCardTemplate),
      listExistingSections: () => [...dashboard.querySelectorAll(".report-body > .section[data-section-id]")].map((section) => ({ id: section.dataset.sectionId })),
      listExisting: () => [...dashboard.querySelectorAll(".surface[data-item-id]")].map((card) => ({
        id: card.dataset.itemId,
        sectionId: card.closest(".section[data-section-id]")?.dataset.sectionId || "",
        order: [...(card.parentElement?.children || [])].filter((element) => element.matches?.(".surface[data-item-id]")).indexOf(card),
        span: Number(card.dataset.span) || 12,
        cardType: card.dataset.cardType || "generic"
      })),
      findCard: (id) => dashboard.querySelector(`[data-item-id="${CSS.escape(id)}"]`),
      findSection: (id) => dashboard.querySelector(`.report-body > [data-section-id="${CSS.escape(id)}"]`),
      createSection: (sectionModel) => {
        const section = document.createElement("section");
        section.className = "section";
        section.dataset.sectionId = sectionModel.id;
        const heading = document.createElement("header");
        heading.className = "section-heading";
        const number = document.createElement("span");
        number.className = "section-number";
        const title = document.createElement("h2");
        const subtitle = document.createElement("small");
        const rule = document.createElement("span");
        rule.className = "section-rule";
        const group = document.createElement("div");
        group.className = "layout-group";
        heading.append(number, title, subtitle, rule);
        section.append(heading, group);
        return section;
      },
      removeSection: (section) => section.remove(),
      appendSection: (section) => dashboard.querySelector(":scope > .report-body")?.appendChild(section),
      prepareSection: (section, sectionModel) => {
        section.dataset.grouped = String(sectionModel.grouped);
        section.dataset.span = "12";
        section.style.setProperty("--section-span", 12);
        const heading = section.querySelector(":scope > .section-heading");
        const sectionIndex = [...workspaceDocument.sections].findIndex(({ id }) => id === sectionModel.id);
        const number = heading?.querySelector(":scope > .section-number");
        if (number) number.textContent = String(sectionIndex + 1).padStart(2, "0");
        const title = heading?.querySelector(":scope > h2");
        if (title) title.textContent = sectionModel.title;
        const subtitle = heading?.querySelector(":scope > small");
        if (subtitle) subtitle.textContent = sectionModel.subtitle;
        const group = section.querySelector(":scope > .layout-group");
        if (group) group.dataset.layout = sectionModel.layout || "responsive";
        bindDynamicWorkspaceSection(section);
      },
      findSectionContainer: (sectionId) => {
        const section = dashboard.querySelector(`[data-section-id="${CSS.escape(sectionId)}"]`);
        return section?.querySelector(":scope > .layout-group") || section;
      },
      createCard: (component, sectionModel) => createWorkspaceCard(component, sectionModel),
      removeCard: (card) => card.remove(),
      prepareCard: (card, item) => {
        card.classList.add("layout-item");
        card.dataset.itemId = item.id;
        card.dataset.cardType = item.cardType;
        card.dataset.span = String(item.span);
        card.style.setProperty("--item-span", item.span);
      },
      appendCard: (container, card) => container.appendChild(card),
      bindCard: (card) => {
        bindCardSelection(card);
        bindLayoutCard(card);
      }
    });

    function synchronizeWorkspaceCardStructure(documentModel, layoutModel) {
      return workspaceStructureSynchronizer.synchronize(documentModel, layoutModel);
    }

    function createLayoutButton(label, icon, draggable = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layout-edit-button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.draggable = draggable;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
      return button;
    }

    function createLayoutSelect(label, options, value) {
      const field = document.createElement("label");
      const fieldLabel = document.createElement("span");
      const select = document.createElement("select");
      field.className = "layout-select-field";
      fieldLabel.className = "visually-hidden";
      fieldLabel.textContent = label;
      select.className = "control-select";
      select.setAttribute("aria-label", label);
      options.forEach(([optionValue, optionLabel]) => select.add(new Option(optionLabel, optionValue)));
      select.value = value;
      field.append(fieldLabel, select);
      return { field, select };
    }

    function layoutSiblings(element, selector) {
      return [...element.parentElement.children].filter((child) => child.matches(selector));
    }

    function moveLayoutElement(element, direction, selector) {
      const siblings = layoutSiblings(element, selector);
      const index = siblings.indexOf(element);
      const target = siblings[index + direction];
      if (!target) return;
      if (direction < 0) target.before(element);
      else target.after(element);
      refreshLayoutButtons();
      scheduleWorkspaceSave();
    }

    function refreshLayoutButtons() {
      document.querySelectorAll(".section[data-section-id]").forEach((section) => {
        const siblings = layoutSiblings(section, ".section[data-section-id]");
        const index = siblings.indexOf(section);
        const up = section.querySelector('[data-layout-move="up"]');
        const down = section.querySelector('[data-layout-move="down"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === siblings.length - 1;
      });
    }

    function setLayoutItemSpan(item, group, groupLayoutSelect, span) {
      const nextSpan = nearestLayoutSpan(Number(span));
      item.dataset.span = String(nextSpan);
      item.style.setProperty("--item-span", nextSpan);
      if (group) {
        group.dataset.layout = "custom";
        groupLayoutSelect.value = "custom";
        syncCustomSelect(groupLayoutSelect);
      }
      scheduleWorkspaceSave();
    }

    function createLayoutResizeHandle(item, group, groupLayoutSelect, side) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `layout-resize-handle layout-resize-handle--${side}`;
      handle.setAttribute("aria-label", `${side === "left" ? "左侧" : "右侧"}调整卡片宽度`);
      handle.title = `${side === "left" ? "左侧" : "右侧"}拖动调整卡片宽度`;

      const updateFromPointer = (clientX) => {
        const sizingGrid = isDashboardFreeCard(item) ? item.closest(".report-body") : group;
        const groupRect = sizingGrid.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const gridStyle = getComputedStyle(sizingGrid);
        const gap = Number.parseFloat(gridStyle.columnGap) || 0;
        const gridWidth = groupRect.width - (Number.parseFloat(gridStyle.paddingLeft) || 0) - (Number.parseFloat(gridStyle.paddingRight) || 0);
        const columnWidth = Math.max(1, (gridWidth - gap * 11) / 12);
        const pointerWidth = side === "left" ? itemRect.right - clientX : clientX - itemRect.left;
        const requestedWidth = Math.max(columnWidth, Math.min(gridWidth, pointerWidth));
        const rawSpan = (requestedWidth + gap) / (columnWidth + gap);
        setLayoutItemSpan(item, group, groupLayoutSelect, rawSpan);
      };

      let resizePointerId = null;
      const moveResize = (event) => {
        if (item.dataset.resizing !== "true" || event.pointerId !== resizePointerId) return;
        event.preventDefault();
        updateFromPointer(event.clientX);
      };
      const finishResize = (event) => {
        if (item.dataset.resizing !== "true" || event.pointerId !== resizePointerId) return;
        delete item.dataset.resizing;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        resizePointerId = null;
        document.removeEventListener("pointermove", moveResize);
        document.removeEventListener("pointerup", finishResize);
        document.removeEventListener("pointercancel", finishResize);
        scheduleWorkspaceSave();
      };
      handle.addEventListener("pointerdown", (event) => {
        if (document.body.dataset.designMode !== "true") return;
        event.preventDefault();
        event.stopPropagation();
        resizePointerId = event.pointerId;
        item.dataset.resizing = "true";
        setLayoutItemSpan(item, group, groupLayoutSelect, item.dataset.span);
        handle.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", moveResize, { passive: false });
        document.addEventListener("pointerup", finishResize);
        document.addEventListener("pointercancel", finishResize);
      });
      handle.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = Math.max(0, layoutSpanSteps.indexOf(Number(item.dataset.span)));
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(layoutSpanSteps.length - 1, currentIndex + direction));
        setLayoutItemSpan(item, group, groupLayoutSelect, layoutSpanSteps[nextIndex]);
      });
      return handle;
    }

    function clearLayoutDragState() {
      document.querySelectorAll(".layout-dragging, .layout-pointer-dragging, .layout-drag-outside, .layout-drop-candidate, .layout-drop-target, .layout-group-active, .layout-group-hover").forEach((element) => {
        element.classList.remove("layout-dragging", "layout-pointer-dragging", "layout-drag-outside", "layout-drop-candidate", "layout-drop-target", "layout-group-active", "layout-group-hover");
        delete element.dataset.dropSide;
      });
      document.querySelectorAll(".layout-grid-placeholder").forEach((element) => element.remove());
      layoutDragState = null;
    }

    function setLayoutDropCandidates(candidates, source) {
      candidates.filter((candidate) => candidate !== source).forEach((candidate) => candidate.classList.add("layout-drop-candidate"));
    }

    function setLayoutDropTarget(target, event) {
      document.querySelectorAll(".layout-drop-target").forEach((element) => {
        element.classList.remove("layout-drop-target");
        delete element.dataset.dropSide;
      });
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.dataset.dropSide = layoutDropSide(rect, { x: event.clientX, y: event.clientY });
      target.classList.add("layout-drop-target");
    }

    function flashLayoutDropLanded(node) {
      document.querySelectorAll(".layout-drop-landed").forEach((element) => element.classList.remove("layout-drop-landed"));
      node.classList.add("layout-drop-landed");
      window.setTimeout(() => node.classList.remove("layout-drop-landed"), 540);
    }

    function placeDraggedElement(source, target, event, verticalOnly = false) {
      const rect = target.getBoundingClientRect();
      const before = shouldInsertBefore(rect, { x: event.clientX, y: event.clientY }, { verticalOnly });
      if (before) target.before(source);
      else target.after(source);
      refreshLayoutButtons();
      scheduleWorkspaceSave();
    }

    function isDashboardFreeCard(item) {
      return dashboard.dataset.pageType === "dashboard" && item.closest(".section[data-section-id]")?.dataset.grouped === "false";
    }

    function isSingleColumnSection(section) {
      const group = section?.querySelector(":scope > .layout-group");
      const items = group ? [...group.querySelectorAll(":scope > .layout-item")] : [];
      if (items.length <= 1) return true;
      const columns = new Set(items.map((item) => Math.round(item.getBoundingClientRect().left)));
      return columns.size <= 1;
    }

    function updateGroupHover(section, target) {
      if (dashboard.dataset.pageType !== "dashboard" || section.dataset.grouped !== "true") return;
      const overCard = Boolean(target.closest(".layout-item[data-item-id]"));
      section.classList.toggle("layout-group-hover", !overCard || isSingleColumnSection(section));
    }

    function dashboardCanvasNodes(reportBody) {
      return [...reportBody.querySelectorAll(":scope > .section[data-section-id]")].flatMap((section) => {
        if (section.dataset.grouped === "true") return [section];
        const summary = section.querySelector(":scope > .summary[data-item-id]");
        if (summary) return [summary];
        return [...section.querySelectorAll(":scope > .layout-group > .layout-item[data-item-id]")];
      });
    }

    function dashboardCanvasNodeId(node) {
      return node.matches(".section[data-section-id]") ? `group:${node.dataset.sectionId}` : node.dataset.itemId;
    }

    function applyDashboardCanvasOrder(reportBody, orderedIds = []) {
      const nodes = dashboardCanvasNodes(reportBody);
      const requested = new Map(orderedIds.map((id, index) => [id, index]));
      nodes.sort((a, b) => {
        const aOrder = requested.has(dashboardCanvasNodeId(a)) ? requested.get(dashboardCanvasNodeId(a)) : Number(a.style.order || 1000);
        const bOrder = requested.has(dashboardCanvasNodeId(b)) ? requested.get(dashboardCanvasNodeId(b)) : Number(b.style.order || 1000);
        return aOrder - bOrder;
      });
      nodes.forEach((node, index) => { node.style.order = String(index); });
      return nodes.map(dashboardCanvasNodeId);
    }

    function reorderDashboardCanvasCard(reportBody, source, target, event) {
      const nodes = dashboardCanvasNodes(reportBody).sort((a, b) => Number(a.style.order) - Number(b.style.order));
      const targetRect = target.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const nodeById = new Map(nodes.map((node) => [dashboardCanvasNodeId(node), node]));
      const nextOrder = reorderCanvasIds({ ids: nodes.map(dashboardCanvasNodeId), sourceId: dashboardCanvasNodeId(source), targetId: dashboardCanvasNodeId(target), sourceRect, targetRect });
      if (nextOrder.join("|") === layoutDragState.canvasOrder.join("|")) return;
      nodes.splice(0, nodes.length, ...nextOrder.map((id) => nodeById.get(id)));
      const previousRects = new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));
      nodes.forEach((node, index) => { node.style.order = String(index); });
      layoutDragState.canvasOrder = nextOrder;
      if (layoutDragState.placeholder) layoutDragState.placeholder.style.order = source.style.order;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        requestAnimationFrame(() => {
          nodes.forEach((node) => {
            if (node === source) return;
            const previous = previousRects.get(node);
            const current = node.getBoundingClientRect();
            const deltaX = previous.left - current.left;
            const deltaY = previous.top - current.top;
            if (!deltaX && !deltaY) return;
            node.getAnimations().forEach((animation) => animation.cancel());
            node.animate(
              [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
              { duration: 150, easing: "cubic-bezier(.2,.8,.2,1)" }
            );
          });
        });
      }
    }

    function dashboardCanvasNodeAtPoint(reportBody, clientX, clientY) {
      const hit = document.elementFromPoint(clientX, clientY);
      if (!hit) return null;
      const section = hit.closest(".section[data-section-id]");
      if (section?.dataset.grouped === "true") return section;
      const item = hit.closest("[data-item-id]");
      return item && dashboardCanvasNodes(reportBody).includes(item) ? item : null;
    }

    function reorderGroupedCardPlaceholder(group, source, placeholder, target, event) {
      const siblings = [...group.children].filter((item) => item.classList.contains("layout-item") && item !== source);
      const previousRects = new Map(siblings.map((item) => [item, item.getBoundingClientRect()]));
      const targetRect = target.getBoundingClientRect();
      const before = shouldInsertBefore(targetRect, { x: event.clientX, y: event.clientY }, { rowThreshold: 0.35 });
      if (before) target.before(placeholder);
      else target.after(placeholder);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      requestAnimationFrame(() => {
        siblings.forEach((item) => {
          const previous = previousRects.get(item);
          const current = item.getBoundingClientRect();
          const deltaX = previous.left - current.left;
          const deltaY = previous.top - current.top;
          if (!deltaX && !deltaY) return;
          item.getAnimations().forEach((animation) => animation.cancel());
          item.animate(
            [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
            { duration: 150, easing: "cubic-bezier(.2,.8,.2,1)" }
          );
        });
      });
    }

    function setupDashboardPointerDrag(handle, node, reportBody) {
      handle.addEventListener("pointerdown", (event) => {
        if (dashboard.dataset.pageType !== "dashboard" || document.body.dataset.designMode !== "true" || event.button !== 0) return;
        const nodeSection = node.closest(".section[data-section-id]");
        if (node.matches("[data-item-id]") && nodeSection?.dataset.grouped === "true" && isSingleColumnSection(nodeSection)) return;
        // Ungrouped dashboard sections are display: contents; their cards are the real grid items.
        if (node.matches(".section[data-section-id]") && node.dataset.grouped !== "true") return;
        if (node.matches(".section[data-section-id]")) {
          const card = event.target.closest(".layout-item[data-item-id]");
          if (card && (node.dataset.grouped !== "true" || !isSingleColumnSection(node))) return;
          selectSection(node);
        }
        const interactiveTarget = event.target.closest(".layout-resize-handle, button, input, select, textarea, a, [contenteditable='true']");
        if (interactiveTarget && interactiveTarget !== handle) return;
        const handleWasDraggable = handle.draggable;
        const nodeWasDraggable = node.draggable;
        handle.draggable = false;
        node.draggable = false;
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const originRect = node.getBoundingClientRect();
        const groupedCardGroup = node.matches(".layout-item[data-item-id]") && node.closest(".section[data-grouped='true']") ? node.parentElement : null;
        const pointerOffsetX = event.clientX - originRect.left;
        const pointerOffsetY = event.clientY - originRect.top;
        const dragPointerId = event.pointerId;
        let active = false;
        let activeDragState = null;
        handle.setPointerCapture(event.pointerId);

        const move = (moveEvent) => {
          if (moveEvent.pointerId !== dragPointerId) return;
          if (!active && !shouldStartPointerDrag({ x: startX, y: startY }, { x: moveEvent.clientX, y: moveEvent.clientY })) return;
          if (!active) {
            active = true;
            const placeholder = document.createElement("div");
            placeholder.className = "layout-grid-placeholder";
            placeholder.style.height = `${originRect.height}px`;
            if (groupedCardGroup?.dataset.layout === "custom") placeholder.style.gridColumn = `span ${Number(node.dataset.span) || 4}`;
            if (groupedCardGroup) {
              node.after(placeholder);
              activeDragState = { type: "grouped-item", element: node, placeholder, group: groupedCardGroup };
              setLayoutDropCandidates([...groupedCardGroup.querySelectorAll(":scope > .layout-item[data-item-id]")], node);
            } else {
              placeholder.style.gridColumn = `span ${node.matches(".section[data-section-id]") ? Number(node.dataset.span) || 12 : Number(node.dataset.span) || 12}`;
              // Keep the source slot in place while the fixed drag preview is out of the grid.
              placeholder.style.order = node.style.order || "0";
              node.after(placeholder);
              activeDragState = { type: "canvas-item", element: node, placeholder, canvasOrder: applyDashboardCanvasOrder(reportBody) };
              setLayoutDropCandidates(dashboardCanvasNodes(reportBody), node);
            }
            layoutDragState = activeDragState;
            Object.assign(node.style, {
              position: "fixed",
              left: `${originRect.left}px`,
              top: `${originRect.top}px`,
              width: `${originRect.width}px`,
              height: `${originRect.height}px`
            });
            node.classList.add("layout-dragging", "layout-pointer-dragging");
            document.body.style.userSelect = "none";
          }
          node.style.transform = `translate3d(${moveEvent.clientX - pointerOffsetX - originRect.left}px, ${moveEvent.clientY - pointerOffsetY - originRect.top}px, 0)`;
          if (groupedCardGroup) {
            const groupRect = groupedCardGroup.getBoundingClientRect();
            const insideGroup = moveEvent.clientX >= groupRect.left && moveEvent.clientX <= groupRect.right && moveEvent.clientY >= groupRect.top && moveEvent.clientY <= groupRect.bottom;
            node.classList.toggle("layout-drag-outside", !insideGroup);
            document.body.style.cursor = insideGroup ? "" : "not-allowed";
            const hit = insideGroup ? document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) : null;
            const target = hit?.closest(".layout-item[data-item-id]");
            if (target && target !== node && target.parentElement === groupedCardGroup) {
              setLayoutDropTarget(target, moveEvent);
              reorderGroupedCardPlaceholder(groupedCardGroup, node, activeDragState.placeholder, target, moveEvent);
            } else {
              setLayoutDropTarget(null, moveEvent);
            }
            return;
          }
          const target = dashboardCanvasNodeAtPoint(reportBody, moveEvent.clientX, moveEvent.clientY);
          activeDragState.dropTarget = target && target !== node ? target : null;
          if (!activeDragState.dropTarget) {
            setLayoutDropTarget(null, moveEvent);
            return;
          }
          setLayoutDropTarget(activeDragState.dropTarget, moveEvent);
        };

        const finish = (finishEvent) => {
          if (finishEvent.pointerId !== dragPointerId) return;
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", finish);
          document.removeEventListener("pointercancel", finish);
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          handle.draggable = handleWasDraggable;
          node.draggable = nodeWasDraggable;
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          if (!active) {
            clearLayoutDragState();
            return;
          }
          const dragState = activeDragState;
          if (!dragState) {
            clearLayoutDragState();
            return;
          }
          layoutDragState = dragState;
          if (!groupedCardGroup) {
            dragState.placeholder.remove();
            if (dragState.dropTarget) reorderDashboardCanvasCard(reportBody, node, dragState.dropTarget, finishEvent);
            node.style.position = "";
            node.style.left = "";
            node.style.top = "";
            node.style.width = "";
            node.style.height = "";
            node.style.transform = "";
            scheduleWorkspaceSave();
            clearLayoutDragState();
            flashLayoutDropLanded(node);
            return;
          }
          const placeholderRect = dragState.placeholder.getBoundingClientRect();
          const floatingRect = node.getBoundingClientRect();
          dragState.placeholder.before(node);
          node.style.transition = "transform 160ms cubic-bezier(.2,.8,.2,1)";
          node.style.transform = `translate3d(${placeholderRect.left - floatingRect.left + parseFloat(new DOMMatrix(getComputedStyle(node).transform).m41 || 0)}px, ${placeholderRect.top - floatingRect.top + parseFloat(new DOMMatrix(getComputedStyle(node).transform).m42 || 0)}px, 0)`;
          window.setTimeout(() => {
            node.style.position = "";
            node.style.left = "";
            node.style.top = "";
            node.style.width = "";
            node.style.height = "";
            node.style.transform = "";
            node.style.transition = "";
            scheduleWorkspaceSave();
            clearLayoutDragState();
            flashLayoutDropLanded(node);
          }, 165);
        };

        document.addEventListener("pointermove", move, { passive: false });
        document.addEventListener("pointerup", finish);
        document.addEventListener("pointercancel", finish);
      });
    }

    function setupLayoutEditor() {
      const reportBody = document.querySelector(".report-body");
      const summaryCard = reportBody.querySelector(".summary");
      summaryCard.dataset.itemId = "summary-card";
      summaryCard.dataset.cardType = "generic";
      summaryCard.dataset.span = "12";
      summaryCard.style.setProperty("--item-span", 12);
      registerCardTemplate(summaryCard);
      bindCardSelection(summaryCard);
      const syncSummaryCompactLayout = () => {
        summaryCard.dataset.compact = String(summaryCard.getBoundingClientRect().width < 680);
      };
      new ResizeObserver(syncSummaryCompactLayout).observe(summaryCard);
      syncSummaryCompactLayout();
      summaryCard.append(
        createLayoutResizeHandle(summaryCard, null, null, "left"),
        createLayoutResizeHandle(summaryCard, null, null, "right")
      );
      setupDashboardPointerDrag(summaryCard, summaryCard, reportBody);
      const groupDefinitions = [
        { sectionId: "metrics", selector: ".metric-grid", items: [["priority-customers", 4, "kpi"], ["opportunity-value", 4, "kpi"], ["conversion-rate", 4, "kpi"]] },
        { sectionId: "trends", selector: ".content-grid", items: [["opportunity-trend", 8, "chart"], ["source-ranking", 4, "chart"]] },
        { sectionId: "health", selector: ".health-grid", items: [["customer-health", 8, "generic"], ["risk-items", 4, "generic"]] }
      ];
      const groupMap = new Map();

      groupDefinitions.forEach((definition) => {
        const section = reportBody.querySelector(`[data-section-id="${definition.sectionId}"]`);
        const group = section.querySelector(definition.selector);
        group.classList.add("layout-group");
        group.dataset.layout = "responsive";
        const items = [...group.children].filter((child) => child.classList.contains("surface"));
        definition.items.forEach(([id, span, type], index) => {
          const item = items[index];
          item.classList.add("layout-item");
          item.dataset.itemId = id;
          item.dataset.cardType = type;
          item.dataset.span = String(span);
          item.style.setProperty("--item-span", span);
          registerCardTemplate(item);
        });
        groupMap.set(definition.sectionId, group);
      });

      reportBody.querySelectorAll(":scope > .section[data-section-id]").forEach((section) => {
        section.dataset.grouped = section.dataset.sectionId === "metrics" ? "true" : "false";
        section.dataset.span ||= "12";
        section.style.setProperty("--section-span", section.dataset.span);
        const heading = section.querySelector(":scope > .section-heading");
        const tools = document.createElement("div");
        const sectionHandle = createLayoutButton("拖动整组", '<circle cx="8" cy="7" r="1.5"></circle><circle cx="16" cy="7" r="1.5"></circle><circle cx="8" cy="12" r="1.5"></circle><circle cx="16" cy="12" r="1.5"></circle><circle cx="8" cy="17" r="1.5"></circle><circle cx="16" cy="17" r="1.5"></circle>', true);
        const dragButton = createLayoutButton("拖动分组", '<circle cx="9" cy="6" r="1"></circle><circle cx="15" cy="6" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="18" r="1"></circle><circle cx="15" cy="18" r="1"></circle>', true);
        const upButton = createLayoutButton("上移分组", '<path d="m6 15 6-6 6 6"></path>');
        const downButton = createLayoutButton("下移分组", '<path d="m6 9 6 6 6-6"></path>');
        tools.className = "layout-section-tools";
        dragButton.classList.add("layout-section-inline-drag");
        upButton.dataset.layoutMove = "up";
        downButton.dataset.layoutMove = "down";
        upButton.addEventListener("click", () => moveLayoutElement(section, -1, ".section[data-section-id]"));
        downButton.addEventListener("click", () => moveLayoutElement(section, 1, ".section[data-section-id]"));
        dragButton.addEventListener("dragstart", (event) => {
          layoutDragState = { type: "section", element: section };
          section.classList.add("layout-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", section.dataset.sectionId);
        });
        dragButton.addEventListener("dragend", clearLayoutDragState);
        sectionHandle.className = "layout-section-handle";
        sectionHandle.addEventListener("pointerenter", () => section.classList.add("layout-group-active"));
        sectionHandle.addEventListener("pointerleave", () => {
          if (!section.classList.contains("layout-dragging")) section.classList.remove("layout-group-active");
        });
        sectionHandle.addEventListener("dragstart", (event) => {
          layoutDragState = { type: "section", element: section };
          section.classList.add("layout-dragging", "layout-group-active");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", section.dataset.sectionId);
        });
        sectionHandle.addEventListener("dragend", clearLayoutDragState);
        sectionHandle.addEventListener("pointerdown", () => {
          if (dashboard.dataset.pageType !== "dashboard") return;
          section.style.setProperty("--group-handle-left", "-10px");
          section.style.setProperty("--group-handle-top", "-10px");
          selectSection(section);
        });
        setupDashboardPointerDrag(sectionHandle, section, reportBody);
        section.appendChild(sectionHandle);
        tools.append(dragButton, upButton, downButton);

        const group = groupMap.get(section.dataset.sectionId);
        if (group) {
          const layoutSelect = createLayoutSelect("分组布局", [["responsive", "自适应"], ["custom", "自由尺寸"], ["2", "2 列"], ["3", "3 列"], ["4", "4 列"], ["stack", "1 列"]], group.dataset.layout);
          layoutSelect.select.dataset.layoutGroup = section.dataset.sectionId;
          layoutSelect.select.addEventListener("change", () => {
            group.dataset.layout = layoutSelect.select.value;
            if (selectedSectionId === section.dataset.sectionId) {
              sectionLayoutControl.value = layoutSelect.select.value;
              syncCustomSelect(sectionLayoutControl);
            }
            scheduleWorkspaceSave();
          });
          tools.prepend(layoutSelect.field);
        }
        heading.appendChild(tools);

        section.addEventListener("pointermove", (event) => updateGroupHover(section, event.target));
        section.addEventListener("pointerleave", () => section.classList.remove("layout-group-hover"));
        setupDashboardPointerDrag(section, section, reportBody);

        section.addEventListener("dragover", (event) => {
          if (layoutDragState?.type !== "section" || layoutDragState.element === section) return;
          event.preventDefault();
          section.classList.add("layout-drop-target");
        });
        section.addEventListener("dragleave", (event) => {
          if (!section.contains(event.relatedTarget)) section.classList.remove("layout-drop-target");
        });
        section.addEventListener("drop", (event) => {
          if (layoutDragState?.type !== "section" || layoutDragState.element === section) return;
          event.preventDefault();
          placeDraggedElement(layoutDragState.element, section, event, true);
          clearLayoutDragState();
        });
      });

      applyDashboardCanvasOrder(reportBody);

      bindLayoutCard = (item) => {
        if (!item || item.dataset.layoutBound === "true") return;
        const group = item.closest(".layout-group");
        const sectionId = item.closest(".section[data-section-id]")?.dataset.sectionId;
        const groupLayoutSelect = sectionId ? document.querySelector(`[data-layout-group="${CSS.escape(sectionId)}"]`) : null;
        if (!group || !groupLayoutSelect) return;
        item.dataset.layoutBound = "true";
        item.draggable = true;
        item.append(
          createLayoutResizeHandle(item, group, groupLayoutSelect, "left"),
          createLayoutResizeHandle(item, group, groupLayoutSelect, "right")
        );
        item.addEventListener("dragstart", (event) => {
          if (document.body.dataset.designMode !== "true" || item.dataset.resizing === "true") {
            event.preventDefault();
            return;
          }
          layoutDragState = isDashboardFreeCard(item)
            ? { type: "canvas-item", element: item, group, canvasOrder: applyDashboardCanvasOrder(reportBody) }
            : { type: "item", element: item, group };
          item.classList.add("layout-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.dataset.itemId);
        });
        item.addEventListener("dragend", () => {
          if (layoutDragState?.type === "canvas-item") scheduleWorkspaceSave();
          clearLayoutDragState();
        });
        setupDashboardPointerDrag(item, item, reportBody);
        item.addEventListener("dragover", (event) => {
          if (layoutDragState?.type === "canvas-item" && layoutDragState.element !== item && isDashboardFreeCard(item)) {
            event.preventDefault();
            event.stopPropagation();
            reorderDashboardCanvasCard(reportBody, layoutDragState.element, item, event);
            item.classList.add("layout-drop-target");
            return;
          }
          if (layoutDragState?.type !== "item" || layoutDragState.group !== group || layoutDragState.element === item) return;
          event.preventDefault();
          event.stopPropagation();
          item.classList.add("layout-drop-target");
        });
        item.addEventListener("dragleave", (event) => {
          if (!item.contains(event.relatedTarget)) item.classList.remove("layout-drop-target");
        });
        item.addEventListener("drop", (event) => {
          if (layoutDragState?.type === "canvas-item") {
            event.preventDefault();
            event.stopPropagation();
            scheduleWorkspaceSave();
            clearLayoutDragState();
            return;
          }
          if (layoutDragState?.type !== "item" || layoutDragState.group !== group || layoutDragState.element === item) return;
          event.preventDefault();
          event.stopPropagation();
          placeDraggedElement(layoutDragState.element, item, event);
          clearLayoutDragState();
        });
        bindCardSelection(item);
      };
      groupMap.forEach((group) => {
        [...group.children].filter((child) => child.classList.contains("layout-item")).forEach(bindLayoutCard);
      });

      window.DashboardLayoutEditor = createWorkspaceLayoutController({
        document,
        reportBody,
        summaryCard,
        groupMap,
        canvasNodes: dashboardCanvasNodes,
        canvasNodeId: dashboardCanvasNodeId,
        applyCanvasOrder: applyDashboardCanvasOrder,
        refreshButtons: refreshLayoutButtons,
        syncSelect: syncCustomSelect,
        onChange: scheduleWorkspaceSave
      });
      refreshLayoutButtons();
      dashboard.addEventListener("click", (event) => {
        if (document.body.dataset.designMode !== "true" || event.target.closest(".surface[data-item-id]")) return;
        selectSection(event.target.closest(".section[data-section-id]"));
      });
    }

    function setupToolbarBandCollapse() {
      document.querySelectorAll(".toolbar-band > .toolbar-band-title").forEach((title) => {
        const band = title.parentElement;
        title.tabIndex = 0;
        title.setAttribute("aria-expanded", "true");

        const toggle = () => {
          const collapsed = band.dataset.collapsed === "true";
          band.dataset.collapsed = String(!collapsed);
          title.setAttribute("aria-expanded", String(collapsed));
        };
        title.addEventListener("click", (event) => {
          if (event.target.closest("button, input, select, textarea, a, label")) return;
          toggle();
        });
        title.addEventListener("keydown", (event) => {
          if (event.target !== title || !["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          toggle();
        });
      });
    }

    function closeCustomSelect(component, restoreFocus = false) {
      component.listbox.hidden = true;
      component.root.dataset.open = "false";
      component.trigger.setAttribute("aria-expanded", "false");
      component.options.forEach((option) => { option.dataset.active = "false"; });
      if (restoreFocus) component.trigger.focus();
    }

    function closeAllCustomSelects(exceptRoot = null) {
      customSelects.forEach((component) => {
        if (component.root !== exceptRoot) closeCustomSelect(component);
      });
    }

    function setActiveCustomOption(component, index) {
      const nextIndex = Math.max(0, Math.min(index, component.options.length - 1));
      component.activeIndex = nextIndex;
      component.options.forEach((option, optionIndex) => { option.dataset.active = String(optionIndex === nextIndex); });
      component.listbox.setAttribute("aria-activedescendant", component.options[nextIndex].id);
      component.options[nextIndex].scrollIntoView({ block: "nearest" });
    }

    function syncCustomSelect(select) {
      const component = customSelects.get(select);
      if (!component) return;
      component.value.textContent = select.selectedOptions[0]?.textContent || "";
      component.trigger.disabled = select.disabled;
      component.options.forEach((option, index) => option.setAttribute("aria-selected", String(index === select.selectedIndex)));
      component.triggerPreview.replaceChildren();
      const optionPreview = component.options[select.selectedIndex]?.querySelector(".custom-select-option-preview");
      if (optionPreview && component.root.dataset.triggerTextOnly !== "true") component.triggerPreview.append(optionPreview.cloneNode(true));
    }

    function syncCustomSelects() {
      customSelects.forEach((component, select) => syncCustomSelect(select));
    }

    function selectCustomOption(component, index) {
      component.select.selectedIndex = index;
      component.select.dispatchEvent(new Event("change", { bubbles: true }));
      syncCustomSelect(component.select);
      closeCustomSelect(component, true);
    }

    function openCustomSelect(component, direction = 0) {
      closeAllCustomSelects(component.root);
      component.listbox.hidden = false;
      component.root.dataset.open = "true";
      component.trigger.setAttribute("aria-expanded", "true");
      const selectedIndex = Math.max(0, component.select.selectedIndex);
      setActiveCustomOption(component, direction < 0 ? component.options.length - 1 : selectedIndex);
      component.listbox.focus();
    }

    function setupCustomSelects() {
      document.querySelectorAll(".control-select").forEach((select, index) => {
        let container = select.parentElement;
        if (container.tagName === "LABEL") {
          const replacement = document.createElement("div");
          // Keep the original field identity and visibility when converting native selects.
          [...container.attributes].forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
          while (container.firstChild) replacement.appendChild(container.firstChild);
          container.replaceWith(replacement);
          container = replacement;
        }

        const visibleLabel = [...container.children].find((child) => child.tagName === "SPAN")?.textContent || select.getAttribute("aria-label") || "选择";
        const root = document.createElement("div");
        const trigger = document.createElement("button");
        const triggerPreview = document.createElement("span");
        const value = document.createElement("span");
        const listbox = document.createElement("div");
        const triggerId = `custom-select-trigger-${index}`;
        const listboxId = `custom-select-listbox-${index}`;

        root.className = "custom-select";
        root.dataset.open = "false";
        root.dataset.triggerTextOnly = String([
          "cardTitleDecorationControl", "cardTitleColorControl",
          "kpiDecorationControl", "kpiStyleColorControl",
          "cardKpiDecorationControl", "cardKpiStyleColorControl"
        ].includes(select.id));
        select.before(root);
        root.appendChild(select);
        select.hidden = true;

        trigger.type = "button";
        trigger.id = triggerId;
        trigger.className = "custom-select-trigger";
        trigger.setAttribute("role", "combobox");
        trigger.setAttribute("aria-label", visibleLabel);
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", listboxId);
        triggerPreview.className = "custom-select-trigger-preview";
        trigger.appendChild(triggerPreview);
        trigger.appendChild(value);
        trigger.insertAdjacentHTML("beforeend", '<svg class="custom-select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>');

        listbox.id = listboxId;
        listbox.className = "custom-select-listbox";
        listbox.setAttribute("role", "listbox");
        listbox.setAttribute("aria-labelledby", triggerId);
        listbox.tabIndex = -1;
        listbox.hidden = true;

        const options = [...select.options].map((nativeOption, optionIndex) => {
          const optionGroup = nativeOption.parentElement?.tagName === "OPTGROUP" ? nativeOption.parentElement : null;
          if (optionGroup && nativeOption === optionGroup.querySelector("option")) {
            const groupLabel = document.createElement("div");
            groupLabel.className = "custom-select-group";
            groupLabel.textContent = optionGroup.label;
            listbox.appendChild(groupLabel);
          }
          const option = document.createElement("button");
          const optionLabel = document.createElement("span");
          option.type = "button";
          option.id = `${listboxId}-option-${optionIndex}`;
          option.className = "custom-select-option";
          option.dataset.value = nativeOption.value;
          option.setAttribute("role", "option");
          option.dataset.active = "false";
          optionLabel.textContent = nativeOption.textContent;
          option.appendChild(optionLabel);
          if (select.id === "sectionIconStyleControl") {
            const preview = document.createElement("span");
            const isFilled = nativeOption.value.startsWith("filled-");
            preview.className = "section-icon-style-option-preview custom-select-option-preview";
            preview.innerHTML = `<svg viewBox="0 0 256 256" aria-hidden="true">${phosphorKpiIcons["users-three"][isFilled ? "fill" : "regular"]}</svg>`;
            option.dataset.sectionIconStyle = nativeOption.value;
            option.prepend(preview);
          }
          if (["cardTitleDecorationControl", "kpiDecorationControl", "cardKpiDecorationControl"].includes(select.id)
            && !["none", "inherit"].includes(nativeOption.value)) {
            const preview = document.createElement("span");
            const isFilled = nativeOption.value.startsWith("filled");
            preview.className = "card-title-decoration-option-preview custom-select-option-preview";
            preview.dataset.container = nativeOption.value.endsWith("-soft") ? "soft" : nativeOption.value.endsWith("-solid") ? "solid" : "none";
            preview.innerHTML = `<svg viewBox="0 0 256 256" aria-hidden="true">${phosphorKpiIcons["chart-line-up"][isFilled ? "fill" : "regular"]}</svg>`;
            option.prepend(preview);
          }
          if (["cardTitleColorControl", "kpiStyleColorControl", "cardKpiStyleColorControl"].includes(select.id)
            && nativeOption.value !== "inherit") {
            const preview = document.createElement("span");
            preview.className = "card-title-color-option-preview custom-select-option-preview";
            preview.dataset.colorMode = nativeOption.value;
            option.prepend(preview);
          }
          option.insertAdjacentHTML("beforeend", '<svg class="custom-select-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>');
          option.addEventListener("click", () => selectCustomOption(component, optionIndex));
          option.addEventListener("mousemove", () => setActiveCustomOption(component, optionIndex));
          listbox.appendChild(option);
          return option;
        });

        root.append(trigger, listbox);
        const component = { select, root, trigger, triggerPreview, value, listbox, options, activeIndex: select.selectedIndex };
        customSelects.set(select, component);

        trigger.addEventListener("click", () => {
          if (listbox.hidden) openCustomSelect(component);
          else closeCustomSelect(component, true);
        });
        trigger.addEventListener("keydown", (event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (listbox.hidden) openCustomSelect(component, event.key === "ArrowUp" ? -1 : 1);
          }
        });
        listbox.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveCustomOption(component, component.activeIndex + (event.key === "ArrowDown" ? 1 : -1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setActiveCustomOption(component, event.key === "Home" ? 0 : component.options.length - 1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCustomOption(component, component.activeIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            closeCustomSelect(component, true);
          } else if (event.key === "Tab") {
            closeCustomSelect(component);
          }
        });
        select.addEventListener("change", () => syncCustomSelect(select));
        syncCustomSelect(select);
      });

      document.addEventListener("pointerdown", (event) => {
        customSelects.forEach((component) => {
          if (!component.root.contains(event.target)) closeCustomSelect(component);
        });
      });
      window.addEventListener("resize", () => closeAllCustomSelects());
    }

    function setPressed(group, value) {
      document.querySelectorAll(`#${group} button`).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === value || button.dataset.preset === value)));
    }

    function syncRangeTrack(control) {
      const min = Number(control.min) || 0;
      const max = Number(control.max) || 100;
      const progress = max === min ? 0 : ((Number(control.value) - min) / (max - min)) * 100;
      control.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, progress))}%`);
    }

    function resolveCssColor(value) {
      const probe = document.createElement("span");
      probe.style.color = value;
      probe.hidden = true;
      dashboard.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    }

    function hexToRgb(hex) {
      const value = hex.replace("#", "");
      const normalized = value.length === 3 ? [...value].map((character) => character + character).join("") : value;
      return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
    }

    function rgbToHex(rgb) {
      return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
    }

    function hexToHsl(hex) {
      const [red, green, blue] = hexToRgb(hex).map((value) => value / 255);
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const lightness = (max + min) / 2;
      if (max === min) return { h: 0, s: 0, l: lightness * 100 };
      const delta = max - min;
      const saturation = lightness > .5 ? delta / (2 - max - min) : delta / (max + min);
      const hue = max === red
        ? ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
        : max === green ? ((blue - red) / delta + 2) / 6 : ((red - green) / delta + 4) / 6;
      return { h: hue * 360, s: saturation * 100, l: lightness * 100 };
    }

    function hslToHex(hue, saturation, lightness) {
      const h = (((hue % 360) + 360) % 360) / 360;
      const s = Math.max(0, Math.min(100, saturation)) / 100;
      const l = Math.max(0, Math.min(100, lightness)) / 100;
      if (s === 0) return rgbToHex([l * 255, l * 255, l * 255]);
      const q = l < .5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const channel = (offset) => {
        let t = h + offset;
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      return rgbToHex([channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255]);
    }

    function relativeLuminance(hex) {
      return hexToRgb(hex).map((value) => {
        const channel = value / 255;
        return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    }

    function contrastRatio(first, second) {
      const values = [relativeLuminance(first), relativeLuminance(second)];
      return (Math.max(...values) + .05) / (Math.min(...values) + .05);
    }

    function mixHex(foreground, background, amount) {
      const fg = hexToRgb(foreground);
      const bg = hexToRgb(background);
      return rgbToHex(fg.map((value, index) => value * amount + bg[index] * (1 - amount)));
    }

    function gradientStopColor(stop) {
      const [red, green, blue] = hexToRgb(stop.color);
      return `rgba(${red}, ${green}, ${blue}, ${stop.opacity})`;
    }

    function buildHeaderGradient(stops, direction, diagonalAngle) {
      const colorStops = [...stops].sort((first, second) => first.position - second.position)
        .map((stop) => `${gradientStopColor(stop)} ${stop.position}%`).join(", ");
      return `linear-gradient(${diagonalAngle}deg, ${colorStops})`;
    }

    function normalizeHeaderGradientStops() {
      if (!Array.isArray(state.headerGradientStops) || state.headerGradientStops.length < 2) {
        state.headerGradientStops = [
          { id: "start", color: state.headerGradientStart, opacity: .3, position: 0, linkedToAccent: true },
          { id: "end", color: state.headerGradientEnd, opacity: 0, position: 70, linkedToAccent: false }
        ];
      }
      state.headerGradientStops = state.headerGradientStops.map((stop, index) => ({
        id: String(stop.id || `stop-${Date.now()}-${index}`),
        color: stop.linkedToAccent === true ? state.accent : (/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : state.accent),
        opacity: Math.max(0, Math.min(1, Number(stop.opacity ?? 1))),
        position: Math.max(0, Math.min(100, Number(stop.position ?? index * 100))),
        linkedToAccent: stop.linkedToAccent === true
      })).sort((first, second) => first.position - second.position);
      state.headerGradientStart = state.headerGradientStops[0].color;
      state.headerGradientEnd = state.headerGradientStops[state.headerGradientStops.length - 1].color;
      if (!state.headerGradientStops.some((stop) => stop.id === selectedHeaderGradientStopId)) {
        selectedHeaderGradientStopId = state.headerGradientStops[0].id;
      }
    }

    function renderHeaderGradientEditor() {
      const selected = state.headerGradientStops.find((stop) => stop.id === selectedHeaderGradientStopId) || state.headerGradientStops[0];
      headerGradientPreview.querySelectorAll(".header-gradient-stop").forEach((element) => element.remove());
      state.headerGradientStops.forEach((stop) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "header-gradient-stop";
        marker.dataset.stopId = stop.id;
        marker.style.left = `${stop.position}%`;
        marker.style.setProperty("--stop-color", gradientStopColor(stop));
        marker.setAttribute("aria-label", `色标 ${Math.round(stop.position)}%，点击选色，拖动调整位置`);
        marker.title = "点击选色，拖动调整位置";
        marker.setAttribute("aria-pressed", String(stop.id === selected.id));
        headerGradientPreview.appendChild(marker);
      });
      headerGradientStopColorControl.value = selected.color;
      headerGradientStopOpacityControl.value = Math.round(selected.opacity * 100);
      headerGradientStopOpacityValue.textContent = `${Math.round(selected.opacity * 100)}%`;
      headerGradientStopPositionControl.value = Math.round(selected.position);
      headerGradientStopRemove.disabled = state.headerGradientStops.length <= 2;
    }

    function deriveReadableText(background) {
      const darkText = "#111827";
      const lightText = "#f9fafb";
      let main = contrastRatio(darkText, background) >= contrastRatio(lightText, background) ? darkText : lightText;
      if (contrastRatio(main, background) < 4.5) {
        main = contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
      }
      let amount = .68;
      let secondary = mixHex(main, background, amount);
      while (contrastRatio(secondary, background) < 4.5 && amount < 1) {
        amount = Math.min(1, amount + .04);
        secondary = mixHex(main, background, amount);
      }
      return { main, secondary };
    }

    function deriveReadableGradientText(start, end) {
      const candidates = ["#111827", "#f9fafb"];
      const main = candidates.sort((first, second) => Math.min(contrastRatio(second, start), contrastRatio(second, end)) - Math.min(contrastRatio(first, start), contrastRatio(first, end)))[0];
      let amount = .72;
      let secondary = mixHex(main, contrastRatio(main, start) < contrastRatio(main, end) ? start : end, amount);
      while ((contrastRatio(secondary, start) < 4.5 || contrastRatio(secondary, end) < 4.5) && amount < 1) {
        amount = Math.min(1, amount + .04);
        secondary = mixHex(main, contrastRatio(main, start) < contrastRatio(main, end) ? start : end, amount);
      }
      return { main, secondary };
    }

    function deriveAccentTokens(seed, mode, surface, textMain) {
      const source = hexToHsl(seed);
      const dark = mode === "dark";
      const neutral = source.s < 8;
      let structure = neutral ? (dark ? "#a1a1aa" : "#52525b") : seed;
      let structureTone = hexToHsl(structure);
      while (contrastRatio(structure, surface) < 2.2 && (dark ? structureTone.l < 82 : structureTone.l > 18)) {
        structureTone.l += dark ? 2 : -2;
        structure = hslToHex(structureTone.h, structureTone.s, structureTone.l);
      }
      const soft = dark
        ? mixHex(structure, surface, .18)
        : hslToHex(source.h, neutral ? 8 : Math.max(source.s * .45, 16), 92);
      let onSoft = neutral ? structure : seed;
      let foregroundTone = hexToHsl(onSoft);
      while (contrastRatio(onSoft, surface) < 2.5 && (dark ? foregroundTone.l < 92 : foregroundTone.l > 10)) {
        foregroundTone.l += dark ? 2 : -2;
        onSoft = hslToHex(foregroundTone.h, foregroundTone.s, foregroundTone.l);
      }
      if (contrastRatio(onSoft, surface) < 2.5) onSoft = textMain;
      const darkText = "#18181b";
      const lightText = "#ffffff";
      const onSolid = contrastRatio(lightText, seed) >= contrastRatio(darkText, seed) ? lightText : darkText;
      const chartLightness = dark ? 62 : (source.h >= 75 && source.h <= 165 ? 42 : 50);
      const chart = neutral ? (dark ? "#a1a1aa" : "#52525b") : hslToHex(source.h, Math.min(Math.max(source.s, 58), 82), chartLightness);
      return {
        seed,
        structure,
        soft,
        onSoft,
        onSolid,
        line: mixHex(structure, surface, dark ? .42 : .28),
        chart
      };
    }

    function deriveSurfaceTokens(seed, mode, colors) {
      const dark = mode === "dark";
      return {
        outer: mixHex(seed, dark ? "#0b0f16" : "#f0f2f5", .02),
        page: mixHex(seed, colors.page, dark ? .03 : .01),
        surface: mixHex(seed, colors.surface, dark ? .04 : .005),
        muted: mixHex(seed, colors.mutedSurface, dark ? .06 : .02)
      };
    }

    function tintNeutralSurface(seed, base, saturationCap) {
      const source = hexToHsl(seed);
      const baseTone = hexToHsl(base);
      const saturation = source.s < 8 ? 0 : Math.min(source.s, saturationCap);
      return hslToHex(source.h, saturation, baseTone.l);
    }

    function deriveSoftThemeSurfaces(seed, mode, colors) {
      const source = hexToHsl(seed);
      const coolHue = source.h >= 75 && source.h <= 200;
      if (mode === "light") {
        const pageSaturation = source.s < 8 ? 0 : Math.min(source.s, coolHue ? 18 : 22);
        const surfaceSaturation = source.s < 8 ? 0 : Math.min(source.s, 4);
        const mutedSaturation = source.s < 8 ? 0 : Math.min(source.s, 6);
        return {
          outer: tintNeutralSurface(seed, "#f0f2f5", 2),
          page: hslToHex(source.h, pageSaturation, Math.min(hexToHsl(colors.page).l, 95)),
          surface: hslToHex(source.h, surfaceSaturation, Math.min(hexToHsl(colors.surface).l, 99)),
          muted: hslToHex(source.h, mutedSaturation, Math.min(hexToHsl(colors.mutedSurface).l, 97.5))
        };
      }
      const pageSaturation = coolHue ? 6 : 8;
      return {
        outer: tintNeutralSurface(seed, "#0b0f16", 2),
        page: tintNeutralSurface(seed, colors.page, pageSaturation),
        surface: tintNeutralSurface(seed, colors.surface, pageSaturation / 2),
        muted: tintNeutralSurface(seed, colors.mutedSurface, pageSaturation / 2)
      };
    }

    function ensureGraphicContrast(color, surface, mode) {
      let candidate = color;
      const tone = hexToHsl(candidate);
      while (contrastRatio(candidate, surface) < 2.2 && (mode === "dark" ? tone.l < 86 : tone.l > 16)) {
        tone.l += mode === "dark" ? 2 : -2;
        candidate = hslToHex(tone.h, tone.s, tone.l);
      }
      return candidate;
    }

    function deriveIconTokens(seed, mode, surface) {
      const source = hexToHsl(seed);
      const neutral = source.s < 8;
      const accent = neutral
        ? (mode === "dark" ? "#a1a1aa" : "#62626b")
        : seed;
      const visibleAccent = ensureGraphicContrast(accent, surface, mode);
      const soft = mixHex(visibleAccent, surface, mode === "dark" ? .16 : .10);
      const solid = ensureGraphicContrast(visibleAccent, "#ffffff", "light");
      return { accent: visibleAccent, soft, solid, onSolid: "#ffffff" };
    }

    function deriveIconGradientAlternate(seed, mode, surface) {
      const source = hexToHsl(seed);
      if (source.s < 8) return mode === "dark" ? "#71717a" : "#3f3f46";
      const adjacent = hslToHex(source.h - 22, Math.min(84, Math.max(60, source.s * .94)), Math.max(34, Math.min(56, source.l)));
      return deriveIconTokens(adjacent, mode, surface).solid;
    }

    function deriveIconGradientAlternateAccent(seed, mode, surface) {
      const source = hexToHsl(seed);
      if (source.s < 8) return mode === "dark" ? "#d4d4d8" : "#3f3f46";
      const adjacent = hslToHex(source.h - 22, Math.min(84, Math.max(60, source.s * .94)), Math.max(34, Math.min(56, source.l)));
      return deriveIconTokens(adjacent, mode, surface).accent;
    }

    const DASHBOARD_CATEGORICAL_PALETTE = ["#5b8ff9","#45b8d8","#43c59e","#96bf45","#f3a83b","#f06b72","#de72b4","#9270e8"];

    function deriveChartPalette(seed) {
      const source = hexToHsl(seed);
      const categorical = DASHBOARD_CATEGORICAL_PALETTE;
      const ranked = source.s < 8
        ? categorical
        : [...categorical].sort((first, second) => {
            const hueDistance = (color) => {
              const delta = Math.abs(hexToHsl(color).h - source.h);
              return Math.min(delta, 360 - delta);
            };
            return hueDistance(first) - hueDistance(second);
          });
      return { monochrome: ranked[0], bichrome: ranked.slice(0, 2), categorical };
    }

    function applyLanguage() {
      const copy = translations[state.language];
      document.documentElement.lang = state.language === "en" ? "en" : "zh-CN";
      dashboard.dataset.language = state.language;
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        if (!element.classList.contains("panel-note")) element.textContent = copy[element.dataset.i18n];
      });
      dashboard.querySelectorAll(".panel-note[data-i18n]").forEach((subtitle) => {
        const text = subtitle.querySelector(".card-subtitle-text");
        if (text) text.textContent = copy[subtitle.dataset.i18n];
        else subtitle.textContent = copy[subtitle.dataset.i18n];
      });
      dashboard.querySelector(".hero-title").textContent = state.pageType === "dashboard" ? copy.dashboardTitle : copy.title;
      dashboard.querySelectorAll(".panel-note").forEach((subtitle) => {
        subtitle.dataset.tooltip = (subtitle.querySelector(".card-subtitle-text") || subtitle).textContent.trim();
      });
      if (state.sectionCopy === "subtitle") {
        document.querySelectorAll(".section[data-section-id]").forEach((section) => {
          const subtitle = section.querySelector(".section-heading small");
          if (subtitle) subtitle.textContent = state.sectionSubtitles[section.dataset.sectionId] || "";
        });
      }
      document.querySelector("#summaryText").innerHTML = copy.summaryHtml;
      brandLogo.alt = copy.logoAlt;
    }

    const defaultSectionIcons = { summary: "clipboard-text", metrics: "gauge", trends: "chart-line-up", health: "shield-check" };
    const defaultCardTitleIcons = { "summary-card": "clipboard-text", "opportunity-trend": "chart-line-up", "source-ranking": "list-numbers", "customer-health": "heartbeat", "risk-items": "warning" };
    const sectionIconFallbacks = { summary: "users-three", metrics: "pulse", trends: "chart-line-up", health: "pulse" };

    async function resolveSectionIconSvg(name, weight) {
      const key = `${name}:${weight}`;
      if (sectionIconSvgCache.has(key)) return sectionIconSvgCache.get(key);
      const response = await fetch(`/api/icons/phosphor/${encodeURIComponent(name)}?weight=${encodeURIComponent(weight)}`);
      if (!response.ok) throw new Error("图标资源不可用");
      const { svg } = await response.json();
      sectionIconSvgCache.set(key, svg);
      return svg;
    }

    async function renderSectionIcons() {
      const filled = state.sectionIconStyle === "filled" || state.sectionIconStyle.startsWith("filled-");
      const weight = filled ? "fill" : state.sectionWeight >= 700 ? "bold" : "regular";
      const tasks = [...dashboard.querySelectorAll(".section[data-section-id]")].map(async (section) => {
        const heading = section.querySelector(":scope > .section-heading");
        if (!heading) return;
        let icon = heading.querySelector(":scope > .section-icon");
        if (!icon) {
          icon = document.createElement("span");
          icon.className = "section-icon";
          icon.setAttribute("aria-hidden", "true");
          heading.querySelector(":scope > .section-number").after(icon);
        }
        const iconName = state.sectionIcons?.[section.dataset.sectionId] || defaultSectionIcons[section.dataset.sectionId] || "circle";
        icon.dataset.iconName = iconName;
        const renderKey = `${iconName}:${weight}`;
        icon.dataset.iconRenderKey = renderKey;
        try {
          const svg = await resolveSectionIconSvg(iconName, weight);
          if (icon.dataset.iconRenderKey === renderKey) icon.innerHTML = svg;
        } catch {
          const fallback = phosphorKpiIcons[sectionIconFallbacks[section.dataset.sectionId] || "users-three"];
          if (icon.dataset.iconRenderKey === renderKey) {
            icon.innerHTML = fallback?.[weight] ? `<svg viewBox="0 0 256 256" aria-hidden="true">${fallback[weight]}</svg>` : "";
          }
        }
        if (icon.dataset.iconRenderKey === renderKey) applySectionIconGradient(icon, section.dataset.sectionId);
      });
      await Promise.all(tasks);
    }

    async function renderCardTitleIcons() {
      const tasks = [...dashboard.querySelectorAll("[data-item-id] .card-title-icon")].map(async (icon) => {
        const card = icon.closest("[data-item-id]");
        const iconName = state.cardOverrides?.[card.dataset.itemId]?.cardTitleIconName || defaultCardTitleIcons[card.dataset.itemId] || defaultCardTitleIcons[sourceComponentId(card.dataset.itemId)];
        if (!iconName) return;
        const decoration = state.cardTitleDecoration || "line";
        const weight = decoration.startsWith("filled") ? "fill" : "regular";
        const renderKey = `${iconName}:${weight}`;
        icon.dataset.iconRenderKey = renderKey;
        try {
          const svg = await resolveSectionIconSvg(iconName, weight);
          if (icon.dataset.iconRenderKey === renderKey) icon.innerHTML = svg;
        } catch {}
      });
      await Promise.all(tasks);
      renderCardTitleIconEffects();
    }

    function renderCardTitleDecorations() {
      const titles = [...dashboard.querySelectorAll("[data-item-id]:not(.metric) .card-title")];
      let visibleIndex = 0;
      titles.forEach((title) => {
        let marker = title.querySelector(":scope > .card-title-marker");
        let number = title.querySelector(":scope > .card-title-number");
        if (!marker) {
          marker = document.createElement("span");
          marker.className = "card-title-marker";
          marker.setAttribute("aria-hidden", "true");
          title.prepend(marker);
        }
        if (!number) {
          number = document.createElement("span");
          number.className = "card-title-number";
          number.setAttribute("aria-hidden", "true");
          title.prepend(number);
        }
        const visible = getComputedStyle(title).display !== "none";
        number.textContent = visible ? String(++visibleIndex).padStart(2, "0") : "";
      });
    }

    function applySectionIconGradient(icon, sectionId) {
      if (!state.sectionIconColor?.startsWith("gradient-")) return;
      const svg = icon.querySelector("svg");
      if (!svg) return;
      const gradientId = `section-icon-gradient-${sectionId}`;
      const isColorful = state.sectionIconColor === "gradient-colorful";
      const startColor = isColorful ? "var(--section-icon-accent)" : "var(--icon-accent)";
      const endColor = isColorful ? "var(--section-icon-accent-alt)" : "var(--icon-accent)";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.innerHTML = `<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${startColor}"/><stop offset="1" style="stop-color:${endColor}"/></linearGradient>`;
      svg.prepend(defs);
      svg.querySelectorAll(":scope > path").forEach((path) => { path.style.fill = `url(#${gradientId})`; });
    }

    function updatePresetOptions() {
      const view = presetViews[state.pageType] || presetViews.dashboard;
      document.querySelectorAll("#presetControls [data-preset]").forEach((button) => {
        const presetName = button.dataset.preset;
        button.textContent = view.labels[presetName] || presets[presetName].label;
        button.hidden = !view.allowed.includes(presetName) && presetName !== state.preset;
      });
      renderCustomPresetTabs();
    }

    function applyState() {
      const preset = presets[state.preset] || presets["fx-orange"];
      state.cardGap = cardGapSteps.reduce((closest, step) => Math.abs(step - state.cardGap) < Math.abs(closest - state.cardGap) ? step : closest, 12);
      state.cardTitleFont = [12, 14, 16, 18, 20].includes(Number(state.cardTitleFont)) ? Number(state.cardTitleFont) : 14;
      if (state.cardSubtitle === "right") state.cardSubtitle = "title-right";
      if (!["none", "below", "title-right", "card-right", "icon"].includes(state.cardSubtitle)) state.cardSubtitle = "below";
      if (!state.cardTitleDecoration || !state.cardTitleColor) {
        const migrated = deriveCardTitleControls(state);
        state.cardTitleDecoration ||= migrated.decoration;
        state.cardTitleColor ||= migrated.color;
      }
      if (!state.cardTitleLeading) state.cardTitleLeading = state.cardTitleDecoration !== "none" || state.cardTitleIcon !== "none" ? "icon" : "none";
      if (!["none", "marker", "icon", "number"].includes(state.cardTitleLeading)) state.cardTitleLeading = "none";
      if (state.pageType === "dashboard" && state.cardTitleLeading === "number") state.cardTitleLeading = "none";
      if (state.cardTitleDecoration === "none") state.cardTitleDecoration = "line";
      if (!["none", "line", "filled", "line-soft", "filled-soft", "line-solid", "filled-solid"].includes(state.cardTitleDecoration)) state.cardTitleDecoration = "none";
      if (!["neutral", "accent", "gradient-accent", "colorful", "gradient-colorful"].includes(state.cardTitleColor)) state.cardTitleColor = "neutral";
      applyCardTitleControls(state, state.cardTitleDecoration, state.cardTitleColor);
      if (!["monochrome", "bichrome", "categorical"].includes(state.chartPalette)) state.chartPalette = "monochrome";
      if (state.kpiLayout === "stacked") state.kpiLayout = "right-top";
      if (state.kpiLayout === "horizontal") state.kpiLayout = "left-top";
      if (!["left-top", "left-middle", "right-top", "right-middle"].includes(state.kpiLayout)) state.kpiLayout = "right-top";
      if (state.kpiIcon === "duotone") state.kpiIcon = "filled";
      if (!["none", "outline", "filled"].includes(state.kpiIcon)) state.kpiIcon = "none";
      if (!["thin", "regular", "bold"].includes(state.kpiIconWeight)) state.kpiIconWeight = "regular";
      Object.values(state.cardOverrides || {}).forEach((override) => {
        if (override.kpiIcon === "duotone") override.kpiIcon = "filled";
        if (!cardTitleStylePresets[override.cardTitleStyle] && ["none", "line", "soft", "solid"].includes(override.cardTitleIcon)) {
          override.cardTitleStyle = Object.entries(cardTitleStylePresets).find(([, preset]) => (
            preset.cardTitleIcon === override.cardTitleIcon && preset.cardTitleIconColor === override.cardTitleIconColor
          ))?.[0] || "none";
          delete override.cardTitleIcon;
          delete override.cardTitleIconColor;
        }
      });
      if (state.kpiIconFollowCardVersion !== 1) {
        state.kpiIconColor = "auto";
        state.kpiIconFollowCardVersion = 1;
      }
      if (!["auto", "neutral", "accent", "colorful", "gradient-neutral", "gradient-accent", "gradient-colorful"].includes(state.kpiIconColor)) state.kpiIconColor = "auto";
      if (!["none", "outline", "soft", "solid", "gradient", "bigradient"].includes(state.kpiIconContainer)) state.kpiIconContainer = "none";
      if (!["rect", "circle"].includes(state.kpiIconShape)) state.kpiIconShape = "rect";
      if (!["small", "medium", "large"].includes(state.kpiIconSize)) state.kpiIconSize = "medium";
      if (!["default", "white", "single", "multi"].includes(state.kpiCardBackground)) state.kpiCardBackground = "default";
      if (!["none", "weak", "medium", "strong"].includes(state.shadow)) state.shadow = "weak";
      if (!["none", "grid", "grain", "diagonal"].includes(state.pageTexture)) state.pageTexture = "none";
      const legacyHeader = ["plain", "auto"].includes(state.header) ? (state.pageType === "dashboard" ? "minimal" : "surface") : state.header;
      if (typeof state.headerVisible !== "boolean") state.headerVisible = legacyHeader !== "hidden";
      if (!["none", "solid", "gradient", "glass"].includes(state.headerBackgroundType)) {
        state.headerBackgroundType = legacyHeader === "minimal" ? "none" : legacyHeader === "brand" ? "gradient" : "solid";
      }
      if (state.pageType === "dashboard" && state.headerBackgroundDefaultVersion !== 2) state.headerBackgroundType = "none";
      state.headerBackgroundDefaultVersion = 2;
      if (!["neutral", "accent-soft", "accent-solid", "custom"].includes(state.headerSolidMode)) {
        state.headerSolidMode = legacyHeader === "band" ? "accent-solid" : "neutral";
      }
      if (!["accent-soft", "accent-solid", "custom"].includes(state.headerGradientMode)) state.headerGradientMode = "accent-soft";
      if (!["horizontal", "vertical", "diagonal"].includes(state.headerGradientDirection)) state.headerGradientDirection = "vertical";
      const defaultGradientAngles = { horizontal: 90, vertical: 180, diagonal: 135 };
      const storedGradientAngle = Number(state.headerGradientAngle);
      state.headerGradientAngle = state.headerGradientDirection === "diagonal" && Number.isFinite(storedGradientAngle)
        ? Math.max(0, Math.min(360, storedGradientAngle))
        : defaultGradientAngles[state.headerGradientDirection];
      if (typeof state.headerSolidLinkedToMode !== "boolean") {
        state.headerSolidLinkedToMode = !state.headerSolidColor || state.headerSolidColor.toLowerCase() === "#ffffff";
      }
      state.headerSolidColor ||= "#ffffff";
      state.headerGradientStart ||= state.accent;
      state.headerGradientEnd ||= "#ffffff";
      normalizeHeaderGradientStops();
      state.headerSolidMode = "custom";
      state.headerGradientMode = "custom";
      if (!["plain", "surface", "hidden"].includes(state.headerMetaStyle)) state.headerMetaStyle = "surface";
      if (state.pageType === "dashboard" && state.headerMetaDefaultVersion !== 2) state.headerMetaStyle = "plain";
      state.headerMetaDefaultVersion = 2;
      if (!["dot", "line"].includes(state.headerMetaSeparator)) state.headerMetaSeparator = "dot";
      if (!["none", "particles", "aurora", "sheen"].includes(state.headerDecoration)) state.headerDecoration = "none";
      if (!["left", "center"].includes(state.headerAlign)) state.headerAlign = state.pageType === "report" ? "center" : "left";
      state.headerTitleFont = Math.max(20, Math.min(48, Number(state.headerTitleFont) || 32));
      if (!["title", "subtitle", "bilingual"].includes(state.sectionCopy)) state.sectionCopy = "title";
      if (state.sectionLeading === "accent") state.sectionLeading = "marker";
      if (!["none", "marker", "number", "icon"].includes(state.sectionLeading)) state.sectionLeading = "none";
      const legacySectionIconStyles = {
        "line-neutral": ["line", "neutral"],
        "line-accent": ["line", "accent"],
        "filled-accent": ["filled", "accent"]
      };
      if (legacySectionIconStyles[state.sectionIconStyle]) {
        const [style, color] = legacySectionIconStyles[state.sectionIconStyle];
        state.sectionIconStyle = style;
        if (!state.sectionIconColor) state.sectionIconColor = color;
      }
      if (!["line", "filled", "line-soft", "filled-soft", "line-solid", "filled-solid"].includes(state.sectionIconStyle)) state.sectionIconStyle = "line";
      if (!["neutral", "accent", "gradient-accent", "colorful", "gradient-colorful"].includes(state.sectionIconColor)) state.sectionIconColor = "accent";
      if (!state.sectionIcons || typeof state.sectionIcons !== "object" || Array.isArray(state.sectionIcons)) state.sectionIcons = {};
      if (![500, 600, 700, 800].includes(Number(state.sectionWeight))) state.sectionWeight = 700;
      if (!state.sectionSubtitles || typeof state.sectionSubtitles !== "object" || Array.isArray(state.sectionSubtitles)) state.sectionSubtitles = {};
      const resolvedContentWidth = state.contentWidth === "auto" ? (state.pageType === "dashboard" ? "fluid" : "readable") : state.contentWidth;
      const resolvedSectionVisibility = state.pageType === "dashboard" ? "hidden" : state.sectionVisibility === "auto" ? "visible" : state.sectionVisibility;
      const resolvedHeader = !state.headerVisible ? "hidden" : state.headerBackgroundType === "none" ? "minimal" : state.headerBackgroundType === "gradient" ? "brand" : state.headerSolidMode === "accent-solid" && state.headerBackgroundType === "solid" ? "band" : "surface";
      const resolvedHeaderAlign = state.headerAlign;
      const colors = state.mode === "dark" ? darkTokens : preset.light;
      const surfaceTokens = deriveSurfaceTokens(state.accent, state.mode, colors);
      const softThemeSurfaces = deriveSoftThemeSurfaces(state.accent, state.mode, colors);
      const neutralPage = state.mode === "dark" ? darkTokens.page : "#f5f7fa";
      const pageBackgrounds = {
        neutral: neutralPage,
        white: "#ffffff",
        "accent-soft": softThemeSurfaces.page,
        custom: state.customPageBackground || neutralPage
      };
      if (!pageBackgrounds[state.pageBackground]) state.pageBackground = "neutral";
      const resolvedPageBackground = pageBackgrounds[state.pageBackground];
      let resolvedSurface = surfaceTokens.surface;
      let resolvedMutedSurface = surfaceTokens.muted;
      if (state.pageBackground === "accent-soft") {
        resolvedSurface = softThemeSurfaces.surface;
        resolvedMutedSurface = softThemeSurfaces.muted;
      } else if (state.pageBackground === "custom") {
        const customInfluence = state.mode === "dark" ? .12 : .04;
        resolvedSurface = mixHex(resolvedPageBackground, surfaceTokens.surface, customInfluence);
        resolvedMutedSurface = mixHex(resolvedPageBackground, surfaceTokens.muted, customInfluence * .72);
      }
      const pageText = deriveReadableText(resolvedPageBackground);
      const accentTokens = deriveAccentTokens(state.accent, state.mode, resolvedSurface, colors.text);
      const chartPalette = deriveChartPalette(state.accent);
      const iconTokens = deriveIconTokens(state.accent, state.mode, resolvedSurface);
      const iconGradientAlternate = deriveIconGradientAlternate(state.accent, state.mode, resolvedSurface);
      const iconGradientAlternateAccent = deriveIconGradientAlternateAccent(state.accent, state.mode, resolvedSurface);
      const titleIconTokens = state.cardTitleIconColor === "neutral"
        ? { accent: state.mode === "dark" ? "#a1a1aa" : "#62626b", soft: state.mode === "dark" ? "#34343a" : "#f0f0f2", onSolid: "#ffffff" }
        : state.cardTitleIconColor === "colorful"
          ? { accent: chartPalette.categorical[0], soft: mixHex(chartPalette.categorical[0], resolvedSurface, state.mode === "dark" ? .16 : .10), onSolid: "#ffffff" }
          : iconTokens;
      kpiColorContext = { surface: resolvedSurface, palette: chartPalette.categorical };
      const resolvedHeaderSolidColor = state.headerSolidLinkedToMode ? resolvedSurface : state.headerSolidColor;
      let headerBackground = state.headerBackgroundType === "none" ? "transparent" : resolvedSurface;
      let headerText = state.headerBackgroundType === "none" ? pageText : deriveReadableText(resolvedSurface);
      if (state.headerBackgroundType === "solid") {
        headerBackground = state.headerSolidMode === "accent-soft" ? softThemeSurfaces.page
          : state.headerSolidMode === "accent-solid" ? state.accent
          : state.headerSolidMode === "custom" ? resolvedHeaderSolidColor : resolvedSurface;
        headerText = deriveReadableText(headerBackground);
      } else if (state.headerBackgroundType === "gradient") {
        headerBackground = buildHeaderGradient(state.headerGradientStops, state.headerGradientDirection, state.headerGradientAngle);
        const opaqueStops = state.headerGradientStops.map((stop) => mixHex(stop.color, resolvedPageBackground, stop.opacity));
        headerText = deriveReadableGradientText(opaqueStops[0], opaqueStops[opaqueStops.length - 1]);
      } else if (state.headerBackgroundType === "glass") {
        const glassOpacity = .7;
        const [red, green, blue] = hexToRgb(resolvedSurface);
        headerBackground = `rgba(${red}, ${green}, ${blue}, ${glassOpacity})`;
        headerText = deriveReadableText(mixHex(resolvedSurface, resolvedPageBackground, glassOpacity));
      }
      const shadowMap = state.mode === "dark" ? darkShadows : shadows;
      const frameToken = frameTokens[state.frame];
      const frameWidth = frameToken.width;
      const frameLine = state.frame === "none" ? colors.line : `color-mix(in srgb, var(--text-main) ${frameToken.contrast}, transparent)`;
      const vars = {
        "--outer-bg": state.pageType === "report" ? (state.pageBackground === "accent-soft" ? softThemeSurfaces.outer : surfaceTokens.outer) : resolvedPageBackground,
        "--page-bg": resolvedPageBackground, "--surface": resolvedSurface, "--surface-muted": resolvedMutedSurface,
        "--hero-bg": headerBackground, "--header-text-main": headerText.main, "--header-text-secondary": headerText.secondary,
        "--text-main": colors.text, "--text-secondary": colors.secondary, "--text-muted": colors.muted,
        "--page-text-main": pageText.main, "--page-text-secondary": pageText.secondary,
        "--texture-color": `color-mix(in srgb, ${colors.text} 4%, transparent)`,
        "--texture-line-color": `color-mix(in srgb, ${colors.text} 2.5%, transparent)`,
        "--texture-grain-color": `color-mix(in srgb, ${colors.text} 7%, transparent)`,
        "--line": frameLine, "--frame-width": frameWidth,
        "--accent-seed": accentTokens.seed, "--accent-structure": accentTokens.structure, "--accent-soft": accentTokens.soft,
        "--accent-on-soft": accentTokens.onSoft, "--accent-on-solid": accentTokens.onSolid, "--accent-line": accentTokens.line,
        "--icon-accent": iconTokens.accent, "--icon-accent-alt": iconGradientAlternateAccent, "--icon-soft": iconTokens.soft, "--icon-solid": iconTokens.solid, "--icon-solid-alt": iconGradientAlternate, "--icon-on-solid": iconTokens.onSolid,
        "--icon-theme-accent": iconTokens.accent, "--icon-theme-accent-alt": iconGradientAlternateAccent, "--icon-theme-soft": iconTokens.soft, "--icon-theme-solid": iconTokens.solid, "--icon-theme-solid-alt": iconGradientAlternate, "--icon-theme-on-solid": iconTokens.onSolid,
        "--title-icon-accent": titleIconTokens.accent, "--title-icon-soft": titleIconTokens.soft, "--title-icon-on-solid": titleIconTokens.onSolid,
        "--icon-neutral": state.mode === "dark" ? "#a1a1aa" : "#62626b",
        "--icon-neutral-alt": state.mode === "dark" ? "#d4d4d8" : "#3f3f46",
        "--icon-neutral-soft": state.mode === "dark" ? "#34343a" : "#f0f0f2",
        "--icon-neutral-solid": "#62626b",
        "--icon-neutral-solid-alt": "#3f3f46",
        "--icon-neutral-on-solid": "#ffffff",
        "--kpi-card-white": state.mode === "dark" ? resolvedSurface : "#ffffff",
        "--kpi-card-single-tint": state.mode === "dark" ? "10%" : "4%",
        "--kpi-card-multi-tint": state.mode === "dark" ? "12%" : "6%",
        "--chart-accent": chartPalette.monochrome,
        "--chart-bi-1": chartPalette.bichrome[0], "--chart-bi-2": chartPalette.bichrome[1],
        "--chart-1": chartPalette.categorical[0], "--chart-2": chartPalette.categorical[1], "--chart-3": chartPalette.categorical[2],
        "--chart-4": chartPalette.categorical[3], "--chart-5": chartPalette.categorical[4], "--chart-6": chartPalette.categorical[5],
        "--chart-7": chartPalette.categorical[6], "--chart-8": chartPalette.categorical[7],
        "--accent": accentTokens.structure,
        "--radius": `${state.radius}px`, "--card-gap": `${state.cardGap}px`, "--card-title-size": `${state.cardTitleFont}px`, "--card-subtitle-size": `max(12px, ${(state.cardTitleFont * .82).toFixed(2)}px)`, "--hero-title-size": `${state.headerTitleFont}px`,
        "--font-scale": (state.font / 14).toFixed(3), "--section-title-size": `${state.sectionFont}px`, "--section-title-weight": state.sectionWeight, "--section-marker-height": `${(state.sectionFont * 1.05).toFixed(2)}px`,
        "--section-kicker-size": "12px", "--space": `${spaces[state.spacing]}px`, "--shadow": shadowMap[state.shadow]
      };
      Object.entries(vars).forEach(([name, value]) => dashboard.style.setProperty(name, value));
      designDrawer.style.setProperty("--sample-accent", state.accent);
      designDrawer.style.setProperty("--card-title-neutral-preview", state.mode === "dark" ? "#a1a1aa" : "#62626b");
      designDrawer.style.setProperty("--card-title-accent-preview", iconTokens.accent);
      designDrawer.style.setProperty("--card-title-accent-alt-preview", iconGradientAlternateAccent);
      designDrawer.style.setProperty("--card-title-colorful-preview", chartPalette.categorical[0]);
      designDrawer.style.setProperty("--card-title-colorful-alt-preview", chartPalette.categorical[1]);
      document.body.style.background = state.pageType === "report"
        ? (state.pageBackground === "accent-soft" ? softThemeSurfaces.outer : surfaceTokens.outer)
        : resolvedPageBackground;
      document.body.style.setProperty("--texture-color", `color-mix(in srgb, ${colors.text} 4%, transparent)`);
      document.body.style.setProperty("--texture-line-color", `color-mix(in srgb, ${colors.text} 2.5%, transparent)`);
      document.body.style.setProperty("--texture-grain-color", `color-mix(in srgb, ${colors.text} 7%, transparent)`);
      document.body.dataset.pageTexture = state.pageTexture;
      dashboard.dataset.header = resolvedHeader;
      dashboard.dataset.headerBackgroundType = state.headerBackgroundType;
      dashboard.dataset.headerColor = state.headerBackgroundType === "none" || (state.headerBackgroundType === "solid" && state.headerSolidMode === "neutral") ? "neutral" : "adaptive";
      dashboard.dataset.pageType = state.pageType;
      dashboard.dataset.contentWidth = resolvedContentWidth;
      dashboard.dataset.headerAlign = resolvedHeaderAlign;
      dashboard.dataset.subtitle = state.subtitle;
      dashboard.dataset.headerMeta = state.headerMetaStyle;
      dashboard.dataset.headerMetaSeparator = state.headerMetaSeparator;
      dashboard.dataset.headerDecoration = state.headerDecoration;
      dashboard.dataset.sectionVisibility = resolvedSectionVisibility;
      dashboard.dataset.sectionLeading = state.sectionLeading;
      dashboard.dataset.sectionIconStyle = state.sectionIconStyle;
      dashboard.dataset.sectionIconColor = state.sectionIconColor;
      dashboard.dataset.sectionCopy = state.sectionCopy;
      dashboard.dataset.sectionDivider = state.sectionDivider;
      dashboard.dataset.sectionSurface = "none";
      dashboard.dataset.mode = state.mode;
      dashboard.dataset.frame = state.frame === "none" ? "none" : "wireframe";
      const sameSurface = resolveCssColor(resolvedPageBackground) === resolveCssColor(resolvedSurface);
      dashboard.dataset.surfaceBoundary = sameSurface && state.frame === "none" && state.shadow === "none" ? "fallback" : "normal";
      dashboard.dataset.kpiIcon = state.kpiIcon;
      dashboard.dataset.kpiIconWeight = state.kpiIconWeight;
      dashboard.dataset.kpiIconColor = state.kpiIconColor;
      dashboard.dataset.kpiIconContainer = state.kpiIconContainer;
      dashboard.dataset.kpiIconShape = state.kpiIconShape;
      dashboard.dataset.kpiIconSize = state.kpiIconSize;
      dashboard.dataset.kpiLayout = state.kpiLayout;
      dashboard.dataset.kpiCardBackground = state.kpiCardBackground;
      dashboard.dataset.cardTitleIcon = state.cardTitleIcon;
      dashboard.dataset.cardTitleLeading = state.cardTitleLeading;
      dashboard.dataset.cardTitleIconForm = state.cardTitleIconForm;
      dashboard.dataset.cardTitleIconColor = state.cardTitleIconColor;
      dashboard.dataset.cardTitleIconEffect = state.cardTitleIconEffect;
      dashboard.dataset.cardSubtitle = state.cardSubtitle;
      dashboard.dataset.chartPalette = state.chartPalette;
      dashboard.dataset.pageTexture = state.pageTexture;
      applySectionIconColorTokens(chartPalette.categorical, resolvedSurface);
      renderCardTitleDecorations();
      renderSectionIcons();
      applyCardOverrides();
      document.querySelector("#accentValue").textContent = state.accent;
      document.querySelector("#radiusValue").textContent = `${state.radius}px`;
      document.querySelector("#fontValue").textContent = `${state.font}px`;
      document.querySelector("#sectionFontValue").textContent = `${state.sectionFont}px`;
      accentControl.value = state.accent;
      pageBackgroundControl.value = state.pageBackground;
      pageBackgroundColorControl.value = state.customPageBackground || neutralPage;
      pageBackgroundColorControl.disabled = state.pageBackground !== "custom";
      customPageBackgroundField.hidden = state.pageBackground !== "custom";
      pageTextureControl.value = state.pageTexture;
      radiusControl.value = state.radius;
      cardGapControl.value = state.cardGap;
      cardTitleFontControl.value = state.cardTitleFont;
      cardSubtitleControl.value = state.cardSubtitle;
      cardTitleLeadingControl.value = state.cardTitleLeading;
      cardTitleLeadingControl.querySelector('option[value="number"]').hidden = state.pageType === "dashboard";
      customSelects.get(cardTitleLeadingControl)?.options.forEach((option) => {
        if (option.dataset.value === "number") option.hidden = state.pageType === "dashboard";
      });
      cardTitleIconComposerField.hidden = state.cardTitleLeading !== "icon";
      cardTitleDecorationControl.value = state.cardTitleDecoration;
      cardTitleColorControl.value = state.cardTitleColor;
      fontControl.value = state.font;
      sectionFontControl.value = state.sectionFont;
      sectionWeightControl.value = String(state.sectionWeight);
      shadowControl.value = state.shadow;
      frameControl.value = state.frame;
      kpiIconControl.value = state.kpiIcon;
      kpiWeightControl.value = state.kpiIconWeight;
      kpiWeightField.closest(".kpi-icon-composer").dataset.showWeight = String(state.kpiIcon === "outline");
      kpiIconColorControl.value = state.kpiIconColor;
      kpiCardBackgroundControl.value = state.kpiCardBackground;
      kpiIconColorField.hidden = state.kpiIcon === "none";
      kpiContainerControl.value = state.kpiIconContainer;
      kpiContainerField.hidden = state.kpiIcon === "none";
      kpiShapeControl.value = state.kpiIconShape;
      kpiShapeField.hidden = false;
      kpiSizeControl.value = state.kpiIconSize;
      kpiSizeField.hidden = false;
      kpiLayoutControl.value = state.kpiLayout;
      chartPaletteControl.value = state.chartPalette;
      headerControl.value = state.headerBackgroundType;
      headerSolidColorControl.value = resolvedHeaderSolidColor;
      headerSolidColorField.hidden = state.headerBackgroundType !== "solid";
      headerGradientTrigger.hidden = state.headerBackgroundType !== "gradient";
      const gradientSwatch = buildHeaderGradient(state.headerGradientStops, state.headerGradientDirection, state.headerGradientAngle);
      headerGradientTrigger.style.setProperty("--header-gradient-swatch", gradientSwatch);
      headerGradientPopover.style.setProperty("--header-gradient-swatch", gradientSwatch);
      renderHeaderGradientEditor();
      headerGradientDirectionControl.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.value === state.headerGradientDirection));
      });
      headerGradientAngleField.hidden = false;
      headerGradientAngleControl.value = Math.round(state.headerGradientAngle);
      if (state.headerBackgroundType !== "gradient") closeHeaderGradientPopover();
      headerAlignControl.value = state.headerAlign;
      headerTitleFontControl.value = state.headerTitleFont;
      headerTitleFontValue.textContent = `${state.headerTitleFont}px`;
      subtitleControl.value = state.subtitle;
      headerMetaControl.value = state.headerMetaStyle;
      headerMetaSeparatorControl.value = state.headerMetaSeparator;
      headerMetaSeparatorField.hidden = state.headerMetaStyle === "hidden";
      headerDecorationControl.value = state.headerDecoration;
      contentWidthControl.value = state.contentWidth;
      const headerIsHidden = resolvedHeader === "hidden";
      headerVisibilityToggle.checked = state.headerVisible;
      headerBand.dataset.enabled = String(!headerIsHidden);
      headerTitleGroup.hidden = headerIsHidden;
      headerSubtitleGroup.hidden = headerIsHidden;
      headerMetaGroup.hidden = headerIsHidden;
      headerBrandGroup.hidden = headerIsHidden;
      headerAlignField.hidden = headerIsHidden;
      headerTitleFontField.hidden = headerIsHidden;
      subtitleField.hidden = headerIsHidden;
      headerMetaField.hidden = headerIsHidden;
      headerDecorationField.hidden = headerIsHidden;
      logoField.hidden = headerIsHidden;
      const sectionTitlesVisible = resolvedSectionVisibility === "visible";
      sectionTitleBand.hidden = state.pageType === "dashboard";
      sectionVisibilityToggle.checked = sectionTitlesVisible;
      sectionTitleBand.dataset.enabled = String(sectionTitlesVisible);
      sectionLeadingControl.value = state.sectionLeading;
      sectionIconStyleControl.value = state.sectionIconStyle;
      sectionIconColorControl.value = state.sectionIconColor;
      sectionIconStyleControl.closest(".mini-control").hidden = state.sectionLeading !== "icon";
      sectionCopyControl.value = state.sectionCopy;
      sectionSubtitleEditor.dataset.visible = String(state.sectionCopy === "subtitle");
      sectionSubtitleControls.forEach((control) => { control.value = state.sectionSubtitles[control.dataset.sectionSubtitle] || ""; });
      sectionDividerControl.value = state.sectionDivider;
      applyLanguage();
      if (workspaceDocument) applyWorkspaceDocument(workspaceDocument);
      applyCardOverrides();
      updatePresetOptions();
      setPressed("presetControls", state.preset);
      setPressed("pageTypeControls", state.pageType);
      setPressed("languageControls", state.language);
      setPressed("modeControls", state.mode);
      setPressed("spacingControls", state.spacing);
      syncCustomSelects();
      syncKpiStyleSamples();
      document.querySelectorAll('.range-control input[type="range"]').forEach(syncRangeTrack);
      if (selectedCardId || selectedSectionId) updateCardContext();
      scheduleWorkspaceSave();
    }

    function selectPreset(name) {
      const customPreset = getCustomPreset(name);
      if (customPreset) {
        const pageType = state.pageType || "dashboard";
        const language = state.language || "zh";
        selectPreset("fx-orange");
        state = { ...state, ...customPreset.theme, preset: customPreset.id, pageType, language };
        applyState();
        return;
      }
      const basePreset = presets[name];
      const language = state.language || "zh";
      const pageType = state.pageType || "dashboard";
      const preset = { ...basePreset, ...(pagePresetDefaults[pageType]?.[name] || {}) };
      state = { preset: name, pageType, language, accent: preset.accent, mode: preset.mode, header: preset.header, headerBackgroundType: preset.headerBackgroundType ?? (pageType === "report" ? "solid" : ["plain", "auto"].includes(preset.header) ? "none" : preset.header === "brand" ? "gradient" : "solid"), headerBackgroundDefaultVersion: 2, headerAlign: preset.headerAlign ?? (pageType === "report" ? "center" : "left"), headerTitleFont: preset.headerTitleFont ?? 32, subtitle: preset.subtitle ?? "none", headerMetaStyle: preset.headerMetaStyle ?? (pageType === "dashboard" ? "plain" : "surface"), headerMetaDefaultVersion: 2, headerMetaSeparator: preset.headerMetaSeparator ?? "dot", headerDecoration: preset.headerDecoration ?? "none", headerSolidLinkedToMode: true, pageBackground: preset.pageBackground ?? "neutral", customPageBackground: preset.light.page, pageTexture: preset.pageTexture ?? "none", contentWidth: preset.contentWidth ?? "auto", sectionVisibility: preset.sectionVisibility ?? "auto", sectionLeading: preset.sectionLeading ?? "none", sectionIconStyle: "line", sectionIconColor: "accent", sectionIcons: {}, sectionCopy: preset.sectionCopy ?? "title", sectionSubtitles: {}, sectionDivider: preset.sectionDivider ?? "none", sectionSurface: preset.sectionSurface ?? "none", sectionFont: preset.sectionFont ?? 15, sectionWeight: 700, frame: preset.frame ?? "none", kpiIcon: preset.kpiIcon ?? "none", kpiIconWeight: "regular", kpiIconColor: "auto", kpiIconFollowCardVersion: 1, kpiIconContainer: "none", kpiIconShape: "rect", kpiIconSize: "medium", kpiLayout: "right-top", kpiCardBackground: "default", chartPalette: preset.chartPalette ?? "monochrome", cardOverrides: {}, radius: preset.radius, cardGap: preset.cardGap ?? 12, cardTitleFont: preset.cardTitleFont ?? 14, cardSubtitle: preset.cardSubtitle ?? "below", cardTitleStyle: preset.cardTitleStyle ?? "none", cardTitleLeading: preset.cardTitleLeading ?? "none", cardTitleDecoration: "line", cardTitleColor: "neutral", cardTitleIcon: "none", cardTitleIconForm: "line", cardTitleIconColor: "neutral", cardTitleIconEffect: "none", font: preset.font, shadow: preset.shadow, spacing: preset.spacing };
      applyState();
    }

    document.querySelector("#presetControls").addEventListener("click", (event) => {
      const name = event.target.dataset.preset;
      if (name) selectPreset(name);
    });
    document.querySelector("#customPresetSave").addEventListener("click", () => openCustomPresetDialog("create"));
    customPresetUpdate.addEventListener("click", () => {
      const preset = getCustomPreset(customPresetActionTargetId);
      if (!preset || state.preset !== preset.id || !isCurrentCustomPresetModified()) return;
      preset.theme = createCustomPresetTheme();
      writeCustomPresets();
      updatePresetOptions();
      setSaveStatus("已更新自定义预设");
    });
    customPresetRename.addEventListener("click", () => openCustomPresetDialog("rename", customPresetActionTargetId));
    customPresetDelete.addEventListener("click", () => {
      const preset = getCustomPreset(customPresetActionTargetId);
      const selected = state.preset === preset?.id;
      const consequence = selected ? "删除后将切换到标准看板。" : "此操作无法撤销。";
      if (!preset || !window.confirm(`删除自定义预设“${preset.name}”？${consequence}`)) return;
      customPresets = customPresets.filter((item) => item.id !== preset.id);
      writeCustomPresets();
      closeCustomPresetMenu();
      if (selected) selectPreset("fx-orange");
      else updatePresetOptions();
      setSaveStatus("已删除自定义预设");
    });
    customPresetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = customPresetName.value.trim().slice(0, 30);
      const targetPreset = getCustomPreset(customPresetDialogTargetId);
      const duplicate = customPresets.some((preset) => preset.id !== (customPresetDialogMode === "rename" ? targetPreset?.id : "") && preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!name) { setCustomPresetDialogError("请输入预设名称"); return; }
      if (duplicate) { setCustomPresetDialogError("已有同名自定义预设"); return; }
      if (customPresetDialogMode === "rename") {
        if (!targetPreset) return;
        targetPreset.name = name;
        writeCustomPresets();
        closeCustomPresetDialog();
        updatePresetOptions();
        setSaveStatus("已重命名自定义预设");
        return;
      }
      const id = `custom-${Date.now().toString(36)}`;
      customPresets.push({ id, name, theme: createCustomPresetTheme() });
      writeCustomPresets();
      state.preset = id;
      closeCustomPresetDialog();
      applyState();
      setSaveStatus("已保存自定义预设");
    });
    customPresetDialogClose.addEventListener("click", closeCustomPresetDialog);
    customPresetDialogCancel.addEventListener("click", closeCustomPresetDialog);
    customPresetDialog.addEventListener("cancel", () => setCustomPresetDialogError());
    customPresetDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopPropagation();
    });
    customPresetRow.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !customPresetPopover.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeCustomPresetMenu({ focus: true });
        return;
      }
      if (!customPresetPopover.hidden && event.target.matches(".custom-preset-more") && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const options = [...customPresetPopover.querySelectorAll("button:not(:disabled)")];
        (event.key === "ArrowUp" ? options.at(-1) : options[0])?.focus();
        return;
      }
      if (customPresetPopover.hidden || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const options = [...customPresetPopover.querySelectorAll("button:not(:disabled)")];
      if (!options.includes(document.activeElement)) return;
      if (!options.length) return;
      event.preventDefault();
      const currentIndex = options.indexOf(document.activeElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1
        : (Math.max(0, currentIndex) + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[nextIndex].focus();
    });
    customPresetList.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !event.target.matches(".custom-preset-select")) return;
      const options = [...customPresetList.querySelectorAll(".custom-preset-select")];
      if (!options.length) return;
      event.preventDefault();
      const currentIndex = options.indexOf(event.target);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
      options[nextIndex].focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!customPresetPopover.contains(event.target) && !event.target.closest("[data-custom-preset-more]")) closeCustomPresetMenu();
    });
    document.querySelector("#pageTypeControls").addEventListener("click", (event) => {
      const nextPageType = event.target.dataset.value;
      if (!nextPageType || nextPageType === state.pageType) return;
      if (state.pageType === "dashboard" && nextPageType === "report" && state.headerBackgroundType === "none") {
        state.headerBackgroundType = "solid";
        state.headerSolidLinkedToMode = true;
      }
      state.headerAlign = nextPageType === "report" ? "center" : "left";
      state.pageType = nextPageType;
      applyState();
    });
    document.querySelector("#languageControls").addEventListener("click", (event) => { if (event.target.dataset.value) { state.language = event.target.dataset.value; applyState(); } });
    document.querySelector("#modeControls").addEventListener("click", (event) => { if (event.target.dataset.value) { state.mode = event.target.dataset.value; applyState(); } });
    document.addEventListener("input", (event) => {
      if (event.target.matches('.range-control input[type="range"]')) syncRangeTrack(event.target);
    });
    document.querySelector("#spacingControls").addEventListener("click", (event) => { if (event.target.dataset.value) { state.spacing = event.target.dataset.value; applyState(); } });
    accentControl.addEventListener("input", () => { state.accent = accentControl.value; applyState(); });
    pageBackgroundControl.addEventListener("change", () => { state.pageBackground = pageBackgroundControl.value; applyState(); });
    pageBackgroundColorControl.addEventListener("input", () => { state.customPageBackground = pageBackgroundColorControl.value; applyState(); });
    pageTextureControl.addEventListener("change", () => { state.pageTexture = pageTextureControl.value; applyState(); });
    radiusControl.addEventListener("input", () => { state.radius = Number(radiusControl.value); applyState(); });
    cardGapControl.addEventListener("change", () => { state.cardGap = Number(cardGapControl.value); applyState(); });
    cardTitleFontControl.addEventListener("change", () => { state.cardTitleFont = Number(cardTitleFontControl.value); applyState(); });
    cardSubtitleControl.addEventListener("change", () => { state.cardSubtitle = cardSubtitleControl.value; applyState(); });
    cardTitleLeadingControl.addEventListener("change", () => { state.cardTitleLeading = cardTitleLeadingControl.value; applyState(); });
    cardTitleDecorationControl.addEventListener("change", () => { state.cardTitleDecoration = cardTitleDecorationControl.value; applyState(); });
    cardTitleColorControl.addEventListener("change", () => { state.cardTitleColor = cardTitleColorControl.value; applyState(); });
    fontControl.addEventListener("input", () => {
      const nextFont = Number(fontControl.value);
      const delta = nextFont - Number(state.font);
      state.font = nextFont;
      state.sectionFont = Math.max(12, Math.min(24, Number(state.sectionFont) + delta));
      applyState();
    });
    sectionFontControl.addEventListener("input", () => { state.sectionFont = Number(sectionFontControl.value); applyState(); });
    sectionWeightControl.addEventListener("change", () => { state.sectionWeight = Number(sectionWeightControl.value); applyState(); });
    shadowControl.addEventListener("change", () => { state.shadow = shadowControl.value; applyState(); });
    frameControl.addEventListener("change", () => { state.frame = frameControl.value; applyState(); });
    kpiIconControl.addEventListener("change", () => { state.kpiIcon = kpiIconControl.value; applyState(); });
    kpiWeightControl.addEventListener("change", () => { state.kpiIconWeight = kpiWeightControl.value; applyState(); });
    kpiIconColorControl.addEventListener("change", () => { state.kpiIconColor = kpiIconColorControl.value; applyState(); });
    kpiContainerControl.addEventListener("change", () => { state.kpiIconContainer = kpiContainerControl.value; applyState(); });
    kpiShapeControl.addEventListener("change", () => { state.kpiIconShape = kpiShapeControl.value; applyState(); });
    kpiSizeControl.addEventListener("change", () => { state.kpiIconSize = kpiSizeControl.value; applyState(); });
    kpiLayoutControl.addEventListener("change", () => { state.kpiLayout = kpiLayoutControl.value; applyState(); });
    kpiCardBackgroundControl.addEventListener("change", () => { state.kpiCardBackground = kpiCardBackgroundControl.value; applyState(); });
    kpiDecorationControl.addEventListener("change", () => applyGlobalKpiDecoration(kpiDecorationControl.value));
    kpiStyleColorControl.addEventListener("change", () => { state.kpiIconColor = kpiStyleColorControl.value; applyState(); });
    chartPaletteControl.addEventListener("change", () => { state.chartPalette = chartPaletteControl.value; applyState(); });
    settingsTabControls.addEventListener("click", (event) => {
      if (event.target.dataset.value) setSettingsTab(event.target.dataset.value);
    });
    cardChartPaletteControl.addEventListener("change", () => setCardOverride("chartPalette", cardChartPaletteControl.value));
    cardChartTypeControl.addEventListener("change", () => setSelectedChartType(cardChartTypeControl.value));
    cardSubtitleOverrideControl.addEventListener("change", () => setCardOverride("cardSubtitle", cardSubtitleOverrideControl.value));
    cardSubtitleTextControl.addEventListener("input", () => setCardOverride("cardSubtitleText", cardSubtitleTextControl.value));
    cardKpiIconOverrideControl.addEventListener("change", () => setCardOverride("kpiIcon", cardKpiIconOverrideControl.value));
    cardKpiWeightControl.addEventListener("change", () => setCardOverride("kpiIconWeight", cardKpiWeightControl.value));
    cardKpiLayoutControl.addEventListener("change", () => setCardOverride("kpiLayout", cardKpiLayoutControl.value));
    cardKpiBackgroundControl.addEventListener("change", () => setCardOverride("kpiCardBackground", cardKpiBackgroundControl.value));
    cardKpiDecorationControl.addEventListener("change", () => applyCardKpiDecoration(cardKpiDecorationControl.value));
    cardKpiStyleColorControl.addEventListener("change", () => applyCardKpiColor(cardKpiStyleColorControl.value));
    cardIconColorControl.addEventListener("change", () => setCardOverride("iconColor", cardIconColorControl.value));
    cardKpiContainerControl.addEventListener("change", () => setCardOverride("kpiIconContainer", cardKpiContainerControl.value));
    cardKpiShapeControl.addEventListener("change", () => setCardOverride("kpiIconShape", cardKpiShapeControl.value));
    cardKpiSizeControl.addEventListener("change", () => setCardOverride("kpiIconSize", cardKpiSizeControl.value));
    sectionIconPickerTrigger.addEventListener("click", openSectionIconPicker);
    cardTitleIconPickerTrigger.addEventListener("click", openCardTitleIconPicker);
    sectionWidthControl.addEventListener("change", () => {
      const section = selectedSection();
      if (!section) return;
      const span = [4, 6, 8, 12].includes(Number(sectionWidthControl.value)) ? Number(sectionWidthControl.value) : 12;
      section.dataset.span = String(span);
      section.style.setProperty("--section-span", span);
      scheduleWorkspaceSave();
    });
    sectionLayoutControl.addEventListener("change", () => {
      const section = selectedSection();
      const group = section?.querySelector(":scope > .layout-group");
      if (!group) return;
      group.dataset.layout = sectionLayoutControl.value;
      const canvasControl = document.querySelector(`[data-layout-group="${CSS.escape(section.dataset.sectionId)}"]`);
      if (canvasControl) {
        canvasControl.value = sectionLayoutControl.value;
        syncCustomSelect(canvasControl);
      }
      scheduleWorkspaceSave();
    });
    sectionIconPickerClose.addEventListener("click", closeSectionIconPicker);
    sectionIconPickerSearch.addEventListener("input", () => {
      clearTimeout(iconSearchTimer);
      iconSearchTimer = setTimeout(() => searchSectionIcons(sectionIconPickerSearch.value), 180);
    });
    sectionIconPickerResults.addEventListener("click", (event) => {
      const button = event.target.closest("[data-icon-name]");
      if (button) {
        if (iconPickerTarget === "card") setCardTitleIconOverride(button.dataset.iconName);
        else setSectionIconOverride(button.dataset.iconName);
      }
    });
    cardOverrideReset.addEventListener("click", () => {
      if (selectedSectionId) {
        delete state.sectionIcons?.[selectedSectionId];
        applyState();
        return;
      }
      if (!selectedCardId || !state.cardOverrides) return;
      delete state.cardOverrides[selectedCardId];
      applyState();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !sectionIconPickerDialog.hidden) closeSectionIconPicker();
    });
    headerControl.addEventListener("change", () => { state.headerBackgroundType = headerControl.value; applyState(); });
    headerSolidColorControl.addEventListener("input", () => {
      state.headerSolidLinkedToMode = false;
      state.headerSolidColor = headerSolidColorControl.value;
      applyState();
    });
    function selectedGradientStop() {
      return state.headerGradientStops.find((stop) => stop.id === selectedHeaderGradientStopId);
    }
    function gradientPositionFromPointer(event) {
      const rect = headerGradientPreview.getBoundingClientRect();
      return Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    }
    function interpolateGradientStop(position) {
      const stops = [...state.headerGradientStops].sort((first, second) => first.position - second.position);
      const rightIndex = stops.findIndex((stop) => stop.position >= position);
      const right = rightIndex < 0 ? stops[stops.length - 1] : stops[rightIndex];
      const left = rightIndex <= 0 ? stops[0] : stops[rightIndex - 1];
      const span = right.position - left.position;
      const ratio = span <= 0 ? 0 : (position - left.position) / span;
      return {
        id: `stop-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        color: mixHex(right.color, left.color, ratio),
        opacity: left.opacity + (right.opacity - left.opacity) * ratio,
        position,
        linkedToAccent: false
      };
    }
    headerGradientPreview.addEventListener("click", (event) => {
      if (event.target.closest(".header-gradient-stop")) return;
      const stop = interpolateGradientStop(gradientPositionFromPointer(event));
      state.headerGradientStops.push(stop);
      selectedHeaderGradientStopId = stop.id;
      applyState();
    });
    let draggedGradientStopId = null;
    let gradientStopPointerStartX = 0;
    let gradientStopDidMove = false;
    headerGradientPreview.addEventListener("pointerdown", (event) => {
      const marker = event.target.closest(".header-gradient-stop");
      if (!marker) return;
      event.preventDefault();
      event.stopPropagation();
      headerGradientPreview.setPointerCapture?.(event.pointerId);
      draggedGradientStopId = marker.dataset.stopId;
      gradientStopPointerStartX = event.clientX;
      gradientStopDidMove = false;
      selectedHeaderGradientStopId = draggedGradientStopId;
      renderHeaderGradientEditor();
    });
    document.addEventListener("pointermove", (event) => {
      if (!draggedGradientStopId) return;
      if (Math.abs(event.clientX - gradientStopPointerStartX) < 4) return;
      gradientStopDidMove = true;
      const stop = state.headerGradientStops.find((item) => item.id === draggedGradientStopId);
      if (!stop) return;
      stop.position = gradientPositionFromPointer(event);
      applyState();
    });
    document.addEventListener("pointerup", (event) => {
      const shouldOpenColorPicker = draggedGradientStopId && !gradientStopDidMove;
      if (headerGradientPreview.hasPointerCapture?.(event.pointerId)) headerGradientPreview.releasePointerCapture(event.pointerId);
      draggedGradientStopId = null;
      if (shouldOpenColorPicker) headerGradientStopColorControl.click();
    });
    headerGradientStopColorControl.addEventListener("input", () => {
      const stop = selectedGradientStop();
      if (!stop) return;
      stop.color = headerGradientStopColorControl.value;
      stop.linkedToAccent = false;
      applyState();
    });
    headerGradientStopOpacityControl.addEventListener("input", () => {
      const stop = selectedGradientStop();
      if (!stop) return;
      stop.opacity = Number(headerGradientStopOpacityControl.value) / 100;
      applyState();
    });
    headerGradientStopPositionControl.addEventListener("input", () => {
      const stop = selectedGradientStop();
      const value = Number(headerGradientStopPositionControl.value);
      if (!stop || !Number.isFinite(value)) return;
      stop.position = Math.max(0, Math.min(100, value));
      applyState();
    });
    headerGradientStopRemove.addEventListener("click", () => {
      if (state.headerGradientStops.length <= 2) return;
      const index = state.headerGradientStops.findIndex((stop) => stop.id === selectedHeaderGradientStopId);
      state.headerGradientStops.splice(index, 1);
      selectedHeaderGradientStopId = state.headerGradientStops[Math.max(0, index - 1)].id;
      applyState();
    });
    function closeHeaderGradientPopover() {
      headerGradientPopover.hidden = true;
      headerGradientTrigger.setAttribute("aria-expanded", "false");
    }
    headerGradientTrigger.addEventListener("click", () => {
      const willOpen = headerGradientPopover.hidden;
      headerGradientPopover.hidden = !willOpen;
      headerGradientTrigger.setAttribute("aria-expanded", String(willOpen));
    });
    headerGradientPopover.addEventListener("pointerdown", (event) => { event.stopPropagation(); });
    headerGradientDirectionControl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.headerGradientDirection = button.dataset.value;
      state.headerGradientAngle = { horizontal: 90, vertical: 180, diagonal: 135 }[state.headerGradientDirection];
      applyState();
    });
    function syncGradientDirectionFromAngle() {
      state.headerGradientDirection = state.headerGradientAngle === 90 ? "horizontal" : state.headerGradientAngle === 180 ? "vertical" : "diagonal";
    }
    headerGradientAngleControl.addEventListener("input", () => {
      const value = Number(headerGradientAngleControl.value);
      if (!Number.isFinite(value)) return;
      state.headerGradientAngle = Math.max(0, Math.min(360, value));
      syncGradientDirectionFromAngle();
      applyState();
    });
    let gradientAngleDragStartX = 0;
    let gradientAngleDragStartValue = 0;
    let gradientAngleIsDragging = false;
    let gradientAnglePointerId = null;
    headerGradientAngleScrubber.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      gradientAngleDragStartX = event.clientX;
      gradientAngleDragStartValue = state.headerGradientAngle;
      gradientAngleIsDragging = false;
      gradientAnglePointerId = event.pointerId;
      headerGradientAngleScrubber.setPointerCapture?.(event.pointerId);
    });
    document.addEventListener("pointermove", (event) => {
      if (event.pointerId !== gradientAnglePointerId) return;
      const delta = event.clientX - gradientAngleDragStartX;
      if (Math.abs(delta) < 3) return;
      event.preventDefault();
      gradientAngleIsDragging = true;
      state.headerGradientAngle = Math.max(0, Math.min(360, gradientAngleDragStartValue + delta));
      syncGradientDirectionFromAngle();
      applyState();
    });
    document.addEventListener("pointerup", (event) => {
      if (event.pointerId !== gradientAnglePointerId) return;
      if (headerGradientAngleScrubber.hasPointerCapture?.(event.pointerId)) headerGradientAngleScrubber.releasePointerCapture(event.pointerId);
      if (gradientAngleIsDragging) headerGradientAngleControl.blur();
      gradientAngleIsDragging = false;
      gradientAnglePointerId = null;
    });
    document.addEventListener("pointerdown", (event) => {
      if (!headerGradientPopover.hidden && !headerGradientPopover.contains(event.target) && event.target !== headerGradientTrigger) closeHeaderGradientPopover();
    });
    headerVisibilityToggle.addEventListener("change", () => {
      state.headerVisible = headerVisibilityToggle.checked;
      applyState();
    });
    headerAlignControl.addEventListener("change", () => { state.headerAlign = headerAlignControl.value; applyState(); });
    headerTitleFontControl.addEventListener("input", () => { state.headerTitleFont = Number(headerTitleFontControl.value); applyState(); });
    subtitleControl.addEventListener("change", () => { state.subtitle = subtitleControl.value; applyState(); });
    headerMetaControl.addEventListener("change", () => { state.headerMetaStyle = headerMetaControl.value; applyState(); });
    headerMetaSeparatorControl.addEventListener("change", () => { state.headerMetaSeparator = headerMetaSeparatorControl.value; applyState(); });
    headerDecorationControl.addEventListener("change", () => { state.headerDecoration = headerDecorationControl.value; applyState(); });
    contentWidthControl.addEventListener("change", () => { state.contentWidth = contentWidthControl.value; applyState(); });
    sectionVisibilityToggle.addEventListener("change", () => {
      state.sectionVisibility = sectionVisibilityToggle.checked ? "visible" : "hidden";
      applyState();
    });
    sectionLeadingControl.addEventListener("change", () => { state.sectionLeading = sectionLeadingControl.value; applyState(); });
    sectionIconStyleControl.addEventListener("change", () => {
      state.sectionIconStyle = sectionIconStyleControl.value;
      // A style choice is meaningful only with an icon, so make that relationship explicit.
      state.sectionLeading = "icon";
      applyState();
    });
    sectionIconColorControl.addEventListener("change", () => {
      state.sectionIconColor = sectionIconColorControl.value;
      state.sectionLeading = "icon";
      applyState();
    });
    sectionCopyControl.addEventListener("change", () => { state.sectionCopy = sectionCopyControl.value; applyState(); });
    sectionSubtitleControls.forEach((control) => {
      control.addEventListener("input", () => {
        state.sectionSubtitles = { ...state.sectionSubtitles, [control.dataset.sectionSubtitle]: control.value };
        const section = dashboard.querySelector(`.section[data-section-id="${control.dataset.sectionSubtitle}"]`);
        const subtitle = section?.querySelector(".section-heading small");
        if (subtitle) subtitle.textContent = control.value;
        scheduleWorkspaceSave();
      });
    });
    sectionDividerControl.addEventListener("change", () => { state.sectionDivider = sectionDividerControl.value; applyState(); });
    logoControl.addEventListener("change", () => {
      const file = logoControl.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        logoControl.value = "";
        logoStatus.textContent = "超过 2MB";
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        brandLogo.src = String(reader.result);
        brandSlot.hidden = false;
        logoClearControl.hidden = false;
        logoFileName = file.name;
        logoStatus.textContent = logoFileName;
        logoStatus.title = logoFileName;
        scheduleWorkspaceSave();
      });
      reader.addEventListener("error", () => { logoStatus.textContent = "读取失败"; });
      reader.readAsDataURL(file);
    });
    logoClearControl.addEventListener("click", () => {
      logoControl.value = "";
      brandLogo.removeAttribute("src");
      brandSlot.hidden = true;
      logoClearControl.hidden = true;
      logoFileName = "";
      logoStatus.textContent = "未上传";
      logoStatus.removeAttribute("title");
      scheduleWorkspaceSave();
    });

    designSaveControl.addEventListener("click", saveWorkspaceRevision);
    designResetControl.addEventListener("click", resetUnsavedWorkspaceState);
    designPresetResetControl.addEventListener("click", () => {
      selectPreset(state.preset);
      setSaveStatus("已恢复当前默认预设");
    });

    function workspaceComponentById(componentId) {
      for (const section of workspaceDocument?.sections || []) {
        const component = section.components.find(({ id }) => id === componentId);
        if (component) return { component, section };
      }
      return null;
    }

    function syncAiComposerScope() {
      window.dispatchEvent(new Event("dashboard-ai-context-change"));
    }

    function setAiComposerOpen(open, options) {
      window.DashboardAiComposerCenter?.setOpen(open, options);
    }

    const studioAuth = createAuthSessionController({
      gate: studioAuthGate, form: studioAuthForm, token: studioAuthToken, submit: studioAuthSubmit, status: studioAuthStatus, logout: studioAuthControl, projectControl: studioProjectControl,
      onActor(payload) {
      const actor = payload.actor || null;
      if (actor?.role === "viewer") {
        setDesignMode(false);
        aiGenerationStatus.textContent = "当前为只读权限，可查看与导出，不能修改或发布";
      }
      }
    });

    designDrawerClose.addEventListener("click", () => setDesignMode(false));
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        window.DashboardThemeEditor.toggle();
      } else if (event.key === "Escape" && !headerGradientPopover.hidden) {
        closeHeaderGradientPopover();
        headerGradientTrigger.focus();
      } else if (event.key === "Escape" && aiComposer.dataset.open === "true") {
        setAiComposerOpen(false);
      } else if (event.key === "Escape" && document.body.dataset.designMode === "true") {
        setDesignMode(false);
      }
    });

    setupLayoutEditor();
    setupCustomSelects();
    setupToolbarBandCollapse();
    const savedWorkspaceState = readSessionValue(workspaceSession.readUrl(), "地址中的配置无效")
      || readSessionValue(workspaceSession.readLocal(), "无法读取保存内容")
      || readSessionValue(workspaceSession.readEmbedded(), "工程配置无效");
    try { currentProject = JSON.parse(localStorage.getItem("dashboard-preset-preview:project:v1") || "null"); } catch { currentProject = null; }
    const workspaceRestored = restoreWorkspaceState(savedWorkspaceState);
    if (!workspaceRestored) selectPreset("fx-orange");
    savedWorkspaceSnapshot = JSON.stringify(createWorkspaceState());
    workspaceIsRestoring = false;
    currentRevision = currentProject?.revisions?.find(({ id }) => id === currentProject.currentRevisionId) || null;
    syncAiComposerScope();
    clearWorkspaceHistory();
    setWorkspaceDirty(false);
    if (!workspaceRestored) setSaveStatus("尚未保存配置");
    setDesignMode(new URLSearchParams(window.location.search).get("design") === "1", false);
    studioAuth.check();
    window.DashboardStudioBridge = Object.freeze({
      getAiComposerContext() {
        const component = selectedCardId ? workspaceComponentById(selectedCardId)?.component : null;
        const section = selectedSectionId ? workspaceDocument?.sections?.find(({ id }) => id === selectedSectionId) : null;
        return { target: component
          ? { kind: "component", id: component.id, title: component.title, type: component.type }
          : section ? { kind: "section", id: section.id, title: section.title, type: "section" } : null };
      },
      getExportContext() {
        return {
          title: dashboard.querySelector(".hero-title").textContent.trim() || "dashboard-report",
          project: currentProject ? structuredClone(currentProject) : null,
          revision: currentRevision ? structuredClone(currentRevision) : null,
          currentWorkspace: structuredClone(createWorkspaceState())
        };
      },
      setExportStatus(message) {
        setSaveStatus(String(message || ""));
      },
      getAiTransactionContext() {
        const component = selectedCardId ? workspaceComponentById(selectedCardId)?.component : null;
        const section = selectedSectionId ? workspaceDocument?.sections?.find(({ id }) => id === selectedSectionId) : null;
        return {
          language: state.language || "zh",
          target: component
            ? { kind: "component", id: component.id, title: component.title, type: component.type }
            : section ? { kind: "section", id: section.id, title: section.title, type: "section" } : null,
          dataSource: selectedDataSource ? { id: selectedDataSource.id, name: selectedDataSource.name } : null,
          currentWorkspace: structuredClone(createWorkspaceState()),
          project: currentProject ? structuredClone(currentProject) : null,
          revision: currentRevision ? structuredClone(currentRevision) : null
        };
      },
      applyAiPreview(workspace, target = null) {
        workspaceIsRestoring = true;
        let restored = false;
        try { restored = restoreWorkspaceState(structuredClone(workspace)); }
        finally { workspaceIsRestoring = false; }
        if (!restored) throw new Error("AI 预览无法进入当前编辑器");
        if (target?.id) {
          selectedCardId = target.kind === "component" ? target.id : null;
          selectedSectionId = target.kind === "section" ? target.id : null;
          updateCardContext();
        }
      },
      applyAiCommit(payload) {
        currentProject = structuredClone(payload.project);
        currentRevision = structuredClone(payload.revision);
        localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        scheduleWorkspaceSave();
        window.dispatchEvent(new Event("dashboard-project-change"));
      },
      applyAiUndo(payload) {
        workspaceIsRestoring = true;
        let restored = false;
        try { restored = restoreWorkspaceState(structuredClone(payload.workspace)); }
        finally { workspaceIsRestoring = false; }
        if (!restored) throw new Error("撤销版本无法进入当前编辑器");
        currentProject = structuredClone(payload.project);
        currentRevision = structuredClone(payload.revision);
        localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        persistWorkspaceState();
        window.dispatchEvent(new Event("dashboard-project-change"));
      },
      getAiHistoryContext() {
        return {
          project: currentProject ? structuredClone(currentProject) : null,
          currentWorkspace: structuredClone(createWorkspaceState()),
          currentRevisionId: currentRevision?.id || null
        };
      },
      applyRestoredRevision(payload) {
        workspaceIsRestoring = true;
        let restored = false;
        try { restored = restoreWorkspaceState(structuredClone(payload.workspace)); }
        finally { workspaceIsRestoring = false; }
        if (!restored) throw new Error("历史版本无法进入当前编辑器");
        currentProject = structuredClone(payload.project);
        currentRevision = structuredClone(payload.revision);
        localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        scheduleWorkspaceSave();
        syncAiComposerScope();
        window.dispatchEvent(new Event("dashboard-project-change"));
      },
      getSelectedDataSource: () => selectedDataSource ? structuredClone(selectedDataSource) : null,
      setSelectedDataSource(source) {
        selectedDataSource = source ? structuredClone(source) : null;
        window.dispatchEvent(new Event("dashboard-data-source-change"));
      },
      getCurrentProject: () => currentProject ? structuredClone(currentProject) : null,
      getActorRole: () => document.body.dataset.actorRole || "",
      isDirty: () => designSaveControl.classList.contains("is-dirty"),
      beginAiProject() {
        currentProject = null;
        currentRevision = null;
        localStorage.removeItem("dashboard-preset-preview:project:v1");
        selectCard(null);
        savedWorkspaceSnapshot = JSON.stringify(createWorkspaceState());
        clearWorkspaceHistory();
        setWorkspaceDirty(false);
        setSaveStatus("新 AI 项目草稿，描述业务目标后生成首稿");
        window.dispatchEvent(new Event("dashboard-project-change"));
      },
      ensureCurrentProject: () => ensureCurrentProjectOnServer(),
      async prepareRevision() {
        if (!createWorkspaceState().document) throw new Error("请先生成首稿，再导出或发布版本");
        await saveWorkspaceRevision();
        const workspace = createWorkspaceState();
        if (!currentProject?.id || !currentRevision || JSON.stringify(currentRevision.workspace) !== JSON.stringify(workspace)) throw new Error("当前修改尚未保存为项目版本");
        return { projectId: currentProject.id, revisionId: currentRevision.id };
      },
      async activateProject(project) {
        const revision = project?.revisions?.find(({ id }) => id === project.currentRevisionId);
        if (!revision) throw new Error("项目还没有可打开的版本");
        let restored = false;
        workspaceIsRestoring = true;
        try { restored = restoreWorkspaceState(revision.workspace); }
        finally { workspaceIsRestoring = false; }
        if (!restored) throw new Error("项目版本无法恢复");
        currentProject = project;
        currentRevision = revision;
        localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        savedWorkspaceSnapshot = JSON.stringify(createWorkspaceState());
        clearWorkspaceHistory();
        setWorkspaceDirty(false);
        syncAiComposerScope();
        setSaveStatus(`已打开 ${project.name}`);
        window.dispatchEvent(new Event("dashboard-project-change"));
      },
      updateCurrentProject(project) {
        if (currentProject?.id === project?.id) {
          currentProject = project;
          localStorage.setItem("dashboard-preset-preview:project:v1", JSON.stringify(currentProject));
        }
        window.dispatchEvent(new Event("dashboard-project-change"));
      }
    });
  
