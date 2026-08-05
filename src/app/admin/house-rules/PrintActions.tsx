"use client";

// The only interactive part of the sheet page. Split out so the page itself can
// stay a server component — that is what keeps the Wi-Fi password and Netflix
// PIN out of the client bundle.

export default function PrintActions() {
  const btn: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 11,
    fontFamily: "inherit",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  };

  return (
    <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", padding: "20px 16px 0" }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ ...btn, border: "none", background: "#B07848", color: "#FFFCF4" }}
      >
        Print sheet
      </button>
      <a
        href="/api/admin/house-rules/pdf"
        style={{ ...btn, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#5A4632" }}
      >
        Download PDF
      </a>
    </div>
  );
}
