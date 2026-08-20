"use client";

// Interactive shell for /terms — the reading chrome around the Terms.
//
// Implements the "Terms and conditions redesign" Claude Design project
// (Terms & Conditions.dc.html): reading-progress bar, masthead with version
// badge, the four "before you pay" cards, the FAQ grid, a sticky searchable
// table of contents, per-section copy-link with toast, back-to-top, and a print
// stylesheet.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//   - Render the header. The design mocks up the real SiteHeader; the app has
//     the actual one, so it is used instead of a copy.
//   - Render a Messenger button. MessengerChat is already mounted globally in
//     app/layout.tsx and would otherwise appear twice.
//   - Hold the prose. Section bodies arrive as already-rendered children from
//     the server component, which reads TERMS_AND_CONDITIONS.md. The document
//     stays the single source of truth; this file is presentation only.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type SectionMeta = {
  /** Section number as printed, e.g. "8". */
  n: string;
  title: string;
  /** Heading anchor, e.g. "8-cancellation-and-date-changes". */
  slug: string;
  /** Flattened text, used only for the search filter. */
  text: string;
};

export type Faq = { q: string; a: string; ref: string; href: string };

export type HeroCard = {
  kicker: string;
  title: string;
  body: ReactNode;
  href: string;
  cta: string;
  dark?: boolean;
};

const C = {
  bg: "#FAF7F1", ink: "#1F160E", body: "#3A3026", mid: "#5A4E3F",
  muted: "#8B7458", faint: "#9B8B73", accent: "#B07848", accentDk: "#9A6840",
  clay: "#B8754A", line: "#E6D8BC", line2: "#E1D3B4", panel: "#F3ECDF",
  card: "#FFFDF8", dark: "#2C2218", onDark: "#F6EFE2", onDarkMid: "#DCCFB8",
  gold: "#E0A868", goldLt: "#FBE9C8", danger: "#A8492F", tan: "#A08256",
};
const MONO = "var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace";
const SERIF = "var(--font-fraunces), Fraunces, Georgia, serif";

