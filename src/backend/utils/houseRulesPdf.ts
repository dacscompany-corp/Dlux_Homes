// The House Rules sheet as a downloadable PDF — the same document the printable
// page at /admin/house-rules renders, so the owner can email or archive it
// instead of going through the browser print dialog.
//
// Content comes from lib/house-rules-sheet, shared with that page, so the two
// copies cannot drift.
//
// LETTER, not A4 like the receipt and guest-record generators in
// pdfGenerators.ts — the design specifies letter and this is printed on PH
// office stock. Units are pt so the numbers line up 1:1 with the design file's
// own pt measurements.

import jsPDF from "jspdf";
import {
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_SOFT,
  ACCENT_GOLD,
  MUTED_GOLD,
  BODY_TEXT,
  LABEL_MUTED,
  WHITE,
  GRAY,
} from "./pdfGenerators";

const CREAM_PANEL: [number, number, number] = [250, 245, 236]; // #faf5ec
const HAIRLINE: [number, number, number] = [233, 220, 200]; // #e9dcc8
const CALLOUT_BG: [number, number, number] = [253, 247, 234]; // #fdf7ea
const FIELD_BORDER: [number, number, number] = [236, 226, 208]; // #ece2d0
const CREAM_TEXT: [number, number, number] = [246, 237, 224]; // #f6ede0
const PANEL_LABEL: [number, number, number] = [184, 166, 137]; // #B8A689
const RUST: [number, number, number] = [140, 90, 46]; // #8c5a2e

export interface HouseRulesPDFData {
  building: string;
  unitLine: string;
  wifiName: string;
  wifiPassword: string;
  netflixPin: string;
  contact: string;
  sections: { n: number; title: string; bullets: string[] }[];
  dutyHeadline: string;
  dutySub: string;
  quietTime: string;
  poolNote: string;
  welcome: string;
  tagline: string;
  signOff: string;
}

