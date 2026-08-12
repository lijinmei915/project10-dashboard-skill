// Small DOM primitives for Studio chrome. Generated dashboard HTML does not use this module.
export function createButton(label, { className = "", ariaLabel = "", variant = "default" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ["studio-ui-button", `studio-ui-button--${variant}`, className].filter(Boolean).join(" ");
  button.textContent = label;
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  return button;
}

export function createSelect(options, { value = "", ariaLabel = "", className = "" } = {}) {
  const select = document.createElement("select");
  select.className = ["studio-ui-select", className].filter(Boolean).join(" ");
  if (ariaLabel) select.setAttribute("aria-label", ariaLabel);
  options.forEach(({ value: optionValue, label }) => select.add(new Option(label, optionValue, false, optionValue === value)));
  return select;
}

export function setPressed(button, pressed) {
  button.setAttribute("aria-pressed", String(Boolean(pressed)));
}
