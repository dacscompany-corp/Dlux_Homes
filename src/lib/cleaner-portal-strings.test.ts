import { describe, it, expect } from "vitest";
import {
  CLEANER_STRINGS,
  formatDateLine,
  formatDayLabel,
  type CleanerLanguage,
} from "./cleaner-portal-strings";

const LANGS: CleanerLanguage[] = ["en", "tl"];

describe("CLEANER_STRINGS", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(CLEANER_STRINGS.tl).sort()).toEqual(Object.keys(CLEANER_STRINGS.en).sort());
  });

  it("leaves no string blank in either language", () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(CLEANER_STRINGS[lang])) {
        if (typeof value === "string") {
          expect(value.trim(), `${lang}.${key} is blank`).not.toBe("");
        }
      }
    }
  });

  it("keeps the three how-it-works steps and four quick replies in both languages", () => {
    for (const lang of LANGS) {
      expect(CLEANER_STRINGS[lang].steps).toHaveLength(3);
      expect(CLEANER_STRINGS[lang].quick).toHaveLength(4);
    }
  });

  it("pluralises the remaining-task count in English", () => {
    expect(CLEANER_STRINGS.en.left(1)).toBe("1 task left");
    expect(CLEANER_STRINGS.en.left(4)).toBe("4 tasks left");
    expect(CLEANER_STRINGS.en.roomsLeft(1)).toBe("1 room to clean");
    expect(CLEANER_STRINGS.en.roomsLeft(3)).toBe("3 rooms to clean");
  });

  it("interpolates progress and room names in both languages", () => {
    expect(CLEANER_STRINGS.en.progress(9, 24)).toBe("9 of 24 done");
    expect(CLEANER_STRINGS.tl.progress(9, 24)).toBe("9 sa 24 tapos");
    expect(CLEANER_STRINGS.en.forRoom("Suite 1812")).toContain("Suite 1812");
    expect(CLEANER_STRINGS.tl.forRoom("Suite 1812")).toContain("Suite 1812");
    expect(CLEANER_STRINGS.en.doneBody("Suite 1812")).toContain("Suite 1812");
    expect(CLEANER_STRINGS.tl.doneBody("Suite 1812")).toContain("Suite 1812");
  });
});

describe("formatDateLine", () => {
  // 2026-09-27 was a Sunday.
  const sunday = new Date(2026, 8, 27);

  it("spells out the weekday in English", () => {
    expect(formatDateLine(sunday, "en")).toBe("Sunday, Sep 27");
  });

  it("uses Tagalog weekday and month names", () => {
    expect(formatDateLine(sunday, "tl")).toBe("Linggo, Set 27");
  });
});

describe("formatDayLabel", () => {
  const today = new Date(2026, 8, 27); // Sun Sep 27
  const tomorrow = new Date(2026, 8, 28); // Mon Sep 28
  const later = new Date(2026, 8, 29); // Tue Sep 29

  it("marks the next day as Tomorrow", () => {
    expect(formatDayLabel(tomorrow, today, "en")).toBe("Tomorrow · Mon, Sep 28");
    expect(formatDayLabel(tomorrow, today, "tl")).toBe("Bukas · Lun, Set 28");
  });

  it("shows only the short date for anything further out", () => {
    expect(formatDayLabel(later, today, "en")).toBe("Tue, Sep 29");
    expect(formatDayLabel(later, today, "tl")).toBe("Mar, Set 29");
  });

  it("ignores the time of day when measuring the gap", () => {
    const lateToday = new Date(2026, 8, 27, 23, 45);
    const earlyTomorrow = new Date(2026, 8, 28, 0, 15);
    expect(formatDayLabel(earlyTomorrow, lateToday, "en")).toContain("Tomorrow");
  });

  it("crosses a month boundary without claiming Tomorrow twice", () => {
    const sep30 = new Date(2026, 8, 30);
    const oct1 = new Date(2026, 9, 1);
    expect(formatDayLabel(oct1, sep30, "en")).toBe("Tomorrow · Thu, Oct 1");
    expect(formatDayLabel(oct1, new Date(2026, 8, 29), "en")).toBe("Thu, Oct 1");
  });
});
