import { createJsonFileStore } from "./studio-json-file-store.mjs";
import { createOpenAICompatibleProvider, ProviderError } from "./provider-gateway.mjs";

const safeId = (value, field = "id") => {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ProviderError(`AI provider ${field} is invalid`, { code: "provider_configuration", httpStatus: 422 });
  return id;
};

const text = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

function endpoint(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new ProviderError("AI provider endpoint is invalid", { code: "provider_configuration", httpStatus: 422 }); }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new ProviderError("AI provider endpoint must use HTTPS", { code: "provider_configuration", httpStatus: 422 });
  return url.toString().replace(/\/+$/, "");
}

function normalizeProfile(input, existing = null) {
  const id = safeId(input?.id || existing?.id, "profile id");
  const name = text(input?.name ?? existing?.name, 120);
  const model = text(input?.model ?? existing?.model, 200);
  const apiBase = endpoint(input?.apiBase ?? existing?.apiBase);
  if (!name || !model) throw new ProviderError("AI provider profile is incomplete", { code: "provider_configuration", httpStatus: 422 });
  return { id, name, provider: "openai-compatible", apiBase, model };
}

function publicProfiles(document, secrets) {
  return (document?.profiles || []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    model: profile.model,
    active: profile.id === document.activeProfileId,
    credentialConfigured: Boolean(secrets?.[profile.id])
  }));
}

export function createProviderProfileRepository({ configurationDirectory, secretDirectory } = {}) {
  if (!configurationDirectory || !secretDirectory) throw new Error("Provider profile repository directories are required");
  const configurations = createJsonFileStore({ directory: configurationDirectory, validateId: (id) => safeId(id, "organization id") });
  const secrets = createJsonFileStore({ directory: secretDirectory, validateId: (id) => safeId(id, "organization id") });
  return Object.freeze({
    async read(organizationId) {
      const id = safeId(organizationId, "organization id");
      return { configuration: await configurations.read(id), secrets: await secrets.read(id) || {} };
    },
    async write(organizationId, configuration, secretValues) {
      const id = safeId(organizationId, "organization id");
      await configurations.replace(id, configuration);
      await secrets.replace(id, secretValues);
    }
  });
}

