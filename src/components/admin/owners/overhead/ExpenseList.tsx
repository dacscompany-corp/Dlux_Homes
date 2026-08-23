"use client";

import { Plus, Pencil } from "lucide-react";
import { useGetOverheadExpensesQuery } from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const FREQUENCY_LABEL: Record<string, string> = {
  "one-time": "One-time", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually",
  custom: "Custom",
};

export function ExpenseList({
  onEdit, onCreate,
}: { onEdit: (id: string) => void; onCreate: () => void }) {
  const { data, isLoading } = useGetOverheadExpensesQuery();
  const rows = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{
          fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
          fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16",
        }}>
          Recurring expenses
        </h3>
        <button type="button" onClick={onCreate}
          className="inline-flex items-center cursor-pointer"
          style={{
            gap: 7, padding: "9px 16px", fontSize: 13, fontWeight: 500,
            color: "#faf7f1", background: "#1f1b16", border: "none",
            fontFamily: "inherit",
          }}>
          <Plus className="w-4 h-4" /> Add expense
        </button>
      </div>

      {isLoading && <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <Empty label="No overhead expenses recorded yet." />
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                  {["Expense", "Category", "Amount", "Repeats", "Next due", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f3eee2", opacity: e.active ? 1 : 0.55 }}>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                      {e.name}
                      {!e.active && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#8a8276" }}>paused</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#6b6358" }}>
                      {e.category_name}
                    </td>
                    <td className="px-6 py-3.5"
                      style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>
                      {peso(e.amount)}
                    </td>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#6b6358" }}>
                      {FREQUENCY_LABEL[e.frequency] ?? e.frequency}
                    </td>
                    <td className="px-6 py-3.5"
                      style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                      {e.next_due_date ? String(e.next_due_date).slice(0, 10) : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button type="button" onClick={() => onEdit(e.id)}
                        className="inline-flex items-center cursor-pointer"
                        style={{
                          gap: 5, padding: "6px 10px", fontSize: 12, color: "#B07848",
                          background: "#F7F0E3", border: "1px solid #D4BFA0",
                          fontFamily: "inherit",
                        }}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
