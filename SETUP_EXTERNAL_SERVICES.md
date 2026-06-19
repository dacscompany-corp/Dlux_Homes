# Optional external services

The core app (browse → book → admin manage) works **without** any of these. Each
feature below activates automatically once you add its keys to `.env.local` and
restart `npm run dev`. Until then it degrades gracefully (no crash):

- **Image uploads** → without Cloudinary, uploads are skipped (no image URL stored).
- **Email** → without an email account, confirmation/approval emails just don't send.
- **Google / Facebook login** → without OAuth keys, those buttons won't work (credentials login still does).
- **Turnstile** → without a key, the staff-login bot check is skipped.

---

## 1. Cloudinary — image uploads (valid IDs, payment proofs, haven photos)

1. Create a free account at <https://cloudinary.com/users/register_free>.
2. On the dashboard, copy **Cloud name**, **API Key**, **API Secret**.
3. Add to `.env.local`:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```
4. Restart the dev server. Now checkout valid-ID / payment-proof images upload,
   and CSR can view the proof link on the Payments page.

## 2. Email — booking & status notifications

Easiest is a **Gmail App Password** (needs 2-Step Verification on the account):

1. Google Account → Security → **2-Step Verification** (enable it).
2. Security → **App passwords** → generate one for "Mail".
3. Add to `.env.local`:
   ```
   EMAIL_USER=youraddress@gmail.com
   EMAIL_PASSWORD=the-16-char-app-password
   ```
4. Restart. Booking confirmation, approval, rejection, check-in/out emails now send.

> Prefer a transactional provider? The code also supports **Resend** — set
> `RESEND_API_KEY=` (get one free at <https://resend.com>).

## 3. Google / Facebook login (optional)

- **Google:** <https://console.cloud.google.com> → APIs & Services → Credentials →
  OAuth client ID (Web). Authorized redirect URI:
  `http://localhost:3000/api/auth/callback/google`. Then set
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Facebook:** <https://developers.facebook.com> → create an app → Facebook Login →
  redirect URI `http://localhost:3000/api/auth/callback/facebook`. Set
  `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`.

## 4. Cloudflare Turnstile (optional bot defense on staff login)

<https://dash.cloudflare.com> → Turnstile → add a widget → copy the **Secret key**
into `TURNSTILE_SECRET_KEY`. (Leave blank to skip the check during development.)

---

After editing `.env.local`, **stop and restart** `npm run dev` so the new vars load.
