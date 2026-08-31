# Ceo Knowledge Memory OS Roadmap

> Status: **M1-M2 COMPLETE / M3 PLANNED**
>
> Reference roadmap for evolving Ceo Knowledge into a **Local-First Personal Memory OS** without replacing the existing Ceo Core.

## Vision

Ceo Memory OS must:
- work offline on the PC;
- recall locally without querying Supabase for every request;
- use the same stable Node ID locally and in cloud;
- narrow search using Topic / Project / Entity / Time indexes before semantic search;
- use graph relationships to reduce search space;
- trace Memory / Claim / Summary back to Source and Evidence;
- sync asynchronously to Supabase for Mobile / cross-device access;
- distinguish observation, report, forecast, inference, claim and evidence;
- allow AI to interpret/plan while mutations remain behind Ceo Tool Router / Security Guard.

## Core Principles

1. **Local-First** — Runtime online: Local Write/Recall first.
2. **ID-First** — every object has a stable Node ID.
3. **Graph-First** — route to a branch/candidate set before global vector search.
4. **Provenance-First** — every important result can trace to source/evidence.
5. **Offline-Safe** — cloud failure must not disable local memory.
6. **Additive / Backward-Compatible** — extend existing tables/tools before creating replacements.
7. **No Silent Loss** — idempotent writes, retries, outbox and conflict records.
8. **Abstain Over Hallucination** — insufficient evidence must not become a fact.
9. **Runtime Independence** — Ceo Runtime startup must not depend on Supabase/Cloudflare/Mobile/connectors.
10. **Security by Contract** — external content is untrusted data; actions go through approval/audit boundaries.

## Target Architecture

```text
ChatGPT / Claude / Gemini / Ollama
                |
                v
            MODE ROUTER
        CHAT / RECALL / RESEARCH / ACTION / LIVE
                |
                v
          MEMORY / RESEARCH ROUTER
                |
      Project / Topic / Entity / Time / ID
                |
                v
             NODE GRAPH
                |
       +--------+--------+
       |                 |
     LOCAL             CLOUD
       |                 |
   Markdown           Supabase
   SQLite             pgvector
   Vector             Graph
   Graph              Sources
       |                 |
       +---- Sync Engine-+
```

## Repository Boundary

### `Ceo-MCP-Agent` owns Local Runtime concerns
- Markdown Memory Store
- SQLite Index
- Local Vector / Local Graph
- Memory Router / Local Recall
- Outbox / Sync Agent
- offline behavior
- local conversation/file capture

### `ceo-knowledge` owns Cloud concerns
- Supabase schema / pgvector
- Cloud Graph / Sources / Revisions / Conflicts
- Worker API
- Mobile
- RLS / bounded RPC
- shared sync contracts
- backup/export contracts

**Do not move Desktop Runtime/Core into `ceo-knowledge`.**

---

# Phase 0 — ✅ Architecture Audit & Compatibility Mapping

**No production feature work in this phase.**

Inspect current Memory, Events, Tasks, People, Decisions, Conversation Summary, Sources, Knowledge Chunks, pgvector/HNSW, Knowledge Links, Knowledge Revisions, Ingest Runs, Connector/Sync tables, Runtime Jobs, Device Agent, Ceo Local Notes, Mobile Console, Worker, RLS/RPC/security.

Map existing objects to the new architecture before adding schema/tools.

Deliverables:
- `docs/dev/MEMORY-V2-COMPATIBILITY-REPORT.md`
- `docs/dev/MEMORY-V2-ARCHITECTURE.md`
- `docs/dev/MEMORY-V2-DATA-MAPPING.md`
- `docs/dev/MEMORY-V2-IMPLEMENTATION-PLAN.md`

**Gate:** no Phase 1 until duplicate schema/tool risk is resolved.

# Phase 1 — ✅ Stable Node Foundation

Node types:
- topic
- memory
- event
- task
- person
- project
- place
- decision
- document
- source
- summary
- claim

