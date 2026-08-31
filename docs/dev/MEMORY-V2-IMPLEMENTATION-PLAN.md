# Ceo Knowledge Memory OS V2 - Implementation Plan

## M1 - Local Brain

### Phase 0 Architecture audit
- Map existing Secretary Brain and Knowledge V2 objects.
- Lock repository/security boundaries.
- No production migration.

### Phase 1 Stable Node Contract
- Add typed shared contract in packages/shared.
- Keep taxonomy axes separate.
- Keep cloud UUID domain ownership.

### Phase 2 Local Markdown Store
- Dynamic local store in Ceo-MCP-Agent.
- Atomic Markdown writes.
- Explicit remember -> permanent/pinned.

### Phase 3 SQLite Index + Rebuild
- FTS, Topic, Entity, Project, Source, Graph and embedding tables.
- Rebuild index from Markdown.

### Phase 4 Topic/Project Router
- Restrict candidates before semantic search.
- Stable Topic IDs derived from normalized labels.

### Phase 5 Progressive Recall
- Direct ID, indexed, graph, vector rerank, fallback.
- Telemetry includes candidate count, markdown reads and latency.

## M2 - Intelligent Routing

### Phase 6 Mode Router
- CHAT, RECALL, RESEARCH, ACTION, LIVE.
- CHAT avoids unnecessary memory/tool work.
- LIVE must not substitute stale memory for live sources.

### Phase 7 Conversation Archive
- Compact local archive with summary/decisions/open loops/facts.
- Existing cloud conversation summary remains backward-compatible.

## Verification gates

1. Targeted Local/Knowledge tests.
2. Offline local-write E2E.
3. Local recall must bypass cloud when confident.
4. SQLite rebuild test.
5. 10k indexed-memory benchmark.
6. Desktop full test + typecheck + git diff --check.
7. ceo-knowledge verify + git diff --check.
8. Secret scan on changed files.
9. Only then commit/push each repository.

## Deferred to M3+

Outbox, idempotent Local-to-Cloud sync, stable node_id cloud mapping, revision conflicts, cross-device reconciliation, evidence/claim cloud persistence and Mobile conflict UI.
