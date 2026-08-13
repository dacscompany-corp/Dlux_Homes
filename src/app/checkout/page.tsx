"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import DluxMark from "@/components/brand/DluxMark";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { imageFileError, PHOTO_READ_ERROR } from "@/lib/validateImageFile";
import { fileToCompressedDataUrl } from "@/lib/compressImage";
import ImageThumb from "@/components/ImageThumb";
import { mockRooms } from "@/lib/mock-data";
import { generateBookingId, addMyBookingId } from "@/lib/booking-store";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { havenToRoom } from "@/lib/haven-adapter";
import { stayTotal, isWeekendOrHoliday, addDaysISO, extraPaxFee, bundleNightlyRate, seniorPwdDiscount, BUNDLE_TWOWEEK_NIGHTS, BUNDLE_MONTH_NIGHTS, BUNDLE_EXTRA_PAX_SURCHARGE } from "@/lib/pricing";
import { useCalendarRules } from "@/lib/useCalendarRules";
import { useGetActivePromotionsQuery } from "@/redux/api/promotionsApi";
import { autoDiscountAmount, pickAutoPromo } from "@/lib/promo-offer";
import { DluxLoaderOverlay, DluxLoaderPage } from "@/components/brand/DluxLoader";

// ── Helpers ────────────────────────────────────────────────────
function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }

// "10:00 AM" → "10:00" (24-hour HH:MM the booking API / TIME columns expect)
function to24h(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  // Build from LOCAL parts — toISOString() shifts the date a day in +UTC zones (PH).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Read a File as a DOWNSCALED base64 data URL — sent to the booking API, which
// uploads it to Cloudinary when configured (otherwise it's skipped gracefully).
// Compression is not cosmetic: raw phone photos blow past Vercel's 4.5 MB
// request-body limit once base64-encoded. See src/lib/compressImage.ts.
function fileToBase64(file: File): Promise<string> {
  // Converting a HEIC (or shrinking a 12MP shot on a slow phone) takes a beat.
  // Without feedback the guest thinks the tap did nothing and adds the photo
  // twice. Only shown if it's actually slow, so quick uploads don't flicker.
  let loadingId: string | undefined;
  const timer = setTimeout(() => { loadingId = toast.loading("Preparing photo…"); }, 500);
  return fileToCompressedDataUrl(file)
    .catch(() => {
      toast.error(PHOTO_READ_ERROR, { duration: 6000 });
      return "";
    })
    .finally(() => {
      clearTimeout(timer);
      if (loadingId) toast.dismiss(loadingId);
    });
}

// Decode photos ONE AT A TIME. Guests are ~99% on phones, and a mid-range
// Android webview can exhaust its memory decoding several 12-megapixel images
// at once — the tab reloads and the half-filled form is lost. Sequential is
// slightly slower but survives cheap hardware.
async function addFilesSequentially(files: FileList, onEach: (name: string, data: string) => void) {
  for (const file of Array.from(files)) {
    const err = imageFileError(file);
    if (err) { toast.error(err); continue; }
    const data = await fileToBase64(file); // resolves "" and toasts on failure
    if (data) onEach(file.name, data);
  }
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatDateLong(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// ── Icons ──────────────────────────────────────────────────────
function IcoChevLeft() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoArrowRight() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>; }
function IcoCheck() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoCheckLg() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoShield() { return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function IcoTag() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>; }
function IcoPlus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoMinus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoPhone() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function IcoCreditCard() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>; }
function IcoHome() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>; }
function IcoUpload() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>; }
function IcoStar() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>; }

const STEPS = ["Your details", "Payment", "Confirm", "Review"];
// Refundable security deposit collected at check-in (D'Lux house policy).
const SECURITY_DEPOSIT = 1000;

// Brand marks for the payment options (see public/images). Matched against the
// method key, provider and display name together, so a method stored as "bank"
// with provider "BPI" still resolves to the BPI logo. Unknown providers return
// null and fall back to the coloured initial badge.
function methodLogo(m: { payment_method?: string | null; provider?: string | null; payment_name?: string | null }): string | null {
  const key = `${m.payment_method ?? ""} ${m.provider ?? ""} ${m.payment_name ?? ""}`.toLowerCase();
  if (key.includes("gcash")) return "/images/gcash.svg";
  if (key.includes("bpi")) return "/images/bpi.svg";
  return null;
}

// One uploaded ID photo: original filename + base64 data. Guests may attach several.
type IdDoc = { name: string; data: string };
// senior: qualifies for the RA 9994 / RA 10754 20% discount. birthday is
// captured for verification at check-in and is required while senior is on.
type Info = { firstName: string; lastName: string; age: string; gender: string; email: string; phone: string; facebook: string; notes: string; validIds: IdDoc[]; senior: boolean; birthday: string };
// Additional (non-main) guests collect only name, age, gender + valid ID(s).
type ExtraGuest = { firstName: string; lastName: string; age: string; gender: string; validIds: IdDoc[]; senior: boolean; birthday: string };
// A payment method configured by the owner (Admin → Payment methods).
type PayMethod = { id: string; payment_name: string; payment_method: string; provider: string; account_details: string; payment_qr_link: string | null; is_active: boolean };
type Payment = { methodId: string; method: string; reference: string; proofName: string | null; proofData: string | null; idName: string | null; idData: string | null };

// One guest row plus the popup that edits it. The row is all that lives in the
// page; the form opens in a modal.
//
// The modal is PORTALLED to <body> on purpose. Its ancestors here carry
// `overflow: hidden` and an animated `translateY` (.page-enter), and a
// transformed ancestor becomes the containing block for `position: fixed` —
// which would quietly break the overlay. Portalling avoids that whole class of
// bug. `children` is unchanged from the accordion version, so no form JSX moved.
function GuestCard({ index, title, subtitle, rowTitle, rowNote, badge, complete, hasErrors, open, onToggle, onDone, filled, total, missing, children }: {
  index: number; title: string; subtitle: string; rowTitle: string; rowNote: string; badge?: string;
  complete: boolean; hasErrors: boolean; open: boolean;
  onToggle: () => void; onDone: () => void;
  filled: number; total: number; missing: string[]; children: React.ReactNode;
}) {
  const accent = hasErrors ? G.err : complete ? G.green : G.accent;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  // Esc closes, and the page behind must not scroll under the sheet. Mirrors the
  // scroll-lock pattern already used in the owner portal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onToggle(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onToggle]);
  return (
    <div style={{
      border: hasErrors ? `2px solid ${G.err}` : complete ? `1px solid #ECE5D4` : `1.5px solid ${G.accent}`,
      borderRadius: 16, background: hasErrors ? G.errField : G.white, marginBottom: 12,
    }}>
      {/* The row's action is a labelled button, not a bare chevron — "Fill in"
          says what tapping does; "Edit" says the guest is already finished. */}
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 18, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        {/* A number, not a person glyph — it reads as "guest 1 of N" and makes
            the list feel like an ordered checklist rather than a set of icons. */}
        <span style={{ width: 40, height: 40, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, background: hasErrors ? G.errBg : complete ? G.greenBg : "#F3EADA", color: accent }}>
          {complete
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            : index}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: G.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowTitle}</span>
            {badge && <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: G.accentInk, background: "#F3EADA", padding: "3px 8px", borderRadius: 999 }}>{badge}</span>}
          </span>
          <span style={{ display: "block", fontSize: 13.5, color: hasErrors ? G.err : complete ? G.green : G.muted, marginTop: 3 }}>{rowNote}</span>
        </span>
        <span style={{ flex: "none", fontSize: 13.5, fontWeight: 600, borderRadius: 999,
          ...(complete
            ? { color: G.accentInk, border: `1px solid ${G.line}`, padding: "10px 18px" }
            : { color: G.white, background: G.accent, padding: "11px 20px" }) }}>{complete ? "Edit" : "Fill in"}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="gc-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onToggle}
          style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", justifyContent: "center", background: "rgba(20,15,10,0.5)" }}>
          {/* stopPropagation so clicks inside the form don't reach the backdrop */}
          <div className="gc-panel" onClick={(e) => e.stopPropagation()}
            style={{ background: G.white, width: "100%", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -10px 44px rgba(20,15,10,.28)" }}>
            <div style={{ flex: "none", padding: "16px 20px 14px", borderBottom: "1px solid #F0E8D8", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="gc-grab" style={{ width: 42, height: 4, borderRadius: 3, background: "#E1D8C6", margin: "0 auto 2px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "'Fraunces', Georgia, serif", fontSize: 21, fontWeight: 500, color: G.ink }}>{title}</span>
                  <span style={{ display: "block", fontSize: 13.5, color: G.muted, marginTop: 3 }}>{subtitle}</span>
                </span>
                <button type="button" onClick={onToggle} aria-label="Close"
                  style={{ flex: "none", width: 40, height: 40, borderRadius: "50%", border: "1px solid #E1D8C6", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: G.ink }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              {/* Progress is measured in filled fields, so it moves as they type */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: "#EFE4CE", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: complete ? G.green : G.accent, borderRadius: 4, transition: "width .25s ease" }} />
                </div>
                <span style={{ flex: "none", fontSize: 12.5, fontWeight: 600, color: complete ? G.green : G.muted, whiteSpace: "nowrap" }}>
                  {complete ? "All set" : `${filled} of ${total} filled`}
                </span>
              </div>
            </div>
            {/* the only scroller — keeps Save pinned no matter how tall the form is */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>{children}</div>
            <div style={{ flex: "none", padding: "14px 20px calc(16px + env(safe-area-inset-bottom))", borderTop: "1px solid #F0E8D8", background: G.white, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* A greyed button that says nothing is the thing we keep fixing —
                  print the reason above it instead of failing silently. */}
              {/* Tell them what is still below the fold, so the ID step is never
                  a surprise they scroll past. */}
              {!complete && missing.some((m) => m.includes("photo")) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12.5, color: G.muted }}>
                  <span style={{ color: G.accent, display: "inline-flex" }}><IcoShield /></span>
                  Next below: a photo of the valid ID
                </div>
              )}
              {!complete && missing.length > 0 && (
                <div style={{ fontSize: 13, color: G.muted, textAlign: "center" }}>
                  Fill the {missing.length} item{missing.length > 1 ? "s" : ""} above to save this guest
                </div>
              )}
              <button type="button" onClick={onDone}
                style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontFamily: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer",
                  background: complete ? G.accent : G.offBg, color: complete ? G.white : G.offInk }}>Save this guest</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Guest form primitives (Claude Design: "Guest Details Modal") ──────────
// Plain-language labels, "required" spelled out, and every control clearing
// 48px so the sheet is usable one-handed on a phone.
const G = {
  ink: "#1F160E", muted: "#8B7458", line: "#E0CEB2", line2: "#D4BE9A",
  accent: "#B07848", accentInk: "#8C5A2E", white: "#FFFCF4", soft: "#FAF7F1",
  green: "#2F7D55", greenBg: "#E7F2EA", err: "#A8492F", errBg: "#FBEDE9",
  errLine: "#F0CFC6", errField: "#FFF8F6", offBg: "#E3D6C0", offInk: "#97866F",
};

function AskLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: G.ink, marginBottom: hint ? 6 : 9 }}>
        {label}{required && <span style={{ color: G.err, fontWeight: 600 }}> required</span>}
      </div>
      {hint && <div style={{ fontSize: 13, color: G.muted, lineHeight: 1.55, marginBottom: 10 }}>{hint}</div>}
    </>
  );
}

