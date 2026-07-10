// Pre-arrival "self check-in" email — the key location, unit details, and the
// house rules. Sent automatically BEFORE the guest arrives:
//   Daycation (morning check-in)      → 12:00 AM on the day of check-in
//   Nightcation / Overnight (evening) → 2 hours before check-in
// Scheduler: src/app/api/cron/send-self-checkin-emails/route.ts
//
// Distinct from the CHECK-IN module (src/app/api/send-checkin-email), which is
// sent AFTER an admin marks a booking "Checked In" to confirm the arrival. This
// one tells the guest how to let themselves in; that one welcomes them once
// they already have.
//
// Same table-based layout as the other status emails (Gmail's spam-quarantine
// view doesn't reliably honor margin:0 auto / display:flex).

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Unit access details. The Wi-Fi password and Netflix PIN are secrets — they
// come from env only and their rows are simply omitted when unset, so nothing
// sensitive is ever committed to the repo. The non-secret address bits keep
// sensible defaults so the email still reads correctly out of the box.
const ACCESS = {
  building: process.env.DLUX_BUILDING || "Fern at Grass Residences (Tower 4)",
  floor: process.env.DLUX_FLOOR || "12th floor",
  unit: process.env.DLUX_UNIT_NUMBER || "1240",
  mailbox: process.env.DLUX_MAILBOX || "1240",
  wifiName: process.env.DLUX_WIFI_NAME || "",
  wifiPassword: process.env.DLUX_WIFI_PASSWORD || "",
  netflixPin: process.env.DLUX_NETFLIX_PIN || "",
};

export interface SelfCheckinEmailInput {
  email: string;
  guestName: string;
  bookingId: string;
  roomName: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  guests: string;
}

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// House rules, transcribed from the owner's printed sheet in the unit. The
// "maintain the unit's cleanliness and order" line is the section's lead-in
// rather than a bullet, and quiet time / the pool notice get their own callout.
const HOUSE_RULES = [
  "Throw your own garbage.",
  "In the living area and bedroom, no food or drink is permitted.",
  "Instead of throwing used tissue paper down the toilet, please use the provided toilet trash can.",
  "Please make use of the bidets. Do not throw food in the toilet, as it may lead to blockage.",
  "When cooking, use the range hood ventilation fan to circulate air and prevent odors from spreading. If you are not using the appliances, please turn it off.",
  "Smoking is not permitted within the unit. There is a designated smoking area next to the guard house at Gates 2 and 3.",
  "We only deliver fresh linens, bedsheet, towel and rugs.",
  "We only clean upon your check-out.",
];