Stable IDs such as `topic_xxx`, `mem_xxx`, `project_xxx`, `src_xxx`, `claim_xxx` must identify the same object in Markdown, SQLite, vector index, graph, Supabase and source references.

Optional human-readable alias examples:
- `ceo://projects/ceo`
- `ceo://projects/ceo/knowledge`

Primary identity remains `node_id`.

Taxonomy dimensions must be separated:
- `memory_kind`: episodic / semantic / procedural / prospective / derived / summary
- `source_kind`: user / conversation / document / external_api / web / device / ai_derived
- `truth_status`: observed / reported / forecast / inferred / refuted
- `evidence_status`: unverified / single_source / confirmed / conflicting

Initial edge vocabulary:
`CHILD_OF`, `ABOUT`, `RELATED_TO`, `PART_OF`, `MENTIONS`, `INVOLVES`, `OCCURS_AT`, `DERIVED_FROM`, `SUPPORTED_BY`, `CONTRADICTS`, `CONFIRMS`, `REFUTES`, `FOLLOWS`, `SUPERSEDES`.

# Phase 2 — ✅ Local Markdown Memory Store

Local memory belongs on the Runtime side.

```text
Ceo-Knowledge/
+-- memories/
+-- conversations/
+-- summaries/
+-- attachments/
+-- inbox/
+-- .ceo/
    +-- memory-index.sqlite
    +-- outbox.sqlite
    +-- sync-state.json
```

Markdown = durable/human-readable payload.
SQLite = fast catalog/index.
Local vector = semantic retrieval.

Explicit phrases such as “จำไว้ / บันทึกไว้ / อย่าลืม” set:
- `explicit_memory_instruction=true`
- `retention_policy=permanent`
- `tier=pinned`

Still apply validation, privacy, dedup, entity resolution and provenance.

# Phase 3 — ✅ SQLite Local Index

Required indexes:
- ID
- Topic
- Entity
- Project
- Time
- Source
- FTS
- Graph

Store enough metadata to resolve candidate IDs without opening every Markdown file.

Required recovery path:
`Markdown -> rebuild SQLite index`.

Acceptance: 10,000+ memories must not cause full-directory Markdown scans.

# Phase 4 — ✅ Topic Router + Project Router

Resolve Project/Topic first, then reduce to candidate Node IDs.

Example:
`เรื่อง Sync ของ Ceo` -> `Project=Ceo`, `Topic=Memory/Sync` -> indexed candidate set.

Topic hierarchy is for navigation; graph edges allow one memory to belong to multiple topics.

Do not send the complete topic vocabulary to an LLM. Retrieve Top 5–10 topic candidates first, then choose/create.

# Phase 5 — ✅ Progressive Local Recall

```text
L0 Direct ID
L1 Indexed Recall
L2 Graph Recall
L3 Hybrid Search
L4 Global Semantic Fallback
```

Pipeline:
`Query -> Mode -> Project/Topic/Entity/Time -> Candidate IDs -> Graph 1-hop -> FTS+Vector+Time -> Rerank -> Read Top Markdown -> Provenance -> Answer`.

1-hop graph expansion is default; 2-hop only when confidence is insufficient. Global vector search is fallback, not default.

Initial local embedding contract should stay compatible with the current 768-dimension `nomic-embed-text` path unless evaluation justifies a change.

# Phase 6 — ✅ Mode Router

Modes:
- CHAT
- RECALL
- RESEARCH
- ACTION
- LIVE

Do not run memory/tool pipelines for ordinary chat unless needed. LIVE requests use live sources rather than stale memory. ACTION remains governed by Ceo Tool Router and approval policy.

# Phase 7 — ✅ Conversation Archive

At conversation close/checkpoint extract:
- Summary
- Decisions
- Tasks
- Important Memories
- Topics
- Source Reference

Store conversation archive separately from extracted memory. Do not automatically turn the complete transcript into memory nodes.

# Phase 8 — Local Outbox & Sync Engine

