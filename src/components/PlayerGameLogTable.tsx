import { formatSeasonLabel, type League } from "@/lib/queries";
import { stageCellText } from "@/lib/gameStage";
import { formatStat, type PlayerLogRow, type PlayerProfile } from "@/lib/playerProfile";
import { fmtDate, OpponentCell, ResultChip } from "./PlayerStatsShared";

const num = "px-2 py-2 text-right tabular-nums";

function LogTable({ league, profile, rows, split }: { league: League; profile: PlayerProfile; rows: PlayerLogRow[]; split: boolean }) {
  const specs = profile.profile.specs.filter((s) => s.log !== false);
  const showRound = rows.some((r) => stageCellText(r, split) !== "");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="table-head">
            <th className="py-2 pl-4 text-left font-semibold">Date</th>
            <th className="py-2 pl-2 text-left font-semibold">Opponent</th>
            {showRound && <th className="py-2 pl-2 text-left font-semibold">{split ? "Stage" : "Round"}</th>}
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
            <tr key={row.game_espn_id} className={`table-row ${row.stage === "excluded" ? "opacity-60" : ""}`} title={row.stage === "excluded" ? "Not counted in season totals" : undefined}>
              <td className="whitespace-nowrap py-2 pl-4 text-xs text-[var(--text-muted)]">{fmtDate(row.date, league)}</td>
              <td className="py-2 pl-2">
                <OpponentCell league={league} row={row} />
              </td>
              {showRound && <td className="whitespace-nowrap py-2 pl-2 text-xs text-[var(--text-muted)]">{stageCellText(row, split)}</td>}
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
// the HTML search engines read) without burying the summary sections above. `rows` is every
// appearance, including games that are not counted in the tables (`profile` supplies the columns).
export function PlayerGameLogTable({ league, profile, rows, split, season }: { league: League; profile: PlayerProfile; rows: PlayerLogRow[]; split: boolean; season?: number | null }) {
  if (season != null) {
    return (
      <div className="card overflow-hidden">
        <LogTable league={league} profile={profile} rows={rows.filter((r) => r.season_year === season)} split={split} />
      </div>
    );
  }
  const bySeason = new Map<number, PlayerLogRow[]>();
  for (const r of rows) {
    if (r.season_year === null) continue;
    const group = bySeason.get(r.season_year);
    if (group) group.push(r);
    else bySeason.set(r.season_year, [r]);
  }
  const seasons = [...bySeason.entries()].sort((a, b) => b[0] - a[0]);
  return (
    <div className="flex flex-col gap-2">
      {seasons.map(([season, group], i) => (
        <details key={season} className="card overflow-hidden" open={i === 0}>
          <summary className="table-head flex cursor-pointer list-none items-center justify-between px-4 py-2.5">
            <span>
              {formatSeasonLabel(league, season)} · {group.length} {split ? "games logged" : profile.profile.gamesLabel.toLowerCase()}
            </span>
            <span className="text-[10px] font-normal normal-case tracking-normal">{i === 0 ? "" : "Show"}</span>
          </summary>
          <LogTable league={league} profile={profile} rows={group} split={split} />
        </details>
      ))}
    </div>
  );
}
