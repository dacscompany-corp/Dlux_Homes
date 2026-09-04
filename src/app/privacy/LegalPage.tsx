// Shared shell for the two legal pages (/privacy and /data-deletion).
//
// Both exist because Meta requires a Privacy Policy URL and a data-deletion
// route before an app can leave Development mode. They are plain prose on the
// site's own palette rather than the markdown pipeline /terms uses — that page
// renders an owner-edited document with summary cards and anchors, which is far
// more machinery than two static policy pages need.
"use client";

import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

const CREAM = "#F6EFE2";
const INK = "#1F160E";
const MUTED = "#6B5C4A";
const LINE = "rgba(31,22,14,0.12)";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2
        className="serif"
        style={{ fontSize: 21, fontWeight: 600, color: INK, margin: "0 0 10px", letterSpacing: "-0.01em" }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.68, color: INK }}>{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

/**
 * A bulleted list.
 *
 * Plain strings need nothing. Any item written as JSX must carry its OWN `key`
 * — `<span key="cloudinary">…</span>`, not a bare fragment. The `key` on the
 * `<li>` below does not cover it: these pages are Server Components, so the
 * array is built in the caller and React validates it during RSC serialisation,
 * before this component ever sees it. A bare `<>…</>` there logs "Each child in
 * a list should have a unique key prop" pointing at the caller's array.
 */
export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20, display: "grid", gap: 7 }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        padding: "16px 18px",
        margin: "14px 0",
        fontSize: 14.5,
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}

export default function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-enter" style={{ minHeight: "100vh", background: CREAM, color: INK }}>
      <SiteHeader bookHref="/rooms" />

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 80px" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
          D&rsquo;Lux Homes
        </p>
        <h1
          className="serif"
          style={{ fontSize: 34, fontWeight: 600, margin: "8px 0 6px", letterSpacing: "-0.02em", lineHeight: 1.15 }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 20px" }}>Last updated: {updated}</p>
        <p style={{ fontSize: 15.5, lineHeight: 1.7, color: INK, margin: 0 }}>{intro}</p>

        {children}

        <div style={{ marginTop: 44, paddingTop: 22, borderTop: `1px solid ${LINE}`, fontSize: 14, color: MUTED }}>
          <Link href="/terms" style={{ color: INK }}>
            Terms &amp; Conditions
          </Link>
          {" · "}
          <Link href="/privacy" style={{ color: INK }}>
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/data-deletion" style={{ color: INK }}>
            Data Deletion
          </Link>
        </div>
      </main>
    </div>
  );
}
