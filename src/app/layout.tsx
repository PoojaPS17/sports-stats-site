import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Ticker } from "@/components/Ticker";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/structuredData";

// No `revalidate` here, and no data fetching: a value set on the root layout would cap
// every page on the site at that interval. Each page sets its own.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const SITE_NAME = "SportsDB";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: { siteName: "SportsDB", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  title: {
    default: "SportsDB: Live Scores, Standings and Player Stats",
    template: "%s | SportsDB",
  },
  description:
    "Live scores, standings, schedules and player stats for football, the NFL, NBA, cricket, tennis and F1, with results going back to 2015.",
  // Ownership proof for Google Search Console and Bing Webmaster Tools. Each tool
  // hands out a token when the site is added; set it in Vercel and redeploy.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme-init script below intentionally sets data-theme on this element
      // before React hydrates (reading localStorage to avoid a flash of the wrong
      // theme), so the server-rendered markup and the pre-hydration DOM legitimately
      // differ here — the standard next-themes-style fix is to suppress just this.
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            var t = localStorage.getItem('theme');
            if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
          } catch (e) {}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-[var(--shadow-pop)]"
        >
          Skip to content
        </a>
        <JsonLd data={websiteSchema()} />
        <JsonLd data={organizationSchema()} />
        <Nav />
        <Ticker />
        <main id="main" className="container-x flex-1 pb-12 pt-6">
          {children}
        </main>
        <Footer />
        {/* Loads only once NEXT_PUBLIC_GA_ID is set; asks first where consent is required. */}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
