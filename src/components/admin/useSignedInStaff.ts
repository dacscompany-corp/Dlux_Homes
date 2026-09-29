"use client";

// The account actually signed in, for the name/email/avatar shown in the
// admin, CSR and cleaner portals. Those used to be fixed demo text
// ("Admin Owner / owner@dluxhomes.com", "CSR Staff", "Cleaner Staff"), so
// every login looked like the same demo account.

import { useSession } from "next-auth/react";

export function useSignedInStaff(fallbackName: string) {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string | null; email?: string | null; role?: string } | undefined;
  const email = user?.email ?? "";
  // While the session loads, show nothing rather than a wrong name.
  const name = user?.name?.trim() || email || (status === "loading" ? "" : fallbackName);
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "·";
  return { name, email, role: user?.role ?? "", initials, loading: status === "loading" };
}
