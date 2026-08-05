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
  experimental: {
    serverActions: {
      // Server Actions cap request bodies at 1MB by default, which silently
      // 500s any photo upload that goes through an action (promotions) — the
      // framework rejects the request before our own handler or its error
      // handling ever runs. Both the client (validateImageFile) and the server
      // (imageGuard) allow images up to MAX_IMAGE_MB = 10, so the transport
      // limit has to clear that with room for the other form fields.
      bodySizeLimit: "12mb",
    },
  },
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