function detailRow(label: string, value: string, mono = false): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#9c8974;width:42%;">${label}</td>
      <td style="padding:6px 0;font-size:14px;font-weight:600;color:#2b1b12;${mono ? "font-family:'Courier New',monospace;letter-spacing:0.5px;" : ""}">${value}</td>
    </tr>`;
}

export function renderSelfCheckinEmailHtml(d: SelfCheckinEmailInput): string {
  const name = escapeHtml(d.guestName || "Guest");
  // Gold bullet on its own cell, so long rules wrap flush instead of hanging
  // under the marker (Gmail ignores list-style/padding tricks).
  const rules = HOUSE_RULES.map(
    (r) => `
      <tr>
        <td valign="top" width="14" style="padding:0 0 8px;font-size:13px;line-height:1.55;color:#d9a25c;font-weight:700;">&bull;</td>
        <td valign="top" style="padding:0 0 8px;font-size:13px;line-height:1.55;color:#4a3a2e;">${r}</td>
      </tr>`,
  ).join("");

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
                                <span style="font-size:12px;font-weight:600;color:#f6ede0;">Self Check-In</span>
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Body -->
                  <div style="padding:28px 32px 4px;">

                    <!-- The self check-in message comes first. -->
                    <p style="font-size:16px;font-weight:600;color:#2b1b12;margin:0 0 6px;">Hi ${name}, you can self check-in now!</p>
                    <p style="font-size:15px;line-height:1.55;color:#3a2a1e;margin:0 0 20px;">
                      Yung susi po ay nasa mail area, <strong>mailbox ${escapeHtml(ACCESS.mailbox)}</strong>.<br>
                      Ang unit po ay sa <strong>Tower 4, ${escapeHtml(ACCESS.floor)}, unit ${escapeHtml(ACCESS.unit)}</strong>.
                    </p>

                    <!-- Access details -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px;">Your Unit</div>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${detailRow("Building", escapeHtml(ACCESS.building))}
                            ${detailRow("Unit", `${escapeHtml(ACCESS.floor)}, unit ${escapeHtml(ACCESS.unit)}`)}
                            ${detailRow("Key", `Mail area &middot; mailbox ${escapeHtml(ACCESS.mailbox)}`)}
                            ${detailRow("Wi-Fi name", escapeHtml(ACCESS.wifiName), true)}
                            ${detailRow("Wi-Fi password", escapeHtml(ACCESS.wifiPassword), true)}
                            ${detailRow("Netflix PIN", escapeHtml(ACCESS.netflixPin), true)}
                          </table>
                        </td>
                      </tr>
                    </table>

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
                        <td style="padding:0 20px 12px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="50%" valign="top">
                                <div style="font-size:11px;color:#9c8974;">Check-in</div>
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
                      <tr>
                        <td style="padding:12px 20px 18px;border-top:1px solid #e9dcc8;font-size:13px;color:#5c4a3c;">${escapeHtml(d.guests)}</td>
                      </tr>
                    </table>

                    <!-- House rules — highlighted: cream fill + gold accent bar,
                         so the rules read as the emphasised part of the email. -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf7ea;border:1px solid #e9dcc8;border-left:4px solid #d9a25c;border-radius:12px;margin-bottom:20px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <div style="font-size:12px;font-weight:700;color:#8c5a2e;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">House Rules &amp; Info</div>
                          <p style="font-size:13px;line-height:1.55;color:#3a2a1e;margin:0 0 14px;font-weight:600;">
                            It is your duty to maintain the unit&rsquo;s cleanliness and order. Please read and follow all the house rules placed inside the unit.
                          </p>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${rules}
                          </table>

                          <!-- The two rules the owner emphasised on the printed sheet. -->
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e9dcc8;border-radius:10px;margin-top:14px;">
                            <tr>
                              <td style="padding:12px 14px;">
                                <div style="font-size:13px;font-weight:700;color:#2b1b12;margin-bottom:5px;">&#128564;&nbsp; Quiet time is between 10:00 PM and 7:00 AM.</div>
                                <div style="font-size:12.5px;line-height:1.5;color:#5c4a3c;">The Olympic-sized pool in Tower 1 is private to owners only, so guests are not permitted to use it.</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Need help -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:12px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <div style="font-size:13px;font-weight:600;color:#f6ede0;margin-bottom:4px;">Need a Hand?</div>
                          <div style="font-size:13px;line-height:1.5;color:#CBB89C;">We&rsquo;re here 24/7 &mdash; just reply to this email or message us on our Facebook page if anything comes up.</div>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <div style="text-align:center;margin-bottom:24px;">
                      <div style="font-family:'Fraunces',Georgia,serif;font-size:17px;color:#2b1b12;margin-bottom:8px;">Mabuhay! Welcome to D&rsquo;Lux Homes.</div>
                      <div style="font-size:13px;color:#5c4a3c;">Thank you &amp; God bless!</div>
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

export async function sendSelfCheckinEmail(d: SelfCheckinEmailInput): Promise<void> {
  await transporter.sendMail({
    from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
    to: d.email,
    subject: `You can self check-in now — ${d.bookingId}`,
    html: renderSelfCheckinEmailHtml(d),
  });
  console.log(`✅ Self check-in email sent to ${d.email} (${d.bookingId})`);
}
