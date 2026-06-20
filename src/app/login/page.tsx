"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Where to land after sign-in (e.g. back to checkout). Defaults to My bookings.
  const [callbackUrl, setCallbackUrl] = useState("/my-bookings");
  // Back target — the room being booked (never the checkout, which would just
  // redirect back here). Falls back to the listing.
  const [backHref, setBackHref] = useState("/rooms");
  useEffect(() => {
    const cb = new URLSearchParams(window.location.search).get("callbackUrl");
    if (cb) {
      setCallbackUrl(cb);
      const rid = new URLSearchParams(cb.split("?")[1] || "").get("roomId");
      if (rid) setBackHref(`/rooms/${rid}`);
    }
  }, []);
  const isBooking = callbackUrl.includes("/checkout");

  const handleCredentials = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) { toast.error("Enter your email and password"); return; }
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res || res.error) { toast.error(res?.error || "Invalid email or password"); setLoading(false); return; }
      router.push(callbackUrl);
    } catch { toast.error("Something went wrong. Please try again."); setLoading(false); }
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
        .si-label__row { display: flex; justify-content: space-between; }
        .si-forgot { color: #6b6358; text-decoration: none; font-size: 13px; transition: color .15s; }
        .si-forgot:hover { color: #1f1b16; }
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
        .si-pwwrap .si-input { border-bottom: 0; flex: 1; letter-spacing: 0.06em; }
        .si-eye {
          background: transparent; border: 0; color: #6b6358; cursor: pointer;
          padding: 6px; display: grid; place-items: center; transition: color .15s;
        }
        .si-eye:hover { color: #1f1b16; }
        .si-check {
          display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f1b16;
          cursor: pointer; user-select: none; margin-top: 4px;
        }
        .si-check__box {
          position: relative; width: 16px; height: 16px; border: 1px solid #b8754a; border-radius: 3px;
          display: grid; place-items: center; transition: background 0.15s;
        }
        .si-check input { position: absolute; opacity: 0; pointer-events: none; }
        .si-submit {
          margin-top: 16px; background: #1f1b16; color: #faf7f1; border: 0; padding: 16px 24px;
          font-family: inherit; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: background 0.2s;
        }
        .si-submit:hover:not(:disabled) { background: #b8754a; }
        .si-submit:disabled { opacity: 0.65; cursor: default; }
        .si-divider {
          display: flex; align-items: center; gap: 16px; margin: 8px 0 0;
          color: #b8b1a6; font-size: 12px; letter-spacing: 0.12em;
        }
        .si-divider div { flex: 1; height: 1px; background: #e8e1d2; }
        .si-google {
          background: transparent; border: 1px solid #d9d1c2; padding: 14px 24px;
          font-family: inherit; font-size: 14px; color: #1f1b16; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.2s, background 0.2s;
        }
        .si-google:hover { border-color: #1f1b16; background: #f3eee2; }
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
          <h1>{isBooking ? <>Almost <em>there.</em></> : <>Welcome<em>.</em></>}</h1>
          <p>
            {isBooking
              ? "Sign in to confirm your booking and secure your stay all in one quiet place."
              : "Sign in to manage your bookings, guests, and properties all in one quiet place."}
          </p>
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="si-main">
        <div className="si-top">
          <Link href={backHref} className="si-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back</span>
          </Link>
          <span className="si-top__signup">New here?&nbsp;<Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Create an account</Link></span>
        </div>

        <div className="si-formwrap">
          <h2>Sign in</h2>
          <p className="si-lead">Enter your details to continue.</p>

          <form className="si-form" onSubmit={handleCredentials}>
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

            <label className="si-label">
              <span className="si-label__txt si-label__row">
                <span>Password</span>
                <Link href="/forgot-password" className="si-forgot">Forgot?</Link>
              </span>
              <div className="si-pwwrap">
                <input
                  className="si-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="si-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </label>

            <label className="si-check">
              <span className="si-check__box" style={{ background: remember ? "#b8754a" : "transparent" }}>
                {remember && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#faf7f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
              <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
              <span>Keep me signed in</span>
            </label>

            <button type="submit" className="si-submit" disabled={loading}>
              <span>{loading ? "Signing in…" : "Sign in"}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>

            <div className="si-divider">
              <div /><span>OR</span><div />
            </div>

            <button type="button" className="si-google" onClick={() => signIn("google", { callbackUrl })}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
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