function Ico({ d, size = 15, fill }: { d: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

export default function TermsDoc({
  version, effective, lead, sections, bodies, faqs, heroCards,
}: {
  version: string;
  effective: string;
  lead: ReactNode;
  sections: SectionMeta[];
  bodies: ReactNode[];
  faqs: Faq[];
  heroCards: HeroCard[];
}) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<"en" | "fil">("en");
  const [active, setActive] = useState(sections[0]?.slug ?? "");
  const [tocOpen, setTocOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtering is state, not the design's direct style.display mutation — React
  // owns this DOM, so hiding nodes behind its back desynchronises the tree.
  const needle = q.trim().toLowerCase();
  const visible = useMemo(
    () => sections.map((s) => !needle || s.text.toLowerCase().includes(needle) || s.title.toLowerCase().includes(needle)),
    [sections, needle],
  );
  const hits = visible.filter(Boolean).length;

  useEffect(() => {
    // One passive scroll listener drives the progress bar, the back-to-top
    // button and the TOC highlight. rAF-coalesced so a fast scroll cannot queue
    // a layout read per event.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        if (barRef.current) barRef.current.style.width = `${(max > 0 ? Math.min(1, window.scrollY / max) : 0) * 100}%`;
        setShowTop(window.scrollY > 700);
        const secs = Array.from(document.querySelectorAll<HTMLElement>("[data-sec]"));
        let current = secs[0]?.dataset.sec ?? "";
        for (const s of secs) if (s.getBoundingClientRect().top < 160) current = s.dataset.sec ?? current;
        setActive(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const copyLink = useCallback(async (slug: string) => {
    const url = `${window.location.href.split("#")[0]}#${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("LINK COPIED");
    } catch {
      // Clipboard is blocked outside a secure context and in some in-app
      // browsers. Showing the URL still lets the guest copy it by hand.
      flash(url);
    }
  }, [flash]);

  const langBtn = (on: boolean): React.CSSProperties => ({
    padding: "8px 13px", background: on ? C.clay : "transparent", color: on ? C.bg : "#8A6A42",
    border: 0, font: "inherit", fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", cursor: "pointer",
  });

  return (
    <div style={{ background: C.bg, color: C.ink }}>
      {/* Reading progress */}
      <div className="tc-noprint" style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: "rgba(31,22,14,.06)", zIndex: 90 }}>
        <div ref={barRef} style={{ height: "100%", width: "0%", background: C.clay, transition: "width .12s linear" }} />
      </div>

      <div id="top" className="tc-wrap">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <div className="tc-mast">
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.faint }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", border: `1px solid ${C.line2}`, background: C.panel, color: "#8A6A42" }}>
                <span className="tc-pulse" />
                In effect
              </span>
              <span>Version {version}</span>
              <span aria-hidden>·</span>
              <span>Updated {effective}</span>
            </div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(34px, 6vw, 52px)", lineHeight: 1.06, letterSpacing: "-.025em", margin: 0 }}>
              Guest Terms &amp; Conditions
            </h1>
            <div className="tc-lead">{lead}</div>
          </div>

          <div className="tc-noprint tc-tools">
            <div style={{ display: "flex", border: `1px solid ${C.line2}`, background: C.panel }}>
              <button onClick={() => setLang("en")} style={langBtn(lang === "en")} aria-pressed={lang === "en"}>EN</button>
              <button onClick={() => setLang("fil")} style={langBtn(lang === "fil")} aria-pressed={lang === "fil"}>FIL</button>
            </div>
            <button onClick={() => window.print()} className="tc-ghost">
              <Ico d={<><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>} />
              Print / PDF
            </button>
            <a href="mailto:homesdlux@gmail.com?subject=Question%20about%20the%20Guest%20Terms" className="tc-ghost">
              <Ico d={<><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="3 6 12 13 21 6" /></>} />
              Ask about a clause
            </a>
          </div>
        </div>

        {lang === "fil" && (
          <div style={{ marginTop: 20, padding: "13px 16px", border: `1px solid ${C.line2}`, background: C.panel, fontSize: 13.5, color: "#6B5A44", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", color: "#8A6A42", flex: "none" }}>FIL</span>
            Ang salin sa Filipino ay inihahanda pa. English is the governing version of these Terms.
          </div>
        )}

        {/* ── Please read before you pay ────────────────────────────── */}
        <section style={{ padding: "44px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: C.danger }}>Please read before you pay</span>
            <span style={{ flex: 1, height: 1, background: C.line }} />
          </div>
          <div className="tc-hero">
            {heroCards.map((c, i) => (
              <div key={c.href} style={{ background: c.dark ? C.dark : C.panel, color: c.dark ? C.onDark : C.ink, border: c.dark ? "none" : `1px solid ${C.line}`, padding: "26px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: c.dark ? C.gold : C.tan }}>
                  {String(i + 1).padStart(2, "0")} · {c.kicker}
                </span>
                <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 25, lineHeight: 1.2, margin: 0 }}>{c.title}</h3>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: c.dark ? C.onDarkMid : C.mid }}>{c.body}</p>
                <a href={c.href} style={{ marginTop: "auto", paddingTop: 12, fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", color: c.dark ? C.gold : C.accentDk, textDecoration: "none" }}>
                  {c.cta} →
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ grid ──────────────────────────────────────────────── */}
        <section style={{ padding: "52px 0 0" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 28, lineHeight: 1.25, letterSpacing: "-.01em", margin: "0 0 6px" }}>
            The other things guests most often ask about
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: C.muted, maxWidth: "70ch" }}>
            This summary is provided for convenience and does not replace the Terms below. Where the
            summary and a numbered clause differ,{" "}
            <strong style={{ fontWeight: 600, color: C.mid }}>the numbered clause applies</strong>.
          </p>
          <div className="tc-faq">
            {faqs.map((f) => (
              <div key={f.q} style={{ background: C.bg, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.dark, letterSpacing: "-.005em" }}>{f.q}</h3>
                  <a href={f.href} style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".08em", color: C.accent, textDecoration: "none", whiteSpace: "nowrap", flex: "none" }}>{f.ref}</a>
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.mid }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Document: TOC + body ──────────────────────────────────── */}
        <div className="tc-doc">
          <aside className="tc-noprint tc-aside">
            <div style={{ position: "relative" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.tan} strokeWidth={1.6} strokeLinecap="round" style={{ position: "absolute", left: 12, top: 12 }} aria-hidden>
                <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the Terms"
                aria-label="Search the Terms"
                style={{ width: "100%", padding: "10px 12px 10px 34px", background: C.card, border: `1px solid ${C.line2}`, font: "inherit", fontSize: 13.5, color: C.ink, outline: "none" }}
              />
            </div>
            <div className="tc-count" aria-live="polite" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".1em", color: C.faint, textTransform: "uppercase" }}>
              {needle ? `${hits} ${hits === 1 ? "section matches" : "sections match"} “${q.trim()}”` : `${sections.length} sections`}
            </div>

            {/* Below 1040px the sidebar stacks above the document, so an
                always-open 26-item list would bury §1 under a screen and a half
                of links. The toggle only exists at that width; on desktop the
                nav is always open and this button is display:none. Searching
                forces it open so the guest can see which sections matched. */}
            <button
              className="tc-toctoggle"
              onClick={() => setTocOpen((v) => !v)}
              aria-expanded={tocOpen || !!needle}
              aria-controls="tc-toc"
            >
              <span>{needle ? `${hits} matching ${hits === 1 ? "section" : "sections"}` : `All ${sections.length} sections`}</span>
              <span className="tc-chev" data-on={tocOpen || needle ? "1" : undefined} aria-hidden>
                <Ico size={15} d={<polyline points="6 9 12 15 18 9" />} />
              </span>
            </button>

            <nav id="tc-toc" className="tc-toc" data-open={tocOpen || needle ? "1" : undefined}>
              {sections.map((s, i) => visible[i] && (
                <a
                  key={s.slug}
                  href={`#${s.slug}`}
                  className="tc-tocitem"
                  data-on={active === s.slug ? "1" : undefined}
                  onClick={() => setTocOpen(false)}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.tan, flex: "none", paddingTop: 2 }}>{s.n.padStart(2, "0")}</span>
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>

            {/* Hidden on mobile — the footer carries the same address, and this
                box would otherwise sit between the guest and the document. */}
            <div className="tc-help">
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".12em", color: C.tan }}>NEED A HAND?</span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: C.mid }}>Easier to answer a question now than to change a booking later.</p>
              <a href="mailto:homesdlux@gmail.com" style={{ fontSize: 13, color: C.accent, fontWeight: 600, textDecoration: "none", borderBottom: "1px solid rgba(176,120,72,.32)", alignSelf: "flex-start" }}>homesdlux@gmail.com</a>
            </div>
          </aside>

          <main className="tc-main">
            {sections.map((s, i) => visible[i] && (
              <section key={s.slug} data-sec={s.slug} id={s.slug} className="tc-sec">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".06em", color: C.accent, paddingTop: 12, flex: "none" }}>§{s.n}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(23px, 3.4vw, 29px)", lineHeight: 1.24, letterSpacing: "-.012em", margin: 0 }}>{s.title}</h2>
                  </div>
                  <button onClick={() => copyLink(s.slug)} className="tc-copy tc-noprint" aria-label={`Copy link to section ${s.n}`}>COPY LINK</button>
                </div>
                <div className="tc-prose">{bodies[i]}</div>
              </section>
            ))}

            {hits === 0 && (
              <p style={{ padding: "40px 0", color: C.muted, fontSize: 15 }}>
                No section mentions “{q.trim()}”. Try a shorter word, or{" "}
                <button onClick={() => setQ("")} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: C.accent, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>clear the search</button>.
              </p>
            )}

            <div className="tc-foot">
              <div style={{ maxWidth: "46ch", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 14.5, color: C.mid, lineHeight: 1.65 }}>
                  Questions about any of the above? Email{" "}
                  <a href="mailto:homesdlux@gmail.com" style={{ color: C.accent, fontWeight: 600, textDecoration: "none", borderBottom: "1px solid rgba(176,120,72,.32)" }}>homesdlux@gmail.com</a>{" "}
                  before you book — it is easier to answer a question now than to change a booking later.
                </p>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".1em", color: C.faint, textTransform: "uppercase" }}>Version {version} · Effective {effective}</span>
              </div>
              <Link href="/rooms" className="tc-cta">
                Back to the room
                <Ico size={15} d={<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>} />
              </Link>
            </div>
          </main>
        </div>
      </div>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="tc-noprint tc-top"
        aria-label="Back to top"
        style={{ opacity: showTop ? 1 : 0, pointerEvents: showTop ? "auto" : "none" }}
      >
        <Ico size={17} d={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />
      </button>

      <div
        className="tc-noprint"
        role="status"
        style={{
          position: "fixed", left: "50%", bottom: 34, background: C.dark, color: C.onDark,
          padding: "11px 20px", fontSize: 13.5, fontFamily: MONO, letterSpacing: ".06em", zIndex: 95,
          opacity: toast ? 1 : 0, pointerEvents: "none",
          transform: `translateX(-50%) translateY(${toast ? 0 : 10}px)`,
          transition: "opacity .22s ease, transform .22s ease",
          maxWidth: "min(90vw, 620px)", overflowWrap: "anywhere",
        }}
      >
        {toast ?? ""}
      </div>

      <style>{`
        .tc-wrap { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .tc-mast {
          display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
          gap: 32px; padding: 56px 0 30px; border-bottom: 1px solid ${C.line};
        }
        .tc-lead p { margin: 0 0 10px; font-size: 16.5px; line-height: 1.65; color: ${C.mid}; max-width: 60ch; }
        .tc-lead p:last-child { margin-bottom: 0; }
        .tc-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; }
        .tc-ghost {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px;
          background: transparent; border: 1px solid ${C.line2}; color: #3C3226;
          font: inherit; font-size: 13px; cursor: pointer; text-decoration: none;
        }
        .tc-ghost:hover { background: ${C.panel}; }
        .tc-pulse {
          width: 5px; height: 5px; border-radius: 50%; background: #5b9e6b;
          display: inline-block; animation: tcGlow 2.4s ease-in-out infinite;
        }
        @keyframes tcGlow { 0%,100% { opacity: .62 } 50% { opacity: 1 } }
        /* min(Npx, 100%) rather than a bare Npx floor: a plain minmax(320px,1fr)
           keeps a 320px track even when the container is narrower, which pushes
           the page into horizontal scroll on a 320–355px phone. The min() lets
           the track collapse to the container instead. */
        .tc-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 16px; }
        .tc-faq {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
          gap: 1px; background: ${C.line}; border: 1px solid ${C.line};
        }
        .tc-doc {
          display: grid; grid-template-columns: 264px minmax(0, 1fr);
          gap: 56px; align-items: start; padding: 64px 0 96px;
        }
        .tc-aside { position: sticky; top: 96px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .tc-toc { display: flex; flex-direction: column; border-top: 1px solid ${C.line}; }
        .tc-toctoggle { display: none; }
        .tc-help {
          padding: 16px; background: ${C.panel}; border: 1px solid ${C.line};
          display: flex; flex-direction: column; gap: 8px;
        }
        .tc-tocitem {
          display: flex; gap: 10px; padding: 10px 12px; border-bottom: 1px solid ${C.line};
          border-left: 2px solid transparent; text-decoration: none; color: #6B5A44;
          font-size: 13.5px; line-height: 1.4;
        }
        .tc-tocitem:hover { background: ${C.panel}; color: ${C.ink}; }
        .tc-tocitem[data-on] { background: ${C.panel}; border-left-color: ${C.clay}; color: ${C.ink}; }
        .tc-main { max-width: 74ch; font-size: 15.5px; line-height: 1.72; color: ${C.body}; }
        .tc-sec { scroll-margin-top: 96px; padding: 40px 0; border-top: 1px solid ${C.line}; }
        .tc-sec:first-of-type { padding-top: 0; border-top: 0; }
        .tc-copy {
          flex: none; margin-top: 10px; background: transparent; border: 1px solid transparent;
          padding: 5px 8px; font-family: ${MONO}; font-size: 10px; letter-spacing: .1em;
          color: #B4A488; cursor: pointer;
        }
        .tc-copy:hover { border-color: ${C.line2}; color: #8A6A42; }
        .tc-top {
          position: fixed; right: 26px; bottom: 26px; width: 46px; height: 46px; border-radius: 50%;
          border: 1px solid ${C.line2}; background: ${C.card}; color: #8A6A42; display: grid;
          place-items: center; cursor: pointer; z-index: 80;
          transition: opacity .25s ease, transform .2s ease;
          box-shadow: 0 10px 30px -12px rgba(40,30,18,.3);
        }
        .tc-top:hover { transform: translateY(-2px); }
        .tc-foot {
          border-top: 1px solid ${C.line}; margin-top: 8px; padding: 36px 0 0;
          display: flex; flex-wrap: wrap; gap: 28px; align-items: center; justify-content: space-between;
        }
        .tc-cta {
          background: ${C.ink}; color: ${C.bg}; padding: 14px 26px; font-size: 14.5px; font-weight: 600;
          text-decoration: none; display: inline-flex; align-items: center; gap: 10px;
        }
        .tc-cta:hover { background: ${C.dark}; }

        /* ── Prose, rendered from the markdown ───────────────────── */
        .tc-prose { display: flex; flex-direction: column; gap: 10px; margin-top: 26px; min-width: 0; }
        /* Without this a flex item refuses to shrink below its content width, so
           a wide table stretches the column instead of scrolling inside it. */
        .tc-prose > * { min-width: 0; }
        .tc-prose h3 { font-size: 15.5px; font-weight: 700; color: ${C.dark}; margin: 16px 0 0; scroll-margin-top: 96px; }
        .tc-prose h3:first-child { margin-top: 0; }
        .tc-prose p { margin: 0; }
        .tc-prose ul, .tc-prose ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
        .tc-prose li { margin: 0; }
        .tc-prose a { color: ${C.accent}; font-weight: 600; text-decoration: none; border-bottom: 1px solid rgba(176,120,72,.32); }
        .tc-prose a:hover { color: ${C.accentDk}; }
        .tc-prose strong { font-weight: 700; color: ${C.ink}; }
        .tc-prose code { font-family: ${MONO}; font-size: .88em; background: #EFE4CE; padding: 1px 5px; }
        .tc-prose hr { display: none; }
        .tc-prose blockquote {
          margin: 6px 0; padding: 20px 22px; background: ${C.dark}; color: ${C.onDark}; border: 0;
        }
        .tc-prose blockquote p { margin: 0 0 10px; color: ${C.onDarkMid}; font-size: 14.5px; line-height: 1.62; }
        .tc-prose blockquote p:last-child { margin: 0; }
        .tc-prose blockquote strong { color: ${C.goldLt}; }
        .tc-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 4px 0; }
        .tc-prose table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
        .tc-prose th, .tc-prose td {
          text-align: left; vertical-align: top; padding: 11px 14px; border-bottom: 1px solid #EFE4CE;
        }
        .tc-prose th { font-weight: 700; background: ${C.panel}; white-space: nowrap; }
        .tc-prose tbody tr:last-child td { border-bottom: 0; }

        /* ── Responsive ──────────────────────────────────────────── */
        @media (max-width: 1040px) {
          .tc-doc { grid-template-columns: minmax(0, 1fr); gap: 20px; padding: 40px 0 72px; }
          .tc-aside { position: static; gap: 10px; }
          .tc-main { max-width: none; }
          /* Collapsed by default so the document starts within a screen of the
             search box instead of below all 26 links. */
          .tc-toc { display: none; }
          .tc-toc[data-open] { display: flex; }
          .tc-toctoggle {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            width: 100%; padding: 11px 14px; background: ${C.panel};
            border: 1px solid ${C.line2}; color: ${C.ink}; font: inherit; font-size: 13.5px;
            font-weight: 600; cursor: pointer; text-align: left;
          }
          .tc-chev { display: inline-flex; transition: transform .2s ease; color: ${C.tan}; }
          .tc-chev[data-on] { transform: rotate(180deg); }
          .tc-help { display: none; }
          /* The toggle already states the count; two lines saying it is noise. */
          .tc-count { display: none; }
        }
        @media (max-width: 640px) {
          .tc-wrap { padding: 0 18px; }
          .tc-mast { padding: 32px 0 22px; gap: 20px; }
          .tc-lead p { font-size: 15.5px; }
          .tc-sec { padding: 28px 0; }
          .tc-main { font-size: 15px; }
          .tc-hero > div, .tc-faq > div { padding: 20px 18px; }
          .tc-hero h3 { font-size: 22px; }
          /* Copying a deep link is a desktop affordance, and at this width the
             button competes with the section title for the same row. */
          .tc-copy { display: none; }
          .tc-foot { gap: 20px; }
          .tc-cta { width: 100%; justify-content: center; }
          .tc-top { right: 14px; bottom: 20px; }
        }

        /* ── Print ───────────────────────────────────────────────── */
        @media print {
          .tc-noprint { display: none !important; }
          .tc-wrap { max-width: none; padding: 0; }
          .tc-doc { display: block; padding: 0; }
          .tc-main { max-width: none; }
          .tc-sec { break-inside: avoid-page; }
          .tc-hero, .tc-faq { break-inside: avoid-page; }
        }
      `}</style>
    </div>
  );
}
