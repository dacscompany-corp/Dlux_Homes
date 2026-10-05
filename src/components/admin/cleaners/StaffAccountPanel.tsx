"use client";

// The cleaner's own account: profile details and password. Accounts are
// created by the Owner/CSR; from then on the cleaner keeps their contact
// details current and replaces the starting password from the welcome email.
// Shared by the desktop Profile page and the mobile account screen so both
// behave the same. Email and role stay read-only — they're set by the office.

import { useState } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import {
  useChangeMyPasswordMutation,
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  type MyProfile,
  type MyProfileUpdate,
} from "@/redux/api/employeeApi";
import { CLEANER_STRINGS, type CleanerLanguage } from "@/lib/cleaner-portal-strings";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

const INK = "#1f1b16";
const MUTED = "#6b6358";
const LINE = "#ece5d4";
const GOLD_INK = "#8a6a2f";

type Size = "mobile" | "desktop";
type Strings = (typeof CLEANER_STRINGS)["en"];

const errorText = (err: unknown, fallback: string) => {
  const e = err as { status?: number; data?: { error?: string } };
  if (e?.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return e?.data?.error || fallback;
};

function useStyles(size: Size) {
  const big = size === "mobile";
  const card: React.CSSProperties = {
    background: "#fff", border: `1px solid ${LINE}`, borderRadius: big ? 16 : 0, padding: big ? 18 : 24,
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: big ? 15 : 12, fontWeight: 600, color: "#8B6344", marginBottom: 6,
  };
  const input: React.CSSProperties = {
    width: "100%", height: big ? 52 : 40, padding: "0 12px", borderRadius: big ? 12 : 6,
    border: `1px solid ${LINE}`, background: "#FDFBF7", color: INK, fontSize: big ? 17 : 14, outline: "none",
  };
  const button = (busy: boolean): React.CSSProperties => ({
    height: big ? 54 : 42, padding: "0 18px", borderRadius: big ? 14 : 8, border: 0,
    background: INK, color: "#FAF7F1", font: `600 ${big ? 17 : 14}px var(--font-geist-sans), system-ui, sans-serif`,
    cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, width: big ? "100%" : "auto",
  });
  const heading = (Icon: React.ElementType, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ width: big ? 40 : 32, height: big ? 40 : 32, borderRadius: 10, background: "#F7F0E3", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon style={{ width: big ? 22 : 18, height: big ? 22 : 18, color: GOLD_INK }} strokeWidth={2} />
      </span>
      <span style={{ fontSize: big ? 18 : 15, fontWeight: 700, color: INK }}>{text}</span>
    </div>
  );
  return { big, card, label, input, button, heading };
}

export default function StaffAccountPanel({ lang = "en", size = "desktop" }: { lang?: CleanerLanguage; size?: Size }) {
  const t = CLEANER_STRINGS[lang];
  const { data: profile, isLoading, isError, refetch } = useGetMyProfileQuery();
  const s = useStyles(size);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: s.big ? 16 : 20 }}>
      {isLoading ? (
        <div style={{ ...s.card, color: MUTED, fontSize: s.big ? 16 : 13 }}>…</div>
      ) : isError || !profile ? (
        <div style={{ ...s.card, color: MUTED, fontSize: s.big ? 16 : 13 }}>
          {t.accLoadFailed}{" "}
          <button type="button" onClick={() => refetch()} style={{ border: 0, background: "none", color: GOLD_INK, fontWeight: 600, cursor: "pointer", fontSize: "inherit" }}>
            {t.retry}
          </button>
        </div>
      ) : (
        // Keyed on the record so the form starts from the saved values without
        // copying them into state inside an effect.
        <ProfileForm key={profile.id} profile={profile} t={t} size={size} />
      )}
      <PasswordForm t={t} size={size} />
    </div>
  );
}

function ProfileForm({ profile, t, size }: { profile: MyProfile; t: Strings; size: Size }) {
  const s = useStyles(size);
  const { update: updateSession } = useSession();
  const [save, { isLoading: saving }] = useUpdateMyProfileMutation();
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    street_address: profile.street_address ?? "",
    city: profile.city ?? "",
    zip_code: profile.zip_code ?? "",
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await save(form as MyProfileUpdate).unwrap();
      // Refresh the name shown in the header/sidebar without a re-login.
      await updateSession({ name: `${saved.first_name} ${saved.last_name}`.trim() });
      toast.success(t.accSaved);
    } catch (err) {
      toast.error(errorText(err, t.accFailed));
    }
  };

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label style={{ display: "block" }}>
      <span style={s.label}>{label}</span>
      <input value={form[key]} onChange={set(key)} style={s.input} {...props} />
    </label>
  );

  return (
    <form onSubmit={submit} style={s.card}>
      {s.heading(UserRound, t.accDetails)}
      <div style={{ display: "grid", gridTemplateColumns: s.big ? "1fr" : "1fr 1fr", gap: 12 }}>
        {field("first_name", t.accFirst, { required: true, maxLength: 100, autoComplete: "given-name" })}
        {field("last_name", t.accLast, { required: true, maxLength: 100, autoComplete: "family-name" })}
        {field("phone", t.accPhone, { type: "tel", maxLength: 20, autoComplete: "tel", inputMode: "tel" })}
        {field("city", t.accCity, { maxLength: 100, autoComplete: "address-level2" })}
        <div style={{ gridColumn: s.big ? undefined : "1 / -1" }}>
          {field("street_address", t.accStreet, { maxLength: 300, autoComplete: "street-address" })}
        </div>
        {field("zip_code", t.accZip, { maxLength: 20, autoComplete: "postal-code", inputMode: "numeric" })}
      </div>

      <div style={{ marginTop: 14 }}>
        <span style={s.label}>{t.accEmail}</span>
        <input value={profile.email} readOnly disabled style={{ ...s.input, background: "#F4EFE6", color: MUTED }} />
        <p style={{ fontSize: s.big ? 14 : 12, color: MUTED, margin: "8px 0 0", lineHeight: 1.45 }}>{t.accManaged}</p>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={saving} style={s.button(saving)}>{saving ? t.accSaving : t.accSave}</button>
      </div>
    </form>
  );
}

function PasswordForm({ t, size }: { t: Strings; size: Size }) {
  const s = useStyles(size);
  const [changePassword, { isLoading: changing }] = useChangeMyPasswordMutation();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast.error(t.accMismatch);
      return;
    }
    try {
      await changePassword({ currentPassword: form.current, newPassword: form.next }).unwrap();
      setForm({ current: "", next: "", confirm: "" });
      toast.success(t.accChanged);
    } catch (err) {
      toast.error(errorText(err, t.accFailed));
    }
  };

  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label style={{ display: "block" }}>
      <span style={s.label}>{label}</span>
      <input type="password" value={form[key]} onChange={set(key)} required autoComplete={autoComplete}
        minLength={key === "current" ? undefined : MIN_PASSWORD_LENGTH} style={s.input} />
    </label>
  );

  return (
    <form onSubmit={submit} style={s.card}>
      {s.heading(KeyRound, t.accPassword)}
      <p style={{ fontSize: s.big ? 15 : 13, color: MUTED, margin: "0 0 14px", lineHeight: 1.45 }}>{t.accPasswordHint}</p>
      <div style={{ display: "grid", gap: 12 }}>
        {field("current", t.accCurrent, "current-password")}
        {field("next", t.accNew, "new-password")}
        {field("confirm", t.accConfirm, "new-password")}
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={changing} style={s.button(changing)}>{changing ? t.accChanging : t.accChange}</button>
      </div>
    </form>
  );
}
