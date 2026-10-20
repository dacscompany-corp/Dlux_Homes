"use client";

import { useState } from "react";
import {
  useGetOverheadPeriodsQuery,
  type OverheadPeriod,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";
import { PaymentModal } from "./PaymentModal";
import { AmountModal } from "./AmountModal";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const STATUS_TONE: Record<string, { c: string; bg: string; dot: string; label: string }> = {
  paid:      { c: "#4a6a3a", bg: "#eef2e6", dot: "#7a8c5a", label: "Paid" },
  overdue:   { c: "#9a4a3a", bg: "#fbecea", dot: "#b85a4a", label: "Overdue" },
  due:       { c: "#8a6a2f", bg: "#f7f0e3", dot: "#d4a96a", label: "Due soon" },
  scheduled: { c: "#6b6358", bg: "#f5f2ec", dot: "#c9c1b2", label: "Upcoming" },
  cancelled: { c: "#8a8276", bg: "#f5f2ec", dot: "#c9c1b2", label: "Cancelled" },
};

// Most urgent first: overdue, then due soon, upcoming, paid, cancelled.
const URGENCY: Record<string, number> = { overdue: 0, due: 1, scheduled: 2, paid: 3, cancelled: 4 };

/** "Oct 25" plus how far off it is, in words. */
function dueText(dueDate: string, status: string): { date: string; rel: string | null } {
  const ymd = String(dueDate).slice(0, 10);
  const due = new Date(ymd + "T00:00:00");
  const date = due.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  if (status === "paid" || status === "cancelled") return { date, rel: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days === 0) return { date, rel: "due today" };
  if (days === 1) return { date, rel: "due tomorrow" };
  if (days > 1) return { date, rel: `in ${days} days` };
  return { date, rel: `${-days} day${days === -1 ? "" : "s"} late` };
}

export function PeriodQueue({ month }: { month: string }) {
  const { data, isLoading } = useGetOverheadPeriodsQuery({ month });
  const [active, setActive] = useState<OverheadPeriod | null>(null);
  const [editing, setEditing] = useState<OverheadPeriod | null>(null);
  const rows = [...(data?.data ?? [])].sort((a, b) =>
    (URGENCY[a.display_status] ?? 9) - (URGENCY[b.display_status] ?? 9) ||
    String(a.due_date).localeCompare(String(b.due_date)));
  const open = rows.filter((p) => p.display_status !== "paid" && p.display_status !== "cancelled");
  const leftToPay = open.reduce((n, p) => n + Math.max(0, Number(p.amount_due) - Number(p.amount_paid)), 0);
  const overdueRows = open.filter((p) => p.display_status === "overdue");
  const paidCount = rows.filter((p) => p.display_status === "paid").length;

  return (
    <div>
      {isLoading && <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <Empty label="Nothing due in this month." />
      )}

      {/* The answer to "what do I still owe this month?" before the list. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center mb-4" style={{ gap: 10 }}>
          <div style={{ padding: "10px 14px", background: "#fff", border: "1px solid #ece5d4" }}>
            <div style={{ fontSize: 11.5, color: "#8a8276" }}>Still to pay</div>
            <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 18, color: "#1f1b16" }}>{peso(leftToPay)}</div>
          </div>
          <div style={{ padding: "10px 14px", background: "#fff", border: "1px solid #ece5d4", fontSize: 13, color: "#5a4a3a" }}>
            <strong>{open.length}</strong> unpaid · <strong>{paidCount}</strong> paid
          </div>
          {overdueRows.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fbecea", border: "1px solid #e3c9c2", fontSize: 13, color: "#9a4a3a" }}>
              <strong>{overdueRows.length}</strong> overdue — shown first
            </div>
          )}
          {open.length === 0 && (
            <div style={{ padding: "10px 14px", background: "#eef2e6", border: "1px solid #cfd8bf", fontSize: 13, color: "#4a6a3a" }}>
              Everything for this month is paid ✓
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                  {["Bill", "Due date", "Amount", "Paid so far", "Status", ""].map((h) => (
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
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3eee2", boxShadow: p.display_status === "overdue" ? "inset 3px 0 0 #b85a4a" : undefined }}>
                      <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                        {p.expense_name}
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: "#8a8276" }}>
                          {p.category_name}
                        </span>
                      </td>
                      <td className="px-6 py-3.5" style={{ fontSize: 12.5, color: "#6b6358", whiteSpace: "nowrap" }}>
                        {(() => {
                          const due = dueText(p.due_date, p.display_status);
                          return (<>
                            {due.date}
                            {due.rel && (
                              <span style={{ display: "block", fontSize: 11.5, color: p.display_status === "overdue" ? "#9a4a3a" : "#8a8276" }}>{due.rel}</span>
                            )}
                          </>);
                        })()}
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
                          style={{ gap: 7, fontSize: 12, fontWeight: 500, color: tone.c, background: tone.bg, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: tone.dot, flex: "none",
                          }} />
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {/* A bill that is monthly but never the same twice gets
                            corrected here; the expense keeps its own figure as
                            the estimate for future months. Cancelled periods
                            take neither action. */}
                        <div className="inline-flex items-center" style={{ gap: 8 }}>
                          {p.display_status !== "cancelled" && (
                            <button type="button" onClick={() => setEditing(p)}
                              className="cursor-pointer"
                              style={{
                                padding: "6px 10px", fontSize: 12, color: "#6b6358",
                                background: "#fff", border: "1px solid #d9d1c2",
                                fontFamily: "inherit",
                              }}>
                              Edit amount
                            </button>
                          )}
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
                        </div>
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
      <AmountModal period={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}
