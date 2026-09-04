// /data-deletion — user data deletion instructions.
//
// Meta requires every app that handles user data to publish either a deletion
// CALLBACK endpoint or a deletion INSTRUCTIONS URL. This is the instructions
// route: it is what you paste into App settings → Basic → Data Deletion, and it
// is simpler and less brittle than a signed-request callback for a business
// this size — there is one owner, and requests arrive at a human either way.
//
// If Meta ever insists on the callback instead, it is a POST endpoint that
// verifies a signed_request with the app secret and returns a confirmation URL
// plus a tracking code. Build it then, not before.

import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section, P, Bullets, Callout } from "../privacy/LegalPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Data Deletion · D'Lux Homes",
  description:
    "How to ask D'Lux Homes to delete the personal data held about you, what gets removed, and how long it takes.",
};

const EMAIL = "homesdlux@gmail.com";

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion"
      updated="4 September 2026"
      intro="You can ask us to delete the personal data we hold about you at any time, whether you booked a stay or only messaged us on Facebook. Here is exactly how, and what happens next."
    >
      <Section title="How to request deletion">
        <P>Send us a request by either route:</P>
        <Bullets
          items={[
            <span key="email">
              Email <a href={`mailto:${EMAIL}?subject=Data%20deletion%20request`} style={{ color: "#1F160E" }}>{EMAIL}</a>{" "}
              with the subject &ldquo;Data deletion request&rdquo;
            </span>,
            <span key="messenger">
              Or message the <strong>D&rsquo; Lux Homes</strong> Facebook Page and say you want your
              data deleted
            </span>,
          ]}
        />
        <P>So we can find the right records, please include:</P>
        <Bullets
          items={[
            "The name and email address you booked with",
            "Your booking ID if you have one — it looks like DL-BK1762050261 and is in your confirmation email",
            "If you only ever messaged us on Facebook, just say so — we will match you by the conversation",
          ]}
        />
      </Section>

      <Section title="What we delete">
        <Bullets
          items={[
            "Your name, email address, mobile number and Facebook link",
            "Your age, birthdate, gender and any senior citizen or PWD flag",
            "Your uploaded valid ID images and payment receipt images",
            "Your website account, if you created one",
            "Your Messenger page-scoped ID and any stored enquiry details",
          ]}
        />
      </Section>

      <Section title="What we may have to keep">
        <P>
          Philippine tax and accounting rules require us to retain records of completed
          transactions. Where that applies we keep the minimum — the dates of the stay and the
          amounts paid — and remove or anonymise the personal details attached to them, so the
          record can no longer identify you.
        </P>
        <Callout>
          If you have an <strong>upcoming or in-progress booking</strong>, we cannot delete the
          details we need to host you: the building requires registered guest names and IDs for
          entry. Tell us and we will either cancel the booking first under the{" "}
          <Link href="/terms" style={{ color: "#1F160E" }}>
            Terms &amp; Conditions
          </Link>{" "}
          or schedule the deletion for after check-out.
        </Callout>
      </Section>

      <Section title="How long it takes">
        <P>
          We action requests within <strong>30 days</strong> and email you to confirm when it is
          done. Most are handled far sooner. If we cannot delete something, we will tell you which
          item and why.
        </P>
      </Section>

      <Section title="Removing our Facebook app">
        <P>
          If you connected through Facebook, you can also cut our access from your own account:
          open <strong>Facebook → Settings &amp; Privacy → Settings → Apps and Websites</strong>,
          find <strong>D&rsquo;Lux Homes</strong>, and remove it. That stops any further sharing from
          Facebook to us. It does not by itself erase what we already hold, so send the request
          above as well if you want that removed too.
        </P>
      </Section>

      <Section title="Questions">
        <P>
          Email <a href={`mailto:${EMAIL}`} style={{ color: "#1F160E" }}>{EMAIL}</a>. What we collect
          and why is set out in our{" "}
          <Link href="/privacy" style={{ color: "#1F160E" }}>
            Privacy Policy
          </Link>
          .
        </P>
      </Section>
    </LegalPage>
  );
}
