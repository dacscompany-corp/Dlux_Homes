// /terms — the published Guest Terms & Conditions.
//
// The prose is NOT duplicated here. It is read from TERMS_AND_CONDITIONS.md at
// the repo root so the document guests read and the document the owner edits are
// the same file. Rendering happens at BUILD time (force-static): the markdown is
// inlined into the prerendered HTML, so no filesystem read happens on Vercel at
// request time, where the repo root is not something to rely on.
//
// If the file is missing, or its shape has drifted from what the parser below
// expects, the build fails loudly. That is deliberate — shipping an empty,
// truncated or placeholder legal page is worse than a red build, because the
// checkout gate tells guests they have read this.
//
// This file splits the document; TermsDoc.tsx presents it.

import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { TERMS_DOC_FILE, TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "@/lib/terms";
import Markdown, { slug } from "./Markdown";
import TermsDoc, { type Faq, type HeroCard, type SectionMeta } from "./TermsDoc";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms & Conditions · D'Lux Homes",
  description:
    "The booking, payment, cancellation and house-rule terms that apply to every stay at D'Lux Homes.",
};

function readTerms(): string {
  // turbopackIgnore keeps the tracer from following a cwd-rooted read and
  // pulling the ENTIRE project into the server bundle's file list — it warns
  // "Encountered unexpected file in NFT list" without it. Safe here because the
  // page is force-static: the read runs during the build, never in a Function.
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), TERMS_DOC_FILE);
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read ${TERMS_DOC_FILE} at ${file}. /terms renders this file at build time; ` +
        `it must exist in the repo root. Original error: ${(err as Error).message}`,
    );
  }
}

/** Drop inline markdown markers — the summary cards render plain text. */
function plain(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Italics AFTER bold, so the `**` of a bold run is already gone and cannot
    // be mistaken for an italic delimiter.
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type Parsed = {
  lead: string;
  faqs: Faq[];
  sections: (SectionMeta & { body: string })[];
};

/**
 * Split the document into the pieces the page presents separately.
 *
 * The markdown keeps its own "Please read before you pay" summary so the file
 * stands on its own when read or printed directly. On the page that summary is
 * presented as cards instead, so the flowing body starts at "## 1." and the
 * summary block is not rendered twice.
 */
function parseTerms(src: string): Parsed {
  const lines = src.split(/\r?\n/);

  // ── Lead: the paragraphs between the version line and the first rule ──
  const versionAt = lines.findIndex((l) => l.startsWith("**Effective Date:**"));
  if (versionAt === -1) throw new Error(`${TERMS_DOC_FILE}: no "**Effective Date:**" line found.`);
  const leadEnd = lines.findIndex((l, i) => i > versionAt && /^-{3,}\s*$/.test(l));
  if (leadEnd === -1) throw new Error(`${TERMS_DOC_FILE}: no "---" rule after the effective-date line.`);
  const lead = lines.slice(versionAt + 1, leadEnd).join("\n").trim();

  // ── FAQ cards, parsed from the summary table so they cannot drift ──
  // Each row is: | **Label** | Answer … → [§N](#anchor) |
  const faqs: Faq[] = [];
  for (const line of lines) {
    if (!line.startsWith("|") || !line.includes("→")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const [label, rest] = [cells[0], cells.slice(1).join("|")];
    const split = rest.lastIndexOf("→");
    if (!label || split === -1) continue;
    // Only the tail after the arrow holds the clause links, so an incidental
    // link inside the answer can never be mistaken for the reference.
    const tail = rest.slice(split + 1);
    const links = [...tail.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    if (links.length === 0) continue;
    faqs.push({
      q: plain(label),
      a: plain(rest.slice(0, split)),
      // A row may cite a range ("§9, §10"); show it as one label but link to the
      // first clause, so the card never drops half its reference.
      ref: links.length === 2
        ? `${plain(links[0][1])}–${plain(links[1][1]).replace(/^§/, "")}`
        : links.map((l) => plain(l[1])).join(", "),
      href: links[0][2],
    });
  }
  if (faqs.length === 0) {
    throw new Error(
      `${TERMS_DOC_FILE}: could not parse any FAQ rows from the summary table. ` +
        `Rows must look like: | **Label** | Answer → [§7](#7-payment-terms) |`,
    );
  }

  // ── Numbered sections ──
  const sections: (SectionMeta & { body: string })[] = [];
  const heads: { n: string; title: string; at: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^##\s+(\d+)\.\s+(.+?)\s*$/.exec(l);
    if (m) heads.push({ n: m[1], title: m[2], at: i });
  });
  if (heads.length === 0) throw new Error(`${TERMS_DOC_FILE}: no "## N. Title" sections found.`);

  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].at : lines.length;
    // Trailing "---" belongs to the separator between sections, not to the
    // section — the design draws that divider with a border instead.
    const body = lines.slice(h.at + 1, end).join("\n").replace(/\n-{3,}\s*$/, "").trim();
    sections.push({
      n: h.n,
      title: h.title,
      slug: slug(`${h.n}. ${h.title}`),
      text: plain(body),
      body,
    });
  });

  return { lead, faqs, sections };
}

