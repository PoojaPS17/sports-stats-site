import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { LEAGUE_LABEL, formatSeasonLabel, type League } from "@/lib/queries";
import { isCupCompetition, UCL_LEAGUE_PHASE_FROM } from "@/lib/leagues";
import { isSoccer } from "@/lib/analytics";
import {
  currentWeekIndex,
  getWeekPerformers,
  summarizeWeek,
  calledOffNote,
  weekProgress,
  tableAfterWeek,
  weekDateRange,
  weekIndexPath,
  weekNoun,
  weekPath,
  type Matchweek,
} from "@/lib/matchweeks";
import { AdSlot } from "./AdSlot";
import { Breadcrumbs } from "./Breadcrumbs";
import { GameCard } from "./GameCard";
import { PageHeader } from "./PageHeader";
import { SectionHeader } from "./SectionHeader";
import { TeamLogo } from "./TeamLogo";
import { ImageActions } from "./ImageActions";
import { ScoreboardExportCard, scoreboardExportWidth } from "./ScoreboardExportCard";
import { WeekPerformersExportCard, WeekTableExportCard } from "./WeekExportCards";

function groupByDay(games: Matchweek["games"]) {
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = new Date(g.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return groups;
}

// A postponed or cancelled game is resolved (its replay is another game), so it must not keep a finished week open.
function stripCaption(w: Matchweek): string {
  const p = weekProgress(w);
  if (p.state === "off") return "off";
  if (p.state === "done") return "done";
  if (p.state === "partial") return `${p.played}/${p.toPlay}`;
  return new Date(w.start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function progressText(w: Matchweek, isNow: boolean): string {
  const p = weekProgress(w);
  if (p.state === "off") return "Called off";
  if (p.state === "done") return "Completed";
  if (p.state === "partial") return `${p.played} of ${p.toPlay} played`;
  return isNow ? "Up next" : "Upcoming";
}

function progressTone(w: Matchweek): string {
  const state = weekProgress(w).state;
  return state === "done" || state === "off" ? "text-[var(--text-faint)]" : state === "partial" ? "text-[var(--live)]" : "text-[var(--accent)]";
}

function WeekStrip({ league, weeks, active, season, isCurrentSeason }: { league: League; weeks: Matchweek[]; active: number; season: number; isCurrentSeason: boolean }) {
  const now = isCurrentSeason ? currentWeekIndex(weeks) : -1;
  return (
    <nav aria-label={`${weekNoun(league)}s`} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex w-max gap-1 pb-1">
        {weeks.map((w) => {
          const isActive = w.index === active;
          return (
            <li key={w.index}>
              <Link
                href={weekPath(league, w.index, isCurrentSeason ? null : season)}
                aria-current={isActive ? "page" : undefined}
                title={`${w.label} · ${weekDateRange(w)}`}
                className={`flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : w.index === now
                      ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span>{w.playoff || !w.numbered ? w.shortLabel : w.index}</span>
                <span className="text-[10px] font-medium text-[var(--text-faint)]">{stripCaption(w)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export async function WeekHub({
  league,
  season,
  weeks,
  week,
  seasons,
  isCurrentSeason,
}: {
  league: League;
  season: number;
  weeks: Matchweek[];
  week: Matchweek;
  seasons: number[];
  isCurrentSeason: boolean;
}) {
  const noun = weekNoun(league);
  const soccer = isSoccer(league);
  const summary = summarizeWeek(week);
  // The old Champions League group stage was eight separate tables, which one
  // combined table would misrepresent, so the running table is only shown for
  // league-phase seasons.
  const groupStageSeason = isCupCompetition(league) && season < UCL_LEAGUE_PHASE_FROM;
  const table = week.playoff || groupStageSeason ? [] : tableAfterWeek(league, weeks, week.index);
  const performers = await getWeekPerformers(league, week);
  const prev = weeks.find((w) => w.index === week.index - 1) ?? null;
  const next = weeks.find((w) => w.index === week.index + 1) ?? null;
  const seasonArg = isCurrentSeason ? null : season;
  const scoreWord = soccer ? "goals" : "points";
  const days = groupByDay(week.games);

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          { label: `${noun}s`, href: weekIndexPath(league, seasonArg) },
          { label: week.label },
        ]}
      />

      <PageHeader title={`${LEAGUE_LABEL[league]} ${week.label}`} subtitle={`${formatSeasonLabel(league, season)} season · ${weekDateRange(week)} · ${week.games.length} games`}>
        <div className="flex items-center gap-1">
          <Link
            href={prev ? weekPath(league, prev.index, seasonArg) : "#"}
            aria-disabled={!prev}
            className={`nav-pill ${prev ? "" : "pointer-events-none opacity-40"}`}
          >
            ← {prev ? prev.shortLabel : "Prev"}
          </Link>
          <Link
            href={next ? weekPath(league, next.index, seasonArg) : "#"}
            aria-disabled={!next}
            className={`nav-pill ${next ? "" : "pointer-events-none opacity-40"}`}
          >
            {next ? next.shortLabel : "Next"} →
          </Link>
        </div>
      </PageHeader>

      <WeekStrip league={league} weeks={weeks} active={week.index} season={season} isCurrentSeason={isCurrentSeason} />

      {!week.numbered && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          Official {noun.toLowerCase()} numbers are not published for this season, so games are grouped by the dates they were played rather than numbered.
        </p>
      )}
      {league === "nba" && !week.playoff && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          The NBA does not number its weeks. Weeks here are seven-day periods counted from opening night.
        </p>
      )}

      <AdSlot label={`${LEAGUE_LABEL[league]} week hub top`} />

      {summary.played > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games played", value: `${summary.played}${summary.scheduled > 0 ? ` of ${summary.played + summary.scheduled}` : ""}`, sub: calledOffNote(week) ?? "" },
            { label: `Total ${scoreWord}`, value: summary.totalScore, sub: `${(summary.totalScore / summary.played).toFixed(1)} per game` },
            { label: "Home wins", value: summary.homeWins, sub: `${summary.awayWins} away${soccer ? `, ${summary.draws} drawn` : ""}` },
            {
              label: "Biggest margin",
              value: summary.biggest ? Math.abs(summary.biggest.home_score! - summary.biggest.away_score!) : "—",
              sub: summary.biggest ? `${summary.biggest.away_abbr ?? teamDisplayName(summary.biggest.away_name)} ${summary.biggest.away_score}–${summary.biggest.home_score} ${summary.biggest.home_abbr ?? teamDisplayName(summary.biggest.home_name)}` : "",
            },
          ].map((s) => (
            <div key={s.label} className="card flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{s.label}</span>
              <span className="text-2xl font-bold tabular-nums tracking-tight">{s.value}</span>
              {s.sub && <span className="truncate text-xs text-[var(--text-faint)]">{s.sub}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {[...days.entries()].map(([day, games]) => (
            <section key={day}>
              <SectionHeader
                tools={
                  <ImageActions
                    filename={`${league}-${week.shortLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date(games[0].date).toISOString().slice(0, 10)}`}
                    shareTitle={`${LEAGUE_LABEL[league]} ${week.label}, ${day}`}
                    width={scoreboardExportWidth(league)}
                    card={<ScoreboardExportCard league={league} title={`${LEAGUE_LABEL[league]} ${week.label}`} subtitle={`${day}, ${new Date(games[0].date).getFullYear()} · ${formatSeasonLabel(league, season)} season`} games={games} />}
                  />
                }
              >
                {day}
              </SectionHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {games.map((g) => (
                  <GameCard key={g.espn_id} league={league} game={g} />
                ))}
              </div>
            </section>
          ))}

          {performers.length > 0 && (
            <section>
              <SectionHeader
                description="Best single-game figures from this round's box scores"
                tools={
                  <ImageActions
                    filename={`${league}-${week.shortLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-top-performers`}
                    shareTitle={`${LEAGUE_LABEL[league]} ${week.label} top performers`}
                    width={820}
                    card={<WeekPerformersExportCard league={league} title={`${LEAGUE_LABEL[league]} ${week.label} top performers`} subtitle={`${formatSeasonLabel(league, season)} season. Best single-game figures from the round's box scores.`} boards={performers} />}
                  />
                }
              >
                Top performers
              </SectionHeader>
              <div className="grid gap-4 sm:grid-cols-3">
                {performers.map((b) => (
                  <div key={b.title} className="card overflow-hidden">
                    <h3 className="table-head border-b border-[var(--border)] px-3 py-2">{b.title}</h3>
                    <ol>
                      {b.rows.map((r, i) => (
                        <li key={`${r.slug}-${r.game_espn_id}`} className="table-row first:border-t-0">
                          <Link href={`/${league}/players/${r.slug}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <span className="w-4 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                            <TeamLogo name={r.name} logoUrl={r.headshot_url} size={24} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{r.name}</span>
                              <span className="block truncate text-xs text-[var(--text-muted)]">{r.team_name}</span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">
                              {r.value} <span className="text-[10px] font-semibold uppercase text-[var(--text-faint)]">{b.unit}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          {table.length > 0 && (
            <section>
              <SectionHeader
                description={`${isCupCompetition(league) ? "League-phase" : "Regular-season"} table after this round, with movement from the round before`}
                tools={
                  <ImageActions
                    filename={`${league}-table-after-${week.shortLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    shareTitle={`${LEAGUE_LABEL[league]} table after ${week.label}`}
                    width={640}
                    card={<WeekTableExportCard league={league} title={`${LEAGUE_LABEL[league]} table after ${week.numbered ? week.shortLabel : "this round"}`} subtitle={`${formatSeasonLabel(league, season)} season, with movement since the round before`} table={table} />}
                  />
                }
              >
                Table after {week.numbered ? week.shortLabel : "this round"}
              </SectionHeader>
              <div className="card overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      <th className="py-2 pl-3 text-left font-semibold">Team</th>
                      <th className="px-1 py-2 text-right font-semibold">{soccer ? "P" : "W-L"}</th>
                      <th className="py-2 pl-1 pr-3 text-right font-semibold">{soccer ? "Pts" : "Pct"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.team.espn_id} className="table-row">
                        <td className="py-1.5 pl-3">
                          <Link href={`/${league}/teams/${r.team.slug}`} className="flex items-center gap-2 whitespace-nowrap hover:text-[var(--accent)]">
                            <span className="w-4 text-right text-xs tabular-nums text-[var(--text-muted)]">{r.position}</span>
                            <span
                              className={`w-6 text-center text-[10px] font-bold tabular-nums ${r.movement > 0 ? "text-[var(--win)]" : r.movement < 0 ? "text-[var(--loss)]" : "text-[var(--text-faint)]"}`}
                              title={r.previousPosition ? `Was ${r.previousPosition}` : "New"}
                            >
                              {r.movement > 0 ? `▲${r.movement}` : r.movement < 0 ? `▼${-r.movement}` : "–"}
                            </span>
                            <TeamLogo name={r.team.name} logoUrl={r.team.logo_url} color={r.team.color} size={18} />
                            <span className="truncate text-[13px] font-medium">{r.team.abbreviation ?? teamDisplayName(r.team.name)}</span>
                          </Link>
                        </td>
                        <td className="px-1 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)]">{soccer ? r.played : `${r.wins}-${r.losses}`}</td>
                        <td className="py-1.5 pl-1 pr-3 text-right text-sm font-bold tabular-nums">{soccer ? r.points : r.played ? (r.wins / r.played).toFixed(3) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {seasons.length > 1 && (
            <section>
              <SectionHeader>Other seasons</SectionHeader>
              <div className="flex flex-wrap gap-1.5">
                {seasons.map((s) => (
                  <Link key={s} href={weekIndexPath(league, s === seasons[0] ? null : s)} className={`nav-pill ${s === season ? "nav-pill-active" : ""}`}>
                    {formatSeasonLabel(league, s)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The round-by-round index. With no rounds (weeks empty) it shows a short note in place of the list; `season` is null only when the league has no games at all. */
export function WeekIndex({ league, season, weeks, seasons, isCurrentSeason }: { league: League; season: number | null; weeks: Matchweek[]; seasons: number[]; isCurrentSeason: boolean }) {
  const noun = weekNoun(league);
  const now = isCurrentSeason ? currentWeekIndex(weeks) : -1;
  const seasonArg = isCurrentSeason ? null : season;
  const numbered = weeks.every((w) => w.numbered);
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: LEAGUE_LABEL[league], href: `/${league}` }, { label: `${noun}s` }]} />
      <PageHeader title={`${LEAGUE_LABEL[league]} ${noun}s`} subtitle={season === null ? undefined : `${formatSeasonLabel(league, season)} season, round by round`}>
        {seasons.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {seasons.slice(0, 6).map((s) => (
              <Link key={s} href={weekIndexPath(league, s === seasons[0] ? null : s)} className={`nav-pill ${s === season ? "nav-pill-active" : ""}`}>
                {formatSeasonLabel(league, s)}
              </Link>
            ))}
          </div>
        )}
      </PageHeader>
      {!numbered && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          Official {noun.toLowerCase()} numbers are not published for this season, so rounds are listed by the dates they were played.
        </p>
      )}
      {league === "nba" && weeks.length > 0 && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          The NBA does not number its weeks. Weeks here are seven-day periods counted from opening night.
        </p>
      )}
      {weeks.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Rounds appear here once the regular season starts.</p>
      ) : (
        <div className="card overflow-hidden">
          <ol className="divide-y divide-[var(--border)]">
            {weeks.map((w) => (
              <li key={w.index}>
                <Link href={weekPath(league, w.index, seasonArg)} className={`flex items-center gap-4 px-4 py-3 text-sm transition hover:bg-[var(--surface-hover)] ${w.index === now ? "bg-[var(--accent-soft)]/40" : ""}`}>
                  <span className="w-28 shrink-0 font-semibold sm:w-40">{w.label}</span>
                  <span className="w-28 shrink-0 text-[var(--text-muted)]">{weekDateRange(w)}</span>
                  <span className="hidden flex-1 text-xs text-[var(--text-faint)] sm:block">{w.games.length} games</span>
                  <span className={`ml-auto shrink-0 text-xs font-semibold ${progressTone(w)}`}>{progressText(w, w.index === now)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
