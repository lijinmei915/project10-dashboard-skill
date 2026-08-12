function setText(element, value) {
  if (!element || value === undefined || value === null) return;
  element.removeAttribute("data-i18n");
  element.textContent = String(value);
}

function renderList(documentRef, card, items) {
  const riskList = card.querySelector(".risk-list");
  const ranking = card.querySelector(".ranking");
  if (riskList) {
    riskList.replaceChildren(...items.map((item) => {
      const row = documentRef.createElement("div");
      row.className = "risk-item";
      const label = documentRef.createElement("span");
      label.textContent = item.label;
      const value = documentRef.createElement("strong");
      value.textContent = item.value;
      row.append(label, value);
      return row;
    }));
  } else if (ranking) {
    const maximum = Math.max(1, ...items.map(({ value }) => Number(value) || 0));
    ranking.replaceChildren(...items.map((item, index) => {
      const row = documentRef.createElement("div");
      row.className = "ranking-row";
      const number = documentRef.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const label = documentRef.createElement("b");
      label.textContent = item.label;
      const bar = documentRef.createElement("span");
      bar.className = "rank-bar";
      bar.style.setProperty("--width", `${Math.max(0, Number(item.value) || 0) / maximum * 100}%`);
      row.append(number, label, bar);
      return row;
    }));
  }
}

function renderTable(documentRef, card, props) {
  const table = card.querySelector(".health-table");
  if (!table) return;
  table.replaceChildren(...[props.columns, ...props.rows].map((values, rowIndex) => {
    const row = documentRef.createElement("div");
    row.className = `health-row${rowIndex === 0 ? " health-row--head" : ""}`;
    values.forEach((value, columnIndex) => {
      const cell = documentRef.createElement(rowIndex > 0 && columnIndex === 0 ? "strong" : "span");
      cell.textContent = value;
      if (rowIndex > 0 && columnIndex === 2) cell.className = "health-score";
      if (rowIndex > 0 && columnIndex === 3) {
        cell.className = "health-state";
        if (value === "关注") cell.dataset.tone = "warning";
        if (value === "风险") cell.dataset.tone = "danger";
      }
      row.append(cell);
    });
    return row;
  }));
}

export function createWorkspaceRenderer({ document: documentRef, dashboard, escape = CSS.escape }) {
  return Object.freeze({
    render(documentModel) {
      setText(dashboard.querySelector(".hero-title"), documentModel.title);
      setText(dashboard.querySelector(".hero-kicker"), documentModel.subtitle || "AI GENERATED DASHBOARD");
      dashboard.querySelectorAll(".generated-data-label, .generated-data-separator").forEach((element) => element.remove());
      if (documentModel.sampleDataLabel) {
        const attribution = dashboard.querySelector(".hero-attribution");
        const separator = documentRef.createElement("span");
        separator.className = "attribution-separator generated-data-separator";
        separator.setAttribute("aria-hidden", "true");
        const sourceLabel = documentRef.createElement("span");
        sourceLabel.className = "attribution-item generated-data-label";
        sourceLabel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path></svg>';
        const sourceText = documentRef.createElement("span");
        sourceText.textContent = `数据来源：${documentModel.sampleDataLabel}`;
        sourceLabel.append(sourceText);
        attribution?.append(separator, sourceLabel);
      }
      documentModel.sections.forEach((sectionModel) => {
        const section = dashboard.querySelector(`[data-section-id="${escape(sectionModel.id)}"]`);
        if (!section) return;
        setText(section.querySelector(":scope > .section-heading h2"), sectionModel.title);
        setText(section.querySelector(":scope > .section-heading small"), sectionModel.subtitle === documentModel.sampleDataLabel ? "" : sectionModel.subtitle || "");
        sectionModel.components.forEach((component) => {
          const card = dashboard.querySelector(`[data-item-id="${escape(component.id)}"]`);
          if (!card) return;
          card.dataset.empty = String(component.props.empty === true);
          if (!card.querySelector(":scope > .component-empty-state")) {
            const empty = documentRef.createElement("p");
            empty.className = "component-empty-state";
            empty.textContent = "暂无匹配数据";
            card.append(empty);
          }
          setText(card.querySelector(".card-title > span:last-child, .metric-label, .summary-card-title > span:last-child"), component.title);
          const subtitle = card.querySelector(".panel-note");
          setText(subtitle?.querySelector(".card-subtitle-text") || subtitle, component.subtitle || "");
          if (component.type === "summary") {
            setText(card.querySelector(".summary-copy p"), component.props.body);
            setText(card.querySelector(".summary-score strong"), component.props.score);
            setText(card.querySelector(".summary-score span"), component.props.scoreLabel);
          } else if (component.type === "text") {
            let body = card.querySelector(":scope > .workspace-text-body");
            if (!body) {
              body = documentRef.createElement("p");
              body.className = "workspace-text-body";
              card.append(body);
            }
            setText(body, component.props.body);
          } else if (component.type === "kpi") {
            setText(card.querySelector(":scope > strong"), component.props.value);
            setText(card.querySelector(":scope > em"), component.props.trend || component.subtitle);
          } else if (component.type === "chart" && Array.isArray(component.props.values)) {
            const bars = [...card.querySelectorAll(".bar-chart .bar")];
            const maximum = Math.max(1, ...component.props.values);
            bars.forEach((bar, index) => {
              const value = component.props.values[index];
              bar.hidden = value === undefined;
              if (value !== undefined) bar.style.setProperty("--height", `${Math.max(4, value / maximum * 100)}%`);
            });
            const axis = card.querySelectorAll(".chart-axis span");
            setText(axis[0], component.props.labels?.[0] || "");
            setText(axis[1], component.props.labels?.at(-1) || "");
          } else if (component.type === "list" && Array.isArray(component.props.items)) {
            renderList(documentRef, card, component.props.items);
          } else if (component.type === "table") {
            renderTable(documentRef, card, component.props);
          }
        });
      });
    }
  });
}
