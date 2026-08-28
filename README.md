# Ceo Knowledge

Cloud knowledge, secretary, mobile and remote-device layer for Ceo MCP Agent.

## Repository boundary

This repository owns cloud-facing Ceo Knowledge code:

- `apps/mobile` — React/Vite/Tailwind Remote Console + Secretary Dashboard for Console, Chat fallback, Today, Memory, Tasks, Graph, Drive and Devices.
- `workers/gateway` — Cloudflare Worker API gateway.
- `packages/shared` — shared contracts and remote-tool allowlist.
- `supabase/migrations` — Maple migration history plus isolated `ceo_knowledge` schema migrations.
- `docs/th` — Thai user documentation.
- `docs/dev` — architecture, security, operations, roadmap and handoff notes.

Desktop Runtime, MCP tools, local files, Ollama and the outbound Device Agent remain in the separate `Ceo-MCP-Agent` repository.

Ceo Local Notes is Ceo-owned Markdown workspace functionality and does not depend on a third-party notes SDK/API/runtime. Ceo Drive is the Ceo-owned cloud-document connector; Google Drive is its first read-only backend. Product role is now explicit: ChatGPT is the primary conversational brain/UI, while Ceo Mobile is the Remote Console + Secretary Dashboard. Mobile Chat/Ollama remains a fallback and reuses the same trusted Runtime/Knowledge infrastructure.

## Production endpoints

- Worker API: `https://ceo.disomanceo.workers.dev`
- Mobile PWA: `https://ceo-knowledge.pages.dev`
- Supabase project: Maple (`pcvdtcntyzndhfxfawbo`)
- Knowledge schema: `ceo_knowledge`

## Current milestone

- V1.0 Secretary Brain: implemented and proven.
- V1.1 Cloud/Mobile foundation: deployed; Mobile is positioned as Remote Console + Secretary Dashboard rather than a ChatGPT replacement.
- V1.2 Remote Runtime foundation: database + Device Agent E2E proven.
- V2.0 Knowledge Expansion: file ingestion, 768-d semantic search, Hybrid Recall, semantic Graph auto-linking and Ceo Local Notes are E2E proven. Mobile Graph visualization is implemented and verified with direct Supabase RLS reads. Ceo Drive V1 is implemented and verified in source; real Google OAuth testing requires enabling the Google provider in Maple.

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

See `docs/th/USER-GUIDE-TH.md` for the Thai user guide, `docs/dev/PRODUCT-ROLE.md` for the fixed product/architecture role, and `docs/dev/HANDOFF-2026-08-28.md` for the latest continuation checkpoint.
