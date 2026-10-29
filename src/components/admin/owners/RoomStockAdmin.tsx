"use client";

// Cleaning Operations → Room Stock (Owner/CSR), owner MVP 2026-10-22; made
// simpler 2026-10-29 ("much more easy to use"):
//   - Orders: each time a cleaner sends a request it shows as ONE card with all
//     its items, moved along with one tap — Getting it → Delivered. Delivering
//     adds the quantities back to the room's count (server side).
//   - Shopping list: everything still to get, added up per item.
//   - The room's supply list: what should be in the unit, how many are there
//     (last count by a cleaner), and which are low or out.

import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, ClipboardList, Clock, Package, Pencil, Plus, ShoppingCart, Trash2, Truck, X } from "lucide-react";
import {
  supplyLevel,
  useAddRoomSupplyMutation,
  useDeleteRoomSupplyMutation,
  useGetRestockRequestsQuery,
  useGetRoomStockQuery,
  useUpdateRestockRequestMutation,
  useUpdateRoomSupplyMutation,
  type RestockRequest,
  type RestockStatus,
  type RoomSupply,
} from "@/redux/api/cleanersApi";

// Same words the cleaner sees for their request.
const STATUS: Record<RestockStatus, { label: string; fg: string; bg: string; dot: string; Icon: typeof Clock }> = {
  pending:    { label: "New",        fg: "#92400e", bg: "#fef3c7", dot: "#f59e0b", Icon: Clock },
  processing: { label: "On the way", fg: "#1e40af", bg: "#dbeafe", dot: "#3b82f6", Icon: Truck },
  completed:  { label: "Delivered",  fg: "#065f46", bg: "#d1fae5", dot: "#10b981", Icon: Check },
};
const LEVEL = {
  out: { label: "Out", fg: "#b91c1c", bg: "#fee2e2" },
  low: { label: "Low", fg: "#92400e", bg: "#fef3c7" },
  ok:  { label: "OK",  fg: "#065f46", bg: "#d1fae5" },
};
const RANK: Record<RestockStatus, number> = { pending: 0, processing: 1, completed: 2 };
const apiErr = (err: unknown, fallback: string) => (err as { data?: { error?: string } })?.data?.error || fallback;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

type Order = { key: string; at: string; by: string; room: string; note: string | null; items: RestockRequest[]; status: RestockStatus };

/** One send from a cleaner = one order: its rows share the same time, requester and room. */
function toOrders(requests: RestockRequest[]): Order[] {
  const orders: Order[] = [];
  for (const r of requests) {
    const key = `${r.requested_at}|${r.requested_by_name ?? ""}|${r.haven_id}`;
    const o = orders.find((x) => x.key === key);
    if (o) o.items.push(r);
    else orders.push({ key, at: r.requested_at, by: r.requested_by_name ?? "Staff", room: r.room_name ?? "Room", note: r.note, items: [r], status: r.status });
  }
  // An order is as far along as its least-advanced item.
  for (const o of orders) o.status = o.items.reduce<RestockStatus>((s, r) => (RANK[r.status] < RANK[s] ? r.status : s), "completed");
  return orders;
}

