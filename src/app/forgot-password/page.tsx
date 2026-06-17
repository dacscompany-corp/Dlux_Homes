"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
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
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-8 py-10 text-white text-center" style={{ backgroundColor: "#B07848" }}>
              <h1 className="text-2xl font-bold">Forgot password?</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>We&apos;ll email you a reset link</p>
            </div>

            <div className="px-8 py-8">
              {sent ? (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#d1fae5" }}>
                    <CheckCircle2 className="w-7 h-7" style={{ color: "#059669" }} />
                  </div>
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Check your inbox</h2>
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "#8B6344" }}>
                    If an account exists for <span className="font-semibold">{email}</span>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
                  </p>
                  <Link href="/login" className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold hover:opacity-75" style={{ color: "#B07848" }}>
                    <ArrowLeft className="w-4 h-4" /> Back to sign in
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-sm mb-5 leading-relaxed" style={{ color: "#8B6344" }}>
                    Enter the email associated with your account and we&apos;ll send you a link to reset your password.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} className="pl-10 border-gray-200" />
                      </div>
                    </div>
                    <Button onClick={handleSubmit} disabled={loading} className="w-full text-white h-11 font-semibold rounded-full mt-2 border-0 cursor-pointer disabled:opacity-70" style={{ backgroundColor: "#B07848" }}>
                      {loading ? "Sending…" : "Send Reset Link"}
                    </Button>
                  </div>
                  <Link href="/login" className="flex items-center justify-center gap-1.5 mt-6 text-sm font-medium hover:opacity-75" style={{ color: "#B07848" }}>
                    <ArrowLeft className="w-4 h-4" /> Back to sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
