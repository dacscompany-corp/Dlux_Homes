// Check-out reminder email — sent 2 hours before the guest's check-out time,
// carrying the check-out instructions and the security-deposit refund request.
// Scheduler: src/app/api/cron/send-checkout-reminders/route.ts
//
// Distinct from the CHECK-OUT module (src/app/api/send-checkout-email), which
// fires after an admin marks a booking "Checked Out". This one goes out while
// the guest is still in the unit and tells them what to do before they leave.
//
// Same table-based layout as the other status emails (Gmail's spam-quarantine
// view doesn't reliably honor margin:0 auto / display:flex).

import nodemailer from "nodemailer";
import { securityDepositFor } from "@/lib/pricing";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Where the key goes back. Same value the self check-in email tells them to
// collect it from, so the two emails can never disagree.
const MAILBOX = process.env.DLUX_MAILBOX || "1240";

export interface CheckoutReminderEmailInput {
  email: string;
  guestName: string;
  bookingId: string;
  roomName: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  /** True when check-out falls on the same Manila day the email is sent. */
  isToday: boolean;
  /** Manila hour (0–23) at send time, used to pick the greeting. */
  hour: number;
  /** Haven's owner-configured deposit tiers, for securityDepositFor(). */
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

// The owner's message opens with "Good afternoon" because check-out is 4 PM.
// Derive it instead, so an early Nightcation check-out doesn't say "afternoon"
// at 3 in the morning.
function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const INSTRUCTIONS = [
  "Kindly throw your own garbage at the garbage room located at the corner area of the elevator.",
  "Please wash your dishes.",
  "Please put the USED towels in the laundry basket inside the comfort room.",
  "Please turn off appliances (TV &amp; aircon), water and lights upon check-out.",
  "Please make sure the doors are locked.",
  `Please leave the room key in the <strong>mailbox #${MAILBOX}</strong> located at the mail area on the ground floor. Send a proof video or picture.`,
];

export function renderCheckoutReminderEmailHtml(d: CheckoutReminderEmailInput): string {
  const name = escapeHtml(d.guestName || "Guest");
  const when = d.isToday ? "today" : "tomorrow";
  // Daycation/Nightcation share one calendar date (check-in date === check-out
  // date), so this naturally lands under the 3-night floor and falls back to
  // the default deposit without needing the stay type here.
  const nights = d.checkInDate && d.checkOutDate
    ? Math.round((new Date(d.checkOutDate).getTime() - new Date(d.checkInDate).getTime()) / 86_400_000)
    : 1;
  const securityDeposit = securityDepositFor(nights, undefined, d);

  const steps = INSTRUCTIONS.map(
    (t, i) => `
      <tr>
        <td valign="top" width="26" style="padding:0 0 9px;">
          <span style="display:inline-block;width:19px;height:19px;line-height:19px;border-radius:50%;background:#d9a25c;color:#2b1b12;font-size:11px;font-weight:700;text-align:center;">${i + 1}</span>
        </td>
        <td valign="top" style="padding:0 0 9px;font-size:13px;line-height:1.55;color:#4a3a2e;">${t}</td>
      </tr>`,
  ).join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Check-out reminder - D'Lux Homes</title>
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
                      <td style="padding:28px 32px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="middle" align="left">
                              <div style="font-family:'Fraunces',Georgia,serif;font-size:21px;font-weight:600;color:#f6ede0;letter-spacing:0.3px;">D&rsquo;Lux Homes</div>
                              <div style="font-size:12px;color:#CBB89C;margin-top:2px;">Your Perfect Getaway Awaits</div>
                            </td>
                            <td valign="middle" align="right" style="white-space:nowrap;">
                              <span style="display:inline-block;background:rgba(246,237,224,0.12);border:1px solid rgba(246,237,224,0.35);border-radius:999px;padding:6px 14px;white-space:nowrap;">
                                <span style="width:7px;height:7px;border-radius:50%;background:#d9a25c;display:inline-block;margin-right:6px;"></span>
                                <span style="font-size:12px;font-weight:600;color:#f6ede0;">Check-Out Reminder</span>
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Body -->
                  <div style="padding:28px 32px 4px;">

                    <p style="font-size:16px;font-weight:600;color:#2b1b12;margin:0 0 6px;">${greeting(d.hour)}, ${name}.</p>
                    <p style="font-size:15px;line-height:1.55;color:#3a2a1e;margin:0 0 20px;">
                      This is a reminder that your check-out is at <strong>${escapeHtml(d.checkOutTime)} ${when}</strong>.
                    </p>

                    <!-- Stay details -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:18px 20px 12px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
                            <tr>
                              <td align="left" style="color:#9c8974;">${escapeHtml(d.bookingId)}</td>
                              <td align="right" style="font-weight:600;color:#2b1b12;">${escapeHtml(d.roomName)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 20px 18px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="50%" valign="top">
                                <div style="font-size:11px;color:#9c8974;">Checked in</div>
                                <div style="font-size:14px;font-weight:600;color:#2b1b12;">${escapeHtml(d.checkInDate)} &middot; ${escapeHtml(d.checkInTime)}</div>
                              </td>
                              <td width="1" style="background:#e9dcc8;font-size:0;line-height:0;">&nbsp;</td>
                              <td width="50%" valign="top" style="padding-left:14px;">
                                <div style="font-size:11px;color:#9c8974;">Check-out by</div>
                                <div style="font-size:14px;font-weight:600;color:#2b1b12;">${escapeHtml(d.checkOutDate)} &middot; ${escapeHtml(d.checkOutTime)}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Check-out instructions — highlighted, same treatment as
                         the house rules in the self check-in email. -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf7ea;border:1px solid #e9dcc8;border-left:4px solid #d9a25c;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <div style="font-size:12px;font-weight:700;color:#8c5a2e;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px;">Check-Out Instructions</div>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${steps}
                          </table>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e9dcc8;border-radius:10px;margin-top:14px;">
                            <tr>
                              <td style="padding:12px 14px;font-size:12.5px;line-height:1.55;color:#5c4a3c;">
                                Please leave the unit clean and in order. If the unit is left unclean and the above instructions are not met, <strong style="color:#2b1b12;">corresponding fees will be charged</strong>.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Security deposit refund -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <div style="font-size:13px;font-weight:600;color:#f6ede0;margin-bottom:5px;">Your &#8369;${securityDeposit.toLocaleString()} security deposit</div>
                          <div style="font-size:13px;line-height:1.55;color:#CBB89C;">
                            May we send it back to you through <strong style="color:#f6ede0;">GCash</strong>? Just reply to this email with your GCash details. We&rsquo;ll send it right after we check the room.
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Need help -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <div style="font-size:13px;font-weight:600;color:#2b1b12;margin-bottom:4px;">Need a Hand?</div>
                          <div style="font-size:13px;line-height:1.5;color:#5c4a3c;">We&rsquo;re here 24/7 &mdash; just reply to this email or message us on our Facebook page if anything comes up.</div>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <div style="text-align:center;margin-bottom:24px;">
                      <div style="font-family:'Fraunces',Georgia,serif;font-size:17px;color:#2b1b12;margin-bottom:8px;">Thank you po for staying with D&rsquo;Lux Homes! &#128522;</div>
                      <div style="font-size:13px;color:#5c4a3c;">We hope to welcome you back soon.</div>
                    </div>
                  </div>

                  <!-- Footer -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-top:1px solid #f0e6d8;">
                    <tr>
                      <td align="center" style="padding:16px 32px;">
                        <div style="font-size:12px;color:#5c4a3c;">homesdlux@gmail.com &middot; Tower 4, Grass Residences, QC</div>
                        <div style="font-size:11px;color:#b3a48f;margin-top:6px;">&copy; ${new Date().getFullYear()} D&rsquo;Lux Homes. All rights reserved.</div>
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

export async function sendCheckoutReminderEmail(d: CheckoutReminderEmailInput): Promise<void> {
  await transporter.sendMail({
    from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
    to: d.email,
    subject: `Check-out reminder — ${d.checkOutTime} ${d.isToday ? "today" : "tomorrow"} · ${d.bookingId}`,
    html: renderCheckoutReminderEmailHtml(d),
  });
  console.log(`✅ Check-out reminder sent to ${d.email} (${d.bookingId})`);
}
