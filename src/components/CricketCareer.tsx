import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import { CRICKET_SPLIT_DIMENSIONS, LEAGUE_LABEL, isInternationalCricket } from "@/lib/queries";
import type { League, CricketCareerStats, CricketSplitDimension, CricketSplitRow } from "@/lib/queries";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-center">
      <p className="text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

const fmt = (n: number | null, digits = 2) => (n === null ? "-" : n.toFixed(digits));

export function CricketCareer({
  league,
  career,
  splits,
  activeSplit,
  basePath,
}: {
  league: League;
  career: CricketCareerStats;
  splits: CricketSplitRow[];
  activeSplit: CricketSplitDimension;
  basePath: string;
}) {
  return (
    <>
      <section>
        <SectionHeader>{LEAGUE_LABEL[league]} Career</SectionHeader>
        <p className="-mt-2 mb-3 text-xs text-[var(--text-muted)]">
          {league === "wodi" || league === "wt20i"
            ? `From every women's ${league === "wodi" ? "ODI" : "T20 international"} in ESPN's scorecards (2009 onward, World Cups included). Matches counts a game only when the player batted, bowled or took a catch in it.`
            : isInternationalCricket(league)
            ? `From every men's ${league === "odi" ? "ODI" : "T20 international"} on record (${league === "odi" ? "2002" : "2005"} onward, World Cups included): Cricsheet's ball-by-ball archive, with the matches it does not carry (those involving Afghanistan, and the newest results) filled from ESPN's scorecards. Matches counts a game only when the player batted, bowled or took a catch in it.`
            : `From every ${LEAGUE_LABEL[league]} match on record. ${LEAGUE_LABEL[league]} only: other competitions and formats are not counted.`}
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Batting</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="Matches" value={String(career.matches)} />
              <Stat label="Runs" value={String(career.runs)} />
              <Stat label="Average" value={fmt(career.average)} />
              <Stat label="Strike Rate" value={fmt(career.strikeRate, 1)} />
              <Stat label="100s" value={String(career.hundreds)} />
              <Stat label="50s" value={String(career.fifties)} />
            </div>
          </div>
          {career.inningsBowled > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Bowling</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="Innings" value={String(career.inningsBowled)} />
                <Stat label="Overs" value={fmt(career.overs, 1)} />
                <Stat label="Wickets" value={String(career.wickets)} />
                <Stat label="Economy" value={fmt(career.economy, 2)} />
              </div>
            </div>
          )}
          {career.catches > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Fielding</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="Catches" value={String(career.catches)} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHeader>Career Splits</SectionHeader>
        <div className="mb-3 flex gap-1.5">
          {CRICKET_SPLIT_DIMENSIONS.map((d) => (
            <Link
              key={d.key}
              href={d.key === "team" ? basePath : `${basePath}?split=${d.key}`}
              className={`nav-pill text-sm ${activeSplit === d.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
            >
              {d.label}
            </Link>
          ))}
        </div>
        {splits.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No data yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="table-head text-left">
                  <th className="py-2 pl-4 font-medium">{CRICKET_SPLIT_DIMENSIONS.find((d) => d.key === activeSplit)?.label}</th>
                  <th className="px-2 py-2 text-right font-medium">M</th>
                  <th className="px-2 py-2 text-right font-medium">Runs</th>
                  <th className="py-2 pr-4 text-right font-medium">Wkts</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((row) => (
                  <tr key={row.key} className="border-t border-[var(--border)]">
                    <td className="py-2 pl-4 font-medium">
                      {row.slug ? (
                        <Link href={`/${league}/teams/${row.slug}`} className="hover:underline">
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{row.matches}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.runs}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.wickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
