export const WORKSPACE_STORAGE_KEY = "dashboard-preset-preview:v1";
export const WORKSPACE_PREVIOUS_KEY = "dashboard-preset-preview:previous:v1";
export const WORKSPACE_HISTORY_KEY = "dashboard-preset-preview:history:v1";
export const PROJECT_STATE_SCRIPT_ID = "dashboard-project-state";

function success(value) {
  return { ok: true, value };
}

function failure(code, error) {
  return { ok: false, code, error };
}

function parseJson(value, code) {
  if (!value) return success(null);
  try {
    return success(JSON.parse(value));
  } catch (error) {
    return failure(code, error);
  }
}

export function createWorkspaceSession({ storage, location, history, readEmbeddedState }) {
  return Object.freeze({
    readLocal() {
      try {
        return parseJson(storage.getItem(WORKSPACE_STORAGE_KEY), "LOCAL_INVALID");
      } catch (error) {
        return failure("LOCAL_UNAVAILABLE", error);
      }
    },

    readUrl() {
      try {
        const url = new URL(location.href);
        const encoded = url.searchParams.get("state")
          || new URLSearchParams(url.hash.slice(1)).get("config");
        return parseJson(encoded, "URL_INVALID");
      } catch (error) {
        return failure("URL_INVALID", error);
      }
    },

    writeUrl(workspace) {
      try {
        const url = new URL(location.href);
        url.searchParams.set("state", JSON.stringify({ ...workspace, logo: null }));
        const hash = new URLSearchParams(url.hash.slice(1));
        hash.delete("config");
        url.hash = hash.toString();
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        return success(null);
      } catch (error) {
        return failure("URL_WRITE_FAILED", error);
      }
    },

    readEmbedded() {
      try {
        return parseJson(readEmbeddedState?.() || null, "EMBEDDED_INVALID");
      } catch (error) {
        return failure("EMBEDDED_UNAVAILABLE", error);
      }
    },

    persistLocal(workspace) {
      try {
        const serialized = JSON.stringify(workspace);
        storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
        return success(serialized);
      } catch (error) {
        return failure("STORAGE_WRITE_FAILED", error);
      }
    },

    clearLegacyHistory() {
      try {
        storage.removeItem(WORKSPACE_HISTORY_KEY);
        storage.removeItem(WORKSPACE_PREVIOUS_KEY);
        return success(null);
      } catch (error) {
        return failure("STORAGE_CLEANUP_FAILED", error);
      }
    }
  });
}
