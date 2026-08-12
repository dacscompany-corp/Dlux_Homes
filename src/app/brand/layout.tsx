import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brand mark — D'Lux Homes",
  description: "The D'Lux Homes logo system: layouts, accents, states and clear-space rules.",
  // Internal reference sheet, not a page we want indexed alongside the listing.
  robots: { index: false, follow: false },
};

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return children;
}
