# Ceo Memory Metabolism V3.1–V3.4

Status: **COMPLETE / PRODUCTION RELEASE 2026-09-02**

Goal: evolve Ceo Knowledge from append-only storage into a living knowledge system without replacing the Local-First Memory OS, Supabase replica, revision/conflict engine, or provenance model.

## V3.1 — Canonical write + lifecycle
- Normalize incoming Memory / Event / Task / Claim.
- Search before create; exact/canonical matches no-op or merge into the existing object.
- Stable replica object IDs use the current `revision` and real `base_revision`; rewrites no longer assume revision 1.
- Persist `canonical_key`, `lifecycle_status`, `valid_from`, `valid_to`, `superseded_by`.
- Lifecycle: `current`, `superseded`, `conflicting`, `stale`, `refuted`.
- `memory_supersede` explicitly links replacement knowledge without hard-delete.
- Migration: `20260902123000_ceo_knowledge_memory_metabolism_v31.sql`.

## V3.2 — Unified write paths
Search-before-create and V3 replica contracts are wired into:
- Auto Memory Memory/Event/Task ingestion.
- Mobile/API Memory/Event/Task creation.
- Claim creation.
- Existing Event/Task updates can enrich the canonical object instead of creating another row.
- Exact active-source context remains authoritative during follow-up updates.

## V3.3 — Hybrid retrieval
Recall uses a bounded hybrid ranking pipeline:
1. structured/entity/action/time/context score;
2. Thai fuzzy lexical score;
3. semantic similarity fallback;
4. existing retrieval prior/authority;
5. Reciprocal Rank Fusion (RRF);
6. quality gate.

Thai normalization covers common variants such as `ดูหนัง ↔ ภาพยนตร์`, `Big C / บิ๊กซี`, `รร. ↔ โรงเรียน`, school-name variants and attached Thai words. Freshness is only a bounded signal and never overrides an exact active-source lock. Default recall excludes superseded/stale/refuted nodes; conflicting nodes remain visible with reduced authority.

False-absence protection includes broad fuzzy fallback for structured Event and Task data and a safe bare-follow-up fallback when structured evidence already exists.

## V3.4 — Evaluation + Mobile provenance
Retrieval evaluation stores and reports:
- Recall@1
- Recall@3
- Recall@10
- MRR
- False Absence Rate

Golden secretary corpus: **55 real-form queries**, including PA school schedules, PTT scholarship, retirement events, Big C/movie activity, teaching supervision and task deadlines. Release gate: Recall@3 = 1.00, Recall@10 = 1.00, False Absence Rate = 0.

Mobile Memory now exposes lifecycle/provenance metadata: lifecycle state, revision, evidence status, source kind, source-reference count, validity date, supersession target and `ceo://` reference path. A `History` filter shows superseded/stale/refuted memory separately from normal Active recall.

## Safety / compatibility
- Additive forward-only migration; no database reset.
- No hard-delete during reconciliation.
- Existing conflict/revision RPC remains the single conflict engine.
- Existing provenance and stable Node IDs are preserved.
- Legacy Memory remains readable while mirrored canonical replicas take precedence.
- Personal recall still abstains when evidence is insufficient.

## Verification evidence
- Gateway: 181/181 tests pass.
- Shared: 9/9 tests pass.
- Mobile: 12/12 tests pass.
- Shared/Mobile/Worker TypeScript: PASS.
- Mobile production build: PASS.
- Worker production dry-run: PASS.
- Supabase migration local/remote: `20260902123000` applied and aligned.
