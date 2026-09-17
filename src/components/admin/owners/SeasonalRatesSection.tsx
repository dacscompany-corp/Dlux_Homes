"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  useGetSeasonalRatesQuery,
  useCreateSeasonalRateMutation,
  useUpdateSeasonalRateMutation,
  useToggleSeasonalRateMutation,
  useDeleteSeasonalRateMutation,
} from "@/redux/api/seasonalRatesApi";
import {
  parseSeasonInput,
  findActiveOverlap,
  seasonStatus,
  formatSeasonRange,
  type SeasonalRateRecord,
  type SeasonStatus,
} from "@/lib/seasonalRates";
import { BUNDLE_TIER1_LABEL, BUNDLE_TIER2_LABEL, BUNDLE_TIER3_LABEL, BUNDLE_TIER4_LABEL } from "@/lib/pricing";

// ── Seasonal Rates (Finance → Seasonal Rates, owner only) ──────────────────
// Date ranges whose four rates replace the haven's regular rates while switched
// ON. Pricing: src/lib/pricing.ts (seasonFor / stayBreakdown). The server
// re-prices every booking, so what's saved here is what guests are charged.

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();

// Manila calendar date — a season's "active now" is judged in PH time.
const manilaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type Form = {
  name: string;
  startDate: string;
  endDate: string;
  overnightWeekday: string;
  overnightWeekend: string;
  daynightWeekday: string;
  daynightWeekend: string;
  longtermTier1: string;
  longtermTier2: string;
  longtermTier3: string;
  longtermTier4: string;
  allowPromos: boolean;
  active: boolean;
};

type RateKey = "overnightWeekday" | "overnightWeekend" | "daynightWeekday" | "daynightWeekend" | "longtermTier1" | "longtermTier2" | "longtermTier3" | "longtermTier4";

const LONGTERM_TIERS: { key: RateKey; label: string }[] = [
  { key: "longtermTier1", label: `Tier 1 (${BUNDLE_TIER1_LABEL})` },
  { key: "longtermTier2", label: `Tier 2 (${BUNDLE_TIER2_LABEL})` },
  { key: "longtermTier3", label: `Tier 3 (${BUNDLE_TIER3_LABEL})` },
  { key: "longtermTier4", label: `Tier 4 (${BUNDLE_TIER4_LABEL})` },
];

const EMPTY_FORM: Form = {
  name: "", startDate: "", endDate: "",
  overnightWeekday: "", overnightWeekend: "", daynightWeekday: "", daynightWeekend: "",
  longtermTier1: "", longtermTier2: "", longtermTier3: "", longtermTier4: "",
  allowPromos: false, active: false,
};

const STATUS: Record<SeasonStatus, { label: string; bg: string; fg: string }> = {
  active:   { label: "Active now", bg: "#d1fae5", fg: "#065f46" },
  upcoming: { label: "Upcoming",   bg: "#dbeafe", fg: "#1e40af" },
  ended:    { label: "Ended",      bg: "#f3f4f6", fg: "#374151" },
  off:      { label: "Off",        bg: "#fef3c7", fg: "#92400e" },
};

const labelStyle = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" } as const;
const inputStyle = { width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" } as const;

// RTK Query rejects with { data: { error } } for our JSON error responses.
const apiError = (err: unknown, fallback: string) =>
  (err as { data?: { error?: string } })?.data?.error || fallback;

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ position: "relative", width: 38, height: 22, flex: "none", borderRadius: 999, border: "none", background: on ? "#2f7d55" : "#d9d0bf", cursor: disabled ? "wait" : "pointer", transition: "background .15s", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .15s" }} />
    </button>
  );
}

