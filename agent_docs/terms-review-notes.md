# Terms & Conditions — review notes (internal)

Working notes behind [TERMS_AND_CONDITIONS.md](../TERMS_AND_CONDITIONS.md)
v2.1. **Not** part of the guest-facing agreement — it was split out of the
Terms themselves on 19 August 2026 so the published document contains nothing
but the agreement.

Covers what changed from the owner's v2.0 draft, the open items that still need
a decision, and where each clause is enforced in code.

---


## A. What changed from Version 2.0

Corrections made because v2.0 contradicted, or was silent on, how the booking
system actually behaves.

| § | Change | Why |
|---|---|---|
| *(front)* | **New — "Please read before you pay" summary**, placed above §1: a no-cancellation/no-refund callout, then a 10-row table of the questions guests actually ask, each linking to its clause | Guests skim and stop early. The no-refund rule was ~370 lines in, which is not meaningful disclosure for the single most consequential term. Carries an express "the numbered clause applies" precedence line so the summary can't be read as varying the Terms |
| 2.1 | Added the `DL-BK` booking reference | The system issues one; guests need to know what it is |
| 2.3 | **New — booking stages**, written in plain language | v2.0 described confirmation but never the stages guests see in emails. Drafted first as a diagram using the internal dashboard labels ("Awaiting payment / Down paid"), then rewritten — those are derived admin statuses no guest would recognise |
| 2.6 | **New — expired requests** | The system marks unapproved/unpaid requests as Expired once check-in passes; v2.0 had no equivalent |
| 2.7 | **New — rejection** | v2.0 never stated that a request can be declined, though the system does this routinely |
| 3 | Added the actual stay schedule table | v2.0 named the three stay types but gave no hours at all |
| 3.1 | **New** — single-session rule + 60-night cap | Both are enforced in the booking flow; neither appeared in v2.0 |
| 3.2 | **New** — shared dates | Explains why a Daycation and an Overnight can share a date. v2.0's separate "Cleaning Turnover" clause is deliberately **not** carried over: the turnover is an operational matter, so the Terms state only that unavailable times are not offered, without committing to a duration |
| 4.2 | Additional guest charge stated as **per night** for Overnight, once for 10-hour | Material charge term that v2.0 omitted entirely |
| 4.3 | Children cap stated as **4** | v2.0 said only "subject to occupancy limits" |
| 5.1 | "may be required" → **required**; booking cannot be submitted without ID | Checkout hard-blocks submission without an ID for every guest 10+ |
| 6.1 | Added "Philippine Pesos" | Currency was never stated in v2.0 |
| 6.2 | **New** — weekday / weekend / holiday rates, priced per night | v2.0 had no mention that rates vary by date; this is the single biggest pricing surprise for guests |
| 6.3 | Long-stay pricing moved out of "Additional Charges" into its own clause | v2.0 listed it as an *additional charge*; it is the opposite — a repricing of the whole stay, with its own guest charge that **replaces** the normal one |
| 6.6 | Senior/PWD stated as 20% of **that guest's own share**, not of the whole bill; birthday required at checkout | v2.0's wording invited the common misreading that the whole booking gets 20% off |
| 7.1 | Made explicit that the down payment is taken **before** approval | Drives §7.7; guests pay before anyone has accepted their request |
| 7.5 | "when requested" → reference and proof required **at checkout** | They are mandatory fields |
| 7.7 | **New — refund on rejection or expiry** | The most serious gap in v2.0: guests pay 50% up front, so a rejected or expired request must refund. v2.0's §8.1 arguably made that money non-refundable |
| 8 | **Section rebuilt**, 5 subsections → 12, opening with a warning callout and an outcome table. See **B.0** — two clauses in it need owner sign-off | Guests dispute this section more than any other, and v2.0 left most of the practical questions unanswered |
| 8.2 | Cross-referenced §7.7 and §21; added that cancelling in the booking account forfeits payment | Keeps "non-refundable" from swallowing the pre-confirmation refund, and warns about a button the app already exposes |
| 8.5 | "within 1 month of the original **booking date**" → "**check-in date**" | v2.0's wording was ambiguous and did not match the owner's rule |
| 8.6 | **New** — worked examples against a sample check-in date | The 7-day and 1-month limits are both easy to misread, and both must be satisfied |
| 8.8 | **New** — rate difference on a date change | Previously unaddressed; a weekday→weekend move costs more |
| 9.2 | Rewritten: check-in **opens 1 hour before** the scheduled time | v2.0 said only that early check-in "is not guaranteed", which understates what the system grants. The self-check-in email fires at this point |
| 10.2 | Late check-out charge described as assessed case by case | v2.0 referred to "an applicable late check-out fee"; no such fixed fee exists |
| 12.1 | Restored: no food/drink in living area or bedroom; **no daily housekeeping** | Both are on the owner's printed sheet and were dropped in v2.0. "We only clean upon check-out" is an expectation guests need set |
| 12.2 | Restored the bidet instruction | On the owner's sheet |
| 12.4 | Restored the location of the smoking area (Gates 2 and 3) | On the owner's sheet |
| 17 | Retitled and **added a limitation of liability** (17.1, 17.3, 17.4) | v2.0 covered guest property only, and capped nothing |
| 18 | Added date of birth to the collected-data list; **new §18.1** on storage and third-party processors | Required for a complete RA 10173 notice — ID photos go to a third-party image host |
| 21 | Host cancellation within its control → refunded **in full** | v2.0's "refunded as applicable" was vague enough to be unenforceable |
| 26 | Binding sentence changed from "By checking the acknowledgment box" to "By submitting the booking" | **See §B.1 — there is no checkbox in the system** |

