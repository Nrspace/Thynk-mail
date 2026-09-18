# Fixes applied

Run `migration-fix-issues.sql` against your Supabase database before deploying
this build — it adds one column needed for fix #4.

## 1. "All Contacts" count showing 1000 instead of the real number
**Cause:** Supabase/PostgREST caps every `select()` at 1000 rows by default
(`db.max_rows`) unless you explicitly page through with `.range()`.
`/api/contacts` (GET) had no paging, so no matter how many contacts you had,
the API always handed back exactly 1000 of them.

**Fix:** `src/app/api/contacts/route.ts` now uses a paging helper
(`fetchAllRows`, new file `src/lib/db-paginate.ts`) that keeps requesting
pages of 1000 until it gets a short page back, so it returns every contact.

## 2. Selecting a contact list showed nothing for that list
**Cause:** Two separate bugs stacked on each other:
- The contacts page (`src/app/contacts/page.tsx`) loaded **all** contacts once
  on mount and never refetched or filtered when you clicked a different list
  in the sidebar — `activeList` changed but nothing used it.
- Even the API's own list filter (`GET /api/contacts?list_id=...`) was
  capped at 1000 rows for the `contact_lists` join lookup, so a list with
  more members than that would only ever resolve its first 1000.

**Fix:** The contacts page now calls `/api/contacts?list_id=...` and
re-fetches every time you change the selected list. The API paginates the
join-table lookup and chunks the resulting `.in(id, ...)` contact query so
large lists resolve fully.

## 3. Contact list delete & contact delete not working
**Cause:**
- The per-row **delete button for an individual contact had no click
  handler at all**, and there was no `DELETE /api/contacts/[id]` endpoint to
  call even if it had one.
- List deletion existed, but for large lists it built an unchunked
  `.in('id', thousandsOfIds)` query. That produces a URL long enough to be
  rejected by the server/proxy, and the resulting error was never checked —
  so the list would appear to vanish from the UI while most of its contacts
  silently stayed behind.

**Fix:**
- Added `src/app/api/contacts/[id]/route.ts` (DELETE + PATCH) and wired the
  contacts page's delete button + a confirmation modal to it.
- `src/app/api/contacts/lists/[id]/route.ts` now chunks every `.in()` call
  and checks/returns every error instead of ignoring it.

## 4. Sending 10k+ emails sends more than the actual contact count (duplicates)
**Cause:** Nothing stopped two invocations of the send worker
(`processCampaignChunk`) from running for the *same* campaign at the *same*
time — e.g. the Vercel Cron tick firing for a campaign while the browser's
own retry loop (`/api/send/queue`) was still mid-chunk for it. Both
invocations would independently grab the same batch of "queued" recipients
and send to them before either one had marked those rows as sent —
i.e. duplicate emails to the same people.

**Fix:** `src/lib/campaign-sender.ts` now takes out a short, self-expiring
lock on the campaign row (`campaigns.processing_lock_at`, added by
`migration-fix-issues.sql`) before doing any work. Only one caller can hold
it — a second, concurrent caller's lock-acquire attempt matches zero rows
and backs off instead of proceeding. The lock is always released in
`finally`, and self-expires after 2 minutes even if release is somehow
skipped, so it can never permanently wedge a campaign.

## 5. No way to send a test email for a campaign
**Fix:** Added a "Send a test email" box to `src/components/campaigns/
CampaignForm.tsx` — enter any address and it sends the campaign's current
subject/body through the already-existing (but previously unused)
`POST /api/send/now` endpoint. Merge tags (`{{first_name}}` etc.) are filled
with placeholder values so the layout can be checked. This does not touch
campaign status or count against real recipients.

## 6. Editing a template's HTML adds extra padding/blank space every time
**Cause:** Opening a saved template for editing loads its saved `html_body`
(which is already a *complete* wrapped document — head/body/table shell
with 32px padding) into a single editable "HTML" block. Saving then ran that
one block back through `buildFullHtml()`, which wraps *every* template in
that same standard shell — nesting a fresh copy of the wrapper and its
padding inside the previous one. Each edit-save cycle added another layer,
which is exactly the growing blank space you saw.

**Fix:** `buildFullHtml()` in both `src/app/templates/new/page.tsx` and
`src/app/templates/[id]/edit/page.tsx` now detects when the template is a
single HTML block that is *already* a full document (has its own
`<html>`/`<!DOCTYPE>`) and saves it as-is instead of wrapping it again.

---

Not yet possible to verify in this environment (no network/`npm install`
access): a full `npm run build`. All changed files were checked with the
TypeScript parser (syntax-only) and passed; a full type-check build is
recommended before deploying.