// Age as a stepper, but the number is also typeable — tapping + eleven times
// to reach 29 is nobody's idea of fast. Typed input is NOT clamped as you
// type ("1" on the way to "18" would jump to 18); the existing range check
// flags it, and the ± buttons still clamp, so a stray 200 self-corrects on the
// next tap. uid=197609(John Aerol Tapales) gid=197121 groups=197121 lands on the input so a failed Continue can actually focus it
// — it used to sit on the wrapping div, which cannot take focus.
function AgeStepper({ value, onChange, min, max, note, invalid, id }: {
  value: string; onChange: (v: string) => void; min: number; max: number; note: string; invalid?: boolean; id?: string;
}) {
  const n = parseInt(value, 10);
  const cur = isNaN(n) ? null : n;
  const step = (d: number) => onChange(String(Math.min(max, Math.max(min, (cur ?? (d > 0 ? min - 1 : max + 1)) + d))));
  const pad: React.CSSProperties = { width: 46, height: 46, flex: "none", borderRadius: 11, background: "#F3EADA", border: "none", display: "grid", placeItems: "center", color: G.accentInk, fontSize: 21, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, border: `1.5px solid ${invalid ? G.err : G.line2}`, borderRadius: 14, background: invalid ? G.errField : G.white, padding: 5 }}>
        <button type="button" aria-label="Younger" onClick={() => step(-1)} style={pad}>&minus;</button>
        <input id={id} type="text" inputMode="numeric" aria-label="Age" placeholder="–" value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          style={{ width: 56, textAlign: "center", fontSize: 18, fontWeight: 600, color: G.ink, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", padding: 0 }} />
        <button type="button" aria-label="Older" onClick={() => step(1)} style={pad}>+</button>
      </div>
      <div style={{ fontSize: 13, color: invalid ? G.err : G.muted, flex: 1, minWidth: 150, fontWeight: invalid ? 600 : 400 }}>{note}</div>
    </div>
  );
}

