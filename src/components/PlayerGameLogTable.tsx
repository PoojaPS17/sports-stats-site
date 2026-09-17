import { formatSeasonLabel, type League } from "@/lib/queries";
import { formatStat, type PlayerLogRow, type PlayerProfile } from "@/lib/playerProfile";
import { fmtDate, OpponentCell, ResultChip } from "./PlayerStatsShared";

const num = "px-2 py-2 text-right tabular-nums";

function LogTable({ league, profile, rows }: { league: League; profile: PlayerProfile; rows: PlayerLogRow[] }) {
  const specs = profile.profile.specs.filter((s) => s.log !== false);
  const showRound = rows.some((r) => r.round || r.week);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="table-head">
            <th className="py-2 pl-4 text-left font-semibold">Date</th>
            <th className="py-2 pl-2 text-left font-semibold">Opponent</th>
            {showRound && <th className="py-2 pl-2 text-left font-semibold">Round</th>}
            <th className="py-2 pl-2 text-left font-semibold">Result</th>
            {specs.map((s) => (
              <th key={s.key} className={`${num} font-semibold`} title={s.title}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.game_espn_id} className="table-row">
              <td className="whitespace-nowrap py-2 pl-4 text-xs text-[var(--text-muted)]">{fmtDate(row.date)}</td>
              <td className="py-2 pl-2">
                <OpponentCell league={league} row={row} />
              </td>
              {showRound && <td className="whitespace-nowrap py-2 pl-2 text-xs text-[var(--text-muted)]">{row.round ?? (row.week ? `Week ${row.week}` : "")}</td>}
              <td className="py-2 pl-2">
                <ResultChip row={row} />
              </td>
              {specs.map((s) => {
                const v = s.value(row.stats);
                return (
                  <td key={s.key} className={`${num} ${v === 0 ? "text-[var(--text-faint)]" : ""}`}>
                    {formatStat(s, v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The full log, one collapsible block per season with the latest open. A player
// with a decade on record has a few hundred rows; the rest stay in the page (and in
// the HTML search engines read) without burying the summary sections above.
export function PlayerGameLogTable({ league, profile, season }: { league: League; profile: PlayerProfile; season?: number | null }) {
  if (season != null) {
    const rows = profile.rows.filter((r) => r.season_year === season);
    return (
      <div className="card overflow-hidden">
        <LogTable league={league} profile={profile} rows={rows} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {profile.seasons.map((s, i) => (
        <details key={s.season} className="card overflow-hidden" open={i === 0}>
          <summary className="table-head flex cursor-pointer list-none items-center justify-between px-4 py-2.5">
            <span>
              {formatSeasonLabel(league, s.season)} · {s.games} {profile.profile.gamesLabel.toLowerCase()}
            </span>
            <span className="text-[10px] font-normal normal-case tracking-normal">{i === 0 ? "" : "Show"}</span>
          </summary>
          <LogTable league={league} profile={profile} rows={profile.rows.filter((r) => r.season_year === s.season)} />
        </details>
      ))}
    </div>
  );
}
