import { NextRequest, NextResponse } from 'next/server';
import pool from '../config/db';

const BOOKING_TABLE = (() => {
  const raw = (process.env.BOOKING_TABLE_NAME || "booking").trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
  console.warn("Invalid BOOKING_TABLE_NAME, defaulting to 'booking'");
  return "booking";
})();

// SQL INTERVAL units/literals can't be bound as parameters, so period/months
// values get interpolated into the query string. This coerces a possibly
// attacker-supplied value to a bounded, purely-numeric STRING first — closing
// the SQL-injection hole where `?period=0 days'; DROP ...;--` was spliced in
// verbatim and run via the simple query protocol (which allows stacked
// statements). Any non-numeric or out-of-range input collapses to the fallback.
function safeIntStr(value: unknown, fallback: number, max = 3650): string {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return String(fallback);
  return String(Math.min(n, max));
}

// Revenue / bookings / distinct-bookers for one time window. `where` is
// interpolated, so callers must pass only literals they built themselves.
//
// booking_guests is deliberately NOT joined here. It holds one row per guest,
// so joining it fans every booking out into N rows and SUM() then counts that
// booking's revenue N times — a 2-guest ₱1,899 stay was being reported as
// ₱3,798. COUNT(DISTINCT ...) survived the fan-out, which is why the booking
// count looked right while the money did not. The booker's email comes from a
// subquery instead, which cannot multiply rows.
const summaryStatsQuery = (where: string) => `
  SELECT
    COALESCE(SUM(CASE
      WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
      WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
      ELSE 0
    END), 0) as total_revenue,
    -- Gross revenue: the full booked value of every booking in this window,
    -- regardless of whether any payment has actually been collected yet -
    -- a pending-payment booking counts here even at zero received.
    -- total_revenue above is the collected-cash figure; this is the pipeline
    -- figure. Both share the same booking-status filter passed in via the
    -- where clause, so neither counts a rejected/cancelled booking.
    -- total_amount lives on booking_payments (one row per booking), not on
    -- the booking row itself.
    COALESCE(SUM(bp.total_amount), 0) as total_gross_revenue,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT COALESCE(
      b.user_id::text,
      (SELECT g.email FROM booking_guests g
        WHERE g.booking_id = b.id ORDER BY g.guest_index, g.id LIMIT 1)
    )) as new_guests
  FROM ${BOOKING_TABLE} b
  LEFT JOIN booking_payments bp ON b.id = bp.booking_id
  ${where}
`;

// The window each summary card covers, keyed on the STAY (check-in), not on
// when the booking was made. The revenue chart has always grouped by
// check_in_date and occupancy counts nights actually occurring in the window,
// so keying the cards on created_at made the three disagree: a booking placed
// in August for a November stay showed November as 0 bookings / no revenue
// while the chart and occupancy both reported it. Every panel now answers the
// same question — what happened during this span.
const currentWindow = (period: string) => `
  WHERE b.check_in_date >= NOW() - INTERVAL '${period} days'
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;
const previousWindow = (period: string) => `
  WHERE b.check_in_date >= NOW() - INTERVAL '${parseInt(period) * 2} days'
    AND b.check_in_date < NOW() - INTERVAL '${period} days'
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;

// Calendar-month variants of the same windows. `month` is 'YYYY-MM' and is
// validated by safeMonth before it ever reaches a query string — the INTERVAL
// and date literals here can't be bound as parameters, same constraint that
// forces `period` through safeIntStr.
const safeMonth = (raw: string | null): string | null =>
  raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;

const monthWindow = (month: string) => `
  WHERE b.check_in_date >= '${month}-01'::date
    AND b.check_in_date < ('${month}-01'::date + INTERVAL '1 month')
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;
const previousMonthWindow = (month: string) => `
  WHERE b.check_in_date >= ('${month}-01'::date - INTERVAL '1 month')
    AND b.check_in_date < '${month}-01'::date
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;

/**
 * The date range occupancy is measured over, as SQL expressions.
 * `offset` steps whole windows backwards (1 = the preceding month/period) for
 * the period-on-period comparison.
 */
const occupancyRange = (month: string | null, period: string, offset = 0) => {
  if (month) {
    const anchor = `('${month}-01'::date - INTERVAL '${offset} month')`;
    return { start: `${anchor}::date`, end: `(${anchor} + INTERVAL '1 month')::date` };
  }
  const days = parseInt(period);
  return {
    start: `(NOW() - INTERVAL '${days * (offset + 1)} days')::date`,
    end: `(NOW() - INTERVAL '${days * offset} days')::date`,
  };
};

