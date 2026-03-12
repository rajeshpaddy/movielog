(function () {
  if (window.AppSharedStore) return;

  const CONFIG_ERROR = 'Cloud storage is not configured. Set window.APP_SHARED_STORE_INDEX_BLOB_ID in shared-store-config.js to a JSONBlob index id.';
  const DEFAULT_SHARED_TTL_SECONDS = 7 * 24 * 60 * 60;
  const INDEX_VERSION = 1;

  function getConfiguredBaseUrl() {
    const baseUrl = String(window.APP_SHARED_STORE_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error(CONFIG_ERROR);
    }
    return baseUrl;
  }

  function getIndexBlobId() {
    const blobId = String(window.APP_SHARED_STORE_INDEX_BLOB_ID || '').trim();
    if (!blobId) {
      throw new Error(CONFIG_ERROR);
    }
    return blobId;
  }

  async function request(path = '', options = {}) {
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

  async function requestWithResponse(path = '', options = {}) {
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
        : `${options.method || 'GET'} ${path || '/'} failed (${response.status})${text ? `: ${text}` : ''}`;
      throw new Error(message);
    }

    return { response, payload };
  }

  function buildEntryKey(namespace, key) {
    return `${namespace}:${String(key || '').trim()}`;
  }

  function normalizeIndex(index) {
    if (!index || typeof index !== 'object') {
      return { version: INDEX_VERSION, entries: {} };
    }
    const entries = index.entries && typeof index.entries === 'object' ? index.entries : {};
    return {
      version: INDEX_VERSION,
      entries
    };
  }

  async function fetchIndex() {
    const payload = await request(`/${encodeURIComponent(getIndexBlobId())}`);
    return normalizeIndex(payload);
  }

  async function writeIndex(index) {
    return request(`/${encodeURIComponent(getIndexBlobId())}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(normalizeIndex(index))
    });
  }

  async function createBlob(content) {
    const { response } = await requestWithResponse('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(content)
    });
    const location = response.headers.get('Location') || response.headers.get('location') || '';
    const blobId = location.split('/').pop();
    if (!blobId) {
      throw new Error('JSONBlob did not return a blob id.');
    }
    return blobId;
  }

  async function updateBlob(blobId, content) {
    return request(`/${encodeURIComponent(blobId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(content)
    });
  }

  async function getBlob(blobId) {
    return request(`/${encodeURIComponent(blobId)}`);
  }

  async function deleteBlob(blobId) {
    return request(`/${encodeURIComponent(blobId)}`, { method: 'DELETE' });
  }

  async function getNamespaceContent(namespace, key) {
    const index = await fetchIndex();
    const entry = index.entries[buildEntryKey(namespace, key)];
    if (!entry || !entry.blobId) {
      throw new Error('Shared data not found.');
    }
    return getBlob(entry.blobId);
  }

  async function putNamespaceContent(namespace, key, content) {
    const index = await fetchIndex();
    const entryKey = buildEntryKey(namespace, key);
    const existing = index.entries[entryKey];
    const now = new Date().toISOString();

    if (existing && existing.blobId) {
      await updateBlob(existing.blobId, content);
      index.entries[entryKey] = {
        ...existing,
        updatedAt: now
      };
    } else {
      const blobId = await createBlob(content);
      index.entries[entryKey] = {
        blobId,
        namespace,
        key: String(key || '').trim(),
        createdAt: now,
        updatedAt: now
      };
    }

    await writeIndex(index);
    return index.entries[entryKey];
  }

  async function deleteNamespaceContent(namespace, key) {
    const index = await fetchIndex();
    const entryKey = buildEntryKey(namespace, key);
    const entry = index.entries[entryKey];
    if (entry && entry.blobId) {
      try {
        await deleteBlob(entry.blobId);
      } catch (error) {
        if (!String(error && error.message || '').includes('404')) {
          throw error;
        }
      }
      delete index.entries[entryKey];
      await writeIndex(index);
    }
  }

  window.AppSharedStore = {
    configError: CONFIG_ERROR,
    defaultSharedTtlSeconds: DEFAULT_SHARED_TTL_SECONDS,
    getBaseUrl: getConfiguredBaseUrl,
    getIndexBlobId,
    buildSharedKey(appId, keyword) {
      return `${String(appId || '').trim()}-${String(keyword || '').trim()}`;
    },
    buildSharedContentUrl(key) {
      return `${getConfiguredBaseUrl()}/${encodeURIComponent(getIndexBlobId())}#shared:${encodeURIComponent(key)}`;
    },
    getSharedContent(key) {
      return getNamespaceContent('shared', key);
    },
    putSharedContent(key, content, options = {}) {
      return putNamespaceContent('shared', key, content, options);
    },
    deleteSharedContent(key) {
      return deleteNamespaceContent('shared', key);
    },
    getTelemetry(key) {
      return getNamespaceContent('telemetry', key);
    },
    putTelemetry(key, content, options = {}) {
      return putNamespaceContent('telemetry', key, content, options);
    }
  };
})();
