# Ceo Knowledge

Cloud knowledge, secretary, mobile and remote-device layer for Ceo MCP Agent.

## Repository boundary

This repository owns cloud-facing Ceo Knowledge code:

- `apps/mobile` — React/Vite/Tailwind PWA for Chat, Today, Memory, Tasks and Devices.
- `workers/gateway` — Cloudflare Worker API gateway.
- `packages/shared` — shared contracts and remote-tool allowlist.
- `supabase/migrations` — Maple migration history plus isolated `ceo_knowledge` schema migrations.
- `docs/th` — Thai user documentation.
- `docs/dev` — architecture, security, operations, roadmap and handoff notes.

Desktop Runtime, MCP tools, local files, Ollama and the outbound Device Agent remain in the separate `Ceo-MCP-Agent` repository.

## Production endpoints

- Worker API: `https://ceo.disomanceo.workers.dev`
- Mobile PWA: `https://ceo-knowledge.pages.dev`
- Supabase project: Maple (`pcvdtcntyzndhfxfawbo`)
- Knowledge schema: `ceo_knowledge`

## Current milestone

- V1.0 Secretary Brain: implemented and proven.
- V1.1 Cloud/Mobile foundation: deployed.
- V1.2 Remote Runtime foundation: database + Device Agent E2E proven.
- V2.0 Knowledge Expansion: pgvector foundation deployed; Desktop Runtime file ingestion, local Ollama extraction, 768-d embeddings and semantic search are now E2E proven. Hybrid retrieval, graph auto-linking and connectors remain next.

## Verify locally

```powershell
npm install
npm run verify
```

## Deploy

```powershell
npm run deploy:worker
npm run build:mobile
npm run deploy:mobile
```

Deployment requires Wrangler authentication on the current machine. Database migration commands require Supabase CLI authentication and project link.

See `docs/th/USER-GUIDE-TH.md` for the Thai user guide and `docs/dev/HANDOFF-2026-08-27.md` for the latest continuation checkpoint.
