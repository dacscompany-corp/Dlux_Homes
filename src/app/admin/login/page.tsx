"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Lock, Mail, Shield, ArrowRight, ChevronRight, AlertCircle, Loader2 } from "lucide-react";

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
  const [showPassword,    setShowPassword]    = useState(false);
  const [selectedRole,    setSelectedRole]    = useState<AdminRole>("owner");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [emailFocused,    setEmailFocused]    = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error,           setError]           = useState("");
  const [loading,         setLoading]         = useState(false);

  const handleSignIn = async () => {
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F7F0E3" }}>

      {/* Navbar — matches rooms page */}
      <nav className="sticky top-0 z-50 border-b shadow-sm" style={{ backgroundColor: "#F7F0E3", borderColor: "#EDE3D2" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/rooms">
            <Image src="/logo.png" alt="D'Lux Homes" width={130} height={44} className="object-cover mix-blend-multiply" style={{ width: "130px", height: "44px" }} />
          </Link>
          <div className="flex items-center gap-1.5" style={{ color: "#8B6344" }}>
            <Shield strokeWidth={1.75} className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Staff Portal</span>
          </div>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {/* Heading */}
          <div className="text-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#B07848", boxShadow: "0 4px 14px #B0784818" }}
            >
              <Lock strokeWidth={1.75} className="w-6 h-6 text-white" />
            </div>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Shield strokeWidth={1.75} className="w-3.5 h-3.5" style={{ color: "#B07848" }} />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#B07848" }}>
                Restricted Access
              </span>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>Admin Portal</h1>
            <p className="text-sm mt-1" style={{ color: "#8B6344" }}>Sign in to your staff account to continue</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl border overflow-hidden shadow-sm" style={{ borderColor: "#EDE3D2" }}>

            {/* Role tabs */}
            <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #EDE3D2" }}>
              {roles.map((role) => {
                const isActive = selectedRole === role.value;
                return (
                  <button
                    key={role.value}
                    onClick={() => setSelectedRole(role.value)}
                    className="relative py-4 px-3 text-center transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? "#FDF8F3" : "white",
                      borderBottom: isActive ? `2px solid #B07848` : "2px solid transparent",
                    }}
                  >
                    <p className="font-bold text-sm" style={{ color: isActive ? "#B07848" : "#9ca3af" }}>
                      {role.label}
                    </p>
                    <p className="text-xs mt-0.5 hidden sm:block" style={{ color: isActive ? "#8B6344" : "#d1d5db" }}>
                      {role.desc}
                    </p>
                    {isActive && (
                      <span
                        className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: "#B07848", fontSize: "9px" }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Form body */}
            <div className="px-7 py-7 space-y-5">

              {/* Role banner */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
                style={{ backgroundColor: "#FDF8F3", borderColor: "#EDE3D2" }}
              >
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#F7F0E3" }}
                >
                  <Shield strokeWidth={1.75} className="w-3.5 h-3.5" style={{ color: "#B07848" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "#B07848" }}>
                    Signing in as {roles.find((r) => r.value === selectedRole)?.label}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#8B6344" }}>
                    {roles.find((r) => r.value === selectedRole)?.desc}
                  </p>
                </div>
                <ChevronRight strokeWidth={1.75} className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: "#D4BFA0" }} />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "#8B6344" }}>
                  Email Address
                </label>
                <div
                  className="relative flex items-center rounded-2xl border transition-all duration-200"
                  style={{
                    borderColor: emailFocused ? "#B07848" : "#EDE3D2",
                    boxShadow: emailFocused ? "0 0 0 3px #B0784815" : "none",
                    backgroundColor: emailFocused ? "#FDF8F3" : "#FAFAFA",
                  }}
                >
                  <Mail strokeWidth={1.75} className="absolute left-3.5 w-4 h-4 pointer-events-none" style={{ color: emailFocused ? "#B07848" : "#D4BFA0" }} />
                  <input
                    type="email"
                    placeholder="admin@dluxhomes.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    className="w-full bg-transparent pl-10 pr-4 py-3 text-sm outline-none placeholder:text-gray-300"
                    style={{ color: "#1a1a1a" }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: "#8B6344" }}>
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: "#B07848" }}>
                    Forgot password?
                  </Link>
                </div>
                <div
                  className="relative flex items-center rounded-2xl border transition-all duration-200"
                  style={{
                    borderColor: passwordFocused ? "#B07848" : "#EDE3D2",
                    boxShadow: passwordFocused ? "0 0 0 3px #B0784815" : "none",
                    backgroundColor: passwordFocused ? "#FDF8F3" : "#FAFAFA",
                  }}
                >
                  <Lock strokeWidth={1.75} className="absolute left-3.5 w-4 h-4 pointer-events-none" style={{ color: passwordFocused ? "#B07848" : "#D4BFA0" }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSignIn(); }}
                    className="w-full bg-transparent pl-10 pr-12 py-3 text-sm outline-none placeholder:text-gray-300"
                    style={{ color: "#1a1a1a" }}
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 p-1 rounded-lg transition-colors"
                    style={{ color: "#D4BFA0" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#8B6344"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#D4BFA0"}
                  >
                    {showPassword ? <EyeOff strokeWidth={1.75} className="w-4 h-4" /> : <Eye strokeWidth={1.75} className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Keep signed in */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" style={{ accentColor: "#B07848" }} />
                <span className="text-sm" style={{ color: "#8B6344" }}>Keep me signed in</span>
              </label>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border" style={{ backgroundColor: "#fee2e2", borderColor: "#fca5a5" }}>
                  <AlertCircle strokeWidth={1.75} className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Sign in button */}
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-semibold text-sm text-white transition-all duration-200 mt-1 group cursor-pointer disabled:cursor-not-allowed disabled:opacity-80"
                style={{ backgroundColor: "#B07848", boxShadow: "0 2px 10px #B0784820" }}
                onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#9a6840"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#B07848"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In as {roles.find((r) => r.value === selectedRole)?.label}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              {/* Credentials hint */}
              <div className="px-4 py-3 rounded-xl border" style={{ backgroundColor: "#F7F0E3", borderColor: "#EDE3D2" }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#8B6344" }}>Demo credentials for <span style={{ color: "#B07848" }}>{roles.find((r) => r.value === selectedRole)?.label}</span>:</p>
                <p className="text-xs font-mono" style={{ color: "#5a4a3a" }}>📧 {staticAccounts[selectedRole].email}</p>
                <p className="text-xs font-mono" style={{ color: "#5a4a3a" }}>🔑 {staticAccounts[selectedRole].password}</p>
              </div>

              {/* Footer note */}
              <p className="flex items-center justify-center gap-1.5 text-xs pt-3 border-t" style={{ color: "#D4BFA0", borderColor: "#F7F0E3" }}>
                <Lock strokeWidth={1.75} className="w-3 h-3" />
                Secure connection · All activity is monitored and logged
              </p>
            </div>
          </div>

          <p className="text-center text-xs mt-5" style={{ color: "#8B6344" }}>
            Not staff?{" "}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: "#B07848" }}>
              Guest login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
