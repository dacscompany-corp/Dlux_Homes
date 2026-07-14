import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  try {
    const bookingData = await request.json();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const guestName = `${bookingData.firstName || "Guest"}${bookingData.lastName ? ` ${bookingData.lastName}` : ""}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Booking Request Update - D'Lux Homes</title>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
          .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
          .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
          .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
          .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
          .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #E0917A; padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
          .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #E0917A; display: inline-block; }
          .content { padding: 40px 36px; }
          .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; color: #1F160E; margin-bottom: 14px; }
          .intro-text { color: #8B7458; margin-bottom: 28px; line-height: 1.7; font-size: 15px; }
          .highlight { color: #B07848; font-weight: 600; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B07848; margin: 30px 0 12px; }
          .info-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 6px 24px; margin: 0; border-radius: 14px; }
          .info-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #E7D9BE; }
          .info-row:last-child { border-bottom: none; }
          .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; }
          .info-value { color: #1F160E; font-weight: 600; font-size: 14.5px; text-align: right; }
          .alert-box { background-color: #F6EFE2; border-left: 3px solid #E0917A; padding: 22px 26px; margin: 24px 0; border-radius: 10px; }
          .alert-title { font-weight: 700; color: #1F160E; margin-bottom: 12px; font-size: 14px; }
          .alert-box p { color: #6B5A42; white-space: pre-wrap; }
          .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; }
          .footer-info { margin: 6px 0; font-size: 13px; }
          .footer-divider { height: 1px; background-color: rgba(255,255,255,.1); margin: 18px 0; }
          .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">D&rsquo;Lux Homes</div>
            <div class="tagline">Booking Request Update</div>
            <div class="status-badge"><span class="status-dot"></span>Not Approved</div>
          </div>

          <div class="content">
            <div class="greeting">Hello ${guestName},</div>
            <p class="intro-text">
              Your booking request with <span class="highlight">D&rsquo;Lux Homes</span> has been reviewed and was not
              approved at this time.
            </p>

            <div class="alert-box">
              <div class="alert-title">Rejection Reason</div>
              <p>${bookingData.rejectionReason || "(No reason provided)"}</p>
            </div>

            <div class="section-title">Booking Details</div>
            <div class="info-card">
              <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${bookingData.bookingId || ""}</span></div>
              <div class="info-row"><span class="info-label">Haven</span><span class="info-value">${bookingData.roomName || ""}</span></div>
              <div class="info-row"><span class="info-label">Check-in</span><span class="info-value">${bookingData.checkInDate || ""} ${bookingData.checkInTime || ""}</span></div>
              <div class="info-row"><span class="info-label">Check-out</span><span class="info-value">${bookingData.checkOutDate || ""} ${bookingData.checkOutTime || ""}</span></div>
            </div>

            <p class="intro-text" style="margin-top:26px;margin-bottom:0;">
              If you have questions, you may reply to this email or submit a new request.
            </p>
          </div>

          <div class="footer">
            <div class="footer-info">homesdlux@gmail.com</div>
            <div class="footer-info">Tower 4, Grass Residences, QC</div>
            <div class="footer-divider"></div>
            <div class="footer-copyright">&copy; ${new Date().getFullYear()} D&rsquo;Lux Homes. All rights reserved.</div>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: bookingData.email,
      subject: `Booking Request Rejected - ${bookingData.bookingId || "D'Lux Homes"}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true, message: "Rejection email sent" });
  } catch (error) {
    console.error("❌ Error sending rejection email:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send rejection email",
      },
      { status: 500 },
    );
  }
}
