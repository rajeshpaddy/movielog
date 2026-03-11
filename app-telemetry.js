(function () {
  if (window.__aiAppCatalogTelemetryLoaded) return;
  window.__aiAppCatalogTelemetryLoaded = true;

  const appId = String(window.APP_TELEMETRY_ID || '').trim();
  if (!appId) return;

  const SETGET_SET_URL = 'https://setget.io/api/set';
  const SETGET_GET_BASE = 'https://setget.io/api/get';
  const STORAGE_PREFIX = 'ai-app-catalog-telemetry';
  const RECENT_SAMPLE_LIMIT = 20;

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

  function buildTelemetryKey(weekKey) {
    return `${STORAGE_PREFIX}-${appId}-${weekKey}`;
  }

  function normalizeName(value) {
    return String(value || '').trim();
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
        expireAfter: 1209600
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
  }

  async function recordTelemetry() {
    const weekKey = getWeekKey(new Date());
    const sentKey = `${STORAGE_PREFIX}-sent-${appId}-${weekKey}`;
    if (safeGetItem(sentKey)) return;

    const geo = await fetchGeo().catch(() => ({
      countryCode: '',
      countryName: '',
      region: '',
      timezone: '',
      regionBucket: 'Unknown'
    }));

    const telemetryKey = buildTelemetryKey(weekKey);
    const existing = await fetchExistingTelemetry(telemetryKey).catch(() => null);
    const now = new Date().toISOString();

    const next = existing && typeof existing === 'object'
      ? existing
      : {
          app: 'ai-app-catalog-telemetry',
          version: 1,
          appId,
          week: weekKey,
          hitCount: 0,
          regions: {},
          countries: {},
          recent: []
        };

    next.app = 'ai-app-catalog-telemetry';
    next.version = 1;
    next.appId = appId;
    next.week = weekKey;
    next.updatedAt = now;
    next.hitCount = Number(next.hitCount || 0) + 1;
    next.regions = next.regions && typeof next.regions === 'object' ? next.regions : {};
    next.countries = next.countries && typeof next.countries === 'object' ? next.countries : {};
    next.recent = Array.isArray(next.recent) ? next.recent : [];

    const regionKey = geo.regionBucket || 'Unknown';
    const countryKey = geo.countryCode || geo.countryName || 'Unknown';

    next.regions[regionKey] = Number(next.regions[regionKey] || 0) + 1;
    next.countries[countryKey] = Number(next.countries[countryKey] || 0) + 1;
    next.recent.unshift({
      at: now,
      region: regionKey,
      country: countryKey
    });
    next.recent = next.recent.slice(0, RECENT_SAMPLE_LIMIT);

    await writeTelemetry(telemetryKey, next);
    safeSetItem(sentKey, now);
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
