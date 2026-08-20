"use client";

import { spanHours, fmtSpan } from "@/lib/stay-window";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Home, PhilippinePeso, Clock, FileText, Star, Package, Image as ImageIcon,
  Images, Video, Check, X, Plus, Trash2,
} from "lucide-react";
import { fileToCompressedDataUrl, GALLERY_PRESET } from "@/lib/compressImage";
import {
  BUNDLE_TIER1_NIGHTS, BUNDLE_TIER2_NIGHTS, BUNDLE_TIER3_NIGHTS, BUNDLE_TIER4_NIGHTS,
  BUNDLE_TIER1_LABEL, BUNDLE_TIER2_LABEL, BUNDLE_TIER3_LABEL, BUNDLE_TIER4_LABEL,
} from "@/lib/pricing";

// ── Static option lists (mirrors the Staycation haven builder) ──
const STEPS = [
  { id: "basic", label: "Basics", icon: Home },
  { id: "pricing", label: "Pricing", icon: PhilippinePeso },
  { id: "checkin", label: "Check-in", icon: Clock },
  { id: "details", label: "Details", icon: FileText },
  { id: "amenities", label: "Amenities", icon: Star },
  { id: "addons", label: "Add-ons", icon: Package },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "phototour", label: "Photo Tour", icon: Images },
  { id: "video", label: "Video", icon: Video },
] as const;

const AMENITIES: { id: string; label: string }[] = [
  { id: "wifi", label: "WiFi" },
  { id: "airConditioning", label: "Air conditioning" },
  { id: "poolAccess", label: "Pool access" },
  { id: "netflix", label: "Netflix" },
  { id: "kitchen", label: "Kitchen" },
  { id: "parking", label: "Parking" },
  { id: "ps4", label: "PS4 / Console" },
  { id: "balcony", label: "Balcony" },
  { id: "washerDryer", label: "Washer / Dryer" },
  { id: "glowBed", label: "Glow Bed" },
  { id: "tv", label: "TV" },
  { id: "towels", label: "Towels" },
];

const PHOTO_TOUR: { key: string; label: string; required: boolean }[] = [
  { key: "livingArea", label: "Living Area", required: true },
  { key: "bedroom", label: "Bedroom", required: true },
  { key: "kitchenette", label: "Kitchenette", required: false },
  { key: "fullBathroom", label: "Full Bathroom", required: true },
  { key: "diningArea", label: "Dining Area", required: false },
  { key: "exterior", label: "Exterior / View", required: false },
  { key: "pool", label: "Pool / Amenities", required: false },
  { key: "garage", label: "Parking / Garage", required: false },
  { key: "additional", label: "Additional", required: false },
];

const PROPERTY_TYPES = ["Studio", "1 Bedroom", "2 Bedroom", "Loft", "Penthouse", "Suite"];

type AddOn = { name: string; price: string };

const empty = {
  // basic
  haven_name: "", property_type: "Studio", tower: "", floor: "", view_type: "", description: "", google_map_address: "",
  // pricing
  six_hour_rate: "", ten_hour_rate: "", weekday_rate: "", weekend_rate: "",
  // Long-term stay pricing (Overnight only) — flat per-night rate, no
  // weekday/weekend split, once a stay reaches 3/11/18/26 nights. Blank = not
  // configured for that tier.
  longterm_tier1_rate: "", longterm_tier2_rate: "", longterm_tier3_rate: "", longterm_tier4_rate: "",
  longterm_extra_pax_fee: "",
  // Whole-feature on/off — off keeps the configured rates but a stay of any
  // length prices per-night as normal until re-activated.
  longterm_active: true,
  cleaning_fee: "", security_deposit: "", extra_pax_fee: "",
  // Security deposit tiers — same 3/11/18/26 night bands, scales
  // independently of long-term pricing. Blank = not configured for that tier.
  deposit_tier1_amount: "", deposit_tier2_amount: "", deposit_tier3_amount: "", deposit_tier4_amount: "",
  // check-in
  six_hour_check_in: "09:00", six_hour_check_out: "15:00",
  ten_hour_check_in: "09:00", ten_hour_check_out: "19:00",
  twenty_one_hour_check_in: "14:00", twenty_one_hour_check_out: "11:00",
  // details
  capacity: "", room_size: "", beds: "", bathrooms: "",
  house_rules: "", smoking_policy: "", pet_policy: "", cancellation_policy: "",
  // amenities
  amenities: {} as Record<string, boolean>,
  // add-ons
  addons: [] as AddOn[],
  // images
  haven_images: [] as string[],
  // photo tour
  photo_tour_images: {} as Record<string, string[]>,
  // video
  youtube_url: "", virtual_tour_url: "",
};
type Form = typeof empty;