function GenderChips({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div style={{ display: "flex", gap: 9 }}>
      {["Male", "Female", "Other"].map((g) => {
        const on = value === g;
        return (
          <button key={g} type="button" aria-pressed={on} aria-label={`${name}: ${g}`} onClick={() => onChange(g)}
            style={{ flex: 1, textAlign: "center", padding: "14px 8px", borderRadius: 14, fontFamily: "inherit", cursor: "pointer",
              border: `1.5px solid ${on ? G.accent : G.line}`, background: on ? "rgba(176,120,72,.08)" : G.white,
              fontSize: 15, fontWeight: on ? 600 : 400, color: G.ink }}>{g}</button>
        );
      })}
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Birthday as three dropdowns rather than <input type="date">. The native date
// picker is a calendar that opens on the current month — reaching 1958 from
// there is a lot of tapping, and this field is aimed squarely at people born
// 60+ years ago. Day options follow the chosen month so 31 February can't be
// entered. Emits "" until all three are chosen, so validation still catches a
// half-filled date.
function BirthdayPicker({ value, onChange, invalid }: {
  value: string; onChange: (v: string) => void; invalid: boolean;
}) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-") : ["", "", ""];
  const [year, setYear] = useState(parsed[0]);
  const [month, setMonth] = useState(parsed[1]);
  const [day, setDay] = useState(parsed[2]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1899 }, (_, i) => String(thisYear - i));
  const daysInMonth = month
    ? new Date(Number(year) || 2000, Number(month), 0).getDate()
    : 31;
  const emit = (y: string, m: string, d: string) => {
    // Trim an out-of-range day when the month changes (e.g. Mar 31 → Feb).
    const max = m ? new Date(Number(y) || 2000, Number(m), 0).getDate() : 31;
    const dd = d && Number(d) > max ? "" : d;
    setYear(y); setMonth(m); setDay(dd);
    onChange(y && m && dd ? `${y}-${m}-${dd}` : "");
  };
  const sel: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 12,
    border: `1.5px solid ${invalid ? G.err : G.line2}`, background: invalid ? G.errField : G.white,
    fontFamily: "inherit", fontSize: 15, color: G.ink, appearance: "none", WebkitAppearance: "none",
  };
  const cap: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6F5B43", marginBottom: 5 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "block" }}>
        <span style={cap}>Month</span>
        <select value={month} onChange={(e) => emit(year, e.target.value, day)} style={sel}>
          <option value="">Choose month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
        </select>
      </label>
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={cap}>Day</span>
          <select value={day} onChange={(e) => emit(year, month, e.target.value)} style={sel}>
            <option value="">Day</option>
            {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={cap}>Year</span>
          <select value={year} onChange={(e) => emit(e.target.value, month, day)} style={sel}>
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

// Senior citizen / PWD claim. A big tappable checkmark row rather than a switch
// — switches read as a setting, and this is a claim the guest is making. The
// eligibility card spells out who qualifies in plain words, because "senior or
// PWD" alone leaves people guessing and the wrong guess costs them 20%.
function SeniorPwdField({ on, birthday, onToggle, onBirthday, invalid, idPrefix, main }: {
  on: boolean; birthday: string; onToggle: (v: boolean) => void; onBirthday: (v: string) => void;
  invalid: boolean; idPrefix: string; main: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: G.ink, marginBottom: 5 }}>Discount</div>
      <div style={{ fontSize: 13, color: "#6F5B43", lineHeight: 1.55, marginBottom: 10 }}>
        Senior citizens and persons with disability get 20% off their share of the room.
      </div>

      <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(!on)}
        style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer", padding: 14, borderRadius: 14, boxSizing: "border-box",
          border: `2px solid ${on ? G.accent : G.line2}`, background: on ? "rgba(176,120,72,.08)" : G.white }}>
        <span style={{ flex: "none", width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", color: G.white,
          border: `2px solid ${on ? G.accent : "#C4B398"}`, background: on ? G.accent : G.white }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: G.ink, lineHeight: 1.35 }}>
            {main ? "I am a senior citizen or a PWD" : "This guest is a senior citizen or a PWD"}
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: "#6F5B43", marginTop: 4, lineHeight: 1.45 }}>Tap this box to claim the 20% discount.</span>
        </span>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", marginTop: 10, borderRadius: 13, background: G.soft, border: "1px solid #ECE0CC" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: G.ink }}>You can tick the box if either is true:</div>
        {[
          main
            ? <>You are <strong style={{ color: G.ink }}>60 years old or older</strong></>
            : <>This guest is <strong style={{ color: G.ink }}>60 years old or older</strong></>,
          main
            ? <>You have a <strong style={{ color: G.ink }}>PWD ID</strong> from your city or municipality</>
            : <>This guest has a <strong style={{ color: G.ink }}>PWD ID</strong> from their city or municipality</>,
        ].map((line, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ flex: "none", width: 5, height: 5, borderRadius: "50%", background: G.accent, marginTop: 8 }} />
            <span style={{ fontSize: 13, color: "#6F5B43", lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
        <div style={{ fontSize: 12.5, color: G.muted, lineHeight: 1.5, marginTop: 2 }}>
          {main ? "Bring that same ID with you at check-in." : "They must bring that same ID at check-in."} Not sure? Leave the box unticked.
        </div>
      </div>

      {on && (
        <div id={`f-${idPrefix}birthday`} style={{ marginTop: 12, padding: 14, borderRadius: 14, border: `2px solid ${invalid ? G.err : G.accent}`, background: invalid ? G.errField : "rgba(176,120,72,.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: G.ink, marginBottom: 4 }}>
            {main ? "What is your birthday?" : "What is their birthday?"}<span style={{ color: G.err }}> required</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#6F5B43", lineHeight: 1.55, marginBottom: 12 }}>
            Use the date printed on {main ? "your" : "their"} senior citizen or PWD ID.
          </div>
          <BirthdayPicker value={birthday} onChange={onBirthday} invalid={invalid} />
          {invalid && <div style={{ fontSize: 12.5, color: G.err, fontWeight: 600, marginTop: 10 }}>Choose the month, day and year.</div>}
        </div>
      )}
    </div>
  );
}

// Numbered to-do shown once at the top of the popup body.
function MissingList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const head = items.length === 1 ? "One thing is still needed" : `${items.length} things are still needed`;
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 16px", borderRadius: 14, background: G.errBg, border: `1px solid ${G.errLine}` }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={G.err} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "#7E3320", marginBottom: 6 }}>{head}</div>
        <div style={{ fontSize: 13.5, color: "#7E3320", lineHeight: 1.7 }}>
          {items.map((t, i) => <div key={i}>{i + 1}. {t}</div>)}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, borderWidth: 1, borderStyle: "solid", borderColor: "#D4BE9A", fontSize: 14, background: "#FFFCF4", color: "#1F160E", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

function UploadField({ label, sub, value, onChange, invalid, id }: { label: string; sub: string; value: string | null; onChange: (name: string, data: string) => void; invalid?: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div id={id}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", marginBottom: 8 }}>{label}</div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const err = imageFileError(f); if (err) { toast.error(err); e.target.value = ""; return; } fileToBase64(f).then((data) => { if (data) onChange(f.name, data); }); } }} />
      <button onClick={() => ref.current?.click()}
        style={{ width: "100%", padding: 16, borderRadius: 14, border: invalid ? "1px solid #ef4444" : value ? "1px solid #B07848" : "1px dashed #D4BE9A", background: value ? "rgba(176,120,72,.06)" : "#FAF7F1", display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer" }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: value ? "#22C55E" : "#EFE4CE", display: "grid", placeItems: "center", color: value ? "#fff" : "#A88E63", flex: "none" }}>
          {value ? <IcoCheckLg /> : <IcoUpload />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F160E" }}>{value || "Click to upload"}</div>
          <div style={{ fontSize: 11.5, color: "#8B7458", marginTop: 2 }}>{value ? "Uploaded — tap to replace" : sub}</div>
        </div>
      </button>
      {invalid && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>Required</div>}
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div style={{ padding: "18px 0", borderBottom: "1px solid #E0CEB2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E" }}>{title}</div>
        <button onClick={onEdit} style={{ fontSize: 12, fontWeight: 600, textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer", color: "#1F160E" }}>Edit</button>
      </div>
      {children}
    </div>
  );
}

// Compact dark valid-ID uploader reused for each additional guest. Supports
// attaching several photos (e.g. front & back of an ID, or multiple IDs).
function GuestIdUpload({ values, onAdd, onRemove, invalid, id, title = "Photo of their valid ID", accepted, requiredMsg = "Please add a photo of this guest's ID." }: { values: IdDoc[]; onAdd: (name: string, data: string) => void; onRemove: (index: number) => void; invalid?: boolean; id?: string; title?: string; accepted?: string; requiredMsg?: string }) {
  const pick = (capture?: boolean) => {
    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/*";
    if (!capture) f.multiple = true; // file picker may select several at once
    if (capture) (f as unknown as { capture: string }).capture = "environment";
    f.onchange = (e) => { const files = (e.target as HTMLInputElement).files; if (files) addFilesSequentially(files, onAdd); };
    f.click();
  };
  // Camera first — most guests are on a phone and photographing the ID beats
  // hunting for a saved file.
  const tile = (primary: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 0, padding: "20px 12px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center",
    border: primary
      ? `${invalid ? 2 : 1.5}px solid ${invalid ? G.err : G.accent}`
      : `1.5px dashed ${G.line2}`,
    background: primary ? (invalid ? G.errField : "rgba(176,120,72,.07)") : G.soft,
  });
  return (
    <div id={id}>
      <AskLabel label={title} required hint={accepted ?? "Take a picture of the driver's licence, passport, national ID or school ID. Make sure the name and photo are readable. Everyone aged 10 and above needs one."} />
      {invalid && <div style={{ fontSize: 13, color: G.err, fontWeight: 600, marginBottom: 10 }}>{requiredMsg}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button type="button" onClick={() => pick(true)} style={tile(true)}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={invalid ? G.err : G.accentInk} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span style={{ fontSize: 15, fontWeight: 600, color: G.ink }}>Take a photo</span>
          <span style={{ fontSize: 12, color: G.muted }}>Opens your camera</span>
        </button>
        <button type="button" onClick={() => pick(false)} style={tile(false)}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={G.accentInk} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span style={{ fontSize: 15, fontWeight: 600, color: G.ink }}>Choose a photo</span>
          <span style={{ fontSize: 12, color: G.muted }}>From your phone or computer</span>
        </button>
      </div>
      {values.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {values.map((doc, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: `1px solid ${G.line}`, borderRadius: 14, background: G.soft }}>
              <ImageThumb src={doc.data} alt={doc.name} size={62} rounded={11} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: G.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#15803D", background: "#DCFCE7", padding: "4px 10px", borderRadius: 999, marginTop: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Added
                </span>
              </div>
              <button type="button" onClick={() => onRemove(idx)} style={{ flex: "none", fontSize: 13, fontWeight: 600, color: "#B4453C", background: "transparent", border: "none", cursor: "pointer", padding: 8, fontFamily: "inherit" }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: G.muted, marginTop: 10 }}>You can add more than one photo — front and back, for example.</div>
    </div>
  );
}

function CheckoutInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Checkout requires an account: send guests to sign in/up first, then back here.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      const cb = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?callbackUrl=${cb}`);
    }
  }, [authStatus, router]);

  const roomId = sp.get("roomId") || "1";
  const stayType = sp.get("stayType") || "21";
  const checkInTime = sp.get("checkIn") || "7:00 PM";
  const checkOutTime = sp.get("checkOut") || "4:00 PM";
  const windowLabel = sp.get("windowLabel") || "Full stay";
  const date = sp.get("date") || "";
  const adults = Number(sp.get("adults") || 2);
  const children = Number(sp.get("children") || 0);
  const infants = Number(sp.get("infants") || 0);
  // Overnight (21h) stays can span multiple nights; 10h sessions are always 1.
  const nights = stayType === "10" ? 1 : Math.max(1, Number(sp.get("nights") || 1));

  // Live haven by id; fall back to mock so the page renders while loading.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId ?? "");
  const { data: havenRes } = useGetHavenByIdQuery(roomId, { skip: !roomId || !isUuid });
  const liveHaven = (havenRes as { data?: Record<string, unknown> } | undefined)?.data;
  const room = liveHaven ? havenToRoom(liveHaven) : (mockRooms.find((r) => r.id === roomId) || mockRooms[0]);

  const [step, setStep] = useState(0);
  // ALWAYS update this with the functional form — setInfo((prev) => ...) — never
  // setInfo({ ...info, ... }). Photo uploads write into `info.validIds` from an
  // async callback, and compressing a 12MP phone photo takes 1–3 seconds. A
  // handler that closes over a stale `info` and fires during that window
  // overwrites the finished upload with the older snapshot, silently emptying
  // validIds — the guest sees their ID thumbnail, submits, and the booking is
  // stored with no ID attached.
  const [info, setInfo] = useState<Info>({ firstName: "", lastName: "", age: "", gender: "Male", email: "", phone: "", facebook: "", notes: "", validIds: [], senior: false, birthday: "" });
  const [payment, setPayment] = useState<Payment>({ methodId: "", method: "", reference: "", proofName: null, proofData: null, idName: null, idData: null });
  // Active payment methods (with QR + account details) configured by the owner.
  const [methods, setMethods] = useState<PayMethod[]>([]);
  useEffect(() => {
    fetch("/api/payment-methods")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const active: PayMethod[] = (Array.isArray(j?.data) ? j.data : []).filter((m: PayMethod) => m.is_active);
        setMethods(active);
        setPayment((p) => (p.methodId || !active[0]) ? p : { ...p, methodId: active[0].id, method: active[0].payment_method });
      })
      .catch(() => {});
  }, []);
  const selectedMethod = methods.find((m) => m.id === payment.methodId) || null;
  const [copied, setCopied] = useState(false);
  const copyAccount = () => {
    try { if (selectedMethod && navigator.clipboard) navigator.clipboard.writeText(selectedMethod.account_details); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const [submitting, setSubmitting] = useState(false);
  // Show field markings only after a failed Continue/Confirm; clear on step change.
  const [showErrors, setShowErrors] = useState(false);
  useEffect(() => { setShowErrors(false); }, [step]);

  // Each booking covers every named guest (adults + children + infants); guest 1
  // is the main guest above, so collect reduced details for everyone beyond the first.
  const extraCount = Math.max(0, adults + children + infants - 1);
  const [extraGuests, setExtraGuests] = useState<ExtraGuest[]>([]);
  useEffect(() => {
    setExtraGuests((prev) => {
      const next = prev.slice(0, extraCount);
      while (next.length < extraCount) next.push({ firstName: "", lastName: "", age: "", gender: "Male", validIds: [], senior: false, birthday: "" });
      return next;
    });
  }, [extraCount]);
  const updateGuest = (i: number, patch: Partial<ExtraGuest>) =>
    setExtraGuests((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  // Guests are ordered adults → children → infants. The main guest is adult #1,
  // so an extra guest's type follows its overall position (i + 2, main = 1).
  const guestType = (i: number): "adult" | "child" | "infant" => {
    const pos = i + 2;
    if (pos <= adults) return "adult";
    if (pos <= adults + children) return "child";
    return "infant";
  };

  // Which guest card is expanded. 0 = main guest, 1..n = extraGuests[0..n-1].
  // Only one is open at a time, so a 4-pax booking reads as a short checklist
  // instead of four stacked forms. Clamped on read (below) because extraGuests
  // resizes by effect when the pax counts change.
  // Starts closed. It defaulted to 0 back when this was an inline accordion,
  // where an open first section was helpful; as a modal that same default threw
  // a popup over the page before the guest had done anything.
  const [openGuest, setOpenGuest] = useState<number | null>(null);

  // Owner-editable weekend/holiday calendar (System → Settings in the admin
  // portal); falls back to Fri/Sat + built-in PH holidays if unreachable.
  const calendarRules = useCalendarRules();
  // Weekday vs weekend/holiday rate based on the check-in date.
  const isWeekendRate = isWeekendOrHoliday(date, calendarRules);
  // D'Lux pricing: base rate covers 2 pax; each extra adult/young adult adds a
  // per-pax fee CHARGED PER NIGHT. "Children (7 under)" are exempt from the fee.
  // No cleaning or service fee. Resolved BEFORE the price because on a bundle
  // stay, extra pax also raise the nightly bundle rate itself.
  const feePax = adults + children; // adults + young adults; excludes 7-under
  const extraPaxCount = Math.max(0, feePax - room.basePax);
  const hasExtraPax = extraPaxCount > 0;
  // Stay price: 10h single session, or 21h × nights (each night priced by its
  // own date) — UNLESS the stay is long enough to qualify for a length-of-stay
  // bundle discount (5/12/20+ nights), in which case a flat nightly rate applies.
  const basePrice = stayTotal(stayType, date, nights, room, calendarRules, hasExtraPax);
  const bundleRate = stayType === "10" ? undefined : bundleNightlyRate(nights, date, room, calendarRules, hasExtraPax);
  const bundleLabel = bundleRate == null ? null
    : nights >= BUNDLE_MONTH_NIGHTS ? "Monthly rate"
    : nights >= BUNDLE_TWOWEEK_NIGHTS ? "Two-week rate"
    : "Weekly rate";
  const paxFee = extraPaxFee(feePax, room.basePax, room.additionalPaxFee, nights);
  // Senior citizen / PWD: 20% off each qualifying guest's share of the ROOM
  // (basePrice), never the pax fee. Comes off before any promo code, so a promo
  // lands on the already-reduced subtotal — the statutory discount is protected.
  const seniorCount = (info.senior ? 1 : 0) + extraGuests.filter((g) => g.senior).length;
  const seniorDiscount = seniorPwdDiscount(basePrice, feePax, seniorCount);
  const subtotal = Math.max(0, basePrice + paxFee - seniorDiscount);
  const { data: activePromotions } = useGetActivePromotionsQuery();

  // Promo code — validated against /api/discounts/validate as the guest types.
  // ?promo= arrives pre-filled from the home page's promo banner and auto-applies.
  type AppliedDiscount = { id: string; code: string; name: string; discount_type: "percentage" | "fixed"; discount_value: number; discount_amount: number };
  const [promoInput, setPromoInput] = useState(sp.get("promo") || "");
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "error">("idle");
  const [promoError, setPromoError] = useState("");
  const applyPromo = async (codeOverride?: string) => {
    const code = (codeOverride ?? promoInput).trim();
    if (!code) return;
    setPromoStatus("checking");
    setPromoError("");
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, haven_id: isUuid ? roomId : null, amount: subtotal, user_id: session?.user?.id ?? null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAppliedDiscount(null);
        setPromoStatus("error");
        setPromoError(json.error || "This promo code is invalid or has expired.");
        return;
      }
      setAppliedDiscount(json.data);
      setPromoStatus("idle");
      toast.success(`"${json.data.code}" applied.`);
    } catch {
      setAppliedDiscount(null);
      setPromoStatus("error");
      setPromoError("Network error. Please try again.");
    }
  };
  const removePromo = () => { setAppliedDiscount(null); setPromoInput(""); setPromoStatus("idle"); setPromoError(""); };
  // Auto-apply a code carried over from the home page banner, once, on load.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    const promo = sp.get("promo");
    if (promo) { autoAppliedRef.current = true; applyPromo(promo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-validate whenever the subtotal changes (e.g. guest count changes the
  // pax fee) so a min-booking-amount code doesn't silently overcharge.
  useEffect(() => {
    if (appliedDiscount) applyPromo(appliedDiscount.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  // Automatic promotion — no code to type. Resolved from the server's active
  // list rather than a URL param, so it can't be forged by editing the link,
  // and only applied when it covers the stay type being booked.
  const autoPromo = pickAutoPromo(activePromotions, stayType === "10" ? "10" : "21");
  // Never stack: a code the guest entered wins over the automatic offer, since
  // they took a deliberate action to use it.
  const autoDiscount = appliedDiscount || !autoPromo ? 0 : autoDiscountAmount(autoPromo, subtotal);

  const discountAmount = (appliedDiscount?.discount_amount ?? 0) + autoDiscount;
  const total = Math.max(0, subtotal - discountAmount);
  const downPayment = Math.round(total * 0.5); // 50% reservation down payment
  const stepCaption = ["Step 1 of 4 — tell us who's staying", "Step 2 of 4 — send your down payment to reserve", "Step 3 of 4 — confirm the payment you sent", "Step 4 of 4 — review and submit your request"][step];

  // Per-field validation for the current step. Returns the set of invalid field
  // keys so the Continue button can stay clickable while we mark exactly what's
  // still missing (instead of silently disabling the button).
  const fieldErrors = ((): Set<string> => {
    const e = new Set<string>();
    if (step === 0) {
      const age = parseInt(info.age);
      if (!info.firstName) e.add("firstName");
      if (!info.lastName) e.add("lastName");
      // Main guest is Adult 1 — must be a realistic adult age (18–120).
      if (!info.age || isNaN(age) || age < 18 || age > 120) e.add("age");
      if (!info.gender) e.add("gender");
      if (!info.email || !/@/.test(info.email)) e.add("email");
      if (!/^\d{11}$/.test(info.phone)) e.add("phone");
      if (age >= 10 && info.validIds.length === 0) e.add("validId");
      // Only required while the senior/PWD toggle is on — no age gate, since
      // PWD status has no minimum age.
      if (info.senior && !info.birthday) e.add("birthday");
      extraGuests.forEach((g, i) => {
        const a = Number(g.age);
        const t = guestType(i);
        if (!g.firstName) e.add(`x${i}-firstName`);
        if (!g.lastName) e.add(`x${i}-lastName`);
        // Age range by type: adults 18–120, young adults 7–17, children 7 & under.
        const ageBad = g.age === "" || isNaN(a) ||
          (t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 7 || a > 17 : a < 0 || a > 7);
        if (ageBad) e.add(`x${i}-age`);
        if (!g.gender) e.add(`x${i}-gender`);
        // Document: required when the guest is 10 or older.
        const needDoc = a >= 10;
        if (needDoc && g.validIds.length === 0) e.add(`x${i}-validId`);
        if (g.senior && !g.birthday) e.add(`x${i}-birthday`);
      });
    }
    // Step 1 (Payment): a payment method must be selected.
    if (step === 1 && !payment.methodId) e.add("method");
    // Step 2 (Confirm payment): reference number + receipt are required, since
    // the guest pays the 50% down payment during checkout.
    if (step === 2) {
      if (!payment.reference.trim()) e.add("reference");
      if (!payment.proofData) e.add("receipt");
    }
    return e;
  })();

  // ── Guest card completion ────────────────────────────────────────────────
  // Derived from fieldErrors, never stored, so the "N/M Added" counter and the
  // Continue button can never disagree about who is finished.
  const totalGuests = 1 + extraGuests.length;
  const openGuestIdx = openGuest == null ? null : Math.min(openGuest, totalGuests - 1);
  // Error keys belonging to guest `gi` — 0 is the main guest, 1.. are the rest.
  const guestErrorKeys = (gi: number) =>
    gi === 0
      ? ["firstName", "lastName", "age", "gender", "email", "phone", "validId"].filter((k) => fieldErrors.has(k))
      : [...fieldErrors].filter((k) => k.startsWith(`x${gi - 1}-`));
  const guestComplete = (gi: number) => guestErrorKeys(gi).length === 0;
  // Fields counted by the popup's progress meter. The main guest carries the
  // contact block the others don't, hence the different totals (8 vs 5).
  const guestTotal = (gi: number) => (gi === 0 ? 8 : 5);
  const guestFilled = (gi: number) => {
    const some = (v: unknown) => String(v ?? "").trim().length > 0;
    if (gi === 0) return [info.firstName, info.lastName, info.age, info.gender, info.email, info.phone, info.facebook].filter(some).length + (info.validIds.length ? 1 : 0);
    const g = extraGuests[gi - 1];
    return g ? [g.firstName, g.lastName, g.age, g.gender].filter(some).length + (g.validIds.length ? 1 : 0) : 0;
  };
  // Plain-language name for each error key — the popup lists these as a numbered
  // to-do and the row repeats them, so "what is wrong" is never a red outline
  // the guest has to go hunting for.
  const guestMissing = (gi: number) => {
    const words: Record<string, string> = {
      firstName: "first name", lastName: "last name", age: "age", gender: "gender",
      email: "email address", phone: "phone number",
      validId: gi === 0 ? "a photo of your ID" : "a photo of their ID",
      birthday: "the birthday on the senior citizen or PWD ID",
    };
    return guestErrorKeys(gi).map((k) => words[k.replace(/^x\d+-/, "")]).filter(Boolean);
  };
  // ["a","b","c"] → "a, b and c"
  const listPhrase = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
  const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  // First guest still missing something — drives the "not finished yet" banner
  // and the reason printed above a disabled Continue.
  const firstIncomplete = Array.from({ length: totalGuests }, (_, gi) => gi).find((gi) => !guestComplete(gi)) ?? null;
  // Field chrome for the popup — 16px text and 48px targets per the design.
  const askStyle = (invalid: boolean): React.CSSProperties => ({
    width: "100%", padding: "15px 16px", borderRadius: 14, fontSize: 16, fontFamily: "inherit",
    color: G.ink, outline: "none", boxSizing: "border-box",
    border: `${invalid ? 2 : 1.5}px solid ${invalid ? G.err : G.line2}`,
    background: invalid ? G.errField : G.white,
  });
  const askRow = (invalid: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14,
    border: `${invalid ? 2 : 1.5}px solid ${invalid ? G.err : G.line2}`,
    background: invalid ? G.errField : G.white,
  });
  const bareInput: React.CSSProperties = { flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 16, fontFamily: "inherit", color: G.ink };
  // The row lists what a guest still needs as short grouped nouns
  // ("Name, age, contact, valid ID") rather than one phrase per field, which
  // ran to two lines and buried the point.
  const guestNeeds = (gi: number) => {
    const has = (k: string) => fieldErrors.has(gi === 0 ? k : `x${gi - 1}-${k}`);
    const needs: string[] = [];
    if (has("firstName") || has("lastName")) needs.push("Name");
    if (has("age")) needs.push("Age");
    if (gi === 0 && (has("email") || has("phone"))) needs.push("Contact");
    // fieldErrors only flags a missing ID once an age of 10+ has been typed, so
    // relying on it alone hid "Valid ID" from the row until the age was in —
    // exactly when the guest most needs to know it is coming. List it whenever
    // one is certain to be required: the booker is 18+ by definition, and so is
    // anyone counted as an adult.
    const docs = gi === 0 ? info.validIds : (extraGuests[gi - 1]?.validIds ?? []);
    const age = Number(gi === 0 ? info.age : extraGuests[gi - 1]?.age);
    const certain = gi === 0 || guestType(gi - 1) === "adult" || (!isNaN(age) && age >= 10);
    if (docs.length === 0 && (certain || has("validId"))) needs.push("Valid ID");
    return needs;
  };
  // "Main guest — you", then Second/Third/Fourth guest.
  const guestLabel = (gi: number) =>
    gi === 0 ? "Main guest — you" : `${["Second", "Third", "Fourth", "Fifth"][gi - 1] ?? `Guest ${gi + 1}`} guest`;
  // What the collapsed row says under the guest's name.
  const guestRowNote = (gi: number) => {
    const needs = guestNeeds(gi);
    if (needs.length === 0) return "All done";
    // Sentence-case the first, lower-case the rest: "Name, age, valid ID".
    return needs.map((n, i) => (i === 0 ? n : n.toLowerCase())).join(", ");
  };
  const addedCount = Array.from({ length: totalGuests }, (_, gi) => gi).filter(guestComplete).length;
  // Which card owns a given error key — used to open it before scrolling there.
  const guestOfKey = (key: string) => {
    const m = /^x(\d+)-/.exec(key);
    return m ? Number(m[1]) + 1 : 0;
  };
  // Collapse the finished card and move to the next one still missing details.
  // Pressing Done on a guest that still has gaps marks those fields instead of
  // doing nothing visible — the card stays open so they can be seen and fixed.
  const goToNextIncomplete = (from: number) => {
    if (!guestComplete(from)) { setShowErrors(true); return; }
    for (let gi = from + 1; gi < totalGuests; gi++) if (!guestComplete(gi)) return setOpenGuest(gi);
    for (let gi = 0; gi < from; gi++) if (!guestComplete(gi)) return setOpenGuest(gi);
    setOpenGuest(null);
  };

  // Run `action` only when the step is valid; otherwise surface the markings.
  const tryAdvance = (action: () => void) => {
    if (fieldErrors.size > 0) {
      setShowErrors(true);
      toast.error(`Please complete the ${fieldErrors.size} highlighted field${fieldErrors.size > 1 ? "s" : ""} before continuing.`);
      // Jump to the first missing field (Set keeps form order).
      const firstKey = fieldErrors.values().next().value;
      // A collapsed card's inputs are NOT in the DOM, so the scroll/focus below
      // would silently do nothing. Open the offending guest first — the 60ms
      // timeout is what gives React the tick it needs to mount the fields.
      if (step === 0 && firstKey) setOpenGuest(guestOfKey(firstKey));
      setTimeout(() => {
        const el = document.getElementById(`f-${firstKey}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el && "focus" in el) (el as HTMLElement).focus({ preventScroll: true });
      }, 60);
      return;
    }
    setShowErrors(false);
    action();
  };

  // Style/marking helpers driven by a failed Continue attempt.
  const fieldStyle = (key: string): React.CSSProperties =>
    showErrors && fieldErrors.has(key) ? { ...inputStyle, borderColor: "#ef4444" } : inputStyle;
  // The old Req / AgeNote / ageStyle helpers lived here. They are gone: the age
  // stepper cannot produce an out-of-range value, and per-field messages now
  // come from the popup's numbered to-do plus the label under each input.

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const bookingId = generateBookingId();
    const ci = to24h(checkInTime);
    const co = to24h(checkOutTime);
    const now = new Date();
    const checkInDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Multi-night overnight stays check out `nights` days later. For a same-day
    // 10h session that ends earlier than it starts, roll to the next day.
    const checkOutDate = stayType === "10"
      ? (co <= ci ? addDays(checkInDate, 1) : checkInDate)
      : addDaysISO(checkInDate, nights);

    const payload = {
      booking_id: bookingId,
      user_id: session?.user?.id ?? null, // tie the booking to the signed-in account
      haven_id: roomId, // enables the blocked-dates check on the server
      room_name: room.name,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      check_in_time: ci,
      check_out_time: co,
      adults,
      children,
      infants,
      guest_first_name: info.firstName,
      guest_last_name: info.lastName,
      guest_email: info.email,
      guest_phone: info.phone,
      guest_age: parseInt(info.age, 10) || null,
      guest_gender: info.gender,
      guest_senior_pwd: info.senior,
      guest_birthdate: info.birthday || null,
      facebook_link: info.facebook || null,
      valid_ids: info.validIds.map((d) => d.data),       // base64[]; each uploaded to Cloudinary when configured
      additional_guests: extraGuests.map((g) => ({       // non-main guests: name, age, gender, ID(s)
        firstName: g.firstName,
        lastName: g.lastName,
        age: g.age,
        gender: g.gender,
        seniorPwd: g.senior,
        birthdate: g.birthday || null,
        validIds: g.validIds.map((d) => d.data),
      })),
      payment_proof: payment.proofData || undefined,     // base64; uploaded to Cloudinary when configured
      payment_method: payment.method,
      payment_reference: payment.reference || undefined, // guest-entered reference number
      room_rate: basePrice,
      add_ons_total: 0,
      total_amount: total,
      down_payment: downPayment,
      add_ons: [],
      discount_id: appliedDiscount?.id || undefined,
      discount_code: appliedDiscount?.code || undefined,
      discount_amount: discountAmount || undefined,
      // Statutory 20% (RA 9994 / RA 10754). Recorded separately from promo codes
      // so it can be audited and reconciled at check-in.
      senior_discount: seniorDiscount || undefined,
      // Only when an automatic promotion actually reduced this booking — the
      // server records it against the account so it can't be used a second time.
      promotion_id: autoDiscount > 0 ? autoPromo?.id : undefined,
    };

    const body = JSON.stringify(payload);

    // Vercel rejects serverless request bodies over 4.5 MB before our code ever
    // runs, and its 413 is not JSON. Catch it here so the guest gets an
    // actionable message instead of a failure they can't diagnose. Photos are
    // already downscaled on upload, so this should be unreachable in practice.
    if (body.length > 4_000_000) {
      const photos = payload.valid_ids.length + payload.additional_guests.reduce((n, g) => n + g.validIds.length, 0) + (payload.payment_proof ? 1 : 0);
      toast.error(`Your ${photos} uploaded photos are too large to send together. Please remove a few, or re-upload smaller/clearer shots.`);
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      // Error responses from the platform (413 too large, 502/504 timeout) are
      // HTML or plain text — parsing them as JSON used to throw and land in the
      // catch below, which wrongly blamed the guest's internet connection.
      const raw = await res.text();
      let json: { success?: boolean; error?: string; data?: { booking_id?: string } } = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON error page */ }

      if (!res.ok || json.success === false) {
        const message =
          json.error ||
          (res.status === 413
            ? "Your uploaded photos are too large. Please remove a few or upload smaller ones."
            : res.status === 504 || res.status === 502
            ? "The booking took too long to process. Please check My Bookings before trying again — it may have gone through."
            : res.status === 401 || res.status === 403
            ? "Your session expired. Please sign in again and resubmit."
            : `Could not complete your booking (error ${res.status}). Please try again.`);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      const confirmedId = json.data?.booking_id || bookingId;
      addMyBookingId(confirmedId);
      toast.success("Booking request submitted! The host will review your documents.");
      router.push(`/my-bookings/confirmed?id=${confirmedId}`);
    } catch {
      // Only a genuinely failed request (dropped connection, DNS, offline)
      // reaches here now.
      toast.error(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You appear to be offline. Reconnect and try again — your details are still filled in."
          : "Couldn't reach the server. Please try again in a moment — your details are still filled in.",
      );
      setSubmitting(false);
    }
  };

  const PriceRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "var(--ink-2)", fontSize: 13 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  // Gate: until the session is confirmed (and the guest is signed in), don't
  // render the form — unauthenticated users are redirected to sign in/up above.
  if (authStatus !== "authenticated") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>
        {authStatus === "loading" ? "Checking your session…" : "Please sign in to continue — redirecting…"}
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ backgroundColor: "#F6EFE2", color: "#1F160E", minHeight: "100vh", fontFamily: "'Geist', system-ui, -apple-system, sans-serif" }}>
      {/* Blocks the page while the request is in flight. The submit uploads
          every ID photo, so it can run for many seconds — a dimmed button
          alone let the guest scroll away or close the tab mid-upload. Stays up
          through the redirect on success: `submitting` is deliberately never
          reset there, so the overlay hands off to the confirmation page rather
          than flashing the form back for a frame. */}
      {submitting && (
        <DluxLoaderOverlay
          label={"Sending\nyour request"}
          note="Uploading your documents. This can take a moment on a slow connection — please keep this page open."
        />
      )}

      {/* HEADER — checkout step bar */}
      <header className="co-deskhdr" style={{ position: "sticky", top: 0, zIndex: 50, background: "#FAF7F1", borderBottom: "1px solid #ECE5D4", fontFamily: "'Geist', system-ui, -apple-system, sans-serif", color: "#1F160E" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
          .co-exit { color: #1F160E; text-decoration: none; border-bottom: 1px solid #1F160E; padding-bottom: 1px; }
          @media (max-width: 860px) { .co-steps { display: none !important; } }
          @keyframes co-fade { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes co-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(212,169,106,.45); } 50% { box-shadow: 0 0 0 6px rgba(212,169,106,0); } }
          .co-fade { animation: co-fade .28s cubic-bezier(.2,.7,.2,1); }
          .co-pay-now { animation: co-pulse 2.6s ease-in-out infinite; }
          .co-mobile-steps, .co-mobhdr { display: none; }
          /* Guest popup: centered dialog on desktop, bottom sheet on phones. */
          .gc-overlay { align-items: center; padding: 20px; animation: gc-fade .18s ease; }
          .gc-panel { max-width: 560px; max-height: 90vh; border-radius: 20px; animation: gc-pop .22s cubic-bezier(.2,.7,.2,1); }
          .gc-grab { display: none; }
          @media (max-width: 860px) { .gc-grab { display: block !important; } }
          @keyframes gc-fade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes gc-pop { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
          @keyframes gc-slide { from { transform: translateY(100%); } to { transform: none; } }
          @media (max-width: 860px) {
            .gc-overlay { align-items: flex-end; padding: 0; }
            .gc-panel { max-width: 100%; max-height: 92vh; border-radius: 20px 20px 0 0; animation: gc-slide .26s cubic-bezier(.2,.7,.2,1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .gc-overlay, .gc-panel { animation: none !important; }
          }
          @media (max-width: 860px) {
            .co-wrap { padding: 14px 16px 48px !important; }
            .co-grid { grid-template-columns: 1fr !important; gap: 22px !important; }
            .co-form-grid { grid-template-columns: 1fr !important; }
            .co-aside-inner { position: static !important; top: auto !important; }
            .co-mobhdr { display: flex !important; }
            /* Below 860px the sidebar's two cards separate: display:contents
               drops the aside wrappers so both become grid items in their own
               right. The summary card (thumbnail, dates, price, promo) leads in
               place of the old cut-down strip, while the pay-now hero keeps its
               original spot at the very bottom, next to the action it prompts. */
            /* display:contents drops the aside wrappers so the summary card is a
               grid item in its own right. It keeps DOM order, so it sits below
               the form — the sticky bar carries the amount up top instead. */
            .co-aside, .co-aside-inner { display: contents !important; }
            /* The sticky bar takes over from the pay-now hero and the inline
               Back/Continue row; the settle-up figures move into the summary. */
            .co-pay-now, .co-nav { display: none !important; }
            .co-sum-settle { display: flex !important; }
            .co-stickybar { display: flex !important; }
            /* Clear the fixed bar so it never covers the last of the content. */
            .co-wrap { padding-bottom: 128px !important; }
            .co-deskhdr { display: none !important; }
            .co-back-chip { display: none !important; }
            .co-h1 { font-size: 30px !important; }
            .co-qr { width: min(260px, 74vw) !important; }
          }
          @media (max-width: 420px) {
            .co-pay-amt { font-size: 42px !important; }
          }
        `}</style>
        <div style={{ maxWidth: 1320, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

          {/* wordmark */}
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", minWidth: 0, textDecoration: "none", color: "inherit" }}>
            <DluxMark layout="compact" accent="clay" width={200} ambient={false} />
          </Link>

          {/* step indicator */}
          <div className="co-steps" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
            {STEPS.map((s, i) => {
              const done = i < step, current = i === step;
              const circle = done
                ? { background: "#1F160E", color: "#faf7f1", border: "none" as const }
                : current
                ? { background: "#B07848", color: "#FAF7F1", border: "none" as const }
                : { background: "transparent", color: "#A89B86", border: "1.5px solid #DDD2BF" };
              const labelColor = done ? "#1F160E" : current ? "#1F160E" : "#A89B86";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* connector fills in once the previous step is done */}
                  {i > 0 && <div style={{ width: 30, height: 2, borderRadius: 2, background: i <= step ? "#C9B79A" : "#E6DCCB" }} />}
                  <button onClick={() => done && setStep(i)} style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: 0, padding: 0, font: "inherit", color: labelColor, fontWeight: current ? 700 : done ? 500 : 400, cursor: done ? "pointer" : "default" }}>
                    <span style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", ...circle }}>
                      {done ? <IcoCheckLg /> : i + 1}
                    </span>
                    <span>{s}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* secure + exit */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span>Secure checkout</span>
            </div>
            <Link href={`/rooms/${room.id}`} className="co-exit">Exit</Link>
          </div>
        </div>
      </header>

      {/* MOBILE header — Guest Header 3b: centered step + progress bars */}
      <div className="co-mobhdr" style={{ position: "sticky", top: 0, zIndex: 50, background: "#FAF7F1", borderBottom: "1px solid #ECE5D4", padding: "14px 20px 16px", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <button onClick={() => (step === 0 ? router.back() : setStep(step - 1))} aria-label="Back" style={{ position: "absolute", left: 14, top: 12, width: 40, height: 40, borderRadius: "50%", border: "1px solid #E1D8C6", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: "#1F160E" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10.5, letterSpacing: 2, color: "#B07848", marginBottom: 2 }}>STEP {step + 1} OF {STEPS.length}</div>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: "#1F160E" }}>{STEPS[step]}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{ width: 34, height: 5, borderRadius: 3, background: i < step ? "#1F160E" : i === step ? "#B07848" : "#E6DCCB" }} />
          ))}
        </div>
      </div>

      <div className="co-wrap" style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 60px" }}>
        {/* Back */}
        <style>{`
          .back-btn {
            display: inline-flex;
            gap: 8px;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: #1F160E;
            text-decoration: none;
            margin-bottom: 18px;
            padding: 9px 16px;
            border-radius: 999px;
            background: #FFFCF4;
            border: 1.5px solid #D4BE9A;
            box-shadow: 0 1px 3px rgba(31,22,14,0.05);
            transition: background 0.22s ease, border-color 0.22s ease,
              color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
          }
          .back-btn:hover {
            background: #F6EFE2;
            border-color: #8C5A2E;
            color: #8C5A2E;
            box-shadow: 0 3px 10px rgba(31,22,14,0.08);
            transform: translateX(-3px);
          }
          .back-btn .back-btn__chev {
            display: inline-flex;
            transition: transform 0.22s ease;
          }
          .back-btn:hover .back-btn__chev {
            transform: translateX(-3px);
          }
          @media (prefers-reduced-motion: reduce) {
            .back-btn, .back-btn .back-btn__chev { transition: none; }
            .back-btn:hover { transform: none; }
            .back-btn:hover .back-btn__chev { transform: none; }
          }
        `}</style>
        <Link href={`/rooms/${room.id}`} className="back-btn co-back-chip">
          <span className="back-btn__chev"><IcoChevLeft /></span> Back to {room.name.split(/\s*[—–-]\s*/)[0]}
        </Link>

        <h1 className="co-h1" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 46, fontWeight: 400, letterSpacing: "-.025em", margin: "0 0 4px" }}>Confirm and pay</h1>
        <p style={{ margin: "0 0 26px", fontSize: 14, color: "#8B7458" }}>{stepCaption}</p>

        {/* minWidth:0 on BOTH grid items is load-bearing, not tidying. Grid items
            default to min-width:auto, so a track can never be narrower than its
            content's min-content width — `1fr` becomes a maximum, not a floor.
            Long unbreakable content (an uploaded ID's filename, a payment
            account number) then widens the column past the viewport and scrolls
            the whole page sideways on mobile. Zeroing the minimum makes the
            track authoritative so the ellipsis/wrapping inside can do its job. */}
        <div className="co-grid" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 44, alignItems: "start" }}>
          {/* STEP CONTENT */}
          <div style={{ minWidth: 0 }}>
            {/* Mobile-only step dots (the header step bar hides below 860px) */}
            <div className="co-mobile-steps" style={{ alignItems: "center", gap: 5, marginBottom: 22 }}>
              {STEPS.map((s, i) => {
                const done = i < step, current = i === step;
                const shortLabel = ["Details", "Payment", "Confirm", "Review"][i];
                return (
                  <div key={i} style={{ display: "contents" }}>
                    {i > 0 && <div style={{ height: 1.5, flex: "0 0 12px", background: "#D4BE9A", marginBottom: 18 }} />}
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#1F160E" : current ? "#B07848" : "#EFE4CE", color: done || current ? "#fff" : "#8B7458", display: "grid", placeItems: "center", margin: "0 auto 6px", fontSize: 12, fontWeight: current ? 700 : 600 }}>
                        {done ? <IcoCheck /> : i + 1}
                      </div>
                      <div style={{ fontSize: 10, color: current ? "#1F160E" : "#8B7458", fontWeight: current ? 600 : 400 }}>{shortLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* MOBILE compact stay card */}
            {/* The cut-down mobile stay strip used to sit here. It duplicated the
                summary card's header while hiding the price, so below 860px the
                real summary card is ordered above this column instead. */}

            {/* reserve-now reminder banner — sets the pay-to-reserve expectation early */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 16, background: "#2C2218", color: "#F6EFE2", marginBottom: 26 }}>
              <div style={{ width: 38, height: 38, flex: "none", borderRadius: 10, background: "#3a2e20", display: "grid", placeItems: "center", color: "#D4A96A" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Reserve today for just <span style={{ color: "#FBE9C8" }}>{peso(downPayment)}</span> — 50% down payment.</div>
                <div style={{ fontSize: 12.5, color: "#B8A68E", marginTop: 2 }}>The {peso(total - downPayment)} balance &amp; {peso(SECURITY_DEPOSIT)} refundable deposit are settled at check-in.</div>
              </div>
            </div>
            {/* Step 0: Guest info */}
            {step === 0 && (
              <div className="fade-in">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-.02em" }}>Who is staying?</h2>
                <p style={{ color: G.muted, fontSize: 15, margin: "0 0 14px" }}>
                  Details for each guest, exactly as printed on the ID they will show at check-in.
                </p>
                {/* Progress in guests, not a cryptic "1/2" tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 14px" }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: "#EFE4CE", overflow: "hidden" }}>
                    <div style={{ width: `${totalGuests ? Math.round((addedCount / totalGuests) * 100) : 0}%`, height: "100%", background: addedCount === totalGuests ? G.green : G.accent, borderRadius: 4, transition: "width .25s ease" }} />
                  </div>
                  <span style={{ flex: "none", fontSize: 12.5, fontWeight: 600, color: addedCount === totalGuests ? G.green : G.muted }}>{addedCount} of {totalGuests} done</span>
                </div>

                {/* Name what is wrong and where, rather than leaving the guest to
                    hunt for a red outline somewhere below. */}
                {showErrors && firstIncomplete != null && (
                  <div style={{ display: "flex", gap: 12, padding: "16px 18px", borderRadius: 16, background: G.errBg, border: `1px solid ${G.errLine}`, marginBottom: 18 }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={G.err} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#7E3320", marginBottom: 4 }}>Guest {firstIncomplete + 1} is not finished yet</div>
                      <div style={{ fontSize: 13.5, color: "#7E3320", lineHeight: 1.6 }}>
                        {sentence(listPhrase(guestMissing(firstIncomplete)))} {guestMissing(firstIncomplete).length > 1 ? "are" : "is"} still missing. Tap <strong>Fill in</strong> to add {guestMissing(firstIncomplete).length > 1 ? "them" : "it"}.
                      </div>
                    </div>
                  </div>
                )}

                <GuestCard
                  index={1}
                  title={`Guest 1 of ${totalGuests}`}
                  subtitle="This is you, the person booking"
                  rowTitle={guestComplete(0) ? (`${info.firstName} ${info.lastName}`.trim() || guestLabel(0)) : guestLabel(0)}
                  rowNote={guestRowNote(0)}
                  badge={info.senior ? "Senior/PWD" : undefined}
                  complete={guestComplete(0)}
                  hasErrors={showErrors && guestErrorKeys(0).length > 0}
                  open={openGuestIdx === 0}
                  onToggle={() => setOpenGuest(openGuestIdx === 0 ? null : 0)}
                  onDone={() => goToNextIncomplete(0)}
                  filled={guestFilled(0)}
                  total={guestTotal(0)}
                  missing={guestMissing(0)}
                >
                  {showErrors && <MissingList items={guestMissing(0)} />}

                  <div>
                      <AskLabel label="Full name" required hint="Copy it letter for letter from the ID you will show at check-in." />
                      <div style={{ display: "flex", gap: 12 }}>
                        <input id="f-firstName" style={{ ...askStyle(showErrors && fieldErrors.has("firstName")), flex: 1, minWidth: 0 }} value={info.firstName} onChange={(e) => setInfo((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="First name" />
                        <input id="f-lastName" style={{ ...askStyle(showErrors && fieldErrors.has("lastName")), flex: 1, minWidth: 0 }} value={info.lastName} onChange={(e) => setInfo((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Last name" />
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12.5 }}>
                        <span style={{ flex: 1, color: showErrors && fieldErrors.has("firstName") ? G.err : G.muted, fontWeight: showErrors && fieldErrors.has("firstName") ? 600 : 400 }}>{showErrors && fieldErrors.has("firstName") ? "Please add your first name" : "First name"}</span>
                        <span style={{ flex: 1, color: showErrors && fieldErrors.has("lastName") ? G.err : G.muted, fontWeight: showErrors && fieldErrors.has("lastName") ? 600 : 400 }}>{showErrors && fieldErrors.has("lastName") ? "Please add your last name" : "Last name"}</span>
                      </div>
                    </div>

                    <div>
                      <AskLabel label="Age" required />
                      <AgeStepper id="f-age" value={info.age} min={18} max={120} invalid={showErrors && fieldErrors.has("age")}
                        note="You must be 18 or older to book."
                        onChange={(v) => setInfo((prev) => ({ ...prev, age: v }))} />
                    </div>

                    <div>
                      <AskLabel label="Gender" />
                      <GenderChips name="Your gender" value={info.gender} onChange={(v) => setInfo((prev) => ({ ...prev, gender: v }))} />
                    </div>

                    <SeniorPwdField
                      on={info.senior}
                      birthday={info.birthday}
                      main
                      idPrefix=""
                      invalid={showErrors && fieldErrors.has("birthday")}
                      onToggle={(v) => setInfo((prev) => ({ ...prev, senior: v }))}
                      onBirthday={(v) => setInfo((prev) => ({ ...prev, birthday: v }))}
                    />

                    <div>
                      <AskLabel label="How can we reach you?" required hint="Your booking confirmation and check-in code are sent here." />
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={askRow(showErrors && fieldErrors.has("email"))}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={G.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
                          <input id="f-email" type="email" placeholder="Email address" style={bareInput} value={info.email} onChange={(e) => setInfo((prev) => ({ ...prev, email: e.target.value }))} />
                        </div>
                        <div style={askRow(showErrors && fieldErrors.has("phone"))}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={G.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                          <input id="f-phone" type="tel" inputMode="numeric" maxLength={11} placeholder="Phone number (11 digits)" style={bareInput} value={info.phone} onChange={(e) => setInfo((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))} />
                        </div>
                        <div style={{ ...askRow(false), border: `1.5px dashed ${G.line2}`, background: G.soft }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={G.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                          <input placeholder="Facebook name or link — optional" style={bareInput} value={info.facebook} onChange={(e) => setInfo((prev) => ({ ...prev, facebook: e.target.value }))} />
                        </div>
                      </div>
                      {showErrors && (fieldErrors.has("email") || fieldErrors.has("phone")) && (
                        <div style={{ fontSize: 12.5, color: G.err, fontWeight: 600, marginTop: 7 }}>
                          {fieldErrors.has("email") ? "Please add a valid email address. " : ""}{fieldErrors.has("phone") ? "Please add an 11-digit phone number." : ""}
                        </div>
                      )}
                    </div>

                  <GuestIdUpload
                    id="f-validId"
                    values={info.validIds}
                    invalid={showErrors && fieldErrors.has("validId")}
                    title="Photo of your valid ID"
                    requiredMsg="Please add a photo of your ID."
                    onAdd={(name, data) => setInfo((prev) => ({ ...prev, validIds: [...prev.validIds, { name, data }] }))}
                    onRemove={(idx) => setInfo((prev) => ({ ...prev, validIds: prev.validIds.filter((_, j) => j !== idx) }))}
                  />
                </GuestCard>

                {/* Additional guests — name, age, gender + valid ID only */}
                {extraGuests.map((g, i) => {
                  const t = guestType(i);
                  const typeLabel = t === "adult" ? "Adult (18+)" : t === "child" ? "Young Adult (7–17)" : "Child (7 & under)";
                  const ageMin = t === "adult" ? 18 : t === "child" ? 7 : 0;
                  const ageMax = t === "adult" ? 120 : t === "child" ? 17 : 7;
                  const ageNote = t === "adult" ? "Adults are 18 or older." : t === "child" ? "Young adults are 7 to 17." : "Children are 7 or under.";
                  const gi = i + 1; // card index — 0 is the main guest
                  const filledName = `${g.firstName} ${g.lastName}`.trim();
                  const bad = (k: string) => showErrors && fieldErrors.has(`x${i}-${k}`);
                  return (
                  <GuestCard
                    key={i}
                    index={i + 2}
                    title={`Guest ${i + 2} of ${totalGuests}`}
                    subtitle={typeLabel}
                    rowTitle={guestComplete(gi) && filledName ? filledName : guestLabel(gi)}
                    rowNote={guestRowNote(gi)}
                    badge={g.senior ? "Senior/PWD" : undefined}
                    complete={guestComplete(gi)}
                    hasErrors={showErrors && guestErrorKeys(gi).length > 0}
                    open={openGuestIdx === gi}
                    onToggle={() => setOpenGuest(openGuestIdx === gi ? null : gi)}
                    onDone={() => goToNextIncomplete(gi)}
                    filled={guestFilled(gi)}
                    total={guestTotal(gi)}
                    missing={guestMissing(gi)}
                  >
                    {showErrors && <MissingList items={guestMissing(gi)} />}

                    <div>
                        <AskLabel label="Full name" required hint="Copy it letter for letter from the ID they will show at check-in." />
                        <div style={{ display: "flex", gap: 12 }}>
                          <input id={`f-x${i}-firstName`} style={{ ...askStyle(bad("firstName")), flex: 1, minWidth: 0 }} value={g.firstName} onChange={(e) => updateGuest(i, { firstName: e.target.value })} placeholder="First name" />
                          <input id={`f-x${i}-lastName`} style={{ ...askStyle(bad("lastName")), flex: 1, minWidth: 0 }} value={g.lastName} onChange={(e) => updateGuest(i, { lastName: e.target.value })} placeholder="Last name" />
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12.5 }}>
                          <span style={{ flex: 1, color: bad("firstName") ? G.err : G.muted, fontWeight: bad("firstName") ? 600 : 400 }}>{bad("firstName") ? "Please add their first name" : "First name"}</span>
                          <span style={{ flex: 1, color: bad("lastName") ? G.err : G.muted, fontWeight: bad("lastName") ? 600 : 400 }}>{bad("lastName") ? "Please add their last name" : "Last name"}</span>
                        </div>
                      </div>

                      <div>
                        <AskLabel label="Age" required />
                        <AgeStepper id={`f-x${i}-age`} value={g.age} min={ageMin} max={ageMax} invalid={bad("age")}
                          note={ageNote} onChange={(v) => updateGuest(i, { age: v })} />
                      </div>

                      <div>
                        <AskLabel label="Gender" />
                        <GenderChips name={`Guest ${i + 2} gender`} value={g.gender} onChange={(v) => updateGuest(i, { gender: v })} />
                      </div>

                        <SeniorPwdField
                          on={g.senior}
                          birthday={g.birthday}
                          main={false}
                          idPrefix={`x${i}-`}
                          invalid={bad("birthday")}
                          onToggle={(v) => updateGuest(i, { senior: v })}
                          onBirthday={(v) => updateGuest(i, { birthday: v })}
                        />

                    <GuestIdUpload
                      id={`f-x${i}-validId`}
                      values={g.validIds}
                      invalid={bad("validId")}
                      title="Photo of their valid ID"
                      requiredMsg="Please add a photo of this guest's ID."
                      onAdd={(name, data) => updateGuest(i, { validIds: [...g.validIds, { name, data }] })}
                      onRemove={(index) => updateGuest(i, { validIds: g.validIds.filter((_, j) => j !== index) })}
                    />
                  </GuestCard>
                  );
                })}

                {/* Says why the IDs are being asked for, right where they're asked. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, color: G.muted }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Secure checkout · IDs are used only for check-in verification
                </div>
              </div>
            )}

            {/* Step 1: Payment method */}
            {/* Step 1: choose a payment method + show its QR / account details */}
            {step === 1 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 18px", letterSpacing: "-.02em" }}>How would you like to pay?</h2>

                {methods.length === 0 ? (
                  <div style={{ padding: 20, borderRadius: 16, background: "#EFE4CE", fontSize: 13.5, color: "#4A3A2A", lineHeight: 1.6 }}>
                    No payment methods are available right now. Please contact us to arrange payment for your booking.
                  </div>
                ) : (
                  <>
                    {/* method options */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
                      {methods.map((m) => {
                        const active = payment.methodId === m.id;
                        const isG = m.payment_method === "gcash";
                        const badgeBg = isG ? "#0A6FF1" : "#9E1B32";
                        const badgeTxt = isG ? "G" : (m.provider || m.payment_name).slice(0, 3).toUpperCase();
                        // Real brand marks when we have one; otherwise fall back to the
                        // coloured initial badge so unknown providers still render.
                        const logo = methodLogo(m);
                        return (
                          <button key={m.id} onClick={() => setPayment({ ...payment, methodId: m.id, method: m.payment_method })}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", borderRadius: 16, background: active ? "rgba(176,120,72,.06)" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                            {logo ? (
                              <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "#fff", border: "1px solid #E6D8BC", display: "grid", placeItems: "center", padding: 6 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={logo} alt={m.payment_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                              </div>
                            ) : (
                              <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: badgeBg, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: isG ? 17 : 12 }}>{badgeTxt}</div>
                            )}
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: "#1F160E" }}>{m.payment_name}</div>
                              <div style={{ fontSize: 12.5, color: "#8B7458", marginTop: 1 }}>{m.account_details}</div>
                            </div>
                            <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>
                              {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedMethod && (
                      <div style={{ border: "1px solid #E0CEB2", borderRadius: 18, background: "#FFFCF4", overflow: "hidden" }}>
                        <div style={{ padding: "22px 22px 24px", textAlign: "center", background: "#EFE4CE" }}>
                          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", color: "#8B7458", marginBottom: 16 }}>Scan to pay {peso(downPayment)} · {selectedMethod.payment_name}</div>
                          {/* Width-constrained, height-free: hosts upload tall poster-style
                              QR graphics, and boxing those into a fixed square shrank the
                              scannable code to a fraction of the frame. Letting the height
                              follow the image's own ratio fills the width instead. */}
                          <div className="co-qr" style={{ position: "relative", width: 280, maxWidth: "100%", margin: "0 auto" }}>
                            {selectedMethod.payment_qr_link ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={selectedMethod.payment_qr_link} alt={`${selectedMethod.payment_name} QR`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 14, background: "#FFFCF4", border: "1px solid #E6D8BC" }} />
                            ) : (
                              <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 14, background: "#FFFCF4", display: "grid", placeItems: "center", color: "#A88E63", fontSize: 12, padding: 20, lineHeight: 1.5, textAlign: "center", border: "1px solid #E6D8BC" }}>QR code appears here once the host uploads it — meanwhile, use the number below.</div>
                            )}
                            <span style={{ position: "absolute", top: -3, left: -3, width: 26, height: 26, borderTop: "3px solid #B07848", borderLeft: "3px solid #B07848", borderRadius: "9px 0 0 0" }} />
                            <span style={{ position: "absolute", top: -3, right: -3, width: 26, height: 26, borderTop: "3px solid #B07848", borderRight: "3px solid #B07848", borderRadius: "0 9px 0 0" }} />
                            <span style={{ position: "absolute", bottom: -3, left: -3, width: 26, height: 26, borderBottom: "3px solid #B07848", borderLeft: "3px solid #B07848", borderRadius: "0 0 0 9px" }} />
                            <span style={{ position: "absolute", bottom: -3, right: -3, width: 26, height: 26, borderBottom: "3px solid #B07848", borderRight: "3px solid #B07848", borderRadius: "0 0 9px 0" }} />
                          </div>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>{selectedMethod.payment_name} account</div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#1F160E", fontFamily: "'Geist Mono', monospace", marginTop: 3 }}>{selectedMethod.account_details}</div>
                            </div>
                            <button onClick={copyAccount} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: "8px 16px", cursor: "pointer", flex: "none", border: "none", background: copied ? "#DCFCE7" : "#2C2218", color: copied ? "#15803D" : "#F6EFE2" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> {copied ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: "1px solid #EFE4CE" }}>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Exact amount to send</div>
                              <div style={{ fontSize: 20, fontWeight: 600, color: "#8C5A2E", fontFamily: "'Fraunces', Georgia, serif", marginTop: 2 }}>{peso(downPayment)}</div>
                            </div>
                            <span style={{ fontSize: 11.5, color: "#8B7458", maxWidth: 150, textAlign: "right", lineHeight: 1.4 }}>Send this exact amount to reserve instantly.</span>
                          </div>
                        </div>
                        <div style={{ padding: "16px 22px 18px", background: "#FAF7F1", borderTop: "1px solid #EFE4CE", display: "flex", gap: 6 }}>
                          {[["1", `Open ${selectedMethod.payment_name}`], ["2", `Send ${peso(downPayment)}`], ["3", "Screenshot the receipt"]].map(([n, t]) => (
                            <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textAlign: "center" }}>
                              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#2C2218", color: "#F6EFE2", display: "grid", placeItems: "center", fontSize: 11, fontFamily: "'Geist Mono', monospace" }}>{n}</span>
                              <span style={{ fontSize: 11, color: "#4A3A2A", lineHeight: 1.3 }}>{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p style={{ textAlign: "center", fontSize: 12.5, color: "#8B7458", margin: "14px 4px 0", lineHeight: 1.5 }}>After paying, tap <strong style={{ color: "#1F160E" }}>Continue</strong> to enter your reference number and upload the receipt.</p>
                    {showErrors && fieldErrors.has("method") && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>Please choose a payment method.</div>}
                  </>
                )}
              </div>
            )}

            {/* Step 2: confirm payment — reference number + receipt upload */}
            {step === 2 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-.02em" }}>Confirm your payment</h2>
                <p style={{ fontSize: 14, color: "#4A3A2A", margin: "0 0 22px", lineHeight: 1.55 }}>
                  Add your reference number and receipt so we can verify the <strong>{peso(downPayment)}</strong> you sent{selectedMethod ? <> via <strong>{selectedMethod.payment_name}</strong></> : null} and confirm your booking.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", marginBottom: 8 }}>Payment reference number *</div>
                  <input id="f-reference" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="e.g. 0123 4567 8901" style={{ ...fieldStyle("reference"), fontFamily: "'Geist Mono', monospace", fontSize: 15, letterSpacing: ".04em", padding: "13px 14px" }} />
                  {showErrors && fieldErrors.has("reference")
                    ? <div style={{ fontSize: 11, color: "#ef4444", marginTop: 7 }}>Enter the reference number from your payment.</div>
                    : <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#8B7458", marginTop: 7 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg> Found in your {selectedMethod?.payment_name || "payment"} receipt, labelled &ldquo;Ref No.&rdquo; or &ldquo;Reference&rdquo;.</div>}
                </div>

                <UploadField label="Payment receipt *" sub="Screenshot of your GCash / bank confirmation" value={payment.proofName} onChange={(name, data) => setPayment({ ...payment, proofName: name, proofData: data })} invalid={showErrors && fieldErrors.has("receipt")} id="f-receipt" />
                {payment.proofData ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                    <ImageThumb src={payment.proofData} alt="Payment receipt preview" size={52} rounded={11} />
                    <span style={{ fontSize: 12.5, color: "#8B7458" }}>Tap the image to check your receipt is clear and correct.</span>
                  </div>
                ) : null}

                <div style={{ marginTop: 22, padding: "16px 18px", borderRadius: 14, border: "1px solid #E0CEB2", background: "#FAF7F1", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "#8C5A2E", flex: "none", marginTop: 1 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                  <div style={{ fontSize: 12.5, color: "#4A3A2A", lineHeight: 1.55 }}><strong style={{ color: "#1F160E" }}>What happens next —</strong> once you submit, our host verifies your payment (usually within an hour) and emails your booking confirmation. Your dates are held in the meantime.</div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 18px", letterSpacing: "-.02em" }}>Double-check everything</h2>
                <ReviewBlock title="Guest" onEdit={() => setStep(0)}>
                  <div style={{ fontSize: 14 }}>{info.firstName} {info.lastName}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{info.age} years old · {info.gender}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{info.email} · {info.phone}</div>
                  {info.facebook && <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>Facebook: {info.facebook}</div>}
                </ReviewBlock>
                <ReviewBlock title="Stay" onEdit={() => router.back()}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{room.name}</div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>{formatDateLong(date)} · {checkInTime} → {checkOutTime}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{stayType === "10" ? "10-hour stay" : `Overnight · ${nights} night${nights > 1 ? "s" : ""}`} · {adults + children + infants} guest{adults + children + infants > 1 ? "s" : ""}</div>
                </ReviewBlock>
                <ReviewBlock title="Payment" onEdit={() => setStep(1)}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedMethod?.payment_name || payment.method || "—"} ·</span>
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600, color: "#8C5A2E" }}>{peso(downPayment)}</span>
                    <span style={{ fontSize: 13, color: "#8B7458" }}>due now · 50% down payment</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>Ref no. {payment.reference || "—"}{payment.proofName ? ` · receipt: ${payment.proofName}` : ""}</div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 2 }}>{peso(total - downPayment)} balance + {peso(SECURITY_DEPOSIT)} deposit at check-in</div>
                </ReviewBlock>
                <div style={{ marginTop: 20, padding: 20, background: "#EFE4CE", borderRadius: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>You&apos;re agreeing to:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#4A3A2A", lineHeight: 1.75 }}>
                    <li>Check-in at {checkInTime} and check-out by {checkOutTime}</li>
                    <li>House rules — strictly no smoking/vaping, no pets, no walk-ins</li>
                    <li>50% balance + {peso(SECURITY_DEPOSIT)} refundable security deposit due at check-in</li>
                    <li>No cancellations — one free date change if requested ≥7 days before check-in, new date within 1 month</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Nav buttons */}
            {/* flex-END, not flex-start: the Continue side is a column with the
                reason text stacked above the button, so aligning to the top left
                the two buttons on different lines. Aligning to the bottom puts
                them on a shared baseline whether or not the hint is showing. */}
            <div className="co-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, rowGap: 16, flexWrap: "wrap", marginTop: 34 }}>
              <button onClick={() => step === 0 ? router.back() : setStep(step - 1)}
                style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, background: "#FFFCF4", color: "#1F160E", border: "1px solid #D4BE9A", cursor: "pointer" }}>
                <IcoChevLeft /> {step === 0 ? "Back to stay" : "Back"}
              </button>
              {step < STEPS.length - 1 ? (
                // Continue reads as blocked and says WHO is blocking it, instead
                // of looking live and then rejecting the tap.
                <span style={{ flex: "none", display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 7, minWidth: 0 }}>
                  {step === 0 && firstIncomplete != null && (
                    <span style={{ fontSize: 13, color: G.muted, textAlign: "right" }}>Finish Guest {firstIncomplete + 1} to continue</span>
                  )}
                  <button onClick={() => tryAdvance(() => setStep(step + 1))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 30px", borderRadius: 999, fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
                      background: step === 0 && firstIncomplete != null ? G.offBg : G.accent,
                      color: step === 0 && firstIncomplete != null ? G.offInk : G.white }}>
                    Continue <IcoArrowRight />
                  </button>
                </span>
              ) : (
                <button onClick={() => tryAdvance(submit)} disabled={submitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "#FFFCF4", border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  <IcoCheckLg /> {submitting ? "Submitting…" : "Submit booking request"}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR — stay summary + pay-now hero */}
          <aside className="co-aside" style={{ minWidth: 0 }}>
            <div className="co-aside-inner" style={{ position: "sticky", top: 92, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* stay summary card */}
              <div className="co-sum" style={{ background: "#FFFCF4", borderRadius: 20, padding: 22, border: "1px solid #E0CEB2", boxShadow: "0 1px 2px rgba(31,22,14,.04), 0 2px 8px rgba(31,22,14,.04)" }}>
                <div style={{ display: "flex", gap: 14, paddingBottom: 18, borderBottom: "1px solid #E0CEB2" }}>
                  <div style={{ width: 74, height: 74, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#EFE4CE", position: "relative" }}>
                    <Image src={room.images[0]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#8C5A2E", textTransform: "uppercase", letterSpacing: ".12em" }}>Quezon City</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{room.name}</div>
                    <div style={{ fontSize: 12, color: "#8B7458", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}><IcoStar /> {room.rating} · {room.reviewCount} reviews</div>
                  </div>
                </div>
                <div style={{ padding: "16px 0", borderBottom: "1px solid #E0CEB2", fontSize: 13, display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Date</span><span style={{ fontWeight: 600 }}>{formatDate(date)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Window</span><span style={{ fontWeight: 600 }}>{checkInTime} → {checkOutTime}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Guests</span><span style={{ fontWeight: 600 }}>{adults + children + infants}</span></div>
                </div>
                <div style={{ padding: "16px 0 0", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>{stayType === "10" ? `10-hour stay · ${isWeekendRate ? "Weekend/Holiday" : "Weekday"}` : `Overnight · ${nights} night${nights > 1 ? "s" : ""}${bundleLabel ? ` · ${bundleLabel}` : ""}`}</span><span>{peso(basePrice)}</span></div>
                  {/* Bundle stays quote one flat nightly rate — show it, so the
                      extra-guest bump on the rate isn't invisible. */}
                  {bundleRate != null && <div style={{ fontSize: 11.5, color: "#9B8B73", marginTop: -4 }}>{peso(bundleRate)}/night{hasExtraPax ? ` · includes ${peso(BUNDLE_EXTRA_PAX_SURCHARGE)} extra-guest rate` : ""}</div>}
                  {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra pax · {extraPaxCount} × {peso(room.additionalPaxFee)}{nights > 1 ? ` × ${nights} nights` : ""}</span><span>{peso(paxFee)}</span></div>}
                  {seniorDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#1A7A4C" }}><span>Senior/PWD discount · {seniorCount} guest{seniorCount > 1 ? "s" : ""}</span><span>−{peso(seniorDiscount)}</span></div>}
                  {appliedDiscount && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#1A7A4C" }}><span>Promo · {appliedDiscount.code}</span><span>−{peso(appliedDiscount.discount_amount)}</span></div>
                  )}
                  {autoDiscount > 0 && autoPromo && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#1A7A4C" }}><span>{autoPromo.title}</span><span>−{peso(autoDiscount)}</span></div>
                  )}
                  {/* Mobile only: the pay-now hero carries these on desktop, but
                      below 860px it collapses to the sticky bar, so the settle-up
                      figures live here instead of disappearing. */}
                  <div className="co-sum-settle" style={{ display: "none", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Balance at check-in</span><span style={{ fontWeight: 600 }}>{peso(total - downPayment)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Refundable deposit</span><span style={{ fontWeight: 600 }}>{peso(SECURITY_DEPOSIT)}</span></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 6, paddingTop: 10, borderTop: "1px solid #E0CEB2" }}><span>Total stay value</span><span>{peso(total)}</span></div>
                </div>

                {/* PROMO CODE */}
                <div style={{ padding: "16px 0 0", borderTop: "1px solid #E0CEB2", marginTop: 16 }}>
                  {appliedDiscount ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#EAF7EF", border: "1px solid #BCE7CC", borderRadius: 12, padding: "10px 14px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>{appliedDiscount.code} applied</div>
                        <div style={{ fontSize: 11.5, color: "#3A6B4C" }}>{appliedDiscount.name}</div>
                      </div>
                      <button onClick={removePromo} style={{ fontSize: 12, fontWeight: 600, color: "#166534", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", flex: "none" }}>Remove</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={promoInput}
                          onChange={(e) => { setPromoInput(e.target.value); if (promoStatus === "error") { setPromoStatus("idle"); setPromoError(""); } }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
                          placeholder="Promo code"
                          style={{ ...inputStyle, flex: 1, padding: "10px 12px", fontSize: 13, textTransform: "uppercase", borderColor: promoStatus === "error" ? "#ef4444" : inputStyle.borderColor }}
                        />
                        <button
                          onClick={() => applyPromo()}
                          disabled={!promoInput.trim() || promoStatus === "checking"}
                          style={{ padding: "10px 16px", borderRadius: 12, background: "#1F160E", color: "#F6EFE2", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "none", opacity: (!promoInput.trim() || promoStatus === "checking") ? 0.5 : 1 }}
                        >
                          {promoStatus === "checking" ? "Checking…" : "Apply"}
                        </button>
                      </div>
                      {promoStatus === "error" && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 6 }}>{promoError}</div>}
                    </>
                  )}
                </div>
              </div>

              {/* PAY-NOW HERO */}
              <div className="co-pay-now" style={{ borderRadius: 20, overflow: "hidden", background: "#2C2218", color: "#F6EFE2", boxShadow: "0 10px 30px rgba(44,34,24,.22)" }}>
                <div style={{ padding: "22px 22px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4A96A", display: "inline-block" }} />
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#D4A96A" }}>Pay now to reserve</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                    <div className="co-pay-amt" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{peso(downPayment)}</div>
                    <div style={{ fontSize: 12, color: "#B8A68E", textAlign: "right", paddingBottom: 6 }}>50% down<br />payment</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#B8A68E", marginTop: 8, lineHeight: 1.5 }}>Secures your booking instantly. Send this amount first — the rest is paid when you arrive.</div>
                </div>
                <div style={{ background: "#37291c", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#E7DCC9" }}><span>Balance at check-in</span><span style={{ fontWeight: 600 }}>{peso(total - downPayment)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#E7DCC9" }}><span>Refundable deposit</span><span style={{ fontWeight: 600 }}>{peso(SECURITY_DEPOSIT)}</span></div>
                  <div style={{ fontSize: 11, color: "#9B8B73", marginTop: -4 }}>Deposit is a separate hold, returned after check-out.</div>
                </div>
              </div>

            </div>
          </aside>
        </div>
      </div>

      {/* MOBILE sticky action bar — below 860px this replaces both the sidebar's
          pay-now hero and the inline Back/Continue row, so the amount and the
          next action stay in reach without scrolling. Back is dropped here on
          purpose: the header already carries a ← for the same job. */}
      <div className="co-stickybar" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, background: "#2C2218", color: "#F6EFE2", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "none", alignItems: "center", gap: 14, boxShadow: "0 -10px 30px rgba(20,15,10,.28)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#D4A96A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Pay now to reserve · 50%
          </div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, lineHeight: 1.15, marginTop: 1 }}>{peso(downPayment)}</div>
        </div>
        {step < STEPS.length - 1 ? (
          <button onClick={() => tryAdvance(() => setStep(step + 1))}
            style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", borderRadius: 999, fontSize: 15, fontWeight: 600, border: "none", fontFamily: "inherit", cursor: "pointer",
              background: step === 0 && firstIncomplete != null ? "#4d4337" : G.accent,
              color: step === 0 && firstIncomplete != null ? "#A2937D" : G.white }}>
            Continue <IcoArrowRight />
          </button>
        ) : (
          <button onClick={() => tryAdvance(submit)} disabled={submitting}
            style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 999, fontSize: 14.5, fontWeight: 600, background: G.accent, color: G.white, border: "none", fontFamily: "inherit", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
            <IcoCheckLg /> {submitting ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<DluxLoaderPage label={"Opening\ncheckout"} />}>
      <CheckoutInner />
    </Suspense>
  );
}
