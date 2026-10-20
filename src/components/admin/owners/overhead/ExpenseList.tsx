"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  useGetOverheadExpensesQuery,
  useDeleteOverheadSpendMutation,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const FREQUENCY_LABEL: Record<string, string> = {
  "one-time": "One-off", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually",
  custom: "Custom",
};

// "Oct 25, 2026" — easier to read than 2026-10-25.
const day = (v: string | null) =>
  v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : null;

export function ExpenseList({
  month, onEdit, onCreate,
}: {
  month: string | null;
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
          {rows.length > 0 && (
            <span style={{ fontSize: 12.5, color: "#8a8276" }}>
              {rows.filter((e) => e.frequency !== "one-time").length} regular bills · {rows.filter((e) => e.frequency === "one-time").length} one-off
            </span>
          )}
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
                  {["Expense", "Category", "Amount", "How often", ""].map((h) => (
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
                        <span style={{
                          display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                          background: oneOff ? "#f5f2ec" : "#f7f0e3", color: oneOff ? "#6b6358" : "#8a6a2f",
                        }}>
                          {oneOff ? "One-off" : FREQUENCY_LABEL[e.frequency] ?? e.frequency}
                        </span>
                        <span style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "#8a8276" }}>
                          {oneOff
                            ? `Paid ${day(e.start_date)}`
                            : paused ? "Paused — not being charged" : e.next_due_date ? `Next bill ${day(e.next_due_date)}` : ""}
                        </span>
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
