// Renders the pre-arrival self check-in email to an HTML file so you can eyeball
// the design in a browser without sending anything. Uses the REAL template
// (backend/utils/selfCheckinEmail.ts), so what you see is what a guest gets.
//
//   node scripts/preview-selfcheckin-email.mjs
//
// Reads DLUX_* env vars if present; otherwise falls back to sample values so the
// Wi-Fi / Netflix rows still render. Pass real ones to preview the live copy:
//
//   node --env-file=.env scripts/preview-selfcheckin-email.mjs
//
// The output file is written to the OS temp dir, never into the repo.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Sample values only when the real ones aren't configured — this is a preview,
// so an empty Wi-Fi row would just look like a bug.
process.env.DLUX_WIFI_NAME ||= 'CABLELINK_E711';
process.env.DLUX_WIFI_PASSWORD ||= 'IBLAZE_5741';
process.env.DLUX_NETFLIX_PIN ||= '1240-2351';

const { renderSelfCheckinEmailHtml } = await import('../src/backend/utils/selfCheckinEmail.ts');

const html = renderSelfCheckinEmailHtml({
  email: 'guest@example.com',
  guestName: 'John',
  bookingId: 'DL-BK3423840944',
  roomName: "D'Lux Homes — Tower 4 Grass Residences",
  checkInDate: '2026-07-15',
  checkInTime: '07:00 AM',
  checkOutDate: '2026-07-15',
  checkOutTime: '05:00 PM',
  guests: '2 Adults, 0 Young Adults, 0 Children',
});

const out = join(tmpdir(), 'dlux-selfcheckin-preview.html');
writeFileSync(out, html);
console.log('✓ Preview written to:', out);
console.log('  Open it in a browser to check the design.');
