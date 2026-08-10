# Checkout guest information: collapsed guest cards

**Date:** 2026-08-10
**Status:** Approved, implementing

## Problem

Step 0 of checkout renders the main guest's full form inline, then stacks every
additional guest below it as a full block (`src/app/checkout/page.tsx`, the
`extraGuests.map` at ~line 873). A 4-pax booking is one uninterrupted scroll of
four near-identical forms with no sense of progress and no way to collapse what
is already done.

Adopt the airline "Passenger Details" pattern: a header with an `N/M Added`
counter and one collapsed row per guest that expands to that guest's form.

## Decisions

- **A popup, not an inline accordion.** *(Revised 2026-08-10 — this shipped as an
  accordion first, then changed on request.)* Tapping a row opens the guest's
  form in a modal: a centered dialog above 860px, a bottom sheet below it. The
  row list itself never expands.
  - The modal is **portalled to `<body>`**. Ancestors in that subtree carry
    `overflow: hidden` and an animated `translateY` (`.page-enter`), and a
    transformed ancestor becomes the containing block for `position: fixed` —
    which would silently break the overlay.
  - The panel is a flex column: fixed header (title, subtitle, ✕), a single
    scrolling body, and a pinned footer holding **Done**, so Done stays reachable
    however tall the form gets.
  - Backdrop click, ✕ and Esc all close, and the body scrolls are locked while
    open. Fields write straight into `info`/`extraGuests`, so **closing always
    keeps what was typed** — no draft copies, no discard prompt. Deliberately
    non-trapping: an incomplete guest can still close.
- **The main guest is a card too**, matching the reference's uniform list. Its
  expanded body simply carries the extra contact fields (email, phone, Facebook,
  notes) that no other guest has, and it counts toward `N/M`.
- **Presentation only.** No change to what is collected, validated, or submitted.
  The request payload is byte-identical.

## Design

### Component

A local `GuestCard` in the checkout file:

```tsx
{ title, subtitle, complete, hasErrors, open, onToggle, children }
```

It owns the row, the status dot, the chevron, and the popup — nothing else. It
takes an `onDone` callback so the Done button can live in the modal's pinned
footer rather than inside `children`.
Each guest's existing form JSX is passed as `children`, so the field helpers
(`fieldStyle`, `FieldLabel`, `Req`, `AgeNote`, `ageStyle`, `GuestIdUpload`,
`updateGuest`) keep working without prop-drilling. This adds a boundary to a file
already ~1,300 lines rather than adding more sprawl to it.

### State

One value: `openGuest: number | null`. Index 0 is the main guest; 1…n map to
`extraGuests[0…n-1]`. Opening a card closes the others. Defaults to 0.

`extraGuests` already resizes by effect when the pax counts change, so
`openGuest` is clamped to the current guest count when read — it can never point
past the end of the list.

### Completion

Derived from the existing `fieldErrors` set, never stored:

- Guest 0 is complete when no main-guest keys are present
  (`firstName`, `lastName`, `age`, `gender`, `email`, `phone`, `validId`).
- Guest *i*+1 is complete when no `x{i}-` keys are present.

`N/M Added` is the count of complete guests over total pax. Because the counter
and the Continue button read the same source, they cannot disagree.

`fieldErrors` only populates while `step === 0`, which is exactly when this list
renders.

### Collapsed row

Person icon, `Guest 2 · Adult`, and once complete the guest's name replaces the
placeholder line while a check replaces the hollow dot. The chevron rotates when
open. Type labels come from the existing `guestType(i)` — Main guest / Adult /
Young Adult / Child.

### Continue integration

This is the one piece that must not be missed. `tryAdvance()` scrolls to
`f-${firstKey}` and focuses it, but **a collapsed card's inputs are not in the
DOM**, so an error inside a closed card would be unreachable — the same failure
shape as the booking-card nights trap (a control hidden by the state it owns).

```
tryAdvance → errors exist
  → resolve which guest owns the first error key
  → setOpenGuest(thatGuest)       ← new
  → existing 60ms timeout fires   ← card is mounted by now
  → scrollIntoView + focus         (unchanged)
```

The existing `setTimeout(…, 60)` already supplies the render tick, so this is an
addition of a few lines, not a rework.

### Done button

Inside an expanded card, `Done` collapses it and opens the next incomplete guest.
A 4-pax booking becomes fill → Done → fill → Done, ending with every card
collapsed and the Continue button in view.

## Out of scope

- The checkout URL-param issues from the earlier pricing audit (no 4-pax clamp,
  client-authored `total_amount`).
- Any change to guest field requirements or the ID-upload rules.

## Verification

- `npm run build` passes with no TS errors, and lint on `checkout/page.tsx` shows
  no new problems against its current baseline (8 warnings, 0 errors).
- Manual: with 4 pax, confirm the counter reads 0/4 and climbs to 4/4 as each
  guest is filled; that pressing Continue with an incomplete guest OPENS that
  guest's card and focuses the offending field; that Done advances to the next
  incomplete guest; and that a completed row shows the guest's name and a check.
- Submitting produces the same payload as before the change.
