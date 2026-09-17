import Link from "next/link";
import {
  TOP_GAMES_WINDOWS,
  TRENDING_COUNTRIES,
  getTopGames,
  getTrackedCountries,
  getTrendingTopics,
  type TopGamesWindow,
} from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { GameCard } from "@/components/GameCard";
import { CountrySelect } from "@/components/CountrySelect";
import { TrendingCountrySelect } from "@/components/TrendingCountrySelect";
import { TrendingFigures } from "@/components/TrendingFigures";
import { TrendingSearches } from "@/components/TrendingSearches";

export const revalidate = 300;

const PLATFORMS = [
  { key: "all", label: "All Devices" },
  { key: "ios", label: "iOS" },
  { key: "android", label: "Android" },
  { key: "desktop", label: "Desktop" },
] as const;
type PlatformKey = (typeof PLATFORMS)[number]["key"];

function isTopGamesWindow(value: string | undefined): value is TopGamesWindow {
  return TOP_GAMES_WINDOWS.some((w) => w.key === value);
}

function isPlatformKey(value: string | undefined): value is PlatformKey {
  return PLATFORMS.some((p) => p.key === value);
}

function isTrendingCountry(value: string | undefined): boolean {
  return TRENDING_COUNTRIES.some((c) => c.code === value);
}

function buildUrl(params: { window: TopGamesWindow; platform: PlatformKey; country?: string; trending?: string }): string {
  const sp = new URLSearchParams();
  if (params.window !== "today") sp.set("window", params.window);
  if (params.platform !== "all") sp.set("platform", params.platform);
  if (params.country) sp.set("country", params.country);
  if (params.trending && params.trending !== "global") sp.set("trending", params.trending);
  const qs = sp.toString();
  return qs ? `/top-games?${qs}` : "/top-games";
}

export default async function TopGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; platform?: string; country?: string; trending?: string }>;
}) {
  const { window: windowParam, platform: platformParam, country, trending: trendingParam } = await searchParams;
  const activeWindow: TopGamesWindow = isTopGamesWindow(windowParam) ? windowParam : "today";
  const activePlatform: PlatformKey = isPlatformKey(platformParam) ? platformParam : "all";
  const activeTrendingCountry = isTrendingCountry(trendingParam) ? trendingParam! : "global";

  const [games, countries, trendingFigures, trendingSearches] = await Promise.all([
    getTopGames(activeWindow, { country: country || undefined, platform: activePlatform === "all" ? undefined : activePlatform }, 10),
    getTrackedCountries(),
    getTrendingTopics("wikipedia", activeTrendingCountry),
    getTrendingTopics("google_trends", activeTrendingCountry),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Top Sports Games</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Ranked by real visits to each match page on ScoreDB — across Premier League, NFL, NBA and IPL. Country and
          device come from real visitors, the same way an app store chart is built from actual usage.
        </p>
      </div>

      <AdSlot label="Top games top" />

      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TOP_GAMES_WINDOWS.map((w) => (
            <Link
              key={w.key}
              href={buildUrl({ window: w.key, platform: activePlatform, country, trending: activeTrendingCountry })}
              className={`nav-pill shrink-0 text-sm ${activeWindow === w.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
            >
              {w.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PLATFORMS.map((p) => (
              <Link
                key={p.key}
                href={buildUrl({ window: activeWindow, platform: p.key, country, trending: activeTrendingCountry })}
                className={`nav-pill shrink-0 text-sm ${activePlatform === p.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
          {countries.length > 0 && <CountrySelect countries={countries} />}
        </div>
      </div>

      {games.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          No tracked views for this filter yet — this chart fills in from real visits to match pages as the site gets
          traffic, the same way an app store chart is built from real downloads rather than a guess.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g, i) => (
            <div key={`${g.league}-${g.espn_id}`} className="relative">
              <span className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-foreground)]">
                {i + 1}
              </span>
              <GameCard league={g.league} game={g} />
              <p className="mt-1 text-center text-xs text-[var(--text-muted)]">
                {g.views} view{g.views === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Trending Beyond ScoreDB</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Real external signals — Wikipedia pageview spikes and Google&apos;s daily trending searches —
              cross-checked against the players and teams we track.
            </p>
          </div>
          <TrendingCountrySelect countries={TRENDING_COUNTRIES} />
        </div>
      </div>

      <AdSlot label="Trending mid" />

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-bold tracking-tight">📚 Trending Sports Figures</h3>
        <TrendingFigures topics={trendingFigures} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-bold tracking-tight">🔎 Trending Searches</h3>
        <TrendingSearches topics={trendingSearches} />
      </div>
    </div>
  );
}
