function safeReceipt(value) {
  const receipt = String(value || "").trim();
  if (!receipt) return null;
  if (receipt.length > 256 || /[\u0000-\u001f\u007f]/.test(receipt)) throw Object.assign(new Error("Audit anchor receipt is invalid"), { code: "rejected" });
  return receipt;
}

function requiredHttpsUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("DASHBOARD_AUDIT_ANCHOR_URL must be a valid HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("DASHBOARD_AUDIT_ANCHOR_URL must be an HTTPS URL without credentials or fragment");
  return url;
}

export function createHttpAuditAnchorSink({ url, bearerToken = null, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const endpoint = requiredHttpsUrl(url);
  if (typeof fetchImpl !== "function") throw new Error("Audit anchor sink requires fetch");
  const token = bearerToken == null ? null : String(bearerToken);
  if (token !== null && (!token || token.length > 4_096 || /[\u0000-\u001f\u007f]/.test(token))) throw new Error("DASHBOARD_AUDIT_ANCHOR_AUTH_TOKEN is invalid");
  return Object.freeze({
    type: "https",
    async append(anchor) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(60_000, Number(timeoutMs) || 15_000)));
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(anchor)
        });
        if (!response.ok) throw Object.assign(new Error("Audit anchor sink rejected delivery"), { code: "http-rejected" });
        const headerReceipt = response.headers.get("x-audit-anchor-receipt");
        if (headerReceipt) return { receiptReference: safeReceipt(headerReceipt) };
        const body = await response.text();
        if (!body) return { receiptReference: null };
        if (body.length > 4_096) throw Object.assign(new Error("Audit anchor sink receipt is oversized"), { code: "rejected" });
        try { return { receiptReference: safeReceipt(JSON.parse(body)?.receiptReference) }; } catch { throw Object.assign(new Error("Audit anchor sink response is invalid"), { code: "rejected" }); }
      } catch (error) {
        if (error?.name === "AbortError") throw Object.assign(new Error("Audit anchor sink timed out"), { code: "timeout" });
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  });
}

export function createConfiguredAuditAnchorSink({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!environment.DASHBOARD_AUDIT_ANCHOR_URL) return null;
  return createHttpAuditAnchorSink({
    url: environment.DASHBOARD_AUDIT_ANCHOR_URL,
    bearerToken: environment.DASHBOARD_AUDIT_ANCHOR_AUTH_TOKEN || null,
    timeoutMs: Number(environment.DASHBOARD_AUDIT_ANCHOR_TIMEOUT_MS) || 15_000,
    fetchImpl
  });
}
