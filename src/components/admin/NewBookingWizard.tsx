"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { generateBookingId } from "@/lib/booking-store";
import { stayTotal, pickRate, isWeekendOrHoliday, addDaysISO } from "@/lib/pricing";
import { useCalendarRules } from "@/lib/useCalendarRules";
import { havenToRoom } from "@/lib/haven-adapter";

// Admin "New Booking" — implements the New Booking Redesign.
//
// Three steps (Who & When → Payment → Review) plus a success screen. Single
// property, so the haven is auto-selected rather than picked. Pricing is NOT
// hardcoded: rates, stay windows, base pax and the extra-pax fee all come from
// the live haven record, and weekday/weekend/holiday is resolved through the
// owner-editable calendar — the same path the guest storefront uses.

const BASE_PAX_FALLBACK = 2;
const MAX_COUNTED = 4; // adults + young adults; more must book via Messenger
const SECURITY_DEPOSIT = 1000; // refundable, collected at check-in

const BORDER = "#EDE3D2";
const ACCENT = "#B07848";
const TEXTBROWN = "#8B6344";
const DARK = "#1a1a1a";
const CREAM = "#F7F0E3";
const FIELD_BG = "#FAFAFA";
const ERR_BORDER = "#ef4444";
const ERR_BG = "#FDF3F3";

type StayGroup = "10" | "21";
type StayType = { id: string; group: StayGroup; label: string; window: string; multiNight: boolean; ci: string; co: string };
type Entry = { id: string; name: string; room: ReturnType<typeof havenToRoom>; stayTypes: StayType[] };

const STEP_BADGE: React.CSSProperties = { width: 27, height: 27, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 };
const STEP_LABEL: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" };
const STEP_LINE: React.CSSProperties = { flex: 1, height: 2, borderRadius: 2 };
const STAY_CARD: React.CSSProperties = { display: "flex", alignItems: "center", padding: "12px 14px", borderRadius: 15, cursor: "pointer" };
const STAY_DOT: React.CSSProperties = { width: 19, height: 19, borderRadius: "50%", flexShrink: 0 };
const PILL: React.CSSProperties = { flex: 1, textAlign: "center", padding: 11, borderRadius: 13, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const INPUT: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 11, padding: "10px 12px", fontSize: 13.5, marginTop: 5, outline: "none" };
const INPUT_TEXT: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 11, padding: "11px 13px", fontSize: 14, outline: "none" };
const PAY_CARD: React.CSSProperties = { flex: 1, padding: 15, borderRadius: 15, cursor: "pointer", textAlign: "center" };
// Fixed-height logo row so both cards align despite different logo aspect ratios.
const LOGO_ROW: React.CSSProperties = { height: 26, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 };
const BTN: React.CSSProperties = { padding: "12px 22px", borderRadius: 13, fontSize: 13.5, fontWeight: 700, border: "none" };

const peso = (n: number) => "₱" + Math.round(n).toLocaleString();
const fieldStyle = (err: boolean, base: React.CSSProperties): React.CSSProperties =>
  err ? { ...base, border: `1.5px solid ${ERR_BORDER}`, background: ERR_BG, color: DARK }
      : { ...base, border: `1.5px solid ${BORDER}`, background: FIELD_BG, color: DARK };
const pillStyle = (active: boolean, base: React.CSSProperties): React.CSSProperties =>
  active ? { ...base, background: ACCENT, color: "#fff", border: `1.5px solid ${ACCENT}` }
         : { ...base, background: "#fff", color: TEXTBROWN, border: `1.5px solid ${BORDER}` };
const selCardStyle = (sel: boolean, base: React.CSSProperties): React.CSSProperties =>
  sel ? { ...base, background: CREAM, border: `1.5px solid ${ACCENT}` }
      : { ...base, background: "#fff", border: `1.5px solid ${BORDER}` };
const dotStyle = (sel: boolean, base: React.CSSProperties): React.CSSProperties =>
  sel ? { ...base, background: ACCENT, border: `5px solid ${CREAM}`, boxShadow: `0 0 0 1.5px ${ACCENT}` }
      : { ...base, background: "#fff", border: `1.5px solid ${BORDER}` };

