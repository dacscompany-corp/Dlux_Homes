import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { contactBlockHtml } from '@/backend/utils/emailContact';
import { securityDepositFor } from '@/lib/pricing';

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
    // Money. The guest has paid the DOWN PAYMENT, not the total — labelling the
    // booking total as "Total paid" (as this template used to) tells them they
    // owe nothing. Show the full breakdown instead: what they paid, what's left,
    // and the refundable deposit that is ALSO collected at check-in, so the
    // "due at check-in" figure is the real amount they need to bring.
    const peso = (n: number) =>
      `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Deposit scales with nights booked (securityDepositFor()) — needs the
    // raw ISO dates (checkInDateRaw/checkOutDateRaw), not the locale-formatted
    // checkInDate/checkOutDate strings used for display below, which can't be
    // safely re-parsed.
    const nights = bookingData.checkInDateRaw && bookingData.checkOutDateRaw
      ? Math.round((new Date(bookingData.checkOutDateRaw).getTime() - new Date(bookingData.checkInDateRaw).getTime()) / 86_400_000)
      : 1;
    const SECURITY_DEPOSIT = securityDepositFor(nights, undefined, {
      securityDeposit: bookingData.securityDeposit != null ? Number(bookingData.securityDeposit) : undefined,
      depositTier1Amount: bookingData.depositTier1Amount != null ? Number(bookingData.depositTier1Amount) : undefined,
      depositTier2Amount: bookingData.depositTier2Amount != null ? Number(bookingData.depositTier2Amount) : undefined,
      depositTier3Amount: bookingData.depositTier3Amount != null ? Number(bookingData.depositTier3Amount) : undefined,
      depositTier4Amount: bookingData.depositTier4Amount != null ? Number(bookingData.depositTier4Amount) : undefined,
    });

    const totalAmount = Number(bookingData.totalAmount) || 0;
    // Fall back to the 50% house rule if the caller didn't pass a down payment.
    const downPayment = Number(bookingData.downPayment ?? 0) || Math.round(totalAmount * 0.5);
    const remainingBalance = Math.max(0, totalAmount - downPayment);
    const dueAtCheckIn = remainingBalance + SECURITY_DEPOSIT;

    const totalAmountFormatted = peso(totalAmount);
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

              <!-- Payment breakdown -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2b1b12;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:18px 20px;">

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:3px 0;font-size:13px;color:#B8A689;">Booking total</td>
                        <td align="right" style="padding:3px 0;font-size:13px;font-weight:600;color:#f6ede0;white-space:nowrap;">${totalAmountFormatted}</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;font-size:13px;color:#B8A689;">Down payment &mdash; paid via ${paymentMethodLabel}</td>
                        <td align="right" style="padding:3px 0;font-size:13px;font-weight:600;color:#7dd39b;white-space:nowrap;">&minus; ${peso(downPayment)}</td>
                      </tr>
                    </table>

                    <div style="height:1px;background:rgba(246,237,224,0.15);margin:12px 0;"></div>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" align="left">
                          <div style="font-size:13px;color:#f6ede0;font-weight:600;">Remaining balance</div>
                          <div style="font-size:11.5px;color:#B8A689;margin-top:2px;">Due at check-in</div>
                        </td>
                        <td valign="middle" align="right" style="white-space:nowrap;font-size:22px;font-weight:700;color:#d9a25c;">${peso(remainingBalance)}</td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(246,237,224,0.07);border-radius:9px;margin-top:14px;">
                      <tr>
                        <td style="padding:12px 14px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding:2px 0;font-size:12.5px;color:#B8A689;">Remaining balance</td>
                              <td align="right" style="padding:2px 0;font-size:12.5px;color:#f6ede0;white-space:nowrap;">${peso(remainingBalance)}</td>
                            </tr>
                            <tr>
                              <td style="padding:2px 0;font-size:12.5px;color:#B8A689;">Security deposit &mdash; refundable</td>
                              <td align="right" style="padding:2px 0;font-size:12.5px;color:#f6ede0;white-space:nowrap;">${peso(SECURITY_DEPOSIT)}</td>
                            </tr>
                            <tr>
                              <td style="padding:7px 0 0;font-size:12.5px;font-weight:700;color:#f6ede0;border-top:1px solid rgba(246,237,224,0.15);">Total to bring at check-in</td>
                              <td align="right" style="padding:7px 0 0;font-size:14px;font-weight:700;color:#d9a25c;white-space:nowrap;border-top:1px solid rgba(246,237,224,0.15);">${peso(dueAtCheckIn)}</td>
                            </tr>
                          </table>
                          <div style="font-size:11.5px;line-height:1.5;color:#B8A689;margin-top:9px;">The ${peso(SECURITY_DEPOSIT)} deposit is returned to you on the day of check-out.</div>
                        </td>
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
                    <div style="font-size:13px;line-height:1.5;color:#5c4a3c;">&bull; No cancellation policy, but we allow one-time change of date reservation 7 days before the scheduled date. You can choose a date within a month from your original scheduled date.</div>
                  </td>
                </tr>
              </table>

              <!-- Contact us — email + Facebook, as tappable buttons. Light
                   theme: the payment breakdown above is already a dark panel. -->
              ${contactBlockHtml("light", `Booking ${bookingData.bookingId}`)}

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

    // Plain-text alternative. An HTML-only body is one of the strongest
    // "bulk mail" signals there is — filters expect a real multipart/alternative
    // message, and clients that can't render HTML otherwise show an empty mail.
    // Keep this in step with the HTML above: it must say the same things.
    const emailText = [
      `D'LUX HOMES — BOOKING CONFIRMED`,
      ``,
      `Hi ${guestName}, good news — your stay is confirmed.`,
      `Here's a copy of your booking for your records.`,
      ``,
      `Booking ${bookingData.bookingId}`,
      `${bookingData.roomName}`,
      ``,
      `Check-in    ${bookingData.checkInDate} · ${bookingData.checkInTime}`,
      `Check-out   ${bookingData.checkOutDate} · ${bookingData.checkOutTime}`,
      `Guests      ${bookingData.guests}`,
      ``,
      `PAYMENT`,
      `Total                          ${peso(totalAmount)}`,
      `Down payment paid (${paymentMethodLabel})   ${peso(downPayment)}`,
      `Remaining balance              ${peso(remainingBalance)}`,
      `Security deposit (refundable)  ${peso(SECURITY_DEPOSIT)}`,
      `Total to bring at check-in     ${peso(dueAtCheckIn)}`,
      ``,
      `The ${peso(SECURITY_DEPOSIT)} deposit is returned to you on the day of check-out.`,
      ``,
      `WHAT TO EXPECT`,
      `1. We'll send you check-in instructions a day before your stay.`,
      `2. Just show up at check-in time with a valid ID.`,
      ``,
      `GOOD TO KNOW`,
      `- Please bring a valid government-issued ID during check-in.`,
      `- Early check-in is subject to room availability.`,
      `- No cancellation policy, but we allow one-time change of date reservation`,
      `  7 days before the scheduled date. You can choose a date within a month`,
      `  from your original scheduled date.`,
      ``,
      `Questions? Just reply to this email.`,
      `D'Lux Homes · Tower 4, Grass Residences, QC · homesdlux@gmail.com`,
    ].join("\n");

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: bookingData.email,
      // A reply path that reaches a human reads as legitimate to both filters
      // and guests; without it, replies vanish into the sending mailbox.
      replyTo: process.env.DLUX_CONTACT_EMAIL || process.env.EMAIL_USER,
      subject: `Booking Confirmation - ${bookingData.bookingId}`,
      text: emailText,
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
