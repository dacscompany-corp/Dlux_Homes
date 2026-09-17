"use client";

import { useState } from "react";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

/**
 * The signed-in half of "we recommend changing this password" — the line the
 * confirmation email prints next to the shared starting password. Without this
 * card the only way to change it was to sign out and use the emailed reset
 * link, which is the opposite of what that email tells the guest to do.
 *
 * Styled the way the rest of my-bookings is: inline styles off the theme vars,
 * with a scoped <style> block for the bits inline styles can't reach.
 */
export default function ChangePasswordCard({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setCurrent(""); setNext(""); setConfirm("");
    setError(null); setReveal(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Could not change your password. Please try again.");
        return;
      }
      setDone(true);
      close();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 40, background: "var(--white)", border: "1px solid var(--line)", borderRadius: 20, padding: "22px 24px" }}>
      <style>{`
        .cp-input { width: 100%; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 14px; font-family: inherit; }
        .cp-input:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
        .cp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 620px) { .cp-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 6 }}>
            Account security
          </div>
          <div className="serif" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-.02em" }}>Password</div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 0", maxWidth: "58ch" }}>
            {done
              ? "Your password is updated. Use the new one next time you sign in."
              : "Still using the password from your confirmation email? Change it to one only you know."}
          </p>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() => { setOpen(true); setDone(false); }}
            style={{ padding: "11px 20px", borderRadius: 999, background: "var(--ink)", color: "var(--white)", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Change password
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Lets a password manager attach the saved credential to this form. */}
          <input type="email" name="email" value={email || ""} readOnly hidden autoComplete="username" />

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>Current password</span>
            <input
              id="cp-current"
              className="cp-input"
              type={reveal ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <div className="cp-grid">
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>New password</span>
              <input
                id="cp-new"
                className="cp-input"
                type={reveal ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>Repeat new password</span>
              <input
                id="cp-confirm"
                className="cp-input"
                type={reveal ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
              <input id="cp-reveal" type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
              Show passwords
            </label>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              At least {MIN_PASSWORD_LENGTH} characters.
            </span>
          </div>

          {error && (
            <div role="alert" style={{ background: "#EFD9D4", color: "#7A2B18", fontSize: 13, padding: "10px 13px", borderRadius: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: "11px 20px", borderRadius: 999, background: "var(--ink)", color: "var(--white)", fontSize: 14, fontWeight: 600, border: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
            <button
              type="button"
              onClick={close}
              style={{ padding: "11px 18px", borderRadius: 999, background: "transparent", color: "var(--ink-2)", fontSize: 14, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}
            >
              Cancel
            </button>
            <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "underline", marginLeft: "auto" }}>
              Forgot your current password?
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