function to24(t: unknown): string {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}
function fmt12(t: string): string {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
function nightsBetween(ci: string, co: string): number {
  if (!ci || !co) return 1;
  const a = new Date(ci + "T00:00:00").getTime();
  const b = new Date(co + "T00:00:00").getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}
const phoneValid = (p: string) => /^\d{11}$/.test(p);
const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Per-guest records for check-in. Age ranges mirror the guest checkout:
// adults 18–120, young adults 7–17, children ("7 under") 0–7.
type GType = "adult" | "child" | "infant";
type ExtraGuest = { name: string; age: string; gender: string; ids: string[] };

const ageBad = (v: string, t: GType): boolean => {
  if (v === "") return true;
  const a = parseInt(v, 10);
  if (isNaN(a)) return true;
  return t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 7 || a > 17 : a < 0 || a > 7;
};
const typeLabel = (t: GType) => (t === "adult" ? "Adult" : t === "child" ? "Young adult" : "Child (7 under)");
const agePlaceholder = (t: GType) => (t === "adult" ? "Age (18+)" : t === "child" ? "Age (7–17)" : "Age (0–7)");
// Live feedback: only complain about a typed value, not an empty box.
const ageErrNow = (v: string, t: GType) => v !== "" && ageBad(v, t);
// A valid ID is required for anyone 10 or older — same rule as guest checkout.
// Under-10s carry no ID, so they're exempt.
const ID_MIN_AGE = 10;
const needsId = (age: string): boolean => {
  const a = parseInt(age, 10);
  return !isNaN(a) && a >= ID_MIN_AGE;
};
const ageMsg = (v: string, t: GType): string => {
  const a = parseInt(v, 10);
  if (t === "adult") return v === "" ? "Enter the age." : a < 18 ? "Must be 18 or older — adults only." : "Enter a realistic age (max 120).";
  if (t === "child") return "Young adults must be aged 7–17.";
  return "Children must be aged 7 or under.";
};

const empty = {
  stay: "overnight",
  ci: "", co: "",
  adults: 2, young: 0, kids: 0,
  name: "", email: "", phone: "", age: "", gender: "Male",
  mainIds: [] as string[],
  method: "gcash" as "gcash" | "bank",
  reference: "", proof: "",
  downMode: "half" as "half" | "full",
};

export default function NewBookingWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [phase, setPhase] = useState<"active" | "done">("active");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(empty);
  const [extras, setExtras] = useState<ExtraGuest[]>([]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }));

  const rules = useCalendarRules();

  // Single property → auto-select the first haven (same as the storefront).
  useEffect(() => {
    if (!open) return;
    setPhase("active"); setStep(0); setForm(empty); setExtras([]); setShowErrors(false); setBookingRef("");
    fetch("/api/haven")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const rows: Record<string, unknown>[] = (Array.isArray(j) ? j : j?.data) || [];
        const h = rows[0];
        if (!h) return;
        const w = (ci: string, co: string, fb: [string, string]): [string, string] => {
          const a = to24(h[ci]) || fb[0];
          const b = to24(h[co]) || fb[1];
          return [a, b];
        };
        const [on1, on2] = w("twenty_one_hour_check_in", "twenty_one_hour_check_out", ["19:00", "16:00"]);
        const [dc1, dc2] = w("ten_hour_check_in", "ten_hour_check_out", ["07:00", "17:00"]);
        const [nc1, nc2] = w("six_hour_check_in", "six_hour_check_out", ["19:00", "05:00"]);
        setEntry({
          id: String(h.uuid_id || h.id || ""),
          name: String(h.haven_name || h.name || "D'Lux Homes"),
          room: havenToRoom(h),
          stayTypes: [
            { id: "overnight", group: "21", label: "Overnight", window: `${fmt12(on1)} – ${fmt12(on2)} next day`, multiNight: true, ci: on1, co: on2 },
            { id: "daycation", group: "10", label: "Daycation", window: `${fmt12(dc1)} – ${fmt12(dc2)} (10 hrs)`, multiNight: false, ci: dc1, co: dc2 },
            { id: "nightcation", group: "10", label: "Nightcation", window: `${fmt12(nc1)} – ${fmt12(nc2)} (10 hrs)`, multiNight: false, ci: nc1, co: nc2 },
          ],
        });
      })
      .catch(() => {});
  }, [open]);

  const stay = useMemo(
    () => entry?.stayTypes.find((t) => t.id === form.stay) ?? entry?.stayTypes[0],
    [entry, form.stay],
  );

  const c = useMemo(() => {
    const room = entry?.room;
    const multiNight = stay?.multiNight ?? true;
    const nights = multiNight ? nightsBetween(form.ci, form.co) : 1;
    const adults = Math.max(1, Number(form.adults) || 0);
    const young = Number(form.young) || 0;
    const kids = Number(form.kids) || 0;
    const counted = adults + young;
    const overCap = counted > MAX_COUNTED;
    const basePax = room?.basePax ?? BASE_PAX_FALLBACK;
    const perPax = room?.additionalPaxFee ?? 300;
    const base = room && stay && form.ci ? stayTotal(stay.group, form.ci, nights, room, rules) : 0;
    // Fee is charged once per booking and tops out at the max counted pax.
    const extraCount = Math.min(Math.max(0, counted - basePax), MAX_COUNTED - basePax);
    const paxFee = overCap ? 0 : extraCount * perPax;
    const total = base + paxFee;
    const down = form.downMode === "full" ? total : Math.round(total * 0.5);
    const balance = total - down;
    return { nights, adults, young, kids, counted, overCap, base, extraCount, perPax, paxFee, total, down, balance, atCheckin: balance + SECURITY_DEPOSIT, weekend: isWeekendOrHoliday(form.ci, rules) };
  }, [entry, stay, form, rules]);

  // The main guest is "Adult 1"; every other head gets its own record for
  // check-in. Resize the list whenever the pax counters change.
  useEffect(() => {
    const needed = Math.max(0, c.adults + c.young + c.kids - 1);
    setExtras((prev) => {
      if (prev.length === needed) return prev;
      const next = prev.slice(0, needed);
      while (next.length < needed) next.push({ name: "", age: "", gender: "Male", ids: [] });
      return next;
    });
  }, [c.adults, c.young, c.kids]);

  if (!open) return null;

  // Guests are ordered adults → young adults → children, main guest first.
  const extraType = (i: number): GType => {
    const pos = i + 2;
    if (pos <= c.adults) return "adult";
    if (pos <= c.adults + c.young) return "child";
    return "infant";
  };
  const setExtra = (i: number, patch: Partial<ExtraGuest>) =>
    setExtras((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const addIds = async (files: FileList | null, apply: (d: string[]) => void, existing: string[]) => {
    if (!files || files.length === 0) return;
    try {
      const datas = await Promise.all(Array.from(files).map(fileToDataUrl));
      apply([...existing, ...datas]);
    } catch { toast.error("Could not read the file."); }
  };

  const stayLine = stay?.multiNight ? `Overnight · ${c.nights} night${c.nights > 1 ? "s" : ""}` : (stay?.label ?? "");
  const dateLine = stay?.multiNight ? `${form.ci || "—"} → ${form.co || "—"}` : (form.ci || "—");
  const paxParts = [`${c.adults} adult${c.adults > 1 ? "s" : ""}`];
  if (c.young) paxParts.push(`${c.young} young adult${c.young > 1 ? "s" : ""}`);
  if (c.kids) paxParts.push(`${c.kids} child${c.kids > 1 ? "ren" : ""}`);
  const idCount = form.mainIds.length + extras.reduce((n, g) => n + g.ids.length, 0);

  // Ordered set of invalid field keys for the CURRENT step. Insertion order
  // follows the visual order of the form, so the first entry is the first thing
  // the user needs to fix — that's what we scroll to. A valid ID is required for
  // every guest aged 10+, and the payment proof is required to create a booking.
  const errors = (() => {
    const e = new Set<string>();
    if (step === 0) {
      if (!form.ci) e.add("ci");
      else if (!(c.base > 0)) e.add("ci");
      if (stay?.multiNight && !form.co) e.add("co");
      if (c.overCap) e.add("pax");
      if (!form.name.trim()) e.add("name");
      if (!emailValid(form.email)) e.add("email");
      if (!phoneValid(form.phone)) e.add("phone");
      if (ageBad(form.age, "adult")) e.add("age");
      if (!form.gender) e.add("gender");
      // Main guest is always an adult, so an ID is always required.
      if (form.mainIds.length === 0) e.add("mainIds");
      extras.forEach((g, i) => {
        if (!g.name.trim()) e.add(`x${i}-name`);
        if (ageBad(g.age, extraType(i))) e.add(`x${i}-age`);
        if (!g.gender) e.add(`x${i}-gender`);
        if (needsId(g.age) && g.ids.length === 0) e.add(`x${i}-ids`);
      });
    }
    if (step === 1) {
      // Same as the guest checkout's confirm step: reference + receipt both required.
      if (!form.reference.trim()) e.add("reference");
      if (!form.proof) e.add("proof");
    }
    return e;
  })();

  const err = (k: string) => showErrors && errors.has(k);

  // Jump to the first thing that needs fixing and focus it. The modal body is
  // the scroll container, so scrollIntoView lands correctly inside it.
  const focusFirstError = () => {
    const first = errors.values().next().value;
    if (!first) return;
    setTimeout(() => {
      const el = document.getElementById(`f-${first}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement && typeof el.focus === "function") el.focus({ preventScroll: true });
    }, 60);
  };

  const Err = ({ k, msg }: { k: string; msg: string }) =>
    err(k) ? <div style={{ fontSize: 11, color: ERR_BORDER, marginTop: 4 }}>{msg}</div> : null;

  const setPax = (key: "adults" | "young" | "kids", delta: number, min: number) =>
    setForm((f) => ({ ...f, [key]: Math.max(min, (Number(f[key]) || 0) + delta) }));

  const submit = async () => {
    if (!entry || !stay || saving) return;
    setSaving(true);
    try {
      const splitName = (full: string): [string, string] => {
        const p = full.trim().split(/\s+/);
        return [p[0] || "", p.slice(1).join(" ") || p[0] || ""];
      };
      const [first, last] = splitName(form.name);
      const checkOutDate = stay.multiNight
        ? addDaysISO(form.ci, c.nights)
        : (stay.co <= stay.ci ? addDaysISO(form.ci, 1) : form.ci);
      const fallbackRef = generateBookingId();

      const payload = {
        booking_id: fallbackRef,
        user_id: null,
        haven_id: entry.id,
        room_name: entry.name,
        check_in_date: form.ci,
        check_out_date: checkOutDate,
        check_in_time: stay.ci,
        check_out_time: stay.co,
        adults: c.adults,
        children: c.young,
        infants: c.kids,
        guest_first_name: first,
        guest_last_name: last,
        guest_email: form.email,
        guest_phone: form.phone,
        guest_age: parseInt(form.age, 10) || null,
        guest_gender: form.gender,
        valid_ids: form.mainIds,
        additional_guests: extras.map((g) => {
          const [f, l] = splitName(g.name);
          return { firstName: f, lastName: l, age: g.age, gender: g.gender, validIds: g.ids };
        }),
        payment_proof: form.proof || undefined,
        payment_method: form.method,
        payment_reference: form.reference || undefined,
        room_rate: c.base,
        add_ons_total: 0,
        total_amount: c.total,
        down_payment: c.down,
        add_ons: [],
      };

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) { toast.error(json.error || "Could not create booking"); setSaving(false); return; }
      setBookingRef(json.data?.booking_id || fallbackRef);
      setPhase("done");
      onCreated?.();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (errors.size > 0) {
      setShowErrors(true);
      toast.error(
        c.overCap
          ? "More than 4 counted guests can't be booked online."
          : `Please complete the ${errors.size} highlighted field${errors.size > 1 ? "s" : ""} before continuing.`,
      );
      focusFirstError();
      return;
    }
    if (step === 2) { submit(); return; }
    setShowErrors(false);
    setStep((s) => s + 1);
  };
  const back = () => (step === 0 ? onClose() : (setShowErrors(false), setStep((s) => s - 1)));

  const steps = ["Who & When", "Payment", "Review"].map((label, i) => {
    const done = step > i, active = step === i;
    return {
      label, mark: done ? "✓" : String(i + 1), showLine: i < 2,
      badgeStyle: { ...STEP_BADGE, ...(done ? { background: ACCENT, color: "#fff" } : active ? { background: CREAM, color: ACCENT, border: `1.5px solid ${ACCENT}` } : { background: "#F3EEE4", color: "#C9B79E" }) },
      labelStyle: { ...STEP_LABEL, color: done || active ? ACCENT : "#C9B79E" },
      lineStyle: { ...STEP_LINE, background: done ? ACCENT : BORDER },
    };
  });

  const ReqDot = () => <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#B23B3B", display: "inline-block", marginRight: 5, verticalAlign: "middle" }} />;
  const OptPill = () => <span style={{ font: "600 10px ui-monospace,Menlo,monospace", padding: "2px 6px", borderRadius: 5, background: "#F3EEE4", color: "#A08A6E" }}>optional</span>;
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p style={{ margin: "0 0 9px", fontSize: 12, fontWeight: 700, color: TEXTBROWN, textTransform: "uppercase", letterSpacing: ".04em" }}>{children}</p>
  );
  const RowKV = ({ k, v, top = 5 }: { k: string; v: string; top?: number }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginTop: top }}>
      <span style={{ color: TEXTBROWN }}>{k}</span><span style={{ color: DARK, fontWeight: 600 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(20,15,10,0.5)" }} onClick={onClose}>
      {/* The browser's default calendar icon renders a washed-out grey that all
          but disappears on our cream fields — and vanishes on the red error
          background. Tint it to the accent brown, and to red when the field is
          in an error state, so it stays legible either way. */}
      <style>{`
        .dlx-date::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(0deg);
          opacity: 1;
          cursor: pointer;
        }
        .dlx-date-err::-webkit-calendar-picker-indicator {
          filter: invert(36%) sepia(75%) saturate(3000%) hue-rotate(340deg);
        }
      `}</style>
      <div style={{ width: 520, maxWidth: "100%", borderRadius: 26, background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 30px 70px rgba(20,15,10,0.30)", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 96px)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>

        {phase === "done" ? (
          /* ---------- SUCCESS ---------- */
          <div style={{ padding: "48px 40px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#EAF5EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h2 style={{ margin: "20px 0 6px", fontSize: 21, fontWeight: 800, color: DARK }}>Booking created</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: TEXTBROWN, lineHeight: 1.5, maxWidth: 340 }}>
              {form.name}&apos;s {stay?.multiNight ? "overnight stay" : stay?.label.toLowerCase()} is reserved. A confirmation has been sent to {form.email}.
            </p>

            <div style={{ width: "100%", marginTop: 24, borderRadius: 16, background: "#FAFAF7", border: `1px solid ${BORDER}`, padding: "18px 20px", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: TEXTBROWN }}>Booking ref</span><span style={{ color: DARK, fontWeight: 700, fontFamily: "ui-monospace,Menlo,monospace" }}>{bookingRef}</span></div>
              <RowKV k="Dates" v={dateLine} top={8} />
              <RowKV k="Paid now" v={peso(c.down)} top={8} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                <span style={{ color: TEXTBROWN }}>Collect at check-in</span><span style={{ color: ACCENT, fontWeight: 700 }}>{peso(c.atCheckin)}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 22 }}>
              <button type="button" onClick={() => { setPhase("active"); setStep(0); setForm(empty); setBookingRef(""); }} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 700, border: `1px solid ${BORDER}`, background: "#fff", color: TEXTBROWN, cursor: "pointer" }}>New booking</button>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 700, border: "none", background: ACCENT, color: "#fff", cursor: "pointer" }}>Done</button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- HEADER ---------- */}
            <div style={{ padding: "24px 28px 20px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: DARK }}>New Booking</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: TEXTBROWN }}>{entry?.name ?? "D'Lux Homes"}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, background: CREAM, padding: "6px 13px", borderRadius: 20 }}>{peso(c.total)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20 }}>
                {steps.map((st, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
                    <div style={st.badgeStyle}>{st.mark}</div>
                    <span style={st.labelStyle}>{st.label}</span>
                    {st.showLine && <div style={st.lineStyle} />}
                  </div>
                ))}
              </div>
            </div>

            {/* ---------- BODY ---------- */}
            <div style={{ padding: "24px 28px", overflowY: "auto", flex: 1 }}>

              {/* STEP 0 — Who & When */}
              {step === 0 && (
                <div>
                  <SectionTitle><ReqDot />Stay type</SectionTitle>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {entry?.stayTypes.map((t) => {
                      const sel = form.stay === t.id;
                      const rate = entry.room ? pickRate(t.group, form.ci, entry.room, rules) : 0;
                      return (
                        <div key={t.id} onClick={() => set({ stay: t.id, co: t.multiNight ? form.co : "" })} style={selCardStyle(sel, STAY_CARD)}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{t.label}</div>
                            <div style={{ fontSize: 11.5, color: TEXTBROWN, marginTop: 1 }}>{t.window}</div>
                          </div>
                          <div style={{ textAlign: "right", marginRight: 12 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT }}>{peso(rate)}</div>
                            <div style={{ fontSize: 10.5, color: "#A08A6E" }}>{t.multiNight ? "per night" : "flat"}</div>
                          </div>
                          <div style={dotStyle(sel, STAY_DOT)} />
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 16 }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600, color: TEXTBROWN }}>{stay?.multiNight ? "Check-in date" : "Date"} <ReqDot /></label>
                      <input id="f-ci" aria-label="Check-in date" type="date" value={form.ci}
                        className={`dlx-date${err("ci") ? " dlx-date-err" : ""}`}
                        onChange={(e) => { const v = e.target.value; set({ ci: v, co: stay?.multiNight && v && !form.co ? addDaysISO(v, 1) : form.co }); }}
                        style={fieldStyle(err("ci"), INPUT)} />
                      <Err k="ci" msg="Pick a check-in date." />
                    </div>
                    {stay?.multiNight && (
                      <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: TEXTBROWN }}>Check-out date <ReqDot /></label>
                        <input id="f-co" aria-label="Check-out date" type="date" value={form.co} min={form.ci}
                          className={`dlx-date${err("co") ? " dlx-date-err" : ""}`}
                          onChange={(e) => set({ co: e.target.value })} style={fieldStyle(err("co"), INPUT)} />
                        <Err k="co" msg="Pick a check-out date." />
                      </div>
                    )}
                  </div>
                  {form.ci && (
                    <p style={{ margin: "8px 0 0", fontSize: 11.5, color: TEXTBROWN }}>
                      {stayLine} · <span style={{ color: ACCENT, fontWeight: 600 }}>{c.weekend ? "Weekend/holiday rate" : "Weekday rate"}</span>
                    </p>
                  )}

                  <div style={{ marginTop: 20 }}><SectionTitle>Who&apos;s coming</SectionTitle></div>
                  <div id="f-pax" tabIndex={-1} style={{ display: "flex", flexDirection: "column", gap: 9, outline: "none" }}>
                    {([
                      { key: "adults", label: "Adults", hint: "18+ · counted", min: 1 },
                      { key: "young", label: "Young adults", hint: "7–17 · counted", min: 0 },
                      { key: "kids", label: "Children", hint: "Under 7 · free", min: 0 },
                    ] as const).map((r) => (
                      <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderRadius: 13, background: "#FAFAF7", border: `1px solid ${BORDER}` }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: DARK }}>{r.label}</div>
                          <div style={{ fontSize: 11, color: "#A08A6E" }}>{r.hint}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <button type="button" aria-label={`Decrease ${r.label}`} onClick={() => setPax(r.key, -1, r.min)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "#fff", color: ACCENT, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>−</button>
                          <span style={{ fontSize: 15, fontWeight: 700, color: DARK, minWidth: 16, textAlign: "center" }}>{form[r.key]}</span>
                          <button type="button" aria-label={`Increase ${r.label}`} onClick={() => setPax(r.key, 1, r.min)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "#fff", color: ACCENT, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {c.overCap ? (
                    <div style={{ marginTop: 9, padding: "11px 14px", borderRadius: 13, background: ERR_BG, border: "1px solid #F3C9C9", fontSize: 12, color: "#B23B3B", lineHeight: 1.45 }}>
                      More than 4 counted guests can&apos;t be booked online — please book this party through Messenger.
                    </div>
                  ) : (
                    <p style={{ margin: "9px 0 0", fontSize: 11.5, color: TEXTBROWN }}>
                      {c.extraCount > 0 ? `2 guests included · ${c.extraCount} extra × ${peso(c.perPax)} = ${peso(c.paxFee)}` : "2 guests included in the rate"}
                    </p>
                  )}

                  <div style={{ marginTop: 20 }}><SectionTitle><ReqDot />Main guest (Adult 1)</SectionTitle></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    <div>
                      <input id="f-name" placeholder="Full name" value={form.name} onChange={(e) => set({ name: e.target.value })} style={fieldStyle(err("name"), INPUT_TEXT)} />
                      <Err k="name" msg="Enter the guest's full name." />
                    </div>
                    <div>
                      <input id="f-email" placeholder="Email address" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} style={fieldStyle(err("email"), INPUT_TEXT)} />
                      <Err k="email" msg="Enter a valid email address." />
                    </div>
                    <div>
                      <input id="f-phone" placeholder="Phone number (11 digits)" inputMode="numeric" value={form.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} style={fieldStyle(err("phone"), INPUT_TEXT)} />
                      <Err k="phone" msg="Phone must be exactly 11 digits." />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                      <div>
                        <input id="f-age" type="number" placeholder="Age (18+)" value={form.age} onChange={(e) => set({ age: e.target.value })} style={fieldStyle(err("age") || ageErrNow(form.age, "adult"), INPUT_TEXT)} />
                        {ageErrNow(form.age, "adult")
                          ? <div style={{ fontSize: 11, color: ERR_BORDER, marginTop: 4 }}>{ageMsg(form.age, "adult")}</div>
                          : <Err k="age" msg="Enter the age." />}
                      </div>
                      <div>
                        <select id="f-gender" aria-label="Gender" value={form.gender} onChange={(e) => set({ gender: e.target.value })} style={fieldStyle(err("gender"), INPUT_TEXT)}>
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                        <Err k="gender" msg="Select a gender." />
                      </div>
                    </div>
                    <div>
                      <label id="f-mainIds" tabIndex={-1} style={{ display: "block", border: `1.5px dashed ${err("mainIds") ? ERR_BORDER : BORDER}`, borderRadius: 13, padding: 14, textAlign: "center", fontSize: 12.5, color: err("mainIds") ? ERR_BORDER : "#A08A6E", background: err("mainIds") ? ERR_BG : "#FAFAF7", cursor: "pointer", outline: "none" }}>
                        <ReqDot />{form.mainIds.length > 0 ? `${form.mainIds.length} valid ID(s) attached — add more` : "Upload valid ID(s)"}
                        <input type="file" accept="image/*" multiple style={{ display: "none" }}
                          onChange={(e) => addIds(e.target.files, (d) => set({ mainIds: d }), form.mainIds)} />
                      </label>
                      <Err k="mainIds" msg="A valid ID is required for the main guest." />
                    </div>
                  </div>

                  {extras.length > 0 && (
                    <>
                      <div style={{ marginTop: 20 }}><SectionTitle><ReqDot />Other guests</SectionTitle></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                        {extras.map((g, i) => {
                          const t = extraType(i);
                          return (
                            <div key={i} style={{ borderRadius: 15, background: "#FAFAF7", border: `1px solid ${BORDER}`, padding: "14px 16px" }}>
                              <p style={{ margin: "0 0 9px", fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: ".04em" }}>
                                Guest {i + 2} · {typeLabel(t)}
                              </p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                                <div>
                                  <input id={`f-x${i}-name`} placeholder="Full name" value={g.name} onChange={(e) => setExtra(i, { name: e.target.value })} style={fieldStyle(err(`x${i}-name`), INPUT_TEXT)} />
                                  <Err k={`x${i}-name`} msg="Enter this guest's full name." />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                                  <div>
                                    <input id={`f-x${i}-age`} type="number" placeholder={agePlaceholder(t)} value={g.age} onChange={(e) => setExtra(i, { age: e.target.value })} style={fieldStyle(err(`x${i}-age`) || ageErrNow(g.age, t), INPUT_TEXT)} />
                                    {ageErrNow(g.age, t)
                                      ? <div style={{ fontSize: 11, color: ERR_BORDER, marginTop: 4 }}>{ageMsg(g.age, t)}</div>
                                      : <Err k={`x${i}-age`} msg="Enter the age." />}
                                  </div>
                                  <div>
                                    <select id={`f-x${i}-gender`} aria-label={`Guest ${i + 2} gender`} value={g.gender} onChange={(e) => setExtra(i, { gender: e.target.value })} style={fieldStyle(err(`x${i}-gender`), INPUT_TEXT)}>
                                      <option>Male</option><option>Female</option><option>Other</option>
                                    </select>
                                    <Err k={`x${i}-gender`} msg="Select a gender." />
                                  </div>
                                </div>
                                <div>
                                  <label id={`f-x${i}-ids`} tabIndex={-1} style={{ display: "block", border: `1.5px dashed ${err(`x${i}-ids`) ? ERR_BORDER : BORDER}`, borderRadius: 13, padding: 12, textAlign: "center", fontSize: 12, color: err(`x${i}-ids`) ? ERR_BORDER : "#A08A6E", background: err(`x${i}-ids`) ? ERR_BG : "#fff", cursor: "pointer", outline: "none" }}>
                                    {needsId(g.age) ? <ReqDot /> : null}
                                    {g.ids.length > 0 ? `${g.ids.length} valid ID(s) attached — add more` : "Upload valid ID(s)"}
                                    {!needsId(g.age) && <>&nbsp;<OptPill /></>}
                                    <input type="file" accept="image/*" multiple style={{ display: "none" }}
                                      onChange={(e) => addIds(e.target.files, (d) => setExtra(i, { ids: d }), g.ids)} />
                                  </label>
                                  <Err k={`x${i}-ids`} msg={`A valid ID is required for guests aged ${ID_MIN_AGE} and older.`} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 1 — Payment */}
              {step === 1 && (
                <div>
                  <SectionTitle><ReqDot />Payment method</SectionTitle>
                  <div style={{ display: "flex", gap: 11 }}>
                    <div onClick={() => set({ method: "gcash" })} style={selCardStyle(form.method === "gcash", PAY_CARD)}>
                      <div style={LOGO_ROW}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/gcash.svg" alt="GCash" style={{ height: 24, width: "auto" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>GCash</div>
                    </div>
                    <div onClick={() => set({ method: "bank" })} style={selCardStyle(form.method === "bank", PAY_CARD)}>
                      <div style={LOGO_ROW}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/bpi.svg" alt="BPI" style={{ height: 22, width: "auto" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>BPI transfer</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: TEXTBROWN }}><ReqDot />Reference number</label>
                    <input id="f-reference" placeholder={form.method === "gcash" ? "e.g. GCash ref no." : "e.g. BPI transaction ref"} value={form.reference} onChange={(e) => set({ reference: e.target.value })} style={fieldStyle(err("reference"), INPUT)} />
                    <Err k="reference" msg="Enter the payment reference number." />
                  </div>

                  <div style={{ marginTop: 18 }}><SectionTitle>Down payment to reserve</SectionTitle></div>
                  <div style={{ display: "flex", gap: 9 }}>
                    <div onClick={() => set({ downMode: "half" })} style={pillStyle(form.downMode === "half", PILL)}>50% now ({peso(Math.round(c.total * 0.5))})</div>
                    <div onClick={() => set({ downMode: "full" })} style={pillStyle(form.downMode === "full", PILL)}>Full amount</div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: TEXTBROWN }}><ReqDot />Payment proof</label>
                    <label id="f-proof" tabIndex={-1} style={{ display: "block", marginTop: 5, border: `1.5px dashed ${err("proof") ? ERR_BORDER : BORDER}`, borderRadius: 13, padding: 18, textAlign: "center", fontSize: 12.5, color: err("proof") ? ERR_BORDER : "#A08A6E", background: err("proof") ? ERR_BG : "#FAFAF7", cursor: "pointer", outline: "none" }}>
                      {form.proof ? "Receipt attached — click to replace" : "Upload the payment screenshot"}
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try { set({ proof: await fileToDataUrl(f) }); } catch { toast.error("Could not read the file."); }
                        }} />
                    </label>
                    <Err k="proof" msg="Attach the payment receipt to continue." />
                  </div>

                  <div style={{ marginTop: 18, borderRadius: 15, background: "#FAFAF7", border: `1px solid ${BORDER}`, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: TEXTBROWN }}><span>{stayLine}</span><span style={{ color: DARK, fontWeight: 600 }}>{peso(c.base)}</span></div>
                    {c.paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: TEXTBROWN, marginTop: 7 }}><span>Extra guests · {c.extraCount} × {peso(c.perPax)}</span><span style={{ color: DARK, fontWeight: 600 }}>{peso(c.paxFee)}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: DARK, marginTop: 9, paddingTop: 9, borderTop: `1px solid ${BORDER}` }}><span>Total</span><span style={{ color: ACCENT }}>{peso(c.total)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: TEXTBROWN, marginTop: 11 }}><span>{form.downMode === "full" ? "Paid in full today" : "50% down to reserve"}</span><span style={{ color: DARK, fontWeight: 600 }}>{peso(c.down)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: TEXTBROWN, marginTop: 6 }}><span>At check-in (balance + {peso(SECURITY_DEPOSIT)} deposit)</span><span style={{ color: DARK, fontWeight: 600 }}>{peso(c.atCheckin)}</span></div>
                  </div>
                </div>
              )}

              {/* STEP 2 — Review */}
              {step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ textAlign: "center", padding: "18px 0 4px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TEXTBROWN, textTransform: "uppercase", letterSpacing: ".06em" }}>Total</div>
                    <div style={{ fontSize: 34, fontWeight: 800, color: ACCENT, marginTop: 5 }}>{peso(c.total)}</div>
                    <div style={{ fontSize: 12.5, color: "#A08A6E", marginTop: 3 }}>{peso(c.down)} now · {peso(c.atCheckin)} at check-in</div>
                  </div>

                  {[
                    { title: "Stay", goto: 0, rows: [["Type", stayLine], ["Dates", dateLine], ["Guests", paxParts.join(", ")]] as [string, string][] },
                    {
                      title: "Guest", goto: 0, rows: [
                        ["Name", form.name],
                        ["Email", form.email],
                        ["Phone", form.phone],
                        ...(extras.length ? [["Other guests", extras.map((g) => g.name.trim()).filter(Boolean).join(", ") || "—"]] as [string, string][] : []),
                        ...(idCount ? [["Valid IDs", `${idCount} attached`]] as [string, string][] : []),
                      ] as [string, string][],
                    },
                    { title: "Payment", goto: 1, rows: [["Method", form.method === "gcash" ? "GCash" : "BPI transfer"], [form.downMode === "full" ? "Paid in full today" : "50% down to reserve", peso(c.down)], ["At check-in", peso(c.atCheckin)]] as [string, string][] },
                  ].map((sec) => (
                    <div key={sec.title} style={{ borderRadius: 15, background: "#FAFAF7", border: `1px solid ${BORDER}`, padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: ".04em" }}>{sec.title}</p>
                        <span onClick={() => setStep(sec.goto)} style={{ fontSize: 11.5, fontWeight: 600, color: TEXTBROWN, cursor: "pointer", textDecoration: "underline" }}>Edit</span>
                      </div>
                      {sec.rows.map(([k, v], i) => <RowKV key={k} k={k} v={v} top={i === 0 ? 9 : 5} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---------- FOOTER ---------- */}
            <div style={{ padding: "18px 28px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", gap: 11 }}>
              <button type="button" onClick={back} style={{ padding: "12px 20px", borderRadius: 13, fontSize: 13.5, fontWeight: 700, border: `1px solid ${BORDER}`, background: "#fff", color: TEXTBROWN, cursor: "pointer" }}>
                {step === 0 ? "Cancel" : "Back"}
              </button>
              <button type="button" onClick={next} disabled={saving} style={{ ...BTN, background: ACCENT, color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                {step === 2 ? (saving ? "Creating…" : "Create booking") : "Next"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
