# Phoenix portal host routing (Cloudflare)

Customer invoice emails link to `https://portal.phoenixfireplace.ca/portal/auth/magic?token={token}`. That hostname must reach the **website app** (`apps/website`, Vercel project `papoon-fireplacerepair`). Legacy `/access/{token}` URLs should redirect to the magic confirm route on the same host.

Verify:

```bash
npm run phoenix-portal-host-routing:verify --workspace backend
```
