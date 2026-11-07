"use client";

// Room Stock for cleaners (owner MVP, 2026-10-22), shared by the desktop and
// phone portals. One simple screen (2026-10-29: "much more easy to use"):
//   - On the way: their requests the office hasn't delivered yet, at the top.
//   - What's left in the room: − / + (or "Full") per supply. Anything below
//     full is added to the request automatically — no separate step.
//   - Something else: type any item not on the list.
//   - One button: "Send to office" saves the counts and sends the request
//     (or "Save count" when nothing is needed).
//   - Cleaners can add an item to the room's list or remove one (owner,
//     2026-10-29); the office is notified of every change.
//   - Quick picks (2026-11-06): one tap adds an item they often ask for that
//     isn't on the list (bed sheets, pillowcases…).
//   - Take something out (2026-11-06): report an item that has to leave the
//     room — damaged, stained, too many, expired — optionally asking for a
//     replacement in the same tap.
// Inline styles so it reads the same in both portals.

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Minus, Plus, Package, PackageMinus, Send, Check, Clock, Truck, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  supplyLevel,
  useAddRoomSupplyMutation,
  useCreateRestockRequestMutation,
  useDeleteRoomSupplyMutation,
  useGetRestockRequestsQuery,
  useGetRoomStockQuery,
  useSaveSupplyCountsMutation,
  type RestockRequest,
  type RestockStatus,
  type RoomSupply,
} from "@/redux/api/cleanersApi";

type Lang = "en" | "tl";

