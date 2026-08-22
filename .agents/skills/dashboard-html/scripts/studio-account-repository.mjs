import { createHash, randomUUID } from "node:crypto";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的邮箱地址");
  return email;
}

function storageId(email) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function publicAccount(account) {
  if (!account) return null;
  const { passwordHash, ...value } = account;
  return structuredClone(value);
}

export function createAccountRepository({ directory, clock = () => Date.now() } = {}) {
  const store = createJsonFileStore({ directory, validateId: (id) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Account storage id is invalid");
    return id;
  } });
  return Object.freeze({
    provider: "file",
    async findByEmail(email, { includePasswordHash = false } = {}) {
      const account = await store.read(storageId(email));
      return includePasswordHash ? account : publicAccount(account);
    },
    async findById(id) {
      const accounts = await store.list();
      return publicAccount(accounts.find((account) => account.id === String(id)) || null);
    },
    async create({ email, name, passwordHash }) {
      const normalizedEmail = normalizeEmail(email);
      const normalizedName = String(name || "").trim();
      if (!normalizedName || normalizedName.length > 80) throw new Error("姓名长度需为 1-80 个字符");
      if (!passwordHash) throw new Error("Password hash is required");
      const id = randomUUID();
      const createdAt = new Date(clock()).toISOString();
      const account = { id, email: normalizedEmail, name: normalizedName, passwordHash, organizationId: `personal-${id}`, status: "active", createdAt, updatedAt: createdAt };
      try {
        await store.create(storageId(normalizedEmail), account);
      } catch (error) {
        if (error?.code === "EEXIST") throw Object.assign(new Error("该邮箱已注册"), { code: "account-exists" });
        throw error;
      }
      return publicAccount(account);
    },
    async probe() {
      await store.list();
      return true;
    }
  });
}