export function RoomStockAdmin() {
  const [havenId, setHavenId] = useState<string | undefined>(undefined);
  const { data: stock, isLoading: stockLoading, isError: stockFailed, refetch: refetchStock } = useGetRoomStockQuery(havenId ? { havenId } : undefined);
  const { data: requests = [], isLoading: reqLoading, isError: reqFailed, refetch: refetchReqs } = useGetRestockRequestsQuery(undefined, { pollingInterval: 30000 });
  const [updateRequest] = useUpdateRestockRequestMutation();
  const [addSupply, { isLoading: adding }] = useAddRoomSupplyMutation();
  const [updateSupply] = useUpdateRoomSupplyMutation();
  const [deleteSupply] = useDeleteRoomSupplyMutation();

  const [view, setView] = useState<"open" | "delivered">("open");
  const [lowOnly, setLowOnly] = useState(false);
  const suppliesRef = useRef<HTMLDivElement>(null);
  const supplies = stock?.supplies ?? [];
  const orders = useMemo(() => toOrders(requests), [requests]);
  const openOrders = orders.filter((o) => o.status !== "completed");
  const newCount = orders.filter((o) => o.status === "pending").length;
  const onTheWay = orders.filter((o) => o.status === "processing").length;
  const lowItems = supplies.filter((s) => supplyLevel(s) !== "ok").length;
  const shownOrders = view === "open" ? openOrders : orders.filter((o) => o.status === "completed").slice(0, 30);
  const shownSupplies = lowOnly ? supplies.filter((s) => supplyLevel(s) !== "ok") : supplies;
  // Where an item's open request stands: On the way if any of it is being got.
  const requestStatusOf = (s: RoomSupply): RestockStatus | null => {
    const open = requests.filter((r) => r.room_supply_id === s.id && r.status !== "completed");
    if (!open.length) return null;
    return open.some((r) => r.status === "processing") ? "processing" : "pending";
  };

  // Everything still to get, added up per item.
  const shopping = useMemo(() => {
    const m = new Map<string, { name: string; unit: string | null; qty: number }>();
    for (const r of requests) {
      if (r.status === "completed") continue;
      const k = `${r.item_name.toLowerCase()}|${r.unit_type ?? ""}`;
      const cur = m.get(k);
      if (cur) cur.qty += r.quantity;
      else m.set(k, { name: r.item_name, unit: r.unit_type, qty: r.quantity });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);

  // Moving orders along. `busyKey` keeps a double click from sending twice;
  // `confirmKey` is the inline "tap again to confirm" for Delivered.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const moveItems = async (key: string, items: RestockRequest[], status: RestockStatus) => {
    const todo = items.filter((r) => RANK[r.status] < RANK[status]);
    if (!todo.length) return;
    setBusyKey(key);
    try {
      for (const r of todo) await updateRequest({ id: r.id, status }).unwrap();
      toast.success(status === "completed" ? "Delivered — room count updated" : "Marked as on the way");
    } catch (err) {
      toast.error(apiErr(err, "Could not update the request"));
    } finally {
      setBusyKey(null);
      setConfirmKey(null);
    }
  };
  const deliver = (key: string, items: RestockRequest[]) => {
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    void moveItems(key, items, "completed");
  };

  // Add-item form
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newPar, setNewPar] = useState("2");
  const onAdd = async () => {
    if (!newName.trim()) { toast.error("Type the item name"); return; }
    try {
      await addSupply({ havenId: stock?.haven?.id, itemName: newName.trim(), unitType: newUnit.trim() || "pcs", parQuantity: Number(newPar) || 0 }).unwrap();
      setNewName(""); setNewPar("2");
      toast.success("Item added");
    } catch (err) { toast.error(apiErr(err, "Could not add the item")); }
  };
  const onStarter = async () => {
    try {
      const res = await addSupply({ havenId: stock?.haven?.id, starter: true }).unwrap();
      toast.success(`${res.added} items added — edit any amount to match your unit`);
    } catch (err) { toast.error(apiErr(err, "Could not add the starter list")); }
  };

  // Inline edit
  const [editing, setEditing] = useState<{ id: string; name: string; unit: string; par: string } | null>(null);
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateSupply({ id: editing.id, itemName: editing.name, unitType: editing.unit, parQuantity: Number(editing.par) }).unwrap();
      setEditing(null);
      toast.success("Item updated");
    } catch (err) { toast.error(apiErr(err, "Could not save the item")); }
  };
  const onDelete = async (s: RoomSupply) => {
    if (!window.confirm(`Remove "${s.item_name}" from the room list? Past requests keep their record.`)) return;
    try { await deleteSupply(s.id).unwrap(); toast.success("Item removed"); }
    catch (err) { toast.error(apiErr(err, "Could not remove the item")); }
  };

  const th = "text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider";

  if ((stockFailed && !stock) || (reqFailed && requests.length === 0)) {
    return (
      <div role="alert" className="flex items-center gap-3 border px-4 py-3 text-sm" style={{ backgroundColor: "#fef3c7", borderColor: "#f5d9a8", color: "#92400e" }}>
        <span className="flex-1">Couldn&apos;t load Room Stock. If this keeps happening, the Room Stock tables may be missing — run <code>npm run db:setup</code>.</span>
        <button type="button" onClick={() => { refetchStock(); refetchReqs(); }} className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: "#92400e" }}>Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* At a glance — each tile takes you to what it counts. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "New requests", hint: "Waiting for you", value: newCount, color: "#92400e", bg: "#fef3c7", onClick: () => setView("open") },
          { label: "On the way", hint: "You're getting these", value: onTheWay, color: "#1e40af", bg: "#dbeafe", onClick: () => setView("open") },
          { label: "Low or out in the room", hint: "From the last count", value: lowItems, color: "#b91c1c", bg: "#fee2e2",
            onClick: () => { setLowOnly(true); suppliesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } },
        ].map((c) => (
          <button key={c.label} type="button" onClick={c.onClick} className="border p-4 text-left cursor-pointer rounded-xl"
            style={{ backgroundColor: c.value > 0 ? c.bg : "#fff", borderColor: c.value > 0 ? c.color : "#ece5d4" }}>
            <p style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 26, fontWeight: 500, lineHeight: 1, color: c.value > 0 ? c.color : "#1f1b16" }}>{c.value}</p>
            <p className="text-sm font-semibold mt-2" style={{ color: "#1f1b16" }}>{c.label}</p>
            <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{c.value > 0 ? c.hint : "All clear"}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Orders */}
        <div className="lg:col-span-2 border rounded-xl overflow-hidden" style={{ borderColor: "#ece5d4" }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "#ece5d4", backgroundColor: "#FAF7F1" }}>
            <h3 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: "#1f1b16" }}>
              <ClipboardList className="w-4 h-4" style={{ color: "#B07848" }} />Requests from cleaners
            </h3>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              {([["open", `To do (${openOrders.length})`], ["delivered", "Delivered"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setView(id)}
                  className="px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  style={{ backgroundColor: view === id ? "#1f1b16" : "#fff", color: view === id ? "#fff" : "#6b6358" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {reqLoading ? (
            <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>Loading requests…</p>
          ) : shownOrders.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Check className="w-7 h-7 mx-auto mb-2" style={{ color: "#059669" }} />
              <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>{view === "open" ? "Nothing to do" : "No deliveries yet"}</p>
              <p className="text-xs mt-1" style={{ color: "#8B6344" }}>{view === "open" ? "When a cleaner asks for supplies, it shows up here." : "Delivered requests are listed here."}</p>
            </div>
          ) : shownOrders.map((o, i) => {
            const st = STATUS[o.status];
            const open = o.items.filter((r) => r.status !== "completed");
            const busy = busyKey === o.key;
            return (
              <div key={o.key} className="px-4 py-4" style={{ borderTop: i ? "1px solid #F7F0E3" : "none", boxShadow: o.status !== "completed" ? `inset 4px 0 0 ${st.dot}` : undefined }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg, color: st.fg }}>
                    <st.Icon className="w-3.5 h-3.5" />{st.label}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "#1f1b16" }}>{o.by}</span>
                  <span className="text-xs" style={{ color: "#8B6344" }}>· {o.room} · {when(o.at)}</span>
                </div>

                <ul className="mt-2.5 space-y-1.5">
                  {o.items.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-right font-semibold" style={{ color: "#1f1b16" }}>{r.quantity}</span>
                      <span style={{ color: "#8B6344" }}>×</span>
                      <span className="flex-1 min-w-0" style={{ color: r.status === "completed" ? "#A89080" : "#1a1a1a", textDecoration: r.status === "completed" && o.status !== "completed" ? "line-through" : "none" }}>
                        {r.item_name}{r.unit_type ? <span style={{ color: "#8B6344" }}> ({r.unit_type})</span> : null}
                      </span>
                      {/* Part of an order can be delivered on its own. */}
                      {open.length > 1 && r.status !== "completed" && (
                        <button type="button" disabled={busy} onClick={() => moveItems(o.key, [r], "completed")} title="Delivered just this item"
                          className="text-xs font-semibold px-2 py-0.5 rounded border cursor-pointer disabled:opacity-50" style={{ color: "#065f46", borderColor: "#a7f3d0", backgroundColor: "#ecfdf5" }}>
                          ✓ Delivered
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {o.note && <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ color: "#5b21b6", backgroundColor: "#f5f3ff" }}>“{o.note}”</p>}
                {o.status === "completed" && (
                  <p className="text-xs mt-2" style={{ color: "#8B6344" }}>
                    Delivered {when(o.items[0].completed_at)}{o.items[0].handled_by_name ? ` by ${o.items[0].handled_by_name}` : ""}
                  </p>
                )}

                {o.status !== "completed" && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {o.status === "pending" && (
                      <button type="button" disabled={busy} onClick={() => moveItems(o.key, o.items, "processing")}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ color: "#1e40af", borderColor: "#bfdbfe", backgroundColor: "#eff6ff" }}>
                        <Truck className="w-4 h-4" />I&apos;m getting it
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => deliver(o.key, open)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: confirmKey === o.key ? "#065f46" : "#059669" }}>
                      <Check className="w-4 h-4" />
                      {busy ? "Saving…" : confirmKey === o.key ? "Tap again to confirm" : open.length > 1 ? "All delivered" : "Delivered"}
                    </button>
                    {confirmKey === o.key && !busy && (
                      <>
                        <span className="text-xs" style={{ color: "#5a4a3a" }}>Adds {open.map((r) => `${r.quantity} ${r.item_name}`).join(", ")} to the room&apos;s count.</span>
                        <button type="button" onClick={() => setConfirmKey(null)} className="text-xs underline cursor-pointer" style={{ color: "#8B6344" }}>Cancel</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Shopping list */}
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: "#ece5d4" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "#ece5d4", backgroundColor: "#FAF7F1" }}>
            <h3 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: "#1f1b16" }}>
              <ShoppingCart className="w-4 h-4" style={{ color: "#B07848" }} />Shopping list
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>Everything still to get, added up.</p>
          </div>
          {shopping.length === 0 ? (
            <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>Nothing to buy right now.</p>
          ) : (
            <ul>
              {shopping.map((s, i) => (
                <li key={`${s.name}|${s.unit}`} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ borderTop: i ? "1px solid #F7F0E3" : "none" }}>
                  <span className="flex-1 min-w-0" style={{ color: "#1a1a1a" }}>{s.name}</span>
                  <span className="font-semibold" style={{ color: "#1f1b16" }}>{s.qty}{s.unit ? ` ${s.unit}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Room supplies */}
      <div ref={suppliesRef} className="border rounded-xl overflow-hidden" style={{ borderColor: "#ece5d4", scrollMarginTop: 80 }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "#ece5d4", backgroundColor: "#FAF7F1" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#1f1b16" }}>
            Supplies in the room{stock?.haven ? ` · ${stock.haven.name}` : ""}
          </h3>
          <div className="flex items-center gap-2">
            {supplies.length > 0 && (
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
                {([[false, "All"], [true, `Low or out (${lowItems})`]] as const).map(([v, label]) => (
                  <button key={String(v)} type="button" onClick={() => setLowOnly(v)}
                    className="px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    style={{ backgroundColor: lowOnly === v ? "#1f1b16" : "#fff", color: lowOnly === v ? "#fff" : "#6b6358" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(stock?.havens?.length ?? 0) > 1 && (
              <select value={stock?.haven?.id ?? ""} onChange={(e) => setHavenId(e.target.value)}
                className="text-sm border px-2 py-1 rounded-lg" style={{ borderColor: "#ece5d4" }}>
                {stock!.havens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {stockLoading ? (
          <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>Loading supplies…</p>
        ) : supplies.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Package className="w-8 h-8 mx-auto mb-2" style={{ color: "#B07848" }} />
            <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>No supply list yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: "#8B6344" }}>Start with a ready-made list (toilet paper, soap, towels, water…) and adjust it, or add items one by one below.</p>
            <button type="button" onClick={onStarter} disabled={adding}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#1f1b16" }}>
              Add starter list
            </button>
          </div>
        ) : shownSupplies.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: "#065f46" }}>Everything in the room is fully stocked.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ece5d4" }}>
                  {["Item", "In the room", "Full stock", "Status", "Last counted", ""].map((h) => (
                    <th key={h} className={th} style={{ color: "#8a6a2f" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownSupplies.map((s) => {
                  const lv = LEVEL[supplyLevel(s)];
                  const isEditing = editing?.id === s.id;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F7F0E3" }}>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="border px-2 py-1 text-sm w-40" style={{ borderColor: "#D4BFA0" }} />
                            <input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className="border px-2 py-1 text-sm w-20" style={{ borderColor: "#D4BFA0" }} />
                          </div>
                        ) : (
                          <span style={{ color: "#1a1a1a" }}>{s.item_name} <span style={{ color: "#8B6344" }}>({s.unit_type})</span></span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: "#1f1b16" }}>{s.current_quantity}</td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <input type="number" min={0} value={editing.par} onChange={(e) => setEditing({ ...editing, par: e.target.value })} className="border px-2 py-1 text-sm w-16" style={{ borderColor: "#D4BFA0" }} />
                        ) : <span style={{ color: "#5a4a3a" }}>{s.par_quantity}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: lv.bg, color: lv.fg }}>{lv.label}</span>
                          {(() => {
                            const rs = requestStatusOf(s);
                            if (!rs) return null;
                            const st = STATUS[rs];
                            return (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: st.bg, color: st.fg }}>
                                <st.Icon className="w-3 h-3" />{rs === "pending" ? "Requested" : st.label} · {s.open_request_qty}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "#8B6344" }}>
                        {s.last_counted_at ? `${when(s.last_counted_at)}${s.last_counted_by_name ? ` · ${s.last_counted_by_name}` : ""}` : "Not counted yet"}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isEditing ? (<>
                          <button type="button" onClick={saveEdit} className="text-xs font-semibold cursor-pointer mr-3" style={{ color: "#059669" }}>Save</button>
                          <button type="button" onClick={() => setEditing(null)} title="Cancel" className="cursor-pointer align-middle" style={{ color: "#8B6344" }}><X className="w-4 h-4" /></button>
                        </>) : (<>
                          <button type="button" title="Edit" onClick={() => setEditing({ id: s.id, name: s.item_name, unit: s.unit_type, par: String(s.par_quantity) })} className="cursor-pointer mr-3" style={{ color: "#8B6344" }}><Pencil className="w-4 h-4" /></button>
                          <button type="button" title="Remove" onClick={() => onDelete(s)} className="cursor-pointer" style={{ color: "#dc2626" }}><Trash2 className="w-4 h-4" /></button>
                        </>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add item */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t" style={{ borderColor: "#ece5d4", backgroundColor: "#FDFBF7" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New item (e.g. Hand soap)"
            className="border px-3 py-2 text-sm flex-1 min-w-[12rem] rounded-lg" style={{ borderColor: "#ece5d4" }} />
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Unit" title="Unit (pcs, rolls, bottles…)"
            className="border px-3 py-2 text-sm w-24 rounded-lg" style={{ borderColor: "#ece5d4" }} />
          <input type="number" min={0} value={newPar} onChange={(e) => setNewPar(e.target.value)} title="How many when fully stocked"
            className="border px-3 py-2 text-sm w-20 rounded-lg" style={{ borderColor: "#ece5d4" }} />
          <button type="button" onClick={onAdd} disabled={adding}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#1f1b16" }}>
            <Plus className="w-4 h-4" />Add item
          </button>
          <span className="text-xs w-full" style={{ color: "#8B6344" }}>The number is how many the room should have when fully stocked.</span>
        </div>
      </div>
    </div>
  );
}