/**
 * Booked nights that actually fall INSIDE the window, not every night of every
 * booking created during it. Clipping each stay to the range is what keeps the
 * rate at or below 100%: a booking made yesterday for a 40-night stay used to
 * contribute all 40 nights against a 30-day denominator.
 */
const occupancyQueryFor = (start: string, end: string) => `
  SELECT
    COALESCE(SUM(
      GREATEST(0, LEAST(b.check_out_date::date, ${end}) - GREATEST(b.check_in_date::date, ${start}))
    ), 0) AS booked_days,
    (${end} - ${start}) AS window_days
  FROM ${BOOKING_TABLE} b
  WHERE b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
    AND b.check_in_date IS NOT NULL
    AND b.check_out_date IS NOT NULL
    AND b.check_in_date::date < ${end}
    AND b.check_out_date::date > ${start}
`;

// Rooms come from the havens table, not from whichever rooms happen to appear
// in the window's bookings — that older approach made the denominator shrink
// exactly when bookings were sparse, inflating the rate.
const ROOM_COUNT_QUERY = `SELECT COUNT(*)::int AS total_rooms FROM havens`;

export interface AnalyticsSummary {
  total_revenue: number;
  total_gross_revenue: number;
  total_bookings: number;
  occupancy_rate: number;
  new_guests: number;
  revenue_change: number;
  gross_revenue_change: number;
  bookings_change: number;
  occupancy_change: number;
  guests_change: number;
}

export interface RevenueByRoom {
  room_name: string;
  revenue: number;
  bookings: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  // Gross: full booked value of every booking that month, before any payment
  // is collected. revenue (above) stays the collected-cash figure.
  gross_revenue: number;
}

