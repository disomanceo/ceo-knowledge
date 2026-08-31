# Ceo Knowledge Memory OS V2 - Architecture

## Principles

Local-First, ID-First, Graph-First, Provenance-First, Offline-Safe and Backward-Compatible.

## Runtime path

```text
AI Client
  -> Ceo Tool Router
  -> Mode Router (CHAT / RECALL / RESEARCH / ACTION / LIVE)
  -> Memory Router
  -> Local SQLite indexes
  -> Topic / Project candidates
  -> Graph 1-hop
  -> FTS + optional local vector rerank
  -> Local result
  -> Cloud fallback only when local confidence is insufficient
```

## Local durable layout

```text
<Ceo Memory Root>/
  memories/YYYY/MM/*.md
  conversations/*.md
  summaries/*.md
  attachments/
  inbox/
  .ceo/memory-index.sqlite
```

Markdown is the rebuildable durable payload. SQLite is the fast catalog/index. Embeddings are indexed metadata, not the only copy of memory.

## Node contract

Node types: topic, memory, event, task, person, project, place, decision, document, source, summary, claim, conversation.

Taxonomy axes remain separate:
- memory_kind
- source_kind
- truth_status
- evidence_status

Graph edges use a bounded vocabulary including CHILD_OF, ABOUT, RELATED_TO, PART_OF, DERIVED_FROM, SUPPORTED_BY, CONTRADICTS, CONFIRMS, REFUTES, FOLLOWS and SUPERSEDES.

## Progressive recall

L0 direct stable ID -> L1 indexed recall -> L2 graph expansion -> L3 local hybrid -> L4 global semantic/cloud fallback.

A normal indexed recall never scans Markdown files. Markdown scanning is reserved for explicit index rebuild.

## Explicit memory rule

Explicit memory instructions become permanent + pinned locally. Validation, deduplication and provenance remain required.

## Failure policy

Local SQLite is loaded dynamically and fail-soft. If Local Memory is unavailable, existing Cloud Knowledge continues. If Cloud is unavailable but Local commit succeeds, the memory remains available locally. Runtime startup must not depend on either cloud or local memory readiness.
