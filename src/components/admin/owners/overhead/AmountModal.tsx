"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  useUpdateOverheadPeriodAmountMutation,
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
 * Corrects one period's figure, for a bill that is monthly but never the same
 * twice. Keyed on the period so the field seeds from props rather than syncing
 * in an effect — a query settling underneath can never overwrite what the owner
 * has typed.
 */
export function AmountModal({
  period, open, onClose,
}: { period: OverheadPeriod | null; open: boolean; onClose: () => void }) {
  if (!open || !period) return null;
  return <AmountForm key={period.id} period={period} onClose={onClose} />;
}

function AmountForm({
  period, onClose,
}: { period: OverheadPeriod; onClose: () => void }) {
  const [updateAmount, { isLoading }] = useUpdateOverheadPeriodAmountMutation();
  const [amount, setAmount] = useState(() => String(period.amount_due));

  const alreadyPaid = Number(period.amount_paid || 0);
  const next = Number(amount);
  const willSettle = Number.isFinite(next) && next > 0 && alreadyPaid >= next;

  const submit = async () => {
    try {
      const res = await updateAmount({ periodId: period.id, amount: Number(amount) }).unwrap();
      toast.success(res.data.settled
        ? "Amount updated — this bill is now settled."
        : "Amount updated.");
      onClose();
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not update the amount");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(31,27,22,.45)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ece5d4", width: "min(440px, 100%)",
        maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div className="flex items-center justify-between mb-2">
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            Update amount
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer"
            style={{ background: "transparent", border: "none", color: "#8a8276" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#6b6358", margin: "0 0 20px" }}>
          {period.expense_name} · due {String(period.due_date).slice(0, 10)}
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={label}>Actual bill amount (₱)</label>
            <input style={input} type="number" min="0" step="0.01" autoFocus value={amount}
              onChange={(e) => setAmount(e.target.value)} />
            <span style={{ fontSize: 11.5, color: "#8a8276", display: "block", marginTop: 6 }}>
              Scheduled {peso(period.amount_due)}
              {alreadyPaid > 0 ? ` · ${peso(alreadyPaid)} already paid` : ""}
            </span>
          </div>

          {alreadyPaid > 0 && (
            <p style={{
              fontSize: 12.5, color: "#5a4a3a", margin: 0,
              background: "#F7F0E3", border: "1px solid #D4BFA0", padding: 12,
            }}>
              {willSettle
                ? "What you have already paid covers this amount, so the bill will be marked settled."
                : `That leaves ${peso(Math.max(0, next - alreadyPaid))} still owing.`}
            </p>
          )}

          <p style={{ fontSize: 12, color: "#8a8276", margin: 0 }}>
            This changes only this month. The expense keeps its own figure as the
            estimate for future months.
          </p>

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
              Save amount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
