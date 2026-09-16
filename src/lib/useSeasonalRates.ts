"use client";

import { useEffect, useState } from "react";
import type { SeasonalRate } from "@/lib/pricing";

const NONE: SeasonalRate[] = [];

// Active seasonal rates from the public GET /api/seasonal-rates/active. Falls
// back to [] (regular pricing) while loading or if the request fails, the same
// way useCalendarRules() does. The server re-prices every booking at submit, so
// a stale or failed fetch here can't under-charge — the guest is asked to refresh.
export function useSeasonalRates(): SeasonalRate[] {
  const [seasons, setSeasons] = useState<SeasonalRate[]>(NONE);

  useEffect(() => {
    let active = true;
    fetch("/api/seasonal-rates/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active && Array.isArray(j?.data)) setSeasons(j.data);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return seasons;
}
