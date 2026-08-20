import { createButton } from "/studio/ui-kit.mjs";

const $ = (selector, root = document) => root.querySelector(selector);

const providerApiBases = Object.freeze({
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1"
});

const phosphorIconCache = new Map();
function getPhosphorIconSvg(name, weight) {
  const key = `${name}:${weight}`;
  if (!phosphorIconCache.has(key)) {
    phosphorIconCache.set(key, fetch(`/api/icons/phosphor/${encodeURIComponent(name)}?weight=${encodeURIComponent(weight)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => payload?.svg || "")
      .catch(() => ""));
  }
  return phosphorIconCache.get(key);
}

function mountSelect(select, { isFavorite = () => false, toggleFavorite = () => {} } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "provider-form-select custom-select";
  wrapper.dataset.open = "false";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  const label = document.createElement("span");
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.classList.add("custom-select-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<path d="m6 9 6 6 6-6"/>';
  trigger.append(label, chevron);
  const list = document.createElement("div");
  list.className = "custom-select-listbox";
  list.setAttribute("role", "listbox");
  wrapper.append(trigger, list);
  const close = () => {
    wrapper.dataset.open = "false"; trigger.setAttribute("aria-expanded", "false");
    list.style.removeProperty("position"); list.style.removeProperty("left"); list.style.removeProperty("top"); list.style.removeProperty("width"); list.style.removeProperty("max-height");
  };
  const positionList = () => {
    if (wrapper.dataset.open !== "true") return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4; const viewportPadding = 8; const maxHeight = Math.min(280, window.innerHeight - viewportPadding * 2);
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const openAbove = spaceBelow < 180 && rect.top > spaceBelow;
    const height = Math.min(maxHeight, Math.max(120, openAbove ? rect.top - gap - viewportPadding : spaceBelow));
    list.style.position = "fixed";
    list.style.left = `${rect.left}px`;
    list.style.top = `${openAbove ? Math.max(viewportPadding, rect.top - gap - height) : rect.bottom + gap}px`;
    list.style.width = `${Math.round(rect.width)}px`;
    list.style.maxHeight = `${height}px`;
  };
  const render = () => {
    const options = [...select.options];
    const selected = options.find((option) => option.value === select.value) || options[0];
    label.textContent = selected?.textContent || "";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-expanded", String(wrapper.dataset.open === "true"));
    list.replaceChildren(...options.map((option) => {
      const item = document.createElement("div");
      item.className = "custom-select-option";
      item.dataset.favorite = String(isFavorite(option.value));
      item.setAttribute("role", "option"); item.setAttribute("aria-selected", String(option.value === select.value));
      const choose = document.createElement("button"); choose.type = "button"; choose.className = "custom-select-option-label"; choose.disabled = option.disabled; choose.textContent = option.textContent;
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      check.classList.add("custom-select-check"); check.setAttribute("viewBox", "0 0 24 24"); check.innerHTML = '<path d="m5 12 4 4L19 6"/>';
      const favorite = document.createElement("button"); favorite.type = "button"; favorite.className = "custom-select-favorite"; favorite.dataset.favorite = String(isFavorite(option.value)); favorite.setAttribute("aria-label", `${isFavorite(option.value) ? "移出常用模型" : "添加到常用模型"} ${option.textContent}`);
      Promise.all([getPhosphorIconSvg("star", "regular"), getPhosphorIconSvg("star", "fill")]).then(([regular, fill]) => {
        if (!favorite.isConnected) return;
        favorite.innerHTML = `<span class="custom-select-favorite-icon custom-select-favorite-icon-regular">${regular}</span><span class="custom-select-favorite-icon custom-select-favorite-icon-fill">${fill}</span>`;
      });
      choose.addEventListener("click", () => { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); close(); render(); });
      favorite.addEventListener("click", () => { toggleFavorite(option.value); render(); });
      item.append(choose, check, favorite);
      return item;
    }));
  };
  trigger.addEventListener("click", () => { if (trigger.disabled) return; wrapper.dataset.open = String(wrapper.dataset.open !== "true"); render(); positionList(); });
  window.addEventListener("resize", positionList);
  window.addEventListener("scroll", positionList, true);
  select.addEventListener("change", render);
  list.addEventListener("pointerdown", (event) => event.stopPropagation());
  document.addEventListener("pointerdown", (event) => { if (!wrapper.contains(event.target) && !list.contains(event.target)) close(); });
  render();
  return { render };
}

function connectionErrorMessage(error) {
  const message = String(error?.message || "").trim();
  const code = error?.code || error?.payload?.code;
  if (code === "provider_model_unavailable") return "Key 可用，但当前模型不在服务商列表中，请读取模型后重新选择";
  if (code === "provider_upstream" || message === "AI provider request failed") return "服务商拒绝了连接，请检查 API Key 是否有效或是否有访问权限";
  if (message === "AI provider credential is not configured") return "连接失败，尚未配置 API Key";
  return message || "当前连接不可用";
}

export function createProviderConnectionSettings({ root, request }) {
  if (!root || typeof request !== "function") throw new Error("Provider connection settings require a root and API client");

  const ui = {
    select: $("#organizationProviderSelect", root), status: $("#organizationProviderStatus", root), models: $("#organizationProviderModels", root), test: $("#organizationProviderTest", root), enabled: $("#organizationProviderEnabled", root), add: $("#organizationProviderAdd", root), edit: $("#organizationProviderEdit", root), modelList: $("#organizationProviderModelList", root), cards: $("#organizationProviderCards", root), currentName: $("#organizationProviderCurrentName", root), currentModel: $("#organizationProviderCurrentModel", root),
    editor: $("#providerProfileDialog", root), footer: $("#providerWorkspaceFooter", root), cancel: $("#providerProfileCancel", root), form: $("#providerProfileForm", root), title: $("#providerProfileDialogTitle", root), id: $("#providerProfileId", root), name: $("#providerProfileName", root), vendor: $("#providerProfileVendor", root), apiBase: $("#providerProfileApiBase", root), model: $("#providerProfileModel", root), modelCount: $("#providerProfileModelCount", root), favorites: $("#providerProfileFavorites", root), favoriteList: $("#providerProfileFavoriteList", root), customModel: $("#providerProfileCustomModel", root), customModelField: $("#providerProfileCustomModelField", root), loadModels: $("#providerProfileLoadModels", root), apiKey: $("#providerProfileApiKey", root), formStatus: $("#providerProfileStatus", root)
  };
  if (Object.values(ui).some((element) => !element)) throw new Error("Provider connection settings markup is incomplete");

  let profiles = [];
  let editable = false;
  let selectedProfileId = "";
  let favoriteModels = [];
  const connectionHealth = new Map();
  const providerTypeControl = mountSelect(ui.vendor);
  const favoriteStorageKey = () => `dashboard-provider-favorites:${selectedProfileId || ui.id.value || "new"}`;
  const modelStorageKey = () => `dashboard-provider-models:${selectedProfileId || ui.id.value || "new"}`;
  function readFavorites() {
    try { return JSON.parse(localStorage.getItem(favoriteStorageKey()) || "[]").filter((model) => typeof model === "string"); } catch { return []; }
  }
  function writeFavorites() { try { localStorage.setItem(favoriteStorageKey(), JSON.stringify(favoriteModels)); } catch {} }
  function readModels() {
    try { return JSON.parse(localStorage.getItem(modelStorageKey()) || "[]").filter((model) => typeof model === "string"); } catch { return []; }
  }
  function writeModels(models) { try { localStorage.setItem(modelStorageKey(), JSON.stringify(models)); } catch {} }
  function toggleFavorite(model) {
    if (!model || model === "__custom") return;
    favoriteModels = favoriteModels.includes(model) ? favoriteModels.filter((item) => item !== model) : [...favoriteModels, model].slice(-8);
    writeFavorites(); renderFavorites();
  }
  const modelControl = mountSelect(ui.model, { isFavorite: (model) => favoriteModels.includes(model), toggleFavorite });

  function activeHealth(profile) {
    return profile ? connectionHealth.get(profile.id) || { status: "untested", message: "" } : { status: "untested", message: "" };
  }

  function setModelOptions(models = [], selected = "", { counted = false } = {}) {
    const options = [...new Set(models.filter(Boolean))];
    writeModels(options);
    ui.model.replaceChildren(...options.map((model) => new Option(model, model)), new Option("自定义", "__custom"));
    if (selected && options.includes(selected)) ui.model.value = selected;
    else if (selected) { ui.model.value = "__custom"; ui.customModel.value = selected; }
    else ui.model.value = options[0] || "__custom";
    ui.customModelField.hidden = ui.model.value !== "__custom";
    ui.customModel.required = ui.model.value === "__custom";
    modelControl.render();
    ui.modelCount.textContent = counted && options.length ? `已读取 ${options.length} 个` : "尚未读取";
    if (options.length) favoriteModels = [...new Set(favoriteModels.filter((model) => options.includes(model)))];
    writeFavorites();
    renderFavorites();
  }

  function renderFavorites() {
    ui.favorites.hidden = favoriteModels.length === 0;
    ui.favoriteList.replaceChildren(...favoriteModels.map((model) => {
      const item = document.createElement("div"); item.className = "provider-favorite"; item.dataset.selected = String(ui.model.value === model);
      const select = document.createElement("button"); select.type = "button"; select.className = "provider-favorite-select"; select.textContent = model; select.title = model;
      select.addEventListener("click", () => { ui.model.value = model; ui.model.dispatchEvent(new Event("change", { bubbles: true })); modelControl.render(); renderFavorites(); });
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "provider-favorite-remove"; remove.setAttribute("aria-label", `移出常用模型 ${model}`); remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
      remove.addEventListener("click", () => { favoriteModels = favoriteModels.filter((itemModel) => itemModel !== model); writeFavorites(); renderFavorites(); });
      item.append(select, remove); return item;
    }));
  }

  function closeEditor() {
    ui.editor.hidden = true;
    ui.footer.hidden = true;
    ui.form.reset();
    ui.id.value = "";
  }

  function openEditor(profile = null, { focus = true } = {}) {
    if (!editable) return;
    ui.editor.hidden = false;
    ui.footer.hidden = false;
    ui.title.textContent = profile ? `基础设置 · ${profile.name}` : "新增连接";
    ui.id.value = profile?.id || `provider-${Date.now()}`;
    ui.name.value = profile?.name || "";
    selectedProfileId = profile?.id || ui.id.value;
    favoriteModels = readFavorites();
    ui.apiBase.value = profile?.apiBase || "";
    ui.vendor.value = profile ? "custom" : "openai";
    if (!profile) ui.apiBase.value = providerApiBases.openai;
    ui.apiBase.required = true;
    ui.apiBase.placeholder = "https://gateway.example/v1";
    const cachedModels = readModels();
    setModelOptions(cachedModels.length ? cachedModels : (profile?.model ? [profile.model] : []), profile?.model || "", { counted: cachedModels.length > 0 });
    ui.apiKey.value = "";
    ui.apiKey.required = !profile;
    providerTypeControl.render();
    ui.formStatus.textContent = "";
    if (focus) ui.name.focus({ preventScroll: true });
  }

  function render(nextProfiles, managed) {
    profiles = nextProfiles;
    editable = managed;
    ui.select.replaceChildren(...profiles.map((profile) => new Option(
      `${profile.name} · ${profile.model || "无模型"}${profile.credentialConfigured ? "" : " · 未配置密钥"}`,
      profile.id, profile.active, profile.active
    )));
    const enabledProfile = profiles.find(({ active: isActive, builtIn }) => isActive && !builtIn);
    const active = profiles.find(({ id }) => id === selectedProfileId) || enabledProfile || profiles.find(({ builtIn }) => !builtIn) || profiles[0];
    selectedProfileId = active?.id || "";
    ui.select.value = selectedProfileId;
    const health = activeHealth(active);
    ui.status.dataset.tone = health.status === "unavailable" ? "danger" : "";
    ui.status.textContent = health.message;
    ui.currentName.textContent = active?.name || "暂无连接";
    ui.currentModel.textContent = active ? `${active.model || "无模型"} · ${active.active ? "已启用" : "未启用"} · ${active.credentialConfigured ? "Key 已保存" : "未保存 Key"}` : "无模型";
    ui.cards.replaceChildren(...profiles.filter(({ builtIn }) => !builtIn).map((profile) => {
      const card = document.createElement("div"); card.className = "provider-connection-card"; card.dataset.active = String(Boolean(profile.active)); card.dataset.health = activeHealth(profile).status;
      const main = createButton("", { className: "provider-connection-main", variant: "ghost", ariaLabel: `选择并配置连接 ${profile.name}` });
      const name = document.createElement("strong"); name.textContent = profile.name;
      main.append(name);
      main.addEventListener("click", async () => {
        if (!profile.active) { ui.select.value = profile.id; await activate(); }
        openEditor(profiles.find(({ id }) => id === profile.id) || profile);
      });
      const removeButton = createButton("", { className: "provider-card-delete", variant: "ghost", ariaLabel: `删除连接 ${profile.name}` });
      removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
      removeButton.addEventListener("click", (event) => { event.stopPropagation(); remove(profile); });
      card.append(main, removeButton); return card;
    }), (() => {
      const add = createButton("+", { className: "provider-connections-add", variant: "outline", ariaLabel: "新增连接" });
      add.addEventListener("click", () => openEditor()); return add;
    })());
    ui.select.disabled = !managed || profiles.length < 2;
    ui.models.disabled = !managed || !active?.credentialConfigured || active?.builtIn;
    ui.test.disabled = !managed || !active?.credentialConfigured || active?.builtIn;
    ui.enabled.checked = Boolean(enabledProfile);
    ui.enabled.disabled = !managed || !active?.credentialConfigured || active?.builtIn;
    ui.add.disabled = !managed;
    ui.edit.disabled = !managed || !active || active.builtIn;
    ui.modelList.textContent = "";
  }

  async function load() {
    ui.status.dataset.tone = "";
    ui.status.textContent = "正在读取连接...";
    const payload = await request("/api/ai-providers", { cache: "no-store" });
    render(payload.profiles || [], payload.managed || false);
    return profiles;
  }

  async function activate() {
    ui.select.disabled = true;
    ui.status.dataset.tone = ""; ui.status.textContent = "正在切换连接...";
    try {
      const payload = await request("/api/ai-providers/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: ui.select.value }) });
      render(payload.profiles, true);
      const active = profiles.find(({ active }) => active);
      const health = activeHealth(active);
      ui.status.dataset.tone = health.status === "unavailable" ? "danger" : "";
      ui.status.textContent = health.message;
    } catch (error) {
      ui.status.textContent = error.message;
      await load().catch(() => {});
    }
  }

  async function toggleEnabled() {
    const profile = profiles.find(({ id }) => id === ui.select.value);
    if (!profile || profile.builtIn) return;
    ui.enabled.disabled = true;
    if (!ui.enabled.checked) {
      ui.status.textContent = "正在关闭连接...";
      try {
        const payload = await request("/api/ai-providers/deactivate", { method: "POST" });
        connectionHealth.delete(profile.id); render(payload.profiles, true);
        ui.status.textContent = "已关闭，AI 生成将使用本地演示模式";
      } catch (error) { ui.enabled.checked = true; ui.status.textContent = error.message; ui.enabled.disabled = false; }
      return;
    }
    ui.status.textContent = "正在校验连接...";
    try {
      const { result } = await request("/api/ai-providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id }) });
      connectionHealth.set(profile.id, { status: "available", message: `连接正常 · ${result.model}` });
      const payload = await request("/api/ai-providers/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id }) });
      render(payload.profiles, true); ui.status.textContent = `已开启 · ${result.model}`;
    } catch (error) {
      let availableModels = null;
      if ((error?.code || error?.payload?.code) === "provider_model_unavailable") {
        try {
          const result = await request(`/api/ai-providers/models?profileId=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
          availableModels = result.models || [];
        } catch {}
      }
      connectionHealth.set(profile.id, { status: "unavailable", message: connectionErrorMessage(error) });
      render(profiles, editable); ui.enabled.checked = false; ui.status.dataset.tone = "danger"; ui.status.textContent = connectionErrorMessage(error);
      if (availableModels) {
        setModelOptions(availableModels, profile.model, { counted: true });
        ui.formStatus.textContent = `已读取 ${availableModels.length} 个模型，请重新选择后保存`;
      }
    }
  }

  async function probeModels() {
    ui.loadModels.disabled = true;
    ui.formStatus.textContent = "正在获取可用模型...";
    const payload = { profileId: ui.id.value };
    if (ui.apiBase.value.trim()) payload.apiBase = ui.apiBase.value.trim();
    if (ui.apiKey.value.trim()) payload.apiKey = ui.apiKey.value.trim();
    try {
      const result = await request("/api/ai-providers/models/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const current = ui.model.value === "__custom" ? ui.customModel.value.trim() : ui.model.value;
      setModelOptions(result.models || [], result.models?.includes(current) ? current : "", { counted: true });
      ui.formStatus.textContent = result.models?.length ? `已获取 ${result.models.length} 个模型` : "接口没有返回模型，可选择自定义";
    } catch (error) {
      setModelOptions([], ui.customModel.value.trim());
      ui.formStatus.textContent = `${error.message}；可选择自定义模型`;
    } finally { ui.loadModels.disabled = false; }
  }

  async function save(event) {
    event.preventDefault();
    const model = ui.model.value === "__custom" ? ui.customModel.value.trim() : ui.model.value;
    const body = { id: ui.id.value, name: ui.name.value.trim(), model };
    if (ui.apiBase.value.trim()) body.apiBase = ui.apiBase.value.trim();
    if (ui.apiKey.value.trim()) body.apiKey = ui.apiKey.value.trim();
    ui.formStatus.textContent = "正在保存连接...";
    try {
      let payload = await request("/api/ai-providers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!payload.profiles.find(({ id }) => id === body.id)?.active) payload = await request("/api/ai-providers/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: body.id }) });
      render(payload.profiles, true);
      openEditor(payload.profiles.find(({ id }) => id === body.id));
      ui.formStatus.textContent = "连接已保存并启用";
      ui.status.textContent = "连接已保存并启用";
    } catch (error) { ui.formStatus.textContent = error.message; }
  }

  ui.form.addEventListener("invalid", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    const label = field.closest("label")?.querySelector("span, b")?.textContent?.trim() || field.getAttribute("aria-label") || "必填项";
    ui.formStatus.dataset.tone = "danger";
    ui.formStatus.textContent = `请先填写${label}`;
  }, true);

  async function remove(selectedProfile = null) {
    const profile = selectedProfile || profiles.find(({ id }) => id === ui.id.value) || profiles.find(({ id }) => id === ui.select.value);
    if (!profile || profile.builtIn || !window.confirm(`删除“${profile.name}”？保存的连接密钥也会一并删除。`)) return;
    ui.status.textContent = "正在删除连接...";
    try {
      const payload = await request(`/api/ai-providers/${encodeURIComponent(profile.id)}`, { method: "DELETE" });
      render(payload.profiles, true); closeEditor();
      ui.status.textContent = payload.profiles[0]?.builtIn ? "已删除，当前使用本地演示模式" : "连接已删除";
    } catch (error) { ui.status.textContent = error.message; }
  }

  async function test() {
    ui.test.disabled = true;
    const profileId = ui.select.value;
    ui.status.dataset.tone = ""; ui.status.textContent = "正在测试连接...";
    try {
      const { result } = await request("/api/ai-providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: ui.select.value }) });
      connectionHealth.set(profileId, { status: "available", message: result.success ? `连接正常 · ${result.model}` : "连接失败" });
      render(profiles, editable);
    } catch (error) {
      connectionHealth.set(profileId, { status: "unavailable", message: connectionErrorMessage(error) });
      render(profiles, editable);
    }
    finally { ui.test.disabled = false; }
  }

  async function listModels() {
    ui.models.disabled = true; ui.modelList.textContent = "正在读取可用模型...";
    try {
      const { models = [] } = await request(`/api/ai-providers/models?profileId=${encodeURIComponent(ui.select.value)}`, { cache: "no-store" });
      ui.modelList.textContent = models.length ? `可用模型：${models.slice(0, 12).join("、")}${models.length > 12 ? ` 等 ${models.length} 个` : ""}` : "接口没有返回可用模型";
    } catch (error) { ui.modelList.textContent = error.message; }
    finally { ui.models.disabled = false; }
  }

  ui.select.addEventListener("change", activate);
  ui.test.addEventListener("click", test);
  ui.enabled.addEventListener("change", toggleEnabled);
  ui.models.addEventListener("click", listModels);
  ui.add.addEventListener("click", () => openEditor());
  ui.edit.addEventListener("click", () => openEditor(profiles.find(({ id }) => id === ui.select.value)));
  ui.cancel.addEventListener("click", () => {
    const active = profiles.find(({ active, builtIn }) => active && !builtIn);
    if (active) openEditor(active, { focus: false });
    else closeEditor();
  });
  ui.form.addEventListener("submit", save);
  const markFormDirty = () => {
    if (ui.editor.hidden) return;
    ui.formStatus.dataset.tone = "";
    ui.formStatus.textContent = "有未保存修改";
  };
  ui.form.addEventListener("input", markFormDirty);
  ui.form.addEventListener("change", markFormDirty);
  ui.loadModels.addEventListener("click", probeModels);
  ui.vendor.addEventListener("change", () => {
    const apiBase = providerApiBases[ui.vendor.value];
    if (apiBase) ui.apiBase.value = apiBase;
    ui.apiBase.placeholder = ui.vendor.value === "custom" ? "https://gateway.example/v1" : apiBase;
  });
  ui.model.addEventListener("change", () => {
    ui.customModelField.hidden = ui.model.value !== "__custom";
    ui.customModel.required = ui.model.value === "__custom";
    if (!ui.customModelField.hidden) ui.customModel.focus();
    renderFavorites();
  });

  return Object.freeze({
    close: closeEditor,
    load,
    openActive({ focus = false } = {}) {
      const active = profiles.find(({ active, builtIn }) => active && !builtIn);
      if (active) openEditor(active, { focus });
    }
  });
}