// Helper function for direct data fetching (non-API)
export async function fetchMonthlyRevenue(months: string = '6'): Promise<MonthlyRevenue[]> {
  months = safeIntStr(months, 6, 120);
  const query = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', b.check_in_date::date), 'YYYY-MM') as month,
      COALESCE(SUM(CASE
        WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
        WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
        ELSE 0
      END), 0) as revenue,
      COALESCE(SUM(bp.total_amount), 0) as gross_revenue
    FROM ${BOOKING_TABLE} b
    LEFT JOIN booking_payments bp ON b.id = bp.booking_id
    WHERE b.check_in_date >= NOW() - INTERVAL '${months} months'
      AND b.status IN ('approved', 'on-going', 'confirmed', 'checked-in', 'completed')
      AND bp.payment_status IN ('approved_down_payment', 'approved_full_payment')
    GROUP BY DATE_TRUNC('month', b.check_in_date::date)
    ORDER BY DATE_TRUNC('month', b.check_in_date::date) ASC
  `;

  const result = await pool.query(query);

  return result.rows.map((row: any) => ({
    month: row.month,
    revenue: parseFloat(row.revenue),
    gross_revenue: parseFloat(row.gross_revenue),
  }));
}

// GET Analytics Summary Stats
export const getAnalyticsSummary = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const period = safeIntStr(searchParams.get('period'), 30); // days
    // ?month=YYYY-MM pins every figure to that calendar month instead of the
    // rolling `period` window. Anything malformed falls back to the window.
    const month = safeMonth(searchParams.get('month'));

    const currentStatsQuery = summaryStatsQuery(
      month ? monthWindow(month) : currentWindow(period));
    const previousStatsQuery = summaryStatsQuery(
      month ? previousMonthWindow(month) : previousWindow(period));

    const cur = occupancyRange(month, period, 0);
    const prev = occupancyRange(month, period, 1);

    const [currentStats, previousStats, occupancyStats, previousOccupancy, roomStats] =
      await Promise.all([
        pool.query(currentStatsQuery),
        pool.query(previousStatsQuery),
        pool.query(occupancyQueryFor(cur.start, cur.end)),
        pool.query(occupancyQueryFor(prev.start, prev.end)),
        pool.query(ROOM_COUNT_QUERY),
      ]);

    const current = currentStats.rows[0];
    const previous = previousStats.rows[0];
    const occupancy = occupancyStats.rows[0];

    // Calculate percentage changes
    const revenue_change = previous.total_revenue > 0
      ? ((current.total_revenue - previous.total_revenue) / previous.total_revenue) * 100
      : 0;

    const gross_revenue_change = previous.total_gross_revenue > 0
      ? ((current.total_gross_revenue - previous.total_gross_revenue) / previous.total_gross_revenue) * 100
      : 0;

    const bookings_change = previous.total_bookings > 0
      ? ((current.total_bookings - previous.total_bookings) / previous.total_bookings) * 100
      : 0;

    const guests_change = previous.new_guests > 0
      ? ((current.new_guests - previous.new_guests) / previous.new_guests) * 100
      : 0;

    // Occupancy = nights sold / nights available, both scoped to the window.
    // Each window carries its own length, so a 28-day February is not measured
    // against a 31-day denominator.
    const total_rooms = Math.max(1, parseInt(roomStats.rows[0]?.total_rooms) || 1);
    const rateFor = (row: { booked_days: string; window_days: string } | undefined) => {
      const available = total_rooms * (parseInt(row?.window_days ?? '0') || 0);
      if (available <= 0) return 0;
      return Math.min(100, ((parseInt(row?.booked_days ?? '0') || 0) / available) * 100);
    };

    const occupancy_rate = rateFor(occupancy);
    const prev_occupancy_rate = rateFor(previousOccupancy.rows[0]);

    const occupancy_change = prev_occupancy_rate > 0
      ? ((occupancy_rate - prev_occupancy_rate) / prev_occupancy_rate) * 100
      : 0;

    const summary: AnalyticsSummary = {
      total_revenue: parseFloat(current.total_revenue),
      total_gross_revenue: parseFloat(current.total_gross_revenue),
      total_bookings: parseInt(current.total_bookings),
      occupancy_rate: parseFloat(occupancy_rate.toFixed(1)),
      new_guests: parseInt(current.new_guests),
      revenue_change: parseFloat(revenue_change.toFixed(1)),
      gross_revenue_change: parseFloat(gross_revenue_change.toFixed(1)),
      bookings_change: parseFloat(bookings_change.toFixed(1)),
      occupancy_change: parseFloat(occupancy_change.toFixed(1)),
      guests_change: parseFloat(guests_change.toFixed(1)),
    };

    console.log('✅ Analytics Summary:', summary);

    return NextResponse.json({
      success: true,
      data: summary,
    });

  } catch (error: any) {
    console.log('❌ Error getting analytics summary:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get analytics summary',
    }, { status: 500 });
  }
};

// GET Revenue by Room/Haven
export const getRevenueByRoom = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const period = safeIntStr(searchParams.get('period'), 30); // days
    const month = safeMonth(searchParams.get('month'));

    // Shares the summary's window helpers so both cards and this table always
    // describe the same span.
    const where = month ? monthWindow(month) : currentWindow(period);

    const query = `
      SELECT
        b.room_name,
        COALESCE(SUM(CASE
          WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
          WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
          ELSE 0
        END), 0) as revenue,
        COUNT(DISTINCT b.id) as bookings
      FROM ${BOOKING_TABLE} b
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      ${where}
        AND b.room_name IS NOT NULL
      GROUP BY b.room_name
      ORDER BY revenue DESC
    `;

    const result = await pool.query(query);

    const revenueByRoom: RevenueByRoom[] = result.rows.map((row: any) => ({
      room_name: row.room_name,
      revenue: parseFloat(row.revenue),
      bookings: parseInt(row.bookings),
    }));

    console.log(`✅ Retrieved revenue by room: ${revenueByRoom.length} rooms`);

    return NextResponse.json({
      success: true,
      data: revenueByRoom,
    });

  } catch (error: any) {
    console.log('❌ Error getting revenue by room:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get revenue by room',
    }, { status: 500 });
  }
};

// GET Monthly Revenue Trend
export const getMonthlyRevenue = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const months = safeIntStr(searchParams.get('months'), 6, 120); // number of months

    const query = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', b.check_in_date::date), 'YYYY-MM') as month,
        COALESCE(SUM(CASE
          WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
          WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
          ELSE 0
        END), 0) as revenue,
        COALESCE(SUM(bp.total_amount), 0) as gross_revenue
      FROM ${BOOKING_TABLE} b
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      WHERE b.check_in_date >= NOW() - INTERVAL '${months} months'
        AND b.status IN ('approved', 'on-going', 'confirmed', 'checked-in', 'completed')
        AND bp.payment_status IN ('approved_down_payment', 'approved_full_payment')
      GROUP BY DATE_TRUNC('month', b.check_in_date::date)
      ORDER BY DATE_TRUNC('month', b.check_in_date::date) ASC
    `;

    const result = await pool.query(query);

    const monthlyRevenue: MonthlyRevenue[] = result.rows.map((row: any) => ({
      month: row.month,
      revenue: parseFloat(row.revenue),
      gross_revenue: parseFloat(row.gross_revenue),
    }));

    console.log(`✅ Retrieved monthly revenue: ${monthlyRevenue.length} months`);

    return NextResponse.json({
      success: true,
      data: monthlyRevenue,
    });

  } catch (error: any) {
    console.log('❌ Error getting monthly revenue:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get monthly revenue',
    }, { status: 500 });
  }
};
