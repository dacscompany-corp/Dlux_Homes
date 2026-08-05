import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { contactBlockHtml } from '@/backend/utils/emailContact';
import {
  RULE_SECTIONS,
  DUTY_HEADLINE,
  DUTY_SUB,
  QUIET_TIME,
  POOL_NOTE,
  houseRulesAccess,
} from '@/lib/house-rules-sheet';

// CHECK-IN module: sent when an admin marks a booking "Checked In" — it welcomes
// a guest whose arrival has already been recorded. Not to be confused with the
// PRE-ARRIVAL self check-in email (backend/utils/selfCheckinEmail.ts), which is
// scheduled before arrival and carries the key location.
//
// This is the send that carries the HOUSE RULES: it goes out from the Collect
// step, when the guest has paid and is being handed the keys in person. The
// rules list is imported rather than duplicated so the two emails that can
// carry it never drift.
export interface CheckinEmailData {
  firstName?: string;
  email?: string;
  bookingId?: string;
  roomName?: string;
  checkInDate?: string;
  checkInTime?: string;
  checkOutDate?: string;
  checkOutTime?: string;
  guests?: string;
  [key: string]: unknown;
}

/**
 * Build the checked-in email. Exported and pure so the template can be rendered
 * and inspected without sending anything — the same reason
 * renderSelfCheckinEmailHtml exists. The POST handler below is the only caller
 * in the app.
 */