// The four "before you pay" cards. Unlike the FAQ grid these are editorial
// summaries rather than rows lifted from the document, so they are written out
// here — REVIEW THEM whenever §2, §7 or §8 changes. Each links to the clause
// that actually governs; the cards never do.
const HERO_CARDS: HeroCard[] = [
  {
    kicker: "MOST IMPORTANT",
    title: "No cancellations. No refunds.",
    body: (
      <>
        Once your booking is confirmed it cannot be cancelled, and the money you have paid will not
        be returned — not the down payment, not the balance, not any part of it.{" "}
        <strong style={{ color: "#FBE9C8", fontWeight: 600 }}>
          If you do not show up, you lose what you paid.
        </strong>
      </>
    ),
    href: "#8-cancellation-and-date-changes",
    cta: "READ §8",
    dark: true,
  },
  {
    kicker: "WHAT YOU PAY",
    title: "50% now, 50% on arrival",
    body: (
      <>
        A 50% down payment reserves your dates. The other 50% plus a{" "}
        <strong style={{ fontWeight: 600, color: "#1F160E" }}>₱1,000 refundable deposit</strong> is
        due at check-in. GCash or BPI.
      </>
    ),
    href: "#7-payment-terms",
    cta: "READ §7",
  },
  {
    kicker: "IF PLANS CHANGE",
    title: "One free date change",
    body: (
      <>
        Ask at least{" "}
        <strong style={{ fontWeight: 600, color: "#1F160E" }}>7 days before check-in</strong>, for a
        new date within 1 month of the original. Later than that and it is up to us whether we can
        help.
      </>
    ),
    href: "#85-one-time-date-change",
    cta: "READ §8.5",
  },
  {
    kicker: "BEFORE YOU BOOK",
    title: "Make sure your date is final",
    body: (
      <>
        Sending the form creates a{" "}
        <strong style={{ fontWeight: 600, color: "#1F160E" }}>request</strong>, not a confirmed
        booking. If we decline it or it expires, your down payment is returned in full.
      </>
    ),
    href: "#2-booking-confirmation",
    cta: "READ §2",
  },
];

export default function TermsPage() {
  const { lead, faqs, sections } = parseTerms(readTerms());

  return (
    <div style={{ minHeight: "100vh", background: "#FAF7F1", color: "#1F160E" }}>
      <SiteHeader bookHref="/rooms" backHref="/rooms" backLabel="Back" />
      <TermsDoc
        version={TERMS_VERSION}
        effective={TERMS_EFFECTIVE_DATE}
        lead={<Markdown source={lead} />}
        sections={sections.map(({ n, title, slug: s, text }) => ({ n, title, slug: s, text }))}
        // Rendered on the server so the markdown parser stays out of the client
        // bundle; the client shell only reorders and filters what it is given.
        bodies={sections.map((s) => <Markdown key={s.slug} source={s.body} />)}
        faqs={faqs}
        heroCards={HERO_CARDS}
      />
    </div>
  );
}
