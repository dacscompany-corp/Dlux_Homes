"use client";

// Extend Booking — admin only (owner spec, 2026-10-31). Shown only inside the
// Owner/CSR booking management screens; the API behind it is requireAdmin().
//
//   <ExtendBookingModal>  pick a new checkout → the server checks the unit is
//                         free and suggests a price → admin sets the price and
//                         confirms.
//   <ExtensionHistory>    a booking's extensions, with "Mark paid" for an unpaid
//                         one (records only the extension amount — no deposit).
//   useBookingExtensions  every extension, for the Bookings table's buttons.
//
// Same palette and type as the Booking Board modal it sits beside.

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarPlus, Check, Clock, X, AlertTriangle } from "lucide-react";

export type BookingExtension = {
  id: string;
  booking_uuid: string;
  booking_ref: string;
  old_check_out_date: string;
  new_check_out_date: string;
  check_out_time: string | null;
  added_nights: number;
  suggested_amount: number;
  charge_amount: number;
  note: string | null;
  status: "unpaid" | "paid";
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  created_by_name: string;
  paid_by_name: string;
};

type Preview = {
  bookingId: string;
  oldCheckOutDate: string;
  newCheckOutDate: string;
  checkOutTime: string;
  addedNights: number;
  suggested: number;
  priced: boolean;
  nights: { date: string; rate: number; season: string | null; longTerm: boolean }[];
  paxFeeAdded: number;
  longTermNow: boolean;
  currentTotal: number;
  amountPaid: number;
  currentBalance: number;
};

const SERIF = "var(--font-fraunces), Georgia, serif";
const C = { ink: "#1f1b16", muted: "#8B7458", line: "#E9DCC4", cream: "#faf7f1", gold: "#B07848", goldDark: "#9C6739", red: "#b91c1c", redBg: "#fef2f2", green: "#3F7A4F", greenBg: "#ecfdf3", amber: "#8C5A2E", amberBg: "#FFF8E8" };

const peso = (n: number) => `₱${Math.round(Number(n) || 0).toLocaleString("en-PH")}`;
const longDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso || "")
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "—";
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const time12 = (t: string | null | undefined) => {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Booking statuses (as the Bookings table names them) that can be extended. */
export const EXTENDABLE_UI_STATUSES = ["confirmed", "down-paid", "checked-in"];

/** null when it couldn't load — the table still works without it. */
async function fetchExtensions(): Promise<BookingExtension[] | null> {
  try {
    const res = await fetch("/api/admin/booking-extensions");
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body?.data) ? body.data : [];
  } catch {
    return null;
  }
}

/** Every extension, refreshed on demand — for the table's buttons. */
export function useBookingExtensions() {
  const [list, setList] = useState<BookingExtension[]>([]);
  const reload = useCallback(async () => {
    const next = await fetchExtensions();
    if (next) setList(next);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchExtensions().then((next) => { if (alive && next) setList(next); });
    return () => { alive = false; };
  }, []);
  // Unpaid extension money per booking (UUID), and each booking's extensions.
  const unpaidByBooking = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of list) if (x.status === "unpaid") m[x.booking_uuid] = (m[x.booking_uuid] ?? 0) + Number(x.charge_amount);
    return m;
  }, [list]);
  return { list, reload, unpaidByBooking };
}

