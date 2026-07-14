// Test harness for the pre-arrival self check-in email.
//
// The cron query and its send-time maths are already verified; what this
// exercises is the part that can't be proven from SQL alone: the template
// rendering and the actual SMTP delivery.
//
// It seeds a booking that is DUE RIGHT NOW, so hitting the cron endpoint sends
// immediately instead of waiting for a real check-in window.
//
//   Seed a Daycation (send time = midnight today, already passed):
//     node --env-file=.env scripts/test-selfcheckin-email.mjs seed you@example.com
//
//   Seed an Overnight (check-in 1h from now, so "2h before" has passed):
//     node --env-file=.env scripts/test-selfcheckin-email.mjs seed you@example.com overnight
//
//   Then, with `npm run dev` running (the cron allows unauthenticated in dev):
//     curl http://localhost:3000/api/cron/send-self-checkin-emails
//
//   Remove every test booking afterwards:
//     node --env-file=.env scripts/test-selfcheckin-email.mjs cleanup
//
// Test rows are prefixed TEST-SELFCHECKIN- so cleanup can never touch a real
// booking. booking_guests rows cascade-delete with their booking.

import pg from 'pg';

const { Client } = pg;
const PREFIX = 'TEST-SELFCHECKIN-';

const [cmd, email, stay = 'daycation'] = process.argv.slice(2);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('✗ DATABASE_URL not set. Run with: node --env-file=.env scripts/test-selfcheckin-email.mjs ...');
  process.exit(1);
}
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const client = new Client({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

async function seed() {
  if (!email || !email.includes('@')) {
    console.error('✗ Pass the email address to send to:\n  node --env-file=.env scripts/test-selfcheckin-email.mjs seed you@example.com [overnight]');
    process.exit(1);
  }
  const overnight = stay.toLowerCase() === 'overnight';

  // Daycation → 07:00 check-in, so its send time (midnight today) has passed.
  // Overnight → check-in 1 hour from now, so "2 hours before" has also passed.
  // Both are therefore due on the very next cron run.
  const ciExpr = overnight
    ? `((NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 hour')::time`
    : `TIME '07:00'`;
  const coExpr = overnight ? `TIME '16:00'` : `TIME '17:00'`;

  const bookingId = PREFIX + Date.now();

  await client.query('BEGIN');
  const { rows } = await client.query(
    `
    INSERT INTO booking (
      booking_id, room_name,
      check_in_date, check_out_date,
      check_in_time, check_out_time,
      adults, children, infants, status
    ) VALUES (
      $1, $2,
      (NOW() AT TIME ZONE 'Asia/Manila')::date,
      (NOW() AT TIME ZONE 'Asia/Manila')::date + 1,
      ${ciExpr}, ${coExpr},
      2, 0, 0, 'approved'
    )
    RETURNING id, check_in_time
    `,
    [bookingId, "D'Lux Homes — Tower 4 Grass Residences"],
  );
  await client.query(
    `INSERT INTO booking_guests (booking_id, first_name, last_name, email, phone)
     VALUES ($1, 'Test', 'Guest', $2, '09000000000')`,
    [rows[0].id, email],
  );
  await client.query('COMMIT');

  console.log(`✓ Seeded ${overnight ? 'Overnight' : 'Daycation'} test booking`);
  console.log(`  booking_id : ${bookingId}`);
  console.log(`  check-in   : today at ${rows[0].check_in_time}`);
  console.log(`  guest email: ${email}`);
  console.log('\nNow, with `npm run dev` running:');
  console.log('  curl http://localhost:3000/api/cron/send-self-checkin-emails');
  console.log('\nThen clean up:');
  console.log('  node --env-file=.env scripts/test-selfcheckin-email.mjs cleanup');
}

async function cleanup() {
  const { rowCount } = await client.query(`DELETE FROM booking WHERE booking_id LIKE $1`, [PREFIX + '%']);
  console.log(`✓ Removed ${rowCount} test booking(s).`);
}

async function run() {
  await client.connect();
  if (cmd === 'seed') await seed();
  else if (cmd === 'cleanup') await cleanup();
  else {
    console.error('Usage:\n  ... test-selfcheckin-email.mjs seed you@example.com [overnight]\n  ... test-selfcheckin-email.mjs cleanup');
    process.exitCode = 1;
  }
  await client.end();
}

run().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
