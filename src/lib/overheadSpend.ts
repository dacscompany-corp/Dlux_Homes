/**
 * Validation for one-off spend entries — a cost that already happened and is
 * already paid. Pure by design: the controller does I/O, this decides what a
 * valid entry is. See docs/superpowers/specs/2026-08-24-spend-entries-design.md.
 */

export interface SpendInput {
  name: string;
  category_id: string;
  amount: number;
  spent_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

export type SpendValidation =
  | { ok: true; value: SpendInput }
  | { ok: false; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 150; // matches overhead_expenses.name VARCHAR(150)

/**
 * Today's date in Manila as 'YYYY-MM-DD'. Manila is UTC+8 and never negative,
 * so shifting forward eight hours before reading the UTC date lands on the
 * right calendar day. Same approach the overhead reports controller uses.
 */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Trimmed string, or null when absent or blank. */
function optional(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * True when the string is a real calendar date, not merely date-SHAPED.
 * The regex accepts "2026-13-99"; Date normalises impossible values silently
 * (Feb 31 becomes Mar 3), so the round-trip is what catches them. UTC is used
 * so the local timezone cannot shift the day.
 */
function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateSpend(body: unknown, today: string): SpendValidation {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (typeof b.name !== "string") return { ok: false, message: "Give this expense a name." };
  const name = b.name.trim();
  if (!name) return { ok: false, message: "Give this expense a name." };
  if (name.length > NAME_MAX) {
    return { ok: false, message: `That name is too long (${NAME_MAX} characters max).` };
  }

  const category_id = String(b.category_id ?? "");
  if (!UUID_RE.test(category_id)) return { ok: false, message: "Choose a category." };

  if (typeof b.amount !== "number" && typeof b.amount !== "string") {
    return { ok: false, message: "Amount must be greater than zero." };
  }
  // Form inputs arrive as strings, so coerce before testing.
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero." };
  }

  const spent_on = String(b.spent_on ?? "");
  if (!DATE_RE.test(spent_on) || !isRealDate(spent_on)) {
    return { ok: false, message: "Give the date this was paid." };
  }
  // String comparison is safe: both sides are zero-padded 'YYYY-MM-DD'.
  if (spent_on > today) {
    return {
      ok: false,
      message: "You cannot record a payment for a date that has not happened yet.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      category_id,
      amount,
      spent_on,
      method: optional(b.method),
      reference: optional(b.reference),
      notes: optional(b.notes),
    },
  };
}
