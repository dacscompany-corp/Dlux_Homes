"use client";

// Cleaner portal — picks a view by viewport width.
//
// The phone redesign (owner spec, 2026-09-27) applies to SMALL SCREENS ONLY.
// Desktop keeps the original sidebar dashboard, moved verbatim into
// CleanerDesktopPortal; nothing in the redesign touches it.
//
// Exactly one of the two mounts. They both open the full RTK Query stack —
// cleaning tasks, checklist, havens, conversations and a 30s notification
// poller — so rendering both behind CSS `hidden`/`lg:block` would double every
// request and toast each new assignment twice. Hence a real branch, not a
// display switch.

import { useEffect, useState } from "react";
import CleanerDesktopPortal from "@/components/admin/cleaners/CleanerDesktopPortal";
import CleanerMobilePortal from "@/components/admin/cleaners/CleanerMobilePortal";

// Tailwind's `lg`. The desktop dashboard's own layout already changes shape at
// this width (lg:pl-64, lg:translate-x-0 on the sidebar), so the two views hand
// over exactly where the old one did — no new breakpoint to reason about.
const DESKTOP_QUERY = "(min-width: 1024px)";

export default function CleanerPortalPage() {
  // null until matchMedia has been read once, so neither view renders at the
  // wrong width — better a single blank paint than a phone layout flashing on a
  // desktop monitor.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (isDesktop === null) {
    // Cream ground rather than white, so the handover isn't a flash on either side.
    return <div style={{ minHeight: "100dvh", background: "#FAF7F1" }} />;
  }

  return isDesktop ? <CleanerDesktopPortal /> : <CleanerMobilePortal />;
}
