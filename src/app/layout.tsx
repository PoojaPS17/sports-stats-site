import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Ticker, type TickerItem } from "@/components/Ticker";
import { getTickerGames, getLastUpdated, LEAGUE_LABEL, isCricketLeague } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/structuredData";

export const revalidate = 60;

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
    "Live scores, standings, schedules and player stats for football, the NFL, NBA, cricket, tennis and F1, with ten years of history.",
  // Ownership proof for Google Search Console and Bing Webmaster Tools. Each tool
  // hands out a token when the site is added; set it in Vercel and redeploy.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

function tickerLabel(g: Awaited<ReturnType<typeof getTickerGames>>[number]): TickerItem {
  const league = LEAGUE_LABEL[g.league];
  if (g.completed) {
    // Cricsheet-sourced cricket rows carry no winner flag; the summary names the winner.
    const summaryWinner = g.status_summary && isCricketLeague(g.league) ? (g.status_summary.startsWith(g.home_name) ? true : g.status_summary.startsWith(g.away_name) ? false : null) : null;
    const homeWon = g.home_winner ?? summaryWinner ?? (g.home_score ?? 0) > (g.away_score ?? 0);
    const winner = teamDisplayName(homeWon ? g.home_name : g.away_name);
    const loser = teamDisplayName(homeWon ? g.away_name : g.home_name);
    const winScore = homeWon ? g.home_score_display ?? g.home_score : g.away_score_display ?? g.away_score;
    const loseScore = homeWon ? g.away_score_display ?? g.away_score : g.home_score_display ?? g.home_score;
    // A cricket result is a margin ("won by 7 wickets"), never a scoreline; a tie or
    // no-result has no winner to name, so the feed's own summary stands.
    const margin = g.status_summary
      ?.match(/\bwon by (.+?)(?: \(.*\))?$/i)?.[1]
      .replace(/\bwkts?\b/i, (w) => (w.toLowerCase() === "wkt" ? "wicket" : "wickets"));
    const noWinner = g.home_winner === false && g.away_winner === false;
    const label = isCricketLeague(g.league)
      ? noWinner || !margin
        ? `${league} · ${teamDisplayName(g.status_summary ?? `${g.home_name} v ${g.away_name}`)}`
        : `${league} · ${winner} beat ${loser} by ${margin}`
      : `${league} · ${winner} beat ${loser} ${winScore}-${loseScore}`;
    return { href: `/${g.league}/games/${g.espn_id}`, label };
  }
  const date = new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    href: `/${g.league}/games/${g.espn_id}`,
    label: `${league} · ${teamDisplayName(g.away_name)} at ${teamDisplayName(g.home_name)}, ${date}`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [tickerGames, lastUpdated] = await Promise.all([getTickerGames(10), getLastUpdated()]);
  const tickerItems = tickerGames.map(tickerLabel);

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
        <Ticker items={tickerItems} updatedAt={lastUpdated} />
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
