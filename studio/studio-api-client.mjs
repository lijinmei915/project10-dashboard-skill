function defaultErrorMessage(payload) {
  return payload?.error || "请求失败";
}

export function createStudioApiClient({ fetcher = fetch, errorMessage = defaultErrorMessage } = {}) {
  async function request(url, options) {
    const response = await fetcher(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(errorMessage(payload, response)), {
        status: response.status,
        payload
      });
    }
    return payload;
  }

  function get(url, options = {}) {
    return request(url, { ...options, method: "GET" });
  }

  function post(url, body, options = {}) {
    return request(url, {
      ...options,
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  function put(url, body, options = {}) {
    return request(url, {
      ...options,
      method: "PUT",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  function patch(url, body, options = {}) {
    return request(url, {
      ...options,
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  return Object.freeze({ request, get, post, put, patch });
}
