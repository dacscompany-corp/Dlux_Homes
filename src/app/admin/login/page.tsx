"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";

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

        /* LEFT — restricted ops panel */
        .ad-aside {
          position: relative;
          background: #b8754a;
          color: #faf7f1;
          padding: 56px 64px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
        }
        .ad-aside__texture {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(circle at 20% 15%, rgba(255,255,255,0.06), transparent 45%),
            radial-gradient(circle at 85% 90%, rgba(0,0,0,0.10), transparent 50%);
        }
        .ad-headrow { position: relative; display: flex; justify-content: space-between; align-items: center; }
        .ad-wordmark { display: flex; align-items: center; gap: 12px; }
        .ad-wordmark__d {
          width: 36px; height: 36px;
          border: 1px solid rgba(250,247,241,0.35); border-radius: 4px;
          display: grid; place-items: center;
          font-family: 'Instrument Serif', serif; font-size: 20px; font-style: italic;
        }
        .ad-wordmark__name { font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.85; }
        .ad-badge {
          display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          border: 1px solid rgba(250,247,241,0.45); border-radius: 100px;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #faf7f1;
        }
        .ad-badge__dot { width: 6px; height: 6px; background: #faf7f1; border-radius: 50%; box-shadow: 0 0 8px rgba(250,247,241,0.8); }
        .ad-headline { position: relative; max-width: 460px; margin: auto 0; }
        .ad-eyebrow { font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; margin-bottom: 16px; }
        .ad-headline h1 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 64px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 24px;
        }
        .ad-headline h1 em { font-style: italic; opacity: 0.85; }
        .ad-headline p { font-size: 16px; line-height: 1.55; opacity: 0.72; margin: 0; max-width: 380px; }

        /* RIGHT — form panel */
        .ad-main { display: flex; flex-direction: column; padding: 40px 56px; }
        .ad-top { display: flex; justify-content: flex-end; font-size: 14px; color: #6b6358; }
        .ad-top a { color: #1f1b16; text-decoration: none; border-bottom: 1px solid #1f1b16; padding-bottom: 1px; }
        .ad-formwrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          max-width: 440px; width: 100%; margin: 0 auto; padding: 40px 0;
        }
        .ad-formwrap h2 {
          font-family: 'Instrument Serif', serif; font-weight: 400;
          font-size: 36px; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 8px;
        }
        .ad-lead { font-size: 15px; color: #6b6358; margin: 0 0 32px; }
        .ad-seg {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0;
          border: 1px solid #d9d1c2; padding: 4px; margin-bottom: 32px;
        }
        .ad-rolebtn {
          background: transparent; color: #6b6358; border: 0; padding: 14px 12px;
          font-family: inherit; cursor: pointer;
          display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
          transition: background 0.2s, color 0.2s;
        }
        .ad-rolebtn:hover:not(.is-active) { background: #f3eee2; }
        .ad-rolebtn.is-active { background: #1f1b16; color: #faf7f1; }
        .ad-rolebtn__label { font-size: 13px; font-weight: 500; letter-spacing: 0.01em; }
        .ad-rolebtn__sub { font-size: 11px; opacity: 0.7; line-height: 1.3; text-align: left; }
        .ad-form { display: flex; flex-direction: column; gap: 24px; }
        .ad-label { display: flex; flex-direction: column; gap: 8px; }
        .ad-label__txt { font-size: 13px; color: #6b6358; letter-spacing: 0.02em; }
        .ad-label__row { display: flex; justify-content: space-between; }
        .ad-forgot { color: #6b6358; text-decoration: none; font-size: 13px; transition: color .15s; }
        .ad-forgot:hover { color: #1f1b16; }
        .ad-input {
          font-family: inherit; font-size: 15px; color: #1f1b16; background: transparent;
          border: 0; border-bottom: 1px solid #d9d1c2; padding: 10px 0; transition: border-color 0.2s; width: 100%;
        }
        .ad-input:focus { outline: none; border-bottom-color: #b8754a; }
        .ad-input::placeholder { color: #b8b1a6; }
        .ad-input:-webkit-autofill {
          -webkit-text-fill-color: #1f1b16;
          -webkit-box-shadow: 0 0 0 1000px #faf7f1 inset;
          transition: background-color 9999s ease-in-out 0s;
        }
        .ad-pwwrap {
          position: relative; display: flex; align-items: center;
          border-bottom: 1px solid #d9d1c2; transition: border-color 0.2s;
        }
        .ad-pwwrap:focus-within { border-bottom-color: #b8754a; }
        .ad-pwwrap .ad-input { border-bottom: 0; flex: 1; letter-spacing: 0.06em; }
        .ad-eye {
          background: transparent; border: 0; color: #6b6358; cursor: pointer;
          padding: 6px; display: grid; place-items: center; transition: color .15s;
        }
        .ad-eye:hover { color: #1f1b16; }
        .ad-check {
          display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f1b16;
          cursor: pointer; user-select: none; margin-top: 4px;
        }
        .ad-check__box {
          position: relative; width: 16px; height: 16px; border: 1px solid #b8754a; border-radius: 3px;
          display: grid; place-items: center; transition: background 0.15s;
        }
        .ad-check input { position: absolute; opacity: 0; pointer-events: none; }
        .ad-error {
          display: flex; align-items: center; gap: 8px; font-size: 13px; color: #a33a2a;
          background: #f7e7e1; border: 1px solid #e3b9ac; padding: 10px 14px;
        }
        .ad-submit {
          margin-top: 12px; background: #1f1b16; color: #faf7f1; border: 0; padding: 16px 24px;
          font-family: inherit; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: background 0.2s;
        }
        .ad-submit:hover:not(:disabled) { background: #b8754a; }
        .ad-submit:disabled { opacity: 0.7; cursor: default; }
        .ad-demo { margin-top: 8px; border-top: 1px solid #e8e1d2; padding-top: 20px; }
        .ad-demo summary {
          cursor: pointer; font-size: 12px; color: #8a8276; letter-spacing: 0.12em; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px; list-style: none;
        }
        .ad-demo summary::-webkit-details-marker { display: none; }
        .ad-demo__dot { width: 6px; height: 6px; background: #b8754a; border-radius: 50%; }
        .ad-demo__hint { margin-left: auto; font-family: 'Geist Mono', monospace; text-transform: none; letter-spacing: 0; font-size: 11px; color: #b8b1a6; }
        .ad-demo__box {
          margin-top: 12px; padding: 16px; background: #f3eee2;
          font-family: 'Geist Mono', monospace; font-size: 12px; display: flex; flex-direction: column; gap: 8px;
        }
        .ad-demo__line { display: flex; justify-content: space-between; color: #6b6358; }
        .ad-demo__line span:first-child { opacity: 0.6; }
        .ad-demo__line span:last-child { color: #1f1b16; }
        .ad-bottom {
          display: flex; justify-content: space-between; font-size: 12px; color: #8a8276;
          font-family: 'Geist Mono', monospace;
        }
        .ad-bottom__status { display: flex; align-items: center; gap: 6px; }
        .ad-bottom__status span:first-child { width: 5px; height: 5px; background: #7a8c5a; border-radius: 50%; }
        .ad-bottom__links { display: flex; gap: 20px; }
        .ad-bottom__links a { color: inherit; text-decoration: none; transition: color .15s; }
        .ad-bottom__links a:hover { color: #1f1b16; }

        @media (max-width: 900px) {
          .ad-root { grid-template-columns: 1fr; }
          .ad-aside { display: none; }
          .ad-main { padding: 32px 24px; }
        }
      `}</style>

      {/* LEFT — restricted ops panel */}
      <aside className="ad-aside">
        <div className="ad-aside__texture" />
        <div className="ad-headrow">
          <div className="ad-wordmark">
            <div className="ad-wordmark__d">D</div>
            <div className="ad-wordmark__name">D&rsquo; Lux Homes</div>
          </div>
          <div className="ad-badge">
            <span className="ad-badge__dot" />
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
                <span className="ad-rolebtn__label">{r.label}</span>
                <span className="ad-rolebtn__sub">{r.desc}</span>
              </button>
            ))}
          </div>

          <form className="ad-form" onSubmit={handleSignIn}>
            <label className="ad-label">
              <span className="ad-label__txt">Email</span>
              <input
                className="ad-input"
                type="email"
                placeholder={staticAccounts[selectedRole].email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="ad-label">
              <span className="ad-label__txt ad-label__row">
                <span>Password</span>
                <Link href="/forgot-password" className="ad-forgot">Forgot?</Link>
              </span>
              <div className="ad-pwwrap">
                <input
                  className="ad-input"
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
              <span className="ad-check__box" style={{ background: remember ? "#b8754a" : "transparent" }}>
                {remember && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#faf7f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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
