"use client";

import { useRef, useState } from "react";
import { imageFileError, MAX_IMAGE_MB } from "@/lib/validateImageFile";
import { PROMO_STAY_TYPE_OPTIONS, discountBadgeText } from "@/lib/promo-offer";
import type { PromoStayType, PromotionRedemption } from "@/redux/api/promotionsApi";

// Create/edit promotion modal, shared by the Owner and CSR dashboards (both
// drive the same promotions CRUD, and previously carried two copies of this
// form that had to be edited in lockstep).
//
// The form is deliberately question-shaped rather than field-shaped: owners
// aren't marketers, and the old "Discount type / Value" pair gave no sense of
// what a guest would end up seeing. The preview column answers that as you type.

export type PromotionFormState = {
  title: string;
  description: string;
  discount_type: "" | "percentage" | "fixed";
  discount_value: string;
  start_date: string;
  end_date: string;
  applies_to: PromoStayType[];
  redemption: PromotionRedemption;
  discount_code: string;
};

const REDEMPTION_OPTIONS: { key: PromotionRedemption; label: string; hint: string }[] = [
  { key: "automatic", label: "Applied automatically", hint: "Guests just book — the lower price is already there." },
  { key: "voucher", label: "Voucher code", hint: "Guests enter a code at checkout." },
];

// Both delivery methods are capped at one redemption per guest account —
// vouchers via discount_users, automatic promos via promotion_users. Stated in
// the form because it's a rule owners are otherwise unaware they're setting.
const ONE_PER_GUEST_NOTE = "Either way, each guest account can use this offer once.";

// Mirrors normalizeCode() in the server action, so what the owner types is what
// gets saved and shown to guests.
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);

const ACCENT = "#b8754a";

const cardBase: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #ddd4c0",
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
  color: "#1f1b16",
  font: "inherit",
  width: "100%",
};
const cardOn: React.CSSProperties = {
  ...cardBase,
  border: `1px solid ${ACCENT}`,
  background: "#fdf6ee",
  boxShadow: `inset 0 0 0 1px ${ACCENT}`,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  fontFamily: "inherit",
  fontSize: 15,
  color: "#1f1b16",
  background: "#fff",
  border: "1px solid #ddd4c0",
  outline: "none",
};

const stepLabel: React.CSSProperties = {
  width: 26, height: 26, borderRadius: "50%", background: "#1f1b16",
  color: "#faf7f1", display: "grid", placeItems: "center",
  fontSize: 13, fontWeight: 600, flex: "none",
};

const STAY_HINTS: Record<PromoStayType, string> = {
  day: "Daytime use, no overnight",
  night: "Evening into the morning",
  overnight: "Full 24-hour stay",
};

const DISCOUNT_OPTIONS: { key: "percentage" | "fixed" | ""; label: string; hint: string }[] = [
  { key: "percentage", label: "Percent off", hint: "e.g. 20% off the rate" },
  { key: "fixed", label: "Peso amount off", hint: "e.g. ₱500 off" },
  { key: "", label: "No discount", hint: "Just an announcement" },
];

