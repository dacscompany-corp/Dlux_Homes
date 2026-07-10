import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { contactBlockHtml } from '@/backend/utils/emailContact';

// CHECK-IN module: sent when an admin marks a booking "Checked In" — it welcomes
// a guest whose arrival has already been recorded. Not to be confused with the
// PRE-ARRIVAL self check-in email (backend/utils/selfCheckinEmail.ts), which is
// scheduled before arrival and carries the key location + house rules.
export async function POST(request: NextRequest) {
  try {
    const bookingData = await request.json();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Email HTML template for CHECKED-IN status — from the same Claude
    // Design project as the other status emails. Table-based layout
    // throughout (see send-pending-email/route.ts for why: Gmail's
    // spam-quarantine view doesn't reliably honor margin:0 auto/display:flex).
    const guestName = bookingData.firstName || 'Guest';
    const emailHtml = `
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

              <!-- A few things to know -->
              <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px;">A Few Things to Know</div>
              <div style="margin-bottom:16px;">
                <div style="font-size:13px;line-height:1.5;color:#5c4a3c;margin-bottom:6px;">&bull; Check-out is at ${bookingData.checkOutTime} &mdash; let us know if you need a bit more time.</div>
                <div style="font-size:13px;line-height:1.5;color:#5c4a3c;margin-bottom:6px;">&bull; Please take care of the property and its amenities.</div>
                <div style="font-size:13px;line-height:1.5;color:#5c4a3c;">&bull; Any concerns? Just contact us right away &mdash; we&rsquo;ll sort it out.</div>
              </div>

              <!-- Contact us — email + Facebook, as tappable buttons. -->
              ${contactBlockHtml("dark", `Booking ${bookingData.bookingId}`)}

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="font-family:'Fraunces',Georgia,serif;font-size:17px;color:#2b1b12;margin-bottom:8px;">Enjoy Your Stay!</div>
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

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: bookingData.email,
      subject: `Welcome! You're Checked In - ${bookingData.bookingId}`,
      html: emailHtml,
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
