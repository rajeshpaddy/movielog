(function () {
  if (window.__aiAppCatalogTelemetryLoaded) return;
  window.__aiAppCatalogTelemetryLoaded = true;

  const appId = String(window.APP_TELEMETRY_ID || '').trim();
  if (!appId) return;

  const SETGET_SET_URL = 'https://setget.io/api/set';
  const SETGET_GET_BASE = 'https://setget.io/api/get';
  const STORAGE_PREFIX = 'ai-app-catalog-telemetry';
  const TELEMETRY_VERSION = 3;
  const RECENT_SAMPLE_LIMIT = 20;
  const CATALOG_LAUNCH_PREFIX = `${STORAGE_PREFIX}-catalog-launch`;

  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1') {
    return;
  }

  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeRemoveItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getIsoWeekInfo(date) {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return {
      year: utcDate.getUTCFullYear(),
      week
    };
  }

  function getWeekKey(date) {
    const info = getIsoWeekInfo(date);
    return `${info.year}-W${String(info.week).padStart(2, '0')}`;
  }

  function getCompactWeekKey(date) {
    const info = getIsoWeekInfo(date);
    return `${info.year}w${String(info.week).padStart(2, '0')}`;
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

  function buildTelemetryKey(weekKey) {
    const compactApp = appId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'app';
    const compactWeek = weekKey.toLowerCase().replace('-', '');
    return `aat-${compactApp}-${hashAppId(appId)}-${compactWeek}`;
  }

  function ensureTelemetryLink(telemetryKey) {
    let styleEl = document.getElementById('appTelemetryLinkStyles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'appTelemetryLinkStyles';
      styleEl.textContent = `
        .app-telemetry-link {
          position: fixed;
          left: 12px;
          bottom: 10px;
          font-size: 11px;
          color: #8ea6c7;
          text-decoration: none;
          opacity: 0.85;
          z-index: 100;
        }
        .app-telemetry-link:hover {
          color: #bfe3ff;
          opacity: 1;
          text-decoration: underline;
        }
      `;
      document.head.appendChild(styleEl);
    }

    let linkEl = document.getElementById('telemetryLink');
    if (!linkEl) {
      linkEl = document.createElement('a');
      linkEl.id = 'telemetryLink';
      linkEl.className = 'app-telemetry-link';
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = 'Telemetry';
      linkEl.title = "View this week's telemetry";
      document.body.appendChild(linkEl);
    }

    linkEl.href = '#';
    linkEl.onclick = async (event) => {
      event.preventDefault();

      const viewer = window.open('about:blank', '_blank');
      if (!viewer) return;
      try {
        viewer.opener = null;
      } catch (error) {
        /* ignore opener hardening failures */
      }

      viewer.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Telemetry</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              background: #0b1220;
              color: #d8f6ff;
              font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            }
            h1 {
              margin: 0 0 12px;
              font-size: 18px;
              color: #7fe3ff;
            }
            p {
              margin: 0 0 12px;
              color: #8aa3c0;
            }
            pre {
              margin: 0;
              padding: 16px;
              border-radius: 12px;
              background: #111a2d;
              border: 1px solid #1d345a;
              white-space: pre-wrap;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <h1>Telemetry</h1>
          <p>Loading ${telemetryKey}...</p>
          <pre id="telemetryContent"></pre>
        </body>
        </html>
      `);
      viewer.document.close();

      try {
        const response = await fetch(`${SETGET_GET_BASE}/${encodeURIComponent(telemetryKey)}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Telemetry fetch failed (${response.status})`);
        }

        const payload = await response.json();
        const content = payload && typeof payload === 'object' ? payload.content : payload;
        viewer.document.title = `Telemetry - ${telemetryKey}`;
        const message = viewer.document.querySelector('p');
        const pre = viewer.document.getElementById('telemetryContent');
        if (message) message.textContent = telemetryKey;
        if (pre) pre.textContent = JSON.stringify(content, null, 2);
      } catch (error) {
        viewer.document.title = 'Telemetry Unavailable';
        const message = viewer.document.querySelector('p');
        const pre = viewer.document.getElementById('telemetryContent');
        if (message) message.textContent = 'Unable to load telemetry.';
        if (pre) {
          pre.textContent = [
            `Key: ${telemetryKey}`,
            '',
            String(error && error.message ? error.message : error),
            '',
            `Endpoint: ${SETGET_GET_BASE}/${encodeURIComponent(telemetryKey)}`
          ].join('\n');
        }
      }
    };
  }

  function normalizeName(value) {
    return String(value || '').trim();
  }

  function consumeCatalogLaunch() {
    const launchKey = `${CATALOG_LAUNCH_PREFIX}-${appId}`;
    const raw = safeGetItem(launchKey);
    if (!raw) return null;
    safeRemoveItem(launchKey);

    try {
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return null;
      if (payload.targetAppId && payload.targetAppId !== appId) return null;
      return payload;
    } catch (error) {
      return null;
    }
  }

  function pickRegionBucket(geo) {
    const countryCode = normalizeName(geo.countryCode).toUpperCase();
    const region = normalizeName(geo.region);
    const timezone = normalizeName(geo.timezone);
    const countryName = normalizeName(geo.countryName);

    const usEast = new Set(['CT', 'DC', 'DE', 'FL', 'GA', 'MA', 'MD', 'ME', 'NC', 'NH', 'NJ', 'NY', 'PA', 'RI', 'SC', 'VA', 'VT', 'WV']);
    const usCentral = new Set(['AL', 'AR', 'IA', 'IL', 'IN', 'KS', 'KY', 'LA', 'MI', 'MN', 'MO', 'MS', 'ND', 'NE', 'OH', 'OK', 'SD', 'TN', 'TX', 'WI']);
    const usMountain = new Set(['AZ', 'CO', 'ID', 'MT', 'NM', 'UT', 'WY']);
    const usWest = new Set(['AK', 'CA', 'HI', 'NV', 'OR', 'WA']);

    if (countryCode === 'US') {
      const upperRegion = region.toUpperCase();
      if (usEast.has(upperRegion) || timezone.includes('New_York')) return 'US East';
      if (usCentral.has(upperRegion) || timezone.includes('Chicago')) return 'US Central';
      if (usMountain.has(upperRegion) || timezone.includes('Denver') || timezone.includes('Phoenix')) return 'US Mountain';
      if (usWest.has(upperRegion) || timezone.includes('Los_Angeles') || timezone.includes('Anchorage') || timezone.includes('Honolulu')) return 'US West';
      return 'US';
    }

    if (countryCode === 'IN') {
      const name = region.toLowerCase();
      const north = ['delhi', 'haryana', 'himachal', 'jammu', 'kashmir', 'ladakh', 'punjab', 'rajasthan', 'uttar pradesh', 'uttarakhand', 'chandigarh'];
      const south = ['andhra', 'karnataka', 'kerala', 'tamil nadu', 'telangana', 'puducherry', 'lakshadweep'];
      const east = ['bihar', 'jharkhand', 'odisha', 'orissa', 'west bengal'];
      const west = ['goa', 'gujarat', 'maharashtra', 'dadra', 'daman', 'diu'];
      const central = ['chhattisgarh', 'madhya pradesh'];
      const northeast = ['arunachal', 'assam', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'sikkim', 'tripura'];

      if (north.some(part => name.includes(part))) return 'India North';
      if (south.some(part => name.includes(part))) return 'India South';
      if (east.some(part => name.includes(part))) return 'India East';
      if (west.some(part => name.includes(part))) return 'India West';
      if (central.some(part => name.includes(part))) return 'India Central';
      if (northeast.some(part => name.includes(part))) return 'India Northeast';
      return 'India';
    }

    if (countryName) return countryName;
    if (countryCode) return countryCode;
    return 'Unknown';
  }

  async function fetchGeo() {
    const weekKey = getWeekKey(new Date());
    const cacheKey = `${STORAGE_PREFIX}-geo-${weekKey}`;
    const cached = safeGetItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        /* ignore cache parse errors */
      }
    }

    const response = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Geo lookup failed (${response.status})`);
    }
    const payload = await response.json();
    const geo = {
      countryCode: normalizeName(payload.country_code),
      countryName: normalizeName(payload.country_name || payload.country),
      region: normalizeName(payload.region || payload.region_code),
      timezone: normalizeName(payload.timezone),
      regionBucket: ''
    };
    geo.regionBucket = pickRegionBucket(geo);
    safeSetItem(cacheKey, JSON.stringify(geo));
    return geo;
  }

  async function fetchExistingTelemetry(key) {
    const response = await fetch(`${SETGET_GET_BASE}/${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload === 'object' ? payload.content : null;
  }

  async function writeTelemetry(key, content) {
    let response = await fetch(SETGET_SET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        key,
        content,
        expireAfter: 604800
      })
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 422 && text.includes('expireAfter')) {
        response = await fetch(SETGET_SET_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ key, content })
        });
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telemetry write failed (${response.status})${text ? `: ${text}` : ''}`);
    }
  }

  async function recordTelemetry() {
    const weekKey = getWeekKey(new Date());
    const telemetryKey = buildTelemetryKey(weekKey);
    ensureTelemetryLink(telemetryKey);
    const catalogLaunch = consumeCatalogLaunch();

    const geo = await fetchGeo().catch(() => ({
      countryCode: '',
      countryName: '',
      region: '',
      timezone: '',
      regionBucket: 'Unknown'
    }));

    const existing = await fetchExistingTelemetry(telemetryKey).catch(() => null);
    const now = new Date().toISOString();

    const next = existing && typeof existing === 'object'
      ? existing
      : {
          app: 'ai-app-catalog-telemetry',
          version: TELEMETRY_VERSION,
          appId,
          week: weekKey,
          key: telemetryKey,
          hitCount: 0,
          launchSources: {},
          regions: {},
          countries: {},
          recent: []
        };

    next.app = 'ai-app-catalog-telemetry';
    next.version = TELEMETRY_VERSION;
    next.appId = appId;
    next.week = weekKey;
    next.key = telemetryKey;
    next.updatedAt = now;
    next.hitCount = Number(next.hitCount || 0) + 1;
    next.launchSources = next.launchSources && typeof next.launchSources === 'object' ? next.launchSources : {};
    next.regions = next.regions && typeof next.regions === 'object' ? next.regions : {};
    next.countries = next.countries && typeof next.countries === 'object' ? next.countries : {};
    next.recent = Array.isArray(next.recent) ? next.recent : [];

    const regionKey = geo.regionBucket || 'Unknown';
    const countryKey = geo.countryCode || geo.countryName || 'Unknown';
    const launchSource = catalogLaunch && catalogLaunch.source === 'app-catalog'
      ? 'app-catalog'
      : 'direct';

    next.launchSources[launchSource] = Number(next.launchSources[launchSource] || 0) + 1;
    next.regions[regionKey] = Number(next.regions[regionKey] || 0) + 1;
    next.countries[countryKey] = Number(next.countries[countryKey] || 0) + 1;
    next.recent.unshift({
      at: now,
      source: launchSource,
      region: regionKey,
      country: countryKey
    });
    next.recent = next.recent.slice(0, RECENT_SAMPLE_LIMIT);

    await writeTelemetry(telemetryKey, next);
  }

  function scheduleTelemetry() {
    const runner = () => {
      recordTelemetry().catch(() => {});
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runner, { timeout: 3000 });
    } else {
      window.setTimeout(runner, 1500);
    }
  }

  scheduleTelemetry();
})();
