// Pre-arrival "self check-in" email — four numbered steps, what to pay on
// arrival, and where to send it. Sent automatically shortly before the guest's
// check-in time, for every stay type.
// Scheduler: src/app/api/cron/send-self-checkin-emails/route.ts
//
// Distinct from the CHECK-IN module (src/app/api/send-checkin-email), which is
// sent AFTER an admin marks a booking "Checked In" to confirm the arrival. This
// one tells the guest how to let themselves in; that one welcomes them once
// they already have — and it is the send that carries the HOUSE RULES.
//
// Layout is from the owner's "Self Check-In Instructions" design. That design
// is written in flexbox; this is not, deliberately. Gmail's spam-quarantine
// view and every Outlook build ignore display:flex, so each flex row is
// rebuilt as a table here. Same reason the other status emails are tables.

import nodemailer from "nodemailer";
import pool from "../config/db";
import { securityDepositFor } from "@/lib/pricing";
import { CHECKIN_LEAD_MINUTES } from "@/lib/checkin-window";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Where the unit is and where the key lives. Non-secret, so these keep working
// defaults — the env vars exist only so the owner can change unit or mailbox
// without a deploy.
const ACCESS = {
  tower: process.env.DLUX_TOWER || "Tower 4",
  floor: process.env.DLUX_FLOOR || "12th floor",
  unit: process.env.DLUX_UNIT_NUMBER || "1240",
  mailbox: process.env.DLUX_MAILBOX || "1240",
};

export interface PaymentChannels {
  gcashNumber: string;
  gcashName: string;
  gcashQr: string;
  bankName: string;
  bankAccount: string;
  bankAccountName: string;
  bankQr: string;
}

// Cloudinary stores these as http://. Gmail and Outlook downgrade or drop
// insecure images, so the QR would silently fail to appear — and Cloudinary
// serves the identical asset over TLS, so upgrading costs nothing.
function secureUrl(url: string | null | undefined): string {
  const u = (url || "").trim();
  if (!u) return "";
  return u.startsWith("http://") ? "https://" + u.slice("http://".length) : u;
}

export interface SelfCheckinEmailInput {
  email: string;
  guestName: string;
  bookingId: string;
  /** Still owed on arrival — booking_payments.remaining_balance. */
  balanceAmount: number;
  /** Refundable deposit collected at check-in. Undefined falls back to the
   *  tiered amount for checkInDate/checkOutDate's night count (securityDepositFor()). */
  depositAmount?: number;
  /** Row label for the balance. Defaults to the standard 50% split. */
  balanceLabel?: string;
  /** GCash / bank details, normally from loadPaymentChannels(). */
  channels?: Partial<PaymentChannels>;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  /** Haven's owner-configured deposit tiers, used when depositAmount is absent. */
  securityDeposit?: number;
  depositTier1Amount?: number;
  depositTier2Amount?: number;
  depositTier3Amount?: number;
  depositTier4Amount?: number;
}

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const peso = (n: number): string =>
  "₱" +
  Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// House rules, transcribed from the owner's printed sheet in the unit. The
// "maintain the unit's cleanliness and order" line is the section's lead-in
// rather than a bullet, and quiet time / the pool notice get their own callout.
//
// NOT rendered by this email — the self check-in design carries payment
// instructions instead. Kept here as the single source for the Collect send
// (src/app/api/send-checkin-email), which imports it.
export const HOUSE_RULES = [
  "Throw your own garbage.",
  "In the living area and bedroom, no food or drink is permitted.",
  "Instead of throwing used tissue paper down the toilet, please use the provided toilet trash can.",
  "Please make use of the bidets. Do not throw food in the toilet, as it may lead to blockage.",
  "When cooking, use the range hood ventilation fan to circulate air and prevent odors from spreading. If you are not using the appliances, please turn it off.",
  "Smoking is not permitted within the unit. There is a designated smoking area next to the guard house at Gates 2 and 3.",
  "We only deliver fresh linens, bedsheet, towel and rugs.",
  "We only clean upon your check-out.",
];

