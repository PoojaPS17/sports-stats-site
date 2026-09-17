import Link from "next/link";
import { LEAGUE_LABEL, formatSeasonLabel, type League } from "@/lib/queries";
import { isSoccer } from "@/lib/analytics";
import {
  currentWeekIndex,
  getWeekPerformers,
  summarizeWeek,
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

function groupByDay(games: Matchweek["games"]) {
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = new Date(g.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return groups;
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
                <span>{w.playoff ? w.shortLabel : w.index}</span>
                <span className="text-[10px] font-medium text-[var(--text-faint)]">{w.completed === w.games.length ? "done" : w.completed > 0 ? `${w.completed}/${w.games.length}` : new Date(w.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
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
  const table = week.playoff ? [] : tableAfterWeek(league, weeks, week.index);
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

      <AdSlot label={`${LEAGUE_LABEL[league]} week hub top`} />

      {summary.played > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games played", value: `${summary.played}${summary.scheduled ? ` of ${week.games.length}` : ""}` },
            { label: `Total ${scoreWord}`, value: summary.totalScore, sub: `${(summary.totalScore / summary.played).toFixed(1)} per game` },
            { label: "Home wins", value: summary.homeWins, sub: `${summary.awayWins} away${soccer ? `, ${summary.draws} drawn` : ""}` },
            {
              label: "Biggest margin",
              value: summary.biggest ? Math.abs(summary.biggest.home_score! - summary.biggest.away_score!) : "—",
              sub: summary.biggest ? `${summary.biggest.away_abbr ?? summary.biggest.away_name} ${summary.biggest.away_score}–${summary.biggest.home_score} ${summary.biggest.home_abbr ?? summary.biggest.home_name}` : "",
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
              <SectionHeader>{day}</SectionHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {games.map((g) => (
                  <GameCard key={g.espn_id} league={league} game={g} />
                ))}
              </div>
            </section>
          ))}

          {performers.length > 0 && (
            <section>
              <SectionHeader description="Best single-game figures from this round's box scores">Top performers</SectionHeader>
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
              <SectionHeader description={`Regular-season table after ${week.label.toLowerCase()}, with movement from the round before`}>Table after {week.shortLabel}</SectionHeader>
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
                            <span className="truncate text-[13px] font-medium">{r.team.abbreviation ?? r.team.name}</span>
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

export function WeekIndex({ league, season, weeks, seasons, isCurrentSeason }: { league: League; season: number; weeks: Matchweek[]; seasons: number[]; isCurrentSeason: boolean }) {
  const noun = weekNoun(league);
  const now = isCurrentSeason ? currentWeekIndex(weeks) : -1;
  const seasonArg = isCurrentSeason ? null : season;
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: LEAGUE_LABEL[league], href: `/${league}` }, { label: `${noun}s` }]} />
      <PageHeader title={`${LEAGUE_LABEL[league]} ${noun}s`} subtitle={`${formatSeasonLabel(league, season)} season, round by round`}>
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
      {weeks.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No fixtures on record for this season yet.</p>
      ) : (
        <div className="card overflow-hidden">
          <ol className="divide-y divide-[var(--border)]">
            {weeks.map((w) => (
              <li key={w.index}>
                <Link href={weekPath(league, w.index, seasonArg)} className={`flex items-center gap-4 px-4 py-3 text-sm transition hover:bg-[var(--surface-hover)] ${w.index === now ? "bg-[var(--accent-soft)]/40" : ""}`}>
                  <span className="w-28 shrink-0 font-semibold sm:w-40">{w.label}</span>
                  <span className="w-28 shrink-0 text-[var(--text-muted)]">{weekDateRange(w)}</span>
                  <span className="hidden flex-1 text-xs text-[var(--text-faint)] sm:block">{w.games.length} games</span>
                  <span className={`ml-auto shrink-0 text-xs font-semibold ${w.completed === w.games.length ? "text-[var(--text-faint)]" : w.completed > 0 ? "text-[var(--live)]" : "text-[var(--accent)]"}`}>
                    {w.completed === w.games.length ? "Completed" : w.completed > 0 ? `${w.completed} of ${w.games.length} played` : w.index === now ? "Up next" : "Upcoming"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