export function createOrganizationProviderManager({ repository, fallbackProvider, fetchImpl = globalThis.fetch, timeoutMs = 45_000 } = {}) {
  if (!repository || !fallbackProvider || typeof fetchImpl !== "function") throw new Error("Organization provider manager dependencies are required");
  const locks = new Map();
  const serialize = (organizationId, operation) => {
    const previous = locks.get(organizationId) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    locks.set(organizationId, next);
    return next.finally(() => { if (locks.get(organizationId) === next) locks.delete(organizationId); });
  };
  const read = (organizationId) => repository.read(safeId(organizationId, "organization id"));
  const active = async (organizationId) => {
    const state = await read(organizationId);
    const profile = state.configuration?.profiles?.find(({ id }) => id === state.configuration.activeProfileId);
    if (!profile) return fallbackProvider;
    return createOpenAICompatibleProvider({ apiKey: state.secrets[profile.id], model: profile.model, apiBase: profile.apiBase, timeoutMs, fetchImpl, profileId: profile.id });
  };
  const profileFor = async (organizationId, profileId) => {
    const state = await read(organizationId);
    const profile = state.configuration?.profiles?.find(({ id }) => id === safeId(profileId, "profile id"));
    if (!profile) throw new ProviderError("AI provider profile was not found", { code: "provider_configuration", httpStatus: 404 });
    const key = state.secrets[profile.id];
    if (!key) throw new ProviderError("AI provider credential is not configured", { code: "provider_configuration", httpStatus: 503 });
    return { state, profile, key };
  };
  const request = async (organizationId, profileId, suffix, options = {}) => {
    const { profile, key } = await profileFor(organizationId, profileId);
    const response = await fetchImpl(`${profile.apiBase}${suffix}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ProviderError("AI provider request failed", { code: "provider_upstream", httpStatus: response.status === 429 ? 429 : response.status >= 500 ? 502 : 502, retryable: response.status === 429 || response.status >= 500 });
    return { payload, profile };
  };
  const modelsFrom = (payload) => [...new Set((payload?.data || []).map(({ id }) => text(id, 200)).filter(Boolean))].sort();

  return Object.freeze({
    id: "organization-profiles",
    kind: "remote",
    configured: true,
    organizations: true,
    async profiles(organizationId) {
      const state = await read(organizationId);
      if (!state.configuration?.profiles?.length) return [{ id: fallbackProvider.id, name: "本地演示模式", provider: fallbackProvider.id, model: fallbackProvider.model || null, active: true, credentialConfigured: true, builtIn: true }];
      return publicProfiles(state.configuration, state.secrets);
    },
    upsert(organizationId, input) {
      return serialize(safeId(organizationId, "organization id"), async () => {
        const state = await read(organizationId);
        const profiles = [...(state.configuration?.profiles || [])];
        const index = profiles.findIndex(({ id }) => id === String(input?.id || "").trim());
        const profile = normalizeProfile(input, index >= 0 ? profiles[index] : null);
        if (index >= 0) profiles[index] = profile; else profiles.push(profile);
        const secretValues = { ...state.secrets };
        const apiKey = String(input?.apiKey || "").trim();
        if (apiKey) secretValues[profile.id] = apiKey;
        if (!secretValues[profile.id]) throw new ProviderError("AI provider credential is required", { code: "provider_configuration", httpStatus: 422 });
        const configuration = { schemaVersion: "dashboard.ai-providers.v1", activeProfileId: state.configuration?.activeProfileId || profile.id, profiles };
        await repository.write(organizationId, configuration, secretValues);
        return publicProfiles(configuration, secretValues);
      });
    },
    activate(organizationId, profileId) {
      return serialize(safeId(organizationId, "organization id"), async () => {
        const state = await read(organizationId);
        const id = safeId(profileId, "profile id");
        if (!state.configuration?.profiles?.some((profile) => profile.id === id)) throw new ProviderError("AI provider profile was not found", { code: "provider_configuration", httpStatus: 404 });
        const configuration = { ...state.configuration, activeProfileId: id };
        await repository.write(organizationId, configuration, state.secrets);
        return publicProfiles(configuration, state.secrets);
      });
    },
    remove(organizationId, profileId) {
      return serialize(safeId(organizationId, "organization id"), async () => {
        const state = await read(organizationId);
        const id = safeId(profileId, "profile id");
        const profiles = (state.configuration?.profiles || []).filter((profile) => profile.id !== id);
        if (profiles.length === (state.configuration?.profiles || []).length) throw new ProviderError("AI provider profile was not found", { code: "provider_configuration", httpStatus: 404 });
        const secretValues = { ...state.secrets }; delete secretValues[id];
        const configuration = profiles.length ? { ...state.configuration, activeProfileId: state.configuration.activeProfileId === id ? profiles[0].id : state.configuration.activeProfileId, profiles } : null;
        await repository.write(organizationId, configuration, secretValues);
        return configuration ? publicProfiles(configuration, secretValues) : [{ id: fallbackProvider.id, name: "本地演示模式", provider: fallbackProvider.id, model: fallbackProvider.model || null, active: true, credentialConfigured: true, builtIn: true }];
      });
    },
    async discoverModels(organizationId, profileId) {
      const { payload } = await request(organizationId, profileId, "/models", { method: "GET" });
      return modelsFrom(payload);
    },
    async probeModels(organizationId, input = {}) {
      const state = await read(organizationId);
      const existing = state.configuration?.profiles?.find(({ id }) => id === String(input.profileId || "").trim());
      const apiBase = endpoint(input.apiBase || existing?.apiBase);
      const key = String(input.apiKey || state.secrets?.[existing?.id] || "").trim();
      if (!key) throw new ProviderError("AI provider credential is required", { code: "provider_configuration", httpStatus: 422 });
      const response = await fetchImpl(`${apiBase}/models`, { method: "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new ProviderError("AI provider request failed", { code: "provider_upstream", httpStatus: response.status === 429 ? 429 : 502, retryable: response.status === 429 || response.status >= 500 });
      return modelsFrom(payload);
    },
    async testConnection(organizationId, profileId) {
      const { payload, profile } = await request(organizationId, profileId, "/chat/completions", { method: "POST", body: JSON.stringify({ model: (await profileFor(organizationId, profileId)).profile.model, messages: [{ role: "user", content: "Reply with OK only." }], temperature: 0 }) });
      if (!text(payload?.choices?.[0]?.message?.content, 80)) throw new ProviderError("AI provider returned no test response", { code: "provider_protocol" });
      return { profileId: profile.id, model: profile.model, success: true };
    },
    async generateCandidate(input) { return (await active(input?.providerContext?.organizationId)).generateCandidate(input); },
    async repairCandidate(input) { return (await active(input?.providerContext?.organizationId)).repairCandidate(input); }
  });
}
