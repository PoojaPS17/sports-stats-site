// "Copy as text": the scorecard and the Playing XI as plain text for a WhatsApp or SMS message. No markdown, no emoji,
// one fact per line. Pure functions of the same data the cards draw from.
import type { ScorecardTabData } from "./cricketScorecardView";
import type { TeamXi } from "./cricketPlayingXi";
import { teamDisplayName } from "./teamName";

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** "Team 1st innings: 276/6 (50 ov)", or the team alone when the card has neither label nor total. */
function inningsTitle(tab: ScorecardTabData): string {
  const { team, label, total } = tab.block;
  const part = label && label !== "innings" ? ` ${label}` : "";
  return `${team}${part}${total ? `: ${total}` : ""}`;
}

/** One innings: its batters with runs (balls), extras, bowlers with figures and the fall of wickets. */
export function inningsText(tab: ScorecardTabData): string {
  const lines: string[] = [inningsTitle(tab), ""];
  const { batting, bowling } = tab.block;
  const batted = batting.rows.filter((r) => NUMERIC.test(r.stats[0] ?? ""));
  const didNot = batting.rows.filter((r) => !NUMERIC.test(r.stats[0] ?? ""));
  if (batted.length > 0) {
    lines.push("Batting");
    for (const r of batted) {
      const star = /not out|retired/i.test(r.dismissal ?? "") ? "*" : "";
      const balls = NUMERIC.test(r.stats[1] ?? "") ? ` (${r.stats[1]})` : "";
      lines.push(`${r.name} ${r.stats[0]}${star}${balls}`);
    }
    if (didNot.length > 0) lines.push(`Did not bat: ${didNot.map((r) => r.name).join(", ")}`);
    if (tab.extras.total !== null) lines.push(`Extras ${tab.extras.total}${tab.extras.breakdown ? ` (${tab.extras.breakdown})` : ""}`);
  }
  const bowled = bowling.rows.filter((r) => NUMERIC.test(r.stats[3] ?? "") && NUMERIC.test(r.stats[2] ?? ""));
  if (bowled.length > 0) {
    if (lines.at(-1) !== "") lines.push("");
    lines.push(bowling.title.startsWith("Bowling · ") ? `Bowling (${bowling.title.slice("Bowling · ".length)})` : "Bowling");
    for (const r of bowled) lines.push(`${r.name} ${r.stats[3]}/${r.stats[2]} (${r.stats[0]} ov)`);
  }
  if (tab.fallOfWickets) {
    if (lines.at(-1) !== "") lines.push("");
    lines.push(`Fall of wickets: ${tab.fallOfWickets}`);
  }
  return lines.join("\n").trimEnd();
}

/** The whole scorecard under the match name and result, ending with the match link. */
export function scorecardText(args: { matchName: string; result: string | null; tabs: ScorecardTabData[]; link: string }): string {
  const head = [args.matchName, args.result ? teamDisplayName(args.result) : null].filter(Boolean).join("\n");
  return [head, ...args.tabs.map(inningsText), args.link].join("\n\n");
}

/** One innings (the open tab) under the match name and result, ending with the match link. */
export function inningsShareText(args: { matchName: string; result: string | null; tab: ScorecardTabData; link: string }): string {
  return scorecardText({ ...args, tabs: [args.tab] });
}

/** "Babar Azam (c)", "Mohammad Rizwan (wk)", "Sam Curran (c, wk)". */
export function xiName(p: TeamXi["players"][number]): string {
  const marks = [p.captain ? "c" : null, p.keeper ? "wk" : null].filter(Boolean).join(", ");
  return marks ? `${p.name} (${marks})` : p.name;
}

/** Both sides' Playing XI, numbered, captain (c) and wicketkeeper (wk) marked. */
export function xiText(args: { matchName: string; sides: TeamXi[]; link: string }): string {
  const blocks = args.sides.map((s) => [teamDisplayName(s.team), ...s.players.map((p, i) => `${i + 1}. ${xiName(p)}`)].join("\n"));
  return [`${args.matchName}: Playing XI`, ...blocks, args.link].join("\n\n");
}
