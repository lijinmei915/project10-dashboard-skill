export function createAuthSessionController({ gate, form, token, submit, status, logout, projectControl, onActor, fetcher = fetch, focusWindow = window } = {}) {
  if (![gate, form, token, submit, status, logout, projectControl].every(Boolean) || typeof onActor !== "function") throw new Error("Auth session controller requires Studio controls and an actor callback");
  const apply = (payload) => {
    const actor = payload.actor || null;
    document.body.dataset.actorRole = actor?.role || "";
    gate.hidden = payload.mode === "disabled" || payload.authenticated;
    logout.hidden = payload.mode !== "token" || !payload.authenticated;
    projectControl.hidden = !(payload.mode === "disabled" || payload.authenticated);
    logout.title = actor ? `${actor.name} · ${actor.role} · 退出登录` : "退出登录";
    logout.setAttribute("aria-label", logout.title);
    onActor(payload);
    if (!gate.hidden) window.setTimeout(() => token.focus(), 0);
  };
  const check = async () => {
    try {
      const response = await fetcher("/api/auth/status", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "身份状态读取失败");
      apply(payload); return payload;
    } catch (error) {
      gate.hidden = false; status.textContent = error.message || "无法连接身份服务"; return null;
    }
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true; status.textContent = "正在建立安全会话...";
    try {
      const response = await fetcher("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.value }) });
      token.value = "";
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "登录失败");
      status.textContent = ""; apply({ mode: "token", ...payload });
    } catch (error) { token.value = ""; status.textContent = error.message || "登录失败"; token.focus(); }
    finally { submit.disabled = false; }
  });
  logout.addEventListener("click", async () => { try { await fetcher("/api/auth/logout", { method: "POST" }); } catch {} apply({ mode: "token", authenticated: false }); });
  focusWindow.addEventListener("focus", () => { if (document.visibilityState === "visible") check(); });
  return Object.freeze({ check, apply });
}
