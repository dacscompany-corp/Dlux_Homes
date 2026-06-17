"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BarChart3, Calendar, CalendarOff, Sparkles, CreditCard, Headphones, UsersRound, Handshake, Plus, Trash2, Power, X } from "lucide-react";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery, useGetRevenueByRoomQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery } from "@/redux/api/bookingsApi";
import { useGetBlockedDatesQuery, useCreateBlockedDateMutation, useDeleteBlockedDateMutation } from "@/redux/api/blockedDatesApi";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { useGetCleaningTasksQuery } from "@/redux/api/cleanersApi";
import { useGetAdminUsersQuery } from "@/redux/api/adminUsersApi";
import { useGetPartnersQuery } from "@/redux/api/partnersApi";

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
type Row = Record<string, unknown>;
const arr = (x: unknown): Row[] => (Array.isArray(x) ? (x as Row[]) : []);
const dataOf = (x: unknown): Row[] => arr((x as { data?: unknown })?.data ?? x);

// ── shared bits ──────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border ${className}`} style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>{children}</div>;
}
function SectionHead({ title, sub, icon: Icon }: { title: string; sub?: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {Icon && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F7F0E3" }}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: "#B07848" }} />
        </div>
      )}
      <div>
        <h2 className="font-bold text-lg leading-tight" style={{ color: "#1a1a1a" }}>{title}</h2>
        {sub && <p className="text-sm" style={{ color: "#8B6344" }}>{sub}</p>}
      </div>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="rounded-2xl border p-10 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}><p className="text-sm" style={{ color: "#8B6344" }}>{label}</p></div>;
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#f9fafb" }}>
            {headers.map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>)}
          </tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}
function Pill({ text, tone = "neutral" }: { text: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const map = { good: { bg: "#d1fae5", c: "#065f46" }, warn: { bg: "#fef3c7", c: "#92400e" }, bad: { bg: "#fee2e2", c: "#991b1b" }, neutral: { bg: "#F7F0E3", c: "#B07848" } }[tone];
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: map.bg, color: map.c }}>{text}</span>;
}
const fmtDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString() : "—");

