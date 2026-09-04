// /privacy — the published Privacy Policy.
//
// Required before the Meta app can leave Development mode: App settings → Basic
// will not save a Live app without a reachable Privacy Policy URL, and App
// Review checks that the page actually describes what the app collects.
//
// Everything below is written from what the code REALLY stores — the
// booking_guests columns, the messenger_context row, the Cloudinary uploads —
// not from a template. If those change, change this too; a policy that
// understates what you hold is worse than no policy.

import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section, P, Bullets, Callout } from "./LegalPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy · D'Lux Homes",
  description:
    "What personal data D'Lux Homes collects when you book or message us, why we collect it, who we share it with, and how to have it deleted.",
};

const EMAIL = "homesdlux@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="4 September 2026"
      intro="D'Lux Homes is a single serviced unit at Tower 4, Grass Residences, Quezon City. This policy explains what we collect when you book a stay or message us on Facebook, why we need it, and what control you have over it."
    >
      <Section title="Who we are">
        <P>
          D&rsquo;Lux Homes (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the booking website at
          dlux-homes.vercel.app and the D&rsquo; Lux Homes Facebook Page. We are the personal
          information controller for the data described here.
        </P>
        <P>
          Questions, corrections or complaints: <a href={`mailto:${EMAIL}`} style={{ color: "#1F160E" }}>{EMAIL}</a>.
        </P>
      </Section>

      <Section title="What we collect">
        <P>
          <strong>When you book.</strong> To confirm a reservation and meet the building&rsquo;s
          entry rules we collect:
        </P>
        <Bullets
          items={[
            "Your name, email address and mobile number",
            "Your age, birthdate and gender, and whether you are claiming the senior citizen or PWD discount",
            "A photo of a valid government ID for each registered guest",
            "Your Facebook profile link, when you give it",
            "Your stay dates, stay type, and number of guests",
            "Your payment method, amounts paid, and the payment receipt you upload",
          ]}
        />
        <P>
          We do <strong>not</strong> collect or store card numbers. Payment is made directly through
          GCash or BPI transfer, and we only ever see the receipt you send us.
        </P>

        <P>
          <strong>When you message our Facebook Page.</strong> Our Messenger assistant answers
          questions about availability and rates. To do that it stores, for a short time:
        </P>
        <Bullets
          items={[
            "Your page-scoped ID — an identifier Facebook gives us that is unique to our Page and cannot be used to identify you anywhere else",
            "The details it understood from your question: a date, a number of guests, a stay type",
          ]}
        />
        <Callout>
          The assistant does <strong>not</strong> store the text of your messages, your name, or your
          contact details. It keeps only the parsed enquiry, so it can answer a follow-up like
          &ldquo;4 pax po kami&rdquo; without asking you to repeat the date. That record goes stale
          after 30 minutes and a later message is treated as a fresh enquiry.
        </Callout>

        <P>
          <strong>When you create an account.</strong> Your email address and a securely hashed
          password, or — if you sign in with Google or Facebook — the name and email address that
          provider returns to us. We never receive your password for those services.
        </P>

        <P>
          <strong>Automatically.</strong> A session cookie to keep you signed in, and administrative
          audit logs recording actions taken in the admin area.
        </P>
      </Section>

      <Section title="Why we collect it">
        <Bullets
          items={[
            "To create, confirm and manage your booking, and to contact you about it",
            "To verify identity and age, which the building requires for guest entry",
            "To collect the down payment, the balance and the refundable security deposit, and to return that deposit after check-out",
            "To send booking confirmations, check-in instructions and check-out reminders",
            "To answer availability and rate questions you send us on Messenger",
            "To keep accounting records of completed stays",
          ]}
        />
        <P>
          We process this data to perform the booking agreement with you, and — for identity and
          age checks — to comply with the building&rsquo;s rules. We do not sell your data, and we do
          not use it for advertising.
        </P>
      </Section>

      <Section title="Who we share it with">
        <P>We use these service providers, and share only what each one needs:</P>
        <Bullets
          items={[
            <>
              <strong>Supabase</strong> — hosts the database holding your booking record
            </>,
            <>
              <strong>Vercel</strong> — hosts the website and its server functions
            </>,
            <>
              <strong>Cloudinary</strong> — stores the ID and receipt images you upload
            </>,
            <>
              <strong>Meta (Facebook)</strong> — delivers Messenger conversations to and from our Page
            </>,
            <>
              <strong>Google</strong> — calendar sync for our own scheduling, and sign-in if you choose it
            </>,
            <>
              <strong>Our email provider</strong> — delivers booking and check-in emails to you
            </>,
          ]}
        />
        <P>
          We may also give the building administration the names of registered guests where they
          require it for entry. We will disclose data if the law requires it. Otherwise we do not
          share it with anyone.
        </P>
      </Section>

      <Section title="How long we keep it">
        <Bullets
          items={[
            "Booking and payment records: kept for accounting and tax purposes",
            "Valid ID and payment receipt images: kept while your booking is active and for a short period after check-out to resolve any security deposit issue, then deleted",
            "Messenger enquiry data: the parsed enquiry goes stale after 30 minutes; the page-scoped ID is removed on request",
            "Account details: kept until you ask us to close the account",
          ]}
        />
      </Section>

      <Section title="Your rights">
        <P>
          Under the Philippine Data Privacy Act of 2012 (Republic Act 10173) you have the right to
          be informed, to access your data, to correct it, to object to processing, to have it
          erased or blocked, to data portability, and to be indemnified for damages. You may also
          complain to the National Privacy Commission.
        </P>
        <P>
          To exercise any of these, email{" "}
          <a href={`mailto:${EMAIL}`} style={{ color: "#1F160E" }}>{EMAIL}</a>. To delete your data,
          see{" "}
          <Link href="/data-deletion" style={{ color: "#1F160E" }}>
            Data Deletion
          </Link>
          .
        </P>
      </Section>

      <Section title="Security">
        <P>
          Data is transmitted over HTTPS and stored on managed services with access restricted to
          the owner and authorised staff. Passwords are stored hashed, never in readable form.
          No system is perfectly secure, but we limit what we collect precisely so there is less
          to lose.
        </P>
      </Section>

      <Section title="Children">
        <P>
          Bookings may only be made by guests aged 18 and over. Minors are welcome as guests when
          accompanied by a booking adult, and we collect a minor&rsquo;s details only as part of that
          adult&rsquo;s reservation.
        </P>
      </Section>

      <Section title="Changes to this policy">
        <P>
          If we change what we collect or why, we will update this page and the date at the top. The
          version published here is always the one that applies.
        </P>
      </Section>
    </LegalPage>
  );
}
