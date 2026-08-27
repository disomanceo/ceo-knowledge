# Security Model

## Principles

1. Mobile never receives Supabase `service_role`.
2. Worker uses the public Supabase publishable key plus the user's JWT; RLS remains the authorization boundary.
3. User ownership is enforced by `auth.uid() = user_id` policies.
4. Device secret material is not readable from normal authenticated tables.
5. Remote execution is allowlisted. No raw PowerShell, arbitrary process execution or arbitrary shell command is accepted from Mobile in V1.2.
6. Local file binaries stay local by default.

## Device credentials

`ceo_knowledge.device_credentials` is private. Default privileges from V1.0 are explicitly revoked for `authenticated`. Device registration, heartbeat, pairing and job lifecycle use security-definer RPCs that validate both `auth.uid()` and the per-device token hash.

The raw device token is generated locally and stored with Windows DPAPI. Only SHA-256 is stored in Supabase.

## Pairing

- Six numeric digits.
- 10-minute lifetime.
- Only the SHA-256 hash is stored in the database.
- Successful claim marks the device trusted.
- A new pairing request cancels older unclaimed pairings for that device.

## Remote tools

The common allowlist is in `packages/shared/src/index.ts`. Keep the Desktop allowlist in sync. Adding a mutating tool requires a separate security review and, when appropriate, explicit approval state.

## Connector credentials

`connector_accounts` is not exposed to authenticated clients. Connector token implementation must encrypt credentials or keep them in provider/Worker secret storage. Never put OAuth refresh tokens into PWA localStorage.

## Audit

Important cloud/user/device actions should write `audit_logs`. Do not put raw tokens, passwords, API keys, full sensitive documents or private binary content into audit details.

## Key policy

- `sb_publishable_*`: public client configuration, allowed in Worker/PWA source/config.
- `service_role` / `sb_secret_*`: backend-only; currently not required by the Worker design.
- Cloud LLM key: Worker secret only when enabled.
- Device token: DPAPI locally; hash only in Supabase.
