(function () {
  if (window.AppSharedStore) return;

  const CONFIG_ERROR = 'Cloud storage is not configured. Deploy the Cloudflare Worker and set window.APP_SHARED_STORE_BASE_URL in shared-store-config.js.';
  const DEFAULT_SHARED_TTL_SECONDS = 7 * 24 * 60 * 60;

  function getConfiguredBaseUrl() {
    const baseUrl = String(window.APP_SHARED_STORE_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error(CONFIG_ERROR);
    }
    return baseUrl;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${getConfiguredBaseUrl()}${path}`, {
      cache: 'no-store',
      ...options
    });
    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload && typeof payload.error === 'string'
        ? payload.error
        : `${options.method || 'GET'} ${path} failed (${response.status})${text ? `: ${text}` : ''}`;
      throw new Error(message);
    }

    return payload;
  }

  function buildPath(namespace, key) {
    return `/v1/${namespace}/${encodeURIComponent(String(key || '').trim())}`;
  }

  async function getNamespaceContent(namespace, key) {
    const payload = await requestJson(buildPath(namespace, key));
    return payload && typeof payload === 'object' ? payload.content ?? null : null;
  }

  async function putNamespaceContent(namespace, key, content, options = {}) {
    const body = { content };
    if (Number.isFinite(options.ttlSeconds) && options.ttlSeconds > 0) {
      body.ttlSeconds = Math.floor(options.ttlSeconds);
    }

    return requestJson(buildPath(namespace, key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(options.keepalive)
    });
  }

  async function deleteNamespaceContent(namespace, key) {
    return requestJson(buildPath(namespace, key), { method: 'DELETE' });
  }

  window.AppSharedStore = {
    configError: CONFIG_ERROR,
    defaultSharedTtlSeconds: DEFAULT_SHARED_TTL_SECONDS,
    getBaseUrl: getConfiguredBaseUrl,
    buildSharedKey(appId, keyword) {
      return `${String(appId || '').trim()}-${String(keyword || '').trim()}`;
    },
    buildSharedContentUrl(key) {
      return `${getConfiguredBaseUrl()}${buildPath('shared', key)}`;
    },
    async getSharedBlobUrl(key) {
      return `${getConfiguredBaseUrl()}${buildPath('shared', key)}`;
    },
    getSharedContent(key) {
      return getNamespaceContent('shared', key);
    },
    putSharedContent(key, content, options = {}) {
      return putNamespaceContent('shared', key, content, {
        ttlSeconds: options.ttlSeconds ?? DEFAULT_SHARED_TTL_SECONDS,
        keepalive: options.keepalive
      });
    },
    deleteSharedContent(key) {
      return deleteNamespaceContent('shared', key);
    },
    getTelemetry(key) {
      return getNamespaceContent('telemetry', key);
    },
    async getTelemetryBlobUrl(key) {
      return `${getConfiguredBaseUrl()}${buildPath('telemetry', key)}`;
    },
    putTelemetry(key, content, options = {}) {
      return putNamespaceContent('telemetry', key, content, options);
    }
  };
})();
