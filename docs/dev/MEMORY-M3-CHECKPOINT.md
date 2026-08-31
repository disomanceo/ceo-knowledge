# Memory OS M3 Checkpoint — 2026-08-31

Status: WIP checkpoint, not production-certified.

## Completed in this checkpoint

- Local durable SQLite Outbox for Local -> Cloud replica sync.
- Deterministic client_event_id and idempotent retry behavior.
- Cloud pull -> Local Markdown/SQLite using stable node_id.
- Optimistic base_revision / revision conflict detection.
- Local conflict snapshots without silent overwrite.
- Local and Cloud provenance contracts for SOURCE and DERIVED_FROM.
- Desktop Knowledge bridge routes for apply/pull/conflict/provenance.
- Worker/Mobile stable replica integration and replica-aware memory list.
- Mobile replica rows marked SYNC and protected from legacy forget route.
- Shared M3 Sync / Conflict / Provenance contracts.
- Additive M3 migration draft: 20260831210000_ceo_knowledge_memory_os_m3.sql.

## Verified

- Memory sync tests: 7/7 PASS.
- Local Knowledge integration: 4/4 PASS.
- Desktop Knowledge service M3 bridge: PASS.
- Worker M3 API: 3/3 PASS.
- M3 migration static safety test: PASS.
- Local remember ACKs before any Cloud round-trip.

## Production blocker

Supabase Maple migration history contains version `20260828133000`, but the corresponding migration file is missing from this repository and Git history. It was previously applied from an uncommitted working copy.

Do NOT use `supabase migration repair`, `supabase db reset`, or a blind `supabase db pull` to bypass this mismatch.

Next step:
1. Reconstruct `20260828133000_ceo_knowledge_v21_remote_console_controls.sql` from the existing v1.2 remote-runtime migration plus current Device Access / Runtime Approval function contracts.
2. Run `supabase db push --dry-run` and require it to show only the M3 migration as pending.
3. Run full Desktop + ceo-knowledge verification.
4. Push additive M3 migration to Maple.
5. Run production Local -> Cloud -> Local, conflict, and provenance E2E.
6. Deploy Worker/Mobile only after production E2E passes.
7. Mark M3 DONE in MEMORY-OS-ROADMAP.md.

## Safety boundaries

- No service_role on Desktop/Mobile.
- No destructive Supabase reset.
- No direct authenticated INSERT/UPDATE/DELETE on M3 replica tables; mutation goes through bounded authenticated RPCs.
- Existing domain-table UUID primary keys are unchanged.
- Browser Companion stash in Ceo-MCP-Agent is untouched.