## B. Open items for the owner

**B.0 — §8 was expanded on 19 August 2026 and two clauses in it need your
sign-off.** The section now runs 8.1–8.12 with a summary table and worked
examples. Most of it restates rules you already set, but two clauses state
policy that was not written down anywhere before, and I inferred them:

- **§8.3 — withdrawing a request before confirmation refunds the down payment
  in full.** The reasoning: the guest pays at checkout, before you have accepted
  the request, so at that point no agreement exists yet. It is the same logic
  §7.7 already applies to a request you reject or that expires. If you would
  rather forfeit the down payment on withdrawal, or charge a handling fee, say
  so and §8.3 changes. Note that the app already lets a guest cancel while the
  booking is `pending` ([/api/bookings/[id]/cancel](../src/app/api/bookings/[id]/cancel/route.ts)),
  so this situation can arise today whether or not the Terms address it.
- **§8.11 — a no-show is judged against the check-in period**, i.e. a guest who
  never arrives during their check-in window and has not contacted you. The
  system does not compute no-shows; staff mark them. Confirm this matches how
  you actually decide.

Also new and worth a read: **§8.2 now warns that using the cancel option in the
booking account forfeits payment**. The app exposes cancellation to guests for
`pending`, `approved`, `confirmed` and `on-going` bookings, but nothing in the
UI says the money is gone. Until the checkout or the My Bookings screen says so
at the point of clicking, the Terms are doing that work alone.

**B.1 — DONE (19 Aug 2026). Acceptance is now gated before payment.** Previously
there was no checkbox at all: the review step showed a four-bullet "You're
agreeing to" panel with no input, on the *last* screen — after the guest had
already transferred the down payment.

The gate now sits at the **end of step 0 (Your details)**, so accepting is what
unlocks step 1 and the GCash/BPI account details. Placement is the whole point:
the down payment is a manual transfer the guest makes outside the app and cannot
reverse, so the no-cancellation terms have to be shown *before* it. **Do not move
this gate later in the flow.** The review-step panel remains, demoted to a
reminder that shows which version was accepted.

Enforcement uses the step's existing `fieldErrors` machinery — `terms` is added
to the error set, which gates the desktop and mobile Continue buttons through one
rule rather than two.

*Known limit:* the gate is **client-side only**. `createBooking` stores
`terms_version` / `terms_accepted_at` when sent but does not require them, so a
request posted directly to `/api/bookings` can still create a booking with no
acceptance record (it lands NULL). Only the site's own checkout can reach the
payment step, so this is not a live hole — but if you want the guarantee to be
structural rather than a UI convention, reject a booking with no
`terms_version` server-side.

**B.2 — DONE (19 Aug 2026). The Terms are published at `/terms`.**
[src/app/terms/page.tsx](../src/app/terms/page.tsx) renders
`TERMS_AND_CONDITIONS.md` itself, read at build time, so the published page and
the file the owner edits can never disagree. The checkout gate and the
review-step reminder both link to it in a new tab.

Rendering uses a small purpose-built Markdown component
([Markdown.tsx](../src/app/terms/Markdown.tsx)) covering exactly the constructs
this document uses — headings, lists, tables, blockquotes, rules, and inline
bold/italic/link/code. It is not a general parser and must not be pointed at
user input.

**B.2b — The page was redesigned on 19 Aug 2026** from the "Terms and conditions
redesign" Claude Design project, implemented in
[TermsDoc.tsx](../src/app/terms/TermsDoc.tsx): reading-progress bar, masthead
with an "in effect" version badge, four "before you pay" cards, a 10-card FAQ
grid, a sticky searchable table of contents, per-section copy-link with toast,
back-to-top, and a print stylesheet.

Three things about how it is wired, so a later edit does not undo them:

- **The document is still the source of truth.** [page.tsx](../src/app/terms/page.tsx)
  splits `TERMS_AND_CONDITIONS.md` into lead / summary / §1–§26 and renders the
  section bodies *on the server*; the client shell only filters and reorders
  what it is handed. Section prose is never written into the components.