export async function generateHouseRulesPDF(d: HouseRulesPDFData): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth(); // 612pt
  const pageHeight = pdf.internal.pageSize.getHeight(); // 792pt

  const outer = 0.34 * 72; // the design's 0.34in page margin
  const cardX = outer;
  const cardW = pageWidth - outer * 2;
  const padX = 26; // the design's 26pt inner gutter

  // Cream page, white card on top of it.
  pdf.setFillColor(...PRIMARY_SOFT);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.setFillColor(...WHITE);
  pdf.roundedRect(cardX, outer, cardW, pageHeight - outer * 2, 14, 14, "F");

  // ── Masthead ─────────────────────────────────────────────────────────────
  const headH = 118;
  pdf.setFillColor(...PRIMARY);
  pdf.roundedRect(cardX, outer, cardW, headH, 14, 14, "F");
  // Square off the band's bottom corners so it meets the body flush.
  pdf.rect(cardX, outer + headH - 14, cardW, 14, "F");

  let y = outer + 32;
  pdf.setTextColor(...CREAM_TEXT);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  pdf.text("D'Lux Homes", cardX + padX, y);

  y += 14;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED_GOLD);
  pdf.text(d.tagline.toUpperCase(), cardX + padX, y, { charSpace: 3.5 });

  y += 12;
  pdf.setFillColor(...ACCENT_GOLD);
  pdf.rect(cardX + padX, y, 34, 2.5, "F");

  y += 24;
  pdf.setTextColor(...CREAM_TEXT);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(d.welcome, cardX + padX, y);

  y += 14;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...MUTED_GOLD);
  pdf.text("HOUSE RULES & INFO", cardX + padX, y, { charSpace: 1.5 });

  // ── Unit + access strip ──────────────────────────────────────────────────
  const stripTop = outer + headH;
  const stripH = 78;
  const splitX = cardX + cardW * 0.466;

  pdf.setFillColor(...CREAM_PANEL);
  pdf.rect(splitX, stripTop, cardX + cardW - splitX, stripH, "F");
  pdf.setDrawColor(...HAIRLINE);
  pdf.setLineWidth(0.7);
  pdf.line(splitX, stripTop, splitX, stripTop + stripH);
  pdf.line(cardX, stripTop + stripH, cardX + cardW, stripTop + stripH);

  let ly = stripTop + 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...LABEL_MUTED);
  pdf.text("YOUR UNIT", cardX + padX, ly, { charSpace: 1.2 });
  ly += 16;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...BODY_TEXT);
  pdf.text(d.building, cardX + padX, ly, { maxWidth: splitX - cardX - padX - 10 });
  ly += 18;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13.5);
  pdf.setTextColor(...PRIMARY);
  pdf.text(d.unitLine, cardX + padX, ly);

  // An unset credential is skipped, never printed as a blank row.
  const rows = [
    { label: "Wi-Fi name", value: d.wifiName },
    { label: "Password", value: d.wifiPassword },
    { label: "Netflix PIN", value: d.netflixPin },
  ].filter((r) => r.value);

  let ry = stripTop + 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...LABEL_MUTED);
  pdf.text("WI-FI & NETFLIX", splitX + padX, ry, { charSpace: 1.2 });
  ry += 8;

  if (rows.length === 0) {
    ry += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...GRAY);
    pdf.text("Not configured", splitX + padX, ry);
  } else {
    const rowW = cardX + cardW - splitX - padX * 2;
    const rowH = 15;
    for (const r of rows) {
      pdf.setFillColor(...WHITE);
      pdf.setDrawColor(...FIELD_BORDER);
      pdf.roundedRect(splitX + padX, ry, rowW, rowH, 4, 4, "FD");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...LABEL_MUTED);
      pdf.text(r.label, splitX + padX + 7, ry + 10.5);
      pdf.setFont("courier", "bold");
      pdf.setFontSize(10.5);
      pdf.setTextColor(...PRIMARY);
      pdf.text(r.value, splitX + padX + rowW - 7, ry + 10.5, { align: "right" });
      ry += rowH + 4;
    }
  }

  // ── Duty callout ─────────────────────────────────────────────────────────
  let by = stripTop + stripH + 16;
  const innerW = cardW - padX * 2;
  const headLines = pdf.splitTextToSize(d.dutyHeadline, innerW - 34) as string[];
  const subLines = pdf.splitTextToSize(d.dutySub, innerW - 34) as string[];
  const calloutH = 16 + headLines.length * 15 + subLines.length * 12;

  pdf.setFillColor(...CALLOUT_BG);
  pdf.setDrawColor(...HAIRLINE);
  pdf.roundedRect(cardX + padX, by, innerW, calloutH, 9, 9, "FD");
  pdf.setFillColor(...ACCENT_GOLD);
  pdf.roundedRect(cardX + padX + 11, by + 9, 3, calloutH - 18, 1.5, 1.5, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...PRIMARY);
  pdf.text(headLines, cardX + padX + 24, by + 19);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...BODY_TEXT);
  pdf.text(subLines, cardX + padX + 24, by + 19 + headLines.length * 15);

  // ── The four numbered sections, 2 x 2 ────────────────────────────────────
  by += calloutH + 18;
  const colGap = 12;
  const colW = (innerW - colGap) / 2;

  // Row by row, so both columns of a row share a top edge and the next row
  // starts below whichever column ran longer.
  for (let i = 0; i < d.sections.length; i += 2) {
    const pair = d.sections.slice(i, i + 2);
    let rowBottom = by;

    pair.forEach((s, j) => {
      const x = cardX + padX + j * (colW + colGap);
      let sy = by;

      pdf.setDrawColor(...PRIMARY);
      pdf.setLineWidth(2);
      pdf.line(x, sy, x + colW, sy);
      pdf.setLineWidth(0.7);
      sy += 16;

      pdf.setFillColor(...PRIMARY);
      pdf.circle(x + 8, sy - 3, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...CREAM_TEXT);
      pdf.text(String(s.n), x + 8, sy, { align: "center" });

      pdf.setFontSize(10.5);
      pdf.setTextColor(...PRIMARY);
      pdf.text(s.title.toUpperCase(), x + 21, sy, { charSpace: 0.6 });
      sy += 18;

      pdf.setFontSize(10);
      for (const b of s.bullets) {
        const lines = pdf.splitTextToSize(b, colW - 10) as string[];
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...ACCENT_GOLD);
        pdf.text("•", x, sy);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...PRIMARY_DARK);
        pdf.text(lines, x + 8, sy);
        sy += lines.length * 12 + 5;
      }
      rowBottom = Math.max(rowBottom, sy);
    });

    by = rowBottom + 10;
  }

  // ── Quiet time + pool note ───────────────────────────────────────────────
  by += 6;
  const qW = innerW * 0.425;
  const pW = innerW - qW - colGap;
  const poolLines = pdf.splitTextToSize(d.poolNote, pW - 28) as string[];
  const boxH = Math.max(50, 26 + poolLines.length * 12);

  pdf.setFillColor(...PRIMARY);
  pdf.roundedRect(cardX + padX, by, qW, boxH, 9, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...PANEL_LABEL);
  pdf.text("QUIET TIME", cardX + padX + 14, by + 18, { charSpace: 1.2 });
  pdf.setFontSize(16);
  pdf.setTextColor(...CREAM_TEXT);
  pdf.text(d.quietTime, cardX + padX + 14, by + 40);

  const px = cardX + padX + qW + colGap;
  pdf.setFillColor(...CREAM_PANEL);
  pdf.setDrawColor(...HAIRLINE);
  pdf.roundedRect(px, by, pW, boxH, 9, 9, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...RUST);
  pdf.text("NOTE ON THE POOL", px + 14, by + 18, { charSpace: 1.2 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...PRIMARY_DARK);
  pdf.text(poolLines, px + 14, by + 34);

  // ── Footer, pinned to the bottom of the card ─────────────────────────────
  const footH = 46;
  const footY = pageHeight - outer - footH;
  pdf.setFillColor(...CREAM_PANEL);
  pdf.roundedRect(cardX, footY, cardW, footH, 14, 14, "F");
  // Square off the top corners so it reads as a band, not a floating pill.
  pdf.rect(cardX, footY, cardW, 14, "F");
  pdf.setDrawColor(...HAIRLINE);
  pdf.line(cardX, footY, cardX + cardW, footY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...LABEL_MUTED);
  pdf.text("Need a hand? Message us anytime.", cardX + padX, footY + 19);
  pdf.text(d.contact, cardX + padX, footY + 31);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...PRIMARY);
  pdf.text(d.signOff, cardX + cardW - padX, footY + 28, { align: "right" });

  return Buffer.from(pdf.output("arraybuffer"));
}
