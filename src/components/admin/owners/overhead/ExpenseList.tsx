"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  useGetOverheadExpensesQuery,
  useDeleteOverheadSpendMutation,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";
import { MonthNavigator } from "@/components/admin/owners/MonthNavigator";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const FREQUENCY_LABEL: Record<string, string> = {
  "one-time": "One-off", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually",
  custom: "Custom",
};

const day = (v: string | null) => (v ? String(v).slice(0, 10) : null);

export function ExpenseList({
  month, onMonthChange, onEdit, onCreate,
}: {
  month: string | null;
  onMonthChange: (m: string | null) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { data, isLoading } = useGetOverheadExpensesQuery(
    month ? { month } : undefined,
  );
  const [deleteSpend, { isLoading: deleting }] = useDeleteOverheadSpendMutation();
  const rows = data?.data ?? [];

  const removeOneOff = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This removes the expense and its payment for good.`)) return;
    try {
      await deleteSpend(id).unwrap();
      toast.success("Expense deleted");
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not delete the expense");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap mb-4" style={{ gap: 12 }}>
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            Expenses
          </h3>
          {/* No dots: this list has no per-month figures to advertise — the
              navigator here is a filter, not a data browser. */}
          <MonthNavigator
            value={month}
            onChange={onMonthChange}
            monthsWithData={[]}
          />
        </div>
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

      <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 16px" }}>
        {month
          ? "Recurring bills always show. One-off spend is listed for the selected month."
          : "Recurring bills always show, and every one-off entry ever recorded is listed — pick a month to narrow it down."}
      </p>

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
                  {["Expense", "Category", "Amount", "When", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const oneOff = e.frequency === "one-time";
                  // `paused` is meaningless for a completed purchase: one-off
                  // rows carry active=false so they stay out of the annual
                  // estimate, not because anyone paused them.
                  const paused = !oneOff && !e.active;
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f3eee2", opacity: paused ? 0.55 : 1 }}>
                      <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                        {e.name}
                        {paused && (
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
                      <td className="px-6 py-3.5" style={{ fontSize: 12.5, color: "#6b6358" }}>
                        {oneOff
                          ? `One-off · paid ${day(e.start_date)}`
                          : `${FREQUENCY_LABEL[e.frequency] ?? e.frequency}${
                              e.next_due_date ? ` · next due ${day(e.next_due_date)}` : ""
                            }`}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {oneOff ? (
                          <button type="button" disabled={deleting}
                            onClick={() => removeOneOff(e.id, e.name)}
                            className="inline-flex items-center cursor-pointer"
                            style={{
                              gap: 5, padding: "6px 10px", fontSize: 12, color: "#9a4a3a",
                              background: "#fff", border: "1px solid #e3c9c2",
                              fontFamily: "inherit", opacity: deleting ? 0.6 : 1,
                            }}>
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        ) : (
                          <button type="button" onClick={() => onEdit(e.id)}
                            className="inline-flex items-center cursor-pointer"
                            style={{
                              gap: 5, padding: "6px 10px", fontSize: 12, color: "#B07848",
                              background: "#F7F0E3", border: "1px solid #D4BFA0",
                              fontFamily: "inherit",
                            }}>
                            <Pencil className="w-3 h-3" /> Edit
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
    </div>
  );
}
