import jsPDF from "jspdf";

// ─── Shared palette (matches the D'Lux Homes email templates) ───────────────
const PRIMARY: [number, number, number] = [43, 27, 18]; // #2b1b12 dark ink
const PRIMARY_DARK: [number, number, number] = [58, 42, 30]; // #3a2a1e
const PRIMARY_SOFT: [number, number, number] = [243, 234, 217]; // #F3EAD9 cream
const ACCENT_GOLD: [number, number, number] = [217, 162, 92]; // #d9a25c
const MUTED_GOLD: [number, number, number] = [203, 184, 156]; // #CBB89C
const BODY_TEXT: [number, number, number] = [92, 74, 60]; // #5c4a3c
const LABEL_MUTED: [number, number, number] = [156, 137, 116]; // #9c8974
const LIGHT_BORDER: [number, number, number] = [240, 230, 216]; // #f0e6d8
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [179, 164, 143]; // #b3a48f

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
