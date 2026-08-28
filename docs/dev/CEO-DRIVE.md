# Ceo Drive V1

Ceo Drive is the Ceo-owned cloud-document connector. Google Drive is the first backend, but the Mobile/Worker contract is named and owned by Ceo.

## V1 goals

- read-only Google Drive access
- user selects a file before any import
- Preview before Import
- no Google provider token persisted in Supabase or Worker storage
- no Supabase `service_role` required
- imported cloud text becomes normal Ceo Knowledge using existing RLS
- binary files that need PDF/Office parsing are explicitly deferred to Ceo Runtime instead of pretending the Worker can parse them

## OAuth / token boundary

Ceo Mobile uses the existing authenticated Supabase user and calls `supabase.auth.linkIdentity({ provider: 'google' })` with the single read scope:

`https://www.googleapis.com/auth/drive.readonly`

The returned Google provider token is captured into browser `sessionStorage` only. It is sent to the Ceo Worker only as `x-ceo-drive-token` for a Drive request. The Worker does not persist it, and V1 deliberately does not persist a provider refresh token. Closing the browser session or using Disconnect removes the local token and the user reconnects when needed.

## Supported Cloud Import types

- Google Docs → Markdown export
- Google Sheets → CSV export (first sheet)
- Google Slides → plain text export
- Google Apps Script → JSON export
- text/plain, Markdown, CSV/TSV, JSON, XML, YAML, HTML/JS text files

The following V1 types return `RUNTIME_IMPORT_REQUIRED` rather than being parsed in Cloudflare Worker:

- PDF
- Word / DOCX
- Excel / XLSX
- PowerPoint / PPTX

## Import path

```text
Ceo Mobile
 -> Google Drive read-only token (browser session)
 -> Ceo Worker list/preview
 -> user presses Import
 -> source metadata (external_provider=ceo-drive-google)
 -> ingest_run (engine=ceo-drive-cloud)
 -> Knowledge entry
 -> text chunks (no cloud embedding)
 -> existing Hybrid/Graph pipeline can enrich later
```

Original Drive files are never uploaded to Supabase as binary files. The cloud import stores the selected exported text plus source metadata.

## Dedup / update

- source is matched by Drive file id using `external_provider + external_id`
- Knowledge fingerprint is derived from Drive file id + normalized content
- unchanged files merge into the same Knowledge fingerprint
- a changed file creates the current fingerprint/content while source metadata is updated
- chunk rows are upserted and stale active chunks are archived after the current set saves successfully

## Production status

Ceo Drive V1 source is deployed to the production Worker and Mobile PWA. Current production verification after commit `b6126ab`:

- Worker health: OK
- Pages: HTTP 200
- Drive routes are protected by normal Ceo/Supabase authentication
- production Mobile bundle contains Drive UI and Drive read-only OAuth scope
- Google OAuth provider in Maple is still disabled, so real Google Drive consent/list/preview/import awaits the one-time Google OAuth client setup below

## One-time Google/Supabase setup required

Maple currently reports `external.google = false`. Ceo Drive source is ready, but real OAuth cannot start until Google Auth is configured in Supabase.

1. Create a Google OAuth Web client in the Google Cloud project that will own Ceo Drive.
2. Enable Google Drive API for that project.
3. Add the Supabase Auth callback as an Authorized redirect URI: `https://pcvdtcntyzndhfxfawbo.supabase.co/auth/v1/callback`.
4. In Supabase Authentication > Providers > Google, enable Google and enter the client ID/secret.
5. Ensure the Ceo Mobile URL is allowed as an Auth redirect URL: `https://ceo-knowledge.pages.dev/?tab=drive`.
6. If manual identity linking is disabled in Supabase, enable it before testing `linkIdentity`.

Do not put the Google client secret in the PWA, Git repo, Worker vars or browser storage. The client secret belongs in Supabase Auth provider configuration.

## Test checklist

1. Open Ceo Mobile and confirm the Chat composer sits above the bottom nav.
2. Open Drive. Before Google provider setup, it must show `Setup Required`, not a broken Connect flow.
3. Enable Google provider and reload Drive; press Connect Ceo Drive.
4. Consent only to Drive read-only scope.
5. Browse My Drive root and open a folder.
6. Preview a Google Doc; content must appear before Import is enabled.
7. Import the Doc and confirm a Knowledge id + chunk count is returned.
8. Import the same unchanged file again and confirm source/Knowledge does not duplicate.
9. Preview a PDF and confirm Ceo says `Runtime required` instead of cloud-importing it.
10. Disconnect; Drive token must disappear from the browser session and subsequent Drive API calls must require reconnect.
