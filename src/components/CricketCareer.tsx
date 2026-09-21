import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import { CricketSplitTabs } from "./CricketSplitTabs";
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

function SplitTable({ label, rows, league }: { label: string; rows: CricketSplitRow[]; league: League }) {
  if (rows.length === 0) return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No data yet.</p>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="table-head text-left">
            <th className="py-2 pl-4 font-medium">{label}</th>
            <th className="px-2 py-2 text-right font-medium">M</th>
            <th className="px-2 py-2 text-right font-medium">Runs</th>
            <th className="py-2 pr-4 text-right font-medium">Wkts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
  );
}

export function CricketCareer({
  league,
  career,
  splits,
}: {
  league: League;
  career: CricketCareerStats;
  splits: Record<CricketSplitDimension, CricketSplitRow[]>;
}) {
  return (
    <>
      <section>
        <SectionHeader>{LEAGUE_LABEL[league]} Career</SectionHeader>
        <p className="-mt-2 mb-3 text-xs text-[var(--text-muted)]">
          {league === "test"
            ? "From every men's Test since the start of 2015. Tests before 2015 are not included, so this is not a full career record for anyone who played earlier. Average, highest score, hundreds and five-wicket hauls are counted per innings. Matches counts every game the player was in the playing XI for."
            : league === "wodi" || league === "wt20i"
            ? `From every women's ${league === "wodi" ? "ODI" : "T20 international"} on record (2009 onward, World Cups included). Matches counts every game the player was in the playing XI for.`
            : isInternationalCricket(league)
            ? `From every men's ${league === "odi" ? "ODI" : "T20 international"} on record (${league === "odi" ? "2002" : "2005"} onward, World Cups included). Matches counts every game the player was in the playing XI for.`
            : `From every ${LEAGUE_LABEL[league]} match on record. ${LEAGUE_LABEL[league]} only: other competitions and formats are not counted. Matches counts every game the player was in the playing XI for.`}
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Batting</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="Matches" value={String(career.matches)} />
              <Stat label="Innings" value={String(career.inningsBatted)} />
              <Stat label="Runs" value={String(career.runs)} />
              <Stat label="Highest" value={career.highestScore === null ? "-" : String(career.highestScore)} />
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
                <Stat label="Average" value={fmt(career.wickets > 0 ? career.runsConceded / career.wickets : null)} />
                <Stat label="Economy" value={fmt(career.economy, 2)} />
                <Stat label="5w" value={String(career.fiveWicketHauls)} />
              </div>
            </div>
          )}
          {career.catches > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Fielding</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="Catches & stumpings" value={String(career.catches)} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHeader>Career Splits</SectionHeader>
        <CricketSplitTabs
          tabs={CRICKET_SPLIT_DIMENSIONS.map((d) => ({
            key: d.key,
            label: d.label,
            panel: <SplitTable label={d.label} rows={splits[d.key]} league={league} />,
          }))}
        />
      </section>
    </>
  );
}
