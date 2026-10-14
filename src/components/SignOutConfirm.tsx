"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { signOut } from "next-auth/react";

// App-wide "are you sure?" step before signing out. Call confirmSignOut() from
// any sign-out button; <SignOutConfirmHost /> (mounted once in Providers) shows
// the dialog. Programmatic sign-outs (inactivity timeout, login role checks,
// deactivated accounts) call signOut() directly and skip this.

type Listener = (callbackUrl: string) => void;
let listener: Listener | null = null;

export function confirmSignOut(callbackUrl: string) {
  if (listener) listener(callbackUrl);
  else signOut({ callbackUrl });
}

export function SignOutConfirmHost() {
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    listener = (url) => { setPending(false); setCallbackUrl(url); };
    return () => { listener = null; };
  }, []);

  const close = () => { if (!pending) setCallbackUrl(null); };
  const confirm = () => {
    if (!callbackUrl) return;
    setPending(true);
    signOut({ callbackUrl });
  };

  return (
    <DialogPrimitive.Root open={callbackUrl !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          style={{ position: "fixed", inset: 0, zIndex: 999990, background: "rgba(28,20,14,.45)", backdropFilter: "blur(2px)" }}
        />
        <DialogPrimitive.Popup
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 999991,
            width: "calc(100% - 32px)", maxWidth: 380, background: "#FAF7F1", color: "#2C1F14",
            borderRadius: 14, padding: "24px 22px 18px", boxShadow: "0 24px 60px rgba(28,20,14,.28)", outline: "none",
          }}
        >
          <DialogPrimitive.Title style={{ margin: 0, fontSize: 19, fontWeight: 600, fontFamily: "var(--font-fraunces), serif" }}>
            Sign out?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description style={{ margin: "8px 0 22px", fontSize: 14, lineHeight: 1.5, color: "#6b5a4c" }}>
            Are you sure you want to sign out of your account?
          </DialogPrimitive.Description>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button" onClick={close} disabled={pending}
              style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #ddd2c2", background: "transparent", color: "#2C1F14", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
            <button
              type="button" onClick={confirm} disabled={pending} autoFocus
              style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "none", background: "#A8492F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1, fontFamily: "inherit" }}
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
