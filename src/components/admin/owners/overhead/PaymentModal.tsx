"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  useRecordOverheadPaymentMutation,
  useGetOverheadPaymentsQuery,
  type OverheadPeriod,
} from "@/redux/api/overheadApi";

const label = { fontSize: 12, color: "#6b6358", display: "block", marginBottom: 6 } as const;
const input = {
  width: "100%", padding: "9px 12px", fontSize: 13, color: "#1f1b16",
  background: "#fff", border: "1px solid #d9d1c2", fontFamily: "inherit",
} as const;

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

/**
 * Mounts the form only once a period is selected, keyed on that period, so the
 * fields seed straight from props instead of being synced in an effect — the
 * amount prefill can never overwrite a figure the owner has already typed.
 */
export function PaymentModal({
  period, open, onClose,
}: { period: OverheadPeriod | null; open: boolean; onClose: () => void }) {
  if (!open || !period) return null;
  return <PaymentForm key={period.id} period={period} onClose={onClose} />;
}

function PaymentForm({
  period, onClose,
}: { period: OverheadPeriod; onClose: () => void }) {
  const [record, { isLoading }] = useRecordOverheadPaymentMutation();
  const { data: history } = useGetOverheadPaymentsQuery(period.id);

  const outstanding = Number(period.amount_due) - Number(period.amount_paid || 0);

  const [form, setForm] = useState(() => ({
    paid_on: new Date().toISOString().slice(0, 10),
    amount: String(outstanding),
    method: "", reference: "", notes: "",
  }));

  const submit = async () => {
    try {
      const res = await record({
        periodId: period.id,
        paid_on: form.paid_on,
        amount: Number(form.amount),
        method: form.method || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      }).unwrap();
      toast.success(res.data.settled
        ? "Payment recorded — this bill is settled."
        : `Partial payment recorded. ${peso(Number(period.amount_due) - res.data.amount_paid)} still owed.`);
      onClose();
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not record the payment");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(31,27,22,.45)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ece5d4", width: "min(480px, 100%)",
        maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div className="flex items-center justify-between mb-2">
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            Record payment
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer"
            style={{ background: "transparent", border: "none", color: "#8a8276" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#6b6358", margin: "0 0 20px" }}>
          {period.expense_name} · due {String(period.due_date).slice(0, 10)} ·{" "}
          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
            {peso(outstanding)} outstanding
          </span>
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Paid on</label>
              <input style={input} className="dlx-date" type="date" value={form.paid_on}
                onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
            </div>
            <div>
              <label style={label}>Amount (₱)</label>
              <input style={input} type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Method (optional)</label>
              <input style={input} value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                placeholder="e.g. GCash" />
            </div>
            <div>
              <label style={label}>Reference (optional)</label>
              <input style={input} value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>

          {(history?.data?.length ?? 0) > 0 && (
            <div>
              <p style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "#8B6344", margin: "0 0 8px",
              }}>
                Earlier payments
              </p>
              {(history?.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between"
                  style={{ fontSize: 12.5, color: "#6b6358", padding: "4px 0" }}>
                  <span>{String(p.paid_on).slice(0, 10)}{p.method ? ` · ${p.method}` : ""}</span>
                  <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
                    {peso(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="cursor-pointer"
              style={{
                padding: "9px 16px", fontSize: 13, color: "#6b6358",
                background: "transparent", border: "1px solid #d9d1c2",
                fontFamily: "inherit",
              }}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={isLoading}
              className="cursor-pointer"
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#faf7f1",
                background: "#1f1b16", border: "none", fontFamily: "inherit",
                opacity: isLoading ? 0.6 : 1,
              }}>
              Record payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
