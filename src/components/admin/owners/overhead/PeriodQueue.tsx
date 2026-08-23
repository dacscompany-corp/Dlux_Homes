"use client";

import { useState } from "react";
import {
  useGetOverheadPeriodsQuery,
  type OverheadPeriod,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";
import { PaymentModal } from "./PaymentModal";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const STATUS_TONE: Record<string, { c: string; dot: string; label: string }> = {
  paid:      { c: "#4a6a3a", dot: "#7a8c5a", label: "Paid" },
  overdue:   { c: "#9a4a3a", dot: "#b85a4a", label: "Overdue" },
  due:       { c: "#8a6a2f", dot: "#d4a96a", label: "Due soon" },
  scheduled: { c: "#8a8276", dot: "#c9c1b2", label: "Scheduled" },
  cancelled: { c: "#8a8276", dot: "#c9c1b2", label: "Cancelled" },
};

export function PeriodQueue({ month }: { month: string }) {
  const { data, isLoading } = useGetOverheadPeriodsQuery({ month });
  const [active, setActive] = useState<OverheadPeriod | null>(null);
  const rows = data?.data ?? [];

  return (
    <div>
      {isLoading && <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <Empty label="Nothing due in this month." />
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                  {["Expense", "Due", "Amount", "Paid", "Status", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const tone = STATUS_TONE[p.display_status] ?? STATUS_TONE.scheduled;
                  const settled = p.display_status === "paid";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3eee2" }}>
                      <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                        {p.expense_name}
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: "#8a8276" }}>
                          {p.category_name}
                        </span>
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                        {String(p.due_date).slice(0, 10)}
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>
                        {peso(p.amount_due)}
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#6b6358" }}>
                        {Number(p.amount_paid) > 0 ? peso(p.amount_paid) : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center"
                          style={{ gap: 7, fontSize: 12, color: tone.c }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: tone.dot, flex: "none",
                          }} />
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {!settled && (
                          <button type="button" onClick={() => setActive(p)}
                            className="cursor-pointer"
                            style={{
                              padding: "6px 12px", fontSize: 12, color: "#B07848",
                              background: "#F7F0E3", border: "1px solid #D4BFA0",
                              fontFamily: "inherit",
                            }}>
                            Record payment
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaymentModal period={active} open={!!active} onClose={() => setActive(null)} />
    </div>
  );
}
