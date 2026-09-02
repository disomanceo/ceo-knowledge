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
- Cloud MCP (ChatGPT/compatible clients): `https://ceo.disomanceo.workers.dev/mcp`
- OAuth protected-resource metadata: `https://ceo.disomanceo.workers.dev/.well-known/oauth-protected-resource/mcp`
- Mobile PWA: `https://ceo-knowledge.pages.dev`
- Supabase project: Maple (`pcvdtcntyzndhfxfawbo`)
- Knowledge schema: `ceo_knowledge`

## Current milestone

- V1.0 Secretary Brain: implemented and proven.
- V1.1 Cloud/Mobile foundation: deployed; Mobile is positioned as Remote Console + Secretary Dashboard rather than a ChatGPT replacement.
- Cloud MCP: OAuth 2.1 protected resource for ChatGPT/compatible MCP clients, backed by Maple RLS and usable for cloud Memory/Today/Tasks/Events even when the PC is offline.
- V1.2 Remote Runtime foundation: database + Device Agent E2E proven.
- V2.0 Knowledge Expansion: file ingestion, 768-d semantic search, Hybrid Recall, semantic Graph auto-linking and Ceo Local Notes are E2E proven. Mobile Graph visualization is implemented and verified with direct Supabase RLS reads. Ceo Drive V1 is implemented and verified in source; real Google OAuth testing requires enabling the Google provider in Maple.

## Verify locally

```powershell
npm install
npm run verify
```

## Cloud AI fallback (Hybrid AUTO Router)

Ceo Knowledge ใช้เส้นทาง `AUTO` ดังนี้:

1. ถ้า Ceo MCP Agent ออนไลน์และรองรับ `provider.chat` → ใช้ Model ที่ Active บนเครื่องก่อน
2. ถ้าไม่มี provider แต่เครื่องยังมี Ollama → ใช้ Ollama
3. ถ้าเครื่องออฟไลน์ → ใช้ Gemini Cloud fallback
4. ถ้าไม่มี AI ใดพร้อม → Knowledge/Memory/Tasks/Events ยังตอบจาก Supabase ได้ตามปกติ

ค่าเริ่มต้น Cloud คือ `gemini-3.5-flash-lite` เพราะมี Free Tier และรองรับ Google Search grounding สำหรับคำถามข้อมูลปัจจุบันตามโควต้าของ Google. API key ต้องเก็บเป็น Cloudflare Worker Secret เท่านั้นและห้ามใส่ใน `apps/mobile` หรือ commit ลง Git.

ตั้งค่า Gemini ครั้งแรก:

```powershell
cd workers/gateway
npx wrangler secret put GEMINI_API_KEY
```

หลังใส่ key ให้ deploy Worker ใหม่ แล้วเปิดหน้า Console ของ Ceo Knowledge เพื่อตรวจ `AI Router`: ตอนเครื่องเปิดควรขึ้น `Ceo Desktop`; ตอนเครื่องปิดควรขึ้น `Cloud AI · GEMINI`.

## Deploy

```powershell
npm run deploy:worker
npm run build:mobile
npm run deploy:mobile
```

Deployment requires Wrangler authentication on the current machine. Database migration commands require Supabase CLI authentication and project link.

See `docs/th/USER-GUIDE-TH.md` for the Thai user guide, `docs/dev/PRODUCT-ROLE.md` for the fixed product/architecture role, and `docs/dev/HANDOFF-2026-08-28.md` for the latest continuation checkpoint.
