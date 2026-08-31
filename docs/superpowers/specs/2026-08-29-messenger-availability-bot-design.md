# Messenger availability & rates bot

Extends the Messenger booking-status bot so it also answers the two questions guests
actually ask on the page: **is it available**, and **how much**. Today the webhook
deliberately stays silent on both and leaves them to the inbox.

Builds on the bot brought online 2026-08-28 (`src/app/api/messenger/webhook/route.ts`).
The `DL-BK…` status lookup and the `myid` helper are unchanged by this spec.

## 1. What this is, and what it is not

**Is:** an auto-responder that reads a guest's one-line question, checks the real
calendar, and replies in Taglish with the open stay windows for that date and what each
would cost for the stated pax.

**Is not:** a booking agent. It never creates, holds, or modifies a booking, and it never
takes payment. It answers and points at the site; a human still closes the sale.

**Is not:** conversational. It has no memory between messages. Every reply is computed
from the single message in front of it — which is why §4 answers *all* open stay types at
once rather than asking a follow-up question.

## 2. Source messages

The seven real guest messages this was designed against. They become the parser's test
fixtures verbatim (§8).

| # | Message | Intent | Extracted |
|---|---|---|---|
| 1 | `Ask ko lang kung may available unit po ba kayo for later and for 2 pax?Thankyouu` | availability | today, 2 pax |
| 2 | `Rates` | price | — |
| 3 | `2 pax for (#) nights` | price | 2 pax, N nights |
| 4 | `Available dates` | openDates | — |
| 5 | `aug 30 for 2 pax` | availability | Aug 30, 2 pax |
| 6 | `available po sept 4-6? 2 pax` | availability | Sep 4→6, 2 pax |
| 7 | `Hm` / `How much` | price | — |

Two intents dominate: **availability** (1, 4, 5, 6) and **price** (2, 3, 7). Both arrive in
English and in Taglish, often in the same sentence.

## 3. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How far does the bot commit | **Full answer** — live availability *and* price. Owner-chosen over safer hedging. |
| 2 | Reply language | **Always Taglish**, with `po`. One template set; no output-language detection. Input is parsed in both languages. |
| 3 | Unstated stay type | **List every open type** for that date with its price. Avoids a follow-up question, which the stateless bot cannot support. |
| 4 | Bare "Available dates" | **Next 14 days, Overnight only**, plus one line that Daycation/Nightcation exist and to ask about a date. |
| 5 | Where availability lives | **New `src/lib/availability.ts`**, extracted from the primitives `createBooking` already uses. Not a third copy (§5). |
| 6 | Pricing | **Reused unchanged** from `src/lib/pricing.ts` via `haven-adapter`. No new rate maths anywhere. |
| 7 | Staff overlap | **Accepted.** The bot may answer seconds before a human does. Meta's handover protocol is the real fix and is out of scope. |
| 8 | Non-booking chatter | **Still silent**, exactly as today. |

## 4. Live configuration this depends on

Read from the single `havens` row, not hardcoded. Values as of 2026-08-29:

| Window | Label | Times | Weekday | Weekend/holiday |
|---|---|---|---|---|
| `ten_hour` | Daycation | 07:00 → 17:00 | ₱1,499 | ₱1,799 |
| `six_hour` | Nightcation | 19:00 → 05:00 | ₱1,499 | ₱1,799 |
| `twenty_one_hour` | Overnight | 19:00 → 17:00 | ₱1,899 | ₱2,099 |

Capacity **4** counted pax, `extra_pax_fee` **₱200**, long-term pricing **on**.

Note the column convention, already established in `src/lib/haven-adapter.ts`: the
`six_hour_*` columns do **not** describe a six-hour stay. `six_hour_check_in/out` holds the
**Nightcation window**, and `six_hour_rate` holds the **10-hour weekend rate**. The bot must
go through `toRoom()` rather than reading these columns directly, or it will invent a
fourth stay type that does not exist.

Overnight and Nightcation both start 19:00, so they are mutually exclusive on a date. A
Daycation ends 17:00 and, with the 1-hour turnover, frees the unit at 18:00 — so a
Daycation *plus* an Overnight or Nightcation can both sell on the same date. The bot must
reproduce this or it will under-report availability.

## 5. `src/lib/availability.ts` (new)

