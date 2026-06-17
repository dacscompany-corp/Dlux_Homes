"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { generateBookingId } from "@/lib/booking-store";
import { User, CalendarDays, Package, Wallet, Check, Plus, Minus } from "lucide-react";

const STEPS = [
  { id: "guest", label: "Guest", icon: User },
  { id: "booking", label: "Booking", icon: CalendarDays },
  { id: "addons", label: "Add-ons", icon: Package },
  { id: "payment", label: "Payment", icon: Wallet },
] as const;

type Haven = { id: string; name: string; rate: number };
type AddonItem = { name: string; price: number; qty: number };

const empty = {
  first_name: "", last_name: "", email: "", phone: "", age: "", gender: "Male",
  room_name: "", haven_id: "", room_rate: "",
  check_in_date: "", check_out_date: "", check_in_time: "14:00", check_out_time: "11:00",
  adults: "1", children: "0", infants: "0",
  payment_method: "gcash" as "gcash" | "bank" | "card",
  down_payment: "",
};
type Form = typeof empty;

const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const fieldStyle = { borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" } as const;
const labelCls = "text-xs font-semibold";
const labelStyle = { color: "#8B6344" } as const;

export default function NewBookingWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(empty);
  const [havens, setHavens] = useState<Haven[]>([]);
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // Load havens for the room picker once when opened.
  useEffect(() => {
    if (!open) return;
    setStep(0); setForm(empty); setAddons([]);
    fetch("/api/haven")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const rows = (Array.isArray(j) ? j : j?.data) || [];
        setHavens(rows.map((h: Record<string, unknown>) => ({
          id: String(h.uuid_id || h.id || ""),
          name: String(h.haven_name || h.name || "Haven"),
          rate: Number(h.ten_hour_rate || h.weekend_rate || h.six_hour_rate || h.price_per_night || 0),
        })));
      })
      .catch(() => {});
  }, [open]);

  // When a haven is picked, prefill its rate and load its add-ons.
  const pickHaven = (id: string) => {
    const h = havens.find((x) => x.id === id);
    set({ haven_id: id, room_name: h?.name || "", room_rate: h ? String(h.rate) : "" });
    setAddons([]);
    if (id) {
      fetch(`/api/haven/${id}/rentable-items`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => {
          const rows = (j?.data || j) || [];
          setAddons((Array.isArray(rows) ? rows : []).map((it: Record<string, unknown>) => ({
            name: String(it.name || "Item"), price: Number(it.price_per_night || 0), qty: 0,
          })));
        })
        .catch(() => {});
    }
  };

  if (!open) return null;

  const addonsTotal = addons.reduce((s, a) => s + a.price * a.qty, 0);
  const roomRate = Number(form.room_rate) || 0;
  const total = roomRate + addonsTotal;

  const step1Valid = !!(form.first_name && form.last_name && form.email && form.phone);
  const step2Valid = !!(form.room_name && form.check_in_date && roomRate > 0);

  const next = () => {
    if (step === 0 && !step1Valid) { toast.error("Enter guest name, email and phone"); return; }
    if (step === 1 && !step2Valid) { toast.error("Pick a room, a check-in date and a rate"); return; }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => (step === 0 ? onClose() : setStep((s) => s - 1));

  const submit = async () => {
    if (!step1Valid) { setStep(0); toast.error("Complete the guest details"); return; }
    if (!step2Valid) { setStep(1); toast.error("Complete the booking details"); return; }
    setSaving(true);
    try {
      const ci = form.check_in_time;
      const co = form.check_out_time;
      const checkInDate = form.check_in_date;
      const checkOutDate = form.check_out_date || (co <= ci ? addDays(checkInDate, 1) : checkInDate);
      const dp = form.down_payment === "" ? Math.round(total * 0.5) : Number(form.down_payment);
      const addOnItems = addons.filter((a) => a.qty > 0).map((a) => ({ name: a.name, price: a.price, quantity: a.qty }));

      const payload = {
        booking_id: generateBookingId(),
        user_id: null,
        room_name: form.room_name,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        check_in_time: ci,
        check_out_time: co,
        adults: Number(form.adults) || 1,
        children: Number(form.children) || 0,
        infants: Number(form.infants) || 0,
        guest_first_name: form.first_name,
        guest_last_name: form.last_name,
        guest_email: form.email,
        guest_phone: form.phone,
        guest_age: parseInt(form.age, 10) || null,
        guest_gender: form.gender,
        payment_method: form.payment_method,
        room_rate: roomRate,
        add_ons_total: addonsTotal,
        total_amount: total,
        down_payment: dp,
        add_ons: addOnItems,
      };

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) { toast.error(json.error || "Could not create booking"); setSaving(false); return; }
      toast.success("Booking created");
      onCreated?.();
      onClose();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const stepHeading = ["Guest information", "Booking details", "Add-ons", "Payment"][step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border max-h-[92vh] flex flex-col" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
        {/* Header + stepper */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#EDE3D2" }}>
          <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>New Booking</h3>
          <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Step {step + 1} of {STEPS.length} · {stepHeading}</p>
          <div className="flex items-center gap-1 mt-4">
            {STEPS.map((st, i) => {
              const Icon = st.icon;
              const active = i === step, done = i < step;
              return (
                <div key={st.id} className="flex items-center gap-1.5 flex-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: done ? "#B07848" : active ? "#F7F0E3" : "#F3EEE4", color: done ? "#fff" : active ? "#B07848" : "#C9B79E", border: active ? "1.5px solid #B07848" : "none" }}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block" style={{ color: active || done ? "#B07848" : "#C9B79E" }}>{st.label}</span>
                  {i < STEPS.length - 1 && <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: done ? "#B07848" : "#EDE3D2" }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* Step 1 — Guest */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} className={field} style={fieldStyle} />
                <input placeholder="Last name" value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} className={field} style={fieldStyle} />
              </div>
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={field} style={fieldStyle} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={field} style={fieldStyle} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Age (optional)" value={form.age} onChange={(e) => set({ age: e.target.value })} className={field} style={fieldStyle} />
                <select aria-label="Gender" value={form.gender} onChange={(e) => set({ gender: e.target.value })} className={field} style={fieldStyle}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2 — Booking */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls} style={labelStyle}>Room / Haven</label>
                <select aria-label="Room" value={form.haven_id} onChange={(e) => pickHaven(e.target.value)} className={`${field} mt-1`} style={fieldStyle}>
                  <option value="">Select a room…</option>
                  {havens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Check-in date</label>
                  <input aria-label="Check-in date" type="date" value={form.check_in_date} onChange={(e) => set({ check_in_date: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Check-out date</label>
                  <input aria-label="Check-out date" type="date" value={form.check_out_date} onChange={(e) => set({ check_out_date: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Check-in time</label>
                  <input aria-label="Check-in time" type="time" value={form.check_in_time} onChange={(e) => set({ check_in_time: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Check-out time</label>
                  <input aria-label="Check-out time" type="time" value={form.check_out_time} onChange={(e) => set({ check_out_time: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["Adults", "adults"], ["Children", "children"], ["Infants", "infants"]].map(([lbl, key]) => (
                  <div key={key}>
                    <label className={labelCls} style={labelStyle}>{lbl}</label>
                    <input type="number" min={0} value={form[key as keyof Form] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} className={`${field} mt-1`} style={fieldStyle} />
                  </div>
                ))}
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Room rate (₱)</label>
                <input type="number" placeholder="Auto-filled from room" value={form.room_rate} onChange={(e) => set({ room_rate: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
              </div>
            </div>
          )}

          {/* Step 3 — Add-ons */}
          {step === 2 && (
            <div className="space-y-2">
              {addons.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "#C9B79E" }}>No add-ons available for this room.</p>
              ) : (
                addons.map((a, i) => (
                  <div key={a.name} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "#EDE3D2" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#1a1a1a" }}>{a.name}</p>
                      <p className="text-xs" style={{ color: "#8B6344" }}>₱{a.price.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setAddons(addons.map((x, j) => j === i ? { ...x, qty: Math.max(0, x.qty - 1) } : x))} className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ borderColor: "#D4BFA0", color: "#B07848" }}><Minus className="w-3.5 h-3.5" /></button>
                      <span className="text-sm font-semibold w-5 text-center" style={{ color: "#1a1a1a" }}>{a.qty}</span>
                      <button type="button" onClick={() => setAddons(addons.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: "#B07848" }}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Step 4 — Payment */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls} style={labelStyle}>Payment method</label>
                <select aria-label="Payment method" value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value as Form["payment_method"] })} className={`${field} mt-1`} style={fieldStyle}>
                  <option value="gcash">GCash</option><option value="bank">Bank transfer</option><option value="card">Card</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Down payment (₱) — defaults to 50%</label>
                <input type="number" placeholder={String(Math.round(total * 0.5))} value={form.down_payment} onChange={(e) => set({ down_payment: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
              </div>
              <div className="rounded-2xl border p-4 mt-2" style={{ backgroundColor: "#FAFAF7", borderColor: "#EDE3D2" }}>
                <div className="flex justify-between text-sm"><span style={{ color: "#8B6344" }}>Room</span><span style={{ color: "#1a1a1a" }}>₱{roomRate.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm mt-1.5"><span style={{ color: "#8B6344" }}>Add-ons</span><span style={{ color: "#1a1a1a" }}>₱{addonsTotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t font-bold" style={{ borderColor: "#EDE3D2" }}><span style={{ color: "#1a1a1a" }}>Total</span><span style={{ color: "#B07848" }}>₱{total.toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between gap-2" style={{ borderColor: "#EDE3D2" }}>
          <button type="button" onClick={back} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#EDE3D2", backgroundColor: "#ffffff" }}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>Next</button>
          ) : (
            <button type="button" onClick={submit} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{saving ? "Creating…" : "Create Booking"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
