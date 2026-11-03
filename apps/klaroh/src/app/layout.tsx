import type { Metadata } from "next";
import { Geist, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { LANDING_DESCRIPTION, LANDING_SOCIAL_DESCRIPTION, LANDING_TITLE } from "@/components/landing/seo";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// Landing page only (see .lp-* in globals.css): display and body type of the public site.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

// Page titles only (see .type-page-title in globals.css). Inter handles everything else.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: LANDING_TITLE, template: "%s · Klaroh" },
  description: LANDING_DESCRIPTION,
  openGraph: {
    title: LANDING_TITLE,
    description: LANDING_SOCIAL_DESCRIPTION,
    type: "website",
    siteName: "Klaroh",
  },
  // The share image comes from opengraph-image.tsx in this folder.
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_SOCIAL_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${geist.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-on-surface">
        {children}
      </body>
    </html>
  );
}


