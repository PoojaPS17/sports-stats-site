import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { BarReveal } from "@/components/motion/BarReveal";
import { Ticker } from "@/components/Ticker";
import { SiteNoticeBar } from "@/components/SiteNoticeBar";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/structuredData";

// No `revalidate` here, and no data fetching: a value set on the root layout would cap
// every page on the site at that interval. Each page sets its own.

// One face for body and headlines: Plus Jakarta Sans, set in sentence case.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const SITE_NAME = "SportsDB";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  // hands out a token when the site is added; set it in the app's environment and rebuild.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

// Runs in <head> before first paint: marks the built page (data-home) and reserves its height (--hb-h, px).
// The block heights and grid arithmetic repeat reserveHeight in lib/homeSetup.ts; tests/built-home-stable-layout.test.ts runs this against it.
const HOME_INIT = `try {
            var h = JSON.parse(localStorage.getItem('sportsdb-home') || 'null');
            var fromLink = /[?&]setup=/.test(location.search);
            if (fromLink || (h && h.v === 1 && Array.isArray(h.blocks) && h.blocks.length)) {
              document.documentElement.dataset.home = 'built';
              var b = (h && h.blocks) || [], w = innerWidth, c = w >= 1280 ? 3 : w >= 768 ? 2 : 1, r = [0], k = 0, g = 0, i, x, t, n, hh, sp;
              b = b.concat({ type: 'add' });
              for (i = 0; i < b.length; i++) {
                x = b[i]; t = x && x.type; sp = t === 'live' && c > 1 ? 2 : 1;
                hh = t === 'add' ? 96 : t === 'live' ? (c > 1 ? 640 : 800) : t === 'team-next' ? (x.params && x.params.league === 'cricket' ? 285 : 440) : t === 'standings' || t === 'series-standings' ? 315 : t === 'player-form' ? 160 : t === 'f1-drivers' ? 270 : t === 'bts' ? 330 : 280;
                if (k + sp > c) { r.push(0); k = 0; }
                r[r.length - 1] = Math.max(r[r.length - 1], hh);
                k += sp;
                if (k >= c) { r.push(0); k = 0; }
              }
              if (!r[r.length - 1]) r.pop();
              for (n = 0; n < r.length; n++) g += r[n];
              document.documentElement.style.setProperty('--hb-h', (g + 16 * (r.length - 1) + (c > 1 ? 350 : 360)) + 'px');
            }
            else if (h && h.v === 1 && h.declined) document.documentElement.dataset.home = 'collapsed';
          } catch (e) {}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      // The theme-init and home-init scripts below intentionally set data-theme and
      // data-home on this element before React hydrates (reading localStorage to avoid
      // a flash of the wrong theme or the wrong hero), so the server-rendered markup and
      // the pre-hydration DOM legitimately differ here — the standard next-themes-style
      // fix is to suppress just this.
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            var t = localStorage.getItem('theme');
            if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
          } catch (e) {}`}
        </Script>
        {/* A plain inline <script>, not next/script: with Next 16 an inline beforeInteractive script is queued (self.__next_s) and runs only once the async runtime chunks load, after the first paint. */}
        <script id="home-init" dangerouslySetInnerHTML={{ __html: HOME_INIT }} />
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
        <SiteNoticeBar />
        <main id="main" className="container-x flex-1 pb-12 pt-6">
          {children}
        </main>
        <Footer />
        <BarReveal />
        {/* Loads only once NEXT_PUBLIC_GA_ID is set; asks first where consent is required. */}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
