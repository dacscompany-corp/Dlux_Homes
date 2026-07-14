import type { NextConfig } from "next";

// Baseline security headers applied to every response. These are safe,
// non-breaking hardening defaults (no strict CSP, which would need per-page
// tuning against inline styles / Cloudinary / Google OAuth). They defend against
// clickjacking (frame-ancestors/X-Frame-Options), MIME-sniffing, and referrer
// leakage.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
