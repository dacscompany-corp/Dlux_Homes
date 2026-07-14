// Shared OTP-email sender. Extracted from /api/admin/send-email so that
// server-side callers (lib/auth.ts during lockout, /api/admin/resend-otp)
// can send mail without an HTTP hop — that hop previously required
// /api/admin/send-email to stay publicly callable, which blocked any
// future attempt to lock down the /api/admin/** surface.

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export type OtpEmailType = "ACCOUNT_LOCK" | "VERIFY" | string;

export interface SendOtpEmailInput {
  email: string;
  otp: string;
  type: OtpEmailType;
  userName?: string | null;
}

export async function sendOtpEmail({ email, otp, type, userName }: SendOtpEmailInput): Promise<void> {
  const htmlContent = renderOtpEmailHtml(email, otp, type, userName || undefined);
  await transporter.sendMail({
    from: `"D'Lux Homes" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: type === "ACCOUNT_LOCK" ? "🔒 Account Locked - Security Alert" : "🔐 Verification Code",
    html: htmlContent,
  });
  console.log(`✅ Email sent successfully to ${email}`);
}

// Escape HTML metacharacters so caller-supplied values can't inject markup into
// the email body. This endpoint is publicly reachable (see send-email/route.ts),
// so without escaping an attacker could POST a crafted userName/otp/email
// containing <a>/<img onerror> and have the app deliver a domain-authenticated,
// D'Lux-branded phishing message to any recipient.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Matches the D'Lux Homes storefront brand: warm cream palette, Fraunces
// serif headings, dark-ink header/footer — same tokens as the other
// transactional emails (see src/app/api/send-pending-email/route.ts).
export function renderOtpEmailHtml(
  rawEmail: string,
  rawOtp: string,
  type: string,
  rawUserName?: string,
): string {
  const isAccountLock = type === "ACCOUNT_LOCK";
  const email = escapeHtml(rawEmail);
  const otp = escapeHtml(rawOtp);
  const userName = rawUserName ? escapeHtml(rawUserName) : undefined;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${isAccountLock ? "Account Locked" : "Verification Code"}</title>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; max-width: 600px; margin: 0 auto; padding: 24px 16px; background-color: #F6EFE2; }
        .container { background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
        .header { background-color: #1F160E; padding: 40px 32px; text-align: center; color: #FFFCF4; }
        .logo { width: 56px; height: 56px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; color: #F0C892; }
        .brand-name { font-family: 'Fraunces', Georgia, serif; font-size: 24px; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 10px; }
        .header h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
        .header p { font-size: 13.5px; color: rgba(255,252,244,.65); }
        .content { padding: 40px 36px; }
        .title { font-family: 'Fraunces', Georgia, serif; font-size: 19px; font-weight: 500; color: #1F160E; margin-bottom: 10px; }
        .intro-text { color: #8B7458; }
        .text-primary { color: #B07848; }
        .otp-container { background: #F6EFE2; border: 2px dashed #B07848; border-radius: 14px; padding: 28px; text-align: center; margin: 26px 0; }
        .otp-code { font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1F160E; margin: 12px 0; }
        .security-info { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 20px 22px; margin: 22px 0; border-radius: 10px; color: #6B5A42; }
        .security-info strong { color: #1F160E; }
        .security-info ul { margin: 10px 0 0 20px; }
        .security-info li { margin: 6px 0; }
        .footer { background-color: #1F160E; color: #C9B79E; padding: 26px 30px; text-align: center; font-size: 13px; }
        .footer strong { color: #FFFCF4; }
        .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            ${
              isAccountLock
                ? '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>'
                : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M21 12c-1.39 0-2.78-.35-4-1a8 8 0 00-8 0c-1.22.65-2.61 1-4 1H2"></path><path d="M22 12v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5"></path></svg>'
            }
          </div>
          <div class="brand-name">D&rsquo;Lux Homes</div>
          <h1>${isAccountLock ? "Account Security Alert" : "Verify Your Account"}</h1>
          <p>${isAccountLock ? "We detected unusual activity on your account" : "Complete your verification"}</p>
        </div>

        <div class="content">
          ${userName ? `<p class="intro-text">Hello <strong class="text-primary">${userName}</strong>,</p>` : ""}

          ${
            isAccountLock
              ? `
            <p class="title" style="margin-top:16px;">Account Temporarily Locked</p>
            <p class="intro-text">We&rsquo;ve temporarily locked your account due to multiple failed login attempts. This is to protect your account from unauthorized access.</p>
          `
              : `
            <p class="title" style="margin-top:16px;">Verify Your Account</p>
            <p class="intro-text">Thank you for using our service. To complete your action, please use the verification code below:</p>
          `
          }

          <div class="otp-container">
            <p style="margin: 0 0 10px 0; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #9B8B73;">
              ${isAccountLock ? "Account Unlock Code" : "Verification Code"}
            </p>
            <div class="otp-code">${otp}</div>
            <p style="margin: 15px 0 0 0; font-size: 13.5px; color: #8B7458;">
              This code will expire in <strong style="color:#1F160E;">10 minutes</strong>
            </p>
          </div>

          <div class="security-info">
            <strong>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 5px; vertical-align: -2px;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Security Tips:
            </strong>
            <ul>
              <li>Never share this code with anyone</li>
              <li>We'll never ask for your password via email</li>
              <li>This code is single-use only</li>
            </ul>
          </div>

          <p class="intro-text" style="margin-top:26px;">
            If you didn&rsquo;t request this code, please ignore this email or contact our support team immediately.
          </p>

          <p class="intro-text" style="margin-top:20px;">
            Best regards,<br>
            <strong class="text-primary">D&rsquo;Lux Homes Security Team</strong>
          </p>
        </div>

        <div class="footer">
          This email was sent to <strong>${email}</strong>
          <div class="footer-copyright">&copy; ${new Date().getFullYear()} D&rsquo;Lux Homes. All rights reserved.</div>
        </div>
      </div>
    </body>
    </html>
  `;
}
