import Link from "next/link";
import { formatGameDate } from "@/lib/gameDay";
import { cricketMatchLogCells, cricketMatchLogOvers, type CricketMatchLogRow } from "@/lib/cricketMatchLog";
import type { League } from "@/lib/queries";

const num = "px-2 py-2 text-right tabular-nums";

// The player's latest matches in this competition, each one a link to its scorecard. Batting and bowling cells follow the
// career tiles above: runs with a * for not out, wickets/runs conceded, and " & " between a Test's two innings.
export function CricketMatchLog({ league, rows }: { league: League; rows: CricketMatchLogRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="table-head">
              <th className="py-2 pl-4 text-left font-semibold">Date</th>
              <th className="py-2 pl-2 text-left font-semibold">Match</th>
              <th className={`${num} font-semibold`}>Batting</th>
              <th className={`${num} pr-4 font-semibold`}>Bowling</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { batting, bowling } = cricketMatchLogCells(row.innings);
              const overs = cricketMatchLogOvers(row.innings);
              return (
                <tr key={row.game_espn_id} className="table-row">
                  <td className="whitespace-nowrap py-2 pl-4 align-top text-xs text-[var(--text-muted)]">
                    {formatGameDate(row.date, league, { month: "short", day: "numeric", year: "numeric" }, row.local_date)}
                  </td>
                  <td className="py-2 pl-2">
                    <Link prefetch={false} href={`/${league}/games/${row.game_espn_id}`} className="font-medium hover:underline">
                      {row.opponent ? `v ${row.opponent}` : "Match scorecard"}
                    </Link>
                    {row.result && <p className="text-xs text-[var(--text-muted)]">{row.result}</p>}
                  </td>
                  <td className={`${num} align-top ${batting === "—" ? "text-[var(--text-faint)]" : ""}`}>{batting}</td>
                  <td className={`${num} pr-4 align-top ${bowling === "—" ? "text-[var(--text-faint)]" : ""}`} title={overs || undefined}>
                    {bowling}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
