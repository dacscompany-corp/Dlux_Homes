import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// The guest's notice on a date-change decision, from the approve/reject
// branches of /api/admin/bookings/[id]/date-change.
//
// This is their ONLY notice. The `notifications` table is employees-only — its
// FK targets employees(id) and the read route inner-joins employees — so a row
// written there for a guest fails the foreign key and is swallowed by the
// caller's catch. Until a guest notification centre exists, silence here means
// a guest turns up on a night that is no longer theirs.
//
// Body: { decision: "approved" | "rejected", email, firstName, lastName,
//         bookingId, roomName, oldCheckInDate, oldCheckOutDate,
//         newCheckInDate, newCheckOutDate, checkInTime, checkOutTime }

/** Postgres TIME ("19:00:00") or "19:00" -> "7:00 PM". Passes anything else through. */
function to12h(t: string | undefined | null): string {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t ?? "");
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

/** "2026-09-05" -> "Sat, Sep 5, 2026". Parsed at NOON so no timezone can shift the day. */
function longDate(iso: string | undefined | null): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Minimal escaping — guest names and room names land inside the HTML body. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F160E; background-color: #F6EFE2; padding: 24px 16px; }
  .email-container { max-width: 640px; margin: 0 auto; background: #FFFCF4; border-radius: 20px; overflow: hidden; border: 1px solid #E0CEB2; }
  .header { background-color: #1F160E; color: #FFFCF4; padding: 40px 32px; text-align: center; }
  .logo { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
  .tagline { font-size: 13.5px; color: rgba(255,252,244,.65); margin-top: 6px; }
  .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); padding: 7px 18px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
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
  .old-card { background-color: #F6EFE2; border: 1px solid #E0CEB2; border-radius: 14px; padding: 16px 22px; margin-bottom: 10px; }
  .old-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9B8B73; margin-bottom: 4px; }
  .old-value { color: #9B8B73; font-size: 14.5px; text-decoration: line-through; }
  .new-card { background-color: #FFFCF4; border: 2px solid #B07848; border-radius: 14px; padding: 18px 22px; }
  .new-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #B07848; margin-bottom: 4px; }
  .new-value { color: #1F160E; font-size: 17px; font-weight: 700; }
  .alert-box { background-color: #F6EFE2; border-left: 3px solid #B07848; padding: 22px 26px; margin: 24px 0; border-radius: 10px; }
  .alert-title { font-weight: 700; color: #1F160E; margin-bottom: 12px; font-size: 14px; }
  .alert-box p { color: #6B5A42; }
  .footer { background-color: #1F160E; color: #C9B79E; padding: 30px 32px; text-align: center; }
  .footer-info { margin: 6px 0; font-size: 13px; }
  .footer-divider { height: 1px; background-color: rgba(255,255,255,.1); margin: 18px 0; }
  .footer-copyright { font-size: 12px; color: #8B7458; margin-top: 6px; }
`;

export async function POST(request: NextRequest) {
  try {
    const d = await request.json();

    if (!d.email) {
      return NextResponse.json({ success: false, error: "No recipient email" }, { status: 400 });
    }

    const approved = d.decision !== "rejected";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const guestName = esc(`${d.firstName || "Guest"}${d.lastName ? ` ${d.lastName}` : ""}`);
    const oldIn = longDate(d.oldCheckInDate);
    const oldOut = longDate(d.oldCheckOutDate);
    const newIn = longDate(d.newCheckInDate);
    const newOut = longDate(d.newCheckOutDate);
    const inTime = to12h(d.checkInTime);
    const outTime = to12h(d.checkOutTime);

    // The dates that are actually operative after this decision: the new ones
    // on an approval, the untouched originals on a rejection.
    const liveIn = approved ? newIn : oldIn;
    const liveOut = approved ? newOut : oldOut;

    const accent = approved ? "#C9A227" : "#E0917A";

    const body = approved
      ? `
            <p class="intro-text">
              Your stay with <span class="highlight">D&rsquo;Lux Homes</span> has been moved. Please check the new
              dates below and make sure they match what you expect &mdash; your original dates are no longer held.
            </p>

            <div class="old-card">
              <div class="old-label">Previously</div>
              <div class="old-value">${oldIn} &rarr; ${oldOut}</div>
            </div>

            <div class="new-card">
              <div class="new-label">Your new dates</div>
              <div class="new-value">${newIn} &rarr; ${newOut}</div>
            </div>`
      : `
            <p class="intro-text">
              We weren&rsquo;t able to move your stay with <span class="highlight">D&rsquo;Lux Homes</span> to the date
              you asked for. <strong>Your original booking is unchanged and still held</strong> &mdash; nothing has been
              cancelled, and no payment has been affected.
            </p>

            <div class="new-card">
              <div class="new-label">Your dates are still</div>
              <div class="new-value">${oldIn} &rarr; ${oldOut}</div>
            </div>`;

    const closing = approved
      ? `
            <div class="alert-box">
              <div class="alert-title">Nothing else has changed</div>
              <p>
                Your rate, any payment you have already made and your remaining balance all stay exactly as they were.
                If anything above looks wrong, reply to this email straight away.
              </p>
            </div>`
      : `
            <div class="alert-box">
              <div class="alert-title">Still need a different date?</div>
              <p>
                Reply to this email and we&rsquo;ll look at what else we can do. Please don&rsquo;t assume a change has
                gone through until we confirm it in writing.
              </p>
            </div>`;

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${approved ? "Your Dates Have Moved" : "About Your Date Change"} - D'Lux Homes</title>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
        <style>${STYLES}</style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">D&rsquo;Lux Homes</div>
            <div class="tagline">Booking Update</div>
            <div class="status-badge" style="color:${accent};">
              <span class="status-dot" style="background:${accent};"></span>${approved ? "Dates Changed" : "Dates Unchanged"}
            </div>
          </div>

          <div class="content">
            <div class="greeting">Hello ${guestName},</div>
            ${body}

            <div class="section-title">Booking Details</div>
            <div class="info-card">
              <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${esc(d.bookingId)}</span></div>
              <div class="info-row"><span class="info-label">Haven</span><span class="info-value">${esc(d.roomName)}</span></div>
              <div class="info-row"><span class="info-label">Check-in</span><span class="info-value">${liveIn}${inTime ? ` &middot; ${inTime}` : ""}</span></div>
              <div class="info-row"><span class="info-label">Check-out</span><span class="info-value">${liveOut}${outTime ? ` &middot; ${outTime}` : ""}</span></div>
            </div>

            ${closing}
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
      to: d.email,
      subject: approved
        ? `Your dates have changed - ${d.bookingId || "D'Lux Homes"}`
        : `About your date change - ${d.bookingId || "D'Lux Homes"}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true, message: "Date-change email sent" });
  } catch (error) {
    console.error("❌ Error sending date-change email:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send date-change email",
      },
      { status: 500 },
    );
  }
}
