"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { toast.error("Enter your email address"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      await res.json().catch(() => ({}));
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
          justify-content: flex-start;
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
        .si-headline { position: relative; max-width: 460px; margin: auto 0; }
        .si-headline h1 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 64px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 24px;
        }
        .si-headline h1 em { font-style: italic; opacity: 0.85; }
        .si-headline p { font-size: 16px; line-height: 1.55; opacity: 0.82; margin: 0; max-width: 380px; }

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
        .si-submit {
          margin-top: 16px; background: #1f1b16; color: #faf7f1; border: 0; padding: 16px 24px;
          font-family: inherit; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: background 0.2s;
        }
        .si-submit:hover:not(:disabled) { background: #b8754a; }
        .si-submit:disabled { opacity: 0.65; cursor: default; }
        .si-back {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          color: #6b6358; text-decoration: none; font-size: 14px; padding: 8px; transition: color .15s;
        }
        .si-back:hover { color: #1f1b16; }
        .si-ghost {
          background: transparent; border: 1px solid #d9d1c2; padding: 14px 24px;
          font-family: inherit; font-size: 14px; color: #1f1b16; cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .si-ghost:hover { border-color: #1f1b16; background: #f3eee2; }
        .si-icon {
          width: 44px; height: 44px; border-radius: 50%; border: 1px solid #b8754a;
          display: grid; place-items: center; margin-bottom: 24px;
        }
        .si-hint { font-size: 13px; color: #8a8276; margin: 0; text-align: center; }
        .si-hint a { color: #1f1b16; text-decoration: underline; cursor: pointer; }
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
          <h1>Forgot <em>something?</em></h1>
          <p>It happens. Enter the email tied to your account and we&rsquo;ll send a secure link to reset your password.</p>
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="si-main">
        <div className="si-top">
          <Link href="/login" className="si-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back</span>
          </Link>
          <span className="si-top__signup">Remembered it?&nbsp;<Link href="/login">Sign in</Link></span>
        </div>

        <div className="si-formwrap">
          {sent ? (
            <div>
              <div className="si-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <h2>Check your inbox.</h2>
              <p className="si-lead" style={{ marginBottom: 32 }}>
                If an account exists for <span style={{ color: "#1f1b16" }}>{email}</span>, we sent a link to reset your password. The link expires in 1 hour.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <button type="button" className="si-ghost" onClick={() => setSent(false)}>Use a different email</button>
                <p className="si-hint">
                  Didn&rsquo;t get it? Check spam, or{" "}
                  <a onClick={() => setSent(false)}>try again</a>.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <h2>Reset password</h2>
              <p className="si-lead">No worries. Type your email below and we&rsquo;ll send a link to set a new one.</p>

              <form className="si-form" onSubmit={handleSubmit}>
                <label className="si-label">
                  <span className="si-label__txt">Email</span>
                  <input
                    className="si-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>

                <button type="submit" className="si-submit" disabled={loading}>
                  <span>{loading ? "Sending…" : "Send reset link"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>

                <Link href="/login" className="si-back">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  <span>Back to sign in</span>
                </Link>
              </form>
            </div>
          )}
        </div>

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
