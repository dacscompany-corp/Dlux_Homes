// Best-effort in-memory rate limiter for abuse-prone public endpoints (OTP
// request/verify, password reset, email delivery).
//
// CAVEAT: on serverless (Vercel) each running instance has its own memory, so
// this is NOT a globally hard limit — a determined attacker hitting many cold
// instances can exceed it. It still meaningfully slows automated abuse
// (email-bombing, OTP guessing) from a single source at near-zero cost. For a
// strict global limit, back this with Redis/Upstash or a shared DB table.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow without bound.
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }

  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true, retryAfterSec: 0 };
}

// Best-guess client IP from proxy headers (Vercel sets x-forwarded-for).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Standard 429 body for a tripped limit.
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Too many requests. Please wait a moment and try again.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfterSec)),
      },
    },
  );
}
