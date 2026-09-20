import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getGamesByDate } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { ImageActions } from "@/components/ImageActions";
import { ScoreboardExportCard, scoreboardExportWidth } from "@/components/ScoreboardExportCard";
import { AdSlot } from "@/components/AdSlot";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";
import { pageMeta } from "@/lib/metadata";
import { isValidIsoDate } from "@/lib/isoDate";
import { scoresDayDescription } from "@/lib/gameDisplay";
import type { Metadata } from "next";

export const revalidate = 15;

// Dynamic on purpose: no generateStaticParams here, so the day's scores is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), and a render made in the pre state ships no LiveRefresh timer,
// so it would not catch up on its own. The window above still sets the default for the cached
// fetches inside this render.

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; date: string }> }): Promise<Metadata> {
  const { league, date } = await params;
  // An impossible date (month 13, Feb 30) is a 404 like an unknown league, never an error.
  if (!isValidIsoDate(date)) notFound();
  if (!isLeague(league)) return pageMeta("Scores", "Scores by date.", undefined, { noindex: true });
  const games = await getGamesByDate(league, date);
  const label = dayLabel(date);
  return pageMeta(
    `${LEAGUE_LABEL[league]} Scores, ${label}`,
    scoresDayDescription(league, label, games),
    `/${league}/scores/${date}`,
    // A date with nothing played is an empty page, so keep it out of the index.
    { noindex: games.length === 0 }
  );
}

export default async function ScoresByDatePage({
  params,
}: {
  params: Promise<{ league: string; date: string }>;
}) {
  const { league, date } = await params;
  if (!isLeague(league) || !isValidIsoDate(date)) notFound();

  const games = await getGamesByDate(league, date);
  const label = dayLabel(date);

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbSchema([{ label: LEAGUE_LABEL[league], href: `/${league}` }, { label: `Scores, ${label}` }])} />
      <h1 className="page-title">
        {LEAGUE_LABEL[league]} Scores, {label}
      </h1>
      <AdSlot label="Scores-by-date top" />
      {games.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing was played on this date.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ImageActions
            filename={`${league}-scores-${date}`}
            shareTitle={`${LEAGUE_LABEL[league]} scores, ${label}`}
            width={scoreboardExportWidth(league)}
            card={<ScoreboardExportCard league={league} title={`${LEAGUE_LABEL[league]} scores`} subtitle={label} games={games} />}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
