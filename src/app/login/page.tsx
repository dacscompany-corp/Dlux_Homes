"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
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

  const handleCredentials = async () => {
    if (!email || !password) { toast.error("Enter your email and password"); return; }
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res || res.error) { toast.error(res?.error || "Invalid email or password"); setLoading(false); return; }
      router.push(callbackUrl);
    } catch { toast.error("Something went wrong. Please try again."); setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F7F0E3" }}>
      {/* Navbar */}
      <nav className="border-b border-gray-100 shadow-sm" style={{ background: "#F7F0E3" }}>
        <style>{`
          .dlux-back {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 11px 22px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 600;
            color: #B07848;
            text-decoration: none;
            border: 1px solid rgba(176,120,72,.28);
            background: transparent;
            transition: background .25s ease, color .25s ease, border-color .25s ease,
              box-shadow .25s ease, transform .25s cubic-bezier(.16,1,.3,1);
          }
          .dlux-back:hover {
            background: #B07848;
            color: #fff;
            border-color: #B07848;
            transform: translateY(-1px);
            box-shadow: 0 10px 22px -12px rgba(176,120,72,.7);
          }
          .dlux-back:active { transform: translateY(0); }
          .dlux-back__ico {
            display: inline-flex;
            transition: transform .25s cubic-bezier(.16,1,.3,1);
          }
          .dlux-back:hover .dlux-back__ico { transform: translateX(-4px); }
          @media (prefers-reduced-motion: reduce) {
            .dlux-back, .dlux-back__ico { transition: none; }
            .dlux-back:hover { transform: none; }
            .dlux-back:hover .dlux-back__ico { transform: none; }
          }

          /* Clean white inputs + kill the grey browser autofill background */
          .dlux-field {
            height: 46px;
            background: #fff;
            border-color: #e5e0d6;
            color: #332d22;
          }
          .dlux-field::placeholder { color: #b6ab98; }
          .dlux-field:focus-visible {
            border-color: #B07848;
            box-shadow: 0 0 0 3px rgba(176,120,72,.18);
          }
          .dlux-field:-webkit-autofill,
          .dlux-field:-webkit-autofill:hover,
          .dlux-field:-webkit-autofill:focus {
            -webkit-text-fill-color: #332d22;
            -webkit-box-shadow: 0 0 0 1000px #fff inset;
            box-shadow: 0 0 0 1000px #fff inset;
            caret-color: #332d22;
            transition: background-color 9999s ease-in-out 0s;
          }
        `}</style>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/rooms" className="flex items-center" style={{ gap: 14, textDecoration: "none" }}>
            <Image src="/logo.png" alt="D' Lux Homes" width={56} height={56} priority className="object-contain" style={{ width: "56px", height: "56px", flex: "none" }} />
            <div style={{ lineHeight: 1.05 }}>
              <div style={{ fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600, fontSize: 23, color: "#332d22", letterSpacing: ".2px" }}>D&rsquo;&#8201;Lux Homes</div>
              <div style={{ fontSize: 10, letterSpacing: "3.4px", color: "#8a7d68", marginTop: 3, whiteSpace: "nowrap" }}>STAYCATIONS &nbsp;&middot;&nbsp; PH</div>
            </div>
          </Link>
          <Link href={backHref} className="dlux-back">
            <span className="dlux-back__ico">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </span>
            Back
          </Link>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Card Header */}
            <div className="px-8 py-10 text-white text-center" style={{ backgroundColor: "#B07848" }}>
              <div className="mx-auto mb-4 inline-flex items-center justify-center p-2 rounded-xl" style={{ backgroundColor: "#F7F0E3" }}>
                <Image src="/logo.png" alt="D' Lux Homes" width={72} height={72} className="object-contain" style={{ width: "72px", height: "72px" }} />
              </div>
              <h1 className="text-2xl font-bold">{isBooking ? "Almost there" : "Welcome to D’ Lux Homes!"}</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                {isBooking ? "Sign in to confirm your booking" : "Sign in to manage your bookings"}
              </p>
            </div>

            {/* Card Body */}
            <div className="px-8 py-8">
              {/* Email & Password */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="dlux-field pl-10 border-gray-200"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="dlux-field pl-10 pr-10 border-gray-200"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-600">Remember me</span>
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium hover:opacity-75 cursor-pointer"
                    style={{ color: "#B07848" }}
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  onClick={handleCredentials}
                  disabled={loading}
                  className="w-full text-white h-11 font-semibold rounded-full gap-2 mt-2 border-0 cursor-pointer disabled:opacity-70"
                  style={{ backgroundColor: "#B07848" }}
                >
                  {loading ? "Signing in…" : "Sign In"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Register */}
              <p className="text-center text-sm text-gray-500 mt-6">
                Don&apos;t have an account?{" "}
                <Link
                  href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  className="font-semibold hover:opacity-75 cursor-pointer"
                  style={{ color: "#B07848" }}
                >
                  Create one free
                </Link>
              </p>

              <div className="flex items-center gap-3 my-6">
                <Separator className="flex-1" />
                <span className="text-gray-400 text-xs font-medium">OR</span>
                <Separator className="flex-1" />
              </div>

              {/* Google Login */}
              <button type="button" onClick={() => signIn("google", { callbackUrl })} className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3 px-4 text-gray-700 font-medium text-sm hover:bg-gray-50 hover:border-gray-300 transition-all group cursor-pointer">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
