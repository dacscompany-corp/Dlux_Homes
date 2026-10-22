"use client";

// Room Stock for cleaners (owner MVP, 2026-10-22), shared by the desktop and
// phone portals:
//   1. Count — how many of each supply are left in the room (− / + steppers),
//      saved with one button.
//   2. Request — anything below its full-stock amount is suggested with the
//      amount needed to fill it back up; extra items can be added by name.
//   3. My requests — Pending → Processing → Completed, set by the office.
// Inline styles so it reads the same in both portals.

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Minus, Plus, Package, Send, Check, Clock, Truck } from "lucide-react";
import {
  supplyLevel,
  useCreateRestockRequestMutation,
  useGetRestockRequestsQuery,
  useGetRoomStockQuery,
  useSaveSupplyCountsMutation,
  type RestockStatus,
  type RoomSupply,
} from "@/redux/api/cleanersApi";

type Lang = "en" | "tl";

const COPY = {
  en: {
    title: "Room supplies",
    intro: "After cleaning, count what's left in the room. Ask the office for anything that's low.",
    step1: "Count what's left", step2: "Ask for supplies", step3: "My requests",
    shouldHave: (n: number, unit: string) => `Should have ${n} ${unit}`,
    out: "Out", low: "Low", ok: "OK",
    requested: (n: number) => `${n} already requested`,
    save: "Save counts", saving: "Saving…", saved: "Counts saved",
    nothingChanged: "No changes to save",
    suggest: "These are low. Pick what you need:",
    noneLow: "Everything is fully stocked.",
    other: "Something else", otherPh: "Item name", qty: "Qty",
    typeItems: "Type any item the room needs:",
    addAnother: "Add another item",
    removeLine: "Remove",
    note: "Note for the office (optional)",
    send: "Send request", sending: "Sending…", sent: "Request sent to the office",
    pickOne: "Pick at least one item.",
    none: "You haven't asked for anything yet.",
    empty: "No supply list for this room yet — you can still ask for anything below.",
    loading: "Loading supplies…",
    status: { pending: "Pending", processing: "Processing", completed: "Completed" } as Record<RestockStatus, string>,
    statusHint: { pending: "Waiting for the office", processing: "The office is getting it", completed: "Delivered to the room" } as Record<RestockStatus, string>,
  },
  tl: {
    title: "Mga supply sa kwarto",
    intro: "Pagkatapos maglinis, bilangin ang natira sa kwarto. Humingi sa opisina ng kulang.",
    step1: "Bilangin ang natira", step2: "Humingi ng supply", step3: "Mga hiling ko",
    shouldHave: (n: number, unit: string) => `Dapat may ${n} ${unit}`,
    out: "Ubos", low: "Kulang", ok: "OK",
    requested: (n: number) => `${n} nahingi na`,
    save: "I-save ang bilang", saving: "Sine-save…", saved: "Na-save ang bilang",
    nothingChanged: "Walang binago",
    suggest: "Kulang ang mga ito. Piliin ang kailangan:",
    noneLow: "Kumpleto ang lahat.",
    other: "Iba pa", otherPh: "Pangalan ng item", qty: "Ilan",
    typeItems: "Isulat ang kahit anong kailangan ng kwarto:",
    addAnother: "Magdagdag ng item",
    removeLine: "Alisin",
    note: "Mensahe sa opisina (opsyonal)",
    send: "Ipadala ang hiling", sending: "Ipinapadala…", sent: "Naipadala sa opisina",
    pickOne: "Pumili ng kahit isang item.",
    none: "Wala ka pang hinihingi.",
    empty: "Wala pang listahan ng supply ang kwarto — pwede ka pa ring humingi sa ibaba.",
    loading: "Kinukuha ang mga supply…",
    status: { pending: "Naghihintay", processing: "Inaasikaso", completed: "Tapos na" } as Record<RestockStatus, string>,
    statusHint: { pending: "Hinihintay ang opisina", processing: "Kinukuha na ng opisina", completed: "Naihatid na sa kwarto" } as Record<RestockStatus, string>,
  },
};

const C = {
  ink: "#1f1b16", muted: "#8B6344", line: "#ece5d4", cream: "#FAF7F1", gold: "#B07848",
  red: "#b91c1c", redBg: "#fee2e2", amber: "#92400e", amberBg: "#fef3c7", green: "#065f46", greenBg: "#d1fae5",
  violet: "#5b21b6", violetBg: "#ede9fe", blue: "#1e40af", blueBg: "#dbeafe",
};

const STATUS_STYLE: Record<RestockStatus, { fg: string; bg: string; Icon: typeof Clock }> = {
  pending: { fg: C.amber, bg: C.amberBg, Icon: Clock },
  processing: { fg: C.blue, bg: C.blueBg, Icon: Truck },
  completed: { fg: C.green, bg: C.greenBg, Icon: Check },
};

