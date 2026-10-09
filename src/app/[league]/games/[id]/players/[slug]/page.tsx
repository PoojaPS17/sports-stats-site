import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { loadPerformanceCardData, type PerformanceCardData } from "@/lib/performanceCardData";
import { performanceTags } from "@/lib/performanceTags";
import { getGameDetails } from "@/lib/queries";
import { gameLeadersShown, gameSections, hasNoBoxScore } from "@/lib/gamePage";
import { ImageActions } from "@/components/ImageActions";
import { LEAGUE_LABEL } from "@/lib/leagues";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { teamDisplayName } from "@/lib/teamName";
import { formatGameDate } from "@/lib/gameDay";
import { gameRoundLabel } from "@/lib/stage";

type Params = { league: string; id: string; slug: string };

// A completed game's own performance line does not change like the live game page does — held to
// the site-wide five-minute cap (next.config.ts), same window as the players/[slug]/[season] page.
export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default) — see
// loadPerformanceCardData's null case below.
export function generateStaticParams() {
  return [];
}

// Stored-only, same as the game page's own generateMetadata (games/[id]/page.tsx) — a game with no
// stored box score has nothing to index here either way.
async function isIndexedLeader(data: PerformanceCardData): Promise<boolean> {
  const details = data.game.completed ? await getGameDetails(data.league, data.game.espn_id) : null;
  if (!details) return false;
  const noBoxScore = hasNoBoxScore(data.game, details.player_box);
  const show = gameSections(data.game);
  const leaders = gameLeadersShown(show, noBoxScore, details.leaders);
  return leaders.some((l) => l.athlete_id === data.player.espn_id);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) return {};
  const indexed = await isIndexedLeader(data);
  const title = `${data.player.name} vs ${data.row.opponent_abbr ?? "opponent"} — ${LEAGUE_LABEL[data.league]} Performance`;
  const description = `${data.player.name}'s full stat line from this ${LEAGUE_LABEL[data.league]} game: ${data.stats.map((s) => `${s.value} ${s.label}`).join(", ")}.`;
  return pageMeta(title, description, `/${data.league}/games/${id}/players/${slug}`, { noindex: !indexed, ownImage: true });
}

export default async function PerformancePage({ params }: { params: Promise<Params> }) {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) notFound();

  const priorRows = data.stageProfile
    ? data.stageProfile.rows.filter((r) => r.season_year === data.row.season_year && r.game_espn_id !== data.row.game_espn_id)
    : [];
  const seasonEntry = data.stageProfile?.seasons.find((s) => s.season === data.row.season_year);
  const seasonComplete = seasonEntry ? seasonEntry.recorded === seasonEntry.games : false;
  const tags = performanceTags(data.row, priorRows, data.sport, seasonComplete);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[data.league], href: `/${data.league}` },
          { label: "Games", href: `/${data.league}/games/${id}` },
          { label: data.player.name },
        ]}
      />
      <h1 className="page-title mt-2">
        {data.player.name} {data.row.is_home ? "vs" : "at"} {teamDisplayName(data.row.opponent_name)}: full stat line
      </h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {formatGameDate(data.game.date, data.league, { month: "short", day: "numeric", year: "numeric" })}
        {data.row.team_score != null && data.row.opponent_score != null ? ` · ${data.row.team_score}-${data.row.opponent_score}` : ""}
        {gameRoundLabel(data.game) ? ` · ${gameRoundLabel(data.game)}` : ""}
      </p>
      {/* The card route already renders this at its display size, so the image optimizer would only re-encode it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/${data.league}/games/${id}/players/${slug}/card?format=og`}
        alt={`${data.player.name} performance card`}
        width={1200}
        height={630}
        className="w-full rounded-xl border border-[var(--border)]"
      />
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {t}
            </span>
          ))}
        </div>
      )}
      <table className="mt-4 w-full text-sm">
        <tbody>
          {data.stats.map((s) => (
            <tr key={s.key} className="border-t border-[var(--border)]">
              <td className="py-2 text-[var(--text-muted)]" title={s.title}>{s.label}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{s.value}</td>
              <td className="py-2 text-right text-xs text-[var(--text-faint)]">{s.delta ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link prefetch={false} href={`/${data.league}/games/${id}`} className="hover:text-[var(--accent)]">
          Back to the game
        </Link>
        <Link prefetch={false} href={`/${data.league}/players/${slug}`} className="hover:text-[var(--accent)]">
          Full stats for {data.player.name}
        </Link>
      </div>
      <div className="mt-4">
        <ImageActions filename={`${id}-${slug}-card-${data.league}`} imageUrl={`/${data.league}/games/${id}/players/${slug}/card?format=og`} shareTitle={`${data.player.name} performance card`} />
      </div>
    </div>
  );
}
