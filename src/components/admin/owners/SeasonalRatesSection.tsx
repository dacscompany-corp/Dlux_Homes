"use client";

import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft, ArrowRight, BedDouble, CalendarClock, CalendarRange, Check, Church, CircleCheck, Copy, Gift, Info, Moon,
  PartyPopper, Pencil, Plus, Power, PowerOff, Repeat, ShieldCheck, SunMoon, Ticket, TicketX, Trash2, TriangleAlert, X,
  type LucideIcon,
} from "lucide-react";
import {
  useGetSeasonalRatesQuery,
  useCreateSeasonalRateMutation,
  useUpdateSeasonalRateMutation,
  useToggleSeasonalRateMutation,
  useDeleteSeasonalRateMutation,
} from "@/redux/api/seasonalRatesApi";
import {
  parseSeasonInput,
  findActiveOverlap,
  seasonStatus,
  type SeasonalRateRecord,
} from "@/lib/seasonalRates";
import { addDaysISO, BUNDLE_TIER1_LABEL, BUNDLE_TIER2_LABEL, BUNDLE_TIER3_LABEL, BUNDLE_TIER4_LABEL } from "@/lib/pricing";
import { useCalendarRules } from "@/lib/useCalendarRules";

// ── Seasonal Rates (Finance → Seasonal Rates, owner only) ──────────────────
// Date ranges whose four rates replace the haven's regular rates while switched
// ON. Pricing: src/lib/pricing.ts (seasonFor / stayBreakdown). The server
// re-prices every booking, so what's saved here is what guests are charged.

// The haven's regular rates, shown next to each season price for comparison.
export type UsualRates = {
  overnightWeekday: number;
  overnightWeekend: number;
  daynightWeekday: number;
  daynightWeekend: number;
};

const INK = "#1f1b16";
const MUTED = "#8a8276";
const BODY = "#6b6358";
const LINE = "#ece5d4";
const CREAM = "#faf7f1";
const GREEN = "#2f7d55";
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "var(--font-mono), ui-monospace, monospace";

const peso = (n: number | string) => "₱" + Number(n || 0).toLocaleString("en-US");

// Manila calendar date — a season's "active now" is judged in PH time.
const manilaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Parsed from parts, not new Date(iso), which reads the date as UTC and can shift a day.
const isoToDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (iso: string) => (iso ? isoToDate(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
// Inclusive day count: Dec 1 → Dec 3 covers 3 dates.
const daysCovered = (a: string, b: string) => (a && b ? Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / 86_400_000) + 1 : 0);

// "Sun–Thu", "Fri & Sat" — cyclic runs of day numbers (0 Sun .. 6 Sat).
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 0) return "No days";
  if (set.size === 7) return "Every day";
  // Start scanning just after a day that's not in the set so wrap-around runs stay whole.
  const start = [0, 1, 2, 3, 4, 5, 6].find((d) => !set.has(d))! + 1;
  const runs: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const d = (start + i) % 7;
    if (!set.has(d)) continue;
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] + 1) % 7 === d) last.push(d);
    else runs.push([d]);
  }
  const parts = runs.map((r) => (r.length >= 3 ? `${DAY[r[0]]}–${DAY[r[r.length - 1]]}` : r.map((d) => DAY[d]).join(" & ")));
  return parts.join(", ");
}

// Easter Sunday (Gregorian, anonymous algorithm) — Holy Week preset runs Palm Sunday → Easter.
function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type PresetKey = "christmas" | "holy" | "newyear";
// Next upcoming occurrence of each preset, judged against today (Manila).
function presetFor(key: PresetKey, today: string): Pick<Form, "name" | "startDate" | "endDate"> {
  const y = Number(today.slice(0, 4));
  if (key === "holy") {
    const year = easter(y) >= today ? y : y + 1;
    return { name: `Holy Week ${year}`, startDate: addDaysISO(easter(year), -7), endDate: easter(year) };
  }
  const [startMD, endMD, label] = key === "christmas" ? ["12-01", "01-05", "Christmas Season"] : ["12-28", "01-02", "New Year"];
  const year = `${y}-${startMD}` >= today ? y : y + 1;
  return { name: `${label} ${year}`, startDate: `${year}-${startMD}`, endDate: `${year + 1}-${endMD}` };
}

type Form = {
  name: string;
  startDate: string;
  endDate: string;
  overnightWeekday: string;
  overnightWeekend: string;
  daynightWeekday: string;
  daynightWeekend: string;
  useLongterm: boolean;
  longtermTier1: string;
  longtermTier2: string;
  longtermTier3: string;
  longtermTier4: string;
  allowPromos: boolean;
  active: boolean;
};

type RateKey = "overnightWeekday" | "overnightWeekend" | "daynightWeekday" | "daynightWeekend";
type TierKey = "longtermTier1" | "longtermTier2" | "longtermTier3" | "longtermTier4";

const LONGTERM_TIERS: { key: TierKey; label: string }[] = [
  { key: "longtermTier1", label: BUNDLE_TIER1_LABEL },
  { key: "longtermTier2", label: BUNDLE_TIER2_LABEL },
  { key: "longtermTier3", label: BUNDLE_TIER3_LABEL },
  { key: "longtermTier4", label: BUNDLE_TIER4_LABEL },
];

