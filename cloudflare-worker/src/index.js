const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function emptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: JSON_HEADERS
  });
}

function makeStorageKey(namespace, key) {
  return `${namespace}:${key}`;
}

function hashAppId(value) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function buildTelemetryPrefix(appId) {
  const compactApp = String(appId || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'app';
  return makeStorageKey('telemetry', `aat-${compactApp}-${hashAppId(appId)}-`);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new Error('Request body must be valid JSON.');
  }
}

function normalizeKey(rawKey) {
  const key = decodeURIComponent(String(rawKey || '')).trim();
  if (!key) {
    throw new Error('Key is required.');
  }
  if (key.length > 256) {
    throw new Error('Key is too long.');
  }
  return key;
}

async function handleGet(env, namespace, key) {
  const stored = await env.SHARED_STORE.get(makeStorageKey(namespace, key), 'json');
  if (!stored || typeof stored !== 'object') {
    return jsonResponse({ error: 'Not found.' }, 404);
  }

  return jsonResponse({
    ok: true,
    key,
    content: stored.content ?? null,
    updatedAt: stored.updatedAt || null,
    expiresAt: stored.expiresAt || null
  });
}

async function handlePut(request, env, namespace, key) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || !('content' in body)) {
    return jsonResponse({ error: 'Request body must include content.' }, 400);
  }

  const ttlSeconds = Number.isFinite(body.ttlSeconds) ? Math.floor(body.ttlSeconds) : null;
  if (ttlSeconds !== null && ttlSeconds <= 0) {
    return jsonResponse({ error: 'ttlSeconds must be greater than 0.' }, 400);
  }

  const now = new Date().toISOString();
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  const value = {
    content: body.content,
    updatedAt: now,
    expiresAt
  };

  const options = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await env.SHARED_STORE.put(makeStorageKey(namespace, key), JSON.stringify(value), options);

  return jsonResponse({
    ok: true,
    key,
    updatedAt: now,
    expiresAt
  });
}

async function handleDelete(env, namespace, key) {
  await env.SHARED_STORE.delete(makeStorageKey(namespace, key));
  return emptyResponse();
}

async function handleTelemetrySummary(url, env) {
  const appIds = url.searchParams.getAll('appId')
    .map(value => String(value || '').trim())
    .filter(Boolean);

  if (appIds.length === 0) {
    return jsonResponse({ error: 'At least one appId query parameter is required.' }, 400);
  }

  const summaries = {};

  for (const appId of appIds) {
    const prefix = buildTelemetryPrefix(appId);
    let cursor = undefined;
    let total = 0;
    let matchedKeys = 0;

    do {
      const listing = await env.SHARED_STORE.list({ prefix, cursor, limit: 1000 });
      for (const keyInfo of listing.keys) {
        const stored = await env.SHARED_STORE.get(keyInfo.name, 'json');
        const content = stored && typeof stored === 'object' ? stored.content : null;
        if (content && typeof content === 'object') {
          total += Number(content.hitCount || 0);
          matchedKeys += 1;
        }
      }
      cursor = listing.list_complete ? undefined : listing.cursor;
    } while (cursor);

    summaries[appId] = {
      hitCount: total,
      matchedKeys
    };
  }

  return jsonResponse({
    ok: true,
    summaries
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return emptyResponse();
    }

    const url = new URL(request.url);
    if (url.pathname === '/v1/telemetry-summary' && request.method === 'GET') {
      return handleTelemetrySummary(url, env);
    }

    const match = url.pathname.match(/^\/v1\/(shared|telemetry)\/(.+)$/);
    if (!match) {
      return jsonResponse({ error: 'Not found.' }, 404);
    }

    let key;
    try {
      key = normalizeKey(match[2]);
    } catch (error) {
      return jsonResponse({ error: error.message || 'Invalid key.' }, 400);
    }

    const namespace = match[1];

    if (request.method === 'GET') {
      return handleGet(env, namespace, key);
    }
    if (request.method === 'PUT') {
      return handlePut(request, env, namespace, key);
    }
    if (request.method === 'DELETE') {
      return handleDelete(env, namespace, key);
    }

    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
};
