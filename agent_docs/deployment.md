# Deployment

Deployed on Vercel (production: dlux-homes.vercel.app). Vercel fails the deploy on any TypeScript or lint error, so run `npm run build` locally before pushing — it's the real gate, not just `next dev`.

Environment variables and SQL migrations are **not** synced automatically:
- Env vars (DATABASE_URL, NEXTAUTH_*, Cloudinary, Google OAuth, email) must be set in the Vercel project settings separately from local `.env`.
- SQL files under `src/backend/migrations/` must be applied to the Supabase database by hand — Vercel does not run them on deploy.

## Scheduled jobs (`/api/cron/*`)

There is **no `vercel.json`**, so Vercel schedules nothing. The Hobby plan only
offers once-a-day crons anyway, which is too coarse for
`send-self-checkin-emails` — that one has to fire within a ~15 minute window of
"2 hours before check-in" (see `src/lib/checkin-window.ts`). So the schedule
lives with an **external pinger** instead.

Every `/api/cron/*` route checks `CRON_SECRET` and **fails closed in production**
— unset means HTTP 503, wrong value means 401. Set it in Vercel to the same
value as local `.env`.

Configure one HTTP monitor per route (cron-job.org, UptimeRobot, GitHub Actions
— anything that can send a header):

| Field | Value |
|---|---|
| URL | `https://dlux-homes.vercel.app/api/cron/send-self-checkin-emails` |
| Method | GET |
| Interval | every 15 minutes |
| Header | `Authorization: Bearer <CRON_SECRET>` |

Same shape for `send-checkout-reminders` and `sync-icals`.

A healthy call returns `{"success":true,"summary":{"due":N,"sent":N,"failed":0}}`.
`due: 0` is normal and means nothing was ready to send yet — the jobs are
idempotent (`self_checkin_email_sent_at` is stamped only after a successful
send), so an extra ping never double-sends and a missed window just catches up
on the next run.

**Until a pinger exists, self check-in instructions never send automatically.**
An early check-in deliberately defers the email to this cron, so the fallback is
the "Send instructions now" button on any checked-in booking in the Bookings
table.
