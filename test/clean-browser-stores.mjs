import { rm } from "node:fs/promises";
import path from "node:path";

const storeNames = [
  "project-store",
  "data-source-store",
  "publication-store",
  "publication-access-store",
  "job-store",
  "refresh-schedule-store",
  "audit-store",
  "provider-profile-store",
  "provider-secret-store"
];

await Promise.all(
  storeNames.map((storeName) =>
    rm(path.resolve("test-results", storeName), { recursive: true, force: true })
  )
);