const EMPTY_FORM: Form = {
  name: "", startDate: "", endDate: "",
  overnightWeekday: "", overnightWeekend: "", daynightWeekday: "", daynightWeekend: "",
  useLongterm: false, longtermTier1: "", longtermTier2: "", longtermTier3: "", longtermTier4: "",
  allowPromos: false, active: false,
};

const formFrom = (s: SeasonalRateRecord): Form => ({
  name: s.name, startDate: s.startDate, endDate: s.endDate,
  overnightWeekday: String(s.overnightWeekday), overnightWeekend: String(s.overnightWeekend),
  daynightWeekday: String(s.daynightWeekday), daynightWeekend: String(s.daynightWeekend),
  useLongterm: LONGTERM_TIERS.some((t) => s[t.key] != null),
  longtermTier1: s.longtermTier1 != null ? String(s.longtermTier1) : "",
  longtermTier2: s.longtermTier2 != null ? String(s.longtermTier2) : "",
  longtermTier3: s.longtermTier3 != null ? String(s.longtermTier3) : "",
  longtermTier4: s.longtermTier4 != null ? String(s.longtermTier4) : "",
  allowPromos: s.allowPromos, active: s.active,
});

const STEP_LABELS = ["Dates", "Prices", "Options", "Review"];
const STEP_SUBS = ["Name it and pick the dates", "Set the prices for those dates", "Two choices to make", "Check it over"];

// "+11% vs usual" — compares a season price with the regular price for the same stay.
function delta(value: number | string, usual: number, short = false): { text: string; color: string } {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0 || !usual) return { text: "", color: MUTED };
  const pct = Math.round(((v - usual) / usual) * 100);
  const suffix = short ? "" : " vs usual";
  if (pct === 0) return { text: short ? "same" : "same as usual", color: MUTED };
  return pct > 0 ? { text: `+${pct}%${suffix}`, color: "#a0632f" } : { text: `${pct}%${suffix}`, color: GREEN };
}

const positive = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;

// RTK Query rejects with { data: { error } } for our JSON error responses.
const apiError = (err: unknown, fallback: string) =>
  (err as { data?: { error?: string } })?.data?.error || fallback;

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      style={{ position: "relative", width: 42, height: 24, flex: "none", borderRadius: 999, border: "none", background: on ? GREEN : "#d9d0bf", cursor: disabled ? "not-allowed" : "pointer", transition: "background .15s", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
    </button>
  );
}