- **The FAQ cards are parsed from the markdown summary table**, so they cannot
  drift from the document. The build throws if that table stops parsing. The
  four hero cards are the one piece of hand-written editorial content — review
  them whenever §2, §7 or §8 changes.
- **The design mocks up the site header and a Messenger button; neither was
  copied.** The real `SiteHeader` is used, and `MessengerChat` is already mounted
  globally in `app/layout.tsx` — reimplementing either would have produced two.

The markdown keeps its own summary block so the file still stands alone when
read or printed directly; the page renders it as cards instead of prose, and the
flowing body starts at §1 so nothing appears twice.

Verified against the build output: 26 sections parsed with correct slugs, 10 FAQ
rows parsed, and **all 12 internal §-links resolve** against the 98 anchors the
page renders.

*Not visually verified in a browser* — the build type-checks and prerenders, but
nobody has looked at it on a phone. Worth a pass before it is linked publicly.

**B.2c — The EN/FIL toggle does not translate anything.** It is implemented as
designed: selecting FIL shows a notice that the Filipino translation is being
prepared and that English governs. That is honest, but it advertises a
translation that does not exist yet. Either commission the translation or drop
the toggle.

**B.2a — Version bumps are a two-file edit.** `TERMS_VERSION` in
[src/lib/terms.ts](../src/lib/terms.ts) and the `**Version:**` line in the
markdown must move together. The constant is what gets stamped onto every
booking row; leaving it behind silently records new bookings against the old
version and quietly breaks the §22 promise.

**B.3 — Age 7 is in two buckets.** The guest picker labels Teens as "Age 7–17"
and Little ones as "7 & under", so a 7-year-old fits both, and only the guest's
choice decides whether they are charged.
[agent_docs/business-rules.md](agent_docs/business-rules.md) has the same
ambiguity. These Terms use "under 7 free / 7 and above counted" consistently;
the picker label should be corrected to "6 & under" to match.

**B.4 — Long-stay night bands differ between the docs and the code.**
[agent_docs/business-rules.md](agent_docs/business-rules.md) describes three
tiers at 5 / 12 / 20 nights;
[src/lib/pricing.ts](src/lib/pricing.ts) implements four at 3 / 11 / 18 / 26.
§6.3 deliberately avoids naming the bands until this is reconciled.

**B.5 — Refund timing in §7.7 is a placeholder.** "Ordinarily within 7 working
days" is a reasonable commitment, but confirm it is one the owner can meet
before publishing, as it is the only turnaround promise in the document.

## C. Where each rule lives in code

| Clause | Source of truth |
|---|---|
| §3 stay schedule | `havens` columns via `src/lib/haven-adapter.ts` |
| §3.1 60-night cap | `MAX_BOOKABLE_NIGHTS`, `src/app/rooms/[id]/page.tsx` |
| §3.2 shared dates / cleaning turnover | `TURNOVER_SHORT_HOURS` / `TURNOVER_LONG_HOURS`, `src/lib/turnover.ts` |
| §4 occupancy and caps | guest stepper in `src/app/rooms/[id]/page.tsx`; validation in `src/app/checkout/page.tsx` |
| §5 ID requirement | checkout validation, `src/app/checkout/page.tsx` |
| §6.2 weekday/weekend/holiday | `isWeekendOrHoliday()`, `src/lib/pricing.ts` + `pricing_holidays` table |
| §4.2 additional guest charge | `extraPaxFee()`, `havens.extra_pax_fee` (owner-editable) |
| §6.3 long-stay pricing | `bundleNightlyRate()` / `bundleExtraPaxFee()`, `havens.longterm_*` |
| §6.6 Senior/PWD 20% | `seniorPwdDiscount()`, `SENIOR_PWD_RATE`, `src/lib/pricing.ts` |
| §6.5 promotions | `promotions` table, `src/lib/promo-offer.ts` |
| §7 payment split, deposit | `SECURITY_DEPOSIT`, `src/app/checkout/page.tsx`; `payment_methods` table |
| §2.3 booking stages | `booking.status` CHECK constraint + `deriveStatus()`, `src/app/admin/owners/page.tsx` |
| §2.6 expired | `deriveStatus()` — "Expired" is derived, never stored |
| §8 cancellation / date change | `agent_docs/business-rules.md`; `/api/bookings/[id]/cancel` |
| §9.2 check-in opens 1h early | `checkInOpensAt()`, `src/lib/checkin-window.ts` |
| §11 deposit outcomes | `booking_security_deposits`, `src/app/admin/csr/actions.ts` |
| §12 house rules | `src/lib/house-rules-sheet.ts` |
| §18.1 processors | Cloudinary (images), Gmail SMTP (email), Google Calendar/Sheets (sync) |

**Rates are deliberately not printed in this document.** They are owner-editable
in the admin (`havens` columns), so any figure written here would go stale. See
[agent_docs/business-rules.md](agent_docs/business-rules.md) for the
owner-confirmed numbers as of the date noted there.
