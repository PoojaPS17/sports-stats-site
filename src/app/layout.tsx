import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
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

export const metadata: Metadata = {
  title: "ScoreDB — Premier League, NFL & NBA scores, standings and stats",
  description: "Live scores, standings and player stats for the Premier League, NFL and NBA, updated daily.",
};

function tickerLabel(g: Awaited<ReturnType<typeof getTickerGames>>[number]): TickerItem {
  const league = LEAGUE_LABEL[g.league];
  if (g.completed) {
    const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
    const winner = homeWon ? g.home_name : g.away_name;
    const loser = homeWon ? g.away_name : g.home_name;
    const winScore = homeWon ? g.home_score : g.away_score;
    const loseScore = homeWon ? g.away_score : g.home_score;
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
        <Ticker items={tickerItems} updatedAt={lastUpdated} />
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-muted)]">
          Data via ESPN. Not affiliated with the Premier League, NFL, NBA, or ESPN.
        </footer>
      </body>
    </html>
  );
}
