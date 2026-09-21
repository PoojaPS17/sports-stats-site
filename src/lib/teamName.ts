// A women's side is written the way ESPN and Cricinfo write it: "India Women", "Hobart Hurricanes
// Women". The site used to shorten it to the abbreviation's form, "India-W", which no reference site
// uses. This stays the one place team names pass through for display, so a future rule (a different
// spelling for one side, say) has a single home; today the display name is the name as stored.
//
// It changes only what a visitor reads. Slugs ("india-women"), ids, URLs, page titles and structured
// data are untouched, and abbreviations ("IND-W", ESPN's own code) are separate fields that compact
// layouts use where a full name does not fit: the narrow team column on a game card, and every
// scoreboard image tile that prints `abbreviation` on purpose.
export function teamDisplayName<T extends string | null | undefined>(name: T): T {
  return name;
}

/**
 * The teams a traded player played for in one season (or a career), in the order given, joined with " / " so
 * two clubs never run together ("Chicago BullsCleveland Cavaliers"). Used for a cell's `title` and any plain-text
 * mention; a table draws the same separator between its links.
 */
export function joinTeams(teams: readonly { name: string }[]): string {
  return teams.map((t) => t.name).join(" / ");
}
