"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import DluxMark from "@/components/brand/DluxMark";

type AdminRole = "owner" | "csr" | "cleaner";

const roles: { value: AdminRole; label: string; desc: string }[] = [
  { value: "owner",   label: "Owner",   desc: "Full access & management" },
  { value: "csr",     label: "CSR",     desc: "Bookings & guest support"  },
  { value: "cleaner", label: "Cleaner", desc: "Cleaning assignments"      },
];

const rolePaths: Record<AdminRole, string> = {
  owner:   "/admin/owners",
  csr:     "/admin/csr",
  cleaner: "/admin/cleaners",
};

// Maps the role stored on the account (employees.role) to its dashboard.
const dbRoleToPath: Record<string, string> = {
  Owner:   "/admin/owners",
  CSR:     "/admin/csr",
  Cleaner: "/admin/cleaners",
};

const staticAccounts: Record<AdminRole, { email: string; password: string }> = {
  owner:   { email: "owner@dluxhomes.com",   password: "Owner@123"  },
  csr:     { email: "csr@dluxhomes.com",     password: "Csr@123"    },
  cleaner: { email: "cleaner@dluxhomes.com", password: "Clean@123"  },
};

function RoleIcon({ role }: { role: AdminRole }) {
  if (role === "owner") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    );
  }
  if (role === "csr") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8" />
        <circle cx="17" cy="8.5" r="2.6" /><path d="M15.5 14.6c2.9.3 5 2.2 5 5.4" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 3 9.5 12.5" /><path d="M4 21c0-3 1.5-5.5 4-7.2a3 3 0 0 1 4 .3l1 1a3 3 0 0 1 .3 4C11.6 21 9 21 4 21z" /><path d="m14.5 8.5 2 2" />
    </svg>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AdminRole>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const activeRole = roles.find((r) => r.value === selectedRole)!;

  const handleSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!res || res.error) {
        // NextAuth surfaces the authorize() error message (invalid creds,
        // account locked, etc.) on res.error.
        setError(res?.error || "Sign in failed. Please try again.");
        setLoading(false);
        return;
      }

      // Authenticated — route by the account's actual role, not the chosen tab.
      const session = await getSession();
      const role = (session?.user as { role?: string } | undefined)?.role;
      const dest = (role && dbRoleToPath[role]) || rolePaths[selectedRole];
      router.push(dest);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="ad-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');

        .ad-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          background: #faf7f1;
          font-family: 'Geist', system-ui, -apple-system, sans-serif;
          color: #1f1b16;
        }
        .ad-root * { box-sizing: border-box; }

        /* LEFT — restricted ops panel, the property's own living room, warmed to the brand tone */
        .ad-aside {
          position: relative;
          background: #6b3f22;
          color: #faf7f1;
          padding: 56px 64px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
        }
        .ad-aside__photo {
          position: absolute; inset: 0;
          object-fit: cover;
          z-index: 0;
        }
        /* Sepia wash: multiply lays the brand brown over the photo, then a bottom-up
           gradient darkens the copy area so the headline keeps its contrast. */
        .ad-aside__texture {
          position: absolute; inset: 0; pointer-events: none; z-index: 1;
          background:
            linear-gradient(to top, rgba(74,42,22,0.86) 0%, rgba(120,72,40,0.5) 55%, rgba(150,95,55,0.32) 100%),
            rgba(150,96,52,0.55);
          mix-blend-mode: multiply;
        }
        .ad-aside > *:not(.ad-aside__photo):not(.ad-aside__texture) { position: relative; z-index: 2; }
        .ad-headrow { display: flex; justify-content: space-between; align-items: center; }
        .ad-badge {
          display: flex; align-items: center; gap: 9px; padding: 11px 22px;
          border: 1px solid rgba(250,247,241,0.55); border-radius: 999px;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #faf7f1;
        }
        .ad-badge svg { flex: none; }
        .ad-headline { max-width: 460px; margin: auto 0; }
        .ad-eyebrow { font-size: 12px; letter-spacing: 0.28em; text-transform: uppercase; opacity: 0.7; margin-bottom: 16px; }
        .ad-headline h1 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 68px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 24px;
        }
        .ad-headline h1 em { font-style: italic; color: #e8b877; }
        .ad-headline p { font-size: 16px; line-height: 1.55; opacity: 0.9; margin: 0; max-width: 380px; }

        /* RIGHT — form panel */
        .ad-main { display: flex; flex-direction: column; padding: 40px 56px; }
        .ad-top { display: flex; justify-content: flex-end; font-size: 16px; color: #8a5a34; }
        .ad-top a { color: #6f4021; text-decoration: none; border-bottom: 1px solid #6f4021; padding-bottom: 2px; }
        .ad-formwrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          max-width: 560px; width: 100%; margin: 0 auto; padding: 40px 0;
        }
        .ad-card {
          background: #f7f2e9; border-radius: 28px; padding: 48px 48px;
          box-shadow: 0 1px 2px rgba(74,42,22,0.04), 0 18px 44px -28px rgba(74,42,22,0.28);
        }
        .ad-formwrap h2 {
          font-family: 'Instrument Serif', serif; font-weight: 400; color: #4a2a16;
          font-size: 44px; line-height: 1.08; letter-spacing: -0.02em; margin: 0 0 10px;
        }
        .ad-lead { font-size: 16px; color: #7a6a58; margin: 0 0 28px; }
        .ad-seg {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0;
          background: #fdfaf4; border: 1px solid #e3d3bd; border-radius: 18px; padding: 5px; margin-bottom: 28px;
          overflow: hidden;
        }
        .ad-rolebtn {
          background: transparent; color: #7a6a58; border: 0; padding: 16px 14px;
          font-family: inherit; cursor: pointer; border-radius: 14px;
          display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
          transition: background 0.2s, color 0.2s;
        }
        .ad-rolebtn:hover:not(.is-active) { background: #f3e9da; }
        .ad-rolebtn.is-active {
          background: linear-gradient(100deg, #7b4a26 0%, #a9713f 100%);
          color: #fdfaf4;
        }
        .ad-rolebtn__icon { color: #a9713f; }
        .ad-rolebtn.is-active .ad-rolebtn__icon { color: #f0dcc4; }
        .ad-rolebtn__label { font-size: 14px; font-weight: 600; letter-spacing: 0.01em; }
        .ad-rolebtn__sub { font-size: 12px; opacity: 0.75; line-height: 1.3; text-align: left; }
        .ad-form { display: flex; flex-direction: column; gap: 22px; }
        .ad-label { display: flex; flex-direction: column; gap: 10px; }
        .ad-label__txt { font-size: 15px; color: #8a5a34; }
        .ad-label__row { display: flex; justify-content: space-between; align-items: baseline; }
        .ad-forgot { color: #8a5a34; text-decoration: none; font-size: 15px; font-weight: 500; transition: color .15s; }
        .ad-forgot:hover { color: #4a2a16; }
        .ad-field {
          display: flex; align-items: center; gap: 14px;
          background: #fdfaf4; border: 1px solid #e3d3bd; border-radius: 999px;
          padding: 0 22px; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ad-field:focus-within { border-color: #a9713f; box-shadow: 0 0 0 3px rgba(169,113,63,0.12); }
        .ad-field__icon { flex: none; color: #a9713f; display: grid; place-items: center; }
        .ad-input {
          font-family: inherit; font-size: 16px; color: #3b2415; background: transparent;
          border: 0; padding: 17px 0; width: 100%; min-width: 0;
        }
        .ad-input:focus { outline: none; }
        .ad-input::placeholder { color: #bda78d; }
        .ad-input:-webkit-autofill {
          -webkit-text-fill-color: #3b2415;
          -webkit-box-shadow: 0 0 0 1000px #fdfaf4 inset;
          transition: background-color 9999s ease-in-out 0s;
        }
        .ad-pw { letter-spacing: 0.18em; }
        .ad-eye {
          background: transparent; border: 0; color: #a9713f; cursor: pointer;
          padding: 4px; display: grid; place-items: center; transition: color .15s;
        }
        .ad-eye:hover { color: #4a2a16; }
        .ad-check {
          display: flex; align-items: center; gap: 12px; font-size: 16px; color: #3b2415;
          cursor: pointer; user-select: none; margin-top: 2px;
        }
        .ad-check__box {
          position: relative; width: 26px; height: 26px; border: 1px solid #a9713f; border-radius: 7px;
          display: grid; place-items: center; transition: background 0.15s;
        }
        .ad-check input { position: absolute; opacity: 0; pointer-events: none; }
        .ad-error {
          display: flex; align-items: center; gap: 8px; font-size: 14px; color: #a33a2a;
          background: #f7e7e1; border: 1px solid #e3b9ac; border-radius: 14px; padding: 12px 16px;
        }
        .ad-submit {
          margin-top: 8px; border: 0; border-radius: 999px; padding: 20px 24px;
          background: linear-gradient(100deg, #7b4a26 0%, #a9713f 50%, #6f4021 100%);
          color: #fdfaf4;
          font-family: inherit; font-size: 17px; font-weight: 600; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: filter 0.2s, transform 0.1s;
        }
        .ad-submit:hover:not(:disabled) { filter: brightness(1.08); }
        .ad-submit:active:not(:disabled) { transform: translateY(1px); }
        .ad-submit:disabled { opacity: 0.7; cursor: default; }
        .ad-demo { margin-top: 4px; border-top: 1px solid #e3d3bd; padding-top: 20px; }
        .ad-demo summary {
          cursor: pointer; font-size: 12px; color: #9a856c; letter-spacing: 0.12em; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px; list-style: none;
        }
        .ad-demo summary::-webkit-details-marker { display: none; }
        .ad-demo__dot { width: 6px; height: 6px; background: #a9713f; border-radius: 50%; }
        .ad-demo__hint { margin-left: auto; font-family: 'Geist Mono', monospace; text-transform: none; letter-spacing: 0; font-size: 11px; color: #bda78d; }
        .ad-demo__box {
          margin-top: 12px; padding: 16px; background: #fdfaf4; border: 1px solid #e3d3bd; border-radius: 14px;
          font-family: 'Geist Mono', monospace; font-size: 12px; display: flex; flex-direction: column; gap: 8px;
        }
        .ad-demo__line { display: flex; justify-content: space-between; color: #7a6a58; }
        .ad-demo__line span:first-child { opacity: 0.6; }
        .ad-demo__line span:last-child { color: #3b2415; }
        .ad-bottom {
          display: flex; justify-content: space-between; font-size: 13px; color: #9a856c;
          font-family: 'Geist Mono', monospace;
        }
        .ad-bottom__status { display: flex; align-items: center; gap: 6px; }
        .ad-bottom__status span:first-child { width: 5px; height: 5px; background: #7a8c5a; border-radius: 50%; }
        .ad-bottom__links { display: flex; gap: 22px; }
        .ad-bottom__links a { color: inherit; text-decoration: none; transition: color .15s; }
        .ad-bottom__links a:hover { color: #3b2415; }

        @media (max-width: 1100px) {
          .ad-aside { padding: 40px 40px; }
          .ad-headline h1 { font-size: 52px; }
          .ad-main { padding: 32px 32px; }
          .ad-card { padding: 36px 32px; }
        }
        @media (max-width: 900px) {
          .ad-root { grid-template-columns: 1fr; }
          .ad-aside { display: none; }
          .ad-main { padding: 28px 20px; }
          .ad-card { padding: 32px 22px; border-radius: 22px; }
          .ad-formwrap h2 { font-size: 34px; }
          .ad-seg { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* LEFT — restricted ops panel */}
      <aside className="ad-aside">
        {/* The property's own living room. `priority` — it's the LCP element here. */}
        <Image
          src="/images/rooms/1.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 0px, 52vw"
          className="ad-aside__photo"
        />
        <div className="ad-aside__texture" />
        <div className="ad-headrow">
          <DluxMark layout="compact" accent="clay" dark width={230} ambient={false} />
          <div className="ad-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Restricted</span>
          </div>
        </div>

        <div className="ad-headline">
          <div className="ad-eyebrow">Admin Portal</div>
          <h1>Welcome, <em>team.</em></h1>
          <p>Manage bookings, guest support, and cleaning schedules. Choose your role to sign in.</p>
        </div>

      </aside>

      {/* RIGHT — form panel */}
      <main className="ad-main">
        <div className="ad-top">
          <span>Not staff?&nbsp;</span>
          <Link href="/login">Guest sign in</Link>
        </div>

        <div className="ad-formwrap">
          <div className="ad-card">
          <h2>Sign in to the portal</h2>
          <p className="ad-lead">Select your role to continue.</p>

          {/* role selector (segmented) */}
          <div className="ad-seg">
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`ad-rolebtn${selectedRole === r.value ? " is-active" : ""}`}
                onClick={() => { setSelectedRole(r.value); setError(""); }}
              >
                <span className="ad-rolebtn__icon"><RoleIcon role={r.value} /></span>
                <span className="ad-rolebtn__label">{r.label}</span>
                <span className="ad-rolebtn__sub">{r.desc}</span>
              </button>
            ))}
          </div>

          <form className="ad-form" onSubmit={handleSignIn}>
            <label className="ad-label">
              <span className="ad-label__txt">Email</span>
              <div className="ad-field">
                <span className="ad-field__icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" />
                  </svg>
                </span>
                <input
                  className="ad-input"
                  type="email"
                  placeholder={staticAccounts[selectedRole].email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="ad-label">
              <span className="ad-label__txt ad-label__row">
                <span>Password</span>
                <Link href="/forgot-password" className="ad-forgot">Forgot?</Link>
              </span>
              <div className="ad-field">
                <span className="ad-field__icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  className={`ad-input${showPassword ? "" : " ad-pw"}`}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="ad-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </label>

            <label className="ad-check">
              <span className="ad-check__box" style={{ background: remember ? "#a9713f" : "transparent" }}>
                {remember && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fdfaf4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
              <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
              <span>Keep me signed in on this device</span>
            </label>

            {error && (
              <div className="ad-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="ad-submit" disabled={loading}>
              <span>{loading ? "Signing in…" : `Sign in as ${activeRole.label}`}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>

            {/* demo credentials */}
            <details className="ad-demo">
              <summary>
                <span className="ad-demo__dot" />
                <span>Demo credentials · {activeRole.label}</span>
                <span className="ad-demo__hint">click to reveal</span>
              </summary>
              <div className="ad-demo__box">
                <div className="ad-demo__line">
                  <span>email</span>
                  <span>{staticAccounts[selectedRole].email}</span>
                </div>
                <div className="ad-demo__line">
                  <span>password</span>
                  <span>{staticAccounts[selectedRole].password}</span>
                </div>
              </div>
            </details>
          </form>
          </div>
        </div>

        <div className="ad-bottom">
          <div className="ad-bottom__status">
            <span /><span>Secure · All activity logged</span>
          </div>
          <div className="ad-bottom__links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/status">Status</Link>
            <Link href="/help">Help</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
