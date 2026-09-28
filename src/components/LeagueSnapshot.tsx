import Link from "next/link";
import { isSoccerLeague, isCricketLeague, type League } from "@/lib/leagues";
import { formatLeaderValue } from "@/lib/leaders";
import { formatWinLossTie } from "@/lib/teamSummary";
import { cricketRecord } from "@/lib/cricketStandings";
import { zoneRules } from "@/lib/standingsZones";
import type { LeagueSnapshotData } from "@/lib/leagueSnapshot";
import { SectionHeader } from "./SectionHeader";
import { TeamLogo } from "./TeamLogo";

function record(league: League, r: LeagueSnapshotData["table"][number]): string {
  if (isSoccerLeague(league)) return `${r.wins}-${r.draws ?? 0}-${r.losses}`;
  if (isCricketLeague(league)) return cricketRecord(r);
  return formatWinLossTie(r.wins, r.losses, r.draws);
}

// The top of a season's table beside its leading players, with links on to the full pages.
// The league hub shows the whole recap; the homepage passes a trimmed snapshot.
export function LeagueSnapshot({ league, data }: { league: League; data: LeagueSnapshotData }) {
  if (data.table.length === 0 && data.leaders.length === 0) return null;
  // Qualification / relegation bands by position, the same rule the full standings table uses;
  // null for leagues (or table sizes) with no defined zones, e.g. the NBA and NFL.
  const zoneAt = zoneRules(league, data.tableSize);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {data.table.length > 0 && (
        <section>
          <SectionHeader action={{ label: `All ${data.tableSize} teams`, href: `/${league}/standings/${data.season}` }}>
            {data.inSeason ? "Table" : "Final table"}, {data.seasonLabel}
          </SectionHeader>
          <ol className="card overflow-hidden">
            {data.table.map((r, i) => {
              const zone = zoneAt ? zoneAt(i + 1) : null;
              return (
                <li key={r.team_espn_id} className="table-row first:border-t-0">
                  <Link href={`/${league}/teams/${r.slug}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`zone-marker ${zone?.cls ?? ""}`} title={zone?.label} />
                        <span className={`display w-5 text-right text-lg ${i === 0 ? "text-[var(--sig-ink)]" : "text-[var(--text-faint)]"}`}>{i + 1}</span>
                      </span>
                      <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={24} />
                      <span className="truncate font-semibold">{r.name}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                      <span className="text-xs text-[var(--text-muted)]">{record(league, r)}</span>
                      {r.points !== null && (
                        <span className="display text-xl">
                          {r.points} <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">pts</span>
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {data.leaders.length > 0 && (
        <section>
          <SectionHeader action={{ label: "All leaders", href: `/${league}/leaders` }}>Season leaders, {data.seasonLabel}</SectionHeader>
          <div className="card divide-y divide-[var(--border)]">
            {data.leaders.map((board) => {
              const top = board.rows[0]?.value || 1;
              return (
                <div key={board.label} className="px-4 py-3">
                  <h3 className="eyebrow text-[var(--text-muted)]">{board.label}</h3>
                  <ol className="mt-2 flex flex-col gap-2.5">
                    {board.rows.map((row, rank) => {
                      const n = row.rank ?? rank + 1;
                      return (
                        <li key={row.player_espn_id}>
                          <Link href={`/${league}/players/${row.slug}`} className="flex items-center gap-3 text-sm">
                            <span className={`display w-5 text-right text-xl ${n === 1 ? "text-[var(--sig-ink)]" : "text-[var(--text-faint)]"}`}>{n}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5 truncate">
                                <span className="font-semibold">{row.name}</span>
                                {row.team_name && <span className="text-xs text-[var(--text-muted)]">{row.team_name}</span>}
                              </span>
                              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                                <span className="block h-full rounded-full bg-[var(--sig)]" style={{ width: `${Math.max(6, Math.round((row.value / top) * 100))}%` }} />
                              </span>
                            </span>
                            <span className="display shrink-0 text-2xl tabular-nums">
                              {formatLeaderValue(row.value, board.unit)}
                              <span className="ml-1 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{board.unit}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