const COPY = {
  en: {
    title: "Room supplies",
    intro: "Count what's left. We'll ask the office for anything missing.",
    onTheWay: "Your requests",
    countTitle: "What's left in the room?",
    countHint: "Tap − or + to match what's in the room.",
    of: (n: number) => `/ ${n}`,
    willAsk: (n: number) => `Ask for ${n}`,
    asked: "Asked",
    out: "Out", low: "Low", ok: "OK",
    addItem: "Add an item to the list",
    addShort: "Add item",
    newName: "Item name (e.g. Slippers)",
    newUnit: "Unit",
    newFull: "How many when full",
    add: "Add", cancel: "Cancel",
    removeItem: (n: string) => `Remove ${n}`,
    removeAsk: (n: string) => `Remove ${n} from the list?`,
    yesRemove: "Yes, remove",
    added: (n: string) => `${n} added — the office will see it`,
    removed: (n: string) => `${n} removed — the office will see it`,
    needName: "Type the item name",
    other: "Something else?",
    otherHint: "Type any item the room needs that isn't on the list.",
    otherPh: "Item name",
    addAnother: "Add another item",
    removeLine: "Remove",
    addNote: "Add a note for the office",
    note: "Note (optional)",
    youWillAsk: "You'll ask the office for:",
    skip: "Don't ask",
    send: (n: number) => `Send to office · ${n} ${n === 1 ? "item" : "items"}`,
    saveOnly: "Save count",
    allFull: "Everything is full — nothing to send",
    sending: "Sending…",
    sent: "Sent to the office",
    saved: "Count saved",
    past: "Past requests",
    none: "No requests yet.",
    empty: "No supply list for this room yet. You can still ask for anything below.",
    loading: "Loading supplies…",
    loadFailed: "Couldn't load room supplies. Check your connection and try again.",
    retry: "Try again",
    status: { pending: "Waiting for office", processing: "On the way", completed: "Delivered" } as Record<RestockStatus, string>,
    statusOut: { pending: "Waiting for office", processing: "Office is on it", completed: "Taken out" } as Record<RestockStatus, string>,
    quick: "Quick add:",
    pullTitle: "Take something out?",
    pullHint: "Tell the office what has to leave the room — broken, stained, too many or expired.",
    pullPick: "Which item?",
    pullOther: "Other item",
    pullQty: "How many",
    pullWhy: "Why?",
    reasons: ["Damaged", "Stained / dirty", "Too many", "Expired"],
    reasonOther: "Other reason",
    replaceToo: "Also ask for a replacement",
    pullSend: (n: number, name: string) => `Send · take out ${n} × ${name}`,
    pullSent: "Sent — the office will take it out",
    pullNeedItem: "Pick the item to take out",
    pullNeedWhy: "Pick why it has to go",
    pullOff: "Taking items out isn't switched on yet — ask the office.",
    takingOut: (n: number) => `Taking out ${n}`,
    takeOut: "Take out",
  },
  tl: {
    title: "Mga supply sa kwarto",
    intro: "Bilangin ang natira. Hihingin namin sa opisina ang kulang.",
    onTheWay: "Mga hiling mo",
    countTitle: "Ano ang natira sa kwarto?",
    countHint: "Pindutin ang − o + ayon sa nasa kwarto.",
    of: (n: number) => `/ ${n}`,
    willAsk: (n: number) => `Hihingin: ${n}`,
    asked: "Nahingi na",
    out: "Ubos", low: "Kulang", ok: "OK",
    addItem: "Magdagdag ng item sa listahan",
    addShort: "Magdagdag",
    newName: "Pangalan ng item (hal. Tsinelas)",
    newUnit: "Yunit",
    newFull: "Ilan kapag puno",
    add: "Idagdag", cancel: "Kanselahin",
    removeItem: (n: string) => `Alisin ang ${n}`,
    removeAsk: (n: string) => `Alisin ang ${n} sa listahan?`,
    yesRemove: "Oo, alisin",
    added: (n: string) => `Naidagdag ang ${n} — makikita ng opisina`,
    removed: (n: string) => `Naalis ang ${n} — makikita ng opisina`,
    needName: "Isulat ang pangalan ng item",
    other: "Iba pa?",
    otherHint: "Isulat ang kailangan ng kwarto na wala sa listahan.",
    otherPh: "Pangalan ng item",
    addAnother: "Magdagdag ng item",
    removeLine: "Alisin",
    addNote: "Mag-iwan ng mensahe sa opisina",
    note: "Mensahe (opsyonal)",
    youWillAsk: "Hihingin mo sa opisina:",
    skip: "Huwag hingin",
    send: (n: number) => `Ipadala sa opisina · ${n} item`,
    saveOnly: "I-save ang bilang",
    allFull: "Kumpleto lahat — walang ipapadala",
    sending: "Ipinapadala…",
    sent: "Naipadala sa opisina",
    saved: "Na-save ang bilang",
    past: "Mga nakaraang hiling",
    none: "Wala pang hiling.",
    empty: "Wala pang listahan ng supply ang kwarto. Pwede ka pa ring humingi sa ibaba.",
    loading: "Kinukuha ang mga supply…",
    loadFailed: "Hindi makuha ang supply sa kwarto. Tingnan ang koneksyon at subukan ulit.",
    retry: "Subukan ulit",
    status: { pending: "Hinihintay ang opisina", processing: "Parating na", completed: "Naihatid na" } as Record<RestockStatus, string>,
    statusOut: { pending: "Hinihintay ang opisina", processing: "Inaasikaso na", completed: "Nailabas na" } as Record<RestockStatus, string>,
    quick: "Mabilis na idagdag:",
    pullTitle: "May ilalabas sa kwarto?",
    pullHint: "Sabihin sa opisina ang kailangang ilabas — sira, may mantsa, sobra o expired.",
    pullPick: "Aling item?",
    pullOther: "Ibang item",
    pullQty: "Ilan",
    pullWhy: "Bakit?",
    reasons: ["Sira", "May mantsa / marumi", "Sobra", "Expired"],
    reasonOther: "Ibang dahilan",
    replaceToo: "Humingi rin ng kapalit",
    pullSend: (n: number, name: string) => `Ipadala · ilabas ${n} × ${name}`,
    pullSent: "Naipadala — ilalabas ito ng opisina",
    pullNeedItem: "Piliin ang ilalabas",
    pullNeedWhy: "Piliin kung bakit",
    pullOff: "Hindi pa bukas ang paglabas ng item — sabihan ang opisina.",
    takingOut: (n: number) => `Ilalabas: ${n}`,
    takeOut: "Ilabas",
  },
};

const C = {
  ink: "#1f1b16", muted: "#8B6344", line: "#ece5d4", cream: "#FAF7F1", gold: "#B07848",
  red: "#b91c1c", redBg: "#fee2e2", amber: "#92400e", amberBg: "#fef3c7", green: "#065f46", greenBg: "#d1fae5",
  blue: "#1e40af", blueBg: "#dbeafe",
};

const STATUS_STYLE: Record<RestockStatus, { fg: string; bg: string; Icon: typeof Clock }> = {
  pending: { fg: C.amber, bg: C.amberBg, Icon: Clock },
  processing: { fg: C.blue, bg: C.blueBg, Icon: Truck },
  completed: { fg: C.green, bg: C.greenBg, Icon: Check },
};

