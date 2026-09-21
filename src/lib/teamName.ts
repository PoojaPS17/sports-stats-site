// ESPN's long form for a women's side is "<Team> Women" (abbreviation "JPN-W"). On
// cards, tables and headings the site shows the abbreviation's convention on the
// full name instead: "Japan-W". Page titles, descriptions and structured data keep
// ESPN's long form, which is what people search for. Works on a single team name
// and on match names or result text ("Japan Women v India Women", "India Women won
// by 5 wickets"); the possessive in a competition name ("Women's T20 World Cup")
// is left alone.
export function teamDisplayName<T extends string | null | undefined>(name: T): T {
  if (!name) return name;
  return name.replace(/ Wom[ae]n\b(?!['’]s)/g, "-W") as T;
}

/**
 * The teams a traded player played for in one season (or a career), in the order given, joined with " / " so
 * two clubs never run together ("Chicago BullsCleveland Cavaliers"). Used for a cell's `title` and any plain-text
 * mention; a table draws the same separator between its links.
 */
export function joinTeams(teams: readonly { name: string }[]): string {
  return teams.map((t) => t.name).join(" / ");
}
