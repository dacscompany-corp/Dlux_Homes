// Printable House Rules sheet — the letter-size page that goes inside the unit.
// Implements the owner's "House Rules Sheet" design.
//
// A SERVER component on purpose: houseRulesAccess() reads the Wi-Fi password and
// Netflix PIN from unprefixed env vars, and rendering here keeps them out of the
// client bundle entirely. The only client code is PrintActions (the buttons).
//
// The design is authored in `pt` against a <doc-page size="letter">; that custom
// element is a design-tool harness, so pagination is done here with a real
// `@page { size: letter }` rule instead. Units are kept in pt so the numbers
// still line up 1:1 with the design file.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import PrintActions from "./PrintActions";
import {
  RULE_SECTIONS,
  DUTY_HEADLINE,
  DUTY_SUB,
  QUIET_TIME,
  POOL_NOTE,
  WELCOME,
  TAGLINE,
  SIGN_OFF,
  houseRulesAccess,
} from "@/lib/house-rules-sheet";

export const dynamic = "force-dynamic";

const SERIF = "var(--font-fraunces), Georgia, serif";
const MONO = "'Courier New', monospace";

export default async function HouseRulesSheetPage() {
  const guard = await requireAdmin();
  if (!guard.ok) redirect("/admin/login");

  const a = houseRulesAccess();
  // A credential the owner hasn't configured is omitted rather than printed
  // blank — a sheet taped up with an empty "Password:" row is worse than one
  // that simply doesn't mention it.
  const accessRows = [
    { label: "Wi-Fi name", value: a.wifiName },
    { label: "Password", value: a.wifiPassword },
    { label: "Netflix PIN", value: a.netflixPin },
  ].filter((r) => r.value);

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .sheet-wrap { padding: 0 !important; background: #fff !important; }
          .sheet { box-shadow: none !important; }
        }
      `}</style>

      <div className="sheet-wrap" style={{ background: "#EFE6D6", minHeight: "100vh", paddingBottom: 32 }}>
        <PrintActions />

        <div style={{ display: "flex", justifyContent: "center", padding: "20px 16px 0" }}>
          {/* Letter page: 8.5in x 11in, with the design's 0.34in margin. */}
          <section
            className="sheet"
            style={{
              width: "8.5in",
              minHeight: "11in",
              padding: "0.34in",
              background: "#F3EAD9",
              color: "#2b1b12",
              fontFamily: "var(--font-geist-sans), Inter, Arial, Helvetica, sans-serif",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(30,20,10,.18)",
            }}
          >
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff", borderRadius: "14pt", overflow: "hidden", boxShadow: "0 1pt 3pt rgba(30,20,10,0.10)" }}>

              {/* Masthead */}
              <div style={{ background: "#2b1b12", padding: "20pt 26pt 18pt" }}>
                <div style={{ fontFamily: SERIF, fontSize: "30pt", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.5pt", color: "#f6ede0" }}>D&rsquo;Lux Homes</div>
                <div style={{ fontSize: "8pt", letterSpacing: "3.5pt", textTransform: "uppercase", color: "#CBB89C", marginTop: "5pt" }}>{TAGLINE}</div>
                <div style={{ width: "34pt", height: "2.5pt", background: "#d9a25c", margin: "12pt 0 10pt" }} />
                <div style={{ fontFamily: SERIF, fontSize: "17pt", color: "#f6ede0" }}>{WELCOME}</div>
                <div style={{ fontSize: "9.5pt", letterSpacing: "1.5pt", textTransform: "uppercase", color: "#CBB89C", marginTop: "4pt" }}>House Rules &amp; Info</div>
              </div>

              {/* Unit + access */}
              <div style={{ display: "flex", borderBottom: "1px solid #e9dcc8" }}>
                <div style={{ flex: 1, padding: "13pt 26pt" }}>
                  <div style={{ fontSize: "7.5pt", fontWeight: 700, letterSpacing: "1.2pt", textTransform: "uppercase", color: "#9c8974", marginBottom: "5pt" }}>Your unit</div>
                  <div style={{ fontSize: "11pt", lineHeight: 1.4, color: "#5c4a3c" }}>{a.building}</div>
                  <div style={{ fontSize: "13.5pt", fontWeight: 700, marginTop: "2pt" }}>{a.unitLine}</div>
                </div>
                <div style={{ width: 1, background: "#e9dcc8" }} />
                <div style={{ flex: 1.15, padding: "13pt 26pt", background: "#faf5ec" }}>
                  <div style={{ fontSize: "7.5pt", fontWeight: 700, letterSpacing: "1.2pt", textTransform: "uppercase", color: "#9c8974", marginBottom: "6pt" }}>Wi-Fi &amp; Netflix</div>
                  {accessRows.length === 0 ? (
                    <div style={{ fontSize: "9pt", color: "#b3a48f" }}>Not configured</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4pt" }}>
                      {accessRows.map((r) => (
                        <div key={r.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10pt", background: "#fff", border: "1px solid #ece2d0", borderRadius: "5pt", padding: "5pt 9pt" }}>
                          <span style={{ fontSize: "9pt", color: "#9c8974" }}>{r.label}</span>
                          <span style={{ fontFamily: MONO, fontSize: "11pt", fontWeight: 700, letterSpacing: "0.4pt" }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Duty callout */}
              <div style={{ padding: "16pt 26pt 0" }}>
                <div style={{ display: "flex", gap: "12pt", alignItems: "stretch", background: "#fdf7ea", border: "1px solid #e9dcc8", borderRadius: "9pt", padding: "12pt 14pt" }}>
                  <div style={{ flex: "0 0 3pt", background: "#d9a25c", borderRadius: "2pt" }} />
                  <div>
                    <div style={{ fontSize: "13pt", fontWeight: 700, lineHeight: 1.3 }}>{DUTY_HEADLINE}</div>
                    <div style={{ fontSize: "10pt", lineHeight: 1.45, color: "#5c4a3c", marginTop: "3pt" }}>{DUTY_SUB}</div>
                  </div>
                </div>
              </div>

              {/* The four numbered sections, 2x2 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12pt", padding: "14pt 26pt 0" }}>
                {RULE_SECTIONS.map((s) => (
                  <div key={s.n} style={{ borderTop: "2pt solid #2b1b12", paddingTop: "9pt" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7pt", marginBottom: "8pt" }}>
                      <div style={{ width: "16pt", height: "16pt", borderRadius: "50%", background: "#2b1b12", color: "#f6ede0", fontSize: "8.5pt", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 16pt" }}>{s.n}</div>
                      <div style={{ fontSize: "10.5pt", fontWeight: 700, letterSpacing: "0.6pt", textTransform: "uppercase" }}>{s.title}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6pt", fontSize: "10pt", lineHeight: 1.4, color: "#3a2a1e" }}>
                      {s.bullets.map((b, i) => (
                        <div key={i} style={{ display: "flex", gap: "7pt" }}>
                          <span style={{ color: "#d9a25c", fontWeight: 700 }}>&bull;</span>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quiet time + pool */}
              <div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: "12pt", padding: "16pt 26pt 0" }}>
                <div style={{ background: "#2b1b12", borderRadius: "9pt", padding: "12pt 14pt", color: "#f6ede0" }}>
                  <div style={{ fontSize: "7.5pt", fontWeight: 700, letterSpacing: "1.2pt", textTransform: "uppercase", color: "#B8A689", marginBottom: "4pt" }}>Quiet time</div>
                  <div style={{ fontFamily: SERIF, fontSize: "16pt", fontWeight: 500, lineHeight: 1.15 }}>{QUIET_TIME}</div>
                </div>
                <div style={{ background: "#faf5ec", border: "1px solid #e9dcc8", borderRadius: "9pt", padding: "12pt 14pt" }}>
                  <div style={{ fontSize: "7.5pt", fontWeight: 700, letterSpacing: "1.2pt", textTransform: "uppercase", color: "#8c5a2e", marginBottom: "4pt" }}>Note on the pool</div>
                  <div style={{ fontSize: "10pt", lineHeight: 1.4, color: "#3a2a1e" }}>{POOL_NOTE}</div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16pt", background: "#faf5ec", borderTop: "1px solid #e9dcc8", padding: "13pt 26pt" }}>
                <div style={{ fontSize: "9pt", lineHeight: 1.5, color: "#9c8974" }}>
                  Need a hand? Message us anytime.<br />{a.contact}
                </div>
                <div style={{ fontFamily: SERIF, fontSize: "16pt" }}>{SIGN_OFF}</div>
              </div>

            </div>
          </section>
        </div>
      </div>
    </>
  );
}
