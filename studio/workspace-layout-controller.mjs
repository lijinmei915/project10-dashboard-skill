export function normalizeLayoutSpan(value, allowed, fallback = 12) {
  const numeric = Number(value);
  return allowed.includes(numeric) ? numeric : fallback;
}

export function createWorkspaceLayoutController({ document: documentRef, reportBody, summaryCard, groupMap, canvasNodes, canvasNodeId, applyCanvasOrder, refreshButtons, syncSelect, onChange }) {
  return Object.freeze({
    getConfig() {
      return {
        canvasOrder: canvasNodes(reportBody).sort((left, right) => Number(left.style.order) - Number(right.style.order)).map(canvasNodeId),
        summarySpan: Number(summaryCard.dataset.span) || 12,
        sections: [...reportBody.querySelectorAll(":scope > .section[data-section-id]")].map((section) => {
          const group = section.querySelector(":scope > .layout-group");
          return {
            id: section.dataset.sectionId,
            grouped: section.dataset.grouped === "true",
            span: Number(section.dataset.span) || 12,
            layout: group?.dataset.layout || null,
            items: group
              ? [...group.children].filter((child) => child.classList.contains("layout-item")).map((item) => ({ id: item.dataset.itemId, span: Number(item.dataset.span) }))
              : [...section.querySelectorAll(":scope > [data-item-id]")].map((item) => ({ id: item.dataset.itemId, span: Number(item.dataset.span) || 12 }))
          };
        })
      };
    },

    applyConfig(config) {
      const summarySpan = normalizeLayoutSpan(config.summarySpan, [3, 4, 6, 8, 9, 12]);
      summaryCard.dataset.span = String(summarySpan);
      summaryCard.style.setProperty("--item-span", summarySpan);
      const configuredSectionIds = new Set(config.sections?.map((section) => section.id) || []);
      config.sections?.forEach((sectionConfig) => {
        const section = [...reportBody.children].find((child) => child.dataset.sectionId === sectionConfig.id);
        if (!section) return;
        const defaultGrouped = section.dataset.sectionId === "metrics";
        section.dataset.grouped = String(typeof sectionConfig.grouped === "boolean" ? sectionConfig.grouped : defaultGrouped);
        const sectionSpan = normalizeLayoutSpan(sectionConfig.span, [4, 6, 8, 12]);
        section.dataset.span = String(sectionSpan);
        section.style.setProperty("--section-span", sectionSpan);
        reportBody.appendChild(section);
        const group = section.querySelector(":scope > .layout-group");
        if (!group) return;
        if (sectionConfig.layout) group.dataset.layout = sectionConfig.layout;
        sectionConfig.items?.forEach((itemConfig) => {
          const item = [...group.children].find((child) => child.dataset.itemId === itemConfig.id);
          if (!item) return;
          item.dataset.span = String(itemConfig.span);
          item.style.setProperty("--item-span", itemConfig.span);
          group.appendChild(item);
        });
      });
      [...reportBody.querySelectorAll(":scope > .section[data-section-id]")].forEach((section) => {
        if (!configuredSectionIds.has(section.dataset.sectionId)) reportBody.appendChild(section);
      });
      documentRef.querySelectorAll("[data-layout-group]").forEach((select) => {
        const group = groupMap.get(select.dataset.layoutGroup);
        if (!group) return;
        select.value = group.dataset.layout;
        syncSelect(select);
      });
      applyCanvasOrder(reportBody, config.canvasOrder);
      refreshButtons();
      onChange?.();
    }
  });
}