export function SeasonalRatesSection() {
  const { data: seasons = [], isLoading } = useGetSeasonalRatesQuery();
  const [createSeason, { isLoading: creating }] = useCreateSeasonalRateMutation();
  const [updateSeason, { isLoading: updating }] = useUpdateSeasonalRateMutation();
  const [toggleSeason] = useToggleSeasonalRateMutation();
  const [deleteSeason] = useDeleteSeasonalRateMutation();

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const saving = creating || updating;
  const today = manilaToday();

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (s: SeasonalRateRecord) => {
    setEditId(s.id);
    setForm({
      name: s.name, startDate: s.startDate, endDate: s.endDate,
      overnightWeekday: String(s.overnightWeekday), overnightWeekend: String(s.overnightWeekend),
      daynightWeekday: String(s.daynightWeekday), daynightWeekend: String(s.daynightWeekend),
      longtermTier1: s.longtermTier1 != null ? String(s.longtermTier1) : "",
      longtermTier2: s.longtermTier2 != null ? String(s.longtermTier2) : "",
      longtermTier3: s.longtermTier3 != null ? String(s.longtermTier3) : "",
      longtermTier4: s.longtermTier4 != null ? String(s.longtermTier4) : "",
      allowPromos: s.allowPromos, active: s.active,
    });
    setModal(true);
  };
  const closeModal = () => { if (!saving) setModal(false); };

  // Live checks shown in the form before saving; the server re-validates.
  const datesInverted = !!form.startDate && !!form.endDate && form.startDate > form.endDate;
  const overlap = form.active && form.startDate && form.endDate && !datesInverted
    ? findActiveOverlap({ startDate: form.startDate, endDate: form.endDate }, seasons, editId ?? undefined)
    : undefined;

  const submit = async () => {
    const parsed = parseSeasonInput(form);
    if (!parsed.ok) { toast.error(parsed.error); return; }
    if (overlap) { toast.error(`Overlaps the active season "${overlap.name}". Turn it OFF or change the dates.`); return; }
    try {
      if (editId) await updateSeason({ id: editId, body: parsed.value }).unwrap();
      else await createSeason(parsed.value).unwrap();
      toast.success(editId ? "Seasonal rate updated" : "Seasonal rate added");
      setModal(false);
    } catch (err) {
      toast.error(apiError(err, "Could not save seasonal rate"));
    }
  };

  const toggle = async (s: SeasonalRateRecord) => {
    const next = !s.active;
    if (next) {
      const clash = findActiveOverlap(s, seasons, s.id);
      if (clash) { toast.error(`Can't turn ON: overlaps the active season "${clash.name}".`); return; }
    }
    setTogglingId(s.id);
    try {
      await toggleSeason({ id: s.id, active: next }).unwrap();
      toast.success(`"${s.name}" turned ${next ? "ON" : "OFF"}`);
    } catch (err) {
      toast.error(apiError(err, "Could not change seasonal rate status"));
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async (s: SeasonalRateRecord) => {
    if (!window.confirm(`Delete "${s.name}"? Existing bookings keep the price they were booked at.`)) return;
    try {
      await deleteSeason(s.id).unwrap();
      toast.success("Seasonal rate deleted");
    } catch (err) {
      toast.error(apiError(err, "Could not delete seasonal rate"));
    }
  };

  const rateInput = (key: RateKey, label: string, placeholder: string) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" inputMode="decimal" min={1} step="1" aria-label={label} value={form[key]} placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)} style={inputStyle} />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap mb-6" style={{ gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Seasonal Rates</h2>
          <p className="text-sm" style={{ color: "#8a8276", marginTop: 8, maxWidth: 560 }}>
            Special rates for a date range, like Christmas or Holy Week. While a season is ON, its rates replace the regular rates for those dates. Weekend and holiday days follow System → Settings.
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
          <Plus className="w-4 h-4" /> New Season
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
              {["Season", "Overnight", "Day/Night", "Long-term", "Promos", "Status", "On/Off", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8a8276", fontWeight: 400 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-6 text-sm text-center" style={{ color: "#8a8276" }}>Loading…</td></tr>
              )}
              {!isLoading && seasons.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-sm text-center" style={{ color: "#8a8276" }}>No seasonal rates yet. Regular rates apply to every date.</td></tr>
              )}
              {seasons.map((s, idx) => {
                const st = STATUS[seasonStatus(s, today)];
                return (
                  <tr key={s.id} style={{ borderTop: idx > 0 ? "1px solid #f3eee2" : "none" }}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-sm" style={{ color: "#1f1b16" }}>{s.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#8a8276" }}>{formatSeasonRange(s.startDate, s.endDate)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: "#1f1b16", whiteSpace: "nowrap" }}>
                      {peso(s.overnightWeekday)} <span style={{ color: "#8a8276" }}>wkday</span><br />
                      {peso(s.overnightWeekend)} <span style={{ color: "#8a8276" }}>wkend/hol</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: "#1f1b16", whiteSpace: "nowrap" }}>
                      {peso(s.daynightWeekday)} <span style={{ color: "#8a8276" }}>wkday</span><br />
                      {peso(s.daynightWeekend)} <span style={{ color: "#8a8276" }}>wkend/hol</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: "#1f1b16", whiteSpace: "nowrap" }}>
                      {LONGTERM_TIERS.some((t) => s[t.key as keyof SeasonalRateRecord] != null)
                        ? LONGTERM_TIERS.map((t, i) => {
                            const v = s[t.key as keyof SeasonalRateRecord] as number | null | undefined;
                            return <div key={t.key}>{v != null ? peso(v) : <span style={{ color: "#c2ad88" }}>—</span>} <span style={{ color: "#8a8276" }}>T{i + 1}</span></div>;
                          })
                        : <span style={{ color: "#8a8276" }}>Nightly rates</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: s.allowPromos ? "#065f46" : "#8a8276" }}>{s.allowPromos ? "Allowed" : "Blocked"}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg, color: st.fg, whiteSpace: "nowrap" }}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Switch on={s.active} label={`Turn ${s.name} ${s.active ? "OFF" : "ON"}`} disabled={togglingId === s.id} onChange={() => toggle(s)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#1f1b16" }}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remove(s)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "rgba(31,27,22,0.45)" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="season-modal-title"
            style={{ width: "100%", maxWidth: 520, background: "#ffffff", border: "1px solid #ece5d4", borderRadius: 16, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45), 0 4px 14px -6px rgba(58,42,24,.18)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%" }}>

            <div style={{ position: "relative", padding: "20px 22px 16px", background: "linear-gradient(180deg, #f3e7d2 0%, rgba(255,255,255,0) 100%)", flexShrink: 0 }}>
              <button type="button" onClick={closeModal} title="Close"
                style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: "50%", background: "rgba(255,255,255,.7)", color: "#8a6f4d", cursor: "pointer" }}>
                <X className="w-3.5 h-3.5" />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 40 }}>
                <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "#1f1b16", color: "#fff", display: "grid", placeItems: "center" }}>
                  <CalendarRange className="w-[19px] h-[19px]" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 id="season-modal-title" style={{ margin: 0, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", color: "#1f1b16" }}>{editId ? "Edit Seasonal Rate" : "New Seasonal Rate"}</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9b8870" }}>Start and end dates are both included.</p>
                </div>
              </div>
            </div>

            <div style={{ padding: "4px 22px 20px", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Season name</label>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Christmas Season 2026" maxLength={120} style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Start date</label>
                  <input type="date" aria-label="Start date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End date</label>
                  <input type="date" aria-label="End date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} style={inputStyle} />
                </div>
              </div>
              {datesInverted && <p style={{ margin: "-6px 0 0", fontSize: 12, color: "#9a4a3a" }}>Start date cannot be later than end date.</p>}

              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16", marginTop: 4 }}>Overnight</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: -8 }}>
                {rateInput("overnightWeekday", "Weekday", "2300")}
                {rateInput("overnightWeekend", "Weekend / holiday", "2500")}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16", marginTop: 4 }}>Day/Night (Daycation &amp; Nightcation)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: -8 }}>
                {rateInput("daynightWeekday", "Weekday", "1800")}
                {rateInput("daynightWeekend", "Weekend / holiday", "2000")}
              </div>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16" }}>Long-term stay pricing <span style={{ color: "#c2ad88", fontWeight: 500 }}>· optional</span></div>
                <div style={{ fontSize: 12, color: "#8a8276", marginTop: 2 }}>A flat Overnight rate per night for longer stays. If you leave a tier blank, the nights in this season use the nightly rates above.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: -4 }}>
                {LONGTERM_TIERS.map((t) => <div key={t.key}>{rateInput(t.key, t.label, "Per night")}</div>)}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", borderRadius: 12, border: "1px solid #ece5d4", background: "#fbf8f2", marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16" }}>Season is ON</div>
                    <div style={{ fontSize: 12, color: "#8a8276", marginTop: 2 }}>When it&apos;s OFF, the season has no effect on prices. You can set it up now and turn it on later.</div>
                  </div>
                  <Switch on={form.active} label="Season is ON" onChange={(v) => set("active", v)} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16" }}>Allow promos</div>
                    <div style={{ fontSize: 12, color: "#8a8276", marginTop: 2 }}>When it&apos;s OFF, promo codes and automatic promotions can&apos;t be used on these dates.</div>
                  </div>
                  <Switch on={form.allowPromos} label="Allow promos" onChange={(v) => set("allowPromos", v)} />
                </div>
              </div>

              {overlap && (
                <p style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#fdf0ec", border: "1px solid #f1d3c9", fontSize: 12.5, color: "#9a4a3a" }}>
                  These dates overlap the active season &ldquo;{overlap.name}&rdquo; ({formatSeasonRange(overlap.startDate, overlap.endDate)}). Two active seasons can&apos;t share a date. Turn that one OFF, change these dates, or save this season as OFF.
                </p>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "13px 22px", borderTop: "1px solid #f4ecdd", background: "#fff", flexShrink: 0 }}>
              <button type="button" onClick={closeModal} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", background: "transparent", color: "#6f5c44", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={submit} disabled={saving || datesInverted || !!overlap}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", background: "#1f1b16", color: "#fff", cursor: "pointer", opacity: saving || datesInverted || overlap ? 0.6 : 1 }}>
                {editId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : editId ? "Save Changes" : "Add Season"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