Write path:
`validate -> stable ID -> revision -> Markdown -> SQLite -> embedding -> graph -> outbox -> ACK`.

Cloud sync runs asynchronously from Outbox.

Must support:
- `client_event_id`
- revision
- content hash
- retry/backoff
- offline queue
- crash recovery
- idempotency

Local and Cloud are two replicas of the same Memory Object, not unrelated databases.

# Phase 9 — Cloud Replica

Map the shared Node Contract into current Supabase/pgvector/Graph/Sources/Revisions/Worker/Mobile structures.

Routing:
- PC online -> Local-first
- PC off / Mobile -> Cloud-first

Use identical stable IDs across replicas. Preserve `auth.uid()` RLS. Do not place service-role credentials in Desktop/Mobile.

# Phase 10 — Revision & Conflict Engine

Every synced object has `revision`, `updated_at`, `content_hash`.

Concurrent PC/Mobile edits must create a conflict record and retain both versions. No silent Last-Write-Wins. Safe conflicts may auto-merge; ambiguous conflicts require user resolution.

# Phase 11 — Provenance Engine

Every answer/memory should be traceable:
`Answer -> Memory/Node -> Source -> Conversation/File/Web/API/Device`.

AI-derived nodes require `derived_from[]`.

Recall result contract should expose `node_ids`, `source_ids`, `reference_paths`, confidence, truth status and evidence status.

# Phase 12 — Claim + Evidence Graph

Claims are not ordinary memories.

```text
Source A --SUPPORTS----+
Source B --SUPPORTS----+--> Claim
Source C --CONTRADICTS-+
```

Evidence states: unverified / single_source / confirmed / conflicting / refuted.

A single web/document observation must not silently become a permanent fact.

# Phase 13 — Research Workspace

Extend Active Project into a scoped Knowledge Workspace:
- Topics
- Sources
- Claims
- Memories
- Decisions
- Tasks
- Documents
- Summaries

Research flow:
`Question -> Project Scope -> Seed Sources -> Source Expansion -> Claims -> Evidence Graph -> Cross-source Verification -> Knowledge`.

# Phase 14 — Summary / Consolidation

Create project/topic summaries such as:
- `summary_current`
- daily / weekly / monthly summaries
- decision summary
- open-task summary

General questions read summaries first; specific questions drill down to raw nodes. Every summary needs `derived_from[]`. Never destructively consolidate pinned/raw source material.

# Phase 15 — Evaluation & Performance

Golden Dataset: at least 30–50 cases covering explicit memory, relative dates, พ.ศ./ค.ศ., routing, entities, duplicates, conflicts, old memory, abstention, provenance, claim/evidence, offline, sync, rebuild, forecast vs observation.

Metrics:
- Recall@5
- MRR
- Groundedness
- Abstention Accuracy
- Date Accuracy
- Dedup Precision
- Routing Accuracy

Initial local performance targets (excluding LLM rerank):
- Direct ID lookup < 20 ms
- Indexed routing < 50 ms
- Graph expansion < 50 ms
- Local hybrid retrieval < 150 ms

Telemetry should include route, candidate count, graph hops, FTS/vector/rerank latency, Markdown reads, cloud fallback and total latency.

# Phase 16 — Mobile / UX Integration

Expose Memory, Topics, Projects, Sources, Claims, Evidence, Sync Status and Conflicts in Mobile/Remote Console without weakening existing security boundaries.

# Phase 17 — Hardening / Backup / Release

Before Stable:
- export / backup / restore
- local index rebuild
- cloud reconciliation
- secret scan
- RLS audit
- offline soak test
- interrupted sync test
- corrupted index test
- performance benchmark
- forward-fix migration strategy
- documentation / release checklist

---

# Milestones

| Milestone | Phases | Outcome |
|---|---|---|
| **M1 — Local Brain** | 0–5 | Markdown + SQLite + Index + Graph + Local Recall |
| **M2 — Intelligent Routing** | 6–7 | Mode Router + Conversation Archive |
| **M3 — Local ↔ Cloud** | 8–11 | Outbox + Sync + Conflict + Provenance |
| **M4 — Knowledge Intelligence** | 12–17 | Claims + Research + Summary + Eval + Mobile + Hardening |

