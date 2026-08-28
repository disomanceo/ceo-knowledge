# Roadmap

## V1.0 — Secretary Brain — DONE

- isolated `ceo_knowledge` schema
- memory / recall / forget
- events / tasks / people / decisions
- conversation summaries
- keyword retrieval and deduplication
- runtime bridge without startup dependency

## V1.1 — Ceo Mobile / Cloud — FOUNDATION DEPLOYED

- Supabase Auth reuse
- Cloudflare Worker gateway
- React/Vite/Tailwind PWA
- Chat / Today / Memory / Tasks / Graph / Devices
- Graph reads authenticated `ceo_knowledge` data directly from Supabase under RLS so it does not depend on a running PC/Runtime
- profiles / reminders / audit tables

Next validation: login from an actual phone, create/read Memory and Tasks, verify Today while all PCs are off, then add Web Push scheduling.

## V1.2 — Remote Runtime — CORE E2E DONE

- device registry
- DPAPI per-device token
- private token-hash table
- pairing RPCs
- heartbeat
- runtime job queue
- safe remote tool allowlist
- outbound polling Device Agent
- E2E runtime.status job completed successfully
- SCHOOL-PC production Pair API E2E completed; device is TRUSTED/ONLINE
- AUTO Chat Router can dispatch safe `ollama.chat` Runtime jobs and poll results back to Mobile

Next validation: manually exercise the six-digit pairing UI on a fresh/untrusted device, then add revoke/disable UI and approval-required mutating tool classes. The SCHOOL-PC backend Pair API path is already E2E proven.

## V2.0 — Knowledge Expansion — RUNTIME INGESTION + SEMANTIC SEARCH E2E DONE

Database foundation deployed:

- pgvector
- 768-dimension knowledge chunks
- HNSW vector index
- semantic match RPC
- graph links
- revisions
- ingest runs
- connector/sync tables
- external provider IDs for sources/events

Runtime implementation completed and proven on SCHOOL-PC:

- Ceo Local Notes native Markdown scan/import is E2E proven; it uses no third-party notes SDK/API/runtime and defaults bulk import to dry-run
- Mobile Graph visualization source is implemented with native SVG, active-node filtering, graph/list modes and direct authenticated Supabase RLS reads
- semantic Knowledge Graph auto-link is E2E proven with canonical pair dedup and active-node filtering
- Hybrid `knowledge.recall` merges keyword + semantic retrieval with bounded scoring and keyword fallback
- semantic chunk duplicates collapse to one Knowledge result; project-scoped queries stay keyword-only until vector project filtering exists
- `knowledge.ingest_file`: Active Project file -> document.read -> source/hash -> extraction -> knowledge -> chunks -> Supabase
- original binary/source file remains local; Supabase receives extracted text/knowledge and source metadata only
- local Ollama extraction with `qwen3:4b`, with deterministic fallback when Ollama is unavailable
- `ollama.embed` provider using `nomic-embed-text:latest` and strict 768-dimension validation
- chunk embeddings persisted and `knowledge.semantic_search` E2E proven with Thai paraphrase retrieval
- `knowledge.sources` and `knowledge.graph` read APIs proven
- file-backed Knowledge dedup now uses source + content, so changing AI/caller title cannot create duplicates
- re-ingestion reconciles chunk sets and archives stale chunks only after the current chunk set saves successfully
- Knowledge/embedding/cloud failure remains non-fatal to the main Runtime
- Active Project boundary remains enforced; ingestion does not bypass the existing filesystem security model
- V2 read-only semantic/graph/source tools are allowed remotely; file ingestion remains local-only until an explicit approval flow is designed

Next implementation order:

1. Enable/test Google OAuth provider for Ceo Drive against a real Drive account.
2. Ceo Drive V1.1: Runtime handoff for PDF/Office files and optional encrypted refresh-token/background sync design.
3. Google Calendar connector with explicit sync direction/conflict policy.
4. Web Push reminders and follow-up scheduler.
5. Backup/export and restore tooling.
6. Release hardening and versioned API contract tests between both repositories.

## Non-negotiable rule

Do not move Desktop Runtime/Core into this repository. Do not make `Ceo-MCP-Agent` startup depend on Cloudflare, Supabase, pgvector, Mobile or any connector.
