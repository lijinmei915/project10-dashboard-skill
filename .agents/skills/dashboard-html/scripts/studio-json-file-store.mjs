import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createJsonFileStore({ directory, validateId = (id) => id }) {
  if (!directory) throw new Error("JSON file store directory is required");
  const fileFor = (id) => path.join(directory, `${validateId(id)}.json`);
  const ensureDirectory = () => mkdir(directory, { recursive: true });

  async function read(id) {
    try {
      return JSON.parse(await readFile(fileFor(id), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async function create(id, value) {
    await ensureDirectory();
    await writeFile(fileFor(id), json(value), { encoding: "utf8", flag: "wx", mode: 0o600 });
  }

  async function replace(id, value) {
    await ensureDirectory();
    const destination = fileFor(id);
    const temporary = `${destination}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await writeFile(temporary, json(value), { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  return Object.freeze({
    directory,
    fileFor,
    read,
    create,
    replace,
    async list() {
      await ensureDirectory();
      const ids = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort().map((file) => file.slice(0, -5));
      return Promise.all(ids.map(read));
    }
  });
}
