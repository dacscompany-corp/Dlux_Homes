// D'Lux Homes pricing rules — single source of truth for weekday vs
// weekend/holiday rate selection. Matches the official rate card:
//   Overnight (21h): Weekday ₱1,899 · Weekend/Holiday ₱2,099
//   Daycation/Nightcation (10h): Weekday ₱1,499 · Weekend/Holiday ₱1,799
// "Weekend" = a Friday, Saturday or Sunday check-in. "Holiday" = a PH holiday.

// PH holidays — regular + common special non-working days. Update yearly.
export const PH_HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-02-17", // Chinese New Year
  "2026-04-02", // Maundy Thursday
  "2026-04-03", // Good Friday
  "2026-04-04", // Black Saturday
  "2026-04-09", // Araw ng Kagitingan
  "2026-05-01", // Labor Day
  "2026-06-12", // Independence Day
  "2026-08-21", // Ninoy Aquino Day
  "2026-08-31", // National Heroes Day
  "2026-11-01", // All Saints' Day
  "2026-11-30", // Bonifacio Day
  "2026-12-08", // Immaculate Conception
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2026-12-30", // Rizal Day
  "2026-12-31", // New Year's Eve
  // 2027
  "2027-01-01", // New Year's Day
]);

// True when a YYYY-MM-DD check-in date should use the weekend/holiday rate.
export function isWeekendOrHoliday(dateISO: string): boolean {
  if (!dateISO) return false;
  if (PH_HOLIDAYS.has(dateISO)) return true;
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay(); // 0 Sun · 5 Fri · 6 Sat
  return day === 0 || day === 5 || day === 6;
}

type Rates = { price10hr: number; price10hrWeekend: number; price21hr: number; price21hrWeekend: number };

// Pick the correct rate for a stay type + check-in date.
// stayType "10" = Daycation/Nightcation, anything else = Overnight (21h).
export function pickRate(stayType: string, dateISO: string, rates: Rates): number {
  const weekend = isWeekendOrHoliday(dateISO);
  if (stayType === "10") return weekend ? rates.price10hrWeekend : rates.price10hr;
  return weekend ? rates.price21hrWeekend : rates.price21hr;
}

export function addDaysISO(iso: string, n: number): string {
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  // Build from LOCAL parts — toISOString() would shift the date in +UTC zones (PH).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Total for a stay. Daycation/Nightcation (10h) is a single session. Overnight
// (21h) can span multiple nights — each night is priced by its OWN date, so a
// weekend night charges the weekend rate even within a mostly-weekday stay.
export function stayTotal(stayType: string, checkInISO: string, nights: number, rates: Rates): number {
  if (stayType === "10" || !checkInISO) return pickRate(stayType, checkInISO, rates);
  const n = Math.max(1, Math.floor(nights || 1));
  let total = 0;
  for (let i = 0; i < n; i++) total += pickRate("21", addDaysISO(checkInISO, i), rates);
  return total;
}

// Extra-pax surcharge. The base rate covers `basePax` guests (2 for D'Lux);
// each additional guest up to the max adds `feePerPax`, charged ONCE per
// booking (flat — not multiplied by nights). Returns 0 within the allowance
// or when no fee is configured.
export function extraPaxFee(totalPax: number, basePax: number, feePerPax: number): number {
  const extra = Math.max(0, Math.floor(totalPax || 0) - Math.floor(basePax || 0));
  return extra * Math.max(0, feePerPax || 0);
}
