import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel, type League } from "@/lib/queries";
import { formatGameDate } from "@/lib/gameDay";
import { getLeagueRecords, isSoccer, supportsScoreAnalytics, type RecordGame, type StreakRecord } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { ImageActions } from "@/components/ImageActions";
import { RecordsExportCard, recordsExportWidth, type RecordBoard } from "@/components/RecordsExportCards";

// A record can fall in any game, so the boards move with the season.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Records`, `${label} record book: highest-scoring games, biggest wins, longest winning and unbeaten streaks across every season on SportsDB.`, `/${league}/records`);
}

// A record falls in a game, so its date is that game's own calendar day.
function fmtDate(iso: string, league: League) {
  return formatGameDate(iso, league, { month: "short", day: "numeric", year: "numeric" });
}

function GameList({ league, games, unit }: { league: League; games: RecordGame[]; unit: string }) {
  if (games.length === 0) return <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No data yet.</p>;
  return (
    <ol>
      {games.map((g, i) => {
        const homeWon = g.home_score > g.away_score;
        return (
          <li key={g.espn_id} className="table-row first:border-t-0">
            <Link href={`/${league}/games/${g.espn_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <TeamLogo name={g.away.name} logoUrl={g.away.logo_url} color={g.away.color} size={18} />
                  <span className={`truncate ${!homeWon ? "font-semibold" : "text-[var(--text-muted)]"}`}>{g.away.name}</span>
                  <span className="mx-1 shrink-0 tabular-nums font-bold">
                    {g.away_score}–{g.home_score}
                  </span>
                  <TeamLogo name={g.home.name} logoUrl={g.home.logo_url} color={g.home.color} size={18} />
                  <span className={`truncate ${homeWon ? "font-semibold" : "text-[var(--text-muted)]"}`}>{g.home.name}</span>
                </span>
                <span className="text-xs text-[var(--text-faint)]">{fmtDate(g.date, league)}</span>
              </span>
              <span className="shrink-0 text-base font-bold tabular-nums">
                {g.value} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">{unit}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function StreakList({ league, streaks }: { league: League; streaks: StreakRecord[] }) {
  if (streaks.length === 0) return <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No data yet.</p>;
  return (
    <ol>
      {streaks.map((s, i) => (
        <li key={`${s.team.espn_id}-${s.start}`} className="table-row first:border-t-0">
          <Link href={`/${league}/teams/${s.team.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
            <TeamLogo name={teamDisplayName(s.team.name)} logoUrl={s.team.logo_url} color={s.team.color} size={22} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{teamDisplayName(s.team.name)}</span>
              <span className="text-xs text-[var(--text-faint)]">
                {fmtDate(s.start, league)} to {fmtDate(s.end, league)}
              </span>
            </span>
            <span className="shrink-0 text-base font-bold tabular-nums">
              {s.length} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">games</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Board({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h3 className="table-head border-b border-[var(--border)] px-4 py-2.5">{title}</h3>
      {children}
    </section>
  );
}

export default async function RecordsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !supportsScoreAnalytics(league)) notFound();

  const r = await getLeagueRecords(league, 10);
  const soccer = isSoccer(league);
  const unit = soccer ? "goals" : "pts";
  const label = LEAGUE_LABEL[league];
  const coverage = r.seasonsCovered
    ? `${formatSeasonLabel(league, r.seasonsCovered[0])} to ${formatSeasonLabel(league, r.seasonsCovered[1])}, ${r.gamesCovered.toLocaleString()} games`
    : undefined;

  const gameBoards: RecordBoard[] = [
    { title: "Highest-scoring games", kind: "games", games: r.highestScoring, unit },
    { title: "Biggest margins of victory", kind: "games", games: r.biggestMargins, unit: `${unit} margin` },
    { title: soccer ? "Most goals by one team" : "Highest team scores", kind: "games", games: r.highestTeamScore, unit },
    { title: "Biggest away wins", kind: "games", games: r.biggestAwayWins, unit: `${unit} margin` },
  ];
  const streakBoards: RecordBoard[] = [
    { title: "Longest winning streaks", kind: "streaks", streaks: r.longestWinStreaks },
    ...(soccer ? [{ title: "Longest unbeaten runs", kind: "streaks", streaks: r.longestUnbeaten } as RecordBoard] : []),
    { title: soccer ? "Longest winless runs" : "Longest losing streaks", kind: "streaks", streaks: r.longestWinless },
  ];
  const lowBoards: RecordBoard[] = [{ title: "Lowest-scoring games", kind: "games", games: r.lowestScoring, unit }];
  const tools = (name: string, title: string, boards: RecordBoard[]) => (
    <ImageActions filename={`${league}-records-${name}`} shareTitle={`${label} ${title.toLowerCase()}`} width={recordsExportWidth(boards)} card={<RecordsExportCard league={league} title={`${label} records: ${title}`} subtitle={coverage ?? null} boards={boards} />} />
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`${label} Records`} subtitle={coverage ? `Record book for every game on SportsDB: ${coverage}` : undefined} />
      <AdSlot label={`${label} records top`} />

      <div>
        <SectionHeader tools={tools("games", "Games", gameBoards)}>Games</SectionHeader>
        <div className="grid gap-6 lg:grid-cols-2">
          <Board title={`Highest-scoring games`}>
            <GameList league={league} games={r.highestScoring} unit={unit} />
          </Board>
          <Board title="Biggest margins of victory">
            <GameList league={league} games={r.biggestMargins} unit={`${unit} margin`} />
          </Board>
          <Board title={soccer ? "Most goals by one team" : "Highest team scores"}>
            <GameList league={league} games={r.highestTeamScore} unit={unit} />
          </Board>
          <Board title="Biggest away wins">
            <GameList league={league} games={r.biggestAwayWins} unit={`${unit} margin`} />
          </Board>
        </div>
      </div>

      <div>
        <SectionHeader description="Regular season and playoffs combined, across every season on record" tools={tools("streaks", "Streaks", streakBoards)}>
          Streaks
        </SectionHeader>
        <div className={`grid gap-6 ${soccer ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          <Board title="Longest winning streaks">
            <StreakList league={league} streaks={r.longestWinStreaks} />
          </Board>
          {soccer && (
            <Board title="Longest unbeaten runs">
              <StreakList league={league} streaks={r.longestUnbeaten} />
            </Board>
          )}
          <Board title={soccer ? "Longest winless runs" : "Longest losing streaks"}>
            <StreakList league={league} streaks={r.longestWinless} />
          </Board>
        </div>
      </div>

      {!soccer && (
        <div>
          <SectionHeader tools={tools("low-scoring", "Low scoring", lowBoards)}>Low scoring</SectionHeader>
          <div className="grid gap-6 lg:grid-cols-2">
            <Board title="Lowest-scoring games">
              <GameList league={league} games={r.lowestScoring} unit={unit} />
            </Board>
          </div>
        </div>
      )}
    </div>
  );
}
