import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Ticker, type TickerItem } from "@/components/Ticker";
import { getTickerGames, getLastUpdated, LEAGUE_LABEL } from "@/lib/queries";

export const revalidate = 60;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const SITE_NAME = "ScoreDB";

export const metadata: Metadata = {
  title: {
    default: "ScoreDB — Live scores, standings and stats for football, NFL, NBA, cricket, tennis and F1",
    template: "%s | ScoreDB",
  },
  description:
    "Live scores, standings, schedules and player stats for the Premier League, La Liga, NFL, NBA, IPL, ATP, WTA and F1 — with ten years of history.",
};

function tickerLabel(g: Awaited<ReturnType<typeof getTickerGames>>[number]): TickerItem {
  const league = LEAGUE_LABEL[g.league];
  if (g.completed) {
    const homeWon = g.home_winner ?? (g.home_score ?? 0) > (g.away_score ?? 0);
    const winner = homeWon ? g.home_name : g.away_name;
    const loser = homeWon ? g.away_name : g.home_name;
    const winScore = homeWon ? g.home_score_display ?? g.home_score : g.away_score_display ?? g.away_score;
    const loseScore = homeWon ? g.away_score_display ?? g.away_score : g.home_score_display ?? g.home_score;
    return {
      href: `/${g.league}/teams/${homeWon ? g.home_slug : g.away_slug}`,
      label: `${league} · ${winner} beat ${loser} ${winScore}-${loseScore}`,
    };
  }
  const date = new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    href: `/${g.league}/teams/${g.home_slug}`,
    label: `${league} · ${g.away_name} at ${g.home_name} — ${date}`,
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
        <Nav />
        <Ticker items={tickerItems} updatedAt={lastUpdated} />
        <main id="main" className="container-x flex-1 pb-12 pt-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
