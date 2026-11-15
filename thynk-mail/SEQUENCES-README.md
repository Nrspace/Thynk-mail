# Email Sequences (auto-scheduled drip)

Build a 2-5 email sequence once; MailFlow sends each email automatically on the schedule you set.

## Setup (3 steps)
1. **Supabase** -> SQL editor -> run `migration-sequences.sql`.
2. **Upload the files** in this package to GitHub (same folder paths). Vercel redeploys.
3. **Start the free scheduler (no Vercel cron needed).** Open `supabase-cron-setup.sql`, put your
   app URL and `CRON_SECRET` (must match the Vercel env var) into it, and run it in the Supabase
   SQL editor. Supabase then calls `/api/cron/send-tick` every minute.
   Backup option: `.github/workflows/send-tick.yml` (every 5 min via GitHub Actions; needs
   `APP_URL` and `CRON_SECRET` repo secrets; only free for public repos at this frequency).

## How it works
- Sequences -> New Sequence. Pick accounts, lists, timezone (default IST), start time, then add emails.
- For each email after the first: "wait N days/hours after the previous email, send at HH:MM",
  and who gets it: everyone from Email 1, or only those who opened / did not open / clicked /
  did not click the previous email.
- Launch creates every email as a normal campaign (shown in Campaigns with a "Sequence · Email n" tag),
  so tracking, unsubscribes, bounces, rate limits and Reports work exactly as before.
- An email starts only when its time has come AND the previous email has fully finished sending.
- If the daily account limit is hit mid-email, it continues automatically the next day.
- Unsubscribed / bounced / suppressed contacts never receive later emails.
- Failure or repeated send errors auto-pause the sequence with a note; fix and press Resume.
- Pause / Resume / Cancel from the sequence page. Edits to a launched email's content are done
  from its campaign page; status, schedule and recipients are locked to the sequence.
- Only draft sequences can have their structure edited.
