const PORTS = Object.freeze({
  projects: ["get", "list", "update", "listOutbox", "acknowledgeOutbox"],
  dataSources: ["get", "list", "put", "update"],
  publications: ["get", "list", "put", "update", "listOutbox", "acknowledgeOutbox"],
  publicationAccess: ["append", "list"],
  jobs: ["get", "list", "put", "update"],
  refreshSchedules: ["get", "list", "put", "update"],
  organizations: ["get", "list", "put", "update"],
  audit: ["append", "list"]
});

function assertPort(name, repository, methods) {
  if (!repository) throw new Error(`Storage repository is required: ${name}`);
  const missing = methods.filter((method) => typeof repository[method] !== "function");
  if (missing.length) throw new Error(`Storage repository ${name} is missing methods: ${missing.join(", ")}`);
}

const fileCapabilities = Object.freeze({
  durable: true,
  shared: false,
  multiInstance: false,
  conditionalWrites: "process-local",
  transactions: "single-project-file",
  transactionalOutbox: "project-and-publication-embedded",
  productionReady: false
});

export function createStorageRuntime({ provider = "file", repositories, capabilities = {} } = {}) {
  if (!repositories) throw new Error("Storage repositories are required");
  for (const [name, methods] of Object.entries(PORTS)) assertPort(name, repositories[name], methods);
  const resolvedCapabilities = Object.freeze({ ...(provider === "file" ? fileCapabilities : {}), ...capabilities });
  for (const required of ["durable", "shared", "multiInstance", "conditionalWrites", "transactions", "transactionalOutbox", "productionReady"]) {
    if (resolvedCapabilities[required] === undefined) throw new Error(`Storage capability is required: ${required}`);
  }
  for (const required of ["durable", "shared", "multiInstance", "productionReady"]) {
    if (typeof resolvedCapabilities[required] !== "boolean") throw new Error(`Storage capability must be boolean: ${required}`);
  }
  if (resolvedCapabilities.productionReady && (!resolvedCapabilities.durable || !resolvedCapabilities.shared || !resolvedCapabilities.multiInstance || resolvedCapabilities.conditionalWrites === "process-local")) {
    throw new Error("Production-ready storage requires durable shared multi-instance conditional writes");
  }

  return Object.freeze({
    provider,
    capabilities: resolvedCapabilities,
    async readiness() {
      const probes = [
        ["projects", () => repositories.projects.list()],
        ["projectOutbox", () => repositories.projects.listOutbox()],
        ["dataSources", () => repositories.dataSources.list()],
        ["publications", () => repositories.publications.list()],
        ["publicationOutbox", () => repositories.publications.listOutbox()],
        ["publicationAccess", () => repositories.publicationAccess.list()],
        ["jobs", () => repositories.jobs.list()],
        ["refreshSchedules", () => repositories.refreshSchedules.list()],
        ["organizations", () => repositories.organizations.list()],
        ["audit", () => repositories.audit.list({ limit: 1 })]
      ];
      const settled = await Promise.allSettled(probes.map(([, probe]) => probe()));
      const checks = settled.map((result, index) => ({
        name: probes[index][0],
        status: result.status === "fulfilled" ? "ok" : "error",
        ...(result.status === "rejected" ? { error: "probe-failed" } : {})
      }));
      return {
        status: checks.every(({ status }) => status === "ok") ? "ok" : "error",
        provider,
        deployment: resolvedCapabilities.productionReady ? "managed" : "local-only",
        capabilities: resolvedCapabilities,
        checks
      };
    }
  });
}

export { PORTS as STORAGE_PORTS };
