// "Did you know" lines for a cricket match or series: facts computed from the scorecard or the stored
// per-match figures, never written by hand, so each line is true by construction and only appears when
// its inputs are there. Pure: the match page and the series page pass in what they already hold.
import type { CricketTeamScorecard } from "./matchDetail";
import type { CricketSeriesStats } from "./cricketSeriesStats";
import { teamDisplayName } from "./teamName";
import { maskUnrecorded } from "./cricketRecorded";

const MAX_LINES = 3;
const num = (s: string | undefined) => (s != null && /^\d+$/.test(s.trim()) ? Number(s) : null);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function column(labels: string[], label: string): number {
  return labels.indexOf(label);
}

/** Up to three lines about a match that has been played, from its scorecard. Empty for a match with none. */
export function matchDidYouKnow(stored: CricketTeamScorecard[]): string[] {
  const scorecard = maskUnrecorded(stored);
  const lines: { score: number; text: string }[] = [];
  let fours = 0;
  let sixes = 0;
  let batRuns = 0;
  let boundaryData = false;
  let boundaryGap = false; // some batter's boundaries unrecorded: a share of ALL runs would be understated
  let top: { name: string; team: string; runs: number; total: number | null } | null = null;

  for (const t of scorecard) {
    const r = column(t.battingLabels, "R");
    const f = column(t.battingLabels, "4s");
    const x = column(t.battingLabels, "6s");
    if (r < 0) continue;
    for (const row of t.battingRows) {
      const runs = num(row.stats[r]);
      if (runs === null) continue;
      batRuns += runs;
      if (f >= 0 && x >= 0 && num(row.stats[f]) !== null && num(row.stats[x]) !== null) {
        boundaryData = true;
        fours += num(row.stats[f]) ?? 0;
        sixes += num(row.stats[x]) ?? 0;
      } else boundaryGap = true;
      // The innings total this batter's runs sit in (a first-class batter has two innings; the share needs one).
      const total = row.innings != null ? (t.innings?.find((i) => i.period === row.innings)?.runs ?? null) : t.innings?.length === 1 ? t.innings[0].runs : null;
      if (!top || runs > top.runs) top = { name: row.name, team: teamDisplayName(t.teamName), runs, total };
    }
  }

  // Boundaries: the share of the batters' runs that came in fours and sixes.
  if (boundaryData && !boundaryGap && batRuns >= 50) {
    const share = Math.round(((fours * 4 + sixes * 6) / batRuns) * 100);
    lines.push({ score: 3, text: `${plural(fours + sixes, "boundary", "boundaries")} (${plural(fours, "four")}, ${plural(sixes, "six", "sixes")}) brought ${share}% of the runs off the bat.` });
  }
  // A big share of one innings from one batter.
  if (top && top.total && top.total >= 60) {
    const share = Math.round((top.runs / top.total) * 100);
    if (share >= 40 && top.runs >= 30) lines.push({ score: 4, text: `${top.name} scored ${top.runs} of ${top.team}'s ${top.total}, ${share}% of the innings.` });
  }
  // Extras that out-scored every batter in an innings.
  for (const t of scorecard) {
    const r = column(t.battingLabels, "R");
    if (r < 0) continue;
    for (const inn of t.innings ?? []) {
      const rows = t.battingRows.filter((row) => (row.innings ?? inn.period) === inn.period);
      if (rows.length === 0 || rows.some((row) => num(row.stats[r]) === null)) continue;
      const batted = rows.reduce((sum, row) => sum + (num(row.stats[r]) ?? 0), 0);
      const extras = inn.runs - batted;
      const best = Math.max(...rows.map((row) => num(row.stats[r]) ?? 0));
      if (extras >= 15 && extras > best) lines.push({ score: 2, text: `Extras were ${teamDisplayName(t.teamName)}'s top scorer in innings ${inn.period}: ${extras}, more than any batter's ${best}.` });
    }
  }
  // The tightest bowling spell: most economical bowler with at least two overs and a wicket.
  for (const t of scorecard) {
    const o = column(t.bowlingLabels, "O");
    const m = column(t.bowlingLabels, "M");
    const rr = column(t.bowlingLabels, "R");
    const w = column(t.bowlingLabels, "W");
    if ([o, m, rr, w].some((i) => i < 0)) continue;
    for (const row of t.bowlingRows) {
      const overs = Number(row.stats[o]);
      const maidens = num(row.stats[m]);
      const conceded = num(row.stats[rr]);
      const wickets = num(row.stats[w]);
      if (!Number.isFinite(overs) || maidens === null || conceded === null || wickets === null) continue;
      if (maidens >= 3 && wickets >= 1) lines.push({ score: 3, text: `${row.name} bowled ${plural(maidens, "maiden")} on the way to ${wickets}/${conceded}.` });
    }
  }

  return lines
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LINES)
    .map((l) => l.text);
}

/** Up to three lines about a series, from the figures stored for its matches. Empty until two matches have figures. */
export function seriesDidYouKnow(stats: CricketSeriesStats | null): string[] {
  if (!stats || stats.matches < 2) return [];
  const lines: string[] = [];
  const { totals, matches } = stats;
  if (totals.hasBoundaries && totals.sixes > 0) {
    lines.push(`${plural(totals.sixes, "six", "sixes")} and ${plural(totals.fours, "four")} in ${matches} matches so far: ${(totals.sixes / matches).toFixed(1)} sixes a match.`);
  }
  if (stats.mostSixes && stats.mostSixes.sixes >= 3) lines.push(`${stats.mostSixes.name} has hit the most sixes: ${stats.mostSixes.sixes}.`);
  if (totals.wickets > 0) lines.push(`${plural(totals.wickets, "wicket")} have fallen to bowlers, ${(totals.wickets / matches).toFixed(1)} a match.`);
  return lines.slice(0, MAX_LINES);
}
