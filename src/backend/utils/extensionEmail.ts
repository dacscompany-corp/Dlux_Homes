import nodemailer from "nodemailer";
import type { EmailDispatchResult } from "./dispatchEmail";

// The guest's notice that an admin extended their stay: the new checkout date
// and what they owe for it. Sent straight from the server rather than through
// a public /api/send-*-email route, so there is no open endpoint that mails
// whatever it's handed. Same look as the date-change email.
//
// Never throws: the extension is already saved, so a mail failure is reported
// back (for the admin to follow up) instead of undoing it.

export type ExtensionEmail = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  bookingId: string;
  roomName: string;
  checkInDate: string;
  oldCheckOutDate: string;
  newCheckOutDate: string;
  checkOutTime?: string | null;
  addedNights: number;
  charge: number;
  balanceDue: number;
};

function to12h(t: string | undefined | null): string {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

/** "2026-09-05" -> "Sat, Sep 5, 2026". Parsed at NOON so no timezone can shift the day. */
function longDate(iso: string): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const peso = (n: number) => `&#8369;${Math.round(n).toLocaleString("en-PH")}`;

const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
  .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
  .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
  .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; }
  .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
  .content { padding: 40px 36px; }
  .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; margin-bottom: 14px; }
  .intro-text { color: #8B7458; margin-bottom: 24px; line-height: 1.7; font-size: 15px; }
  .old-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; border-radius: 14px; padding: 16px 22px; margin-bottom: 10px; }
  .old-label, .new-label, .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; margin-bottom: 4px; }
  .old-value { color: #9B8B73; font-size: 14.5px; text-decoration: line-through; }
  .new-card { background-color: #FFFCF4; border: 2px solid #B07848; border-radius: 14px; padding: 18px 22px; }
  .new-label { color: #B07848; }
  .new-value { color: #1F160E; font-size: 17px; font-weight: 700; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B07848; margin: 30px 0 12px; }
  .info-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 6px 24px; border-radius: 14px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #E7D9BE; }
  .info-row:last-child { border-bottom: none; }
  .info-value { color: #1F160E; font-weight: 600; font-size: 14.5px; text-align: right; }
  .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 22px 26px; margin: 24px 0; border-radius: 10px; color: #6B5A42; }
  .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; font-size: 13px; }
`;

export async function sendExtensionEmail(d: ExtensionEmail): Promise<EmailDispatchResult> {
  const kind = "stay extension";
  if (!d.email) return { kind, ok: false, detail: "No guest email on this booking — the guest was NOT told about the extension." };
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });
    const name = esc(`${d.firstName || "Guest"}${d.lastName ? ` ${d.lastName}` : ""}`);
    const outTime = to12h(d.checkOutTime);
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Your stay has been extended - D'Lux Homes</title><style>${STYLES}</style></head>
      <body><div class="email-container">
        <div class="header"><div class="logo">D&rsquo;Lux Homes</div><div class="tagline">Your stay has been extended</div></div>
        <div class="content">
          <div class="greeting">Hello ${name},</div>
          <p class="intro-text">Good news &mdash; your stay at <strong>${esc(d.roomName)}</strong> has been extended by
            <strong>${d.addedNights} ${d.addedNights === 1 ? "night" : "nights"}</strong>. Please check your new checkout below.</p>
          <div class="old-card"><div class="old-label">Previous checkout</div><div class="old-value">${longDate(d.oldCheckOutDate)}</div></div>
          <div class="new-card"><div class="new-label">New checkout</div><div class="new-value">${longDate(d.newCheckOutDate)}${outTime ? ` &middot; ${outTime}` : ""}</div></div>
          <div class="section-title">Payment</div>
          <div class="info-card">
            <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${esc(d.bookingId)}</span></div>
            <div class="info-row"><span class="info-label">Extension (${d.addedNights} ${d.addedNights === 1 ? "night" : "nights"})</span><span class="info-value">${peso(d.charge)}</span></div>
            <div class="info-row"><span class="info-label">Amount due now</span><span class="info-value">${peso(d.balanceDue)}</span></div>
          </div>
          <div class="alert-box">Please settle the amount due with our staff before your new checkout. Your security deposit stays as it is &mdash; no extra deposit is needed. If anything here looks wrong, just reply to this email.</div>
        </div>
        <div class="footer">homesdlux@gmail.com &middot; Tower 4, Grass Residences, QC</div>
      </div></body></html>`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: d.email,
      subject: `Your stay has been extended - ${d.bookingId}`,
      html,
    });
    return { kind, ok: true };
  } catch (err) {
    console.error("❌ extension email failed:", err);
    return { kind, ok: false, detail: "The extension email could not be sent — please tell the guest yourself." };
  }
}