// Local-midnight day arithmetic — toISOString() would shift the date across the
// dateline for PH (UTC+8) any time before 08:00.
function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDay(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PromotionModal({
  open, editing, form, setForm, image, setImage, saving, onCancel, onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: PromotionFormState;
  setForm: React.Dispatch<React.SetStateAction<PromotionFormState>>;
  image: File | null;
  setImage: (f: File | null) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  // Object URL for the freshly-picked file so the preview column shows the real
  // photo rather than the placeholder hatch.
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const acceptFile = (f: File | null) => {
    if (!f) return;
    const err = imageFileError(f);
    if (err) { setImageError(err); return; }
    setImageError(null);
    setImage(f);
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  if (!open) return null;

  const none = form.discount_type === "";
  const pct = form.discount_type === "percentage";
  const amountNum = Number(form.discount_value);
  const hasDiscount = !none && !!form.discount_value && amountNum > 0;
  const badge = discountBadgeText(form.discount_type || null, form.discount_value) ?? "";
  const start = fmtDay(form.start_date);
  const end = fmtDay(form.end_date);
  const isVoucher = !none && form.redemption === "voucher";
  // Mirrors suggestCode() server-side so the placeholder shows the code the
  // owner will actually get if they leave the field blank.
  const suggestedCode = `${normalizeCode(form.title).slice(0, 16)}${form.discount_value ? normalizeCode(String(Math.round(amountNum || 0))) : ""}` || "PROMOCODE";
  // A voucher with no usable discount would save a code that discounts nothing.
  const ready = !!form.title.trim() && !!start && !!end && (!isVoucher || hasDiscount);

  const amountHelp = none
    ? "Not needed for an announcement."
    : pct
      ? `A ₱3,000 night becomes ₱${(3000 - Math.round((3000 * (amountNum || 0)) / 100)).toLocaleString()}.`
      : "";

  return (
    // p-4 rather than the design's 24px gutter: the admin shell renders at
    // zoom:1.1, so every gutter costs 10% more real estate than drawn and the
    // body is what gets squeezed.
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(31,27,22,.55)" }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 940, maxWidth: "100%", maxHeight: "100%", background: "#fff", border: "1px solid #e3dbc9", boxShadow: "0 24px 64px rgba(31,27,22,.28)", display: "flex", flexDirection: "column" }}
      >
        {/* header */}
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, padding: "22px 28px 18px", borderBottom: "1px solid #f1ebdd" }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 26, lineHeight: 1.05, color: "#1f1b16" }}>
              {editing ? "Edit this offer" : "Create an offer"}
            </div>
            <div style={{ fontSize: 14, color: "#6b6358", marginTop: 7, maxWidth: 560 }}>
              Fill this in and guests will see your offer on the website. Nothing goes live until you press{" "}
              <strong style={{ fontWeight: 600, color: "#1f1b16" }}>{editing ? "Save changes" : "Publish offer"}</strong>.
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="promo-x"
            style={{ display: "grid", placeItems: "center", width: 32, height: 32, border: "1px solid #ece5d4", background: "#fff", color: "#8a8276", fontSize: 15, cursor: "pointer", flex: "none" }}>
            ✕
          </button>
        </div>

        <div className="promo-body" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 336px" }}>
          {/* ── form column ── */}
          <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 26, overflow: "auto" }}>

            {/* 1 — identity */}
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 14 }}>
              <div style={stepLabel}>1</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1f1b16" }}>What is the offer called?</div>
                  <div style={{ fontSize: 13, color: "#8a8276", marginTop: 2 }}>This is the headline guests read first. Keep it short.</div>
                </div>
                <input aria-label="Offer name" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Summer Sale" className="promo-input" style={inputStyle} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", marginBottom: 6 }}>
                    One line about it <span style={{ color: "#8a8276", fontWeight: 400 }}>— optional</span>
                  </div>
                  <input aria-label="One line about the offer" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Book 3 nights and save 20%" className="promo-input" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", marginBottom: 6 }}>
                    Photo <span style={{ color: "#8a8276", fontWeight: 400 }}>— optional, makes the offer stand out</span>
                  </div>
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); }}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, border: `1px dashed ${dragging ? ACCENT : "#ddd4c0"}`, background: dragging ? "#fdf6ee" : "#fdfbf6", cursor: "pointer" }}
                  >
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="" style={{ width: 56, height: 44, flex: "none", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 56, height: 44, flex: "none", background: "repeating-linear-gradient(135deg, #f3ecdd 0 6px, #eae1cd 6px 12px)" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: "#1f1b16" }}>
                        {image
                          ? <span style={{ wordBreak: "break-all" }}>{image.name}</span>
                          : <>Drag a photo here, or <span style={{ color: ACCENT, fontWeight: 500, textDecoration: "underline" }}>browse your files</span></>}
                      </div>
                      <div style={{ fontSize: 12, color: imageError ? "#991b1b" : "#8a8276", marginTop: 3 }}>
                        {imageError || `JPG or PNG, up to ${MAX_IMAGE_MB} MB. Wide photos look best.`}
                      </div>
                    </div>
                    {image && (
                      <button type="button" aria-label="Remove photo"
                        onClick={(e) => { e.stopPropagation(); setImage(null); setImageError(null); setImagePreview((p) => { if (p) URL.revokeObjectURL(p); return null; }); }}
                        style={{ flex: "none", border: "1px solid #ece5d4", background: "#fff", color: "#8a8276", padding: "5px 9px", fontSize: 12, cursor: "pointer", font: "inherit" }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} aria-label="Offer photo" type="file" accept="image/*" hidden
                    onChange={(e) => { acceptFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </div>
              </div>
            </div>

            {/* 2 — discount */}
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 14 }}>
              <div style={stepLabel}>2</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1f1b16" }}>How much do guests save?</div>
                  <div style={{ fontSize: 13, color: "#8a8276", marginTop: 2 }}>Choose one. Pick &ldquo;No discount&rdquo; if this is just an announcement.</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {DISCOUNT_OPTIONS.map((o) => (
                    <button key={o.key || "none"} type="button" aria-pressed={form.discount_type === o.key}
                      onClick={() => setForm((f) => ({ ...f, discount_type: o.key }))}
                      style={form.discount_type === o.key ? cardOn : cardBase}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div>
                      <div style={{ fontSize: 12, marginTop: 3, opacity: 0.75 }}>{o.hint}</div>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", width: 96 }}>Amount off</div>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid #ddd4c0", background: "#fff", opacity: none ? 0.45 : 1 }}>
                    <span style={{ padding: "0 10px", fontSize: 15, color: "#8a8276" }}>{pct ? "%" : "₱"}</span>
                    <input aria-label="Amount off" type="number" min="0" disabled={none} value={form.discount_value}
                      onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} placeholder="20"
                      style={{ width: 96, padding: "11px 12px 11px 0", fontFamily: "inherit", fontSize: 15, color: "#1f1b16", border: 0, outline: "none", background: "transparent" }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8a8276", lineHeight: 1.45, flex: 1, minWidth: 180 }}>
                    {none ? "" : pct ? "off the nightly rate." : "off the booking total."} {amountHelp}
                  </div>
                </div>

                {/* Delivery method — only meaningful once there's a discount to
                    deliver. An announcement has nothing to redeem. */}
                {!none && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c" }}>How do guests get it?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                      {REDEMPTION_OPTIONS.map((o) => (
                        <button key={o.key} type="button" aria-pressed={form.redemption === o.key}
                          onClick={() => setForm((f) => ({ ...f, redemption: o.key }))}
                          style={form.redemption === o.key ? cardOn : cardBase}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div>
                          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.75 }}>{o.hint}</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "#8a8276", lineHeight: 1.45 }}>{ONE_PER_GUEST_NOTE}</div>
                    {form.redemption === "voucher" && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", marginBottom: 6 }}>
                          Code <span style={{ color: "#8a8276", fontWeight: 400 }}>— leave blank and we&rsquo;ll make one from the title</span>
                        </div>
                        <input aria-label="Voucher code" value={form.discount_code}
                          onChange={(e) => setForm((f) => ({ ...f, discount_code: normalizeCode(e.target.value) }))}
                          placeholder={suggestedCode} className="promo-input"
                          style={{ ...inputStyle, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: ".08em" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3 — window */}
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 14 }}>
              <div style={stepLabel}>3</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1f1b16" }}>When should guests see it?</div>
                  <div style={{ fontSize: 13, color: "#8a8276", marginTop: 2 }}>It appears on the first day and disappears by itself after the last day.</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", marginBottom: 6 }}>First day</div>
                    <input aria-label="First day" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="promo-input" style={{ ...inputStyle, padding: "10px 12px" }} />
                  </div>
                  <div style={{ paddingBottom: 11, fontSize: 13, color: "#8a8276" }}>to</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#4a443c", marginBottom: 6 }}>Last day</div>
                    <input aria-label="Last day" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="promo-input" style={{ ...inputStyle, padding: "10px 12px" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "This weekend", from: 0, to: 2 },
                    { label: "Next 7 days", from: 0, to: 7 },
                    { label: "Next 30 days", from: 0, to: 30 },
                  ].map((p) => (
                    <button key={p.label} type="button" className="promo-preset"
                      onClick={() => setForm((f) => ({ ...f, start_date: addDays(p.from), end_date: addDays(p.to) }))}
                      style={{ padding: "6px 12px", fontSize: 12.5, color: "#4a443c", background: "#f7f2e7", border: "1px solid #ece5d4", cursor: "pointer", font: "inherit" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4 — stay-type scope */}
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 14 }}>
              <div style={stepLabel}>4</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1f1b16" }}>Which stays does it apply to?</div>
                  <div style={{ fontSize: 13, color: "#8a8276", marginTop: 2 }}>Tick every stay the offer covers. Leave all unticked to apply it to any stay.</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PROMO_STAY_TYPE_OPTIONS.map(({ value, label }) => {
                    const on = form.applies_to.includes(value);
                    return (
                      <button key={value} type="button" aria-pressed={on}
                        onClick={() => setForm((f) => ({
                          ...f,
                          applies_to: f.applies_to.includes(value) ? f.applies_to.filter((x) => x !== value) : [...f.applies_to, value],
                        }))}
                        style={on ? cardOn : cardBase}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ display: "grid", placeItems: "center", width: 17, height: 17, fontSize: 11, color: "#fff", border: `1px solid ${on ? ACCENT : "#cfc6b2"}`, background: on ? ACCENT : "#fff" }}>{on ? "✓" : ""}</span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                        </div>
                        <div style={{ fontSize: 12, marginTop: 5, color: "#8a8276" }}>{STAY_HINTS[value]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── live preview ── */}
          {/* Tighter than the 24px/14px/108px the design draws, so the column
              fits without its own scrollbar on a laptop viewport once zoom:1.1
              is applied. Two independent scrollbars read as a rendering bug. */}
          <div className="promo-preview" style={{ borderLeft: "1px solid #f1ebdd", background: "#fbf8f1", padding: 20, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8a8276" }}>What guests will see</div>
              <div style={{ fontSize: 12.5, color: "#6b6358", marginTop: 5 }}>Updates as you type.</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ height: 96, background: "repeating-linear-gradient(135deg, #f3ecdd 0 8px, #eae1cd 8px 16px)", display: "grid", placeItems: "center", fontFamily: "'Geist Mono', monospace", fontSize: 10.5, color: "#9b9083" }}>offer photo</div>
              )}
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, lineHeight: 1.1, color: "#1f1b16" }}>{form.title || "Summer Sale"}</div>
                  {hasDiscount && (
                    <span style={{ flex: "none", padding: "4px 9px", fontSize: 12, fontWeight: 600, color: "#fff", background: ACCENT, whiteSpace: "nowrap" }}>{badge}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#6b6358", marginTop: 7, lineHeight: 1.45 }}>{form.description || "Book 3 nights and save 20%"}</div>
                <div style={{ fontSize: 12, color: "#8a8276", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1ebdd" }}>
                  {start && end ? `Available ${start} – ${end}` : "Pick your dates in step 3"}
                </div>
                {hasDiscount && (
                  <div style={{ fontSize: 11.5, color: "#4a443c", marginTop: 8 }}>
                    {isVoucher
                      ? <>Code <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: ".06em", color: "#1f1b16" }}>{form.discount_code || suggestedCode}</span> at checkout</>
                      : "Applied automatically — no code needed"}
                  </div>
                )}
                {form.applies_to.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {PROMO_STAY_TYPE_OPTIONS.filter((o) => form.applies_to.includes(o.value)).map((o) => (
                      <span key={o.value} style={{ padding: "4px 9px", fontSize: 11.5, color: "#8B6344", border: "1px solid #e7d9c4", background: "#fdf8ee" }}>{o.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: "#f4efe3", borderLeft: "3px solid #D4A96A" }}>
              <div style={{ fontSize: 12.5, color: "#4a443c", lineHeight: 1.5 }}>
                {!start || !end
                  ? "Add the dates and this offer is ready to publish."
                  : `Once published, guests see this from ${start} until ${end}, then it hides itself.`}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 28px", borderTop: "1px solid #f1ebdd", background: "#fff" }}>
          <div style={{ fontSize: 12.5, color: "#8a8276" }}>
            {ready
              ? "Ready to publish — you can edit or switch it off any time."
              : isVoucher && !hasDiscount
                ? "A voucher needs an amount above zero."
                : "Needed before publishing: a name and both dates."}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onCancel} className="promo-cancel"
              style={{ padding: "11px 18px", fontSize: 14, fontWeight: 500, color: "#6b6358", border: "1px solid #ddd4c0", background: "#fff", cursor: "pointer", font: "inherit" }}>
              Cancel
            </button>
            <button type="button" onClick={onSubmit} disabled={saving} className="promo-publish"
              style={{ padding: "11px 20px", fontSize: 14, fontWeight: 600, color: "#faf7f1", background: "#1f1b16", border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, font: "inherit" }}>
              {saving ? "Saving…" : editing ? "Save changes" : "Publish offer"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .promo-input:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}1f; }
        /* Thin, tinted scrollbars — the default chunky ones inside a two-column
           modal read as a rendering fault rather than as scroll affordances. */
        .promo-body > div { scrollbar-width: thin; scrollbar-color: #ddd4c0 transparent; }
        .promo-body > div::-webkit-scrollbar { width: 8px; }
        .promo-body > div::-webkit-scrollbar-track { background: transparent; }
        .promo-body > div::-webkit-scrollbar-thumb { background: #e3dbc9; border-radius: 999px; }
        .promo-body > div::-webkit-scrollbar-thumb:hover { background: #d3c8b0; }
        .promo-x:hover { background: #faf7f1; color: #1f1b16; }
        .promo-preset:hover { background: #f1e9d8; color: #1f1b16; }
        .promo-cancel:hover { background: #faf7f1; color: #1f1b16; }
        .promo-publish:hover:not(:disabled) { background: #322a20; }
        @media (max-width: 880px) {
          .promo-body { grid-template-columns: 1fr !important; }
          .promo-preview { border-left: none !important; border-top: 1px solid #f1ebdd; }
        }
      `}</style>
    </div>
  );
}
