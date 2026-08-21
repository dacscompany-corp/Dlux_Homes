// Every transactional email in this app is sent by POSTing from server code to
// one of the /api/send-*-email routes — an HTTP hop back into our own app.
//
// Those calls used to sit in bare `try { ... } catch { console.error(...) }`
// blocks, which meant a booking could be approved, the guest never told, and
// nothing on the admin side would say so: the owner saw the same "Booking
// approved" toast whether the mail flew or died. A broken mail path was
// therefore invisible until a guest complained.
//
// This wrapper keeps the rule that a mail failure must NEVER fail the booking
// (the money and the status change have already happened), but it records why
// the send failed and hands that back so the API response can carry a real
// send status instead of silence.

export type EmailDispatchResult = {
  /** Human label for the email, e.g. "confirmation" — surfaced to the admin. */
  kind: string;
  ok: boolean;
  /** Only set when ok === false. Safe to show staff; no credentials in it. */
  detail?: string;
};

// The self-call target. A wrong or missing NEXTAUTH_URL is the single most
// common way this whole chain dies in production, so it is named in every
// failure detail below rather than left to be guessed at.
const baseUrl = () => process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function dispatchTransactionalEmail(
  kind: string,
  route: string,
  payload: unknown,
): Promise<EmailDispatchResult> {
  const url = `${baseUrl()}${route}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ ${kind} email sent`);
      return { kind, ok: true };
    }

    // A non-2xx is usually one of three things and the body tells them apart:
    // the route's own {error} JSON, an auth wall (Vercel Deployment Protection
    // answers the cookie-less self-call with an HTML login page), or a 404
    // because NEXTAUTH_URL points somewhere without this route. A bare status
    // code can't distinguish those, so keep a slice of the body too.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const detail = `HTTP ${res.status} from ${url}${body ? ` — ${body}` : ""}`;
    console.error(`❌ ${kind} email failed: ${detail}`);
    return { kind, ok: false, detail };
  } catch (err) {
    // fetch itself threw — the request never reached a server. Almost always
    // DNS or a refused connection from NEXTAUTH_URL naming a host this process
    // cannot reach (e.g. still "http://localhost:3000" in a deployed build).
    const cause = (err as { cause?: { code?: string } })?.cause?.code;
    const message = err instanceof Error ? err.message : String(err);
    const detail = `${cause ? `${cause}: ` : ""}${message} (target ${url})`;
    console.error(`❌ ${kind} email failed: ${detail}`);
    return { kind, ok: false, detail };
  }
}