// ── 1. Analytics & Reports ────────────────────────────────────────────────
export function AnalyticsSection() {
  const { data: summaryRes } = useGetAnalyticsSummaryQuery({ period: "30" });
  const { data: monthlyRes } = useGetMonthlyRevenueQuery({ months: "6" });
  const { data: roomRes } = useGetRevenueByRoomQuery({ period: "30" });
  const s = (summaryRes as unknown as { data?: Row })?.data || {};
  const monthly = dataOf(monthlyRes) as { month: string; revenue: number }[];
  const rooms = dataOf(roomRes) as { room_name: string; revenue: number; bookings: number }[];
  const maxRev = Math.max(1, ...monthly.map((m) => Number(m.revenue) || 0));
  const stats = [
    { label: "Revenue (30d)", value: peso(Number(s.total_revenue ?? 0)) },
    { label: "Bookings (30d)", value: String(s.total_bookings ?? 0) },
    { label: "Occupancy", value: `${Math.round(Number(s.occupancy_rate ?? 0))}%` },
    { label: "New Guests", value: String(s.new_guests ?? 0) },
  ];
  return (
    <div>
      <SectionHead title="Analytics & Reports" icon={BarChart3} sub="Revenue, occupancy and room performance — last 30 days" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((st) => (
          <Card key={st.label} className="p-5">
            <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{st.value}</p>
            <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>{st.label}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6 mb-6">
        <h3 className="font-bold mb-6" style={{ color: "#1a1a1a" }}>Revenue — Last 6 Months</h3>
        {monthly.length === 0 ? (
          <p className="text-sm" style={{ color: "#8B6344" }}>No revenue recorded yet.</p>
        ) : (
          <div className="flex items-end gap-3 h-44">
            {monthly.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: "#5a4a3a" }}>{peso(Number(m.revenue) || 0)}</span>
                <div className="w-full flex items-end justify-center" style={{ height: "120px" }}>
                  <div className="w-full rounded-t-lg" style={{ height: `${Math.max(2, ((Number(m.revenue) || 0) / maxRev) * 100)}%`, background: "linear-gradient(to top, #B07848, #D4A96A)" }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "#8B6344" }}>{/^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "short" }) : m.month}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <SectionHead title="Revenue by Room" />
      {rooms.length === 0 ? <Empty label="No room revenue yet." /> : (
        <Table headers={["Room", "Bookings", "Revenue"]}>
          {rooms.map((r, i) => (
            <tr key={i} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{r.room_name}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{r.bookings}</td>
              <td className="px-4 py-3.5 font-semibold text-sm" style={{ color: "#1a1a1a" }}>{peso(Number(r.revenue) || 0)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 2. Booking Calendar ───────────────────────────────────────────────────
export function BookingCalendarSection() {
  const { data: bookingsData } = useGetBookingsQuery();
  const bookings = dataOf(bookingsData);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = first.getDay();
  const sameMonth = (d: unknown) => { if (!d) return null; const dt = new Date(String(d)); return dt.getFullYear() === month.y && dt.getMonth() === month.m ? dt.getDate() : null; };
  const byDay: Record<number, { in: number; out: number }> = {};
  bookings.forEach((b) => {
    if (["rejected", "cancelled"].includes(String(b.status))) return;
    const ci = sameMonth(b.check_in_date); const co = sameMonth(b.check_out_date);
    if (ci) (byDay[ci] = byDay[ci] || { in: 0, out: 0 }).in++;
    if (co) (byDay[co] = byDay[co] || { in: 0, out: 0 }).out++;
  });
  const monthName = first.toLocaleString("en", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <div>
      <SectionHead title="Booking Calendar" icon={Calendar} sub="Check-ins and check-outs across the property" />
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shift(-1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer" style={{ color: "#B07848", borderColor: "#EDE3D2", backgroundColor: "#F7F0E3" }}>← Prev</button>
          <h3 className="font-bold" style={{ color: "#1a1a1a" }}>{monthName}</h3>
          <button type="button" onClick={() => shift(1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer" style={{ color: "#B07848", borderColor: "#EDE3D2", backgroundColor: "#F7F0E3" }}>Next →</button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-center text-xs font-semibold py-2" style={{ color: "#8B6344" }}>{d}</div>)}
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1; const ev = byDay[day];
            return (
              <div key={day} className="rounded-lg border p-2 min-h-[64px]" style={{ borderColor: "#F0E6D6", backgroundColor: ev ? "#FDF8F3" : "#ffffff" }}>
                <div className="text-xs font-semibold" style={{ color: "#5a4a3a" }}>{day}</div>
                {ev?.in ? <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>{ev.in} in</div> : null}
                {ev?.out ? <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}>{ev.out} out</div> : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── 3. Blocked Dates ──────────────────────────────────────────────────────
export function BlockedDatesSection() {
  const { data: blockedRes } = useGetBlockedDatesQuery({});
  const { data: havensData } = useGetHavensQuery({});
  const [createBlocked, { isLoading: creating }] = useCreateBlockedDateMutation();
  const [deleteBlocked] = useDeleteBlockedDateMutation();
  const rows = dataOf(blockedRes);
  const havens = arr(havensData).map((h) => ({ id: String(h.uuid_id || h.id || ""), name: String(h.haven_name || "Haven") }));
  const [form, setForm] = useState({ haven_id: "", from_date: "", to_date: "", reason: "" });

  const submit = async () => {
    if (!form.haven_id || !form.from_date || !form.to_date) { toast.error("Pick a haven and date range"); return; }
    try { await createBlocked(form).unwrap(); toast.success("Dates blocked"); setForm({ haven_id: "", from_date: "", to_date: "", reason: "" }); }
    catch { toast.error("Could not block dates"); }
  };
  const remove = async (id: string) => { try { await deleteBlocked(id).unwrap(); toast.success("Removed"); } catch { toast.error("Could not remove"); } };

  const inputCls = "rounded-xl border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" } as const;
  return (
    <div>
      <SectionHead title="Blocked Dates" icon={CalendarOff} sub="Mark dates as unavailable per haven (maintenance, events, holidays)" />
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <select value={form.haven_id} onChange={(e) => setForm({ ...form, haven_id: e.target.value })} className={inputCls} style={inputStyle}>
            <option value="">Select haven</option>
            {havens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} className={inputCls} style={inputStyle} />
          <input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} className={inputCls} style={inputStyle} />
          <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} style={inputStyle} />
          <button type="button" onClick={submit} disabled={creating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{creating ? "Blocking…" : "Block dates"}</button>
        </div>
      </Card>
      {rows.length === 0 ? <Empty label="No blocked dates." /> : (
        <Table headers={["Haven", "From", "To", "Reason", "Status", ""]}>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(r.haven_name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{fmtDate(r.from_date)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{fmtDate(r.to_date)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(r.reason ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.status ?? "active")} tone="warn" /></td>
              <td className="px-4 py-3.5"><button type="button" onClick={() => remove(String(r.id))} className="text-xs font-semibold cursor-pointer" style={{ color: "#dc2626" }}>Remove</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 4. Cleaning Management ────────────────────────────────────────────────
export function CleaningManagementSection() {
  const { data: tasksData } = useGetCleaningTasksQuery();
  const rows = dataOf(tasksData);
  const tone = (s: string) => (s === "cleaned" || s === "inspected" ? "good" : s === "in-progress" ? "neutral" : "warn");
  return (
    <div>
      <SectionHead title="Cleaning Management" icon={Sparkles} sub="Turnover tasks across all havens" />
      {rows.length === 0 ? <Empty label="No cleaning tasks yet — they appear after bookings are made." /> : (
        <Table headers={["Haven", "Guest", "Cleaner", "Window", "Status"]}>
          {rows.map((t, i) => (
            <tr key={String(t.cleaning_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(t.haven ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{`${t.guest_first_name ?? ""} ${t.guest_last_name ?? ""}`.trim() || "—"}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{`${t.cleaner_first_name ?? ""} ${t.cleaner_last_name ?? ""}`.trim() || "Unassigned"}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{t.check_in_time && t.check_out_time ? `${t.check_in_time}–${t.check_out_time}` : "—"}</td>
              <td className="px-4 py-3.5"><Pill text={String(t.cleaning_status ?? "pending").replace("-", " ")} tone={tone(String(t.cleaning_status))} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 5. Payment Methods ────────────────────────────────────────────────────
const PM_METHODS = ["GCash", "Bank Transfer", "Maya", "Card", "Cash", "Other"];
const emptyPM = { payment_name: "", payment_method: "GCash", provider: "", account_details: "", description: "", qr: null as File | null };

export function PaymentMethodsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPM);

  const reload = () =>
    fetch("/api/payment-methods").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => setRows(arr(j.data))).catch(() => {});
  useEffect(() => { reload(); }, []);

  const submit = async () => {
    if (!form.payment_name.trim() || !form.provider.trim() || !form.account_details.trim()) {
      toast.error("Fill in name, provider and account details"); return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("payment_name", form.payment_name.trim());
      fd.append("payment_method", form.payment_method);
      fd.append("provider", form.provider.trim());
      fd.append("account_details", form.account_details.trim());
      fd.append("description", form.description.trim());
      fd.append("is_active", "true");
      if (form.qr) fd.append("qr_image", form.qr);
      const res = await fetch("/api/payment-methods", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      toast.success("Payment method added");
      setModal(false); setForm(emptyPM); reload();
    } catch { toast.error("Could not add payment method"); }
    finally { setSaving(false); }
  };

  const toggle = async (id: unknown) => {
    try { const r = await fetch(`/api/payment-methods/${id}/toggle-status`, { method: "PATCH" }); if (!r.ok) throw new Error(); reload(); }
    catch { toast.error("Could not update status"); }
  };
  const remove = async (id: unknown) => {
    try { const r = await fetch(`/api/payment-methods/${id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); toast.success("Payment method deleted"); reload(); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <SectionHead title="Payment Methods" icon={CreditCard} sub="Channels guests can pay through (GCash, bank, etc.)" />
        <button onClick={() => setModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer flex-shrink-0" style={{ backgroundColor: "#B07848" }}>
          <Plus className="w-4 h-4" /> Add Payment Method
        </button>
      </div>
      {rows.length === 0 ? <Empty label="No payment methods configured yet." /> : (
        <Table headers={["Method", "Provider", "Account details", "Status", "Actions"]}>
          {rows.map((m, i) => (
            <tr key={String(m.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(m.payment_name ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(m.provider ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm font-mono" style={{ color: "#5a4a3a" }}>{String(m.account_details ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={m.is_active ? "active" : "inactive"} tone={m.is_active ? "good" : "neutral"} /></td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => toggle(m.id)} title={m.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg cursor-pointer" style={{ color: m.is_active ? "#92400e" : "#065f46" }}><Power className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(m.id)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-3xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Payment Method</h3>
                <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>A channel guests can pay through.</p>
              </div>
              <button type="button" onClick={() => setModal(false)} title="Close" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Display name</label>
                <input value={form.payment_name} onChange={(e) => setForm((f) => ({ ...f, payment_name: e.target.value }))} placeholder="GCash – Main" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Type</label>
                  <select aria-label="Payment type" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                    {PM_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Provider</label>
                  <input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="GCash / BPI…" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Account details</label>
                <input value={form.account_details} onChange={(e) => setForm((f) => ({ ...f, account_details: e.target.value }))} placeholder="0917 123 4567 · Juan Dela Cruz" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none font-mono" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Notes (optional)</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. for down payments only" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>QR image (optional)</label>
                <input aria-label="QR image" type="file" accept="image/*" onChange={(e) => setForm((f) => ({ ...f, qr: e.target.files?.[0] || null }))} className="w-full mt-1 text-sm" style={{ color: "#5a4a3a" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setModal(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#EDE3D2", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{saving ? "Adding…" : "Add Method"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 6. Guest Assistance ───────────────────────────────────────────────────
export function GuestAssistanceSection() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/report").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => { if (active) setRows(arr(j.data)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const tone = (s: string) => (s === "resolved" || s === "closed" ? "good" : s === "in-progress" ? "neutral" : "bad");
  return (
    <div>
      <SectionHead title="Guest Assistance" icon={Headphones} sub="Support requests and reported issues across the property" />
      {rows.length === 0 ? <Empty label="No assistance requests." /> : (
        <Table headers={["Haven", "Type", "Priority", "Description", "Status", "Reported"]}>
          {rows.map((r, i) => (
            <tr key={String(r.report_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(r.haven_name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(r.issue_type ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.priority_level ?? "low")} tone="warn" /></td>
              <td className="px-4 py-3.5 text-sm max-w-xs truncate" style={{ color: "#8B6344" }}>{String(r.issue_description ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.status ?? "open")} tone={tone(String(r.status))} /></td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 7. User Management ────────────────────────────────────────────────────
export function UserManagementSection() {
  const { data: usersRes } = useGetAdminUsersQuery({});
  const rows = dataOf(usersRes);
  return (
    <div>
      <SectionHead title="User Management" icon={UsersRound} sub="Registered guest accounts" />
      {rows.length === 0 ? <Empty label="No registered users yet." /> : (
        <Table headers={["Name", "Email", "Role", "Signed up via", "Joined", "Last login"]}>
          {rows.map((u, i) => (
            <tr key={String(u.user_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#1a1a1a" }}>{String(u.name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(u.email ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(u.user_role ?? "Guest")} /></td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(u.register_as ?? "credentials")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{fmtDate(u.created_at)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{u.last_login ? fmtDate(u.last_login) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 8. Partner Management ─────────────────────────────────────────────────
export function PartnerManagementSection() {
  const { data: partnersRes } = useGetPartnersQuery({});
  const rows = dataOf(partnersRes);
  const tone = (s: string) => (s === "active" ? "good" : s === "pending" ? "warn" : "bad");
  return (
    <div>
      <SectionHead title="Partner Management" icon={Handshake} sub="Business partners and affiliates" />
      {rows.length === 0 ? <Empty label="No partners yet." /> : (
        <Table headers={["Partner", "Email", "Phone", "Type", "Commission", "Status"]}>
          {rows.map((p, i) => (
            <tr key={String(p.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#1a1a1a" }}>{String(p.fullname ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(p.email ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(p.phone ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(p.type ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{p.commission_rate != null ? `${p.commission_rate}%` : "—"}</td>
              <td className="px-4 py-3.5"><Pill text={String(p.status ?? "pending")} tone={tone(String(p.status))} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
