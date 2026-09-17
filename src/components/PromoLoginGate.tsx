"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shown wherever a guest tries to actually CLAIM a promo (copy a code, apply
// one at checkout, etc.) rather than just look at it — promos stay visible to
// everyone, but redeeming one is account-bound (see validateDiscount.ts /
// bookingController.ts, which enforce this server-side too; this dialog is
// only the friendly version of that same rule).
export default function PromoLoginGate({
  open,
  onOpenChange,
  callbackUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Same-origin path to return to after sign-in, e.g. the room/checkout URL with its ?promo= intact. */
  callbackUrl: string;
}) {
  const qs = `?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in to claim this promo</DialogTitle>
          <DialogDescription>
            Please log in or create an account to claim this promo. It'll be waiting for you right here once you're signed in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Link
            href={`/register${qs}`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
          >
            Create account
          </Link>
          <Link
            href={`/login${qs}`}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Log in
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
