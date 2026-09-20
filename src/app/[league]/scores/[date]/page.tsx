import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getGamesByDate } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { ImageActions } from "@/components/ImageActions";
import { ScoreboardExportCard, scoreboardExportWidth } from "@/components/ScoreboardExportCard";
import { AdSlot } from "@/components/AdSlot";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";
import { pageMeta } from "@/lib/metadata";
import { scoresDayDescription } from "@/lib/gameDisplay";
import type { Metadata } from "next";

export const revalidate = 15;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; date: string }> }): Promise<Metadata> {
  const { league, date } = await params;
  if (!isLeague(league) || !DATE_RE.test(date)) return pageMeta("Scores", "Scores by date.", undefined, { noindex: true });
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
  if (!isLeague(league) || !DATE_RE.test(date)) notFound();

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
