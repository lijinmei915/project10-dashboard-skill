import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { assertSessionRepository, createMemorySessionRepository } from "./studio-session-repository.mjs";

const roles = new Set(["admin", "editor", "viewer"]);
const scrypt = promisify(scryptCallback);

async function passwordHash(password) {
  const value = String(password || "");
  if (value.length < 10 || value.length > 128) throw new AuthError("密码需为 10-128 个字符", 422, "password-policy");
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function passwordMatches(password, encoded) {
  const [algorithm, n, r, p, salt, expected] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, "base64url");
  const actual = await scrypt(String(password || ""), Buffer.from(salt, "base64url"), expectedBytes.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function organizationId(value) {
  const normalized = String(value || "default").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalized)) throw new Error("organizationId must use 1-128 letters, numbers, dots, underscores, or hyphens");
  return normalized;
}

export class AuthError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function tokenHash(value) {
  return createHash("sha256").update(String(value || "")).digest();
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function createStudioAuthService({ mode = "disabled", users = [], accountRepository = null, sessionTtlMs = 8 * 60 * 60 * 1000, secureCookies = false, clock = () => Date.now(), sessionRepository: configuredSessionRepository = null, organizationService = null } = {}) {
  if (!["disabled", "password", "token", "oidc"].includes(mode)) throw new Error("DASHBOARD_AUTH_MODE must be disabled, password, token, or oidc");
  if (mode === "password" && !accountRepository) throw new Error("Password auth requires an account repository");
  const identities = users.map((user) => {
    if (!user?.id || !user?.name || !roles.has(user.role) || (mode === "token" && !user.token)) throw new Error(`Each ${mode} auth user requires id, name, role${mode === "token" ? ", and token" : ""}`);
    return { actor: { id: String(user.id), name: String(user.name), role: user.role, organizationId: organizationId(user.organizationId) }, hash: user.token ? tokenHash(user.token) : null };
  });
  if ((mode === "token" || mode === "oidc") && !identities.length) throw new Error(`${mode === "token" ? "Token" : "OIDC"} auth requires at least one configured user`);
  const sessionRepository = assertSessionRepository(configuredSessionRepository || createMemorySessionRepository({ clock }));
  const sessionCapabilities = Object.freeze({ durable: false, shared: false, multiInstance: false, ...(sessionRepository.capabilities || {}) });
  const cookieName = "dashboard_session";
  const sessionKey = (sessionId) => createHash("sha256").update(sessionId).digest("hex");
  const resolveOrganizationActor = async (actor) => organizationService ? organizationService.resolveActor(actor) : actor;
  const actorFor = async (actorId, actorOrganizationId) => {
    if (mode === "password") {
      const account = await accountRepository.findById(actorId);
      if (account?.status === "active" && account.organizationId === organizationId(actorOrganizationId)) return { id: account.id, name: account.name, role: "editor", organizationId: account.organizationId };
      return null;
    }
    const identity = identities.find(({ actor }) => actor.id === String(actorId) && actor.organizationId === organizationId(actorOrganizationId));
    if (identity) return structuredClone(identity.actor);
    if (organizationService?.resolveMemberActor) return organizationService.resolveMemberActor(actorId, actorOrganizationId);
    return null;
  };
  const issueSession = async (actor) => {
    const resolved = await resolveOrganizationActor(actor);
    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = clock() + Math.max(60_000, sessionTtlMs);
    await sessionRepository.prune(clock());
    await sessionRepository.put(sessionKey(sessionId), { actorId: resolved.id, organizationId: resolved.organizationId, expiresAt });
    return {
      actor: structuredClone(resolved),
      expiresAt: new Date(expiresAt).toISOString(),
      cookie: `${cookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict${secureCookies ? "; Secure" : ""}; Max-Age=${Math.floor((expiresAt - clock()) / 1000)}`
    };
  };
  const sessionFromRequest = async (request) => {
    if (mode === "disabled") return { actor: await resolveOrganizationActor({ id: "local-admin", name: "Local Admin", role: "admin", organizationId: "local" }), expiresAt: null };
    const sessionId = parseCookies(request.headers.cookie || "")[cookieName];
    if (!sessionId) return null;
    const key = sessionKey(sessionId);
    const stored = await sessionRepository.get(key);
    if (!stored || stored.expiresAt <= clock()) {
      if (stored) await sessionRepository.delete(key);
      return null;
    }
    const actor = await actorFor(stored.actorId, stored.organizationId);
    if (!actor) {
      await sessionRepository.delete(key);
      return null;
    }
    return { actor: await resolveOrganizationActor(actor), expiresAt: stored.expiresAt };
  };
  return {
    mode,
    capabilities: Object.freeze({ registration: mode === "password", passwordRecovery: false }),
    sessionProvider: sessionRepository.provider || "custom",
    sessionCapabilities,
    async readiness() {
      if (mode === "disabled") return { status: "ok", mode, provider: "disabled", capabilities: { durable: false, shared: false, multiInstance: false } };
      try {
        await sessionRepository.probe();
        return { status: "ok", mode, provider: sessionRepository.provider || "custom", capabilities: sessionCapabilities };
      } catch {
        return { status: "error", mode, provider: sessionRepository.provider || "custom", capabilities: sessionCapabilities, error: "probe-failed" };
      }
    },
    async status(request) {
      const session = await sessionFromRequest(request);
      return { mode, authenticated: Boolean(session), capabilities: { registration: mode === "password", passwordRecovery: false }, ...(session ? { actor: structuredClone(session.actor), expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null } : {}) };
    },
    async directory(actor) {
      if (!actor) throw new AuthError("Authentication required", 401, "unauthenticated");
      if (organizationService) return organizationService.directory(actor);
      if (mode === "disabled") return [structuredClone(actor)];
      return identities.filter(({ actor: identity }) => identity.organizationId === actor.organizationId).map(({ actor: identity }) => structuredClone(identity));
    },
    async login(token) {
      if (mode !== "token") throw new AuthError("Authentication is disabled", 409, "auth-disabled");
      const actual = tokenHash(token);
      const identity = identities.find(({ hash }) => hash && hash.length === actual.length && timingSafeEqual(hash, actual));
      if (!identity) throw new AuthError("Invalid access token", 401, "invalid-credentials");
      return issueSession(identity.actor);
    },
    async register({ email, name, password }) {
      if (mode !== "password") throw new AuthError("账号注册未启用", 409, "auth-disabled");
      const hash = await passwordHash(password);
      let account;
      try { account = await accountRepository.create({ email, name, passwordHash: hash }); }
      catch (error) {
        if (error?.code === "account-exists") throw new AuthError("该邮箱已注册", 409, "account-exists");
        throw new AuthError(error.message || "注册失败", 422, "invalid-account");
      }
      return issueSession({ id: account.id, name: account.name, role: "editor", organizationId: account.organizationId });
    },
    async loginWithPassword({ email, password }) {
      if (mode !== "password") throw new AuthError("账号登录未启用", 409, "auth-disabled");
      let account = null;
      try { account = await accountRepository.findByEmail(email, { includePasswordHash: true }); } catch {}
      if (!account || account.status !== "active" || !await passwordMatches(password, account.passwordHash)) throw new AuthError("邮箱或密码不正确", 401, "invalid-credentials");
      return issueSession({ id: account.id, name: account.name, role: "editor", organizationId: account.organizationId });
    },
    async actor(actorId, actorOrganizationId) {
      return actorFor(actorId, actorOrganizationId);
    },
    async loginActor(actor) {
      if (mode !== "oidc") throw new AuthError("OIDC authentication is disabled", 409, "oidc-disabled");
      const identity = await this.actor(actor?.id, actor?.organizationId);
      if (!identity) throw new AuthError("OIDC member is unavailable", 403, "oidc-member-unavailable");
      return issueSession(identity);
    },
    async logout(request) {
      const sessionId = parseCookies(request.headers.cookie || "")[cookieName];
      if (sessionId) await sessionRepository.delete(sessionKey(sessionId));
      return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict${secureCookies ? "; Secure" : ""}; Max-Age=0`;
    },
    async revokeActorSessions(actorId, actorOrganizationId) {
      return sessionRepository.deleteByActor(String(actorId), organizationId(actorOrganizationId));
    },
    async authorize(request, { write = false, expectedOrigin } = {}) {
      const session = await sessionFromRequest(request);
      if (!session) throw new AuthError("Authentication required", 401, "unauthenticated");
      if (write && session.actor.role === "viewer") throw new AuthError("Editor role is required", 403, "forbidden");
      if ((mode === "password" || mode === "token" || mode === "oidc") && request.method !== "GET") {
        const origin = request.headers.origin;
        if (!origin || origin !== expectedOrigin) throw new AuthError("Request origin is not allowed", 403, "csrf");
      }
      return structuredClone(session.actor);
    }
  };
}
