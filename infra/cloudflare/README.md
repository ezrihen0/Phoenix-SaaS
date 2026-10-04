# Phoenix portal host routing (Cloudflare)

Customer invoice emails link to `https://portal.phoenixfireplace.ca/access/{token}`. That hostname must reach the same Next.js app as `https://app.phoenixfireplace.ca`.

Until `portal.phoenixfireplace.ca` is registered on Vercel project `pheonix-crm-frontend-6bxw`, production uses Worker **`phoenix-portal-host-proxy`** with route `portal.phoenixfireplace.ca/*`.

Redeploy from repo root (requires `CLOUDFLARE_ACCOUNT_ID` and `CF_API_TOKEN` in `backend/.env`):

```bash
node backend/scripts/deploy-phoenix-portal-host-proxy.mjs
```

Verify:

```bash
npm run phoenix-portal-host-routing:verify --workspace backend
```
