# Ceo Knowledge Architecture

## Boundary

`ceo-knowledge` owns cloud-facing concerns. `Ceo-MCP-Agent` owns Desktop Runtime and local execution. Cloud failure must never prevent the Desktop Runtime from starting or using local MCP tools.

## Main flow

```text
Mobile PWA
   |
Supabase Auth JWT
   v
Cloudflare Worker (policy/gateway)
   |
   +--> Supabase Maple / ceo_knowledge
   |
   +--> runtime_jobs queue
             |
             v
      Ceo Device Agent (outbound poll)
             |
             v
        Local MCP Runtime
```

## V1.0

Persistent memory, events, tasks, people, decisions, conversation summaries, knowledge entries and source metadata.

## V1.1

Cloud profile/reminder/audit foundation, Worker API and Mobile PWA. Basic secretary queries do not depend on a Windows PC being online.

## V1.2

Devices register outbound. Device credentials are stored in a private table and are never returned to Mobile. Pairing is 6-digit, time-limited and stored only as a SHA-256 hash. Remote jobs are queued in Supabase and executed only by a trusted Device Agent. Raw shell execution is not in the allowlist.

## V2.0 foundation

- pgvector extension
- `ingest_runs`
- `knowledge_chunks` with 768-dimensional embeddings
- `knowledge_links` graph edges
- `knowledge_revisions`
- `connector_accounts` private credential metadata
- `sync_runs`
- semantic match RPC

V2 foundation being deployed does not mean every connector/ingestion provider is complete. Implement providers behind service interfaces and keep them optional.

## Source of truth

- Cloud migrations: this repository.
- Desktop bridge/device agent: `Ceo-MCP-Agent`.
- Binary source files: local devices by default.
- Extracted knowledge/index: Supabase.

## Failure policy

- Worker unavailable: Desktop Runtime still works.
- Supabase unavailable: Desktop Runtime still works without cloud memory/jobs.
- Device offline: Cloud secretary still works; local jobs wait/fail by expiry.
- Embedding provider unavailable: keyword/structured retrieval remains available.
