import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { generateReceiptPDF } from '@/backend/utils/pdfGenerators';

export async function POST(request: NextRequest) {
  try {
    const bookingData = await request.json();

    // Email clients strip <script> tags and onclick handlers, so a
    // click-to-generate PDF button (the prior design) never actually works
    // once the email is delivered — it only appeared to work when the raw
    // HTML was opened directly in a browser. Generate the receipt PDF
    // server-side instead and attach it directly to the email.
    const receiptBuffer = await generateReceiptPDF({
      bookingId: bookingData.bookingId,
      firstName: bookingData.firstName,
      lastName: bookingData.lastName,
      email: bookingData.email,
      phone: bookingData.phone,
      roomName: bookingData.roomName,
      stayType: bookingData.stayType,
      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      checkInTime: bookingData.checkInTime,
      checkOutTime: bookingData.checkOutTime,
      guests: bookingData.guests,
      adults: bookingData.adults,
      children: bookingData.children,
      infants: bookingData.infants,
      numberOfNights: bookingData.numberOfNights,
      roomRate: bookingData.roomRate,
      securityDeposit: bookingData.securityDeposit,
      addOnsTotal: bookingData.addOnsTotal,
      totalAmount: bookingData.totalAmount,
      downPayment: bookingData.downPayment,
      remainingBalance: bookingData.remainingBalance,
      paymentMethod: bookingData.paymentMethod,
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Email HTML template for CHECKED-OUT status — from the same Claude
    // Design project as the other status emails. Table-based layout
    // throughout (see send-pending-email/route.ts for why: Gmail's
    // spam-quarantine view doesn't reliably honor margin:0 auto/display:flex).
    const guestName = bookingData.firstName || 'Guest';
    const hasBalance = Number(bookingData.remainingBalance) > 0;
    const totalAmountFormatted = `₱${Number(bookingData.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const remainingBalanceFormatted = hasBalance
      ? `₱${Number(bookingData.remainingBalance).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';
    // Deep link to the review card on the guest's own confirmation page.
    // It's login-gated (requireBookingAccess) — a signed-out guest is bounced
    // to /login?callbackUrl=… and lands back here after signing in.
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const reviewUrl = `${baseUrl}/my-bookings/confirmed?id=${encodeURIComponent(bookingData.bookingId)}&review=1`;
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You For Your Stay! - D'Lux Homes</title>
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
                                <div style="font-size:12px;color:#CBB89C;margin-top:2px;">Thank You For Staying With Us</div>
                              </td>
                              <td valign="middle" align="right" style="white-space:nowrap;">
                                <span style="display:inline-block;background:rgba(246,237,224,0.12);border:1px solid rgba(246,237,224,0.35);border-radius:999px;padding:6px 14px;white-space:nowrap;">
                                  <span style="width:7px;height:7px;border-radius:50%;background:#d9a25c;display:inline-block;margin-right:6px;"></span>
                                  <span style="font-size:12px;font-weight:600;color:#f6ede0;">Checked Out</span>
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

            <!-- Body -->
            <div style="padding:28px 32px 4px;">
              <p style="font-size:16px;font-weight:600;color:#2b1b12;margin:0 0 6px;">Thank you, ${guestName}!</p>
              <p style="font-size:15px;line-height:1.5;color:#3a2a1e;margin:0 0 20px;">
                You&rsquo;re all checked out. We hope you had a great stay at D&rsquo;Lux Homes and would love to have you back again.
              </p>

              <!-- Stay summary -->
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
                  <td style="padding:0 20px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" valign="top">
                          <div style="font-size:11px;color:#9c8974;">Checked in</div>
                          <div style="font-size:14px;font-weight:600;color:#2b1b12;">${bookingData.checkInDate}</div>
                        </td>
                        <td width="1" style="background:#e9dcc8;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="50%" valign="top" style="padding-left:14px;">
                          <div style="font-size:11px;color:#9c8974;">Checked out</div>
                          <div style="font-size:14px;font-weight:600;color:#2b1b12;">${bookingData.checkOutDate}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Total -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" align="left" style="font-size:13px;color:#f6ede0;">${hasBalance ? 'Remaining balance' : 'Total paid'}</td>
                        <td valign="middle" align="right" style="white-space:nowrap;font-size:22px;font-weight:700;color:#d9a25c;">${hasBalance ? remainingBalanceFormatted : totalAmountFormatted}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Review invite -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ec;border:1px solid #f0e6d8;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:22px 20px;">
                    <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">How was your stay?</div>
                    <div style="font-size:13px;line-height:1.5;color:#5c4a3c;margin-bottom:16px;">Your review helps the next guest book with confidence. It takes less than a minute.</div>
                    <a href="${reviewUrl}" style="display:inline-block;background:#2b1b12;color:#f6ede0;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:999px;">Leave a review</a>
                    <div style="font-size:11px;line-height:1.5;color:#b3a48f;margin-top:12px;">You&rsquo;ll be asked to sign in with the account you booked with.</div>
                  </td>
                </tr>
              </table>

              <!-- Receipt -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="font-size:12px;font-weight:700;color:#9c8974;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">Your Receipt</div>
                <div style="font-size:13px;line-height:1.5;color:#5c4a3c;">We&rsquo;ve attached your receipt as a PDF to this email.</div>
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
      subject: `Thank You For Your Stay! - ${bookingData.bookingId}`,
      html: emailHtml,
      attachments: [
        {
          filename: `DLux-Receipt-${bookingData.bookingId}.pdf`,
          content: receiptBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: 'Check-out email sent successfully',
    });
  } catch (error) {
    console.error('Check-out email error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send check-out email',
      },
      { status: 500 }
    );
  }
}
