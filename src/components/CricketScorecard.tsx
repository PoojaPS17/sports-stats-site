import Link from "next/link";
import type { League } from "@/lib/queries";
import type { CricketTeamScorecard, CricketInningsRow, CricketInningsTotal } from "@/lib/matchDetail";

function ScorecardTable({
  league,
  title,
  labels,
  rows,
  playerSlugs,
}: {
  league: League;
  title: string;
  labels: string[];
  rows: CricketInningsRow[];
  playerSlugs: Map<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <p className="px-4 pt-3 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="table-head text-left">
            <th className="py-2 pl-4 font-medium">Player</th>
            {labels.map((label) => (
              <th key={label} className="px-2 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const slug = playerSlugs.get(row.athleteId);
            return (
              <tr key={`${row.athleteId}-${row.innings ?? 0}-${idx}`} className="border-t border-[var(--border)]">
                <td className="py-2 pl-4 font-medium">
                  {slug ? (
                    <Link href={`/${league}/players/${slug}`} className="hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                  {row.dismissal && <span className="block text-xs font-normal text-[var(--text-muted)]">{row.dismissal}</span>}
                </td>
                {row.stats.map((value, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// One card per team: the shape of reports stored before innings were tracked, which
// is fine for a limited-overs match where each side bats once.
export function CricketScorecard({ league, team, playerSlugs }: { league: League; team: CricketTeamScorecard; playerSlugs: Map<string, string> }) {
  if (team.battingRows.length === 0 && team.bowlingRows.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{team.teamName}</h3>
      <ScorecardTable league={league} title="Batting" labels={team.battingLabels} rows={team.battingRows} playerSlugs={playerSlugs} />
      <ScorecardTable league={league} title="Bowling" labels={team.bowlingLabels} rows={team.bowlingRows} playerSlugs={playerSlugs} />
    </div>
  );
}

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

function totalText(t: CricketInningsTotal | undefined): string | null {
  if (!t) return null;
  const note = t.description.toLowerCase();
  const score = t.wickets >= 10 || note === "all out" ? `${t.runs} all out` : note.includes("declared") ? `${t.runs}/${t.wickets} declared` : `${t.runs}/${t.wickets}`;
  return `${score} (${t.overs} ov)`;
}

// One card per innings in match order, the way a scorecard reads: the batting side's
// batters, then the fielding side's bowlers. A first-class match has four cards; a
// limited-overs match two; a super over adds its own.
export function CricketScorecards({ league, scorecard, playerSlugs }: { league: League; scorecard: CricketTeamScorecard[]; playerSlugs: Map<string, string> }) {
  const tracked = scorecard.some((t) => t.battingRows.some((r) => r.innings !== undefined) || t.bowlingRows.some((r) => r.innings !== undefined));
  if (!tracked) {
    return (
      <>
        {scorecard.map((team) => (
          <CricketScorecard key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
        ))}
      </>
    );
  }

  const periods = Array.from(new Set(scorecard.flatMap((t) => [...t.battingRows, ...t.bowlingRows].map((r) => r.innings ?? 0)).filter((n) => n > 0))).sort((a, b) => a - b);

  return (
    <>
      {periods.map((period) => {
        const batting = scorecard.find((t) => t.battingRows.some((r) => r.innings === period)) ?? scorecard.find((t) => (t.innings ?? []).some((i) => i.period === period));
        const bowling = scorecard.find((t) => t !== batting && t.bowlingRows.some((r) => r.innings === period));
        const battingRows = batting?.battingRows.filter((r) => r.innings === period) ?? [];
        const bowlingRows = bowling?.bowlingRows.filter((r) => r.innings === period) ?? [];
        if (battingRows.length === 0 && bowlingRows.length === 0) return null;

        const teamPeriods = Array.from(new Set([...(batting?.innings ?? []).map((i) => i.period), ...(batting?.battingRows ?? []).map((r) => r.innings ?? 0)].filter((n) => n > 0))).sort((a, b) => a - b);
        const total = batting?.innings?.find((i) => i.period === period);
        const ordinal = teamPeriods.indexOf(period);
        const label = /super/i.test(total?.description ?? "") ? "Super over" : teamPeriods.length > 1 && ordinal >= 0 ? `${ORDINAL[ordinal] ?? `${ordinal + 1}th`} innings` : "innings";
        const totalLabel = totalText(total);

        return (
          <div key={period} className="card overflow-hidden">
            <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">
              <span>
                {batting?.teamName ?? "Batting"} <span className="font-semibold text-[var(--text-muted)]">{label}</span>
              </span>
              {totalLabel && <span className="tabular-nums">{totalLabel}</span>}
            </h3>
            <ScorecardTable league={league} title="Batting" labels={batting?.battingLabels ?? []} rows={battingRows} playerSlugs={playerSlugs} />
            <ScorecardTable league={league} title={bowling ? `Bowling · ${bowling.teamName}` : "Bowling"} labels={bowling?.bowlingLabels ?? []} rows={bowlingRows} playerSlugs={playerSlugs} />
          </div>
        );
      })}
    </>
  );
}
