import jsPDF from "jspdf";

// ─── Shared palette (matches the D'Lux Homes email templates) ───────────────
// Exported so other PDF builders (houseRulesPdf.ts) use the same brand values
// rather than re-typing hex.
export const PRIMARY: [number, number, number] = [43, 27, 18]; // #2b1b12 dark ink
export const PRIMARY_DARK: [number, number, number] = [58, 42, 30]; // #3a2a1e
export const PRIMARY_SOFT: [number, number, number] = [243, 234, 217]; // #F3EAD9 cream
export const ACCENT_GOLD: [number, number, number] = [217, 162, 92]; // #d9a25c
export const MUTED_GOLD: [number, number, number] = [203, 184, 156]; // #CBB89C
export const BODY_TEXT: [number, number, number] = [92, 74, 60]; // #5c4a3c
export const LABEL_MUTED: [number, number, number] = [156, 137, 116]; // #9c8974
const LIGHT_BORDER: [number, number, number] = [240, 230, 216]; // #f0e6d8
export const WHITE: [number, number, number] = [255, 255, 255];
export const GRAY: [number, number, number] = [179, 164, 143]; // #b3a48f

export interface ReceiptData {
  bookingId: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  roomName?: string;
  stayType?: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  guests?: string;
  adults?: number;
  children?: number;
  infants?: number;
  numberOfNights?: number;
  roomRate?: number;
  securityDeposit?: number;
  addOnsTotal?: number;
  totalAmount: string | number;
  downPayment: string | number;
  remainingBalance?: string | number;
  paymentMethod?: string;
}

// ─── Receipt PDF ─────────────────────────────────────────────────────────────
// Layout mirrors the "D'Lux Homes Receipt" design (dark header, paid banner,
// guest/stay columns, bordered payment table, notes card, centered footer).

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const cw = pageWidth - margin * 2;

  const total = typeof data.totalAmount === "string" ? parseFloat(data.totalAmount) : (data.totalAmount ?? 0);
  const down = typeof data.downPayment === "string" ? parseFloat(data.downPayment) : (data.downPayment ?? 0);
  const balance =
    data.remainingBalance != null
      ? typeof data.remainingBalance === "string"
        ? parseFloat(data.remainingBalance)
        : data.remainingBalance
      : total - down;
  const isPaid = balance <= 0;

  const adults = data.adults ?? 1;
  const children = data.children ?? 0;
  const infants = data.infants ?? 0;
  const guestSummary =
    data.guests ||
    `${adults} Adult${adults > 1 ? "s" : ""}${children > 0 ? `, ${children} Young Adult${children > 1 ? "s" : ""}` : ""}${infants > 0 ? `, ${infants} Child${infants > 1 ? "ren" : ""}` : ""}`;

  const methodLabel = data.paymentMethod === "gcash" ? "GCash" : data.paymentMethod === "bank_transfer" ? "Bank Transfer" : null;

  // jsPDF's built-in Helvetica font has no glyph for ₱ (U+20B1) — it falls
  // back to "±". Use a "PHP" text prefix instead of the symbol.
  const fmt = (n: number) => `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

  // ── Header ───────────────────────────────────────────────────────────────
  const HEADER_H = 40;
  pdf.setFillColor(...PRIMARY);
  pdf.rect(0, 0, pageWidth, HEADER_H, "F");

  pdf.setTextColor(...WHITE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("D'Lux Homes", margin, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED_GOLD);
  pdf.text("Your Perfect Getaway Awaits", margin, 25);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...ACCENT_GOLD);
  pdf.text("OFFICIAL RECEIPT", pageWidth - margin, 14, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED_GOLD);
  pdf.text(`Receipt #${data.bookingId}`, pageWidth - margin, 20, { align: "right" });
  pdf.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    pageWidth - margin,
    25,
    { align: "right" },
  );

  // ── Paid banner ──────────────────────────────────────────────────────────
  const BANNER_H = 12;
  pdf.setFillColor(...PRIMARY_SOFT);
  pdf.rect(0, HEADER_H, pageWidth, BANNER_H, "F");
  const bannerY = HEADER_H + BANNER_H / 2 + 2;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...PRIMARY_DARK);
  pdf.text(`Booking ID · ${data.bookingId}`, margin, bannerY);

  const statusText = isPaid ? "FULLY PAID" : "PARTIALLY PAID";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...PRIMARY);
  pdf.text(statusText, pageWidth - margin, bannerY, { align: "right" });
  const statusW = pdf.getTextWidth(statusText);
  pdf.setFillColor(...ACCENT_GOLD);
  pdf.circle(pageWidth - margin - statusW - 4, bannerY - 1.2, 1.1, "F");

  // ── Guest / Stay columns ─────────────────────────────────────────────────
  let y = HEADER_H + BANNER_H + 14;
  const colGap = 8;
  const colW = (cw - colGap) / 2;
  const col1X = margin;
  const col2X = margin + colW + colGap;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...LABEL_MUTED);
  pdf.text("GUEST", col1X, y);
  pdf.text("STAY", col2X, y);

  y += 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...PRIMARY);
  pdf.text(`${data.firstName} ${data.lastName || ""}`.trim(), col1X, y);
  pdf.text(data.roomName || "N/A", col2X, y);

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...BODY_TEXT);
  pdf.text(data.email || "N/A", col1X, y);
  pdf.text(
    `Check-in ${data.checkInDate || "N/A"}${data.checkInTime ? " · " + data.checkInTime : ""}`,
    col2X,
    y,
  );

  y += 5;
  pdf.text(guestSummary, col1X, y);
  pdf.text(
    `Check-out ${data.checkOutDate || "N/A"}${data.checkOutTime ? " · " + data.checkOutTime : ""}`,
    col2X,
    y,
  );

  // ── Payment table ────────────────────────────────────────────────────────
  y += 14;
  const rowH = 9;
  const finalRowH = 13;
  const lineItems = [
    { label: "Total Amount", amount: fmt(total) },
    { label: `Down Payment (Paid${methodLabel ? " via " + methodLabel : ""})`, amount: `- ${fmt(down)}` },
    { label: "Remaining Balance", amount: fmt(balance) },
  ];
  const tableH = lineItems.length * rowH + finalRowH;

  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(margin, y, cw, tableH, 2, 2, "S");

  lineItems.forEach((row, i) => {
    const ry = y + i * rowH;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...BODY_TEXT);
    pdf.text(row.label, margin + 5, ry + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...PRIMARY);
    pdf.text(row.amount, pageWidth - margin - 5, ry + 6, { align: "right" });
    if (i < lineItems.length - 1) {
      pdf.setDrawColor(...LIGHT_BORDER);
      pdf.setLineWidth(0.2);
      pdf.line(margin, ry + rowH, margin + cw, ry + rowH);
    }
  });

  const totalRowY = y + lineItems.length * rowH;
  pdf.setFillColor(...PRIMARY);
  pdf.rect(margin, totalRowY, cw, finalRowH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...WHITE);
  pdf.text("Amount Paid", margin + 5, totalRowY + 8.5);
  pdf.setFontSize(15);
  pdf.setTextColor(...ACCENT_GOLD);
  pdf.text(fmt(down), pageWidth - margin - 5, totalRowY + 8.5, { align: "right" });

  // ── Notes ────────────────────────────────────────────────────────────────
  y = totalRowY + finalRowH + 12;
  const notes = [
    "Please present this receipt and a valid ID at check-in.",
    "Check-in from 2:00 PM · check-out by 12:00 PM.",
    "Your security deposit is refunded at check-out if there's no damage.",
  ];
  const notesH = 8 + notes.length * 5 + 4;
  pdf.setFillColor(...PRIMARY_SOFT);
  pdf.roundedRect(margin, y, cw, notesH, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...LABEL_MUTED);
  pdf.text("GOOD TO KNOW", margin + 5, y + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...BODY_TEXT);
  notes.forEach((note, i) => {
    pdf.text(`• ${note}`, margin + 5, y + 13 + i * 5);
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  y += notesH + 14;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...PRIMARY);
  pdf.text("Thank you for choosing D'Lux Homes!", pageWidth / 2, y, { align: "center" });
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...GRAY);
  pdf.text(
    "Computer-generated receipt — no signature required. · homesdlux@gmail.com",
    pageWidth / 2,
    y,
    { align: "center" },
  );

  return Buffer.from(pdf.output("arraybuffer"));
}

