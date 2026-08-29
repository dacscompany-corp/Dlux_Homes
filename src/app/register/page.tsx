"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import DluxMark from "@/components/brand/DluxMark";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/my-bookings");
  const [cbResolved, setCbResolved] = useState(false);
  // Back target — the room being booked. Falls back to the listing.
  const [backHref, setBackHref] = useState("/rooms");
  useEffect(() => {
    const cb = new URLSearchParams(window.location.search).get("callbackUrl");
    // Same-origin relative paths only — blocks an open redirect via
    // ?callbackUrl=https://evil.example (see login/page.tsx for detail).
    if (cb && cb.startsWith("/") && !cb.startsWith("//") && !cb.startsWith("/\\")) {
      setCallbackUrl(cb);
      const rid = new URLSearchParams(cb.split("?")[1] || "").get("roomId");
      if (rid) setBackHref(`/rooms/${rid}`);
    }
    setCbResolved(true);
  }, []);
  // Once authenticated (credentials or Google), land on the callbackUrl rather
  // than getting stranded on the default page. Wait for cbResolved so an already
  // signed-in visitor isn't redirected to the placeholder before we read the URL.
  const { status } = useSession();
  useEffect(() => {
    if (status === "authenticated" && cbResolved) router.replace(callbackUrl);
  }, [status, cbResolved, callbackUrl, router]);

  const handleRegister = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password) { toast.error("Please fill in all fields"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not create your account"); setLoading(false); return; }

      // Auto sign-in after successful registration.
      const login = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (!login || login.error) {
        toast.success("Account created! Please sign in.");
        router.push("/login");
        return;
      }
      toast.success("Welcome to D'Lux Homes!");
      router.push(callbackUrl);
    } catch {
      toast.error("Something went wrong. Please try again.");
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

        /* LEFT brand panel — the property's own living room, warmed to the brand tone */
        .si-aside {
          position: relative;
          background: #6b3f22;
          color: #faf7f1;
          padding: 56px 64px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
        }
        .si-aside__photo {
          position: absolute; inset: 0;
          object-fit: cover;
          z-index: 0;
        }
        /* Sepia wash: multiply lays the brand brown over the photo, then a bottom-up
           gradient darkens the copy area so the headline keeps its contrast. */
        .si-aside__texture {
          position: absolute; inset: 0; pointer-events: none; z-index: 1;
          background:
            linear-gradient(to top, rgba(74,42,22,0.82) 0%, rgba(120,72,40,0.45) 55%, rgba(150,95,55,0.30) 100%),
            rgba(150,96,52,0.55);
          mix-blend-mode: multiply;
        }
        .si-aside > *:not(.si-aside__photo):not(.si-aside__texture) { position: relative; z-index: 2; }
        .si-aside__head { display: flex; align-items: center; }
        .si-headline { max-width: 460px; margin: auto 0; }
        .si-headline h1 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 72px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 24px;
        }
        .si-headline h1 em { font-style: normal; }
        .si-headline p { font-size: 16px; line-height: 1.55; opacity: 0.9; margin: 0; max-width: 380px; }

        /* RIGHT form panel */
        .si-main { display: flex; flex-direction: column; padding: 40px 56px; }
        .si-top { display: flex; justify-content: space-between; align-items: center; font-size: 16px; color: #8a5a34; }
        .si-top__signup a { color: #6f4021; text-decoration: none; border-bottom: 1px solid #6f4021; padding-bottom: 2px; }
        .si-back {
          display: inline-flex; align-items: center; gap: 10px; color: #6f4021; text-decoration: none;
          font-size: 16px; transition: color .15s;
        }
        .si-back:hover { color: #3b2415; }
        .si-back svg { transition: transform .2s; }
        .si-back:hover svg { transform: translateX(-3px); }
        .si-formwrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          max-width: 520px; width: 100%; margin: 0 auto; padding: 40px 0;
        }
        .si-card {
          background: #f7f2e9; border-radius: 28px; padding: 52px 48px;
          box-shadow: 0 1px 2px rgba(74,42,22,0.04), 0 18px 44px -28px rgba(74,42,22,0.28);
        }
        .si-formwrap h2 {
          font-family: 'Instrument Serif', serif; font-weight: 400; color: #4a2a16;
          font-size: 52px; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 10px;
        }
        .si-lead { font-size: 16px; color: #7a6a58; margin: 0 0 36px; line-height: 1.5; }
        .si-form { display: flex; flex-direction: column; gap: 22px; }
        .si-label { display: flex; flex-direction: column; gap: 10px; }
        .si-label__txt { font-size: 15px; color: #8a5a34; }
        .si-field {
          display: flex; align-items: center; gap: 14px;
          background: #fdfaf4; border: 1px solid #e3d3bd; border-radius: 999px;
          padding: 0 22px; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .si-field:focus-within { border-color: #a9713f; box-shadow: 0 0 0 3px rgba(169,113,63,0.12); }
        .si-field__icon { flex: none; color: #a9713f; display: grid; place-items: center; }
        .si-input {
          font-family: inherit; font-size: 16px; color: #3b2415; background: transparent;
          border: 0; padding: 17px 0; width: 100%; min-width: 0;
        }
        .si-input:focus { outline: none; }
        .si-input::placeholder { color: #bda78d; }
        .si-input:-webkit-autofill {
          -webkit-text-fill-color: #3b2415;
          -webkit-box-shadow: 0 0 0 1000px #fdfaf4 inset;
          transition: background-color 9999s ease-in-out 0s;
        }
        .si-pw { letter-spacing: 0.18em; }
        .si-eye {
          background: transparent; border: 0; color: #a9713f; cursor: pointer;
          padding: 4px; display: grid; place-items: center; transition: color .15s;
        }
        .si-eye:hover { color: #4a2a16; }
        .si-submit {
          margin-top: 12px; border: 0; border-radius: 999px; padding: 20px 24px;
          background: linear-gradient(100deg, #7b4a26 0%, #a9713f 50%, #6f4021 100%);
          color: #fdfaf4;
          font-family: inherit; font-size: 17px; font-weight: 600; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: filter 0.2s, transform 0.1s;
        }
        .si-submit:hover:not(:disabled) { filter: brightness(1.08); }
        .si-submit:active:not(:disabled) { transform: translateY(1px); }
        .si-submit:disabled { opacity: 0.65; cursor: default; }
        .si-divider {
          display: flex; align-items: center; gap: 18px; margin: 4px 0 0;
          color: #a08a70; font-size: 13px; letter-spacing: 0.12em;
        }
        .si-divider div { flex: 1; height: 1px; background: #e3d3bd; }
        .si-google {
          background: #fdfaf4; border: 1px solid #e3d3bd; border-radius: 999px; padding: 18px 24px;
          font-family: inherit; font-size: 16px; color: #3b2415; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: border-color 0.2s, background 0.2s;
        }
        .si-google:hover { border-color: #a9713f; background: #f7f0e4; }
        .si-bottom { display: flex; justify-content: flex-end; font-size: 14px; color: #9a856c; }
        .si-bottom__links { display: flex; gap: 26px; }
        .si-bottom a { color: inherit; text-decoration: none; transition: color .15s; }
        .si-bottom a:hover { color: #3b2415; }

        @media (max-width: 1100px) {
          .si-aside { padding: 40px 40px; }
          .si-headline h1 { font-size: 56px; }
          .si-main { padding: 32px 32px; }
          .si-card { padding: 40px 32px; }
        }
        @media (max-width: 900px) {
          .si-root { grid-template-columns: 1fr; }
          .si-aside { display: none; }
          .si-main { padding: 28px 20px; }
          .si-card { padding: 36px 24px; border-radius: 22px; }
          .si-formwrap h2 { font-size: 40px; }
        }
      `}</style>

      {/* LEFT — brand panel */}
      <aside className="si-aside">
        {/* The property's own living room. `priority` — it's the LCP element here. */}
        <Image
          src="/images/rooms/1.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 0px, 52vw"
          className="si-aside__photo"
        />
        <div className="si-aside__texture" />
        <div className="si-aside__head">
          <DluxMark layout="compact" accent="clay" dark width={230} ambient={false} />
        </div>
        <div className="si-headline">
          <h1>Make yourself <em>at home.</em></h1>
          <p>Create an account to book stays and manage them — all in one quiet place.</p>
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="si-main">
        <div className="si-top">
          <Link href={backHref} className="si-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back</span>
          </Link>
          <span className="si-top__signup">Already a member?&nbsp;<Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link></span>
        </div>

        <div className="si-formwrap">
          <div className="si-card">
          <h2>Create account</h2>
          <p className="si-lead">A few details to get you started.</p>

          <form className="si-form" onSubmit={handleRegister}>
            <label className="si-label">
              <span className="si-label__txt">Full name</span>
              <div className="si-field">
                <span className="si-field__icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                  </svg>
                </span>
                <input
                  className="si-input"
                  type="text"
                  placeholder="Juan dela Cruz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </label>

            <label className="si-label">
              <span className="si-label__txt">Email</span>
              <div className="si-field">
                <span className="si-field__icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" />
                  </svg>
                </span>
                <input
                  className="si-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="si-label">
              <span className="si-label__txt">Password</span>
              <div className="si-field">
                <span className="si-field__icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  className={`si-input${showPassword ? "" : " si-pw"}`}
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
            </label>

            <button type="submit" className="si-submit" disabled={loading}>
              <span>{loading ? "Creating account…" : "Create account"}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>

            <div className="si-divider">
              <div /><span>OR</span><div />
            </div>

            <button type="button" className="si-google" onClick={() => signIn("google", { callbackUrl })}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Sign up with Google</span>
            </button>
          </form>
          </div>
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
