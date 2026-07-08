import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

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

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You For Your Stay! - D'Lux Homes</title>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
          .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
          .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
          .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
          .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
          .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #C9B79E; padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
          .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #C9B79E; display: inline-block; }
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
          .balance-owed { color: #B07848 !important; }
          .qr-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 30px; margin: 24px 0 0; border-radius: 16px; text-align: center; }
          .qr-subtitle { color: #8B7458; font-size: 14px; margin-bottom: 20px; line-height: 1.6; }
          .qr-code-wrap { background: #FFFCF4; padding: 20px; border-radius: 14px; display: inline-block; border: 1px solid #E0CEB2; }
          .qr-id { margin-top: 10px; font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; color: #1F160E; letter-spacing: .04em; }
          .cta-wrap { text-align: center; margin: 26px 0 8px; }
          .cta-button { display: inline-block; background-color: #1F160E; color: #FFFCF4; padding: 14px 30px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14px; margin: 6px 8px; border: none; cursor: pointer; font-family: Arial, Helvetica, sans-serif; }
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
            <div class="tagline">Thank You For Staying With Us</div>
            <div class="status-badge"><span class="status-dot"></span>Checked Out</div>
          </div>

          <div class="content">
            <div class="greeting">Thank You, ${bookingData.firstName}!</div>
            <p class="intro-text">
              You have successfully checked out. We hope you enjoyed your stay at <span class="highlight">D&rsquo;Lux Homes</span>!
              We would love to hear about your experience and hope to see you again soon.
            </p>

            <div class="section-title">Your Stay Summary</div>
            <div class="info-card">
              <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${bookingData.bookingId}</span></div>
              <div class="info-row"><span class="info-label">Room</span><span class="info-value">${bookingData.roomName}</span></div>
              <div class="info-row"><span class="info-label">Check-In</span><span class="info-value">${bookingData.checkInDate}</span></div>
              <div class="info-row"><span class="info-label">Check-Out</span><span class="info-value">${bookingData.checkOutDate}</span></div>
              <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">₱${bookingData.totalAmount}</span></div>
              ${bookingData.remainingBalance > 0 ? `
              <div class="info-row"><span class="info-label balance-owed">Remaining Balance</span><span class="info-value balance-owed">₱${bookingData.remainingBalance}</span></div>
              ` : ''}
            </div>

            <div class="section-title">Your Booking Reference QR Code</div>
            <div class="qr-card">
              <p class="qr-subtitle">Show this QR code at the reception for quick check-in on your next visit</p>
              <div class="qr-code-wrap">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(bookingData.bookingId)}&color=${encodeURIComponent('1F160E')}&bgcolor=${encodeURIComponent('FFFCF4')}"
                     alt="Booking QR Code"
                     style="width: 150px; height: 150px; border-radius: 8px;">
                <div class="qr-id">${bookingData.bookingId}</div>
              </div>
              <div class="cta-wrap">
                <button class="cta-button" onclick="fetchReceiptPDF()">Download Receipt as PDF</button>
                <a href="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingData.bookingId)}&color=${encodeURIComponent('1F160E')}&bgcolor=${encodeURIComponent('FFFCF4')}"
                   class="cta-button"
                   download="qr-${bookingData.bookingId}.png"
                   target="_blank">Save QR Code</a>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="footer-info">homesdlux@gmail.com</div>
            <div class="footer-info">Tower 4, Grass Residences, QC</div>
            <div class="footer-divider"></div>
            <div class="footer-copyright">&copy; ${new Date().getFullYear()} D&rsquo;Lux Homes. All rights reserved.</div>
          </div>
        </div>

        <script>
          function fetchReceiptPDF() {
            const bookingData = ${JSON.stringify(bookingData)};

            fetch(window.location.origin + '/api/generate-receipt-pdf', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(bookingData)
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const link = document.createElement('a');
                link.href = data.pdfData;
                link.download = 'receipt-${bookingData.bookingId}.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } else {
                alert('Failed to generate PDF receipt');
              }
            })
            .catch(error => {
              console.error('Error generating PDF:', error);
              alert('Error generating PDF receipt');
            });
          }
        </script>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: bookingData.email,
      subject: `Thank You For Your Stay! - ${bookingData.bookingId}`,
      html: emailHtml,
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