const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const fieldStyle = { borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" } as const;
const labelCls = "text-xs font-semibold";
const labelStyle = { color: "#8B6344" } as const;

// Photos are downscaled before base64 — a batch of raw camera shots exceeds the
// platform's 4.5 MB request-body limit once encoded, and the resulting 413 is
// not JSON (see src/lib/compressImage.ts).
function readFiles(files: FileList | null, cb: (urls: string[]) => void) {
  if (!files?.length) return;
  const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
  Promise.all(imgs.map((f) => fileToCompressedDataUrl(f, GALLERY_PRESET).catch(() => "")))
    .then((urls) => cb(urls.filter(Boolean)));
}

type ImgRef = { image_url: string; category?: string };

// Map a raw haven record (from the havens list / GET) into the wizard's form.
function havenToForm(h: Record<string, unknown>): { form: Form; images: ImgRef[]; tours: ImgRef[] } {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const amenities = (typeof h.amenities === "object" && h.amenities ? h.amenities : {}) as Record<string, boolean>;
  const images = (Array.isArray(h.images) ? h.images : []).filter((i: ImgRef) => i?.image_url) as ImgRef[];
  const tours = (Array.isArray(h.photo_tours) ? h.photo_tours : []).filter((i: ImgRef) => i?.image_url) as ImgRef[];
  return {
    images, tours,
    form: {
      ...empty,
      haven_name: s(h.haven_name), property_type: s(h.property_type) || "Studio",
      tower: s(h.tower), floor: s(h.floor), view_type: s(h.view_type),
      description: s(h.description), google_map_address: s(h.google_map_address),
      six_hour_rate: s(h.six_hour_rate), ten_hour_rate: s(h.ten_hour_rate),
      weekday_rate: s(h.weekday_rate), weekend_rate: s(h.weekend_rate),
      longterm_tier1_rate: s(h.longterm_tier1_rate), longterm_tier2_rate: s(h.longterm_tier2_rate),
      longterm_tier3_rate: s(h.longterm_tier3_rate), longterm_tier4_rate: s(h.longterm_tier4_rate),
      longterm_extra_pax_fee: s(h.longterm_extra_pax_fee),
      longterm_active: h.longterm_active !== false,
      cleaning_fee: s(h.cleaning_fee), security_deposit: s(h.security_deposit), extra_pax_fee: s(h.extra_pax_fee),
      deposit_tier1_amount: s(h.deposit_tier1_amount), deposit_tier2_amount: s(h.deposit_tier2_amount),
      deposit_tier3_amount: s(h.deposit_tier3_amount), deposit_tier4_amount: s(h.deposit_tier4_amount),
      six_hour_check_in: s(h.six_hour_check_in) || empty.six_hour_check_in, six_hour_check_out: s(h.six_hour_check_out) || empty.six_hour_check_out,
      ten_hour_check_in: s(h.ten_hour_check_in) || empty.ten_hour_check_in, ten_hour_check_out: s(h.ten_hour_check_out) || empty.ten_hour_check_out,
      twenty_one_hour_check_in: s(h.twenty_one_hour_check_in) || empty.twenty_one_hour_check_in, twenty_one_hour_check_out: s(h.twenty_one_hour_check_out) || empty.twenty_one_hour_check_out,
      capacity: s(h.capacity), room_size: s(h.room_size), beds: s(h.beds), bathrooms: s(h.bathrooms),
      house_rules: s(h.house_rules), smoking_policy: s(h.smoking_policy), pet_policy: s(h.pet_policy), cancellation_policy: s(h.cancellation_policy),
      amenities: { ...amenities },
      youtube_url: s(h.youtube_url), virtual_tour_url: s(h.virtual_tour_url),
      haven_images: [], photo_tour_images: {}, addons: [],
    },
  };
}

export default function HavenWizard({
  open,
  onClose,
  createHaven,
  updateHaven,
  editHaven,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  // RTK mutation triggers — return { unwrap }.
  createHaven: (payload: Record<string, unknown>) => { unwrap: () => Promise<unknown> };
  updateHaven?: (payload: Record<string, unknown>) => { unwrap: () => Promise<unknown> };
  editHaven?: Record<string, unknown> | null;
  onCreated?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  // Existing (already-saved) images kept when editing; dropping one deletes it.
  const [existingImages, setExistingImages] = useState<ImgRef[]>([]);
  const [existingTours, setExistingTours] = useState<ImgRef[]>([]);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // Lengths quoted by the rate labels, read from the windows this same wizard
  // edits in step 3. Empty while a window is blank, so a label omits the span
  // rather than asserting a wrong one.
  const dayLen = fmtSpan(form.ten_hour_check_in, form.ten_hour_check_out);
  const nightLen = fmtSpan(form.twenty_one_hour_check_in, form.twenty_one_hour_check_out);
  const isEdit = !!editHaven;
  const havenId = editHaven ? String(editHaven.uuid_id || editHaven.id || "") : "";

  // (Re)initialize whenever the wizard opens.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (editHaven) {
      const mapped = havenToForm(editHaven);
      setForm(mapped.form);
      setExistingImages(mapped.images);
      setExistingTours(mapped.tours);
    } else {
      setForm(empty);
      setExistingImages([]);
      setExistingTours([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => { onClose(); };

  const step1Valid = !!(form.haven_name && form.tower && form.floor && form.view_type && form.description);
  const step2Valid = !!(form.six_hour_rate || form.ten_hour_rate || form.weekday_rate || form.weekend_rate);
  const step4Valid = !!(form.capacity && form.room_size && form.beds);

  const next = () => {
    if (step === 0 && !step1Valid) { toast.error("Fill in name, tower, floor, view, and description"); return; }
    if (step === 1 && !step2Valid) { toast.error("Enter at least one rate"); return; }
    if (step === 3 && !step4Valid) { toast.error("Capacity, room size and beds are required"); return; }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => (step === 0 ? close() : setStep((s) => s - 1));

  const num = (v: string) => (v === "" ? undefined : Number(v));

  const submit = async () => {
    if (!step1Valid) { setStep(0); toast.error("Fill in the required basics"); return; }
    if (!step2Valid) { setStep(1); toast.error("Enter at least one rate"); return; }
    if (!step4Valid) { setStep(3); toast.error("Complete the unit details"); return; }
    setSaving(true);
    try {
      const photoTour: Record<string, string[]> = {};
      Object.entries(form.photo_tour_images).forEach(([k, v]) => { if (v?.length) photoTour[k] = v; });

      const payload: Record<string, unknown> = {
        haven_name: form.haven_name, tower: form.tower, floor: form.floor, view_type: form.view_type,
        description: form.description, property_type: form.property_type, google_map_address: form.google_map_address || undefined,
        capacity: Number(form.capacity), room_size: Number(form.room_size), beds: form.beds,
        bathrooms: form.bathrooms || undefined,
        six_hour_rate: num(form.six_hour_rate), ten_hour_rate: num(form.ten_hour_rate),
        weekday_rate: num(form.weekday_rate), weekend_rate: num(form.weekend_rate),
        longterm_tier1_rate: num(form.longterm_tier1_rate), longterm_tier2_rate: num(form.longterm_tier2_rate),
        longterm_tier3_rate: num(form.longterm_tier3_rate), longterm_tier4_rate: num(form.longterm_tier4_rate),
        longterm_extra_pax_fee: form.longterm_extra_pax_fee || undefined,
        longterm_active: form.longterm_active,
        cleaning_fee: form.cleaning_fee || undefined, security_deposit: form.security_deposit || undefined,
        deposit_tier1_amount: num(form.deposit_tier1_amount), deposit_tier2_amount: num(form.deposit_tier2_amount),
        deposit_tier3_amount: num(form.deposit_tier3_amount), deposit_tier4_amount: num(form.deposit_tier4_amount),
        extra_pax_fee: form.extra_pax_fee || undefined,
        six_hour_check_in: form.six_hour_check_in, six_hour_check_out: form.six_hour_check_out,
        ten_hour_check_in: form.ten_hour_check_in, ten_hour_check_out: form.ten_hour_check_out,
        twenty_one_hour_check_in: form.twenty_one_hour_check_in, twenty_one_hour_check_out: form.twenty_one_hour_check_out,
        house_rules: form.house_rules || undefined, smoking_policy: form.smoking_policy || undefined,
        pet_policy: form.pet_policy || undefined, cancellation_policy: form.cancellation_policy || undefined,
        amenities: form.amenities,
        haven_images: form.haven_images.length ? form.haven_images : undefined,
        photo_tour_images: Object.keys(photoTour).length ? photoTour : undefined,
        youtube_url: form.youtube_url || undefined, virtual_tour_url: form.virtual_tour_url || undefined,
      };

      let havenUuid: string | undefined;
      if (isEdit && updateHaven) {
        // Keep the existing images the user didn't remove; the controller deletes the rest.
        payload.id = havenId;
        payload.existing_images = existingImages;
        payload.existing_photo_tours = existingTours;
        await updateHaven(payload).unwrap();
        havenUuid = havenId;
      } else {
        const res = (await createHaven(payload).unwrap()) as { data?: { haven?: { uuid_id?: string; id?: string } } };
        havenUuid = res?.data?.haven?.uuid_id || res?.data?.haven?.id;
      }

      // Persist any new add-ons (rentable items) against the haven.
      const validAddons = form.addons.filter((a) => a.name.trim() && a.price !== "");
      if (havenUuid && validAddons.length) {
        await Promise.all(
          validAddons.map((a) =>
            fetch(`/api/haven/${havenUuid}/rentable-items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: a.name.trim(), price_per_night: Number(a.price) }),
            }).catch(() => null),
          ),
        );
      }

      toast.success(isEdit ? "Haven updated" : "Haven created");
      onCreated?.();
      close();
    } catch {
      toast.error(isEdit ? "Could not update haven" : "Could not create haven");
    } finally {
      setSaving(false);
    }
  };

  const toggleAmenity = (id: string) =>
    set({ amenities: { ...form.amenities, [id]: !form.amenities[id] } });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={close}>
      <div className="w-full max-w-2xl rounded-3xl border max-h-[92vh] flex flex-col" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#EDE3D2" }}>
          <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>{isEdit ? "Edit Haven" : "Add Haven"}</h3>
          <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Step {step + 1} of {STEPS.length} · {STEPS[step].label}</p>
          {/* Stepper — icons spread edge-to-edge, connectors fill the gaps */}
          <div className="flex items-center mt-4">
            {STEPS.map((st, i) => {
              const Icon = st.icon;
              const active = i === step;
              const done = i < step;
              return (
                <div key={st.id} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <button type="button" onClick={() => i < step && setStep(i)} title={st.label}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: done ? "#B07848" : active ? "#F7F0E3" : "#F3EEE4", color: done ? "#fff" : active ? "#B07848" : "#C9B79E", border: active ? "1.5px solid #B07848" : "none" }}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />}
                  </button>
                  {i < STEPS.length - 1 && <div className="flex-1 h-0.5 rounded-full mx-1" style={{ backgroundColor: done ? "#B07848" : "#EDE3D2" }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* Step 1 — Basics */}
          {step === 0 && (
            <div className="space-y-3">
              <input placeholder="Haven name" value={form.haven_name} onChange={(e) => set({ haven_name: e.target.value })} className={field} style={fieldStyle} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Property type</label>
                  <select aria-label="Property type" value={form.property_type} onChange={(e) => set({ property_type: e.target.value })} className={`${field} mt-1`} style={fieldStyle}>
                    {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <input placeholder="View type (e.g. City View)" value={form.view_type} onChange={(e) => set({ view_type: e.target.value })} className={`${field} self-end`} style={fieldStyle} />
                <input placeholder="Tower" value={form.tower} onChange={(e) => set({ tower: e.target.value })} className={field} style={fieldStyle} />
                <input placeholder="Floor" value={form.floor} onChange={(e) => set({ floor: e.target.value })} className={field} style={fieldStyle} />
              </div>
              <textarea placeholder="Description" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={`${field} resize-none`} style={fieldStyle} />
              <input placeholder="Google Maps address (optional)" value={form.google_map_address} onChange={(e) => set({ google_map_address: e.target.value })} className={field} style={fieldStyle} />
            </div>
          )}

          {/* Step 2 — Pricing */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>Rates per the D&apos;Lux card. Numbers only — no ₱ or commas. Weekend/holiday rate applies on Fri/Sat &amp; PH holidays.</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Lengths follow the windows set in step 3 — never retyped, so
                    editing a check-out hour cannot leave these labels lying. */}
                {[
                  [`Daycation/Nightcation${dayLen ? " " + dayLen : ""} — Weekday (₱)`, "ten_hour_rate"],
                  [`Daycation/Nightcation${dayLen ? " " + dayLen : ""} — Weekend/Holiday (₱)`, "six_hour_rate"],
                  [`Overnight${nightLen ? " " + nightLen : ""} — Weekday (₱)`, "weekday_rate"],
                  [`Overnight${nightLen ? " " + nightLen : ""} — Weekend/Holiday (₱)`, "weekend_rate"],
                ].map(([lbl, key]) => (
                  <div key={key}>
                    <label className={labelCls} style={labelStyle}>{lbl}</label>
                    <input type="number" value={form[key as keyof Form] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} className={`${field} mt-1`} style={fieldStyle} />
                  </div>
                ))}
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold" style={{ color: "#8B6344" }}>Overnight{nightLen ? ` (${nightLen})` : ""} long-term stay pricing <span className="font-normal" style={{ color: "#C9B79E" }}>· optional</span></p>
                  <button type="button" role="switch" aria-checked={form.longterm_active ? "true" : "false"} aria-label="Long-term pricing active"
                    onClick={() => set({ longterm_active: !form.longterm_active })}
                    className="relative inline-flex items-center rounded-full transition-colors cursor-pointer flex-shrink-0"
                    style={{ width: 40, height: 22, backgroundColor: form.longterm_active ? "#059669" : "#D4BFA0" }}>
                    <span className="inline-block rounded-full bg-white transition-transform" style={{ width: 16, height: 16, transform: form.longterm_active ? "translateX(21px)" : "translateX(3px)" }} />
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "#C9B79E" }}>Flat nightly rate once a stay reaches {BUNDLE_TIER1_NIGHTS}/{BUNDLE_TIER2_NIGHTS}/{BUNDLE_TIER3_NIGHTS}/{BUNDLE_TIER4_NIGHTS} nights — same rate every day of the week, no weekday/holiday split. Extra guests (3–4 pax) pay the fee below per guest per night INSTEAD of the normal extra-pax fee. Turn this off to pause long-term pricing entirely without clearing the rates.</p>
                <div className="space-y-2 mt-2" style={{ opacity: form.longterm_active ? 1 : 0.5 }}>
                  {[
                    { label: "Tier 1", nights: BUNDLE_TIER1_LABEL, key: "longterm_tier1_rate" },
                    { label: "Tier 2", nights: BUNDLE_TIER2_LABEL, key: "longterm_tier2_rate" },
                    { label: "Tier 3", nights: BUNDLE_TIER3_LABEL, key: "longterm_tier3_rate" },
                    { label: "Tier 4", nights: BUNDLE_TIER4_LABEL, key: "longterm_tier4_rate" },
                  ].map((tier) => (
                    <div key={tier.key} className="rounded-xl border p-3 flex items-center justify-between gap-3" style={{ borderColor: "#EDE3D2", backgroundColor: "#FFFFFF" }}>
                      <p className="text-xs font-semibold" style={{ color: "#B07848" }}>{tier.label} <span className="font-normal" style={{ color: "#C9B79E" }}>· {tier.nights}</span></p>
                      <input type="number" placeholder="—" disabled={!form.longterm_active} value={form[tier.key as keyof Form] as string} onChange={(e) => set({ [tier.key]: e.target.value } as Partial<Form>)} className={field} style={{ ...fieldStyle, width: 140 }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <label className={labelCls} style={labelStyle}>Long-term extra-pax fee (₱ / pax / night)</label>
                  <input type="number" placeholder="100" disabled={!form.longterm_active} value={form.longterm_extra_pax_fee} onChange={(e) => set({ longterm_extra_pax_fee: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
              </div>
              <div className="pt-2">
                <p className="text-xs font-semibold" style={{ color: "#8B6344" }}>Security deposit</p>
                <p className="text-xs mt-1" style={{ color: "#C9B79E" }}>Refundable, collected at check-in. Scales with how many nights are booked — same {BUNDLE_TIER1_NIGHTS}/{BUNDLE_TIER2_NIGHTS}/{BUNDLE_TIER3_NIGHTS}/{BUNDLE_TIER4_NIGHTS}-night bands as long-term pricing above, but applies regardless of whether long-term pricing is on. Daycation/Nightcation always uses the default below.</p>
                <div className="mt-2">
                  <label className={labelCls} style={labelStyle}>Default (₱) <span className="font-normal" style={{ color: "#C9B79E" }}>· 1–2 nights, Daycation/Nightcation</span></label>
                  <input type="number" placeholder="1000" value={form.security_deposit} onChange={(e) => set({ security_deposit: e.target.value })} className={`${field} mt-1`} style={{ ...fieldStyle, maxWidth: 200 }} />
                </div>
                <div className="space-y-2 mt-2">
                  {[
                    { label: "Tier 1", nights: BUNDLE_TIER1_LABEL, key: "deposit_tier1_amount" },
                    { label: "Tier 2", nights: BUNDLE_TIER2_LABEL, key: "deposit_tier2_amount" },
                    { label: "Tier 3", nights: BUNDLE_TIER3_LABEL, key: "deposit_tier3_amount" },
                    { label: "Tier 4", nights: BUNDLE_TIER4_LABEL, key: "deposit_tier4_amount" },
                  ].map((tier) => (
                    <div key={tier.key} className="rounded-xl border p-3 flex items-center justify-between gap-3" style={{ borderColor: "#EDE3D2", backgroundColor: "#FFFFFF" }}>
                      <p className="text-xs font-semibold" style={{ color: "#B07848" }}>{tier.label} <span className="font-normal" style={{ color: "#C9B79E" }}>· {tier.nights}</span></p>
                      <input type="number" placeholder="—" value={form[tier.key as keyof Form] as string} onChange={(e) => set({ [tier.key]: e.target.value } as Partial<Form>)} className={field} style={{ ...fieldStyle, width: 140 }} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Extra pax fee (₱ / pax)</label>
                <input type="number" placeholder="0" value={form.extra_pax_fee} onChange={(e) => set({ extra_pax_fee: e.target.value })} className={`${field} mt-1`} style={{ ...fieldStyle, maxWidth: 200 }} />
              </div>
              <p className="text-xs" style={{ color: "#C9B79E" }}>The nightly rate covers 2 guests. The extra-pax fee is charged per adult/young-adult beyond that (children 7 &amp; under are free) — leave it blank for none.</p>
            </div>
          )}

          {/* Step 3 — Check-in */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>Default check-in / check-out windows per rate plan. Each row is named for what the guest sees on the site; the duration is read from the times below it.</p>
              {[
                // The column names (six_hour/ten_hour/twenty_one_hour) are legacy
                // from the Staycation port and no longer describe these windows —
                // `six_hour_*` is the Nightcation and runs 10 hours. Label the rows
                // by their guest-facing stay type (see havenToRoom) and compute the
                // length from the times, so editing an hour updates what is shown.
                ["Nightcation", "six_hour_check_in", "six_hour_check_out"],
                ["Daycation", "ten_hour_check_in", "ten_hour_check_out"],
                ["Overnight", "twenty_one_hour_check_in", "twenty_one_hour_check_out"],
              ].map(([lbl, inK, outK]) => {
                const start = form[inK as keyof Form] as string;
                const end = form[outK as keyof Form] as string;
                const hours = spanHours(start, end);
                return (
                <div key={lbl} className="rounded-xl border p-3" style={{ borderColor: "#EDE3D2" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#B07848" }}>
                    {lbl}
                    {hours != null && <span style={{ color: "#8B6344", fontWeight: 500 }}> · {hours} hour{hours === 1 ? "" : "s"}</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={labelStyle}>Check-in</label>
                      <input aria-label={`${lbl} check-in`} type="time" value={start} onChange={(e) => set({ [inK]: e.target.value } as Partial<Form>)} className={`${field} mt-1`} style={fieldStyle} />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>Check-out</label>
                      <input aria-label={`${lbl} check-out`} type="time" value={end} onChange={(e) => set({ [outK]: e.target.value } as Partial<Form>)} className={`${field} mt-1`} style={fieldStyle} />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Step 4 — Details */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Capacity (pax)</label>
                  <input type="number" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Room size (sqm)</label>
                  <input type="number" value={form.room_size} onChange={(e) => set({ room_size: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Bathrooms</label>
                  <input type="number" value={form.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
                </div>
              </div>
              <input placeholder="Beds (e.g. 1 Queen)" value={form.beds} onChange={(e) => set({ beds: e.target.value })} className={field} style={fieldStyle} />
              <textarea placeholder="House rules" rows={2} value={form.house_rules} onChange={(e) => set({ house_rules: e.target.value })} className={`${field} resize-none`} style={fieldStyle} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Smoking policy" value={form.smoking_policy} onChange={(e) => set({ smoking_policy: e.target.value })} className={field} style={fieldStyle} />
                <input placeholder="Pet policy" value={form.pet_policy} onChange={(e) => set({ pet_policy: e.target.value })} className={field} style={fieldStyle} />
              </div>
              <input placeholder="Cancellation policy" value={form.cancellation_policy} onChange={(e) => set({ cancellation_policy: e.target.value })} className={field} style={fieldStyle} />
            </div>
          )}

          {/* Step 5 — Amenities */}
          {step === 4 && (
            <div>
              <p className="text-xs mb-3" style={{ color: "#8B6344" }}>Tap to toggle what&apos;s included.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AMENITIES.map((a) => {
                  const on = !!form.amenities[a.id];
                  return (
                    <button key={a.id} type="button" onClick={() => toggleAmenity(a.id)}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-left transition-colors"
                      style={{ borderColor: on ? "#B07848" : "#EDE3D2", backgroundColor: on ? "#F7F0E3" : "#FAFAFA", color: on ? "#B07848" : "#5a4a3a" }}>
                      <span className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: on ? "#B07848" : "transparent", border: on ? "none" : "1.5px solid #D4BFA0" }}>
                        {on && <Check className="w-3 h-3 text-white" />}
                      </span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 6 — Add-ons */}
          {step === 5 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>Optional rentable extras guests can add at checkout.</p>
              {form.addons.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input placeholder="Item name (e.g. Extra towels)" value={a.name} onChange={(e) => { const next = [...form.addons]; next[i] = { ...a, name: e.target.value }; set({ addons: next }); }} className={field} style={fieldStyle} />
                  <input type="number" placeholder="₱/night" value={a.price} onChange={(e) => { const next = [...form.addons]; next[i] = { ...a, price: e.target.value }; set({ addons: next }); }} className="w-28 rounded-xl border px-3 py-2 text-sm outline-none" style={fieldStyle} />
                  <button type="button" onClick={() => set({ addons: form.addons.filter((_, j) => j !== i) })} title="Remove" className="p-2 rounded-lg flex-shrink-0" style={{ color: "#991b1b" }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => set({ addons: [...form.addons, { name: "", price: "" }] })}
                className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#B07848" }}>
                <Plus className="w-4 h-4" /> Add item
              </button>
            </div>
          )}

          {/* Step 7 — Images */}
          {step === 6 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>Gallery photos shown on the storefront listing.</p>
              {existingImages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#8B6344" }}>Current photos</p>
                  <div className="grid grid-cols-4 gap-2">
                    {existingImages.map((img, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border" style={{ borderColor: "#EDE3D2", aspectRatio: "1" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.image_url} alt={`Current ${i + 1}`} title="Click to view full image" onClick={() => window.open(img.image_url, "_blank", "noopener,noreferrer")} className="w-full h-full object-cover" style={{ cursor: "zoom-in" }} />
                        <button type="button" onClick={() => setExistingImages(existingImages.filter((_, j) => j !== i))} title="Remove" className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed cursor-pointer py-8" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAF7" }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F7F0E3" }}>
                  <Plus className="w-5 h-5" style={{ color: "#B07848" }} strokeWidth={1.75} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "#B07848" }}>Click to upload photos</span>
                <span className="text-xs" style={{ color: "#C9B79E" }}>JPG or PNG · multiple allowed</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { readFiles(e.target.files, (urls) => set({ haven_images: [...form.haven_images, ...urls] })); e.target.value = ""; }} />
              </label>
              {form.haven_images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {form.haven_images.map((src, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border" style={{ borderColor: "#EDE3D2", aspectRatio: "1" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Photo ${i + 1}`} title="Click to view full image" onClick={() => window.open(src, "_blank", "noopener,noreferrer")} className="w-full h-full object-cover" style={{ cursor: "zoom-in" }} />
                      <button type="button" onClick={() => set({ haven_images: form.haven_images.filter((_, j) => j !== i) })} title="Remove" className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 8 — Photo Tour */}
          {step === 7 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>One or more photos per area. Required areas are marked.</p>
              {PHOTO_TOUR.map((cat) => {
                const imgs = form.photo_tour_images[cat.key] || [];
                const existing = existingTours.filter((t) => t.category === cat.key);
                return (
                  <div key={cat.key} className="rounded-xl border p-3" style={{ borderColor: "#EDE3D2" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                        {cat.label} {cat.required && <span style={{ color: "#B07848" }}>*</span>}
                      </p>
                      <label className="text-xs font-semibold cursor-pointer flex items-center gap-1" style={{ color: "#B07848" }}>
                        <Plus className="w-3.5 h-3.5" /> Add
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { readFiles(e.target.files, (urls) => set({ photo_tour_images: { ...form.photo_tour_images, [cat.key]: [...imgs, ...urls] } })); e.target.value = ""; }} />
                      </label>
                    </div>
                    {(existing.length > 0 || imgs.length > 0) && (
                      <div className="grid grid-cols-5 gap-2">
                        {existing.map((t, i) => (
                          <div key={`e${i}`} className="relative rounded-lg overflow-hidden border" style={{ borderColor: "#EDE3D2", aspectRatio: "1" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={t.image_url} alt={`${cat.label} current ${i + 1}`} title="Click to view full image" onClick={() => window.open(t.image_url, "_blank", "noopener,noreferrer")} className="w-full h-full object-cover" style={{ cursor: "zoom-in" }} />
                            <button type="button" onClick={() => setExistingTours(existingTours.filter((x) => x !== t))} title="Remove" className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                        {imgs.map((src, i) => (
                          <div key={i} className="relative rounded-lg overflow-hidden border" style={{ borderColor: "#EDE3D2", aspectRatio: "1" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`${cat.label} ${i + 1}`} title="Click to view full image" onClick={() => window.open(src, "_blank", "noopener,noreferrer")} className="w-full h-full object-cover" style={{ cursor: "zoom-in" }} />
                            <button type="button" onClick={() => set({ photo_tour_images: { ...form.photo_tour_images, [cat.key]: imgs.filter((_, j) => j !== i) } })} title="Remove" className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 9 — Video */}
          {step === 8 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#8B6344" }}>Optional links shown on the listing page.</p>
              <div>
                <label className={labelCls} style={labelStyle}>YouTube URL</label>
                <input placeholder="https://youtube.com/watch?v=…" value={form.youtube_url} onChange={(e) => set({ youtube_url: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Virtual tour URL</label>
                <input placeholder="https://… (optional)" value={form.virtual_tour_url} onChange={(e) => set({ virtual_tour_url: e.target.value })} className={`${field} mt-1`} style={fieldStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between gap-2" style={{ borderColor: "#EDE3D2" }}>
          <button type="button" onClick={back} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#EDE3D2", backgroundColor: "#ffffff" }}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>Next</button>
          ) : (
            <button type="button" onClick={submit} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Haven")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