function Callout({ tone, icon: Icon, title, children }: { tone: "ok" | "warn"; icon: LucideIcon; title?: string; children: ReactNode }) {
  const c = tone === "ok"
    ? { bg: "#f6fbf7", border: "#d6e9dc", icon: GREEN, text: "#33503e" }
    : { bg: "#fdf0ec", border: "#f1d3c9", icon: "#9a4a3a", text: "#8a4a3c" };
  return (
    <div style={{ padding: "13px 15px", borderRadius: 12, background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", alignItems: title ? "center" : "flex-start", gap: 9 }}>
        <Icon style={{ width: 17, height: 17, color: c.icon, flex: "none", marginTop: title ? 0 : 1 }} />
        {title ? <span style={{ fontSize: 13.5, fontWeight: 600, color: c.icon }}>{title}</span> : <div style={{ fontSize: 13, color: c.text, lineHeight: 1.55 }}>{children}</div>}
      </div>
      {title && <div style={{ marginTop: 8, fontSize: 13, color: c.text, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}

function ConfirmDialog({ icon: Icon, iconBg, iconFg, title, body, detail, note, cancelLabel, confirmLabel, confirmIcon: ConfirmIcon, confirmBg, busy, onCancel, onConfirm }: {
  icon: LucideIcon; iconBg: string; iconFg: string; title: string; body: ReactNode; detail: ReactNode; note?: ReactNode;
  cancelLabel: string; confirmLabel: string; confirmIcon: LucideIcon; confirmBg: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div onClick={() => !busy && onCancel()} style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(31,27,22,0.45)" }}>
      <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={title}
        style={{ width: "100%", maxWidth: 480, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 18px" }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: iconBg, color: iconFg, display: "grid", placeItems: "center" }}><Icon style={{ width: 20, height: 20 }} /></div>
          <h3 style={{ margin: "16px 0 0", fontSize: 17, fontWeight: 700, color: INK }}>{title}</h3>
          <p style={{ margin: "9px 0 0", fontSize: 13.5, color: BODY, lineHeight: 1.6 }}>{body}</p>
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: CREAM, border: `1px solid ${LINE}`, fontSize: 13, color: "#4a4034", lineHeight: 1.6 }}>{detail}</div>
          {note && <p style={{ margin: "12px 0 0", fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{note}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, padding: "13px 24px", borderTop: "1px solid #f4ecdd" }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, border: "none", background: "transparent", color: "#6f5c44", cursor: "pointer" }}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, border: "none", background: confirmBg, color: "#fff", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            <ConfirmIcon style={{ width: 14, height: 14 }} />{busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type Confirm = { kind: "on" | "delete"; id: string } | { kind: "clash"; id: string; otherId: string };

export function SeasonalRatesSection({ usualRates }: { usualRates: UsualRates }) {
  const { data: seasons = [], isLoading } = useGetSeasonalRatesQuery();
  const [createSeason, { isLoading: creating }] = useCreateSeasonalRateMutation();
  const [updateSeason, { isLoading: updating }] = useUpdateSeasonalRateMutation();
  const [toggleSeason] = useToggleSeasonalRateMutation();
  const [deleteSeason] = useDeleteSeasonalRateMutation();
  const rules = useCalendarRules();

  // wizard: null = closed; { id } = editing that season; {} = creating.
  const [wizard, setWizard] = useState<{ id?: string } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = creating || updating;
  const today = manilaToday();

  const weekendDays = [...rules.weekendDays].sort();
  const weekdayLabel = describeDays([0, 1, 2, 3, 4, 5, 6].filter((d) => !rules.weekendDays.has(d)));
  const weekendLabel = `${describeDays(weekendDays)} & holidays`;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const openWizard = (next: Form, id?: string) => { setForm(next); setWizard(id ? { id } : {}); setStep(1); };
  const openPreset = (key: PresetKey) => openWizard({ ...EMPTY_FORM, ...presetFor(key, today) });
  const closeWizard = () => { if (!saving) { setWizard(null); setStep(1); } };

  // Live checks in the wizard; the server re-validates (and the DB exclusion constraint enforces overlap).
  const hasRange = !!form.startDate && !!form.endDate && form.startDate <= form.endDate;
  const datesInverted = !!form.startDate && !!form.endDate && form.startDate > form.endDate;
  const overlap = hasRange ? findActiveOverlap({ startDate: form.startDate, endDate: form.endDate }, seasons, wizard?.id) : undefined;
  const willBeOn = form.active && !overlap;

  const stepReady = step === 1
    ? hasRange && form.name.trim().length > 0
    : step === 2
      ? (["overnightWeekday", "overnightWeekend", "daynightWeekday", "daynightWeekend"] as RateKey[]).every((k) => positive(form[k]))
        && (!form.useLongterm || LONGTERM_TIERS.every((t) => form[t.key].trim() === "" || positive(form[t.key])))
      : true;

  const save = async () => {
    const tiers = form.useLongterm ? {} : { longtermTier1: "", longtermTier2: "", longtermTier3: "", longtermTier4: "" };
    // A clashing season can only be stored OFF — two ON seasons can't share a date.
    const parsed = parseSeasonInput({ ...form, ...tiers, active: willBeOn });
    if (!parsed.ok) { toast.error(parsed.error); return; }
    try {
      if (wizard?.id) await updateSeason({ id: wizard.id, body: parsed.value }).unwrap();
      else await createSeason(parsed.value).unwrap();
      toast.success(wizard?.id ? "Season updated" : willBeOn ? "Season saved and ON" : "Season saved (OFF)");
      setWizard(null);
      setStep(1);
    } catch (err) {
      toast.error(apiError(err, "Could not save the season"));
    }
  };

  const next = () => {
    if (!stepReady) {
      toast.error(step === 1
        ? (!form.name.trim() ? "Give the season a name." : "Pick a first and last day.")
        : "Type all four prices (long-stay boxes can be left empty).");
      return;
    }
    if (step === 4) save(); else setStep(step + 1);
  };

  const setActive = async (id: string, active: boolean) => {
    await toggleSeason({ id, active }).unwrap();
  };

  const onToggle = async (s: SeasonalRateRecord) => {
    if (!s.active) {
      const clash = findActiveOverlap(s, seasons, s.id);
      setConfirm(clash ? { kind: "clash", id: s.id, otherId: clash.id } : { kind: "on", id: s.id });
      return;
    }
    setBusy(true);
    try {
      await setActive(s.id, false);
      toast.success(`"${s.name}" turned OFF`);
    } catch (err) {
      toast.error(apiError(err, "Could not turn the season OFF"));
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const target = seasons.find((x) => x.id === confirm.id);
    if (!target) { setConfirm(null); return; }
    setBusy(true);
    try {
      if (confirm.kind === "delete") {
        await deleteSeason(target.id).unwrap();
        toast.success(`"${target.name}" deleted`);
      } else if (confirm.kind === "clash") {
        const other = seasons.find((x) => x.id === confirm.otherId);
        await setActive(confirm.otherId, false);
        try {
          await setActive(target.id, true);
        } catch (err) {
          // Put the other season back so a failed swap doesn't leave both OFF.
          await setActive(confirm.otherId, true).catch(() => {});
          throw err;
        }
        toast.success(`"${target.name}" is ON${other ? `, "${other.name}" is OFF` : ""}`);
      } else {
        await setActive(target.id, true);
        toast.success(`"${target.name}" turned ON`);
      }
      setConfirm(null);
    } catch (err) {
      toast.error(apiError(err, "Could not update the season"));
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (s: Pick<SeasonalRateRecord, "active" | "startDate" | "endDate">) => {
    switch (seasonStatus(s, today)) {
      case "off": return { label: "Not in use", bg: "#fef3c7", fg: "#92400e", note: "Saved, but it is not changing any price right now." };
      case "upcoming": {
        const days = daysCovered(today, s.startDate) - 1;
        return { label: "Starts later", bg: "#dbeafe", fg: "#1e40af", note: `Prices change by themselves on ${longDate(s.startDate)} — in ${days} day${days === 1 ? "" : "s"}.` };
      }
      case "ended": return { label: "Finished", bg: "#f3f4f6", fg: "#374151", note: "These dates have passed. Usual prices apply again." };
      default: return { label: "Running now", bg: "#d1fae5", fg: "#065f46", note: "Guests booking today are charged these prices." };
    }
  };

  const confirmSeason = confirm ? seasons.find((s) => s.id === confirm.id) : undefined;
  const clashOther = confirm?.kind === "clash" ? seasons.find((s) => s.id === confirm.otherId) : undefined;

  const th = { padding: "12px 14px 10px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED, fontWeight: 400, verticalAlign: "bottom", borderBottom: `1px solid ${LINE}` } as const;
  const subTh = { padding: "0 14px 10px", textAlign: "left", fontSize: 12.5, color: INK, fontWeight: 600, whiteSpace: "nowrap" } as const;
  const td = { padding: "18px 14px", verticalAlign: "top" } as const;

  const priceLines = (lines: { when: string; amount: number; usual: number }[]) => lines.map((l) => {
    const d = delta(l.amount, l.usual, true);
    return (
      <div key={l.when} style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{l.when}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 1, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: INK, fontVariantNumeric: "tabular-nums" }}>{peso(l.amount)}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: d.color }}>{d.text}</span>
        </div>
      </div>
    );
  });

  const moneyInput = (key: RateKey | TierKey, label: string, placeholder?: string) => (
    <div style={{ display: "flex", alignItems: "center", marginTop: 8, borderRadius: 10, border: "1px solid #e7dcc5", background: CREAM, overflow: "hidden" }}>
      <span style={{ padding: "0 4px 0 13px", fontSize: 14, color: MUTED }}>₱</span>
      <input type="number" inputMode="decimal" min={1} step="1" aria-label={label} value={form[key]} placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", padding: "11px 13px 11px 4px", fontSize: 14, color: INK, outline: "none", fontFamily: MONO }} />
    </div>
  );

  const rateField = (key: RateKey, title: string, sub: string, usual: number) => {
    const d = delta(form[key], usual);
    return (
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{title}</label>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{sub}</div>
        {moneyInput(key, `${title} price`)}
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 7, lineHeight: 1.5 }}>
          {usual > 0 ? <>Usually {peso(usual)} &middot; </> : null}
          <span style={{ fontWeight: 600, color: d.color }}>{d.text || "type a price"}</span>
        </div>
      </div>
    );
  };

  const rateGroup = (icon: LucideIcon, title: string, sub: string, keys: [RateKey, RateKey], usual: [number, number]) => {
    const Icon = icon;
    return (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: CREAM, borderBottom: `1px solid ${LINE}` }}>
          <Icon style={{ width: 17, height: 17, color: "#b8754a", flex: "none" }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{title}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, padding: 16 }}>
          {rateField(keys[0], "Weekdays", weekdayLabel, usual[0])}
          {rateField(keys[1], "Weekends & holidays", weekendLabel, usual[1])}
        </div>
      </div>
    );
  };

  const optionRow = (title: string, body: string, on: boolean, onChange: () => void, label: string, disabled?: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, padding: 16, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fbf8f2" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{title}</div>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: BODY, lineHeight: 1.6, maxWidth: 480 }}>{body}</p>
      </div>
      <Switch on={on} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );

  const overlapNote = overlap && <>&ldquo;{overlap.name}&rdquo; is already ON for {longDate(overlap.startDate)} → {longDate(overlap.endDate)}.</>;

  const reviewRows: { label: string; amount: string; delta: { text: string; color: string } }[] = [
    { label: `Overnight · ${weekdayLabel}`, amount: peso(form.overnightWeekday), delta: delta(form.overnightWeekday, usualRates.overnightWeekday) },
    { label: `Overnight · ${weekendLabel}`, amount: peso(form.overnightWeekend), delta: delta(form.overnightWeekend, usualRates.overnightWeekend) },
    { label: `Daycation / Nightcation · ${weekdayLabel}`, amount: peso(form.daynightWeekday), delta: delta(form.daynightWeekday, usualRates.daynightWeekday) },
    { label: `Daycation / Nightcation · ${weekendLabel}`, amount: peso(form.daynightWeekend), delta: delta(form.daynightWeekend, usualRates.daynightWeekend) },
    ...(form.useLongterm
      ? LONGTERM_TIERS.filter((t) => form[t.key].trim() !== "").map((t) => ({ label: `Long stay · ${t.label}`, amount: `${peso(form[t.key])}/night`, delta: { text: "per night", color: MUTED } }))
      : []),
  ];

  return (
    <div>
      {/* The native date-picker icon renders near-invisible on the cream input
          background. Same accent-brown tint as NewBookingWizard / OverheadSection. */}
      <style>{`
        .dlx-date::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(0deg);
          opacity: 1;
          cursor: pointer;
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 24, marginBottom: 20 }}>
        <div style={{ maxWidth: 620 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, lineHeight: 1, color: INK, margin: 0 }}>Seasonal Rates</h2>
          <p style={{ fontSize: 14, color: BODY, margin: "10px 0 0", lineHeight: 1.6 }}>
            Charge different prices for a stretch of dates &mdash; Christmas, Holy Week, a long weekend. Turn a season <strong style={{ fontWeight: 600, color: INK }}>ON</strong> and guests booking those dates pay the season price instead of your usual price. Turn it <strong style={{ fontWeight: 600, color: INK }}>OFF</strong> and nothing changes.
          </p>
        </div>
        <button type="button" onClick={() => openWizard(EMPTY_FORM)} className="cursor-pointer"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", fontSize: 14, fontWeight: 500, color: "#fff", background: INK, border: "none", flex: "none" }}>
          <Plus className="w-4 h-4" /> New Season
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: CREAM, border: `1px solid ${LINE}`, marginBottom: 22, maxWidth: 900 }}>
        <Info style={{ width: 16, height: 16, color: "#b8754a", flex: "none", marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: BODY, lineHeight: 1.55 }}>
          Your usual prices live in <strong style={{ fontWeight: 600, color: INK }}>Property → Pricing</strong>. Which days count as weekend or holiday is set in <strong style={{ fontWeight: 600, color: INK }}>System → Settings</strong>. Two seasons that are both ON can never cover the same date.
        </p>
      </div>

      {isLoading ? (
        <div style={{ border: `1px solid ${LINE}`, background: "#fff", padding: 32, textAlign: "center", fontSize: 14, color: MUTED }}>Loading…</div>
      ) : seasons.length === 0 ? (
        <div style={{ border: `1px solid ${LINE}`, background: "#fff", padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: "#f3eee2", color: "#b8754a", display: "grid", placeItems: "center" }}>
            <CalendarRange style={{ width: 24, height: 24 }} />
          </div>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: "18px 0 0", color: INK }}>No seasons yet</h3>
          <p style={{ fontSize: 14, color: BODY, margin: "10px 0 0", maxWidth: 460, lineHeight: 1.6 }}>
            Right now every date is priced with your usual prices. Add a season when you want to charge differently for a stretch of dates.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 26, flexWrap: "wrap", justifyContent: "center" }}>
            {([["christmas", Gift, "Start with Christmas"], ["holy", Church, "Start with Holy Week"], ["newyear", PartyPopper, "Start with New Year"]] as const).map(([key, Icon, label]) => (
              <button key={key} type="button" onClick={() => openPreset(key)} className="cursor-pointer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 13.5, color: INK, background: "#fff", border: "1px solid #d9d1c2" }}>
                <Icon style={{ width: 15, height: 15, color: "#b8754a" }} />{label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => openWizard(EMPTY_FORM)} className="cursor-pointer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "11px 18px", fontSize: 14, fontWeight: 500, color: "#fff", background: INK, border: "none" }}>
            <Plus className="w-4 h-4" />Set up a season from scratch
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: "#fff", border: `1px solid ${LINE}` }}>
            <div className="overflow-x-auto">
              <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: CREAM }}>
                    <th rowSpan={2} style={{ ...th, width: 190 }}>Season &amp; dates</th>
                    <th colSpan={3} style={{ padding: "10px 14px 6px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#b8754a", fontWeight: 600, borderLeft: `1px solid ${LINE}` }}>What guests pay on those dates</th>
                    <th rowSpan={2} style={{ ...th, borderLeft: `1px solid ${LINE}`, width: 120 }}>Promo codes</th>
                    <th rowSpan={2} style={{ ...th, borderLeft: `1px solid ${LINE}`, width: 180 }}>Affecting prices?</th>
                    <th rowSpan={2} style={{ ...th, textAlign: "right", width: 104 }}>Manage</th>
                  </tr>
                  <tr style={{ background: CREAM, borderBottom: `1px solid ${LINE}` }}>
                    <th style={{ ...subTh, borderLeft: `1px solid ${LINE}` }}>Overnight<span style={{ display: "block", fontSize: 11.5, fontWeight: 400, color: MUTED, marginTop: 2 }}>Sleepover, per night</span></th>
                    <th style={subTh}>Daycation &amp; Nightcation<span style={{ display: "block", fontSize: 11.5, fontWeight: 400, color: MUTED, marginTop: 2 }}>A few hours, no sleepover</span></th>
                    <th style={subTh}>Long stays<span style={{ display: "block", fontSize: 11.5, fontWeight: 400, color: MUTED, marginTop: 2 }}>Per night, by length</span></th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => {
                    const status = statusOf(s);
                    const tiers = LONGTERM_TIERS.filter((t) => s[t.key] != null);
                    const days = daysCovered(s.startDate, s.endDate);
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid #f3eee2" }}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>{s.name}</div>
                          <div style={{ fontSize: 13, color: "#4a4034", marginTop: 5, lineHeight: 1.5 }}>{longDate(s.startDate)} → {longDate(s.endDate)}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "3px 9px", borderRadius: 999, background: "#f3eee2", color: "#6b5a44", fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap" }}>
                            <Moon style={{ width: 12, height: 12 }} />{days} {days === 1 ? "date" : "dates"} covered
                          </div>
                        </td>
                        <td style={{ ...td, borderLeft: "1px solid #f3eee2" }}>
                          {priceLines([
                            { when: weekdayLabel, amount: s.overnightWeekday, usual: usualRates.overnightWeekday },
                            { when: weekendLabel, amount: s.overnightWeekend, usual: usualRates.overnightWeekend },
                          ])}
                        </td>
                        <td style={td}>
                          {priceLines([
                            { when: weekdayLabel, amount: s.daynightWeekday, usual: usualRates.daynightWeekday },
                            { when: weekendLabel, amount: s.daynightWeekend, usual: usualRates.daynightWeekend },
                          ])}
                        </td>
                        <td style={td}>
                          {tiers.length > 0 ? tiers.map((t) => (
                            <div key={t.key} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 7, whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 12, color: MUTED }}>{t.label}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: INK, fontVariantNumeric: "tabular-nums" }}>{peso(s[t.key] as number)}</span>
                            </div>
                          )) : (
                            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>No special long-stay price.<br />Every night uses the prices on the left.</div>
                          )}
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", color: s.allowPromos ? GREEN : "#8a4a3c" }}>
                            {s.allowPromos ? <Ticket style={{ width: 15, height: 15 }} /> : <TicketX style={{ width: 15, height: 15 }} />}
                            {s.allowPromos ? "Allowed" : "Not allowed"}
                          </div>
                          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>
                            {s.allowPromos ? "Promo codes still work on these dates." : "Promo codes won’t apply on these dates."}
                          </div>
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Switch on={s.active} label={`Turn ${s.name} ${s.active ? "off" : "on"}`} disabled={busy} onChange={() => onToggle(s)} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: s.active ? GREEN : MUTED }}>{s.active ? "ON" : "OFF"}</span>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", marginTop: 9, padding: "4px 10px", borderRadius: 999, background: status.bg, color: status.fg, fontSize: 11.5, fontWeight: 600 }}>{status.label}</div>
                          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>{status.note}</div>
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                            <button type="button" onClick={() => openWizard(formFrom(s), s.id)} className="cursor-pointer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "flex-start", whiteSpace: "nowrap", padding: "6px 10px", fontSize: 13, fontWeight: 500, color: INK, background: "#fff", border: "1px solid #d9d1c2" }}>
                              <Pencil style={{ width: 13, height: 13 }} />Edit
                            </button>
                            <button type="button" onClick={() => openWizard({ ...formFrom(s), name: `${s.name} (copy)`, active: false })} className="cursor-pointer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "flex-start", whiteSpace: "nowrap", padding: "6px 10px", fontSize: 13, color: BODY, background: "transparent", border: "none" }}>
                              <Copy style={{ width: 13, height: 13 }} />Duplicate
                            </button>
                            <button type="button" onClick={() => setConfirm({ kind: "delete", id: s.id })} className="cursor-pointer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "flex-start", whiteSpace: "nowrap", padding: "6px 10px", fontSize: 13, color: "#991b1b", background: "transparent", border: "none" }}>
                              <Trash2 style={{ width: 13, height: 13 }} />Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: MUTED, margin: "12px 0 0", lineHeight: 1.6 }}>
            Percentages compare each season price with your usual price for the same kind of stay. Dates outside every season keep the usual prices.
          </p>
        </>
      )}

      {wizard && (
        <div onClick={closeWizard} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(31,27,22,0.45)" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="season-wizard-title"
            style={{ width: "100%", maxWidth: 720, maxHeight: "100%", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45), 0 4px 14px -6px rgba(58,42,24,.18)", overflow: "hidden", display: "flex", flexDirection: "column" }}>

            <div style={{ position: "relative", padding: "20px 24px 0", background: "linear-gradient(180deg, #f3e7d2 0%, rgba(255,255,255,0) 100%)", flex: "none" }}>
              <button type="button" onClick={closeWizard} title="Close"
                style={{ position: "absolute", top: 16, right: 16, width: 30, height: 30, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: "50%", background: "rgba(255,255,255,.7)", color: "#8a6f4d", cursor: "pointer" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 44 }}>
                <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: INK, color: "#fff", display: "grid", placeItems: "center" }}><CalendarRange style={{ width: 19, height: 19 }} /></div>
                <div style={{ minWidth: 0 }}>
                  <h3 id="season-wizard-title" style={{ margin: 0, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", color: INK }}>{wizard.id ? "Edit season" : "Set up a new season"}</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#9b8870" }}>Step {step} of 4 · {STEP_SUBS[step - 1]}</p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", marginTop: 20, paddingBottom: 16, overflowX: "auto" }}>
                {STEP_LABELS.map((label, i) => {
                  const num = i + 1, done = step > num, current = step === num;
                  // Completed steps are clickable so the owner can jump back to fix something.
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", flex: num < 4 ? 1 : "none" }}>
                      <button type="button" disabled={!done} onClick={() => setStep(num)}
                        style={{ display: "flex", alignItems: "center", gap: 8, flex: "none", border: "none", background: "transparent", padding: 0, cursor: done ? "pointer" : "default" }}>
                        <span style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, background: current ? INK : done ? GREEN : "#fff", color: current || done ? "#fff" : "#a08a6c", border: `1px solid ${current ? INK : done ? GREEN : "#ded4c0"}` }}>
                          {done ? <Check style={{ width: 13, height: 13 }} /> : num}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: current ? 600 : 400, color: current ? INK : MUTED, whiteSpace: "nowrap" }}>{label}</span>
                      </button>
                      {num < 4 && <span style={{ flex: 1, minWidth: 12, height: 1, background: "#ded4c0", margin: "0 10px" }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: "22px 24px 24px", flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid #f4ecdd" }}>
              {step === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <label htmlFor="season-name" style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: INK }}>What do you want to call this season?</label>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, color: MUTED }}>Only you see this name. It helps you recognise the season later.</p>
                    <input id="season-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Christmas Season 2026" maxLength={120}
                      style={{ width: "100%", marginTop: 9, borderRadius: 10, border: "1px solid #e7dcc5", background: CREAM, padding: "11px 13px", fontSize: 14, color: INK, outline: "none", boxSizing: "border-box" }} />
                    {!wizard.id && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: MUTED }}>Or start from:</span>
                        {([["christmas", "Christmas"], ["holy", "Holy Week"], ["newyear", "New Year"]] as const).map(([key, label]) => (
                          <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, ...presetFor(key, today) }))}
                            style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12.5, color: INK, background: "#fff", border: "1px solid #d9d1c2", cursor: "pointer" }}>{label}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Which dates does it cover?</div>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, color: MUTED }}>Both the first and last day are included.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 9 }}>
                      {([["startDate", "First day"], ["endDate", "Last day"]] as const).map(([key, label]) => (
                        <div key={key}>
                          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#b8754a" }}>{label}</label>
                          <input type="date" className="dlx-date" aria-label={label} value={form[key]} min={key === "endDate" ? form.startDate || undefined : undefined} onChange={(e) => set(key, e.target.value)}
                            style={{ width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #e7dcc5", background: CREAM, padding: "11px 13px", fontSize: 14, color: INK, outline: "none", boxSizing: "border-box" }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {hasRange && (
                    <Callout tone="ok" icon={CircleCheck}>
                      This season covers {daysCovered(form.startDate, form.endDate)} dates, from {longDate(form.startDate)} through {longDate(form.endDate)}. Both days are included.
                    </Callout>
                  )}
                  {datesInverted && (
                    <Callout tone="warn" icon={TriangleAlert}>The last day is before the first day. Please pick a later last day.</Callout>
                  )}
                  {overlap && (
                    <Callout tone="warn" icon={TriangleAlert} title="These dates clash with another season">
                      <span>{overlapNote}</span>
                      <span>Two seasons that are both ON can&rsquo;t share a date, because the system would not know which price to charge. You can change these dates, turn the other season OFF, or save this one as OFF for now.</span>
                    </Callout>
                  )}
                </div>
              )}

              {step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                  <p style={{ margin: 0, fontSize: 13.5, color: BODY, lineHeight: 1.6 }}>Type the price you want guests to pay on these dates. Your usual price is shown under each box so you can see the difference.</p>
                  {rateGroup(BedDouble, "Overnight stay", "Guests sleep over. Price is per night.", ["overnightWeekday", "overnightWeekend"], [usualRates.overnightWeekday, usualRates.overnightWeekend])}
                  {rateGroup(SunMoon, "Daycation & Nightcation", "A few hours only, no sleepover. Both share one price.", ["daynightWeekday", "daynightWeekend"], [usualRates.daynightWeekday, usualRates.daynightWeekend])}

                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", background: CREAM }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CalendarClock style={{ width: 17, height: 17, color: "#b8754a", flex: "none" }} />
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Cheaper nightly price for long stays <span style={{ fontWeight: 400, color: "#a08a6c" }}>· optional</span></div>
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 2, maxWidth: 460, lineHeight: 1.5 }}>Reward guests who book many nights in a row. Leave this off and every night uses the overnight prices above.</div>
                        </div>
                      </div>
                      <Switch on={form.useLongterm} label="Use long stay prices" onChange={() => set("useLongterm", !form.useLongterm)} />
                    </div>
                    {form.useLongterm && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, padding: 16, borderTop: `1px solid ${LINE}` }}>
                        {LONGTERM_TIERS.map((t) => (
                          <div key={t.key}>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{t.label}</label>
                            {moneyInput(t.key, `${t.label} price`, "per night")}
                          </div>
                        ))}
                        <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.55 }}>Leave a box empty and stays of that length use the overnight prices above instead.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {overlap && (
                    <Callout tone="warn" icon={TriangleAlert} title="These dates clash with another season">
                      <span>{overlapNote}</span>
                      <span>This season can only be saved as OFF while &ldquo;{overlap.name}&rdquo; is ON for the same dates. Change the dates, or turn that season OFF first.</span>
                    </Callout>
                  )}
                  {optionRow("Start using these prices right away",
                    "ON means guests booking these dates are charged the season prices. OFF means the season just sits here, saved and ready, changing nothing. You can switch it any time from the list.",
                    willBeOn, () => set("active", !form.active), "Season is on", !!overlap)}
                  {optionRow("Let guests use discount codes on these dates",
                    "Most owners leave this OFF for peak seasons, so nobody stacks a discount on top of an already special price. Turn it ON if you still want promo codes and automatic promotions to work.",
                    form.allowPromos, () => set("allowPromos", !form.allowPromos), "Allow discount codes")}
                </div>
              )}

              {step === 4 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <p style={{ margin: 0, fontSize: 13.5, color: BODY, lineHeight: 1.6 }}>Here is what will happen once you save. Read it once, then save.</p>
                  {overlap && form.active && (
                    <Callout tone="warn" icon={TriangleAlert} title="Saving as OFF because of a date clash">
                      <span>{overlapNote}</span>
                      <span>Because these dates clash with &ldquo;{overlap.name}&rdquo;, this season will be saved as OFF. Nothing about your prices changes until you sort out the clash.</span>
                    </Callout>
                  )}
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", background: CREAM, borderBottom: `1px solid ${LINE}` }}>
                      <div style={{ fontFamily: SERIF, fontSize: 20, color: INK, lineHeight: 1.1 }}>{form.name.trim() || "Untitled season"}</div>
                      <div style={{ fontSize: 13, color: BODY, marginTop: 5 }}>{longDate(form.startDate)} → {longDate(form.endDate)} · {daysCovered(form.startDate, form.endDate)} dates</div>
                    </div>
                    <div style={{ padding: "4px 16px" }}>
                      {reviewRows.map((r) => (
                        <div key={r.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 16px", padding: "11px 0", borderBottom: "1px solid #f6f1e6" }}>
                          <span style={{ fontSize: 13, color: "#4a4034" }}>{r.label}</span>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                            <span style={{ fontFamily: MONO, fontSize: 14, color: INK }}>{r.amount}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: r.delta.color, minWidth: 96 }}>{r.delta.text}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9, borderTop: `1px solid ${LINE}`, background: "#fbf8f2", fontSize: 13, color: "#4a4034" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        {willBeOn ? <Power style={{ width: 16, height: 16, color: GREEN, flex: "none" }} /> : <PowerOff style={{ width: 16, height: 16, color: "#a0632f", flex: "none" }} />}
                        {willBeOn ? "This season starts working as soon as you save." : "Saved but switched OFF — nothing changes until you turn it ON."}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        {form.allowPromos ? <Ticket style={{ width: 16, height: 16, color: GREEN, flex: "none" }} /> : <TicketX style={{ width: 16, height: 16, color: "#8a4a3c", flex: "none" }} />}
                        {form.allowPromos ? "Discount codes still work on these dates." : "Discount codes are turned away on these dates."}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <ShieldCheck style={{ width: 16, height: 16, color: MUTED, flex: "none" }} />Bookings already made keep the price they were booked at.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 24px", borderTop: "1px solid #f4ecdd", background: "#fff", flex: "none" }}>
              <button type="button" onClick={() => (step === 1 ? closeWizard() : setStep(step - 1))} disabled={saving}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, border: "none", background: "transparent", color: "#6f5c44", cursor: "pointer" }}>
                {step === 1 ? <X style={{ width: 14, height: 14 }} /> : <ArrowLeft style={{ width: 14, height: 14 }} />}{step === 1 ? "Cancel" : "Back"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12.5, color: MUTED }}>Step {step} of 4</span>
                <button type="button" onClick={next} disabled={saving}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, border: "none", background: INK, color: "#fff", cursor: saving ? "wait" : "pointer", opacity: stepReady && !saving ? 1 : 0.5 }}>
                  {step === 4 ? (saving ? "Saving…" : "Save this season") : "Next"}
                  {step === 4 ? <Check style={{ width: 14, height: 14 }} /> : <ArrowRight style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirm?.kind === "on" && confirmSeason && (
        <ConfirmDialog icon={Power} iconBg="#eaf5ee" iconFg={GREEN} title="Turn this season ON?"
          body={<>&ldquo;{confirmSeason.name}&rdquo; covers {longDate(confirmSeason.startDate)} → {longDate(confirmSeason.endDate)}.</>}
          detail={statusOf({ ...confirmSeason, active: true }).note}
          cancelLabel="Keep it OFF" confirmLabel="Yes, turn it ON" confirmIcon={Check} confirmBg={GREEN}
          busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      )}

      {confirm?.kind === "clash" && confirmSeason && clashOther && (
        <ConfirmDialog icon={TriangleAlert} iconBg="#fdf0ec" iconFg="#9a4a3a" title="These dates are already taken"
          body={<>&ldquo;{confirmSeason.name}&rdquo; covers {longDate(confirmSeason.startDate)} → {longDate(confirmSeason.endDate)}, and &ldquo;{clashOther.name}&rdquo; is already ON for {longDate(clashOther.startDate)} → {longDate(clashOther.endDate)}.</>}
          detail={<>Two seasons that are both ON can&rsquo;t share a date, because the system would not know which price to charge. Turn &ldquo;{clashOther.name}&rdquo; OFF first, or change one of the date ranges.</>}
          cancelLabel="Leave things as they are" confirmLabel="Swap: turn that one OFF" confirmIcon={Repeat} confirmBg={INK}
          busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      )}

      {confirm?.kind === "delete" && confirmSeason && (
        <ConfirmDialog icon={Trash2} iconBg="#fdeceb" iconFg="#991b1b" title="Delete this season?"
          body={<>&ldquo;{confirmSeason.name}&rdquo; and all the prices you typed for it will be removed.</>}
          detail="Guests who already booked keep the price they were booked at. Only future bookings are affected."
          note={<>If you only want to stop the prices for now, turn the season OFF instead &mdash; that keeps everything you typed.</>}
          cancelLabel="Keep the season" confirmLabel="Delete it" confirmIcon={Trash2} confirmBg="#991b1b"
          busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      )}
    </div>
  );
}
