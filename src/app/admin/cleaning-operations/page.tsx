"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DluxMark from "@/components/brand/DluxMark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CleaningOperationsSection } from "@/components/admin/owners/CleaningOperationsSection";
import { LayoutDashboard, Menu, X, LogOut } from "lucide-react";

// Standalone route for Cleaning Operations — same content as the Owner
// portal's "Cleaning Operations" nav tab (both render CleaningOperationsSection),
// kept as its own page for direct links and the CSR dashboard, which doesn't
// have Cleaning Operations as an in-page tab.
const ADMIN_ROLES = new Set(["Owner", "CSR"]);

export default function CleaningOperationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session, status: sessionStatus } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const displayName = role === "Owner" ? "Admin Owner" : "CSR Staff";
  const router = useRouter();

  // Owner/CSR only — this is a monitoring + inspection-approval page for
  // admin, not something a Cleaner should land on (their own equivalent is
  // My Assignments in the cleaner portal). The API routes this page calls
  // are already guarded server-side (requireAdmin/requireEmployee), but this
  // redirect keeps a Cleaner session from ever seeing the page shell at all.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus === "unauthenticated") { router.replace("/admin/login"); return; }
    if (!role || !ADMIN_ROLES.has(role)) {
      router.replace(role === "Cleaner" ? "/admin/cleaners" : "/admin/login");
    }
  }, [sessionStatus, role, router]);

  const isAdmin = !!role && ADMIN_ROLES.has(role);

  // Block render until we know this is an Owner/CSR session — avoids a flash
  // of the monitoring table before the redirect above fires.
  if (sessionStatus === "loading" || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#ffffff" }}>
        <p className="text-sm" style={{ color: "#8B6344" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap');
      `}</style>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#1f1b16", borderRight: "1px solid rgba(250,247,241,0.1)" }}
      >
        <div className="px-2 py-1 flex items-center justify-between border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <Link href={role === "Owner" ? "/admin/owners" : "/admin/csr"} className="flex items-center min-w-0 flex-1">
            <DluxMark layout="compact" accent="gold" dark width={180} ambient={false} />
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden cursor-pointer" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#B0784820", color: "#D4A96A" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Cleaning Operations
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <Link
            href={role === "Owner" ? "/admin/owners" : "/admin/csr"}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm"
            style={{ color: "#A89080", fontWeight: 500 }}
          >
            <LayoutDashboard className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.5} style={{ color: "#8C7660" }} />
            Back to Dashboard
          </Link>
        </nav>
        <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(250,247,241,0.1)" }}>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-white text-xs font-bold" style={{ backgroundColor: "#B07848" }}>
                {displayName.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs truncate" style={{ color: "#6b5040" }}>{role}</p>
            </div>
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} aria-label="Sign out" className="cursor-pointer">
              <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: "#6b5040" }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4", height: 72, fontFamily: "'Geist', system-ui, sans-serif" }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="lg:hidden p-2 rounded-lg cursor-pointer" style={{ color: "#6b6358" }}>
              <Menu className="w-5 h-5" />
            </button>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", margin: 0, color: "#1f1b16" }}>
              Cleaning Operations
            </h1>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">
          <CleaningOperationsSection />
        </main>
      </div>
    </div>
  );
}
