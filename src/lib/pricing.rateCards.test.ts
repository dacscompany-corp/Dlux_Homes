import { describe, it, expect } from "vitest";
import { pickRate, stayTotal, type CalendarRules } from "./pricing";

// The live D'Lux rate card (havens row for Tower 4), so a rate change in admin
// that these no longer match is a signal, not noise.
const ROOM = {
  price10hr: 1499,          // ten_hour_rate        — Daycation/Nightcation weekday
  price10hrWeekend: 1699,   // six_hour_rate        — Daycation/Nightcation weekend
  price21hr: 1899,          // weekday_rate         — Overnight weekday
  price21hrWeekend: 2099,   // weekend_rate         — Overnight weekend
};

// pricing_settings.weekend_days = [5, 6] — Friday and Saturday.
const RULES: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set<string>() };

describe("rate cards follow the selected date", () => {
  // The exact case from the bug report: the rate list showed the weekday rates
  // under a heading that read "Rates for Fri, Sep 11, 2026".
  it("prices Fri Sep 11 2026 at the WEEKEND rate", () => {
    expect(pickRate("21", "2026-09-11", ROOM, RULES)).toBe(2099);
    expect(pickRate("10", "2026-09-11", ROOM, RULES)).toBe(1699);
  });

  it("prices Saturday at the weekend rate", () => {
    expect(pickRate("21", "2026-09-12", ROOM, RULES)).toBe(2099);
  });

  it("prices Sunday through Thursday at the weekday rate", () => {
    for (const d of ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]) {
      expect(pickRate("21", d, ROOM, RULES)).toBe(1899);
      expect(pickRate("10", d, ROOM, RULES)).toBe(1499);
    }
  });

  it("prices a declared holiday at the weekend rate even on a weekday", () => {
    const withHoliday: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set(["2026-09-16"]) };
    expect(pickRate("21", "2026-09-16", ROOM, withHoliday)).toBe(2099);
  });
});

describe("multi-night stays price each night on its own date", () => {
  // Why the night-stepper line can't just say "rate x nights": these two nights
  // are not the same price, so neither 1899x2 nor 2099x2 reaches the total.
  it("sums a Fri->Sun stay as weekend + weekend, not 2x either rate", () => {
    // Fri Sep 11 (weekend) + Sat Sep 12 (weekend)
    expect(stayTotal("21", "2026-09-11", 2, ROOM, RULES)).toBe(2099 + 2099);
  });

  it("sums a mixed Sat->Mon stay as weekend + weekday", () => {
    // Sat Sep 12 (weekend) + Sun Sep 13 (weekday)
    const total = stayTotal("21", "2026-09-12", 2, ROOM, RULES);
    expect(total).toBe(2099 + 1899);
    expect(total).not.toBe(2099 * 2);
    expect(total).not.toBe(1899 * 2);
  });

  it("keeps a single weekend night equal to the card price", () => {
    expect(stayTotal("21", "2026-09-11", 1, ROOM, RULES)).toBe(
      pickRate("21", "2026-09-11", ROOM, RULES),
    );
  });
});
