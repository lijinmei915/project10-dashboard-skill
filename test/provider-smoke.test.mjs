import assert from "node:assert/strict";
import test from "node:test";
import { runProviderSmoke } from "../.agents/skills/dashboard-html/scripts/provider-smoke.mjs";

test("remote provider smoke requires an explicit OpenAI configuration", async () => {
  await assert.rejects(() => runProviderSmoke({}), /DASHBOARD_AI_PROVIDER=openai/);
  await assert.rejects(() => runProviderSmoke({ DASHBOARD_AI_PROVIDER: "openai" }), /Remote provider is unavailable/);
});
