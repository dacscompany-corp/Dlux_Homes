"use client";

import { useState } from "react";
import { LayoutDashboard, Receipt, Wallet } from "lucide-react";
import { ExpenseList } from "./ExpenseList";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { PeriodQueue } from "./PeriodQueue";
import { OverheadDashboard } from "./OverheadDashboard";
import { MonthNavigator, currentMonthKey } from "@/components/admin/owners/MonthNavigator";
import { useGetOverheadPeriodsQuery } from "@/redux/api/overheadApi";

type Tab = "dashboard" | "expenses" | "payments";

// Each tab says what it is for in one line, so the owner never has to guess
// which screen does what.
const TABS: { id: Tab; label: string; icon: React.ElementType; about: string }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard,
    about: "How much running the unit costs this month, what's paid, and how it compares with earlier months." },
  { id: "payments", label: "Bills to pay", icon: Wallet,
    about: "Every bill due this month. Record a payment when you pay one, or correct the amount if the bill was different." },
  { id: "expenses", label: "All expenses", icon: Receipt,
    about: "The list of regular bills (rent, internet, association dues…) and one-off purchases. Add or change them here." },
];

export default function OverheadSection() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [month, setMonth] = useState<string | null>(() => currentMonthKey());

  // Overview and Bills to pay always look at one month; only All expenses can
  // also show "All time".
  const singleMonth = month ?? currentMonthKey();
  const { data: periodsRes } = useGetOverheadPeriodsQuery({ month: singleMonth });
  const periods = periodsRes?.data ?? [];
  const toPay = periods.filter((p) => p.display_status === "due" || p.display_status === "overdue" || p.display_status === "scheduled").length;
  const overdue = periods.filter((p) => p.display_status === "overdue").length;

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      {/* The browser draws the date field's calendar button in a washed-out
          grey that disappears against our cream inputs. Tint it to the accent
          brown so it reads as a control. Same treatment as NewBookingWizard;
          declared once here because it covers every modal below this tree. */}
      <style>{`
        .dlx-date::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(0deg);
          opacity: 1;
          cursor: pointer;
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap mb-2" style={{ gap: 12 }}>
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            const badge = t.id === "payments" && toPay > 0 ? toPay : null;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
                style={{
                  backgroundColor: on ? "#1f1b16" : "transparent",
                  color: on ? "#faf7f1" : "#6b6358",
                  border: `1px solid ${on ? "#1f1b16" : "#d9d1c2"}`,
                  fontWeight: on ? 500 : 400,
                }}>
                <Icon className="w-4 h-4" style={{ opacity: on ? 1 : 0.7 }} />
                {t.label}
                {badge !== null && (
                  <span title={overdue ? `${overdue} overdue` : `${badge} still to pay`}
                    style={{
                      minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: overdue ? "#b85a4a" : "#d4a96a", color: "#fff",
                    }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* One month picker for every tab, so the month you're looking at is
            always visible and the same everywhere. */}
        <MonthNavigator
          value={tab === "expenses" ? month : singleMonth}
          onChange={(m) => setMonth(tab === "expenses" ? m : m ?? currentMonthKey())}
          monthsWithData={[]}
        />
      </div>
      <p style={{ fontSize: 13, color: "#8a8276", margin: "0 0 20px" }}>{current.about}</p>

      {tab === "expenses" && (
        <ExpenseList
          month={month}
          onEdit={(id) => { setEditingId(id); setFormOpen(true); }}
          onCreate={() => { setEditingId(null); setFormOpen(true); }}
        />
      )}

      {tab === "dashboard" && <OverheadDashboard month={singleMonth} onGoToPayments={() => setTab("payments")} />}
      {tab === "payments" && <PeriodQueue month={singleMonth} />}

      <ExpenseFormModal
        expenseId={editingId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
