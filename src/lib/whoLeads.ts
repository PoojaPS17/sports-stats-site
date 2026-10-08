// "Who leads" on the first-visit homepage: for each competition that is in season, the player at the top of its
// leader boards (the same boards the league's Leaders page prints), with the season they are for. Pure rules only;
// the reads are in whoLeadsData.ts.
//
// Rules:
//   - a board's leader is the player on rank 1; when others share that figure they are named too (the boards on the
//     page do the same), and a tie that fills the whole top three is "3 or more level" because a longer tie is cut off;
//   - cricket's sixes board is left out: scorecards often did not record boundaries, so a sixes total can undercount
//     and its leader may be wrong;
//   - a competition is "in season" only when its own recap says the season is not over (offseason.ts seasonIsOver) and
//     it has a result in the last IN_SEASON_DAYS days, so a season that stalled is not presented as current.
import type { LeaderRow } from "./queries";
import { formatLeaderValue } from "./leaders";

export const IN_SEASON_DAYS = 45;
/** Cards on the module: the competitions with the most recent results first. */
export const MAX_LEAGUE_CARDS = 6;

/** The boards shown per league: cricket's sixes board is not (see above). */
export const SIXES_UNIT = "6s";

export interface LeaderPerson {
  name: string;
  slug: string;
  team: string | null;
}

export interface LeaderEntry {
  label: string;
  unit: string;
  /** The figure as the Leaders page prints it. */
  figure: string;
  people: LeaderPerson[];
  /** True when the tie fills the top three, so there may be more level than are named. */
  moreLevel: boolean;
}

export interface LeagueLeaders {
  league: string;
  leagueLabel: string;
  seasonLabel: string;
  /** Date of the competition's last result, ISO. */
  lastResultOn: string;
  entries: LeaderEntry[];
}

/** The leader (or leaders, when level) of one board; null when the board has no rows. */
export function boardLeader(board: { label: string; unit: string; rows: LeaderRow[] }): LeaderEntry | null {
  const rows = board.rows;
  if (rows.length === 0) return null;
  const top = rows[0].value;
  if (!(top > 0)) return null;
  const level = rows.filter((r) => r.value === top);
  // `rank` is absent on cricket boards (numbered by position); equal figures are level either way.
  const people = level.slice(0, 2).map((r) => ({ name: r.name, slug: r.slug, team: r.team_name }));
  return {
    label: board.label,
    unit: board.unit,
    figure: formatLeaderValue(top, board.unit),
    people,
    moreLevel: level.length >= 3,
  };
}

export function isRecent(lastResult: string | Date | null, now: Date, days = IN_SEASON_DAYS): boolean {
  if (!lastResult) return false;
  const t = new Date(lastResult).getTime();
  return Number.isFinite(t) && t <= now.getTime() + 5 * 60_000 && now.getTime() - t <= days * 86_400_000;
}
