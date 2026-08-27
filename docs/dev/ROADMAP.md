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
- Chat / Today / Memory / Tasks / Devices
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

Next validation: perform the six-digit pairing flow from the deployed Mobile PWA instead of admin bootstrap, then add revoke/disable UI and approval-required mutating tool classes.

## V2.0 — Knowledge Expansion — DATABASE FOUNDATION DONE

Already deployed:

- pgvector
- 768-dimension knowledge chunks
- HNSW vector index
- semantic match RPC
- graph links
- revisions
- ingest runs
- connector/sync tables
- external provider IDs for sources/events

Next implementation order:

1. Runtime `knowledge.ingest_file`: source registration -> document.read -> chunk -> local Ollama extraction -> save knowledge.
2. Embedding provider router with local-first fallback and deterministic model metadata.
3. Hybrid retrieval combining keyword and semantic scores.
4. Knowledge graph auto-linking and graph UI.
5. Obsidian connector (local Markdown import/export, no dependency for Core).
6. Google Drive connector for selected documents.
7. Google Calendar connector with explicit sync direction/conflict policy.
8. Web Push reminders and follow-up scheduler.
9. Backup/export and restore tooling.
10. Release hardening and versioned API contract tests between both repositories.

## Non-negotiable rule

Do not move Desktop Runtime/Core into this repository. Do not make `Ceo-MCP-Agent` startup depend on Cloudflare, Supabase, pgvector, Mobile or any connector.
