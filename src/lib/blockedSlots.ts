/**
 * Per-slot blocked dates — the one definition of what a partial block occupies.
 *
 * A blocked_dates row with `slots = NULL` closes the whole day (the original
 * behaviour). With `slots` set it closes only those stay windows, on every date
 * in its range. A blocked slot behaves exactly like a booking in that window:
 * it occupies the window's clock time and owes the same cleaning turnover, so
 * "Daycation blocked on the 25th" still leaves that evening's Overnight open,
 * while "Overnight blocked on the 25th" also closes the 26th's Daycation (the
 * unit is taken until the overnight check-out).
 *
 * Window times come from the haven row at check time, never from the block.
 */
import { turnoverSql } from "./turnover";

export const BLOCK_SLOTS = ["daycation", "nightcation", "overnight"] as const;
export type BlockSlot = (typeof BLOCK_SLOTS)[number];

export const BLOCK_SLOT_LABEL: Record<BlockSlot, string> = {
  daycation: "Daycation",
  nightcation: "Nightcation",
  overnight: "Overnight",
};

/** Validates an API value: null/undefined/[] → whole day (null); otherwise a de-duplicated slot list, or "invalid". */
export function parseBlockSlots(v: unknown): BlockSlot[] | null | "invalid" {
  if (v == null) return null;
  if (!Array.isArray(v)) return "invalid";
  if (v.length === 0) return null;
  const out: BlockSlot[] = [];
  for (const s of v) {
    if (!BLOCK_SLOTS.includes(s as BlockSlot)) return "invalid";
    if (!out.includes(s as BlockSlot)) out.push(s as BlockSlot);
  }
  // All three windows is the whole day in every way that matters to a guest.
  return out.length === BLOCK_SLOTS.length ? null : out;
}

/** Normalise a DB/API `slots` value for display and client-side checks. */
export function blockSlotsOf(v: unknown): BlockSlot[] | null {
  const p = parseBlockSlots(v);
  return p === "invalid" ? null : p;
}

/** "Daycation · Overnight", or "Whole day". */
export function blockSlotsLabel(v: unknown): string {
  const s = blockSlotsOf(v);
  return s ? s.map((x) => BLOCK_SLOT_LABEL[x]).join(" · ") : "Whole day";
}

/** Storefront window label ("Daycation"/"Nightcation"/"Overnight") → slot key. */
export function slotForWindowLabel(label: string): BlockSlot | null {
  const k = label.trim().toLowerCase();
  return (BLOCK_SLOTS as readonly string[]).includes(k) ? (k as BlockSlot) : null;
}

/**
 * SQL condition: the slot-block row aliased `bd` occupies time overlapping the
 * stay [ns, ne), turnover included on both sides (same shape as the booking
 * overlap check). `ns`/`ne` are raw SQL timestamp expressions — pass CTE/column
 * references only, never user input. Whole-day rows (slots IS NULL) never match
 * here; callers keep their own whole-day date test.
 */
export function slotBlockOverlapSql(ns: string, ne: string, bd = "bd"): string {
  const inT = `(CASE s.slot WHEN 'daycation' THEN hv.ten_hour_check_in::TIME
                            WHEN 'nightcation' THEN hv.six_hour_check_in::TIME
                            ELSE hv.twenty_one_hour_check_in::TIME END)`;
  const outT = `(CASE s.slot WHEN 'daycation' THEN hv.ten_hour_check_out::TIME
                             WHEN 'nightcation' THEN hv.six_hour_check_out::TIME
                             ELSE hv.twenty_one_hour_check_out::TIME END)`;
  return `(${bd}.slots IS NOT NULL AND EXISTS (
    SELECT 1
    FROM havens hv
    CROSS JOIN generate_series(${bd}.from_date::TIMESTAMP, ${bd}.to_date::TIMESTAMP, INTERVAL '1 day') AS g(day)
    CROSS JOIN unnest(${bd}.slots) AS s(slot)
    CROSS JOIN LATERAL (
      SELECT (g.day::DATE + ${inT})::TIMESTAMP AS bs,
             (g.day::DATE
               + CASE WHEN s.slot = 'overnight' OR ${outT} <= ${inT} THEN 1 ELSE 0 END
               + ${outT})::TIMESTAMP AS be
    ) w
    WHERE hv.uuid_id = ${bd}.haven_id
      AND w.bs IS NOT NULL AND w.be IS NOT NULL
      AND w.bs < ${ne} + ${turnoverSql(ns, ne)}
      AND w.be + ${turnoverSql("w.bs", "w.be")} > ${ns}
  ))`;
}
