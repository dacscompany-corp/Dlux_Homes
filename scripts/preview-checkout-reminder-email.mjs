// Renders the check-out reminder email to an HTML file so you can eyeball the
// design in a browser without sending anything. Uses the REAL template
// (backend/utils/checkoutReminderEmail.ts), so what you see is what a guest gets.
//
//   node scripts/preview-checkout-reminder-email.mjs
//
// The output file is written to the OS temp dir, never into the repo.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DLUX_MAILBOX ||= '1240';

const { renderCheckoutReminderEmailHtml } = await import('../src/backend/utils/checkoutReminderEmail.ts');

const html = renderCheckoutReminderEmailHtml({
  email: 'guest@example.com',
  guestName: 'John',
  bookingId: 'DL-BK3423840944',
  roomName: "D'Lux Homes — Tower 4 Grass Residences",
  checkInDate: '2026-07-15',
  checkInTime: '07:00 PM',
  checkOutDate: '2026-07-16',
  checkOutTime: '04:00 PM',
  isToday: true,
  hour: 14, // 2 PM Manila → "Good afternoon", matching the owner's copy
});

const out = join(tmpdir(), 'dlux-checkout-reminder-preview.html');
writeFileSync(out, html);
console.log('✓ Preview written to:', out);
console.log('  Open it in a browser to check the design.');