// ───────────────────────────────────────────────────────────────────────────
// Guest record — the check-in dossier for one booking.
//
// Page 1 is the booking itself (stay, money, contact). After that there is ONE
// PAGE PER GUEST, each showing that guest's details and their valid ID printed
// large enough to actually read. A guest per page means a sheet can be printed,
// filed or handed over on its own without exposing the other guests.
// ───────────────────────────────────────────────────────────────────────────

export interface GuestRecordGuest {
  name: string;
  /** "Booked by" for the main guest, "Guest 2" … for the rest. */
  role: string;
  age: string;
  gender: string;
  /** Base64 data URLs, already fetched by the caller. */
  idImages: string[];
  /** False for under-10s, who are not required to present an ID. */
  idRequired: boolean;
}

export interface GuestRecordData {
  bookingId: string;
  status: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  nights?: number;
  contactEmail?: string;
  contactPhone?: string;
  totalAmount?: number;
  downPayment?: number;
  remainingBalance?: number;
  securityDeposit?: number;
  paymentMethod?: string;
  paymentReference?: string;
  guests: GuestRecordGuest[];
}

export async function generateGuestRecordPDF(data: GuestRecordData): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const cw = pageWidth - margin * 2;

  // Helvetica has no glyph for the peso sign — it renders as "±". Same "PHP"
  // prefix the receipt generator above uses.
  const fmt = (n?: number) =>
    `PHP ${(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  const dash = (s?: string) => (s && s.trim() ? s : "—");

  // Brand band repeated on every page, so a single detached sheet is still
  // identifiable as belonging to this booking.
  const header = (subtitle: string) => {
    pdf.setFillColor(...PRIMARY);
    pdf.rect(0, 0, pageWidth, 34, "F");
    pdf.setTextColor(...WHITE);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text("D'Lux Homes", margin, 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTED_GOLD);
    pdf.text(subtitle, margin, 23.5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...ACCENT_GOLD);
    pdf.text(`Booking ${data.bookingId}`, pageWidth - margin, 16, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED_GOLD);
    pdf.text((data.status || "").toUpperCase(), pageWidth - margin, 23.5, { align: "right" });
    return 48;
  };

  const sectionTitle = (label: string, yy: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...ACCENT_GOLD);
    pdf.text(label.toUpperCase(), margin, yy);
    pdf.setDrawColor(...LIGHT_BORDER);
    pdf.setLineWidth(0.4);
    pdf.line(margin, yy + 2.5, margin + cw, yy + 2.5);
    return yy + 10;
  };

  const row = (label: string, value: string, yy: number, bold = false) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...LABEL_MUTED);
    pdf.text(label, margin, yy);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setTextColor(...(bold ? PRIMARY_DARK : BODY_TEXT));
    pdf.text(value, margin + cw, yy, { align: "right" });
    return yy + 7;
  };

  // ── Page 1 · the booking ─────────────────────────────────────────────────
  let y = header("Guest record & valid IDs");

  y = sectionTitle("The stay", y);
  y = row("Property", dash(data.roomName), y);
  y = row("Check-in", `${dash(data.checkInDate)}${data.checkInTime ? `  ·  ${data.checkInTime}` : ""}`, y, true);
  y = row("Check-out", `${dash(data.checkOutDate)}${data.checkOutTime ? `  ·  ${data.checkOutTime}` : ""}`, y, true);
  if (data.nights) y = row("Nights", String(data.nights), y);
  y = row("Guests on this booking", String(data.guests.length), y);

  y += 6;
  y = sectionTitle("Reach the guest", y);
  y = row("Email", dash(data.contactEmail), y);
  y = row("Phone", dash(data.contactPhone), y);

  y += 6;
  y = sectionTitle("Money", y);
  y = row("Total for this stay", fmt(data.totalAmount), y, true);
  y = row("Down payment (paid)", fmt(data.downPayment), y);
  y = row("Balance due at check-in", fmt(data.remainingBalance), y, true);
  y = row("Security deposit (refundable)", fmt(data.securityDeposit), y);
  y = row("Payment method", dash(data.paymentMethod), y);
  if (data.paymentReference) y = row("Reference no.", data.paymentReference, y);

  // The one number the host actually collects at the door.
  const collect = (data.remainingBalance ?? 0) + (data.securityDeposit ?? 0);
  y += 3;
  pdf.setFillColor(...PRIMARY_SOFT);
  pdf.roundedRect(margin, y, cw, 15, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...PRIMARY);
  pdf.text("Collect on arrival", margin + 6, y + 9.5);
  pdf.setFontSize(12);
  pdf.text(fmt(collect), margin + cw - 6, y + 9.5, { align: "right" });

  // ── One page per guest ───────────────────────────────────────────────────
  data.guests.forEach((g, i) => {
    pdf.addPage();
    let gy = header(`Guest ${i + 1} of ${data.guests.length}`);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(...PRIMARY);
    pdf.text(dash(g.name), margin, gy);
    gy += 7;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...LABEL_MUTED);
    pdf.text([g.role, g.age ? `${g.age} yrs` : "", g.gender].filter(Boolean).join("  ·  "), margin, gy);
    gy += 12;

    gy = sectionTitle("Valid ID", gy);

    if (g.idImages.length === 0) {
      pdf.setFillColor(...PRIMARY_SOFT);
      pdf.roundedRect(margin, gy, cw, 22, 3, 3, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...(g.idRequired ? PRIMARY : LABEL_MUTED));
      pdf.text(
        g.idRequired ? "No valid ID on file — collect one at check-in" : "No ID required (under 10)",
        margin + 6,
        gy + 13,
      );
      return;
    }

    g.idImages.forEach((img, k) => {
      let props: { width: number; height: number };
      try {
        props = pdf.getImageProperties(img);
      } catch {
        return; // unreadable image — skip it rather than abort the whole PDF
      }
      let avail = pageHeight - margin - 8 - gy;
      // Too little room left for a legible ID — give it a fresh page.
      if (avail < 45) {
        pdf.addPage();
        gy = header(`${dash(g.name)} — valid ID ${k + 1}`);
        avail = pageHeight - margin - 8 - gy;
      }
      // Fit the column width, then cap by whatever height remains.
      let w = cw;
      let h = (props.height / props.width) * w;
      if (h > avail) {
        h = avail;
        w = (props.width / props.height) * h;
      }
      const x = margin + (cw - w) / 2;
      pdf.addImage(img, x, gy, w, h, undefined, "FAST");
      pdf.setDrawColor(...LIGHT_BORDER);
      pdf.setLineWidth(0.4);
      pdf.rect(x, gy, w, h);
      gy += h + 6;
    });
  });

  // ── Footer on every page ─────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...GRAY);
    pdf.text(
      `D'Lux Homes · Booking ${data.bookingId} · Confidential — contains guest identity documents`,
      margin,
      pageHeight - 10,
    );
    pdf.text(`${p} / ${pages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
