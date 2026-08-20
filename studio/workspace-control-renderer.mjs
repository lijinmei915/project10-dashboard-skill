export function resolveFilterValue(filter, filters = {}) {
  return filters[filter.id] ?? filter.defaultValue;
}

export function resolveActiveView(control, activeView) {
  return control.props.items.find(({ id }) => id === activeView)
    || control.props.items.find(({ id }) => id === control.props.defaultValue)
    || control.props.items[0];
}

function createDashboardFilterSelect(documentRef, filter, value, onChange) {
  const wrapper = documentRef.createElement("div");
  wrapper.className = "dashboard-filter-select custom-select";
  wrapper.dataset.open = "false";
  const trigger = documentRef.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const label = documentRef.createElement("span");
  const chevron = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.classList.add("custom-select-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = "<path d=\"m6 9 6 6 6-6\"/>";
  trigger.append(label, chevron);
  const list = documentRef.createElement("div");
  list.className = "custom-select-listbox";
  list.setAttribute("role", "listbox");
  wrapper.append(trigger, list);
  let selected = String(value);
  const close = () => { wrapper.dataset.open = "false"; trigger.setAttribute("aria-expanded", "false"); };
  const render = () => {
    const current = filter.options.find((option) => String(option.value) === selected);
    label.textContent = current?.label || selected;
    list.replaceChildren(...filter.options.map((option) => {
      const item = documentRef.createElement("button"); item.type = "button"; item.className = "custom-select-option";
      item.setAttribute("role", "option"); item.setAttribute("aria-selected", String(String(option.value) === selected));
      const text = documentRef.createElement("span"); text.textContent = option.label;
      const check = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg"); check.classList.add("custom-select-check"); check.setAttribute("viewBox", "0 0 24 24"); check.innerHTML = "<path d=\"m5 12 4 4L19 6\"/>";
      item.append(text, check);
      item.addEventListener("click", () => { selected = String(option.value); close(); render(); onChange?.(option.value); });
      return item;
    }));
  };
  trigger.addEventListener("click", () => { const open = wrapper.dataset.open !== "true"; wrapper.dataset.open = String(open); trigger.setAttribute("aria-expanded", String(open)); });
  documentRef.addEventListener("pointerdown", (event) => { if (!wrapper.contains(event.target)) close(); }, true);
  render();
  return wrapper;
}

export function createWorkspaceControlRenderer({ document: documentRef, dashboard, escape = CSS.escape, onFilterChange, onViewChange }) {
  const markTargetsPending = (targets) => {
    targets.forEach((targetId) => {
      const target = dashboard.querySelector(`[data-section-id="${escape(targetId)}"], [data-item-id="${escape(targetId)}"]`);
      const section = target?.matches(".section") ? target : target?.closest(".section");
      if (section) section.dataset.filterPending = "true";
    });
  };

  const activateView = (tabs, control, viewId) => {
    const active = resolveActiveView(control, viewId);
    const visible = new Set(active.sectionIds);
    tabs.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.dashboardView === active.id;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    dashboard.querySelectorAll(".section[data-section-id]").forEach((section) => {
      section.hidden = !visible.has(section.dataset.sectionId);
    });
    return active.id;
  };

  return Object.freeze({
    render(controls = [], interactions = { filters: {} }) {
      const container = dashboard.querySelector("#dashboardControls");
      if (!container) return;
      container.replaceChildren();
      dashboard.querySelectorAll(".dashboard-card-header-controls").forEach((slot) => slot.remove());
      controls.forEach((control) => {
        if (control.type === "filter-bar") {
          const bar = documentRef.createElement("div");
          bar.className = "dashboard-filter-bar";
          bar.dataset.surface = control.props.surface || "plain";
          bar.dataset.targets = control.props.targets.join(" ");
          control.props.controls.forEach((filter) => {
            const label = documentRef.createElement("label");
            label.className = "dashboard-filter";
            const caption = documentRef.createElement("span");
            caption.textContent = filter.label;
            const select = createDashboardFilterSelect(documentRef, filter, resolveFilterValue(filter, interactions.filters), (value) => {
              markTargetsPending(control.props.targets);
              onFilterChange?.({ filterId: filter.id, value, targets: [...control.props.targets] });
            });
            label.append(caption, select);
            bar.append(label);
          });
          const placement = control.props.placement;
          const targetCard = placement?.kind === "component-header" ? dashboard.querySelector(`[data-item-id="${escape(placement.targetId)}"]`) : null;
          if (targetCard) {
            bar.classList.add("dashboard-filter-bar--component-header");
            let slot = targetCard.querySelector(":scope > .dashboard-card-header-controls");
            if (!slot) { slot = documentRef.createElement("div"); slot.className = "dashboard-card-header-controls"; targetCard.prepend(slot); }
            slot.append(bar);
          } else container.append(bar);
        } else if (control.type === "view-tabs") {
          const tabs = documentRef.createElement("div");
          tabs.className = "dashboard-view-tabs";
          tabs.setAttribute("role", "tablist");
          tabs.setAttribute("aria-label", "视图切换");
          control.props.items.forEach((item) => {
            const button = documentRef.createElement("button");
            button.type = "button";
            button.setAttribute("role", "tab");
            button.dataset.dashboardView = item.id;
            button.dataset.sectionIds = item.sectionIds.join(" ");
            button.textContent = item.label;
            button.addEventListener("click", () => {
              const viewId = activateView(tabs, control, item.id);
              onViewChange?.({ viewId });
            });
            tabs.append(button);
          });
          container.append(tabs);
          const viewId = activateView(tabs, control, interactions.activeView);
          onViewChange?.({ viewId, initial: true });
        }
      });
      if (!controls.some(({ type }) => type === "view-tabs")) {
        dashboard.querySelectorAll(".section[data-section-id]").forEach((section) => { section.hidden = false; });
      }
    }
  });
}
