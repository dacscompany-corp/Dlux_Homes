"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, ArrowLeft } from "lucide-react";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token) { toast.error("This reset link is invalid."); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not reset password"); setLoading(false); return; }
      toast.success("Password reset! Please sign in.");
      router.push("/login");
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="px-8 py-10 text-white text-center" style={{ backgroundColor: "#B07848" }}>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>Choose a strong password you&apos;ll remember</p>
      </div>

      <div className="px-8 py-8">
        {!token ? (
          <div className="text-center">
            <p className="text-sm leading-relaxed" style={{ color: "#8B6344" }}>This reset link is invalid or has expired. Please request a new one.</p>
            <Link href="/forgot-password" className="inline-block mt-5 text-sm font-semibold hover:opacity-75" style={{ color: "#B07848" }}>Request a new link</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input type={showPassword ? "text" : "password"} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10 border-gray-200" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input type={showPassword ? "text" : "password"} placeholder="Re-enter your password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} className="pl-10 border-gray-200" />
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full text-white h-11 font-semibold rounded-full mt-2 border-0 cursor-pointer disabled:opacity-70" style={{ backgroundColor: "#B07848" }}>
              {loading ? "Resetting…" : "Reset Password"}
            </Button>
            <Link href="/login" className="flex items-center justify-center gap-1.5 mt-2 text-sm font-medium hover:opacity-75" style={{ color: "#B07848" }}>
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F7F0E3" }}>
      <nav className="border-b border-gray-100 shadow-sm" style={{ background: "#F7F0E3" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <Link href="/rooms">
            <Image src="/logo.png" alt="D' Lux Homes" width={130} height={44} className="object-cover mix-blend-multiply" style={{ width: "130px", height: "44px" }} />
          </Link>
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Suspense fallback={<div className="text-center text-sm" style={{ color: "#8B6344" }}>Loading…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
