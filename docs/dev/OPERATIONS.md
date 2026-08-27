# Operations

## Local verification

```powershell
npm install
npm run typecheck
npm test
npm run build
```

## Cloudflare

Check auth:

```powershell
npx wrangler whoami
```

Worker deploy:

```powershell
npm run deploy:worker
curl https://ceo.disomanceo.workers.dev/api/health
```

Mobile deploy:

```powershell
npm run build:mobile
npm run deploy:mobile
```

Production PWA is `https://ceo-knowledge.pages.dev`.

## Supabase

Project ref: `pcvdtcntyzndhfxfawbo`.

On a new development machine:

```powershell
supabase login
supabase link --project-ref pcvdtcntyzndhfxfawbo
supabase migration list --linked
supabase db push --linked --include-all --dry-run
```

Always use dry-run before a real DB push. Do not run `db reset` against Maple. Do not repair migration history unless the discrepancy has been investigated and explicitly approved.

This repository mirrors the old Maple migration history so the CLI can safely compare remote history. Old migration files are history only; do not edit them.

## Rollback strategy

Worker: deploy a previous Git revision.

PWA: rebuild/deploy a previous Git revision.

Desktop Device Agent: use the timestamped backup under `D:\Ceo-MCP-Agent\.ceo\cloud-device-backup-*` and restart Launcher.

Database: prefer forward-fix additive migrations. V1.1/V1.2/V2 objects live inside `ceo_knowledge`; never rollback by dropping existing Maple schemas/tables outside that schema.

## Health checks

- Worker: `/api/health` should return `ok=true`.
- PWA: `https://ceo-knowledge.pages.dev` should return HTTP 200.
- Desktop: `http://127.0.0.1:8910/api/device/status`.
- Device is effectively online when heartbeat is recent (Mobile currently uses a 45-second window).
- Remote job success requires lifecycle `pending -> accepted -> running -> completed`.
