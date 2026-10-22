"use client";

// Cleaning Operations → Room Stock (Owner/CSR), owner MVP 2026-10-22.
//   - Restock requests from cleaners: Pending → Processing → Completed.
//     Completing one means the supplies were delivered; the server adds the
//     quantity back to the room's count.
//   - The room's supply list: what should be in the unit, how many are there
//     (last count by a cleaner), and which are low or out.

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Clock, Package, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
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

const STATUS: Record<RestockStatus, { label: string; fg: string; bg: string; dot: string; Icon: typeof Clock }> = {
  pending:    { label: "Pending",    fg: "#92400e", bg: "#fef3c7", dot: "#f59e0b", Icon: Clock },
  processing: { label: "Processing", fg: "#1e40af", bg: "#dbeafe", dot: "#3b82f6", Icon: Truck },
  completed:  { label: "Completed",  fg: "#065f46", bg: "#d1fae5", dot: "#10b981", Icon: Check },
};
const LEVEL = {
  out: { label: "Out", fg: "#b91c1c", bg: "#fee2e2" },
  low: { label: "Low", fg: "#92400e", bg: "#fef3c7" },
  ok:  { label: "OK",  fg: "#065f46", bg: "#d1fae5" },
};
const apiErr = (err: unknown, fallback: string) => (err as { data?: { error?: string } })?.data?.error || fallback;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export function RoomStockAdmin() {
  const [havenId, setHavenId] = useState<string | undefined>(undefined);
  const { data: stock, isLoading: stockLoading } = useGetRoomStockQuery(havenId ? { havenId } : undefined);
  const { data: requests = [], isLoading: reqLoading } = useGetRestockRequestsQuery(undefined, { pollingInterval: 30000 });
  const [updateRequest, { isLoading: updatingReq }] = useUpdateRestockRequestMutation();
  const [addSupply, { isLoading: adding }] = useAddRoomSupplyMutation();
  const [updateSupply] = useUpdateRoomSupplyMutation();
  const [deleteSupply] = useDeleteRoomSupplyMutation();

  const [reqFilter, setReqFilter] = useState<"open" | RestockStatus | "all">("open");
  const supplies = stock?.supplies ?? [];
  const pending = requests.filter((r) => r.status === "pending").length;
  const processing = requests.filter((r) => r.status === "processing").length;
  const lowItems = supplies.filter((s) => supplyLevel(s) !== "ok").length;
  const shownReqs = requests.filter((r) =>
    reqFilter === "all" ? true : reqFilter === "open" ? r.status !== "completed" : r.status === reqFilter);

  const move = async (r: RestockRequest, status: RestockStatus) => {
    if (status === "completed" && !window.confirm(`Mark "${r.quantity} × ${r.item_name}" as delivered? The room's count goes up by ${r.quantity}.`)) return;
    try {
      await updateRequest({ id: r.id, status }).unwrap();
      toast.success(status === "completed" ? "Marked completed — room count updated" : "Marked as processing");
    } catch (err) { toast.error(apiErr(err, "Could not update the request")); }
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

  return (
    <div className="space-y-6">
      {/* How it works */}
      <div className="border px-4 py-3 text-sm" style={{ borderColor: "#ece5d4", backgroundColor: "#FDFBF7", color: "#5a4a3a" }}>
        Cleaners count the supplies left in the room after cleaning and ask for what&apos;s low. Move each request to
        <strong> Processing</strong> when you&apos;re getting it, and <strong>Completed</strong> once it&apos;s in the room — the room&apos;s count goes back up by itself.
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Pending requests", hint: "Waiting for you", value: pending, color: "#92400e", bg: "#fef3c7", onClick: () => setReqFilter("pending") },
          { label: "Processing", hint: "Being delivered", value: processing, color: "#1e40af", bg: "#dbeafe", onClick: () => setReqFilter("processing") },
          { label: "Low or out in the room", hint: "From the last count", value: lowItems, color: "#b91c1c", bg: "#fee2e2", onClick: () => undefined },
        ].map((c) => (
          <button key={c.label} type="button" onClick={c.onClick} className="border p-4 text-left cursor-pointer"
            style={{ backgroundColor: c.value > 0 ? c.bg : "#fff", borderColor: c.value > 0 ? c.color : "#ece5d4" }}>
            <p style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 26, fontWeight: 500, lineHeight: 1, color: c.value > 0 ? c.color : "#1f1b16" }}>{c.value}</p>
            <p className="text-sm font-semibold mt-2" style={{ color: "#1f1b16" }}>{c.label}</p>
            <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{c.value > 0 ? c.hint : "All clear"}</p>
          </button>
        ))}
      </div>

      {/* Requests */}
      <div className="border" style={{ borderColor: "#ece5d4" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "#ece5d4", backgroundColor: "#FAF7F1" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#1f1b16" }}>Restock requests</h3>
          <div className="flex flex-wrap gap-1.5">
            {([["open", "Open"], ["pending", "Pending"], ["processing", "Processing"], ["completed", "Completed"], ["all", "All"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setReqFilter(id)}
                className="px-3 py-1 text-xs font-medium border cursor-pointer"
                style={{ backgroundColor: reqFilter === id ? "#1f1b16" : "#fff", color: reqFilter === id ? "#fff" : "#6b6358", borderColor: reqFilter === id ? "#1f1b16" : "#ece5d4" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {reqLoading ? (
          <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>Loading requests…</p>
        ) : shownReqs.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>No requests here.</p>
        ) : shownReqs.map((r, i) => {
          const st = STATUS[r.status];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              style={{ borderTop: i ? "1px solid #F7F0E3" : "none", boxShadow: r.status !== "completed" ? `inset 3px 0 0 ${st.dot}` : undefined }}>
              <div className="flex-1 min-w-[14rem]">
                <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                  {r.quantity} × {r.item_name}{r.unit_type ? <span style={{ color: "#8B6344", fontWeight: 400 }}> ({r.unit_type})</span> : null}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>
                  {r.room_name ?? "Room"} · by {r.requested_by_name ?? "staff"} · {when(r.requested_at)}
                  {r.status === "completed" && r.completed_at ? ` · delivered ${when(r.completed_at)}${r.handled_by_name ? ` by ${r.handled_by_name}` : ""}` : ""}
                </p>
                {r.note && <p className="text-xs mt-1" style={{ color: "#5b21b6" }}>“{r.note}”</p>}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg, color: st.fg }}>
                <st.Icon className="w-3.5 h-3.5" />{st.label}
              </span>
              <div className="flex items-center gap-2">
                {r.status === "pending" && (
                  <button type="button" disabled={updatingReq} onClick={() => move(r, "processing")}
                    className="px-3 py-1.5 text-xs font-semibold border cursor-pointer disabled:opacity-50" style={{ color: "#1e40af", borderColor: "#bfdbfe", backgroundColor: "#eff6ff" }}>
                    Start processing
                  </button>
                )}
                {r.status !== "completed" && (
                  <button type="button" disabled={updatingReq} onClick={() => move(r, "completed")}
                    className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#059669" }}>
                    Mark completed
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Room supplies */}
      <div className="border" style={{ borderColor: "#ece5d4" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "#ece5d4", backgroundColor: "#FAF7F1" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#1f1b16" }}>
            Supplies in the room{stock?.haven ? ` · ${stock.haven.name}` : ""}
          </h3>
          {(stock?.havens?.length ?? 0) > 1 && (
            <select value={stock?.haven?.id ?? ""} onChange={(e) => setHavenId(e.target.value)}
              className="text-sm border px-2 py-1" style={{ borderColor: "#ece5d4" }}>
              {stock!.havens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </div>

        {stockLoading ? (
          <p className="px-4 py-6 text-sm" style={{ color: "#8B6344" }}>Loading supplies…</p>
        ) : supplies.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Package className="w-8 h-8 mx-auto mb-2" style={{ color: "#B07848" }} />
            <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>No supply list yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: "#8B6344" }}>Start with a ready-made list (toilet paper, soap, towels, water…) and adjust it, or add items one by one below.</p>
            <button type="button" onClick={onStarter} disabled={adding}
              className="px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#1f1b16" }}>
              Add starter list
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ece5d4" }}>
                  {["Item", "In the room", "Full stock", "Level", "Last counted", ""].map((h) => (
                    <th key={h} className={th} style={{ color: "#8a6a2f" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplies.map((s) => {
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
                        {s.open_request_qty > 0 && <span className="block text-xs mt-0.5" style={{ color: "#1e40af" }}>{s.open_request_qty} requested</span>}
                      </td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: "#1f1b16" }}>{s.current_quantity}</td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <input type="number" min={0} value={editing.par} onChange={(e) => setEditing({ ...editing, par: e.target.value })} className="border px-2 py-1 text-sm w-16" style={{ borderColor: "#D4BFA0" }} />
                        ) : <span style={{ color: "#5a4a3a" }}>{s.par_quantity}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: lv.bg, color: lv.fg }}>{lv.label}</span>
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
            className="border px-3 py-2 text-sm flex-1 min-w-[12rem]" style={{ borderColor: "#ece5d4" }} />
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Unit" title="Unit (pcs, rolls, bottles…)"
            className="border px-3 py-2 text-sm w-24" style={{ borderColor: "#ece5d4" }} />
          <input type="number" min={0} value={newPar} onChange={(e) => setNewPar(e.target.value)} title="How many when fully stocked"
            className="border px-3 py-2 text-sm w-20" style={{ borderColor: "#ece5d4" }} />
          <button type="button" onClick={onAdd} disabled={adding}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#1f1b16" }}>
            <Plus className="w-4 h-4" />Add item
          </button>
          <span className="text-xs w-full" style={{ color: "#8B6344" }}>The number is how many the room should have when fully stocked.</span>
        </div>
      </div>
    </div>
  );
}