# MVP Acceptance Gate

Before **Ceo Memory V2 Local-First Alpha**:

1. Explicit memory instruction creates local Markdown first.
2. Internet off: memory write succeeds.
3. Internet off: recall succeeds.
4. 10,000 memories: no full Markdown scan.
5. Project/Person/Date query reduces candidates before vector search.
6. Deleted/corrupted SQLite can rebuild from Markdown.
7. Internet restored: Outbox sync produces no duplicates.
8. Every memory traces to source.
9. Direct `node_id` read bypasses semantic search.
10. Supabase failure does not break Local Runtime/Memory.
11. Missing evidence causes abstention, not hallucination.
12. Revision collision creates a conflict record, not silent overwrite.

# Non-Negotiable Security & Project Boundaries

- Do not replace Ceo MCP Agent Core.
- Cloud/Knowledge/Ollama/connectors must never block Runtime startup.
- Keep Desktop Runtime and Cloud repositories separate.
- Original/binary local files remain local by default.
- Cloud receives extracted text/chunks + approved metadata/path/hash only.
- Never bypass Active Project Security Guard.
- Keep `document.read/verify` inside Active Project boundaries.
- Never expose service-role / secret credentials.
- Supabase changes are additive forward-fix migrations only.
- Never run `supabase db reset`.
- Remote Mobile remains bounded by an allowlist.
- No raw remote shell/PowerShell mutation through AI.
- Web/OCR/Drive/Document/API/Email content is **UNTRUSTED DATA**.
- AI interprets/plans; mutations go through Ceo Tool Router / approval / audit.
- Provider tokens must not be persisted in Worker/Supabase contrary to existing security policy.
- Local-only memory/note operations remain local unless explicitly approved for remote use.

# Current Implementation Status

M1-M2 were completed locally on 2026-08-31.

Certification evidence:
- Local/Knowledge targeted tests: 26/26 PASS.
- Desktop full suite: 364/364 PASS.
- Desktop TypeScript: PASS.
- MCP exposure check: PASS, 308 registered tools.
- 10,000-node benchmark: indexed recall 18.69 ms; direct stable-ID recall 14.26 ms; candidate count 1; Markdown reads 0; global semantic search false.
- ceo-knowledge verify: Worker 23/23, Shared 5/5, Shared/Mobile/Worker typechecks and builds PASS.
- No Supabase migration/deploy was required for M1-M2.

Phase 0 deliverables exist:
1. `MEMORY-V2-COMPATIBILITY-REPORT.md`
2. `MEMORY-V2-ARCHITECTURE.md`
3. `MEMORY-V2-DATA-MAPPING.md`
4. `MEMORY-V2-IMPLEMENTATION-PLAN.md`

The next implementation milestone is **M3 — Local ↔ Cloud**, beginning with additive stable-node replica mapping and an idempotent local Outbox. Cloud UUID primary keys remain unchanged.

# Deferred Until Core Is Stable

Defer until M1–M3 are stable:
- Voice Memory
- Media OCR/Vision Memory
- Advanced Proactive Triggers
- Advanced Cold Storage
- 3D Graph/Hologram UI
- Google Calendar Sync
- Complex multi-device auto-merge
- Advanced Semantic Cache
- Historical External API Verification

# Final Definition

```text
PC ONLINE
-> Local Memory fast
-> no Cloud round-trip for every Recall
-> offline capable

PC OFF / MOBILE
-> Cloud Memory remains available

LOCAL + CLOUD
-> same Stable Node ID
-> same graph contract
-> same provenance contract
-> synchronized replicas
-> conflicts do not destroy data
-> answers can trace to Source/Evidence
```

**This document is the primary reference roadmap for Ceo Knowledge Memory OS until a newer architecture version is explicitly approved.**
