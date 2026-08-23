"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  useGetOverheadCategoriesQuery,
  useGetOverheadExpenseQuery,
  useCreateOverheadExpenseMutation,
  useUpdateOverheadExpenseMutation,
  useCreateOverheadCategoryMutation,
  type OverheadCategory,
  type OverheadExpense,
} from "@/redux/api/overheadApi";

const FREQUENCIES = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "semiannual", label: "Semi-annually" },
  { id: "annual", label: "Annually" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
  { id: "one-time", label: "One-time" },
  { id: "custom", label: "Custom…" },
];

// Sentinel select value; no category id can collide with it.
const NEW_CATEGORY = "__new__";

const label = { fontSize: 12, color: "#6b6358", display: "block", marginBottom: 6 } as const;
const input = {
  width: "100%", padding: "9px 12px", fontSize: 13, color: "#1f1b16",
  background: "#fff", border: "1px solid #d9d1c2", fontFamily: "inherit",
} as const;

/** Modal chrome, shared by the loading state and the form itself. */
function Shell({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(31,27,22,.45)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ece5d4", width: "min(560px, 100%)",
        maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div className="flex items-center justify-between mb-6">
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            {title}
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer"
            style={{ background: "transparent", border: "none", color: "#8a8276" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Holds the modal open while the categories — and, when editing, the expense
 * itself — load, then mounts the form with that data already in hand. The form
 * seeds its fields from props rather than syncing them in an effect, so typing
 * is never overwritten by a query settling underneath it.
 */
export function ExpenseFormModal({
  expenseId, open, onClose,
}: { expenseId: string | null; open: boolean; onClose: () => void }) {
  const { data: cats } = useGetOverheadCategoriesQuery();
  const { data: detail } = useGetOverheadExpenseQuery(expenseId ?? "", { skip: !expenseId });

  if (!open) return null;

  const expense = expenseId ? detail?.data?.expense : undefined;
  const title = expenseId ? "Edit expense" : "Add overhead expense";

  if (!cats || (expenseId && !expense)) {
    return (
      <Shell title={title} onClose={onClose}>
        <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>
      </Shell>
    );
  }

  return (
    <ExpenseForm
      key={expenseId ?? "new"}
      expense={expense}
      categories={cats.data ?? []}
      title={title}
      onClose={onClose}
    />
  );
}

function ExpenseForm({
  expense, categories, title, onClose,
}: {
  expense?: OverheadExpense;
  categories: OverheadCategory[];
  title: string;
  onClose: () => void;
}) {
  const expenseId = expense?.id ?? null;
  const [createExpense, { isLoading: creating }] = useCreateOverheadExpenseMutation();
  const [updateExpense, { isLoading: updating }] = useUpdateOverheadExpenseMutation();

  const [form, setForm] = useState(() =>
    expense
      ? {
          name: expense.name, category_id: expense.category_id,
          amount: String(expense.amount), frequency: expense.frequency,
          interval_count: String(expense.interval_count ?? 1),
          interval_unit: expense.interval_unit ?? "month",
          start_date: String(expense.start_date).slice(0, 10),
          end_date: expense.end_date ? String(expense.end_date).slice(0, 10) : "",
          due_day: expense.due_day ? String(expense.due_day) : "",
          notes: expense.notes ?? "", effective_from: "", change_reason: "",
          active: expense.active,
        }
      : {
          name: "", category_id: categories[0]?.id ?? "", amount: "",
          frequency: "monthly", interval_count: "1", interval_unit: "month",
          start_date: "", end_date: "", due_day: "", notes: "",
          effective_from: "", change_reason: "", active: true,
        },
  );

  const originalAmount = expense ? String(expense.amount) : null;
  const amountChanged =
    originalAmount !== null && Number(originalAmount) !== Number(form.amount);

  // Inline category creation: the select swaps to a text box in place rather
  // than opening a second modal over this one.
  const [createCategory, { isLoading: savingCategory }] = useCreateOverheadCategoryMutation();
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const cancelNewCategory = () => {
    setAddingCategory(false);
    setNewCategory("");
  };

  const commitNewCategory = async () => {
    const name = newCategory.trim();
    if (!name) return cancelNewCategory();
    try {
      const res = await createCategory({ name }).unwrap();
      // The mutation invalidates OverheadCategory, so the list refetches with
      // the new row; select it so the owner can carry on filling in the form.
      setForm({ ...form, category_id: res.data.id });
      cancelNewCategory();
    } catch (err) {
      const e = err as { data?: { message?: string } };
      // Stay open with the text intact — a duplicate name is worth correcting,
      // not retyping.
      toast.error(e.data?.message ?? "Could not add the category");
    }
  };

  const submit = async (confirmDuplicate = false) => {
    const body: Record<string, unknown> = {
      name: form.name,
      category_id: form.category_id,
      amount: Number(form.amount),
      frequency: form.frequency,
      start_date: form.start_date,
      end_date: form.end_date || null,
      due_day: form.due_day ? Number(form.due_day) : null,
      notes: form.notes || null,
      confirm_duplicate: confirmDuplicate,
    };
    // Only editing can pause; a new expense is active by DB default.
    if (expenseId) body.active = form.active;
    if (form.frequency === "custom") {
      body.interval_count = Number(form.interval_count);
      body.interval_unit = form.interval_unit;
    }
    if (amountChanged) {
      body.effective_from = form.effective_from || form.start_date;
      body.change_reason = form.change_reason || null;
    }

    try {
      const res = expenseId
        ? await updateExpense({ id: expenseId, ...body }).unwrap()
        : await createExpense(body).unwrap();
      if (res.success) {
        toast.success(expenseId ? "Expense updated" : "Expense added");
        onClose();
      }
    } catch (err) {
      const e = err as { data?: { message?: string; duplicate?: boolean } };
      if (e.data?.duplicate && !confirmDuplicate) {
        if (window.confirm(e.data.message)) return submit(true);
        return;
      }
      toast.error(e.data?.message ?? "Could not save the expense");
    }
  };

  return (
    <Shell title={title} onClose={onClose}>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={label}>Expense name</label>
            <input style={input} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Condo rent" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Category</label>
              {addingCategory ? (
                <>
                  <input style={input} autoFocus value={newCategory}
                    disabled={savingCategory}
                    placeholder="e.g. Insurance"
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNewCategory(); }
                      if (e.key === "Escape") cancelNewCategory();
                    }}
                    onBlur={() => { if (!newCategory.trim()) cancelNewCategory(); }} />
                  <span style={{ fontSize: 11, color: "#8a8276", display: "block", marginTop: 5 }}>
                    {savingCategory ? "Adding…" : "Enter to add · Esc to cancel"}
                  </span>
                </>
              ) : (
                <select style={input} value={form.category_id}
                  onChange={(e) => {
                    if (e.target.value === NEW_CATEGORY) { setAddingCategory(true); return; }
                    setForm({ ...form, category_id: e.target.value });
                  }}>
                  {categories.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {/* Native separator: spans the menu's real width, unlike a
                      dashed <option>, which renders at text width. Browsers
                      without <hr>-in-<select> support just omit it. */}
                  <hr />
                  <option value={NEW_CATEGORY}>+ New category…</option>
                </select>
              )}
            </div>
            <div>
              <label style={label}>Amount (₱)</label>
              <input style={input} type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Repeats</label>
              <select style={input} value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Due day of month (optional)</label>
              <input style={input} type="number" min="1" max="31" value={form.due_day}
                onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                placeholder="e.g. 15" />
            </div>
          </div>

          {form.frequency === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Every</label>
                <input style={input} type="number" min="1" value={form.interval_count}
                  onChange={(e) => setForm({ ...form, interval_count: e.target.value })} />
              </div>
              <div>
                <label style={label}>Unit</label>
                <select style={input} value={form.interval_unit}
                  onChange={(e) => setForm({ ...form, interval_unit: e.target.value })}>
                  <option value="day">days</option>
                  <option value="week">weeks</option>
                  <option value="month">months</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Starts</label>
              <input style={input} className="dlx-date" type="date" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label style={label}>Ends (optional)</label>
              <input style={input} className="dlx-date" type="date" value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          {amountChanged && (
            <div style={{ background: "#F7F0E3", border: "1px solid #D4BFA0", padding: 16 }}>
              <p style={{ fontSize: 12.5, color: "#5a4a3a", margin: "0 0 12px" }}>
                The amount changed from ₱{originalAmount} to ₱{form.amount}. Bills already
                paid are never altered — choose when the new amount starts applying.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={label}>New amount applies from</label>
                  <input style={input} className="dlx-date" type="date" value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                </div>
                <div>
                  <label style={label}>Reason (optional)</label>
                  <input style={input} value={form.change_reason}
                    onChange={(e) => setForm({ ...form, change_reason: e.target.value })}
                    placeholder="e.g. Provider increase" />
                </div>
              </div>
            </div>
          )}

          <div>
            <label style={label}>Notes (optional)</label>
            <textarea style={{ ...input, minHeight: 72 }} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {expenseId && (
            <label className="flex items-center cursor-pointer"
              style={{ gap: 10, fontSize: 13, color: "#5a4a3a" }}>
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active — uncheck to pause this expense. Existing bills stay; no new
              ones are generated.
            </label>
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
            <button type="button" onClick={() => submit(false)}
              disabled={creating || updating} className="cursor-pointer"
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#faf7f1",
                background: "#1f1b16", border: "none", fontFamily: "inherit",
                opacity: creating || updating ? 0.6 : 1,
              }}>
              {expenseId ? "Save changes" : "Add expense"}
            </button>
          </div>
        </div>
    </Shell>
  );
}
