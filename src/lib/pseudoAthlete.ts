// ESPN lists a team-credited line in some NFL box-score tables ("Team") as an athlete with a negative id
// (-8801, -13974), which the loader used to store like any player. It is not a person: it has no page, and it
// must not be listed, linked or ranked as a player. The line itself is real ESPN data and stays in the game's
// box score; only PLAYER presentations exclude it.
//
// One rule, one place: an ESPN athlete id that starts with "-". A real athlete never has a negative id, and the
// name is never consulted (a real player may well be called "Team Something"). The TS check and the SQL text
// below are twins; every player-facing query uses the SQL one so the two cannot drift.

/** True for an ESPN pseudo-athlete id such as "-8801". */
export function isPseudoAthleteId(id: string): boolean {
  return id.startsWith("-");
}

/**
 * The SQL twin of isPseudoAthleteId, for a WHERE / ON clause: true for a real athlete's id column.
 * Defaults to the `players` alias every query uses (`p.espn_id not like '-%'`).
 */
export function notPseudoAthleteSql(column = "p.espn_id"): string {
  return `${column} not like '-%'`;
}
