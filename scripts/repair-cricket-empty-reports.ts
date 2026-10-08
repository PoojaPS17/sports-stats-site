// One-off repair: IPL / BBL games whose stored match report (game_details) is the empty template
// (`scorecard: []`) although the game and its player figures are on file, so the match page shows no
// scorecard. The daily top-up never revisits them (it only reads games with no player rows).
//
// Each game's summary is re-read from ESPN through the shared multi-path reader (the competition's own
// path, then the IPL path that serves any cricket event; 502 bodies rejected and retried) and stored with
// storeCricketDetailsIfMissing, which writes only when the stored report has no scorecard rows, so a
// good report is never replaced by a thinner one. Player figures and the game row are not touched.
//
//   npx tsx --env-file=.env.local scripts/repair-cricket-empty-reports.ts [--ids ipl:1359477,bbl:524932] [--dry-run]
//
// Without --ids it repairs the six known games. Exit 1 when any game could not be read or still has
// no scorecard on ESPN; the games that could be repaired are still repaired.
import { pool } from "./lib/db";
import { defaultSummaryFetcher } from "./lib/cricket-topup";
import { extractCricketMatchStats } from "./lib/cricket-career";
import { scorecardHasRowsSql, storeCricketDetailsIfMissing } from "./lib/cricket-player-rows";
import { extractGameDetails } from "../src/lib/matchDetail";
import { playerOfTheMatchLeaders } from "./import-cricket-espn";

export const KNOWN_EMPTY_REPORTS = ["ipl:1359477", "ipl:1359476", "ipl:1473440", "bbl:524932", "bbl:524937", "bbl:897755"];
const LEAGUES = ["ipl", "bbl"];

export interface RepairLine {
  key: string;
  outcome: "repaired" | "would repair" | "already has a scorecard" | "no game row" | "no scorecard on ESPN" | "failed";
  detail: string;
}

export function parseKeys(raw: string): { league: string; id: string }[] {
  const out = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      const [league, id, ...rest] = part.split(":");
      if (rest.length > 0 || !LEAGUES.includes(league) || !/^\d+$/.test(id ?? "")) throw new Error(`bad --ids entry "${part}" (want ipl:espnId or bbl:espnId)`);
      return { league, id };
    });
  if (out.length === 0) throw new Error("--ids needs at least one league:espnId");
  return out;
}

export async function repairEmptyReports(keys: { league: string; id: string }[], dryRun: boolean, fetchSummary = defaultSummaryFetcher(), delayMs = 150): Promise<RepairLine[]> {
  const lines: RepairLine[] = [];
  for (const { league, id } of keys) {
    const key = `${league}:${id}`;
    try {
      const { rows } = await pool.query(
        `select g.home_team_espn_id, g.away_team_espn_id, g.date, ${scorecardHasRowsSql("d.details")} as has_rows
         from games g left join game_details d on d.league = g.league and d.game_espn_id = g.espn_id
         where g.league = $1 and g.espn_id = $2`,
        [league, id]
      );
      if (rows.length === 0) {
        lines.push({ key, outcome: "no game row", detail: "nothing to repair" });
        continue;
      }
      if (rows[0].has_rows) {
        lines.push({ key, outcome: "already has a scorecard", detail: "left alone" });
        continue;
      }
      const summary = await fetchSummary({ league, espn_id: id, home_team_espn_id: rows[0].home_team_espn_id, away_team_espn_id: rows[0].away_team_espn_id, series_id: null, date: rows[0].date });
      const { players } = extractCricketMatchStats(summary);
      const details = extractGameDetails("cricket", summary, rows[0].home_team_espn_id, rows[0].away_team_espn_id);
      const leaders = playerOfTheMatchLeaders(summary, players);
      if (leaders) details.leaders = leaders;
      const battingRows = details.scorecard.reduce((n, s) => n + s.battingRows.length, 0);
      const bowlingRows = details.scorecard.reduce((n, s) => n + s.bowlingRows.length, 0);
      if (battingRows + bowlingRows === 0) {
        lines.push({ key, outcome: "no scorecard on ESPN", detail: "ESPN has no batting or bowling rows for it (yet)" });
      } else if (dryRun) {
        lines.push({ key, outcome: "would repair", detail: `${details.scorecard.length} innings sides, ${battingRows} batting rows, ${bowlingRows} bowling rows${leaders ? ", player of the match" : ""}` });
      } else {
        const wrote = await storeCricketDetailsIfMissing(pool, league, id, details);
        lines.push({ key, outcome: wrote ? "repaired" : "already has a scorecard", detail: `${battingRows} batting rows, ${bowlingRows} bowling rows` });
      }
    } catch (err) {
      lines.push({ key, outcome: "failed", detail: err instanceof Error ? err.message : String(err) });
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return lines;
}

/** Exit status: any game that could not be read, or that ESPN has no scorecard for, is a failure. */
export const hasFailures = (lines: RepairLine[]) => lines.some((l) => l.outcome === "failed" || l.outcome === "no scorecard on ESPN");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const i = args.indexOf("--ids");
  let keys;
  try {
    keys = parseKeys(i >= 0 ? (args[i + 1] ?? "") : KNOWN_EMPTY_REPORTS.join(","));
  } catch (err) {
    console.error(`[repair-cricket-empty-reports] ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  console.log(`[repair-cricket-empty-reports] ${keys.length} game(s)${dryRun ? " (dry run)" : ""}`);
  const lines = await repairEmptyReports(keys, dryRun);
  for (const l of lines) console.log(`[repair-cricket-empty-reports] ${l.key}: ${l.outcome.toUpperCase()} - ${l.detail}`);
  await pool.end();
  process.exit(hasFailures(lines) ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[repair-cricket-empty-reports] failed:", err);
    process.exit(1);
  });
}
