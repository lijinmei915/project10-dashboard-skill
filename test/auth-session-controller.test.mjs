import assert from "node:assert/strict";
import test from "node:test";
import { createAuthSessionController } from "../studio/auth-session-controller.mjs";

function control() {
  const listeners = new Map();
  return {
    dataset: {}, hidden: false, disabled: false, required: false, value: "", textContent: "", type: "", autocomplete: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type, event = {}) { return listeners.get(type)?.({ preventDefault() {}, ...event }); },
    setAttribute(name, value) { this[name] = String(value); },
    focus() { this.focused = true; },
    replaceChildren() {}
  };
}

function response(payload) {
  return { ok: true, status: 200, headers: { get: () => null }, async json() { return payload; } };
}

test("background auth checks preserve the editor and only wake routing on authorization transitions", async () => {
  const controls = Object.fromEntries(["gate", "form", "email", "password", "name", "nameField", "submit", "status", "logout", "projectControl", "passwordToggle", "modeSwitch", "external", "providers", "title", "description", "retry", "recovery", "forgot"].map((key) => [key, control()]));
  const listeners = new Map();
  const readyEvents = [];
  const payloads = [
    { mode: "password", authenticated: true, actor: { role: "editor" } },
    { mode: "password", authenticated: true, actor: { role: "editor" } },
    { mode: "password", authenticated: false },
    { mode: "password", authenticated: true, actor: { role: "editor" } }
  ];
  class FakeCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const focusWindow = {
    CustomEvent: FakeCustomEvent,
    document: { body: { dataset: {} }, visibilityState: "visible", createElement: () => control() },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent(event) { if (event.type === "dashboard-auth-ready") readyEvents.push(event); else listeners.get(event.type)?.(event); },
    setTimeout(callback) { callback(); }
  };
  const controller = createAuthSessionController({
    ...controls,
    focusWindow,
    onActor() {},
    fetcher: async (url) => response(url === "/api/auth/status" ? payloads.shift() : { providers: [] })
  });

  await controller.check();
  assert.equal(controls.gate.hidden, true);
  assert.equal(readyEvents.length, 1);

  const backgroundCheck = controller.check({ background: true });
  assert.equal(controls.gate.hidden, true);
  await backgroundCheck;
  assert.equal(readyEvents.length, 1);

  await controller.check({ background: true });
  assert.equal(controls.gate.hidden, false);
  assert.equal(readyEvents.length, 1);

  await controller.check({ background: true });
  assert.equal(controls.gate.hidden, true);
  assert.equal(readyEvents.length, 2);
});
