import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function createPublicationAccessRepository({ directory }) {
  if (!directory) throw new Error("Publication access repository directory is required");
  return {
    directory,
    async append({ publicationId, decision, reason, visibility, channel = "share", now = new Date().toISOString() }) {
      const event = { version: 1, id: `access-${randomUUID()}`, publicationId, occurredAt: now, decision, reason, visibility, channel };
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${event.occurredAt.replaceAll(":", "-")}-${event.id}.json`), `${JSON.stringify(event, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return structuredClone(event);
    },
    async list({ publicationId } = {}) {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort().reverse();
      const events = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), "utf8"))));
      return publicationId ? events.filter((event) => event.publicationId === publicationId) : events;
    }
  };
}
