# Ceo Knowledge Auto Memory

Auto Memory is the central capture path for ChatGPT, Claude, Gemini, Ceo Mobile, Runtime, and direct API clients. Clients send one user turn to the same decision service instead of implementing separate memory rules.

## Endpoint

`POST /api/memory/auto-capture`

Alias: `POST /api/auto-memory/capture`

Authentication is the same Bearer token used by the rest of Ceo Knowledge.

Example request:

```json
{
  "message": "18 ก.ย. 2569 เวลา 17.00 น. มีงานเลี้ยงเกษียณ",
  "source": "chatgpt",
  "conversationId": "chatgpt:conversation-id",
  "sourceRef": "chatgpt://conversation-id",
  "projectId": "project_ceo",
  "timezone": "Asia/Bangkok"
}
```

Set `dryRun: true` to classify without writing anything.

## Classification

Every turn is classified as one of:

- `memory` — durable fact, preference, rule, decision, or context.
- `event` — meeting, appointment, activity, reminder, or other dated event.
- `task` — obligation, deadline, or follow-up action.
- `contact` — durable person/contact information.
- `project_knowledge` — reusable project/system decision or technical context.
- `ignore` — ordinary conversation/question or low-value information.

When `LLM_API_KEY` is configured, ambiguous non-secret turns may use the configured OpenAI-compatible classifier. High-confidence ordinary questions are kept on the deterministic path to avoid unnecessary AI calls. If the classifier is unavailable, heuristic classification remains functional.

## Retention score

The score is deterministic and bounded to 0..1:

```text
0.30 * user relevance
+ 0.25 * future utility
+ 0.20 * event salience
+ 0.15 * engagement
+ 0.10 * confidence
```

Retention policy:

- `>= 0.75` -> `permanent` and eligible for domain persistence.
- `0.50..0.749` -> `consolidation`; archive only.
- `0.30..0.499` -> `daily_log`; archive only.
- `< 0.30` -> `none`.
- `ignore` always has `none` retention.
- Explicit `จำไว้` / `บันทึกไว้` / equivalent commands override to permanent and are marked `pinned`, unless the secret guard blocks the content.

## Storage contract

Auto Memory does not copy the whole transcript into durable memory.

It stores compact conversation state in `conversation_summaries`: summary, decisions, open loops, selected facts, topics, classification, score, source reference, and the latest capture fingerprint.

Only high-confidence permanent decisions write to their domain table:

- `memory` -> `memories` + Memory OS replica event.
- `event` -> `events`.
- `task` -> `tasks`.
- `contact` -> `people`.
- `project_knowledge` -> `knowledge_entries`.

Text project references such as `project_ceo` are preserved in metadata as `projectRef`. The legacy `project_id` foreign key is populated only when the supplied value is a valid UUID.

## Safety and idempotency

The capture path rejects obvious passwords, API keys, tokens, private keys, OTP/CVV values, and explicitly labelled Thai national-ID/bank-account values before archive or domain persistence.

Conversation captures use a deterministic fingerprint. Repeated Event/Task retries first resolve the existing domain item by `metadata.captureFingerprint`, preventing a successful archive from suppressing a domain retry after a partial failure.

`/api/chat` calls Auto Memory before the normal chat pipeline. Explicit remember commands return the saved Auto Memory result immediately; Auto Memory failures are fail-soft so normal chat remains available.
