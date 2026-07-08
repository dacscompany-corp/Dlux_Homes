import nodemailer from "nodemailer";

// Partner Welcome Email Template matching the existing booking email style
export function getPartnerWelcomeEmailTemplate(
  partnerName: string,
  email: string,
  password: string
): string {
  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Partner Account Created - D'Lux Homes</title>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
        .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
        .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
        .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
        .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #F0C892; padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #F0C892; display: inline-block; }
        .content { padding: 40px 36px; }
        .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; color: #1F160E; margin-bottom: 14px; }
        .intro-text { color: #8B7458; margin-bottom: 28px; line-height: 1.7; font-size: 15px; }
        .highlight { color: #B07848; font-weight: 600; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B07848; margin: 30px 0 12px; }
        .info-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 6px 24px; margin: 0; border-radius: 14px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #E7D9BE; gap: 16px; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; white-space: nowrap; }
        .info-value { color: #1F160E; font-weight: 600; font-size: 14.5px; text-align: right; word-break: break-all; }
        .info-value.mono { font-family: 'Courier New', monospace; }
        .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 22px 26px; margin: 24px 0; border-radius: 10px; }
        .alert-title { font-weight: 700; color: #1F160E; margin-bottom: 12px; font-size: 14px; }
        .alert-box ol, .alert-box ul { margin-left: 18px; color: #6B5A42; }
        .alert-box li { margin: 8px 0; line-height: 1.6; }
        .cta-wrap { text-align: center; margin: 36px 0 8px; }
        .cta-button { display: inline-block; background-color: #1F160E; color: #FFFCF4; padding: 14px 34px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14.5px; }
        .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; }
        .footer-info { margin: 6px 0; font-size: 13px; }
        .footer-divider { height: 1px; background-color: rgba(255,255,255,.1); margin: 18px 0; }
        .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <div class="logo">D&rsquo;Lux Homes</div>
          <div class="tagline">Your Perfect Partnership Begins Here</div>
          <div class="status-badge"><span class="status-dot"></span>Account Created Successfully</div>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">Dear ${partnerName},</div>

          <p class="intro-text">
            Welcome to the <span class="highlight">D&rsquo;Lux Homes Partner Network</span>!
            Your partner account has been successfully created. We&rsquo;re excited to have you join our growing community of premium hospitality partners.
          </p>

          <!-- Credentials -->
          <div class="section-title">Your Login Credentials</div>
          <div class="info-card">
            <div class="info-row"><span class="info-label">Email Address</span><span class="info-value">${email}</span></div>
            <div class="info-row"><span class="info-label">Temporary Password</span><span class="info-value mono">${password}</span></div>
          </div>

          <!-- Security Alert -->
          <div class="alert-box">
            <div class="alert-title">Important Security Information</div>
            <ol>
              <li><strong>Change your password immediately</strong> after your first login</li>
              <li>Use a strong password with at least 8 characters</li>
              <li>Include uppercase, lowercase, numbers, and special characters</li>
              <li>Never share your credentials with anyone</li>
              <li>Contact our support team if you suspect any unauthorized access</li>
            </ol>
          </div>

          <!-- How to Change Password -->
          <div class="section-title">How to Change Your Password</div>
          <div class="alert-box">
            <ol>
              <li>Log in to your partner dashboard using the credentials above</li>
              <li>Click your <strong>Profile Icon</strong> in the top-right corner</li>
              <li>Select <strong>&ldquo;Settings&rdquo;</strong> from the dropdown menu</li>
              <li>Go to <strong>&ldquo;Security&rdquo;</strong> or <strong>&ldquo;Change Password&rdquo;</strong></li>
              <li>Enter your current password (the temporary one provided)</li>
              <li>Enter your new secure password</li>
              <li>Click <strong>&ldquo;Save Changes&rdquo;</strong> or <strong>&ldquo;Update Password&rdquo;</strong></li>
              <li>Log in again with your new password</li>
            </ol>
          </div>

          <!-- Next Steps -->
          <div class="section-title">Next Steps</div>
          <p class="intro-text" style="margin-bottom:14px;">
            To get started with your partner dashboard, please:
          </p>
          <ul style="margin-left: 20px; color: #8B7458; font-size: 15px; line-height: 1.8; margin-bottom: 8px;">
            <li>Complete your full profile information</li>
            <li>Set up your commission rates and payment details</li>
            <li>Configure your property information and availability</li>
            <li>Review the partner guidelines and policies</li>
            <li>Start managing your services on the platform</li>
          </ul>

          <!-- Call to Action -->
          <div class="cta-wrap">
            <a class="cta-button" href="${siteUrl}/partner/login">Access Partner Dashboard &rarr;</a>
          </div>

          <p class="intro-text" style="margin-top:26px;margin-bottom:0;">
            If you have any questions or need assistance, our dedicated support team is available to help.
            You can reach us through the Help &amp; Support section in your dashboard or contact us directly at
            <span class="highlight">homesdlux@gmail.com</span>
          </p>
        </div>

        <!-- Footer -->
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
}

// Down Payment Approval Email Template
export function getDownPaymentApprovalEmailTemplate(
  guestName: string,
  bookingId: string,
  downPaymentAmount: string,
  roomName?: string,
  remainingBalance?: string,
  propertyAddress?: string
): string {
  const approvalDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Confirmed - D'Lux Homes</title>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
        .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
        .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
        .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
        .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #F0C892; padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #F0C892; display: inline-block; }
        .content { padding: 40px 36px; }
        .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; color: #1F160E; margin-bottom: 14px; }
        .intro-text { color: #8B7458; margin-bottom: 28px; line-height: 1.7; font-size: 15px; }
        .highlight { color: #B07848; font-weight: 600; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B07848; margin: 30px 0 12px; }
        .info-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 6px 24px; margin: 0; border-radius: 14px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #E7D9BE; gap: 16px; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; white-space: nowrap; }
        .info-value { color: #1F160E; font-weight: 600; font-size: 14.5px; text-align: right; word-break: break-all; }
        .payment-card { background-color: #1F160E; color: #F6EFE2; padding: 28px 26px; border-radius: 16px; }
        .payment-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 14px; color: #C9B79E; }
        .payment-total { margin-top: 14px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.14); display: flex; justify-content: space-between; align-items: baseline; }
        .payment-total-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #B99B6E; }
        .payment-total-value { font-family: 'Fraunces', Georgia, serif; font-size: 26px; font-weight: 500; color: #E8B87A; }
        .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 22px 26px; margin: 24px 0; border-radius: 10px; }
        .alert-title { font-weight: 700; color: #1F160E; margin-bottom: 12px; font-size: 14px; }
        .alert-box ul { margin-left: 18px; color: #6B5A42; }
        .alert-box li { margin: 8px 0; line-height: 1.6; }
        .cta-wrap { text-align: center; margin: 36px 0 8px; }
        .cta-button { display: inline-block; background-color: #1F160E; color: #FFFCF4; padding: 14px 34px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14.5px; }
        .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; }
        .footer-info { margin: 6px 0; font-size: 13px; }
        .footer-divider { height: 1px; background-color: rgba(255,255,255,.1); margin: 18px 0; }
        .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <div class="logo">D&rsquo;Lux Homes</div>
          <div class="tagline">Your Booking is Confirmed</div>
          <div class="status-badge"><span class="status-dot"></span>Payment Confirmed</div>
        </div>

        <!-- Main Content -->
        <div class="content">
          <div class="greeting">Hi ${guestName},</div>
          <p class="intro-text">
            Great news! Your down payment of <span class="highlight">${downPaymentAmount}</span> has been successfully
            approved. Your reservation is confirmed, and you&rsquo;re all set to check in.
          </p>

          <!-- Booking Details -->
          <div class="section-title">Booking Details</div>
          <div class="info-card">
            <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">#${bookingId}</span></div>
            ${roomName ? `<div class="info-row"><span class="info-label">Property</span><span class="info-value">${roomName}</span></div>` : ''}
            <div class="info-row"><span class="info-label">Approved On</span><span class="info-value">${approvalDate}</span></div>
          </div>

          <!-- Property Location -->
          ${propertyAddress ? `
          <div class="section-title">Location</div>
          <div class="alert-box">
            <div style="color:#6B5A42;font-size:14px;line-height:1.6;">${propertyAddress}</div>
          </div>
          ` : ''}

          <!-- Payment Breakdown -->
          <div class="section-title">Payment Summary</div>
          <div class="payment-card">
            <div class="payment-row"><span>Down Payment</span><span>${downPaymentAmount}</span></div>
            ${remainingBalance ? `
            <div class="payment-total">
              <span class="payment-total-label">Remaining Balance</span>
              <span class="payment-total-value">${remainingBalance}</span>
            </div>
            ` : `
            <div class="payment-total">
              <span class="payment-total-label">Status</span>
              <span class="payment-total-value" style="font-size:20px;">Approved</span>
            </div>
            `}
          </div>

          <!-- CTA -->
          <div class="alert-box" style="text-align:center;">
            <p style="color:#6B5A42;font-size:14.5px;line-height:1.6;margin-bottom:18px;">Ready to check in? We&rsquo;ll send you check-in instructions and house rules soon.</p>
            <a class="cta-button" href="mailto:homesdlux@gmail.com">Contact Us for Details</a>
          </div>

          <!-- Next Steps -->
          <div class="section-title">What&rsquo;s Next</div>
          <div class="alert-box">
            <div class="alert-title">Important Steps</div>
            <ul>
              <li>Check your email for check-in instructions</li>
              <li>Review house rules and property guidelines</li>
              <li>Confirm your arrival date (24 hours before)</li>
              ${remainingBalance ? `<li>Complete remaining balance payment before check-in</li>` : ''}
            </ul>
          </div>

          <p class="intro-text" style="margin-top:26px;margin-bottom:0;">
            If you have any questions, feel free to reach out to our support team. We&rsquo;re here to help make your stay amazing!
          </p>
        </div>

        <!-- Footer -->
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
}

// Send down payment approval email to guest
export async function sendDownPaymentApprovalEmail(
  email: string,
  guestName: string,
  bookingId: string,
  downPaymentAmount: string,
  roomName?: string,
  remainingBalance?: string,
  propertyAddress?: string
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const htmlContent = getDownPaymentApprovalEmailTemplate(
      guestName,
      bookingId,
      downPaymentAmount,
      roomName,
      remainingBalance,
      propertyAddress
    );

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Down Payment Approved - Your Booking is Confirmed",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Down payment approval email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending down payment approval email:", error);
    return false;
  }
}

// Employee Welcome Email Template
export function getEmployeeWelcomeEmailTemplate(
  employeeName: string,
  email: string,
  password: string,
  role: string,
  loginUrl: string = "http://localhost:3000/admin/login"
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Employee Account Created - D'Lux Homes</title>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
        .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
        .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
        .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
        .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #F0C892; padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #F0C892; display: inline-block; }
        .content { padding: 40px 36px; }
        .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; color: #1F160E; margin-bottom: 14px; }
        .intro-text { color: #8B7458; margin-bottom: 28px; line-height: 1.7; font-size: 15px; }
        .highlight { color: #B07848; font-weight: 600; }
        .role-badge { display: inline-flex; align-items: center; background-color: #F6EFE2; border: 1px solid #E0CEB2; color: #B07848; padding: 6px 16px; border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; margin-bottom: 22px; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B07848; margin: 30px 0 12px; }
        .info-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; padding: 6px 24px; margin: 0; border-radius: 14px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #E7D9BE; gap: 16px; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; white-space: nowrap; }
        .info-value { color: #1F160E; font-weight: 600; font-size: 14.5px; text-align: right; word-break: break-all; }
        .info-value.mono { font-family: 'Courier New', monospace; }
        .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 22px 26px; margin: 24px 0; border-radius: 10px; }
        .alert-title { font-weight: 700; color: #1F160E; margin-bottom: 12px; font-size: 14px; }
        .alert-box ol, .alert-box ul { margin-left: 18px; color: #6B5A42; }
        .alert-box li { margin: 8px 0; line-height: 1.6; }
        .cta-wrap { text-align: center; margin: 36px 0 8px; }
        .cta-button { display: inline-block; background-color: #1F160E; color: #FFFCF4; padding: 14px 34px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14.5px; }
        .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; }
        .footer-info { margin: 6px 0; font-size: 13px; }
        .footer-divider { height: 1px; background-color: rgba(255,255,255,.1); margin: 18px 0; }
        .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <div class="logo">D&rsquo;Lux Homes</div>
          <div class="tagline">Welcome to the Team</div>
          <div class="status-badge"><span class="status-dot"></span>Account Created Successfully</div>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">Dear ${employeeName},</div>

          <p class="intro-text">
            Welcome to <span class="highlight">D&rsquo;Lux Homes</span>! Your employee account has been successfully created.
            We&rsquo;re excited to have you on board as a member of our team.
          </p>

          <div class="role-badge">Role: ${role}</div>

          <!-- Credentials -->
          <div class="section-title">Your Login Credentials</div>
          <div class="info-card">
            <div class="info-row"><span class="info-label">Email Address</span><span class="info-value">${email}</span></div>
            <div class="info-row"><span class="info-label">Temporary Password</span><span class="info-value mono">${password}</span></div>
          </div>

          <!-- Security Alert -->
          <div class="alert-box">
            <div class="alert-title">Important Security Notice</div>
            <ol>
              <li><strong>Change your password immediately</strong> after your first login</li>
              <li>Use a strong password with at least 8 characters</li>
              <li>Include uppercase, lowercase, numbers, and special characters</li>
              <li>Never share your credentials with anyone</li>
              <li>Contact our IT support if you suspect any unauthorized access</li>
            </ol>
          </div>

          <!-- How to Login -->
          <div class="section-title">Getting Started</div>
          <p class="intro-text" style="margin-bottom:14px;">
            Follow these steps to access your employee dashboard:
          </p>
          <div class="alert-box">
            <ol>
              <li>Click the login button below or go to: <strong>${loginUrl}</strong></li>
              <li>Enter your email address: <strong>${email}</strong></li>
              <li>Enter your temporary password (provided above)</li>
              <li>Once logged in, navigate to your <strong>Profile Settings</strong></li>
              <li>Go to <strong>Security</strong> or <strong>Change Password</strong></li>
              <li>Enter your current password</li>
              <li>Create a new secure password</li>
              <li>Save your changes</li>
            </ol>
          </div>

          <!-- Call to Action -->
          <div class="cta-wrap">
            <a class="cta-button" href="${loginUrl}">Login to Your Account &rarr;</a>
          </div>

          <!-- Next Steps -->
          <div class="section-title">Next Steps</div>
          <p class="intro-text" style="margin-bottom:14px;">
            After logging in and changing your password:
          </p>
          <ul style="margin-left: 20px; color: #8B7458; font-size: 15px; line-height: 1.8; margin-bottom: 8px;">
            <li>Complete your full profile information</li>
            <li>Review company policies and guidelines</li>
            <li>Set up two-factor authentication for extra security</li>
            <li>Connect with your team members</li>
            <li>Start exploring your dashboard</li>
          </ul>

          <p class="intro-text" style="margin-top:26px;margin-bottom:0;">
            If you have any questions or need assistance, please don&rsquo;t hesitate to contact our support team at
            <span class="highlight">homesdlux@gmail.com</span> or reach out to your department manager.
          </p>
        </div>

        <!-- Footer -->
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
}

// Send employee welcome email
export async function sendEmployeeWelcomeEmail(
  email: string,
  fullname: string,
  password: string,
  role: string,
  loginUrl?: string
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const htmlContent = getEmployeeWelcomeEmailTemplate(
      fullname,
      email,
      password,
      role,
      loginUrl
    );

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to D'Lux Homes - Your Account is Ready",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Employee welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending employee welcome email:", error);
    return false;
  }
}

// Send a password-reset email with a tokenized link. Returns true if sent.
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn("Email not configured — password reset link:", resetUrl);
      return false;
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password - D'Lux Homes</title>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
          .email-container { max-width: 560px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
          .header { background-color: #1F160E; color: #FFFCF4; padding: 36px 32px; text-align: center; }
          .logo { font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 500; letter-spacing: -0.02em; }
          .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
          .content { padding: 36px 34px; }
          .greeting { font-family: 'Fraunces', Georgia, serif; font-size: 21px; font-weight: 500; color: #1F160E; margin-bottom: 14px; }
          .intro-text { color: #8B7458; margin-bottom: 26px; line-height: 1.7; font-size: 15px; }
          .cta-wrap { text-align: center; margin: 30px 0; }
          .cta-button { display: inline-block; background-color: #1F160E; color: #FFFCF4; padding: 14px 34px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14.5px; }
          .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 18px 22px; margin: 24px 0; border-radius: 10px; }
          .alert-box p { color: #6B5A42; font-size: 13.5px; line-height: 1.6; }
          .link-fallback { font-size: 12px; color: #9B8B73; word-break: break-all; margin-top: 18px; line-height: 1.6; }
          .footer { background-color: #1F160E; color: #C9B79E; padding: 26px 32px; text-align: center; }
          .footer-info { margin: 6px 0; font-size: 13px; }
          .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">D&rsquo;Lux Homes</div>
            <div class="tagline">Password Reset Request</div>
          </div>
          <div class="content">
            <div class="greeting">Reset Your Password</div>
            <p class="intro-text">
              We received a request to reset your password. Click the button below to choose a new one. This link
              expires in 1 hour.
            </p>
            <div class="cta-wrap">
              <a class="cta-button" href="${resetUrl}">Reset Password</a>
            </div>
            <div class="alert-box">
              <p>If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t change.</p>
            </div>
            <div class="link-fallback">Or paste this link into your browser:<br>${resetUrl}</div>
          </div>
          <div class="footer">
            <div class="footer-info">homesdlux@gmail.com</div>
            <div class="footer-copyright">&copy; ${new Date().getFullYear()} D&rsquo;Lux Homes. All rights reserved.</div>
          </div>
        </div>
      </body>
      </html>`;

    await transporter.sendMail({
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset your D'Lux Homes password",
      html,
    });
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
}

// Send partner welcome email using the same setup as booking emails
export async function sendPartnerWelcomeEmail(
  email: string,
  fullname: string,
  password: string
): Promise<boolean> {
  try {
    // Create transporter with the same setup as other emails
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const htmlContent = getPartnerWelcomeEmailTemplate(fullname, email, password);

    const mailOptions = {
      from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Partner Account Created - Welcome to D'Lux Homes",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Partner welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending partner welcome email:", error);
    return false;
  }
}
