import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import MessengerChat from "@/components/MessengerChat";
import SplashScreen from "@/components/SplashScreen";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Wordmark-only face, used by the D'Lux brand mark (see components/brand/DluxMark).
// Fraunces stays the general-purpose serif; Instrument Serif is narrower and sits
// on the logo lockup alone, which is why it ships as its own variable.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "D'Lux Homes",
  description: "Book your perfect stay at D'Lux Homes",
};

// Ensure the mobile viewport meta is present so responsive breakpoints apply.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ backgroundColor: "var(--bg)", color: "var(--ink)" }}>
        <SplashScreen />
        <Providers>{children}</Providers>
        <MessengerChat />
      </body>
    </html>
  );
}