/** One send = one group: its rows share the same time and requester. */
function groupRequests(requests: RestockRequest[]) {
  const groups: { key: string; at: string; items: RestockRequest[]; status: RestockStatus }[] = [];
  for (const r of requests) {
    const key = `${r.requested_at}|${r.requested_by_name ?? ""}|${r.haven_id}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(r);
    else groups.push({ key, at: r.requested_at, items: [r], status: r.status });
  }
  // A group is as far along as its least-advanced item.
  const rank: Record<RestockStatus, number> = { pending: 0, processing: 1, completed: 2 };
  for (const g of groups) g.status = g.items.reduce<RestockStatus>((s, r) => (rank[r.status] < rank[s] ? r.status : s), "completed");
  return groups;
}

/** Offered as one-tap quick picks (with whatever they've typed before). */
const COMMON_EXTRAS = ["Bed sheets", "Pillowcases", "Floor mat", "Hand towels", "Slippers"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function RoomStockCleaner({ lang = "en", big = false }: { lang?: Lang; big?: boolean }) {
  const t = COPY[lang];
  const { data, isLoading, isError, refetch } = useGetRoomStockQuery();
  const { data: requests = [] } = useGetRestockRequestsQuery(undefined, { pollingInterval: 60000 });
  const [saveCounts, { isLoading: saving }] = useSaveSupplyCountsMutation();
  const [createRequest, { isLoading: sending }] = useCreateRestockRequestMutation();
  const [addSupply, { isLoading: addingItem }] = useAddRoomSupplyMutation();
  const [deleteSupply, { isLoading: removingItem }] = useDeleteRoomSupplyMutation();
  // Adding an item to the room's list, and the "are you sure?" for removing one.
  const [newItem, setNewItem] = useState<{ name: string; unit: string; full: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const onAddItem = async () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (!name) { toast.error(t.needName); return; }
    try {
      await addSupply({ havenId: data?.haven?.id, itemName: name, unitType: newItem.unit.trim() || "pcs", parQuantity: newItem.full, currentQuantity: newItem.full }).unwrap();
      setNewItem(null);
      toast.success(t.added(name));
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not add the item");
    }
  };
  const onRemoveItem = async (item: RoomSupply) => {
    try {
      await deleteSupply(item.id).unwrap();
      setConfirmRemove(null);
      setDraft((d) => { const next = { ...d }; delete next[item.id]; return next; });
      toast.success(t.removed(item.item_name));
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not remove the item");
    }
  };

  const supplies = useMemo(() => data?.supplies ?? [], [data]);
  // Counts being edited, keyed by supply id; falls back to the saved count.
  const [draft, setDraft] = useState<Record<string, number>>({});
  const countOf = (s: RoomSupply) => draft[s.id] ?? s.current_quantity;
  const changed = supplies.filter((s) => draft[s.id] !== undefined && draft[s.id] !== s.current_quantity);

  // What's needed: up to full stock, less what's already on its way. The
  // cleaner can take any of it off the request.
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const needs = supplies
    .map((s) => ({ s, need: Math.max(0, s.par_quantity - countOf(s) - s.open_request_qty) }))
    .filter((x) => x.need > 0 && !skipped[x.s.id]);

  // Items typed by hand.
  const [showOther, setShowOther] = useState(false);
  const [extras, setExtras] = useState<{ name: string; qty: number }[]>([{ name: "", qty: 1 }]);
  const typed = extras.filter((e) => e.name.trim() && e.qty > 0);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [showPast, setShowPast] = useState(false);

  // Quick picks: items typed before (not on the list) + common linens.
  const quickPicks = useMemo(() => {
    const onList = new Set(supplies.map((x) => x.item_name.trim().toLowerCase()));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...requests.filter((r) => !r.room_supply_id && (r.kind ?? "restock") === "restock").map((r) => r.item_name), ...COMMON_EXTRAS]) {
      const key = name.trim().toLowerCase();
      if (!key || onList.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(name.trim().replace(/^./, (c) => c.toUpperCase()));
    }
    return out.slice(0, 8);
  }, [requests, supplies]);
  const addQuick = (name: string) => setExtras((xs) => {
    const i = xs.findIndex((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
    const blank = xs.findIndex((x) => !x.name.trim());
    if (blank >= 0) return xs.map((x, j) => (j === blank ? { name, qty: 1 } : x));
    return [...xs, { name, qty: 1 }];
  });

  // Take something out — one item per send.
  const pulloutsEnabled = data?.pulloutsEnabled !== false;
  const [showPull, setShowPull] = useState(false);
  const EMPTY_PULL = { supplyId: null as string | null, other: false, name: "", qty: 1, reason: "", otherReason: "", replace: true };
  const [pull, setPull] = useState(EMPTY_PULL);
  const resetPull = () => setPull(EMPTY_PULL);
  const pullReason = pull.reason === "__other" ? pull.otherReason.trim() : pull.reason;
  const onSendPull = async () => {
    if (!pull.name.trim()) { toast.error(t.pullNeedItem); return; }
    if (!pullReason) { toast.error(t.pullNeedWhy); return; }
    try {
      await createRequest({
        havenId: data?.haven?.id,
        kind: "pullout",
        replace: pull.replace,
        items: [{ ...(pull.supplyId ? { room_supply_id: pull.supplyId } : { item_name: pull.name.trim() }), quantity: pull.qty, reason: pullReason }],
      }).unwrap();
      toast.success(t.pullSent);
      resetPull();
      setShowPull(false);
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not send");
    }
  };

  const fs = big ? 17 : 14;
  const btnH = big ? 48 : 38;
  const requestCount = needs.length + typed.length;
  const busy = saving || sending;

  const groups = useMemo(() => groupRequests(requests), [requests]);

  // An item's request status: On the way once the office is getting any of
  // it, otherwise Waiting for office. (Asked for by someone else → waiting.)
  const requestStatusOf = (s: RoomSupply): RestockStatus | null => {
    if (s.open_request_qty <= 0) return null;
    const mine = requests.filter((r) => r.room_supply_id === s.id && r.status !== "completed");
    return mine.some((r) => r.status === "processing") ? "processing" : "pending";
  };
  const open = groups.filter((g) => g.status !== "completed");
  const past = groups.filter((g) => g.status === "completed").slice(0, 10);

  const onSubmit = async () => {
    try {
      // Counts first, so the office sees the same numbers as the request.
      if (changed.length) {
        await saveCounts(changed.map((s) => ({ id: s.id, current_quantity: countOf(s) }))).unwrap();
      }
      if (requestCount > 0) {
        await createRequest({
          havenId: data?.haven?.id,
          note: note.trim() || undefined,
          items: [
            ...needs.map(({ s, need }) => ({ room_supply_id: s.id, quantity: need })),
            ...typed.map((e) => ({ item_name: e.name.trim(), quantity: e.qty })),
          ],
        }).unwrap();
        toast.success(t.sent);
      } else {
        toast.success(t.saved);
      }
      setDraft({}); setSkipped({}); setExtras([{ name: "", qty: 1 }]); setNote("");
      setShowOther(false); setShowNote(false);
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not send");
    }
  };

  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" };
  const head = (label: string, hint?: string) => (
    <div style={{ padding: big ? "14px 16px" : "12px 16px", background: C.cream, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontWeight: 700, fontSize: fs, color: C.ink }}>{label}</div>
      {hint && <div style={{ fontSize: fs - 3, color: C.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  );
  const roundBtn = (label: string, onClick: () => void, Icon: typeof Plus) => (
    <button type="button" aria-label={label} onClick={onClick}
      style={{ width: btnH, height: btnH, borderRadius: 12, border: `1px solid ${C.line}`, background: C.cream, display: "grid", placeItems: "center", cursor: "pointer", flex: "none" }}>
      <Icon style={{ width: 18, height: 18, color: C.ink }} />
    </button>
  );
  const stepper = (value: number, onChange: (v: number) => void, label: string, min = 0) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
      {roundBtn(`${label} −`, () => onChange(Math.max(min, value - 1)), Minus)}
      <input type="number" min={min} inputMode="numeric" aria-label={label} value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10) || 0))}
        style={{ width: big ? 52 : 46, height: btnH, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: fs + 1, fontWeight: 700, color: C.ink }} />
      {roundBtn(`${label} +`, () => onChange(value + 1), Plus)}
    </div>
  );
  const statusPill = (status: RestockStatus, pullout = false) => {
    const st = STATUS_STYLE[status];
    return (
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, fontSize: fs - 4, fontWeight: 700, background: st.bg, color: st.fg }}>
        <st.Icon style={{ width: 14, height: 14 }} />{(pullout ? t.statusOut : t.status)[status]}
      </span>
    );
  };
  const itemLabel = (r: RestockRequest) =>
    r.kind === "pullout" ? `${t.takeOut}: ${r.quantity} × ${r.item_name}${r.reason ? ` (${r.reason})` : ""}` : `${r.quantity} × ${r.item_name}`;
  const groupRow = (g: (typeof groups)[number], i: number) => (
    <div key={g.key} style={{ padding: "12px 16px", borderTop: i ? `1px solid #F3EEE2` : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: fs - 3, color: C.muted }}>{when(g.at)}</span>
        {statusPill(g.status, g.items.every((r) => r.kind === "pullout"))}
      </div>
      <div style={{ fontSize: fs, fontWeight: 600, color: C.ink, marginTop: 4, lineHeight: 1.4 }}>
        {g.items.map(itemLabel).join(", ")}
      </div>
      {g.items.some((r) => r.admin_note) && (
        <div style={{ fontSize: fs - 3, color: C.muted, marginTop: 2 }}>“{g.items.find((r) => r.admin_note)?.admin_note}”</div>
      )}
    </div>
  );

  if (isLoading) return <p style={{ fontSize: fs, color: C.muted }}>{t.loading}</p>;
  // Say so plainly instead of showing an empty, unresponsive screen.
  if (isError && !data) {
    return (
      <div role="alert" style={{ background: C.amberBg, color: C.amber, borderRadius: 14, padding: 16, fontSize: fs, display: "flex", flexDirection: "column", gap: 12 }}>
        {t.loadFailed}
        <button type="button" onClick={() => refetch()}
          style={{ height: btnH, borderRadius: 12, border: 0, background: C.amber, color: "#fff", fontWeight: 700, fontSize: fs, cursor: "pointer" }}>
          {t.retry}
        </button>
      </div>
    );
  }

  const buttonLabel = busy ? t.sending : requestCount > 0 ? t.send(requestCount) : changed.length ? t.saveOnly : t.allFull;
  const canSubmit = !busy && (requestCount > 0 || changed.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Package style={{ width: 22, height: 22, color: C.gold, flex: "none", marginTop: 2 }} />
        <div>
          <div style={{ fontSize: fs + 2, fontWeight: 700, color: C.ink }}>{t.title}{data?.haven ? ` · ${data.haven.name}` : ""}</div>
          <div style={{ fontSize: fs - 1, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{t.intro}</div>
        </div>
      </div>

      {/* Requests still with the office — what they most want to know. */}
      {open.length > 0 && (
        <div style={card}>
          {head(t.onTheWay)}
          {open.map(groupRow)}
        </div>
      )}

      {/* Count — plus adding or removing an item on the list. */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: big ? "12px 16px" : "10px 16px", background: C.cream, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: fs, color: C.ink }}>{t.countTitle}</div>
            {supplies.length > 0 && <div style={{ fontSize: fs - 3, color: C.muted, marginTop: 2 }}>{t.countHint}</div>}
          </div>
          {/* Always in view at the top of the list. */}
          {!newItem && (
            <button type="button" onClick={() => { setNewItem({ name: "", unit: "pcs", full: 2 }); setConfirmRemove(null); }}
              style={{ flex: "none", height: btnH, padding: "0 14px", borderRadius: 12, border: 0, background: C.ink, color: "#fff", fontWeight: 700, fontSize: fs - 1, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus style={{ width: 18, height: 18 }} />{t.addShort}
            </button>
          )}
        </div>
        {newItem && (
          <div className="dlx-screen" style={{ padding: big ? 14 : 12, background: "#FFFDF8", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontWeight: 700, fontSize: fs - 1, color: C.ink, marginBottom: 10 }}>{t.addItem}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={newItem.name} autoFocus placeholder={t.newName} aria-label={t.newName}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                style={{ height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs, background: "#fff" }} />
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: fs - 3, color: C.muted, fontWeight: 600 }}>
                  {t.newFull}
                  {stepper(newItem.full, (v) => setNewItem({ ...newItem, full: v }), t.newFull, 1)}
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: fs - 3, color: C.muted, fontWeight: 600, flex: 1, minWidth: 90 }}>
                  {t.newUnit}
                  <input value={newItem.unit} placeholder="pcs" onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    style={{ height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs, background: "#fff", minWidth: 0 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setNewItem(null)}
                  style={{ flex: 1, height: btnH + 4, borderRadius: 12, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontWeight: 600, fontSize: fs, cursor: "pointer" }}>
                  {t.cancel}
                </button>
                <button type="button" onClick={onAddItem} disabled={addingItem}
                  style={{ flex: 2, height: btnH + 4, borderRadius: 12, border: 0, background: C.ink, color: "#fff", fontWeight: 700, fontSize: fs, cursor: "pointer", opacity: addingItem ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Plus style={{ width: 18, height: 18 }} />{t.add}
                </button>
              </div>
            </div>
          </div>
        )}
        {supplies.length === 0 && <div style={{ padding: 14, fontSize: fs - 1, color: C.muted }}>{t.empty}</div>}
        {supplies.map((s, i) => {
          const value = countOf(s);
          const level = supplyLevel({ current_quantity: value, par_quantity: s.par_quantity });
          const need = Math.max(0, s.par_quantity - value - s.open_request_qty);
          const rs = requestStatusOf(s);
          // The one thing worth knowing about this item right now.
          const status = (s.open_pullout_qty ?? 0) > 0 && !rs ? { label: t.takingOut(s.open_pullout_qty ?? 0), fg: "#5b21b6", bg: "#ede9fe" }
            : rs === "processing" ? { label: t.status.processing, fg: C.blue, bg: C.blueBg }
            : rs === "pending" ? { label: t.asked, fg: C.amber, bg: C.amberBg }
            : need > 0 && !skipped[s.id] ? { label: t.willAsk(need), fg: "#fff", bg: C.ink }
            : level === "out" ? { label: t.out, fg: C.red, bg: C.redBg }
            : level === "low" ? { label: t.low, fg: C.amber, bg: C.amberBg }
            : { label: t.ok, fg: C.green, bg: C.greenBg };
          return (
            <div key={s.id} style={{ padding: big ? "12px 16px" : "10px 16px", borderTop: i ? `1px solid #F3EEE2` : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: fs, fontWeight: 600, color: C.ink, overflowWrap: "anywhere" }}>{s.item_name}</span>
                <span style={{ flex: "none", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: status.bg, color: status.fg }}>
                  {status.label}
                </span>
                <button type="button" aria-label={t.removeItem(s.item_name)} title={t.removeItem(s.item_name)}
                  onClick={() => setConfirmRemove(confirmRemove === s.id ? null : s.id)}
                  style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: "#fff", color: C.red, display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <Trash2 style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                {/* Changing the count puts a skipped item back on the request. */}
                {stepper(value, (v) => { setDraft((d) => ({ ...d, [s.id]: v })); setSkipped((k) => ({ ...k, [s.id]: false })); }, s.item_name)}
                <span style={{ fontSize: fs - 1, color: C.muted }}>{t.of(s.par_quantity)} {s.unit_type}</span>
              </div>
              {confirmRemove === s.id && (
                <div role="alert" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: C.redBg, color: C.red, fontSize: fs - 1 }}>
                  <div style={{ fontWeight: 700 }}>{t.removeAsk(s.item_name)}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => setConfirmRemove(null)}
                      style={{ flex: 1, height: btnH, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontWeight: 600, fontSize: fs - 1, cursor: "pointer" }}>
                      {t.cancel}
                    </button>
                    <button type="button" disabled={removingItem} onClick={() => onRemoveItem(s)}
                      style={{ flex: 1, height: btnH, borderRadius: 10, border: 0, background: C.red, color: "#fff", fontWeight: 700, fontSize: fs - 1, cursor: "pointer", opacity: removingItem ? 0.7 : 1 }}>
                      {t.yesRemove}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* Something else — tucked away until needed (open by itself when there's no list). */}
      <div style={card}>
        <button type="button" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther || supplies.length === 0}
          style={{ width: "100%", padding: big ? "14px 16px" : "12px 16px", border: 0, background: C.cream, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <Plus style={{ width: 18, height: 18, color: C.gold }} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: fs, color: C.ink }}>{t.other}</span>
          {typed.length > 0 && <span style={{ fontSize: fs - 3, fontWeight: 700, color: C.gold }}>{typed.length}</span>}
          {showOther || supplies.length === 0 ? <ChevronUp style={{ width: 18, height: 18, color: C.muted }} /> : <ChevronDown style={{ width: 18, height: 18, color: C.muted }} />}
        </button>
        {(showOther || supplies.length === 0) && (
          <div style={{ padding: big ? 16 : 14, display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: fs - 2, color: C.muted }}>{t.otherHint}</div>
            {quickPicks.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: fs - 3, fontWeight: 700, color: C.muted }}>{t.quick}</span>
                {quickPicks.map((name) => (
                  <button key={name} type="button" onClick={() => addQuick(name)}
                    style={{ height: btnH - 8, padding: "0 12px", borderRadius: 999, border: `1px solid ${C.line}`, background: C.cream, color: C.ink, fontWeight: 600, fontSize: fs - 2, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Plus style={{ width: 14, height: 14, color: C.gold }} />{name}
                  </button>
                ))}
              </div>
            )}
            {extras.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input value={e.name} placeholder={t.otherPh}
                  onChange={(ev) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
                  style={{ flex: 1, minWidth: 140, height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs }} />
                {stepper(e.qty, (v) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, qty: v } : x))), `${e.name || t.otherPh}`, 1)}
                {extras.length > 1 && (
                  <button type="button" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} aria-label={t.removeLine}
                    style={{ height: btnH, padding: "0 8px", border: 0, background: "transparent", color: C.red, cursor: "pointer" }}>
                    <X style={{ width: 18, height: 18 }} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setExtras((xs) => [...xs, { name: "", qty: 1 }])}
              style={{ alignSelf: "flex-start", height: btnH - 4, padding: "0 12px", borderRadius: 10, border: `1px dashed ${C.gold}`, background: "#fff", color: C.gold, fontWeight: 600, fontSize: fs - 1, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus style={{ width: 16, height: 16 }} />{t.addAnother}
            </button>
          </div>
        )}
      </div>

      {/* Take something out — its own small form and send button. */}
      <div style={card}>
        <button type="button" onClick={() => setShowPull((v) => !v)} aria-expanded={showPull}
          style={{ width: "100%", padding: big ? "14px 16px" : "12px 16px", border: 0, background: C.cream, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <PackageMinus style={{ width: 18, height: 18, color: "#5b21b6" }} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: fs, color: C.ink }}>{t.pullTitle}</span>
          {showPull ? <ChevronUp style={{ width: 18, height: 18, color: C.muted }} /> : <ChevronDown style={{ width: 18, height: 18, color: C.muted }} />}
        </button>
        {showPull && (
          <div style={{ padding: big ? 16 : 14, display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: fs - 2, color: C.muted, lineHeight: 1.4 }}>{t.pullHint}</div>
            {!pulloutsEnabled ? (
              <div style={{ fontSize: fs - 2, color: C.amber, background: C.amberBg, borderRadius: 10, padding: "10px 12px" }}>{t.pullOff}</div>
            ) : (<>
              <div>
                <div style={{ fontSize: fs - 3, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{t.pullPick}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...supplies.map((x) => ({ id: x.id as string | null, name: x.item_name })), { id: null, name: "" }].map((o) => {
                    const on = o.id ? pull.supplyId === o.id : pull.other;
                    return (
                      <button key={o.id ?? "__other"} type="button"
                        onClick={() => setPull((p) => (o.id ? { ...p, supplyId: o.id, other: false, name: o.name } : { ...p, supplyId: null, other: true, name: "" }))}
                        aria-pressed={on}
                        style={{ height: btnH - 8, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: fs - 2,
                          border: `1.5px solid ${on ? "#5b21b6" : C.line}`, background: on ? "#ede9fe" : "#fff", color: on ? "#5b21b6" : C.ink }}>
                        {o.id ? o.name : `+ ${t.pullOther}`}
                      </button>
                    );
                  })}
                </div>
                {pull.other && (
                  <input autoFocus value={pull.name} placeholder={t.otherPh} maxLength={100}
                    onChange={(e) => setPull((p) => ({ ...p, name: e.target.value }))}
                    style={{ marginTop: 8, width: "100%", boxSizing: "border-box", height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs }} />
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: fs - 3, fontWeight: 700, color: C.muted }}>{t.pullQty}</span>
                {stepper(pull.qty, (v) => setPull((p) => ({ ...p, qty: v })), t.pullQty, 1)}
              </div>
              <div>
                <div style={{ fontSize: fs - 3, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{t.pullWhy}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...t.reasons, "__other"].map((r) => {
                    const on = pull.reason === r;
                    return (
                      <button key={r} type="button" aria-pressed={on}
                        // "Too many" means nothing to replace; the others usually do.
                        onClick={() => setPull((p) => ({ ...p, reason: r, replace: r === t.reasons[2] ? false : p.reason === t.reasons[2] ? true : p.replace }))}
                        style={{ height: btnH - 8, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: fs - 2,
                          border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.ink }}>
                        {r === "__other" ? t.reasonOther : r}
                      </button>
                    );
                  })}
                </div>
                {pull.reason === "__other" && (
                  <input value={pull.otherReason} placeholder={t.reasonOther} maxLength={200}
                    onChange={(e) => setPull((p) => ({ ...p, otherReason: e.target.value }))}
                    style={{ marginTop: 8, width: "100%", boxSizing: "border-box", height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs }} />
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: fs - 1, color: C.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={pull.replace} onChange={(e) => setPull((p) => ({ ...p, replace: e.target.checked }))}
                  style={{ width: 20, height: 20, accentColor: C.ink }} />
                {t.replaceToo}
              </label>
              <button type="button" onClick={onSendPull} disabled={sending}
                style={{ minHeight: btnH + 6, padding: "8px 14px", borderRadius: 12, border: 0, background: "#5b21b6", color: "#fff", fontWeight: 700, fontSize: fs, cursor: "pointer", opacity: sending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, lineHeight: 1.3 }}>
                <PackageMinus style={{ width: 18, height: 18 }} />
                {sending ? t.sending : t.pullSend(pull.qty, pull.name.trim() || "…")}
              </button>
            </>)}
          </div>
        )}
      </div>

      {/* Summary + the one button. Sticks to the bottom so it's always reachable. */}
      <div style={{ position: "sticky", bottom: 0, zIndex: 4, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: big ? 14 : 12, boxShadow: "0 -6px 18px rgba(31,27,22,0.06)" }}>
        {requestCount > 0 && (
          <>
            <div style={{ fontSize: fs - 2, fontWeight: 700, color: C.ink, marginBottom: 8 }}>{t.youWillAsk}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {needs.map(({ s, need }) => (
                <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 10px", borderRadius: 999, background: C.cream, border: `1px solid ${C.line}`, fontSize: fs - 3, fontWeight: 600, color: C.ink }}>
                  {need} × {s.item_name}
                  <button type="button" aria-label={`${t.skip}: ${s.item_name}`} onClick={() => setSkipped((k) => ({ ...k, [s.id]: true }))}
                    style={{ width: 32, height: 32, borderRadius: 999, border: 0, background: "#fff", color: C.muted, display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </span>
              ))}
              {typed.map((e, i) => (
                <span key={`x${i}`} style={{ padding: "5px 10px", borderRadius: 999, background: C.cream, border: `1px solid ${C.line}`, fontSize: fs - 3, fontWeight: 600, color: C.ink }}>
                  {e.qty} × {e.name.trim()}
                </span>
              ))}
            </div>
            {showNote ? (
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.note} rows={2} autoFocus
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: fs - 1, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />
            ) : (
              <button type="button" onClick={() => setShowNote(true)}
                style={{ border: 0, background: "transparent", color: C.gold, fontWeight: 600, fontSize: fs - 2, cursor: "pointer", padding: 0, marginBottom: 10, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {t.addNote}
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onSubmit} disabled={!canSubmit}
          style={{
            width: "100%", minHeight: btnH + 8, padding: "8px 14px", borderRadius: 12, border: 0, fontWeight: 700, fontSize: fs, lineHeight: 1.3,
            background: requestCount > 0 ? C.gold : changed.length ? C.ink : "#e7dfd0", color: canSubmit ? "#fff" : "#8B6344",
            cursor: canSubmit ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: busy ? 0.7 : 1,
          }}>
          {requestCount > 0 ? <Send style={{ width: 18, height: 18 }} /> : changed.length ? <Check style={{ width: 18, height: 18 }} /> : null}
          {buttonLabel}
        </button>
      </div>

      {/* History, out of the way. */}
      <div style={card}>
        <button type="button" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}
          style={{ width: "100%", padding: big ? "14px 16px" : "12px 16px", border: 0, background: C.cream, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: fs, color: C.ink }}>{t.past}</span>
          {showPast ? <ChevronUp style={{ width: 18, height: 18, color: C.muted }} /> : <ChevronDown style={{ width: 18, height: 18, color: C.muted }} />}
        </button>
        {showPast && (past.length === 0
          ? <div style={{ padding: 16, fontSize: fs - 1, color: C.muted, borderTop: `1px solid ${C.line}` }}>{t.none}</div>
          : <div style={{ borderTop: `1px solid ${C.line}` }}>{past.map(groupRow)}</div>)}
      </div>
    </div>
  );
}
