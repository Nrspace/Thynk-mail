# Amazon SES — what was added to Thynk-mail

Ported from the ThynkFlow SES integration (backend/src/routes/integrations.js
+ webhooks.js) into Thynk-mail's multi-account architecture. SES now works
as a fully-fledged provider alongside Gmail/Zoho/Outlook/Brevo/SMTP.

## 1. Run the migration first
Open Supabase → SQL editor → run `migration-ses.sql`. It:
- adds `ses` as a valid `email_accounts.provider`
- adds SES credential/config columns (`ses_region`, `ses_access_key_id`,
  `ses_secret_access_key_encrypted`, `ses_configuration_set`)
- adds tracking columns to `send_logs` (`delivered_at`, `open_count`,
  `click_count`, `bounce_type`, `bounce_subtype`, `complained_at`)
- adds a `complained` status and widens the `events.type` check
- creates `increment_campaign_opens` / `increment_campaign_clicks` if missing

## 2. Install the new packages
```
npm install
```
Adds `@aws-sdk/client-ses` (sending) and `sns-validator` (verifies inbound
SNS webhook calls really came from AWS).

## 3. What changed in code
- `src/types/index.ts` — `ses` provider, SES account fields, extended
  `SendLog` tracking fields.
- `src/lib/smtp-router.ts` — new SES branch in `buildTransport()` using
  `@aws-sdk/client-ses` + nodemailer's SES transport; `sendEmail()` now
  tags SES sends with the `X-SES-CONFIGURATION-SET` header so SNS events
  fire for them.
- `src/app/api/accounts/route.ts` & `[id]/route.ts` — accept/validate/store
  SES credentials (secret key encrypted the same way `smtp_pass` is;
  access key ID stored plain, like a username).
- `src/app/api/webhooks/ses/route.ts` — **new**. Receives SNS notifications
  (Send/Delivery/Open/Click/Bounce/Complaint/Reject), auto-confirms the SNS
  subscription handshake, verifies the SNS signature, and updates
  `send_logs` + `events` + campaign open/click/bounce counts. Hard bounces
  and complaints also add the contact to `suppressions`.
- `src/app/api/accounts/ses-webhook-url/route.ts` — **new**. Returns the
  absolute webhook URL to paste into your SNS topic subscription.
- `src/app/accounts/page.tsx` — Amazon SES is now a provider tile in both
  the Add Account and Edit Account forms, with region/access key/secret
  key/configuration set fields, setup steps, and a copy-able webhook URL box.

## 4. One-time AWS setup (per SES account you add in Thynk-mail)
1. SES → Verified identities → verify your sending domain/email.
2. SES → Configuration sets → create one (e.g. `thynk-mail`) → enable
   **Open tracking** and **Click tracking**.
3. On that configuration set → Event destinations → add an SNS
   destination → select event types: Send, Delivery, Bounce, Complaint,
   Reject, Open, Click.
4. SNS → that topic → Create subscription → protocol **HTTPS** → endpoint
   = the URL shown in the account form (`/api/webhooks/ses`). It
   auto-confirms — no manual click needed.
5. In Thynk-mail → Accounts → Add Account → Amazon SES → fill in region,
   access key, secret key, and set "Configuration Set" to the name from
   step 2.

Note: a brand-new SES account starts in the **sandbox** (can only send to
verified addresses, low rate limit) — request production access in the
SES console before using it for real campaigns.
