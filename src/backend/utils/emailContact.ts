// Shared "contact us" block for transactional emails.
//
// Every email used to say "reply to this email or message us on our Facebook
// page" as plain text — no link, so a guest on mobile had no way to act on it.
// This renders the same message as two labelled, tappable buttons.
//
// The Messenger URL is the D'Lux Homes page thread, the same one the storefront
// and MessengerChat widget already link to. Overridable via env so the page can
// move without a code change.

export const SUPPORT_EMAIL = process.env.EMAIL_USER || "homesdlux@gmail.com";
export const MESSENGER_URL =
  process.env.DLUX_MESSENGER_URL || "https://www.facebook.com/messages/t/270893736109969";

type Theme = "dark" | "light";

/**
 * Contact block with an "Email us" and a "Message us on Facebook" button.
 * Table-based and inline-styled — Gmail strips <style> blocks and ignores flex.
 *
 * @param theme  "dark" sits on the ink panel, "light" on the cream card.
 * @param subject  Prefills the mail client's subject line (e.g. the booking id).
 */
export function contactBlockHtml(theme: Theme = "dark", subject?: string): string {
  const dark = theme === "dark";

  const panelBg = dark ? "#2b1b12" : "#faf5ec";
  const titleColor = dark ? "#f6ede0" : "#2b1b12";
  const bodyColor = dark ? "#CBB89C" : "#5c4a3c";
  // Outlined button needs a visible edge on whichever ground it sits on.
  const ghostBorder = dark ? "rgba(246,237,224,0.45)" : "#d9c6a8";
  const ghostText = dark ? "#f6ede0" : "#2b1b12";

  const mailto = subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${panelBg};border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="font-size:13px;font-weight:700;color:${titleColor};margin-bottom:4px;">Need a Hand?</div>
          <div style="font-size:13px;line-height:1.55;color:${bodyColor};margin-bottom:14px;">
            We&rsquo;re here 24/7. Message us through email or our Facebook page &mdash; whichever is easier for you.
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:8px;">
                <a href="${mailto}"
                   style="display:inline-block;background:#d9a25c;color:#2b1b12;font-size:12.5px;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:999px;white-space:nowrap;">
                  &#9993;&nbsp; Email us
                </a>
              </td>
              <td>
                <a href="${MESSENGER_URL}" target="_blank" rel="noopener"
                   style="display:inline-block;background:transparent;color:${ghostText};border:1px solid ${ghostBorder};font-size:12.5px;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:999px;white-space:nowrap;">
                  &#128172;&nbsp; Message us on Facebook
                </a>
              </td>
            </tr>
          </table>

          <div style="font-size:11.5px;color:${bodyColor};margin-top:12px;">
            Or reply directly to this email &mdash; it reaches us too.
          </div>
        </td>
      </tr>
    </table>`;
}
