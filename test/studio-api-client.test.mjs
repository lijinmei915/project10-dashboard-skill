import assert from "node:assert/strict";
import test from "node:test";
import { createStudioApiClient } from "../studio/studio-api-client.mjs";

function response({ ok = true, status = 200, payload, jsonError } = {}) {
  return {
    ok,
    status,
    async json() {
      if (jsonError) throw jsonError;
      return payload;
    }
  };
}

test("returns JSON payloads and preserves request options", async () => {
  const calls = [];
  const client = createStudioApiClient({
    fetcher: async (...args) => {
      calls.push(args);
      return response({ payload: { projects: [] } });
    }
  });

  assert.deepEqual(await client.request("/api/projects", { cache: "no-store" }), { projects: [] });
  assert.deepEqual(calls, [["/api/projects", { cache: "no-store" }]]);
});

test("returns an empty object when a successful response has no JSON body", async () => {
  const client = createStudioApiClient({ fetcher: async () => response({ jsonError: new Error("empty body") }) });
  assert.deepEqual(await client.request("/api/health"), {});
});

test("adds status and payload to API failures and allows a domain error message", async () => {
  const client = createStudioApiClient({
    fetcher: async () => response({ ok: false, status: 422, payload: { issues: [{ message: "指标字段无效" }] } }),
    errorMessage: (payload) => payload.issues?.[0]?.message || "请求失败"
  });

  await assert.rejects(
    () => client.request("/api/data-sources/import"),
    (error) => error.message === "指标字段无效" && error.status === 422 && error.payload.issues.length === 1
  );
});

test("builds standard JSON mutation requests without dropping caller headers", async () => {
  const calls = [];
  const client = createStudioApiClient({
    fetcher: async (...args) => {
      calls.push(args);
      return response({ payload: { ok: true } });
    }
  });

  await client.get("/api/projects", { cache: "no-store", method: "POST" });
  await client.post("/api/projects", { name: "项目 A" }, { headers: { "X-Request-Id": "request-1" } });
  await client.put("/api/projects/project-a", undefined);
  await client.patch("/api/projects/project-a", { name: "项目 B" });

  assert.deepEqual(calls[0], ["/api/projects", { cache: "no-store", method: "GET" }]);
  assert.deepEqual(calls[1], ["/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-Id": "request-1" },
    body: '{"name":"项目 A"}'
  }]);
  assert.deepEqual(calls[2], ["/api/projects/project-a", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: undefined
  }]);
  assert.deepEqual(calls[3], ["/api/projects/project-a", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: '{"name":"项目 B"}'
  }]);
});
