# Ceo Product Role — ChatGPT Brain + Ceo Remote Console

## Decision

Do **not** re-architect or replace the existing Ceo Core. The current Cloud/Runtime/Knowledge design remains the foundation.

The product roles are:

- **ChatGPT** — primary conversational brain/UI when the user wants natural long-form conversation and agent reasoning.
- **Ceo Mobile Web** — Remote Console + Secretary Dashboard, optimized for status, tasks, today, devices, knowledge, graph, drive and remote operations.
- **Ceo Chat / Ollama** — fallback AI inside the Remote Console when ChatGPT is not being used or a local/offline-style path is useful. It is not a goal to reproduce the full ChatGPT conversation product.
- **Ceo Cloud Worker** — authenticated gateway/orchestrator.
- **Ceo Knowledge** — durable Memory / Events / Tasks / People / Decisions / Sources / Graph.
- **Ceo Device Agent + Runtime** — trusted outbound bridge to local MCP tools and the computer.

## Architecture remains unchanged

```text
Primary conversation
ChatGPT
   -> Ceo bridge/MCP when that client path is available
   -> Ceo Tools / Knowledge / Runtime

Mobile operations
Ceo Mobile Remote Console
   -> Cloud Worker / Supabase
   -> runtime_jobs
   -> trusted Device Agent
   -> Ceo Runtime / MCP / Ollama

Fallback conversation
Ceo Mobile Chat
   -> AUTO Router
   -> local Ollama when trusted Runtime is online
   -> Cloud/Knowledge fallback
```

No Core database migration is required for this role decision. Do not move Desktop Runtime into the Cloud repository and do not make local Runtime startup depend on Cloud services.

## Mobile Console priorities

1. Console summary / system readiness
2. Today and Tasks
3. Devices / Pairing / Remote Jobs / Approvals
4. Knowledge / Memory / Graph
5. Drive and future Calendar connectors
6. Notifications / follow-up reminders
7. Chat/Ollama as fallback, not the main product surface

## UX rule

The default Mobile page is **Console**, not Chat. Chat remains accessible but should be labelled as fallback. Memory remains available from Console even when it is not a bottom-nav item.

## Security rule

Changing the product role must never weaken existing controls: trusted-device requirement, Remote Safe Tool allowlist, RLS, Active Project boundaries, approval requirements for future mutation classes, and no raw remote shell/PowerShell exposure.
