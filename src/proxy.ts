import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Gate the admin dashboards. /admin/login is excluded by the matcher below.
//   - Unauthenticated  → redirected to /admin/login (handled by withAuth).
//   - Wrong role       → bounced to their own dashboard.
//
// Each account works in exactly one portal: the Owner in the Owner portal,
// CSR in the CSR portal, a Cleaner in the cleaner portal. The Owner no longer
// gets into the CSR or cleaner portals — those pages show the signed-in
// account's own work, so an Owner there saw an empty, misleading view.
// Cleaning Operations is shared by Owner and CSR (both manage cleaning).
const roleHome: Record<string, string> = {
  Owner: "/admin/owners",
  CSR: "/admin/csr",
  Cleaner: "/admin/cleaners",
};

const PORTAL_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin/owners", roles: ["Owner"] },
  { prefix: "/admin/csr", roles: ["CSR"] },
  { prefix: "/admin/cleaners", roles: ["Cleaner"] },
  { prefix: "/admin/cleaning-operations", roles: ["Owner", "CSR"] },
  // Printable sheet with the Wi-Fi password — the page itself also requires Owner/CSR.
  { prefix: "/admin/house-rules", roles: ["Owner", "CSR"] },
];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = (req.nextauth.token as { role?: string } | null)?.role ?? "";
    const home = roleHome[role];

    // Not a staff account at all (a guest who signed in on the main site):
    // no admin page is theirs.
    if (!home) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    const portal = PORTAL_ROLES.find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));
    if (portal && !portal.roles.includes(role)) {
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
