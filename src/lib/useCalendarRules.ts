"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CALENDAR_RULES, type CalendarRules } from "@/lib/pricing";

// Fetches the owner-editable weekend/holiday calendar from the public
// GET /api/admin/pricing-calendar and falls back to DEFAULT_CALENDAR_RULES
// (Fri/Sat + the built-in PH_HOLIDAYS list) while loading or if the request
// fails — so pricing never breaks even if this endpoint is unreachable.
export function useCalendarRules(): CalendarRules {
  const [rules, setRules] = useState<CalendarRules>(DEFAULT_CALENDAR_RULES);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/pricing-calendar")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active || !j?.data) return;
        const weekendDays = new Set<number>((j.data.weekendDays || []).map(Number));
        const holidays = new Set<string>((j.data.holidays || []).map((h: { date: string }) => h.date));
        if (weekendDays.size > 0) setRules({ weekendDays, holidays });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return rules;
}
