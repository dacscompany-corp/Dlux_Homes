// Shared turnover constants for the .mjs test scripts.
//
// The scripts can't import src/lib/turnover.ts (TypeScript, no build step), so
// they read the numbers straight out of it instead of repeating them. Change
// the rule in src/lib/turnover.ts and every script here follows automatically —
// what the scripts assert is the resulting ALLOWED/BLOCKED behaviour, which is
// the part that should have to be updated deliberately.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/turnover.ts", import.meta.url), "utf8");

const constOf = (name) => {
  const m = new RegExp(`export const ${name} = (\\d+)`).exec(src);
  if (!m) throw new Error(`Could not read ${name} from src/lib/turnover.ts`);
  return Number(m[1]);
};

export const LONG_STAY_HOURS = constOf("LONG_STAY_HOURS");
export const TURNOVER_LONG_HOURS = constOf("TURNOVER_LONG_HOURS");
export const TURNOVER_SHORT_HOURS = constOf("TURNOVER_SHORT_HOURS");

/** Mirrors turnoverSql() in src/lib/turnover.ts. */
export const turnoverSql = (start, end) =>
  `(CASE WHEN (${end} - ${start}) >= INTERVAL '${LONG_STAY_HOURS} hours'
         THEN INTERVAL '${TURNOVER_LONG_HOURS} hours'
         ELSE INTERVAL '${TURNOVER_SHORT_HOURS} hours' END)`;

export const describeTurnover = () =>
  `turnover.ts → stays ≥${LONG_STAY_HOURS}h: ${TURNOVER_LONG_HOURS}h cleaning, shorter stays: ${TURNOVER_SHORT_HOURS}h`;