/**
 * The owner's active GCash and bank-transfer details, straight from the
 * payment_methods table they already manage in the admin portal — so the email
 * can't drift from what checkout shows the guest.
 *
 * Missing rows come back as empty strings and their lines are then omitted from
 * the email rather than rendering blank labels.
 */
export async function loadPaymentChannels(): Promise<PaymentChannels> {
  const empty: PaymentChannels = {
    gcashNumber: "", gcashName: "", gcashQr: "",
    bankName: "", bankAccount: "", bankAccountName: "", bankQr: "",
  };
  try {
    const { rows } = await pool.query<{
      payment_method: string; provider: string; account_details: string;
      description: string | null; payment_qr_link: string | null;
    }>(
      `SELECT payment_method, provider, account_details, description, payment_qr_link
         FROM payment_methods
        WHERE is_active = true`,
    );
    const find = (needle: string) =>
      rows.find((r) =>
        `${r.payment_method ?? ""} ${r.provider ?? ""}`.toLowerCase().includes(needle),
      );
    const gcash = find("gcash");
    // Anything that isn't GCash is treated as the bank channel.
    const bank = rows.find((r) => r !== gcash);

    return {
      gcashNumber: gcash?.account_details?.trim() || "",
      gcashName: gcash?.description?.trim() || "",
      gcashQr: secureUrl(gcash?.payment_qr_link),
      bankName: bank?.provider?.trim() || "Bank transfer",
      bankAccount: bank?.account_details?.trim() || "",
      bankAccountName: bank?.description?.trim() || "",
      bankQr: secureUrl(bank?.payment_qr_link),
    };
  } catch (err) {
    // The instructions matter more than the payment box — send without it
    // rather than failing the whole email.
    console.error("[selfCheckinEmail] could not load payment channels:", err);
    return empty;
  }
}

/** One numbered step: dark circle badge in its own cell so long text wraps flush. */
function stepRow(n: number, html: string): string {
  return `
    <tr>
      <td valign="top" width="26" style="padding:0 0 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="26">
          <tr>
            <td align="center" valign="middle" width="26" height="26" bgcolor="#2b1b12" style="width:26px;height:26px;border-radius:13px;font-size:13px;font-weight:700;color:#f6ede0;line-height:26px;">${n}</td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:2px 0 12px 12px;font-size:15px;line-height:1.5;color:#3a2a1e;">${html}</td>
    </tr>`;
}

/** A label/amount line inside the dark "what to pay" panel. */
function payRow(label: string, value: string): string {
  return `
    <tr>
      <td align="left" style="padding:0 0 7px;font-size:13.5px;color:#B8A689;">${label}</td>
      <td align="right" style="padding:0 0 7px;font-size:14.5px;font-weight:600;color:#f6ede0;white-space:nowrap;">${value}</td>
    </tr>`;
}

/**
 * One payment-channel card. Returns "" when there is no account to show.
 *
 * The account number stays as selectable text and the QR is added beneath it,
 * never instead of it — most clients block remote images by default, and a
 * guest who can't load the QR must still be able to read (and copy) the number.
 * The QR sits on a white tile because the panel behind it is near-black and
 * scanners need the light quiet zone.
 *
 * NO height attribute, deliberately. What the owner uploads here is a whole
 * payment-card screenshot, not a bare QR, and the two we have are different
 * shapes (GCash 775x743, BPI 603x884 portrait). Pinning both to a square
 * squashed the portrait one by a third and warped its QR into something a
 * scanner could reject. Width-only + height:auto keeps each one's real ratio.
 */
