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
