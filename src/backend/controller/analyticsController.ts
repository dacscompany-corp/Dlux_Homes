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

// The window each summary card covers: bookings CREATED in the last `period`
// days, and the equal-length window before it for the % change.
const currentWindow = (period: string) => `
  WHERE b.created_at >= NOW() - INTERVAL '${period} days'
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;
const previousWindow = (period: string) => `
  WHERE b.created_at >= NOW() - INTERVAL '${parseInt(period) * 2} days'
    AND b.created_at < NOW() - INTERVAL '${period} days'
    AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
`;

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
export async function fetchAnalyticsSummary(period: string = '30'): Promise<AnalyticsSummary> {
  period = safeIntStr(period, 30);
  const currentStatsQuery = summaryStatsQuery(currentWindow(period));
  const previousStatsQuery = summaryStatsQuery(previousWindow(period));

  const occupancyQuery = `
    SELECT
      COUNT(DISTINCT room_name) as total_rooms,
      COALESCE(SUM(CASE
        WHEN check_out_date IS NOT NULL AND check_in_date IS NOT NULL
        THEN check_out_date::date - check_in_date::date
        ELSE 0
      END), 0) as booked_days
    FROM ${BOOKING_TABLE}
    WHERE created_at >= NOW() - INTERVAL '${period} days'
      AND status IN ('approved', 'confirmed', 'checked-in', 'completed')
  `;

  const previousOccupancyQuery = `
    SELECT
      COALESCE(SUM(CASE
        WHEN check_out_date IS NOT NULL AND check_in_date IS NOT NULL
        THEN check_out_date::date - check_in_date::date
        ELSE 0
      END), 0) as booked_days
    FROM ${BOOKING_TABLE}
    WHERE created_at >= NOW() - INTERVAL '${parseInt(period) * 2} days'
      AND created_at < NOW() - INTERVAL '${period} days'
      AND status IN ('approved', 'confirmed', 'checked-in', 'completed')
  `;

  const [currentStats, previousStats, occupancyStats, previousOccupancy] = await Promise.all([
    pool.query(currentStatsQuery),
    pool.query(previousStatsQuery),
    pool.query(occupancyQuery),
    pool.query(previousOccupancyQuery)
  ]);

  const current = currentStats.rows[0];
  const previous = previousStats.rows[0];
  const occupancy = occupancyStats.rows[0];

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

  const total_rooms = parseInt(occupancy.total_rooms) || 4;
  const total_available_days = total_rooms * parseInt(period);
  const booked_days = parseInt(occupancy.booked_days) || 0;
  const occupancy_rate = total_available_days > 0
    ? (booked_days / total_available_days) * 100
    : 0;

  const prev_booked_days = parseInt(previousOccupancy.rows[0].booked_days) || 0;
  const prev_occupancy_rate = total_available_days > 0
    ? (prev_booked_days / total_available_days) * 100
    : 0;

  const occupancy_change = prev_occupancy_rate > 0
    ? ((occupancy_rate - prev_occupancy_rate) / prev_occupancy_rate) * 100
    : 0;

  return {
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
}

export async function fetchRevenueByRoom(period: string = '30'): Promise<RevenueByRoom[]> {
  period = safeIntStr(period, 30);
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
    WHERE b.created_at >= NOW() - INTERVAL '${period} days'
      AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
      AND b.room_name IS NOT NULL
    GROUP BY b.room_name
    ORDER BY revenue DESC
  `;

  const result = await pool.query(query);

  return result.rows.map((row: any) => ({
    room_name: row.room_name,
    revenue: parseFloat(row.revenue),
    bookings: parseInt(row.bookings),
  }));
}

export async function fetchMonthlyRevenue(months: string = '6'): Promise<MonthlyRevenue[]> {
  months = safeIntStr(months, 6, 120);
  const query = `
    SELECT
      TO_CHAR(b.created_at, 'Mon') as month,
      EXTRACT(MONTH FROM b.created_at) as month_num,
      COALESCE(SUM(CASE
        WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
        WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
        ELSE 0
      END), 0) as revenue,
      COALESCE(SUM(bp.total_amount), 0) as gross_revenue
    FROM ${BOOKING_TABLE} b
    LEFT JOIN booking_payments bp ON b.id = bp.booking_id
    WHERE b.created_at >= NOW() - INTERVAL '${months} months'
      AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
    GROUP BY month, month_num
    ORDER BY month_num ASC
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

    // Get current period stats
    const currentStatsQuery = summaryStatsQuery(currentWindow(period));

    // Get previous period stats for comparison
    const previousStatsQuery = summaryStatsQuery(previousWindow(period));

    // Get occupancy rate - calculate based on booked days vs total available days
    const occupancyQuery = `
      SELECT
        COUNT(DISTINCT room_name) as total_rooms,
        COUNT(*) as total_bookings,
        COALESCE(SUM(CASE
          WHEN check_out_date IS NOT NULL AND check_in_date IS NOT NULL
          THEN check_out_date::date - check_in_date::date
          ELSE 0
        END), 0) as booked_days
      FROM ${BOOKING_TABLE}
      WHERE created_at >= NOW() - INTERVAL '${period} days'
        AND status IN ('approved', 'confirmed', 'checked-in', 'completed')
    `;

    const [currentStats, previousStats, occupancyStats] = await Promise.all([
      pool.query(currentStatsQuery),
      pool.query(previousStatsQuery),
      pool.query(occupancyQuery)
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

    // Calculate occupancy rate
    // Total available room-days = total_rooms * period days
    const total_rooms = parseInt(occupancy.total_rooms) || 4; // Default to 4 rooms if no data
    const total_available_days = total_rooms * parseInt(period);
    const booked_days = parseInt(occupancy.booked_days) || 0;
    const occupancy_rate = total_available_days > 0
      ? (booked_days / total_available_days) * 100
      : 0;

    // For occupancy change, compare with previous period
    const previousOccupancyQuery = `
      SELECT
        COALESCE(SUM(CASE
          WHEN check_out_date IS NOT NULL AND check_in_date IS NOT NULL
          THEN check_out_date::date - check_in_date::date
          ELSE 0
        END), 0) as booked_days
      FROM ${BOOKING_TABLE}
      WHERE created_at >= NOW() - INTERVAL '${parseInt(period) * 2} days'
        AND created_at < NOW() - INTERVAL '${period} days'
        AND status IN ('approved', 'confirmed', 'checked-in', 'completed')
    `;

    const previousOccupancy = await pool.query(previousOccupancyQuery);
    const prev_booked_days = parseInt(previousOccupancy.rows[0].booked_days) || 0;
    const prev_occupancy_rate = total_available_days > 0
      ? (prev_booked_days / total_available_days) * 100
      : 0;

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
      WHERE b.created_at >= NOW() - INTERVAL '${period} days'
        AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
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
        TO_CHAR(b.created_at, 'Mon') as month,
        EXTRACT(MONTH FROM b.created_at) as month_num,
        COALESCE(SUM(CASE
          WHEN bp.payment_status = 'approved_down_payment' THEN bp.down_payment
          WHEN bp.payment_status = 'approved_full_payment' THEN bp.total_amount
          ELSE 0
        END), 0) as revenue,
        COALESCE(SUM(bp.total_amount), 0) as gross_revenue
      FROM ${BOOKING_TABLE} b
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      WHERE b.created_at >= NOW() - INTERVAL '${months} months'
        AND b.status IN ('approved', 'confirmed', 'checked-in', 'completed')
      GROUP BY month, month_num
      ORDER BY month_num ASC
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
