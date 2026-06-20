"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(!token);

  // password strength / requirements
  const has8 = password.length >= 8;
  const hasNum = /[0-9]/.test(password);
  const hasUp = /[A-Z]/.test(password);
  const hasSym = /[^A-Za-z0-9]/.test(password);
  const score = [has8, hasNum, hasUp, hasSym].filter(Boolean).length;
  const match = password.length > 0 && password === confirm;
  // Gate matches the backend policy (8+ chars). The strength meter and checklist
  // below stay as guidance only, not a hard block.
  const canSubmit = has8 && match;

  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["#c9c1b2", "#b8754a", "#b8754a", "#7a8c5a", "#5a7a4a"];
  const bar = (idx: number) => (score > idx ? colors[score] : "#e8e1d2");
  const checkColor = (ok: boolean) => (ok ? "#5a7a4a" : "#c9c1b2");
  const confirmBorder = confirm.length === 0 ? "#d9d1c2" : match ? "#7a8c5a" : "#b8754a";
  const showMismatch = confirm.length > 0 && !match;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!token) { setExpired(true); return; }
    if (!canSubmit) {
      if (!has8) toast.error("Password must be at least 8 characters");
      else toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (/expired|invalid/i.test(data?.error || "")) { setExpired(true); }
        else toast.error(data?.error || "Could not reset password");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="si-formwrap">
      {expired ? (
        /* expired / invalid state */
        <div>
          <div className="si-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h2>This link has expired.</h2>
          <p className="si-lead" style={{ marginBottom: 32 }}>Reset links are valid for a limited time. Request a new one and we&rsquo;ll send it to your email right away.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link href="/forgot-password" className="si-cta">
              <span>Request a new link</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
            <Link href="/login" className="si-back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      ) : done ? (
        /* success state */
        <div>
          <div className="si-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2>Password updated.</h2>
          <p className="si-lead" style={{ marginBottom: 32 }}>You&rsquo;re all set. Sign in with your new password to pick up where you left off.</p>
          <Link href="/login" className="si-cta">
            <span>Continue to sign in</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      ) : (
        /* form state */
        <div>
          <h2>Set a new password</h2>
          <p className="si-lead">Choose a strong password for your account &mdash; one you&rsquo;ll remember and no one else would guess.</p>

          <form className="si-form" onSubmit={handleSubmit}>
            <label className="si-label">
              <span className="si-label__txt">New password</span>
              <div className="si-pwwrap">
                <input
                  className="si-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" className="si-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>

              {/* strength meter */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <div className="si-strbar" style={{ background: bar(0) }} />
                  <div className="si-strbar" style={{ background: bar(1) }} />
                  <div className="si-strbar" style={{ background: bar(2) }} />
                  <div className="si-strbar" style={{ background: bar(3) }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8a8276" }}>
                  <span>Strength</span>
                  <span style={{ color: password.length === 0 ? "#8a8276" : colors[score] }}>
                    {password.length === 0 ? "—" : labels[score]}
                  </span>
                </div>
              </div>
            </label>

            <label className="si-label">
              <span className="si-label__txt">Confirm new password</span>
              <input
                className="si-input"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{ borderBottomColor: confirmBorder }}
                autoComplete="new-password"
              />
              {showMismatch && <span style={{ fontSize: 12, color: "#b8754a" }}>Passwords don&rsquo;t match yet.</span>}
            </label>

            {/* checklist */}
            <ul className="si-checklist">
              <li style={{ color: checkColor(has8) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>8+ characters</span>
              </li>
              <li style={{ color: checkColor(hasNum) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>One number</span>
              </li>
              <li style={{ color: checkColor(hasUp) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>One uppercase</span>
              </li>
              <li style={{ color: checkColor(hasSym) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>One symbol</span>
              </li>
            </ul>

            <button
              type="submit"
              className="si-submit"
              disabled={!canSubmit || loading}
            >
              <span>{loading ? "Updating…" : "Update password"}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="si-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&display=swap');

        .si-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          background: #faf7f1;
          font-family: 'Geist', system-ui, -apple-system, sans-serif;
          color: #1f1b16;
        }
        .si-root * { box-sizing: border-box; }

        /* LEFT brand panel */
        .si-aside {
          position: relative;
          background: #b8754a;
          color: #faf7f1;
          padding: 56px 64px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }
        .si-aside__texture {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(circle at 20% 15%, rgba(255,255,255,0.06), transparent 45%),
            radial-gradient(circle at 85% 90%, rgba(0,0,0,0.10), transparent 50%);
        }
        .si-wordmark { position: relative; display: flex; align-items: center; gap: 12px; }
        .si-wordmark__d {
          width: 36px; height: 36px;
          border: 1px solid rgba(250,247,241,0.55); border-radius: 4px;
          display: grid; place-items: center;
          font-family: 'Instrument Serif', serif; font-size: 20px; font-style: italic; letter-spacing: -0.02em;
        }
        .si-wordmark__name { font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.85; }
        .si-headline { position: relative; max-width: 460px; }
        .si-headline h1 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 64px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 24px;
        }
        .si-headline h1 em { font-style: italic; opacity: 0.85; }
        .si-headline p { font-size: 16px; line-height: 1.55; opacity: 0.82; margin: 0; max-width: 380px; }

        /* step progress */
        .si-steps { position: relative; display: flex; align-items: center; gap: 12px; font-size: 13px; opacity: 0.85; }
        .si-steps__item { display: flex; align-items: center; gap: 8px; }
        .si-steps__dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(250,247,241,0.4); }
        .si-steps__dot.is-active { background: #faf7f1; }
        .si-steps__item.is-muted span { opacity: 0.6; }
        .si-steps__line { width: 24px; height: 1px; background: rgba(250,247,241,0.3); }

        /* RIGHT form panel */
        .si-main { display: flex; flex-direction: column; padding: 40px 56px; }
        .si-top { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #6b6358; }
        .si-top__signup a { color: #1f1b16; text-decoration: none; border-bottom: 1px solid #1f1b16; padding-bottom: 1px; }
        .si-back {
          display: inline-flex; align-items: center; gap: 8px; color: #6b6358; text-decoration: none;
          font-size: 14px; transition: color .15s;
        }
        .si-back:hover { color: #1f1b16; }
        .si-back svg { transition: transform .2s; }
        .si-back:hover svg { transform: translateX(-3px); }
        .si-formwrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          max-width: 400px; width: 100%; margin: 0 auto; padding: 48px 0;
        }
        .si-formwrap h2 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 36px; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 8px;
        }
        .si-lead { font-size: 15px; color: #6b6358; margin: 0 0 40px; line-height: 1.55; }
        .si-form { display: flex; flex-direction: column; gap: 24px; }
        .si-label { display: flex; flex-direction: column; gap: 8px; }
        .si-label__txt { font-size: 13px; color: #6b6358; letter-spacing: 0.02em; }
        .si-input {
          font-family: inherit; font-size: 15px; color: #1f1b16; background: transparent;
          border: 0; border-bottom: 1px solid #d9d1c2; padding: 10px 0; transition: border-color 0.2s; width: 100%;
        }
        .si-input:focus { outline: none; border-bottom-color: #b8754a; }
        .si-input::placeholder { color: #b8b1a6; }
        .si-input:-webkit-autofill {
          -webkit-text-fill-color: #1f1b16;
          -webkit-box-shadow: 0 0 0 1000px #faf7f1 inset;
          transition: background-color 9999s ease-in-out 0s;
        }
        .si-pwwrap {
          position: relative; display: flex; align-items: center;
          border-bottom: 1px solid #d9d1c2; transition: border-color 0.2s;
        }
        .si-pwwrap:focus-within { border-bottom-color: #b8754a; }
        .si-pwwrap .si-input { border-bottom: 0; flex: 1; letter-spacing: 0.02em; }
        .si-eye {
          background: transparent; border: 0; color: #6b6358; cursor: pointer;
          padding: 6px; display: grid; place-items: center; transition: color .15s;
        }
        .si-eye:hover { color: #1f1b16; }
        .si-strbar { flex: 1; height: 2px; transition: background 0.2s; }
        .si-checklist {
          list-style: none; padding: 0; margin: 4px 0 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px;
        }
        .si-checklist li { display: flex; align-items: center; gap: 6px; transition: color .2s; }
        .si-submit {
          margin-top: 16px; background: #1f1b16; color: #faf7f1; border: 0; padding: 16px 24px;
          font-family: inherit; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: background 0.2s;
        }
        .si-submit:hover:not(:disabled) { background: #b8754a; }
        .si-submit:disabled { background: #c9c1b2; cursor: not-allowed; }
        .si-cta {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: #1f1b16; color: #faf7f1; text-decoration: none; padding: 16px 24px;
          font-size: 15px; font-weight: 500; transition: background 0.2s;
        }
        .si-cta:hover { background: #b8754a; }
        .si-back {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          color: #6b6358; text-decoration: none; font-size: 14px; padding: 8px; transition: color .15s;
        }
        .si-back:hover { color: #1f1b16; }
        .si-icon {
          width: 44px; height: 44px; border-radius: 50%; border: 1px solid #b8754a;
          display: grid; place-items: center; margin-bottom: 24px;
        }
        .si-bottom { display: flex; justify-content: flex-end; font-size: 12px; color: #8a8276; }
        .si-bottom__links { display: flex; gap: 20px; }
        .si-bottom a { color: inherit; text-decoration: none; transition: color .15s; }
        .si-bottom a:hover { color: #1f1b16; }

        @media (max-width: 900px) {
          .si-root { grid-template-columns: 1fr; }
          .si-aside { display: none; }
          .si-main { padding: 32px 24px; }
        }
      `}</style>

      {/* LEFT — brand panel */}
      <aside className="si-aside">
        <div className="si-aside__texture" />
        <div className="si-wordmark">
          <div className="si-wordmark__d">D</div>
          <div className="si-wordmark__name">D&rsquo; Lux Homes</div>
        </div>
        <div className="si-headline">
          <h1>A fresh <em>start.</em></h1>
          <p>Set a new password to unlock your account. Pick something you&rsquo;ll remember &mdash; and that no one else would guess.</p>
        </div>
        <div className="si-steps">
          <div className="si-steps__item is-muted">
            <div className="si-steps__dot" />
            <span>Request link</span>
          </div>
          <div className="si-steps__line" />
          <div className="si-steps__item">
            <div className="si-steps__dot is-active" />
            <span>New password</span>
          </div>
          <div className="si-steps__line" />
          <div className="si-steps__item is-muted">
            <div className="si-steps__dot" />
            <span>Sign in</span>
          </div>
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="si-main">
        <div className="si-top">
          <Link href="/login" className="si-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back</span>
          </Link>
          <span className="si-top__signup">Trouble?&nbsp;<Link href="/login">Sign in</Link></span>
        </div>

        <Suspense fallback={<div className="si-formwrap"><p className="si-lead">Loading…</p></div>}>
          <ResetPasswordForm />
        </Suspense>

        <div className="si-bottom">
          <div className="si-bottom__links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/help">Help</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