function channelCard(label: string, account: string, holder: string, qr: string): string {
  if (!account) return "";
  const qrBlock = qr
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;">
            <tr>
              <td align="center" bgcolor="#ffffff" style="padding:6px;border-radius:10px;">
                <img src="${qr}" alt="${label} QR code — scan to pay" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
          </table>`
    : "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#3a2a20;border-radius:10px;">
      <tr>
        <td style="padding:14px 12px;">
          <div style="font-size:11px;font-weight:700;color:#B8A689;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">${label}</div>
          <div style="font-size:15px;font-weight:600;color:#f6ede0;font-family:'Courier New',monospace;">${account}</div>
          ${holder ? `<div style="font-size:12px;color:#B8A689;margin-top:2px;">${holder}</div>` : ""}
          ${qrBlock}
        </td>
      </tr>
    </table>`;
}

export function renderSelfCheckinEmailHtml(d: SelfCheckinEmailInput): string {
  const name = escapeHtml(d.guestName || "Guest");
  const balance = Number(d.balanceAmount || 0);
  // Daycation/Nightcation share one calendar date (check-in date === check-out
  // date), so this naturally lands under the 3-night floor and falls back to
  // the default deposit without needing the stay type here.
  const nights = d.checkInDate && d.checkOutDate
    ? Math.round((new Date(d.checkOutDate).getTime() - new Date(d.checkInDate).getTime()) / 86_400_000)
    : 1;
  const deposit = Number(d.depositAmount ?? securityDepositFor(nights, undefined, d));
  const balanceLabel = escapeHtml(d.balanceLabel || "50% Balance");

  const c = d.channels || {};
  const gcash = channelCard(
    "GCash",
    escapeHtml(c.gcashNumber || ""),
    escapeHtml(c.gcashName || ""),
    escapeHtml(secureUrl(c.gcashQr)),
  );
  const bank = channelCard(
    escapeHtml(c.bankName || "Bank transfer"),
    escapeHtml(c.bankAccount || ""),
    escapeHtml(c.bankAccountName || ""),
    escapeHtml(secureUrl(c.bankQr)),
  );

  // Side by side, as the design has it. The budget is tight and deliberate: the
  // panel's inner width is ~496px, so a 48% column is ~238px; the card's 12px
  // padding and the tile's 6px leave ~202px, which is what lets the QR stay at
  // its full 200px instead of being shrunk to fit. valign=top keeps both cards
  // aligned at the label even though the two QR images are different heights.
  // A single channel spans the full width rather than leaving a dead column.
  const channelBlock =
    gcash && bank
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
          <tr>
            <td width="48%" valign="top">${gcash}</td>
            <td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>
            <td width="48%" valign="top">${bank}</td>
          </tr>
        </table>`
      : gcash || bank
        ? `<div style="margin-top:14px;">${gcash || bank}</div>`
        : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>You can self check-in now - D'Lux Homes</title>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #F3EAD9; } a { color: inherit; }</style>
    </head>
    <body style="margin:0;padding:0;background:#F3EAD9;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3EAD9;">
        <tr>
          <td align="center" style="padding:24px 16px;font-family:'Inter',Arial,Helvetica,sans-serif;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(30,20,10,0.08);">
              <tr>
                <td>

                  <!-- Header -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;">
                    <tr>
                      <td style="padding:24px 30px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="middle" align="left">
                              <div style="font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:600;color:#f6ede0;letter-spacing:0.3px;">D&rsquo;Lux Homes</div>
                              <div style="font-size:12px;color:#CBB89C;margin-top:2px;">Booking ${escapeHtml(d.bookingId)}</div>
                            </td>
                            <td valign="middle" align="right" style="white-space:nowrap;">
                              <span style="display:inline-block;background:rgba(246,237,224,0.12);border:1px solid rgba(246,237,224,0.35);border-radius:999px;padding:6px 14px;white-space:nowrap;">
                                <span style="width:7px;height:7px;border-radius:50%;background:#d9a25c;display:inline-block;margin-right:6px;"></span>
                                <span style="font-size:12px;font-weight:600;color:#f6ede0;">Self Check-In</span>
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Body -->
                  <div style="padding:26px 30px 4px;">

                    <div style="font-family:'Fraunces',Georgia,serif;font-size:24px;line-height:1.25;color:#2b1b12;margin-bottom:8px;">Hi ${name}, you can self check-in now!</div>
                    <div style="font-size:14px;line-height:1.5;color:#5c4a3c;margin-bottom:20px;">You&rsquo;re welcome to come in any time from now on, ahead of your scheduled check-in.</div>

                    <!-- The four steps -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
                      ${stepRow(1, `Get your key from the <strong>mail area, mailbox ${escapeHtml(ACCESS.mailbox)}</strong>.`)}
                      ${stepRow(2, `Go to your room: <strong>${escapeHtml(ACCESS.tower)}, ${escapeHtml(ACCESS.floor)}, unit ${escapeHtml(ACCESS.unit)}</strong>.`)}
                      ${stepRow(3, `Once you are inside, pay what is left using <strong>GCash</strong> or <strong>bank transfer</strong>.`)}
                      ${stepRow(4, `Message us that you are in, and send a <strong>screenshot of your payment</strong>. Thank you!`)}
                    </table>

                    <!-- What to pay -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:14px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:20px 22px;">
                          <div style="font-size:12px;font-weight:700;color:#B8A689;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px;">What to pay at check-in</div>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${payRow(balanceLabel, peso(balance))}
                            ${payRow("Security deposit &mdash; you get this back", peso(deposit))}
                          </table>

                          <div style="height:1px;background:rgba(246,237,224,0.18);font-size:0;line-height:0;margin:14px 0 12px;">&nbsp;</div>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="left" valign="middle" style="font-size:14px;font-weight:700;color:#f6ede0;">Total to pay</td>
                              <td align="right" valign="middle" style="font-family:'Fraunces',Georgia,serif;font-size:30px;font-weight:600;color:#d9a25c;white-space:nowrap;">${peso(balance + deposit)}</td>
                            </tr>
                          </table>

                          ${channelBlock}
                        </td>
                      </tr>
                    </table>

                    <!-- Stay dates -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:14px 18px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
                            <tr>
                              <td width="49%" valign="top">
                                <div style="color:#9c8974;margin-bottom:1px;">Check-in (you may arrive up to ${CHECKIN_LEAD_MINUTES} minutes early)</div>
                                <div style="font-weight:600;color:#2b1b12;">${escapeHtml(d.checkInDate)} &middot; ${escapeHtml(d.checkInTime)}</div>
                              </td>
                              <td width="1" style="background:#e9dcc8;font-size:0;line-height:0;">&nbsp;</td>
                              <td width="49%" valign="top" style="padding-left:14px;">
                                <div style="color:#9c8974;margin-bottom:1px;">Check-out by</div>
                                <div style="font-weight:600;color:#2b1b12;">${escapeHtml(d.checkOutDate)} &middot; ${escapeHtml(d.checkOutTime)}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <div style="font-size:13px;line-height:1.55;color:#5c4a3c;text-align:center;margin-bottom:22px;">We are here 24/7 &mdash; just reply to this email or message us on Facebook if you need anything.</div>
                  </div>

                  <!-- Footer -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-top:1px solid #f0e6d8;">
                    <tr>
                      <td align="center" style="padding:14px 30px;">
                        <div style="font-size:12px;color:#5c4a3c;">homesdlux@gmail.com &middot; Tower 4, Grass Residences, QC</div>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendSelfCheckinEmail(d: SelfCheckinEmailInput): Promise<void> {
  await transporter.sendMail({
    from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
    to: d.email,
    subject: `You can self check-in now — ${d.bookingId}`,
    html: renderSelfCheckinEmailHtml(d),
  });
  console.log(`✅ Self check-in email sent to ${d.email} (${d.bookingId})`);
}
