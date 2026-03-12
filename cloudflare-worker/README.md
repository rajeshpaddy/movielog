## Cloudflare Worker setup

This Worker replaces `setget.io` for:

- shared export/import across apps
- weekly telemetry storage and reads

### 1. Create resources

1. Create a Cloudflare KV namespace named `movielog-shared-store`.
2. Deploy the Worker in `src/index.js`.
3. Bind the KV namespace to `SHARED_STORE`.

### 2. Configure the app

Edit [shared-store-config.js](/home/paddy/movielog/shared-store-config.js) and set:

```js
window.APP_SHARED_STORE_BASE_URL = 'https://your-worker.your-subdomain.workers.dev';
```

### 3. Worker routes

- `GET /v1/shared/:key`
- `PUT /v1/shared/:key`
- `DELETE /v1/shared/:key`
- `GET /v1/telemetry/:key`
- `PUT /v1/telemetry/:key`

Shared exports default to a 7-day TTL. Telemetry does not expire unless you set one explicitly.
