# Deployment

Deployed on Vercel (production: dlux-homes.vercel.app). Vercel fails the deploy on any TypeScript or lint error, so run `npm run build` locally before pushing — it's the real gate, not just `next dev`.

Environment variables and SQL migrations are **not** synced automatically:
- Env vars (DATABASE_URL, NEXTAUTH_*, Cloudinary, Google OAuth, email) must be set in the Vercel project settings separately from local `.env`.
- SQL files under `src/backend/migrations/` must be applied to the Supabase database by hand — Vercel does not run them on deploy.

## Scheduled jobs (`/api/cron/*`)

There is **no `vercel.json`**, so Vercel schedules nothing. The Hobby plan only
offers once-a-day crons anyway, which is too coarse for
`send-self-checkin-emails`: that email goes out `CHECKIN_LEAD_MINUTES` before
check-in — **15 minutes**, defined in `src/lib/checkin-window.ts`, which is also
the moment the unit opens and the admin Check-in button unlocks. So the schedule
lives with an **external pinger** instead.

**The ping interval must be SHORTER than the lead.** The job can only fire when
the pinger calls it, so a 15-minute interval against a 15-minute lead lets an
email land up to 15 minutes late — at the check-in time rather than before it.
The guest then arrives on time with no instructions, which is exactly the case
the lead exists to prevent. Five minutes gives the margin. If
`CHECKIN_LEAD_MINUTES` ever changes, revisit this interval with it.

Every `/api/cron/*` route checks `CRON_SECRET` and **fails closed in production**
— unset means HTTP 503, wrong value means 401. Set it in Vercel to the same
value as local `.env`.

Configure one HTTP monitor per route (cron-job.org, UptimeRobot, GitHub Actions
— anything that can send a header):

| Field | Value |
|---|---|
| URL | `https://dlux-homes.vercel.app/api/cron/send-self-checkin-emails` |
| Method | GET |
| Interval | **every 5 minutes** (must be shorter than `CHECKIN_LEAD_MINUTES`) |
| Header | `Authorization: Bearer <CRON_SECRET>` |

Same shape for `send-checkout-reminders` and `sync-icals`, except that neither
is lead-sensitive — every 15 minutes is fine for those two.

A fourth route, `send-messenger-followups`, nudges guests who were quoted on
Messenger and went quiet. It is lead-sensitive the same way: the nudge is due
`MESSENGER_FOLLOWUP_MINUTES` (10, in `src/lib/messenger-context.ts`) after the
quote, so a 15-minute ping delivers it 10–25 minutes late while **every 5
minutes** keeps it to 10–15. It returns `{"success":true,"due":N,"sent":N,
"skipped":N}` rather than the `summary` shape above, and is idempotent by a
claim-before-send guard, so overlapping pings cannot double-message a guest.
Without a pinger no nudge is ever sent — there is no in-app fallback for this
one.

A healthy call returns `{"success":true,"summary":{"due":N,"sent":N,"failed":0}}`.
`due: 0` is normal and means nothing was ready to send yet — the jobs are
idempotent (`self_checkin_email_sent_at` is stamped only after a successful
send), so an extra ping never double-sends and a missed window just catches up
on the next run.

**Until a pinger exists, self check-in instructions never send automatically.**
An early check-in deliberately defers the email to this cron, so the fallback is
the "Send instructions now" button on any checked-in booking in the Bookings
table.
