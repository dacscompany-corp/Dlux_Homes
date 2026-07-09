import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const bookingData = await request.json();

    // Create transporter with your Gmail credentials
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // your-email@gmail.com
        pass: process.env.EMAIL_PASSWORD, // your Gmail App Password
      },
    });

    // Email HTML template for CONFIRMED status — from the "DLux Homes Booking
    // Confirmed" Claude Design project (same visual language as the pending
    // email). Colors are the design's own tokens (oklch() converted to hex
    // for email-client safety). Layout is table-based throughout — Gmail's
    // spam-quarantine view doesn't reliably honor margin:0 auto/display:flex
    // (see send-pending-email/route.ts for the same fix).
    const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const guestName = `${bookingData.firstName} ${bookingData.lastName || ''}`.trim();
    const paymentMethodLabel = bookingData.paymentMethod === 'gcash' ? 'GCash' : bookingData.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : bookingData.paymentMethod;
    const totalAmountFormatted = `₱${Number(bookingData.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmation - D'Lux Homes</title>
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
                                  <span style="font-size:12px;font-weight:600;color:#f6ede0;">Booking Confirmed</span>
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

            <!-- Body -->
            <div style="padding:28px 32px 4px;">
              <p style="font-size:15px;line-height:1.5;color:#3a2a1e;margin:0 0 20px;">
                Hi ${guestName}, good news &mdash; your stay is confirmed! Here&rsquo;s a copy of your booking for your records.
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
                          <div style="font-size:11px;color:#9c8974;">Check-in</div>
                          <div style="font-size:14px;font-weight:600;color:#2b1b12;">${bookingData.checkInDate} &middot; ${bookingData.checkInTime}</div>
                        </td>
                        <td width="1" style="background:#e9dcc8;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="50%" valign="top" style="padding-left:14px;">
                          <div style="font-size:11px;color:#9c8974;">Check-out</div>
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

              <!-- Payment -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" align="left">
                          <div style="font-size:12px;color:#B8A689;">Paid via ${paymentMethodLabel}</div>
                          <div style="font-size:13px;color:#f6ede0;margin-top:2px;">Total paid</div>
                        </td>
                        <td valign="middle" align="right" style="white-space:nowrap;font-size:22px;font-weight:700;color:#d9a25c;">${totalAmountFormatted}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What to expect -->
              <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px;">What to Expect</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td width="20" valign="top" style="padding-bottom:8px;">
                    <div style="width:20px;height:20px;border-radius:50%;background:#faf5ec;color:#2b1b12;font-size:11px;font-weight:700;text-align:center;line-height:20px;">1</div>
                  </td>
                  <td valign="top" style="padding-left:10px;padding-bottom:8px;font-size:13px;line-height:1.45;color:#5c4a3c;">We&rsquo;ll send you check-in instructions a day before your stay.</td>
                </tr>
                <tr>
                  <td width="20" valign="top" style="padding-bottom:8px;">
                    <div style="width:20px;height:20px;border-radius:50%;background:#faf5ec;color:#2b1b12;font-size:11px;font-weight:700;text-align:center;line-height:20px;">2</div>
                  </td>
                  <td valign="top" style="padding-left:10px;padding-bottom:8px;font-size:13px;line-height:1.45;color:#5c4a3c;">Just show up at check-in time with a valid ID.</td>
                </tr>
              </table>

              <!-- Good to know -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px;">Good to Know</div>
                    <div style="font-size:13px;line-height:1.5;color:#5c4a3c;margin-bottom:6px;">&bull; Please bring a valid government-issued ID during check-in.</div>
                    <div style="font-size:13px;line-height:1.5;color:#5c4a3c;margin-bottom:6px;">&bull; Early check-in is subject to room availability.</div>
                    <div style="font-size:13px;line-height:1.5;color:#5c4a3c;">&bull; Need to change your dates? Contact us at least 48 hours ahead.</div>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${siteUrl}" style="display:inline-block;background:#2b1b12;color:#f6ede0;font-size:14px;font-weight:600;padding:13px 34px;border-radius:10px;text-decoration:none;">Visit Our Website</a>
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
      subject: `Booking Confirmation - ${bookingData.bookingId}`,
      html: emailHtml,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