export function ExtendBookingModal({ booking, onClose, onDone }: {
  booking: { id: string; displayId: string; guest: string; checkInRaw: string; checkOutRaw: string; checkOutTime: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const currentOut = booking.checkOutRaw.slice(0, 10);
  const [newOut, setNewOut] = useState(addDays(currentOut, 1));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Check the date with the server each time it changes (availability + price).
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newOut)) return;
    let cancelled = false;
    setChecking(true);
    setConfirming(false);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}/extend?new_check_out=${newOut}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPreview(null);
          setError(body?.error || "Could not check that date.");
        } else {
          setPreview(body.data as Preview);
          setError(null);
          if (!priceTouched) setPrice(String(body.data.suggested ?? 0));
        }
      } catch {
        if (!cancelled) { setPreview(null); setError("Could not check that date — check your connection."); }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // priceTouched only decides whether to overwrite the price; it mustn't re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOut, booking.id]);

  const charge = Math.max(0, Math.round(Number(price) || 0));
  const priceValid = price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0;
  const canConfirm = !!preview && !error && !checking && priceValid && !saving;

  const submit = async () => {
    if (!canConfirm || !preview) return;
    if (!confirming) { setConfirming(true); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_check_out: newOut, charge, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body?.error || "Could not extend the booking"); setConfirming(false); return; }
      toast.success(`Extended to ${shortDate(newOut)} · ${peso(charge)} added to the bill`);
      if (body?.emailStatus && body.emailStatus.ok === false) toast(body.emailStatus.detail || "The guest wasn't emailed — please tell them.", { icon: "✉️" });
      onDone();
      onClose();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a" };
  const row = (k: string, v: React.ReactNode, strong = false) => (
    // The label doubles as the key — rows are also rendered from a list (the nights).
    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", fontSize: 13, color: strong ? C.ink : "#5a4a3a", fontWeight: strong ? 700 : 400 }}>
      <span>{k}</span><span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(31,27,22,0.45)", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Extend booking"
        style={{ width: 560, maxWidth: "100%", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 20, boxShadow: "0 24px 64px rgba(31,22,14,.28)", overflow: "hidden", margin: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", background: "#FBF5E9", borderBottom: `1px solid ${C.line}` }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: C.gold, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
            <CalendarPlus className="w-5 h-5" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.1, color: C.ink }}>Extend stay</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{booking.guest} · {booking.displayId}</div>
          </div>
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: 9, background: "rgba(255,255,255,.6)", color: "#8a6f4d", cursor: "pointer" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 1 · New checkout */}
          <div>
            <div style={label}>1 · New checkout date</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150, padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 12, background: C.cream }}>
                <div style={{ fontSize: 11, color: "#a08a6c" }}>Now leaves</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#9b8870", textDecoration: "line-through" }}>{longDate(currentOut)}</div>
              </div>
              <span style={{ color: C.gold, fontSize: 18 }}>→</span>
              <label style={{ flex: 1, minWidth: 170, padding: "8px 12px", border: `2px solid ${C.gold}`, borderRadius: 12, background: "#fff" }}>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>Will leave</div>
                <input type="date" value={newOut} min={addDays(currentOut, 1)}
                  onChange={(e) => setNewOut(e.target.value)}
                  style={{ border: 0, outline: "none", fontSize: 15, fontWeight: 700, color: C.ink, background: "transparent", width: "100%", fontFamily: "inherit" }} />
              </label>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Checkout time stays {time12(booking.checkOutTime) || "the same"}.</div>
          </div>

          {/* Availability */}
          {checking ? (
            <div style={{ fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 8 }}><Clock className="w-4 h-4" />Checking the unit is free…</div>
          ) : error ? (
            <div role="alert" style={{ display: "flex", gap: 10, padding: "11px 13px", borderRadius: 12, background: C.redBg, border: "1px solid #fecaca", color: C.red, fontSize: 13, lineHeight: 1.45 }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ marginTop: 2 }} /><span>{error}</span>
            </div>
          ) : preview ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 12px", borderRadius: 12, background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 600 }}>
              <Check className="w-4 h-4" />The unit is free · +{preview.addedNights} {preview.addedNights === 1 ? "night" : "nights"}
            </div>
          ) : null}

          {/* 2 · Price */}
          {preview && !error && (
            <div>
              <div style={label}>2 · Extension price</div>
              <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 12, padding: "6px 14px", background: "#fff" }}>
                {preview.nights.map((n) => row(
                  `${shortDate(n.date)}${n.season ? ` · ${n.season}` : ""}${n.longTerm ? " · long-term" : ""}`,
                  peso(n.rate),
                ))}
                {preview.paxFeeAdded > 0 && row("Extra guests", peso(preview.paxFeeAdded))}
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4 }}>
                  {row("Suggested (Haven pricing)", preview.priced ? peso(preview.suggested) : "—", true)}
                </div>
                {preview.longTermNow && (
                  <div style={{ fontSize: 12, color: C.amber, padding: "0 0 8px" }}>
                    The longer stay now gets the long-term rate, so the whole stay was re-priced — that&apos;s why this may be lower than the nightly rates.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 46, border: `2px solid ${priceValid ? C.ink : C.red}`, borderRadius: 12, background: "#fff" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.muted }}>₱</span>
                  <input inputMode="decimal" value={price} aria-label="Extension price"
                    onChange={(e) => { setPrice(e.target.value.replace(/[^0-9.]/g, "")); setPriceTouched(true); setConfirming(false); }}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: "none", fontSize: 18, fontWeight: 700, color: C.ink, background: "transparent", fontFamily: "inherit" }} />
                </label>
                {priceTouched && Math.round(Number(price) || 0) !== preview.suggested && (
                  <button type="button" onClick={() => { setPrice(String(preview.suggested)); setPriceTouched(false); setConfirming(false); }}
                    style={{ height: 46, padding: "0 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.cream, color: C.amber, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    Use suggested
                  </button>
                )}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional, e.g. agreed rate)" maxLength={500}
                style={{ marginTop: 10, width: "100%", boxSizing: "border-box", height: 42, padding: "0 12px", border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 13, background: "#fff" }} />
            </div>
          )}

          {/* 3 · Summary */}
          {preview && !error && (
            <div>
              <div style={label}>3 · Check and confirm</div>
              <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 12, padding: "6px 14px", background: C.cream }}>
                {row("Original checkout", longDate(preview.oldCheckOutDate))}
                {row("New checkout", `${longDate(preview.newCheckOutDate)}${preview.checkOutTime ? ` · ${time12(preview.checkOutTime)}` : ""}`, true)}
                {row("Added nights", String(preview.addedNights))}
                {row("Extension charge", peso(charge), true)}
                {row("Booking total", `${peso(preview.currentTotal)} → ${peso(preview.currentTotal + charge)}`)}
                {row("Guest still owes", peso(preview.currentBalance + charge), true)}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                No extra security deposit is charged. The guest is emailed the new checkout and the amount due, the calendar and cleaning move to the new checkout, and the cleaner is told.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "14px 22px", borderTop: `1px solid ${C.line}`, background: "#FBF5E9" }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#5A4632", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!canConfirm}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 0, background: canConfirm ? (confirming ? "#7A4E2A" : C.gold) : "#e7dfd0", color: canConfirm ? "#FFFCF4" : "#9b8870", fontWeight: 700, fontSize: 14, cursor: canConfirm ? "pointer" : "not-allowed" }}>
            {saving ? "Saving…" : confirming ? `Tap again to extend · ${peso(charge)}` : "Confirm extension"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A booking's extensions, newest first, with "Mark paid" for unpaid ones. */
export function ExtensionHistory({ extensions, onChanged }: { extensions: BookingExtension[]; onChanged: () => void }) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [method, setMethod] = useState("Cash");
  const [busy, setBusy] = useState(false);
  if (extensions.length === 0) return null;

  const pay = async (x: BookingExtension) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/booking-extensions/${x.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body?.error || "Could not record the payment"); return; }
      toast.success(`${peso(x.charge_amount)} recorded for the extension`);
      setPayingId(null);
      onChanged();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a" }}>Extensions</div>
      {extensions.map((x) => (
        <div key={x.id} style={{ border: `1px solid ${x.status === "unpaid" ? "#F0DFB8" : C.line}`, background: x.status === "unpaid" ? C.amberBg : C.cream, borderRadius: 12, padding: "10px 12px", fontSize: 12.5, color: "#5a4a3a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontWeight: 600, color: C.ink }}>+{x.added_nights} {x.added_nights === 1 ? "night" : "nights"} → {shortDate(x.new_check_out_date)}</span>
            <span style={{ fontWeight: 700, color: C.ink }}>{peso(x.charge_amount)}</span>
          </div>
          <div style={{ marginTop: 3, color: C.muted }}>
            was {shortDate(x.old_check_out_date)}{x.created_by_name ? ` · by ${x.created_by_name}` : ""}
            {Number(x.suggested_amount) !== Number(x.charge_amount) ? ` · suggested ${peso(x.suggested_amount)}` : ""}
          </div>
          {x.note && <div style={{ marginTop: 3, fontStyle: "italic" }}>“{x.note}”</div>}
          {x.status === "paid" ? (
            <div style={{ marginTop: 6, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
              <Check className="w-3.5 h-3.5" />Paid{x.payment_method ? ` · ${x.payment_method}` : ""}{x.paid_by_name ? ` · ${x.paid_by_name}` : ""}
            </div>
          ) : payingId === x.id ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                style={{ height: 34, borderRadius: 9, border: "1px solid #D4BE9A", background: "#fff", fontSize: 12.5, padding: "0 8px" }}>
                {["Cash", "GCash", "BPI transfer"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => pay(x)}
                style={{ height: 34, padding: "0 12px", borderRadius: 9, border: 0, background: "#059669", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
                {busy ? "Saving…" : `Received ${peso(x.charge_amount)}`}
              </button>
              <button type="button" onClick={() => setPayingId(null)}
                style={{ height: 34, padding: "0 10px", borderRadius: 9, border: "1px solid #D4BE9A", background: "#fff", color: "#5A4632", fontSize: 12.5, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => { setPayingId(x.id); setMethod("Cash"); }}
              style={{ marginTop: 8, height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid #D4BE9A", background: "#fff", color: C.amber, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              Unpaid · Mark paid
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
