import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Gate the admin dashboards. /admin/login is excluded by the matcher below.
//   - Unauthenticated  → redirected to /admin/login (handled by withAuth).
//   - Wrong role       → bounced to their own dashboard.
// Owner can view every dashboard; CSR/Cleaner are limited to their own.
const roleHome: Record<string, string> = {
  Owner: "/admin/owners",
  CSR: "/admin/csr",
  Cleaner: "/admin/cleaners",
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = (req.nextauth.token as { role?: string } | null)?.role;
    const home = (role && roleHome[role]) || "/admin/login";

    const denied =
      (pathname.startsWith("/admin/owners") && role !== "Owner") ||
      (pathname.startsWith("/admin/csr") && !["Owner", "CSR"].includes(role || "")) ||
      (pathname.startsWith("/admin/cleaners") && !["Owner", "Cleaner"].includes(role || ""));

    if (denied) {
      return NextResponse.redirect(new URL(home, req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // Any valid session may pass the gate; role checks happen above.
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/admin/login" },
  }
);

// Protect everything under /admin EXCEPT /admin/login (negative lookahead).
export const config = {
  matcher: ["/admin/((?!login).*)"],
};
