// Guest Terms & Conditions — identity of the published document.
//
// Single source of truth for the version string, shared by:
//   - /terms                  (the page guests read)
//   - /checkout               (the acceptance gate before the payment step)
//   - booking.terms_version   (what the guest actually agreed to, per booking)
//
// The prose itself lives in TERMS_AND_CONDITIONS.md at the repo root and is
// rendered by /terms, so there is exactly one copy of the wording.
//
// WHEN YOU EDIT THE TERMS: bump TERMS_VERSION here and in the markdown's header
// in the same commit. §22 of the Terms promises that a booking is governed by
// the version in effect when it was submitted, and the only way that promise is
// keepable is if every booking row records a version that maps to a real, known
// document. Leaving this constant behind silently stamps new bookings with the
// old version.
//
// Client-safe: no `fs`, no server-only imports — the checkout page is a client
// component and imports TERMS_VERSION from here.

export const TERMS_VERSION = "2.1";

export const TERMS_EFFECTIVE_DATE = "19 August 2026";

/** Repo-relative path to the prose, read at build time by /terms. */
export const TERMS_DOC_FILE = "TERMS_AND_CONDITIONS.md";
