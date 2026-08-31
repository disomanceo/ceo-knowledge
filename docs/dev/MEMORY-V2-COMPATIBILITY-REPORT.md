# Ceo Knowledge Memory OS V2 - Compatibility Report

Status: M1-M2 implementation baseline
Date: 2026-08-31

## Executive decision

Memory OS V2 extends the existing Ceo Knowledge architecture. It does not replace the Secretary Brain, Knowledge V2, Remote Runtime, Mobile Console, or existing Supabase domain tables.

## Existing assets to reuse

- Secretary Brain: memories, events, tasks, people, decisions, conversation_summaries.
- Knowledge: knowledge_entries, sources, knowledge_chunks, knowledge_links, knowledge_revisions, ingest_runs.
- Retrieval: bounded keyword recall, 768-dimension pgvector chunks, HNSW, semantic match RPC, hybrid recall.
- Local: Ceo Local Notes, guarded Active Project document reads, Ollama extraction and nomic-embed-text embeddings.
- Remote: devices, runtime_jobs, Device Agent, safe allowlist and RLS.
- Mobile/Worker: Console, Graph, Drive and authenticated gateway.

## Compatibility mapping

| Existing object | Memory OS role | M1-M2 action |
| --- | --- | --- |
| memories | durable personal memory domain | keep; local-first mirror added in Runtime |
| events | event domain | keep; future node envelope references event UUID |
| tasks | task domain | keep; future node envelope references task UUID |
| people | person domain | keep; future entity index references person UUID |
| decisions | decision domain | keep; future node envelope references decision UUID |
| conversation_summaries | compact conversation memory | keep; add Local conversation archive |
| knowledge_entries | structured knowledge | keep |
| sources | provenance root | keep |
| knowledge_chunks | semantic chunks | keep |
| knowledge_links | cloud semantic graph | keep; typed Memory OS graph vocabulary is additive |
| knowledge_revisions | cloud revision history | keep |
| ingest_runs | ingestion audit | keep |
| connector_accounts / sync_runs | connector foundation | keep; M3 sync will extend contracts, not replace |

## Repository boundary

Ceo-MCP-Agent owns Local Markdown, SQLite index, local graph/vector, routing and offline recall. ceo-knowledge owns shared contracts, Supabase/cloud data, Worker, Mobile and RLS.

## Stable ID compatibility

Existing Supabase domain rows use UUID primary keys. M1-M2 does not rewrite them. Local Memory OS introduces stable typed node IDs (mem_*, topic_*, project_*, etc.). M3 must add a forward-only mapping/replica contract so one stable node_id can reference an existing domain object_id without destructive PK migration.

## Security compatibility

- No service_role on Desktop or Mobile.
- No Supabase db reset.
- No new remote shell/tool mutation exposure.
- Local-memory tools are not added to REMOTE_SAFE_TOOLS.
- Cloud/Knowledge failure remains non-fatal to Runtime startup.
- Original local source files remain local by default.

## M1-M2 non-goals

- No cloud replica migration.
- No outbox/conflict engine.
- No production deploy.
- No Google/Calendar expansion.
- No destructive consolidation.
