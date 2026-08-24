"use client";

import { useState } from "react";
import { LayoutDashboard, Receipt, Wallet } from "lucide-react";
import { ExpenseList } from "./ExpenseList";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { PeriodQueue } from "./PeriodQueue";
import { OverheadDashboard } from "./OverheadDashboard";
import { currentMonthKey } from "@/components/admin/owners/MonthNavigator";

type Tab = "dashboard" | "expenses" | "payments";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "payments", label: "Payments", icon: Wallet },
];

export default function OverheadSection() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [month, setMonth] = useState<string | null>(() => currentMonthKey());

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
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
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
            </button>
          );
        })}
      </div>

      {tab === "expenses" && (
        <ExpenseList
          month={month}
          onMonthChange={setMonth}
          onEdit={(id) => { setEditingId(id); setFormOpen(true); }}
          onCreate={() => { setEditingId(null); setFormOpen(true); }}
        />
      )}

      {tab === "dashboard" && <OverheadDashboard month={month ?? currentMonthKey()} />}
      {tab === "payments" && <PeriodQueue month={month ?? currentMonthKey()} />}

      <ExpenseFormModal
        expenseId={editingId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
