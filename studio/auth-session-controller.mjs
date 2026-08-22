function responseError(payload, response, fallback) {
  const error = new Error(payload?.error || fallback);
  error.code = payload?.code || "request-failed";
  error.responseStatus = response.status;
  error.retryAfter = Number(response.headers?.get?.("retry-after")) || 0;
  return error;
}

function readableError(error, fallback) {
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(error?.message || "")) return "登录服务暂时不可用，请稍后重试";
  if (error?.code === "invalid-credentials") return "邮箱或密码不正确";
  if (error?.code === "account-exists") return "该邮箱已注册，请直接登录";
  if (error?.code === "password-policy") return "密码需为 10-128 个字符";
  if (error?.code === "rate-limited") return error.retryAfter > 0 ? `尝试次数过多，请在 ${error.retryAfter} 秒后重试` : "尝试次数过多，请稍后重试";
  if (error?.code === "auth-disabled") return "当前部署未启用个人账号登录";
  return error?.message || fallback;
}

export function createAuthSessionController({ gate, form, email, password, name, nameField, submit, status, logout, projectControl, passwordToggle, modeSwitch, external, providers, title, description, retry, recovery, forgot, onActor, fetcher = fetch, focusWindow = window } = {}) {
  if (![gate, form, email, password, name, nameField, submit, status, logout, projectControl, modeSwitch, title, description, retry, recovery, forgot].every(Boolean) || typeof onActor !== "function") throw new Error("Auth session controller requires Studio controls and an actor callback");
  let authMode = "disabled";
  let formMode = "login";
  let capabilities = { registration: false, passwordRecovery: false };
  let checkPromise = null;
  let routeReady = false;

  const setStatus = (message = "", tone = "error") => {
    status.textContent = message;
    status.dataset.tone = message ? tone : "";
  };
  const dispatchReady = (payload) => {
    const EventType = focusWindow.CustomEvent;
    if (typeof EventType === "function") focusWindow.dispatchEvent(new EventType("dashboard-auth-ready", { detail: payload }));
  };
  const setFormMode = (next) => {
    formMode = next === "register" ? "register" : "login";
    form.dataset.mode = formMode;
    nameField.hidden = formMode !== "register";
    name.required = formMode === "register";
    password.autocomplete = formMode === "register" ? "new-password" : "current-password";
    title.textContent = formMode === "register" ? "创建个人账号" : "登录你的工作台";
    description.textContent = formMode === "register" ? "注册后自动创建独立个人空间，你的项目和 AI 配置仅供自己使用。" : "访问你的项目、数据连接和个人 AI 配置。";
    submit.textContent = formMode === "register" ? "创建账号" : "登录";
    modeSwitch.textContent = formMode === "register" ? "已有账号？返回登录" : "没有账号？创建账号";
    modeSwitch.hidden = authMode !== "password" || !capabilities.registration;
    forgot.hidden = formMode !== "login" || authMode !== "password";
    setStatus();
  };
  const apply = (payload) => {
    authMode = payload.mode;
    capabilities = { registration: false, passwordRecovery: false, ...(payload.capabilities || {}) };
    const actor = payload.actor || null;
    const authorized = payload.mode === "disabled" || payload.authenticated;
    const shouldDispatchReady = authorized && !routeReady;
    routeReady = authorized;
    focusWindow.document.body.dataset.actorRole = actor?.role || "";
    gate.dataset.state = "ready";
    gate.hidden = payload.mode === "disabled" || payload.authenticated;
    logout.hidden = payload.mode === "disabled" || !payload.authenticated;
    projectControl.hidden = !(payload.mode === "disabled" || payload.authenticated);
    logout.title = actor ? `${actor.name} · 退出登录` : "退出登录";
    logout.setAttribute("aria-label", logout.title);
    recovery.hidden = true;
    retry.disabled = false;
    form.hidden = payload.mode === "token" || payload.mode === "oidc";
    external.dataset.visible = "false";
    if (payload.mode === "password") setFormMode(formMode);
    else {
      modeSwitch.hidden = true;
      forgot.hidden = true;
    }
    if (payload.mode === "token" && !payload.authenticated) setStatus("当前服务仍使用旧版访问令牌，请部署方切换为个人账号模式。");
    else setStatus();
    onActor(payload);
    if (shouldDispatchReady) dispatchReady(payload);
    if (!gate.hidden && payload.mode === "password") focusWindow.setTimeout(() => email.focus(), 0);
  };
  const loadProviders = async () => {
    if (!external || !providers) return;
    external.dataset.visible = "false";
    providers.replaceChildren();
    try {
      const response = await fetcher("/api/auth/oidc/providers", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.providers) || !payload.providers.length) return;
      providers.replaceChildren(...payload.providers.map((provider) => {
        const link = focusWindow.document.createElement("a");
        link.className = "studio-auth-provider";
        link.href = `/api/auth/oidc/${encodeURIComponent(provider.id)}/start?returnTo=${encodeURIComponent(focusWindow.location.pathname + focusWindow.location.search)}`;
        link.textContent = provider.name || provider.id;
        return link;
      }));
      external.dataset.visible = "true";
    } catch {}
  };
  const check = ({ background = false } = {}) => {
    if (checkPromise) return checkPromise;
    const preserveAuthorizedView = background && routeReady;
    if (!preserveAuthorizedView) {
      gate.hidden = false;
      gate.dataset.state = "checking";
      retry.disabled = true;
      setStatus("正在连接登录服务...", "info");
    }
    checkPromise = (async () => {
      try {
        const response = await fetcher("/api/auth/status", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw responseError(payload, response, "身份状态读取失败");
        apply(payload);
        await loadProviders();
        return payload;
      } catch (error) {
        if (preserveAuthorizedView) return null;
        gate.hidden = false;
        gate.dataset.state = "unavailable";
        title.textContent = "暂时无法登录";
        description.textContent = "登录服务当前不可用，你可以稍后重试。已填写的邮箱会保留。";
        form.hidden = true;
        external.dataset.visible = "false";
        recovery.hidden = false;
        retry.disabled = false;
        setStatus(readableError(error, "登录服务暂时不可用，请稍后重试"));
        return null;
      } finally {
        checkPromise = null;
      }
    })();
    return checkPromise;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authMode !== "password" || submit.disabled) return;
    submit.disabled = true;
    gate.dataset.state = "submitting";
    submit.textContent = formMode === "register" ? "正在创建账号..." : "正在登录...";
    setStatus(formMode === "register" ? "正在创建个人空间..." : "正在验证账号...", "info");
    try {
      const endpoint = formMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = { email: email.value.trim(), password: password.value, ...(formMode === "register" ? { name: name.value.trim() } : {}) };
      const response = await fetcher(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw responseError(payload, response, formMode === "register" ? "创建账号失败" : "登录失败");
      password.value = "";
      apply({ mode: "password", capabilities, ...payload });
    } catch (error) {
      gate.dataset.state = "ready";
      if (error?.code === "invalid-credentials") password.value = "";
      setStatus(readableError(error, formMode === "register" ? "创建账号失败" : "登录失败"));
      (error?.code === "account-exists" ? email : password).focus();
    } finally {
      submit.disabled = false;
      submit.textContent = formMode === "register" ? "创建账号" : "登录";
    }
  });
  modeSwitch.addEventListener("click", () => setFormMode(formMode === "login" ? "register" : "login"));
  forgot.addEventListener("click", () => setStatus(capabilities.passwordRecovery ? "请按密码找回流程继续操作。" : "当前部署尚未配置密码找回，请联系该 Studio 的维护者重置密码。", "info"));
  retry.addEventListener("click", () => { void check(); });
  passwordToggle?.addEventListener("click", () => {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    passwordToggle.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
    passwordToggle.setAttribute("aria-pressed", String(!visible));
    passwordToggle.title = visible ? "显示密码" : "隐藏密码";
  });
  logout.addEventListener("click", async () => {
    try { await fetcher("/api/auth/logout", { method: "POST" }); } catch {}
    apply({ mode: authMode, authenticated: false, capabilities });
  });
  focusWindow.addEventListener("focus", () => { if (focusWindow.document.visibilityState === "visible") void check({ background: true }); });
  setFormMode("login");
  return Object.freeze({ check, apply, setFormMode });
}
