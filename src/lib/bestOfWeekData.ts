// The stored results behind "Best of this week" (rules in bestOfWeek.ts). Three families of candidate, each read from
// rows the linked page already shows:
//   - a cricket hundred or five-wicket innings, the very rows "Today in three lines" reads, over seven days;
//   - a football hat-trick, an NBA 40-point game or an NFL 400-yard passing game, from the stored box score
//     (the cells the player's own page sums);
//   - a team's winning or unbeaten run, the claim printed in its page header.
// MLB has no stored box score, so it has no individual line here. Facts are cached for ten minutes as plain data; which of
// them are in the last seven days, and which six are shown, is decided at render time, so a cached fact still ages out.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { notPseudoAthleteSql } from "./pseudoAthlete";
import { SOCCER_LEAGUES } from "./leagues";
import { cricketFacts } from "./threeLinesFacts";
import { readCricketRows, readTeamStreakFacts } from "./threeLinesData";
import { BALLS_NOT_RECORDED, HAT_TRICK, FORTY_POINTS, PASSING_BAR, WEEK_HOURS, playerGameFacts, selectBest, type BestFact, type PlayerGameRow } from "./bestOfWeek";

// A box-score cell is text; only a plain whole number counts (a "--" bench line is not a zero).
const numeric = (path: string) => `case when ${path} ~ '^[0-9]+$' then (${path})::int end`;

interface Source {
  kind: PlayerGameRow["kind"];
  leagues: readonly string[];
  figure: string;
  bar: number;
}
const SOURCES: Source[] = [
  { kind: "hat-trick", leagues: SOCCER_LEAGUES, figure: numeric("pgs.stats->'match'->>'G'"), bar: HAT_TRICK },
  { kind: "forty-points", leagues: ["nba"], figure: numeric("pgs.stats->'box'->>'PTS'"), bar: FORTY_POINTS },
  { kind: "passing-yards", leagues: ["nfl"], figure: numeric("pgs.stats->'passing'->>'YDS'"), bar: PASSING_BAR },
];

export async function readPlayerGameRows(hours: number = WEEK_HOURS): Promise<PlayerGameRow[]> {
  const perSource = await Promise.all(
    SOURCES.map(async (src) => {
      const { rows } = await pool.query(
        `select g.league, g.espn_id as game_id, p.espn_id as player_id, p.name as player_name, t.name as team_name, ot.name as opponent_name,
                ${src.figure} as value, g.date as at
         from games g
         join player_game_stats pgs on pgs.league = g.league and pgs.game_espn_id = g.espn_id
         join players p on p.league = pgs.league and p.espn_id = pgs.player_espn_id
         join teams t on t.league = g.league and t.espn_id = pgs.team_espn_id
         join teams ot on ot.league = g.league
           and ot.espn_id = (case when pgs.team_espn_id = g.home_team_espn_id then g.away_team_espn_id else g.home_team_espn_id end)
         where g.league = any($1::text[]) and g.completed and coalesce(g.stage, '') <> 'excluded'
           and g.date <= now() and g.date > now() - make_interval(hours => $2)
           and ${src.figure} >= $3 and ${notPseudoAthleteSql()}
         order by value desc, g.date desc, p.slug asc
         limit 30`,
        [src.leagues, hours, src.bar]
      );
      return rows.map(
        (r): PlayerGameRow => ({
          league: r.league,
          gameId: r.game_id,
          playerId: r.player_id,
          playerName: r.player_name,
          teamName: r.team_name,
          opponentName: r.opponent_name,
          value: Number(r.value),
          kind: src.kind,
          at: new Date(r.at),
        })
      );
    })
  );
  return perSource.flat();
}

/** Every candidate fact for the week. A family whose read fails contributes nothing rather than failing the page. */
export async function readBestFacts(hours: number = WEEK_HOURS): Promise<BestFact[]> {
  const [streaks, cricketRows, players] = await Promise.all([
    readTeamStreakFacts(hours).catch(() => []),
    // A busy week has more than the usual 30 hundreds and five-fors across the domestic competitions.
    readCricketRows(hours, 150).catch(() => []),
    readPlayerGameRows(hours).catch(() => []),
  ]);
  const cricket: BestFact[] = cricketFacts(cricketRows);
  // A hundred whose balls faced the scorecard did not record says so on the card instead of leaving it out silently.
  const unrecorded = new Set(cricketRows.filter((r) => r.runs !== null && r.runs >= 100 && r.ballsFaced === null).map((r) => `cricket:bat:${r.matchId}:${r.playerId}:${r.inningsNo}`));
  for (const f of cricket) if (unrecorded.has(f.id)) f.note = BALLS_NOT_RECORDED;
  return [...streaks, ...cricket, ...playerGameFacts(players)];
}

const cached = unstable_cache(readBestFacts, ["home-best-of-week"], { revalidate: 600 });

/** The cards to show now: possibly none. */
export async function getBestOfWeek(now: Date = new Date()): Promise<BestFact[]> {
  try {
    return selectBest(await cached(), now);
  } catch {
    return [];
  }
}
