// The meta and structured-data descriptions of the player pages, built from the profile so a test can hold every
// sentence to what the profile has. A player whose regular season is only ESPN's stored games (`storedGamesOnly`: no
// box-score row, so no clubs, figures or game log) gets sentences that claim only the games; every other profile gets
// the sentences it always had.
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "./leagues";
import { gamesAndFigures } from "./playerCopy";
import { formatStat, metaFigures, storedGamesOnly, type PlayerProfile } from "./playerProfile";

const gamesText = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

/** "Cody Gakpo Premier League stats: 89 apps, 21 goals, 12 assists for Liverpool since 2022-23." The figures are the
 * description, so the snippet answers the search. The page shows the long form; the meta description gets the short one,
 * since search results cut a description off at about 155 characters. */
export function profileSummary(league: League, name: string, profile: PlayerProfile | null, short = false): string {
  if (!profile || profile.games === 0) return `${name} ${LEAGUE_LABEL[league]} stats, season by season, with a game-by-game log.`;
  if (storedGamesOnly(profile)) {
    const label = (season: number) => formatSeasonLabel(league, season) ?? String(season);
    const first = profile.seasons[profile.seasons.length - 1].season;
    const last = profile.seasons[0].season;
    return `${name} ${LEAGUE_LABEL[league]} stats: ${gamesText(profile.games)} played ${first === last ? `in ${label(first)}` : `from ${label(first)} to ${label(last)}`}, as counted by ESPN.`;
  }
  const headline = profile.profile.specs.filter((s) => s.headline).slice(0, 3);
  const perGame = profile.sport === "nba" && headline.every((s) => s.agg === "avg");
  const figures = headline.map((s) => `${formatStat(s, profile.career[s.key])} ${s.title.toLowerCase()}${!perGame && profile.sport === "nba" && s.agg === "avg" ? " per game" : ""}`);
  const teams = profile.teams.map((t) => t.name);
  const since = profile.seasons[profile.seasons.length - 1]?.season;
  const games = `${profile.games} ${profile.profile.gamesLabel === "Apps" ? "appearances" : "games"}`;
  // Averages are quoted only where they cover the games named beside them: an NBA career with a season still short of
  // ESPN's games on its box rows (or made only of games with no box score) gives the games and clubs alone.
  const quoted = metaFigures(profile, `${figures.join(", ")}${perGame ? " per game" : ""}`);
  const lead = `${name} ${LEAGUE_LABEL[league]} stats: ${gamesAndFigures(games, quoted)} for ${teams.join(" and ")}${since ? ` since ${formatSeasonLabel(league, since)}` : ""}.`;
  if (!short) return `${lead} Season-by-season totals, full game log, home and away and opponent splits, best games and milestones.`;
  const tail = " Game log, splits and best games.";
  return lead.length + tail.length <= 160 ? lead + tail : lead;
}

/** The meta description of a player's season page; `regular` is that season's regular-season profile when it has games,
 * else null (a season the player was only named in a squad for, or made of playoff games). */
export function seasonDescription(league: League, name: string, seasonLabel: string, regular: PlayerProfile | null): string {
  const lead = `${name} ${LEAGUE_LABEL[league]} statistics for the ${seasonLabel} season.`;
  if (!regular) return `${lead} Game-by-game log, splits and best games.`;
  if (storedGamesOnly(regular)) return `${lead} ${gamesText(regular.games)} in the regular season, as counted by ESPN.`;
  const headline = regular.profile.specs.filter((s) => s.headline).slice(0, 3);
  // Averages are quoted only where they cover the games named beside them: an NBA season still short of ESPN's games
  // on its box rows (or made only of games with no box score) gives the games and clubs alone.
  const quoted = metaFigures(regular, headline.map((s) => `${formatStat(s, regular.career[s.key])} ${s.title.toLowerCase()}`).join(", "));
  return `${lead} ${gamesAndFigures(`${regular.games} ${regular.profile.gamesLabel === "Apps" ? "appearances" : "games"}`, quoted)} for ${regular.teams.map((t) => t.name).join(" and ")}. Game-by-game log, splits and best games.`;
}