/** One numbered rule section, as a cell in the 2x2 grid. */
function sectionCell(s: { n: number; title: string; bullets: string[] }): string {
  const bullets = s.bullets
    .map(
      (b) => `
        <tr>
          <td valign="top" width="10" style="padding:0 0 6px;font-size:12.5px;line-height:1.45;color:#d9a25c;font-weight:700;">&bull;</td>
          <td valign="top" style="padding:0 0 6px;font-size:12.5px;line-height:1.45;color:#3a2a1e;">${b}</td>
        </tr>`,
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td colspan="2" style="border-top:2px solid #2b1b12;font-size:0;line-height:0;padding:0;">&nbsp;</td></tr>
      <tr>
        <td colspan="2" style="padding:9px 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="18" align="center" valign="middle" bgcolor="#2b1b12" style="width:18px;height:18px;border-radius:9px;font-size:9.5px;font-weight:700;color:#f6ede0;line-height:18px;">${s.n}</td>
              <td style="padding-left:8px;font-size:11.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#2b1b12;">${s.title}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${bullets}
    </table>`;
}

export function renderCheckinEmailHtml(bookingData: CheckinEmailData): string {
  // Rules, unit and credentials all come from lib/house-rules-sheet — the same
  // source as the printed sheet and /admin/house-rules, so this email cannot
  // drift from the copy taped up in the unit.
  const access = houseRulesAccess();
  const accessRows = [
    { label: 'Wi-Fi name', value: access.wifiName },
    { label: 'Password', value: access.wifiPassword },
    { label: 'Netflix PIN', value: access.netflixPin },
  ].filter((r) => r.value);

  const accessRowsHtml = accessRows
    .map(
      (r) => `
        <tr>
          <td style="padding:0 0 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #ece2d0;border-radius:6px;">
              <tr>
                <td style="padding:6px 10px;font-size:11.5px;color:#9c8974;">${r.label}</td>
                <td align="right" style="padding:6px 10px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:0.4px;color:#2b1b12;">${r.value}</td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join('');

  // 2x2 grid of the four rule sections. Rows are laid out pairwise so both
  // columns of a row share a top edge, the way the printed sheet reads.
  const sectionRows: string[] = [];
  for (let i = 0; i < RULE_SECTIONS.length; i += 2) {
    const [a, b] = [RULE_SECTIONS[i], RULE_SECTIONS[i + 1]];
    sectionRows.push(`
      <tr>
        <td width="48%" valign="top" style="padding-bottom:14px;">${sectionCell(a)}</td>
        <td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>
        <td width="48%" valign="top" style="padding-bottom:14px;">${b ? sectionCell(b) : '&nbsp;'}</td>
      </tr>`);
  }

  // Email HTML template for CHECKED-IN status — from the same Claude
  // Design project as the other status emails. Table-based layout
  // throughout (see send-pending-email/route.ts for why: Gmail's
  // spam-quarantine view doesn't reliably honor margin:0 auto/display:flex).
  const guestName = bookingData.firstName || 'Guest';
  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome! Check-In Confirmation - D'Lux Homes</title>
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
                                  <span style="font-size:12px;font-weight:600;color:#f6ede0;">Checked In</span>
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

            <!-- Body -->
            <div style="padding:28px 32px 4px;">
              <p style="font-size:16px;font-weight:600;color:#2b1b12;margin:0 0 6px;">Welcome, ${guestName}!</p>
              <p style="font-size:15px;line-height:1.5;color:#3a2a1e;margin:0 0 20px;">
                You&rsquo;re all checked in and ready to relax at D&rsquo;Lux Homes. Need anything at all during your stay? Just reach out &mdash; we&rsquo;re happy to help.
              </p>

              <!-- Stay details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:16px;">
                <tr>
                  <td style="padding:18px 20px 12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
                      <tr>
                        <td align="left" style="color:#9c8974;">${bookingData.bookingId}</td>
                        <td align="right" style="font-weight:600;color:#2b1b12;">${bookingData.roomName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" valign="top">
                          <div style="font-size:11px;color:#9c8974;">Checked in</div>
                          <div style="font-size:14px;font-weight:600;color:#2b1b12;">${bookingData.checkInDate} &middot; ${bookingData.checkInTime}</div>
                        </td>
                        <td width="1" style="background:#e9dcc8;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="50%" valign="top" style="padding-left:14px;">
                          <div style="font-size:11px;color:#9c8974;">Check-out by</div>
                          <div style="font-size:14px;font-weight:600;color:#2b1b12;">${bookingData.checkOutDate} &middot; ${bookingData.checkOutTime}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px 18px;border-top:1px solid #e9dcc8;font-size:13px;color:#5c4a3c;">${bookingData.guests}</td>
                </tr>
              </table>

              <!-- Unit + Wi-Fi / Netflix. Mirrors the printed sheet's info
                   strip; the click-to-copy fields of the design become plain
                   text, since email cannot run script. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e9dcc8;border-radius:12px;margin-bottom:16px;">
                <tr>
                  <td width="42%" valign="top" style="padding:14px 16px;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9c8974;margin-bottom:5px;">Your unit</div>
                    <div style="font-size:12.5px;line-height:1.4;color:#5c4a3c;">${access.building}</div>
                    <div style="font-size:14px;font-weight:700;color:#2b1b12;margin-top:2px;">${access.unitLine}</div>
                  </td>
                  <td width="58%" valign="top" bgcolor="#faf5ec" style="padding:14px 16px;border-left:1px solid #e9dcc8;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9c8974;margin-bottom:6px;">Wi-Fi &amp; Netflix</div>
                    ${accessRowsHtml
                      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${accessRowsHtml}</table>`
                      : `<div style="font-size:12px;color:#b3a48f;">Ask us anytime and we&rsquo;ll send these over.</div>`}
                  </td>
                </tr>
              </table>

              <!-- Duty callout — gold rule on the left, as on the sheet. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf7ea;border:1px solid #e9dcc8;border-left:4px solid #d9a25c;border-radius:10px;margin-bottom:18px;">
                <tr>
                  <td style="padding:13px 16px;">
                    <div style="font-size:13.5px;font-weight:700;line-height:1.3;color:#2b1b12;">${DUTY_HEADLINE}</div>
                    <div style="font-size:12.5px;line-height:1.45;color:#5c4a3c;margin-top:3px;">${DUTY_SUB}</div>
                  </td>
                </tr>
              </table>

              <!-- The four numbered rule sections, 2 x 2. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
                ${sectionRows.join('')}
              </table>

              <!-- Quiet time + pool note. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td width="40%" valign="top" bgcolor="#2b1b12" style="padding:13px 15px;border-radius:10px;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#B8A689;margin-bottom:4px;">Quiet time</div>
                    <div style="font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:500;line-height:1.15;color:#f6ede0;">${QUIET_TIME}</div>
                  </td>
                  <td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="56%" valign="top" bgcolor="#faf5ec" style="padding:13px 15px;border:1px solid #e9dcc8;border-radius:10px;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#8c5a2e;margin-bottom:4px;">Note on the pool</div>
                    <div style="font-size:12.5px;line-height:1.4;color:#3a2a1e;">${POOL_NOTE}</div>
                  </td>
                </tr>
              </table>

              <!-- Contact us — email + Facebook, as tappable buttons. -->
              ${contactBlockHtml("dark", `Booking ${bookingData.bookingId}`)}

              <!-- CTA — the sheet's sign-off. -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="font-family:'Fraunces',Georgia,serif;font-size:17px;color:#2b1b12;margin-bottom:8px;">Thank you &amp; God bless!</div>
                <div style="font-size:13px;color:#5c4a3c;">We hope this is a stay to remember at D&rsquo;Lux Homes.</div>
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

export async function POST(request: NextRequest) {
  try {
    const bookingData: CheckinEmailData = await request.json();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: bookingData.email,
      subject: `Welcome! You're Checked In - ${bookingData.bookingId}`,
      html: renderCheckinEmailHtml(bookingData),
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: 'Check-in email sent successfully',
    });
  } catch (error) {
    console.error('Check-in email error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send check-in email',
      },
      { status: 500 }
    );
  }
}
