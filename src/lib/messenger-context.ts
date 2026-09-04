/**
 * Carrying one Messenger enquiry across several messages.
 *
 * The webhook parses each message alone, which is right for a single question
 * but wrong for a conversation: "dec 1 is available?" followed by "4 pax po
 * kami" used to lose the date and answer with a generic rate card asking for it
 * again. mergeContext() folds what was remembered into what was just parsed.
 *
 * Pure and I/O-free, like messenger-intent — the DB wrapper lives in
 * backend/utils/messengerContext.ts, so every rule below is unit-tested without
 * a database.
 *
 * The rule that makes this safe to get wrong: newly parsed detail ALWAYS beats
 * remembered detail, and the reply always names the date it used ("Available po
 * kami sa Dec 1..."). A guest can see and correct a bad assumption immediately,
 * which a silently-assumed date would never allow.
 */
import type { Intent, StayLabel } from "./messenger-intent";

/** How long a quiet conversation stays warm. Past this, it is a new enquiry. */
export const MESSENGER_CONTEXT_TTL_MINUTES = 30;

/**
 * Minutes after the quote at which each nudge becomes due — three, then stop.
 *
 * The last one is 23 HOURS, not 24, and that is deliberate. `sendMessenger()`
 * posts with `messaging_type: "RESPONSE"` and no tag, which Meta only permits
 * inside the 24-hour standard messaging window measured from the guest's last
 * message. The quote goes out moments after they speak, so a 1440-minute alarm
 * fires at 24h00-24h15 once the pinger's ~15-minute slack is added — outside
 * the window, and Graph rejects it. No message tag legitimately covers "are you
 * still interested?" either; that is re-engagement, which the tags forbid.
 * 23 hours still reads as "next day" to the guest and always sends.
 *
 * Index 0 is the first nudge. A row's `follow_up_stage` counts how many have
 * gone out, so stage N is due once `quoted_at` is older than STAGES[N].
 */
export const MESSENGER_FOLLOWUP_STAGES = [10, 60, 1380] as const;

export type Remembered = {
  from?: string;
  to?: string;
  pax?: number;
  stay?: StayLabel;
};

/** Manila calendar date `n` days after `dateISO`. */
function addDays(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Is this availability question about the date already on the table?
 *
 * A remembered enquiry with no date at all counts as the same one — the guest
 * gave pax or a window first and is only now naming the day.
 */
function sameDate(
  intent: Extract<Intent, { kind: "availability" }>,
  remembered: Remembered,
): boolean {
  return remembered.from === undefined || remembered.from === intent.from;
}

/**
 * Fold a remembered enquiry into a freshly parsed intent.
 *
 * A `price` intent is the interesting case. It means the guest sent pax, nights
 * or a window name with no date — which reads as a bare rate request in
 * isolation, but as a continuation when a date is already on the table. With
 * one remembered it is promoted to an availability question about that date.
 *
 * `bookingId`, `openDates`, `stayTime` and `none` are answered the same either
 * way, so they pass through untouched — `none` in particular must stay silent
 * rather than let "salamat po" trigger a quote.
 */
export function mergeContext(intent: Intent, remembered: Remembered | null): Intent {
  if (!remembered) return intent;

  if (intent.kind === "availability") {
    const out = { ...intent };
    // Pax describes the party, not the enquiry, so it survives a date change.
    if (out.pax === undefined && remembered.pax !== undefined) out.pax = remembered.pax;
    // The window does NOT. "Is December 1 available?" asks what is open that
    // day; answering with the one window they narrowed to for a different date
    // hides the rest. This shipped the other way and quoted Overnight alone for
    // a Dec 1 with all three windows free. A named date reopens the choice; the
    // guest re-narrows by saying so ("dec 1 overnight") or in the next message.
    if (out.stay === undefined && remembered.stay !== undefined && sameDate(intent, remembered)) {
      out.stay = remembered.stay;
    }
    return out;
  }

  if (intent.kind === "price") {
    if (!remembered.from) {
      // Nothing to anchor to — still a rate question, but a remembered head
      // count or window narrows the card.
      const out = { ...intent };
      if (out.pax === undefined && remembered.pax !== undefined) out.pax = remembered.pax;
      if (out.stay === undefined && remembered.stay !== undefined) out.stay = remembered.stay;
      return out;
    }

    const out: Intent = { kind: "availability", from: remembered.from };
    // "3 nights" after a date names the end of the stay, so it wins over any
    // remembered range; otherwise the remembered range carries.
    if (intent.nights !== undefined) out.to = addDays(remembered.from, intent.nights);
    else if (remembered.to) out.to = remembered.to;

    const pax = intent.pax ?? remembered.pax;
    if (pax !== undefined) out.pax = pax;
    const stay = intent.stay ?? remembered.stay;
    if (stay !== undefined) out.stay = stay;
    return out;
  }

  return intent;
}

/**
 * What to remember after answering. Returns null when the exchange carried
 * nothing worth keeping, so the caller can skip the write.
 */
export function nextContext(intent: Intent, remembered: Remembered | null): Remembered | null {
  const base: Remembered = { ...(remembered ?? {}) };

  if (intent.kind === "availability") {
    const movedOn = !sameDate(intent, remembered ?? {});
    base.from = intent.from;
    base.to = intent.to;
    if (intent.pax !== undefined) base.pax = intent.pax;
    if (intent.stay !== undefined) base.stay = intent.stay;
    // Forget the old window along with the old date, or it would resurface the
    // moment the guest asks about that new date a second time.
    else if (movedOn) delete base.stay;
  } else if (intent.kind === "price") {
    if (intent.pax !== undefined) base.pax = intent.pax;
    if (intent.stay !== undefined) base.stay = intent.stay;
  } else {
    // Other intents teach us nothing new; keep what we had.
    return remembered;
  }

  const empty =
    base.from === undefined && base.pax === undefined && base.stay === undefined;
  return empty ? null : base;
}

/**
 * The nudge, greeted by the Manila clock.
 *
 * The owner's wording hardcoded "good afternoon", which a 2AM enquiry would
 * have received verbatim.
 */
export function followUpMessage(
  now: Date = new Date(),
  stage: 1 | 2 | 3 = 1,
  bookingUrl = "dlux-homes.vercel.app",
): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const greeting = hour < 12 ? "umaga" : hour < 18 ? "hapon" : "gabi";

  // Each nudge earns its place by saying something the previous one did not:
  // the first asks, the second offers to answer questions and hands over the
  // link, the third says plainly that it is the last and offers another date
  // as an exit that is not "no". Owner's wording — change only when they ask.
  if (stage === 2) {
    return (
      `Hello po ulit! 😊 Baka po may tanong pa kayo tungkol sa rates o sa unit ` +
      `— sagutin po namin agad. Kung interested pa rin po kayo, book po kayo dito:\n` +
      `${bookingUrl}`
    );
  }
  if (stage === 3) {
    return (
      `Hello Ma'am/Sir, magandang ${greeting} po! Last follow-up na po namin — ` +
      `baka po gusto niyong i-check ang ibang date, o may naitanong pa kayo. ` +
      `Nandito lang po kami anytime. 😊\n` +
      `Book po kayo dito:\n${bookingUrl}`
    );
  }
  return (
    `Hello Ma'am/Sir, magandang ${greeting} po! ` +
    `May we know po if interested pa po sila to book?`
  );
}