export default function RoomStockCleaner({ lang = "en", big = false }: { lang?: Lang; big?: boolean }) {
  const t = COPY[lang];
  const { data, isLoading } = useGetRoomStockQuery();
  const { data: requests = [] } = useGetRestockRequestsQuery(undefined, { pollingInterval: 60000 });
  const [saveCounts, { isLoading: saving }] = useSaveSupplyCountsMutation();
  const [createRequest, { isLoading: sending }] = useCreateRestockRequestMutation();

  const supplies = useMemo(() => data?.supplies ?? [], [data]);
  // Counts being edited, keyed by supply id; falls back to the saved count.
  const [draft, setDraft] = useState<Record<string, number>>({});
  const countOf = (s: RoomSupply) => draft[s.id] ?? s.current_quantity;
  const changed = supplies.filter((s) => draft[s.id] !== undefined && draft[s.id] !== s.current_quantity);

  // What to ask for: below full stock, less what's already on its way.
  const suggestions = supplies
    .map((s) => ({ s, need: Math.max(0, s.par_quantity - countOf(s) - s.open_request_qty) }))
    .filter((x) => x.need > 0);
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const qtyFor = (id: string, need: number) => (picked[id] === undefined ? need : picked[id]);
  // Items the cleaner types in — any number of lines, list or no list.
  const [extras, setExtras] = useState<{ name: string; qty: number }[]>([{ name: "", qty: 1 }]);
  const [note, setNote] = useState("");

  const fs = big ? 17 : 14;
  const btnH = big ? 52 : 40;

  const onSave = async () => {
    if (!changed.length) { toast(t.nothingChanged); return; }
    try {
      await saveCounts(changed.map((s) => ({ id: s.id, current_quantity: countOf(s) }))).unwrap();
      setDraft({});
      toast.success(t.saved);
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not save");
    }
  };

  const onSend = async () => {
    const items: { room_supply_id?: string; item_name?: string; quantity: number }[] = [];
    for (const { s, need } of suggestions) {
      const q = qtyFor(s.id, need);
      if (q && q > 0) items.push({ room_supply_id: s.id, quantity: q });
    }
    for (const e of extras) {
      if (e.name.trim() && e.qty > 0) items.push({ item_name: e.name.trim(), quantity: e.qty });
    }
    if (!items.length) { toast.error(t.pickOne); return; }
    try {
      // Unsaved counts go first, so the office sees the same numbers.
      if (changed.length) {
        await saveCounts(changed.map((s) => ({ id: s.id, current_quantity: countOf(s) }))).unwrap();
        setDraft({});
      }
      await createRequest({ havenId: data?.haven?.id, note: note.trim() || undefined, items }).unwrap();
      setPicked({}); setExtras([{ name: "", qty: 1 }]); setNote("");
      toast.success(t.sent);
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not send");
    }
  };

  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" };
  const stepHead = (n: number, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: big ? "14px 16px" : "12px 16px", background: C.cream, borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: C.gold, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{n}</span>
      <span style={{ fontWeight: 700, fontSize: fs, color: C.ink }}>{label}</span>
    </div>
  );
  const stepper = (value: number, onChange: (v: number) => void, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
      <button type="button" aria-label={`${label} −`} onClick={() => onChange(Math.max(0, value - 1))}
        style={{ width: btnH, height: btnH, borderRadius: 10, border: `1px solid ${C.line}`, background: C.cream, display: "grid", placeItems: "center", cursor: "pointer" }}>
        <Minus style={{ width: 18, height: 18, color: C.ink }} />
      </button>
      <input type="number" min={0} inputMode="numeric" aria-label={label} value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
        style={{ width: big ? 60 : 52, height: btnH, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: fs + 1, fontWeight: 700, color: C.ink }} />
      <button type="button" aria-label={`${label} +`} onClick={() => onChange(value + 1)}
        style={{ width: btnH, height: btnH, borderRadius: 10, border: `1px solid ${C.line}`, background: C.cream, display: "grid", placeItems: "center", cursor: "pointer" }}>
        <Plus style={{ width: 18, height: 18, color: C.ink }} />
      </button>
    </div>
  );

  if (isLoading) return <p style={{ fontSize: fs, color: C.muted }}>{t.loading}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Package style={{ width: 22, height: 22, color: C.gold, flex: "none", marginTop: 2 }} />
        <div>
          <div style={{ fontSize: fs + 2, fontWeight: 700, color: C.ink }}>{t.title}{data?.haven ? ` · ${data.haven.name}` : ""}</div>
          <div style={{ fontSize: fs - 1, color: C.muted, marginTop: 2 }}>{t.intro}</div>
        </div>
      </div>

      {supplies.length === 0 ? (
        <div style={{ ...card, padding: 14, fontSize: fs - 1, color: C.muted }}>{t.empty}</div>
      ) : (<>
        {/* 1. Count */}
        <div style={card}>
          {stepHead(1, t.step1)}
          {supplies.map((s, i) => {
            const value = countOf(s);
            const level = supplyLevel({ current_quantity: value, par_quantity: s.par_quantity });
            const lv = level === "out" ? { fg: C.red, bg: C.redBg, label: t.out } : level === "low" ? { fg: C.amber, bg: C.amberBg, label: t.low } : { fg: C.green, bg: C.greenBg, label: t.ok };
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: big ? "12px 16px" : "10px 16px", borderTop: i ? `1px solid #F3EEE2` : 0, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: fs, fontWeight: 600, color: C.ink }}>{s.item_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: lv.bg, color: lv.fg }}>{lv.label}</span>
                  </div>
                  <div style={{ fontSize: fs - 2, color: C.muted, marginTop: 2 }}>
                    {t.shouldHave(s.par_quantity, s.unit_type)}{s.open_request_qty > 0 ? ` · ${t.requested(s.open_request_qty)}` : ""}
                  </div>
                </div>
                {stepper(value, (v) => setDraft((d) => ({ ...d, [s.id]: v })), s.item_name)}
              </div>
            );
          })}
          <div style={{ padding: 14, borderTop: `1px solid ${C.line}`, background: C.cream }}>
            <button type="button" onClick={onSave} disabled={saving || !changed.length}
              style={{ width: "100%", height: btnH + 4, borderRadius: 12, border: 0, background: changed.length ? C.ink : "#d9d1c2", color: "#fff", fontWeight: 700, fontSize: fs, cursor: changed.length ? "pointer" : "default" }}>
              {saving ? t.saving : `${t.save}${changed.length ? ` (${changed.length})` : ""}`}
            </button>
          </div>
        </div>
      </>)}

        {/* Request — the cleaner asks for what the room needs. Always here. */}
        <div style={card}>
          {stepHead(supplies.length ? 2 : 1, t.step2)}
          <div style={{ padding: big ? 16 : 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {supplies.length > 0 && <div style={{ fontSize: fs - 1, color: C.muted }}>{suggestions.length ? t.suggest : t.noneLow}</div>}
            {suggestions.map(({ s, need }) => {
              const q = qtyFor(s.id, need);
              const on = !!q && q > 0;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ flex: 1, minWidth: 150, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: fs, color: C.ink }}>
                    <input type="checkbox" checked={on} onChange={() => setPicked((p) => ({ ...p, [s.id]: on ? 0 : need }))}
                      style={{ width: 20, height: 20, accentColor: C.ink }} />
                    {s.item_name} <span style={{ color: C.muted, fontSize: fs - 2 }}>({s.unit_type})</span>
                  </label>
                  {on && stepper(q as number, (v) => setPicked((p) => ({ ...p, [s.id]: v })), `${s.item_name} ${t.qty}`)}
                </div>
              );
            })}
            <div style={{ fontSize: fs - 1, color: C.muted, marginTop: supplies.length ? 6 : 0 }}>{t.typeItems}</div>
            {extras.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input value={e.name} placeholder={t.otherPh}
                  onChange={(ev) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
                  style={{ flex: 1, minWidth: 150, height: btnH, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px", fontSize: fs }} />
                {stepper(e.qty, (v) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, qty: Math.max(1, v) } : x))), `${e.name || t.otherPh} ${t.qty}`)}
                {extras.length > 1 && (
                  <button type="button" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} aria-label={t.removeLine}
                    style={{ height: btnH, padding: "0 10px", border: 0, background: "transparent", color: C.red, fontSize: fs - 1, cursor: "pointer" }}>
                    {t.removeLine}
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setExtras((xs) => [...xs, { name: "", qty: 1 }])}
              style={{ alignSelf: "flex-start", height: btnH - 4, padding: "0 12px", borderRadius: 10, border: `1px dashed ${C.gold}`, background: "#fff", color: C.gold, fontWeight: 600, fontSize: fs - 1, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus style={{ width: 16, height: 16 }} />{t.addAnother}
            </button>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.note} rows={2}
              style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: fs, resize: "vertical", fontFamily: "inherit" }} />
            <button type="button" onClick={onSend} disabled={sending}
              style={{ height: btnH + 4, borderRadius: 12, border: 0, background: C.gold, color: "#fff", fontWeight: 700, fontSize: fs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: sending ? 0.7 : 1 }}>
              <Send style={{ width: 18, height: 18 }} />{sending ? t.sending : t.send}
            </button>
          </div>
        </div>

      {/* My requests */}
      <div style={card}>
        {stepHead(supplies.length ? 3 : 2, t.step3)}
        {requests.length === 0 ? (
          <div style={{ padding: 16, fontSize: fs - 1, color: C.muted }}>{t.none}</div>
        ) : requests.slice(0, 20).map((r, i) => {
          const st = STATUS_STYLE[r.status];
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid #F3EEE2` : 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs, fontWeight: 600, color: C.ink }}>{r.quantity} × {r.item_name}</div>
                <div style={{ fontSize: fs - 2, color: C.muted, marginTop: 2 }}>
                  {new Date(r.requested_at).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" · "}{t.statusHint[r.status]}
                  {r.admin_note ? ` · “${r.admin_note}”` : ""}
                </div>
              </div>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: st.bg, color: st.fg }}>
                <st.Icon style={{ width: 14, height: 14 }} />{t.status[r.status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