Server-only. The single reason this work is architectural rather than a webhook tweak:
availability exists today in two places and neither is callable from the webhook — the
conflict SQL inside `createBooking` (`bookingController.ts` §"GENERAL ROOM AVAILABILITY
CHECK"), and a client-side reconstruction in the room page from `/api/bookings/room/:id`
plus blocked dates.

```ts
type StayWindow = {
  stayType: "10" | "21";
  label: "Daycation" | "Nightcation" | "Overnight";
  checkIn: string;   // "HH:MM"
  checkOut: string;  // "HH:MM"
};

openWindowsOn(dateISO: string): Promise<StayWindow[]>
isRangeOpen(checkInISO: string, nights: number, w: StayWindow): Promise<boolean>
openDatesAhead(days: number): Promise<string[]>   // Overnight only
```

Pax is deliberately **not** a parameter. Capacity is a fixed property of the unit (4), not a
per-date one, so it cannot change which windows are open — a 2-pax and a 5-pax enquiry see
the same calendar. The over-capacity case is a reply-layer concern (§7) and short-circuits
before any query runs. Threading pax through here would imply an availability rule that
does not exist.

Each composes the same predicate `createBooking` uses — `occupyingBookingSql()` for "this
booking still occupies the unit", `turnoverSql()` applied to **both** sides so neither stay
butts against the other's cleaning window — and adds:

- a `blocked_dates` overlap check (`from_date`/`to_date`, every row active; the table is
  empty today but the admin can fill it at any time), and
- the `isStartBookable` rule from `src/lib/bookingWindow.ts`: a window whose check-in has
  already passed in Manila time is not offered, however empty the unit is.

`openDatesAhead` is one query over a `generate_series`, not 14 round-trips.

**No behaviour is changed in `createBooking`.** It keeps its own inline query; §8's parity
test is what keeps the two honest. Migrating `createBooking` onto this module is the
natural follow-up and is deliberately not bundled here.

## 6. `src/lib/messenger-intent.ts` (new)

Pure, no DB, no I/O — so the seven fixtures run as fast unit tests.

```ts
type Intent =
  | { kind: "availability"; from: string; to?: string; pax?: number }
  | { kind: "price"; nights?: number; pax?: number }
  | { kind: "openDates" }
  | { kind: "bookingId"; id: string }
  | { kind: "none" };

parseGuestMessage(text: string, nowManila: Date): Intent
```

Recognised in both languages:

| Concept | Tokens |
|---|---|
| availability | `available`, `availability`, `meron`, `may available`, `bakante`, `open` |
| price | `rate`, `rates`, `how much`, `hm`, `magkano`, `presyo` |
| open dates | `available dates`, `anong dates`, `open dates` |
| relative day | `later`, `mamaya`, `today`, `ngayon`, `tonight`, `bukas`, `tomorrow` |
| pax | `2 pax`, `for 2`, `2 persons`, `2 adults`, `dalawa`, `tatlo` |
| nights | `3 nights`, `3 gabi`, `overnight` |

Date forms: `aug 30`, `august 30`, `8/30`, `sept 4-6`, `sep 4 to 6`. A bare month-day with
no year resolves to the **next** occurrence — `aug 30` asked on Dec 1 means next August, not
a date three months gone.

`kind: "bookingId"` keeps the existing `DL-BK…` behaviour ahead of the new intents, so a
message containing both a booking ID and the word "rates" still gets the status reply.

Ordering when a message matches several: `bookingId` → `openDates` → `availability` →
`price` → `none`. Message 1 is availability, not price, because a date beats a bare
keyword.

## 7. `src/lib/messenger-reply.ts` (new)

Pure. Takes resolved availability plus quotes and returns the Taglish string. Kept apart
from §5 and §6 so wording can be revised without touching calendar or parsing logic.

Shape of the main reply (message 5, `aug 30 for 2 pax`):

```
Available po kami sa Aug 30 (Sun) for 2 pax:

• Overnight (7PM–5PM) — ₱2,099
• Daycation (7AM–5PM) — ₱1,799
• Nightcation (7PM–5AM) — ₱1,799

Weekend/holiday rate po ang Aug 30. 50% down payment
para ma-reserve. Book po kayo dito: dlux-homes.vercel.app
```

All three appear because the date is wholly unbooked. They are **alternatives the guest
picks between**, not slots that coexist — Overnight and Nightcation share the 19:00 start,
so booking either removes the other. A reply can never list Overnight without Nightcation
(or the reverse) on an otherwise-free date; if one is gone, the other is too. Only Daycation
can survive alongside them, per §4.

The 50% figure matches `src/app/checkout/page.tsx`, which is the site's own reservation
maths. It is stated here as copy, not recomputed — if the down payment rule changes, this
template changes with it.

Rules:

- Only open windows are listed. If none are open, say so and offer `openDatesAhead(14)`.
- Prices come from `stayTotal()` + `extraPaxFee()`, never recomputed here.
- Multi-night (message 6) prices the whole range and shows the total plus night count.
- **pax > 4** short-circuits before any availability query: max-4 message, refer to staff.
- Unparseable (`kind: "none"` but booking-ish wording) asks for dates. Truly unrelated
  chatter returns `null` and the webhook sends nothing.

## 8. Testing

| Test | Guards |
|---|---|
| `messenger-intent.test.ts` | the seven §2 fixtures, plus past-date rollover and pax/night extraction |
| `messenger-reply.test.ts` | wording, weekday vs weekend price, extra-pax maths, the >4 and no-availability branches |
| `availability.test.ts` | a seeded booking blocks the right windows; Daycation + Overnight coexist on one date; blocked dates and elapsed windows are excluded |
| **parity test** | `isRangeOpen()` and `createBooking`'s conflict query return the same verdict for identical inputs |

The parity test is the one that matters. Approach A's whole risk is the extracted module
drifting from the query that actually guards the booking table; if the bot says open and
`createBooking` says taken, a guest is told yes and then refused.

## 9. Out of scope

Conversation memory or multi-turn clarification · Meta handover protocol · booking creation
or holds from Messenger · Instagram · English-language reply templates · migrating
`createBooking` onto `availability.ts` · any change to `pricing.ts`.

On that last point: the bot quotes exactly what the site quotes, which includes two known
pricing facts recorded elsewhere — the long-term tier boundaries in code are 3/11/18/26
nights while `agent_docs/business-rules.md` documents 5/12/20, and `bundleNightlyRate()`
has a defect where 20 nights costs less than 19 at 1–2 pax. Both are inherited unchanged
and deliberately not fixed here; correcting pricing inside a Messenger feature would bundle
unrelated risk into a customer-facing change.

## 10. Rollout note

The Meta app is still in **Development** mode, so only accounts holding an app role receive
replies. Real guests get silence until the app is switched Live and granted Advanced Access
for `pages_messaging` through App Review. This feature is testable but not customer-visible
until then.

## 11. Amendments made during implementation

**Calendar rules are loaded, not defaulted.** §7 originally called `isWeekendOrHoliday()`
and `pickRate()` with their built-in defaults. That was wrong: `DEFAULT_CALENDAR_RULES` is
Fri/Sat plus a *hardcoded* holiday list, while the storefront reads owner-editable values
from `pricing_settings.weekend_days` and `pricing_holidays` via
`GET /api/admin/pricing-calendar`. A bot on the defaults would quote the weekday rate on an
owner-added holiday while checkout charged the weekend one. `loadCalendarRules()` was added
to §5's module and a `rules` argument threaded through `quoteFor()` and
`availabilityReply()`.

Live values as of 2026-08-29: `weekend_days = [5,6]` — **Fri/Sat only, Sunday prices as a
weekday** — and 19 holidays. Note this contradicts `agent_docs/business-rules.md`, which
describes weekends as Fri/Sat/Sun; the database is what the storefront charges, so the bot
follows it. `messenger-reply.test.ts` pins the Sunday case explicitly.

**The pool is imported lazily.** `availability.ts` resolves `@/backend/config/db` through a
dynamic import inside `resolveDb()` rather than a top-level import, because the test runner
does not resolve the `@/` alias and the unit tests always inject their own `Queryable`.

**The parser accepts a bare pax/night count.** §6's precedence list required a keyword for
the `price` intent, which dropped the real message "2 pax for (#) nights" — it carries no
price word at all. A pax or night count with no other signal is now read as a quote request.

## 12. Data discrepancy found while verifying

`havens.six_hour_rate` — which by the column convention in §4 holds the **10-hour
weekend/holiday rate** — is **₱1,699** in the live database, while
`agent_docs/business-rules.md` records ₱1,799 for a weekend Daycation/Nightcation. The bot
quotes ₱1,699 because that is what the storefront and checkout also use. This is a data
question for the owner, not a code defect, and was deliberately left unchanged.
