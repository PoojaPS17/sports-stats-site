// One team stored under two ids. ESPN's feed knows Eswatini as team 300710, but the Cricsheet archive
// (which supplies the 2021 T20Is) names the same side "Swaziland" and the importer filed it under the id
// cs-swaziland: 5 matches (2021-10-17 to 2021-10-22) against Eswatini's 41. The data stays as stored; the
// reading side treats the alias as the canonical team, so the site shows one team, one record and one page.
// Add a row here for any other split found in the same way.
import type { League } from "./leagues";

export interface TeamAlias {
  league: League;
  /** The id the stray team row is stored under. */
  alias: string;
  /** The id of the team it is the same side as. */
  canonical: string;
  /** The alias's page slug, which redirects to the canonical team's. */
  aliasSlug: string;
  canonicalSlug: string;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
}

export const TEAM_ALIASES: TeamAlias[] = [
  {
    league: "t20i",
    alias: "cs-swaziland",
    canonical: "300710",
    aliasSlug: "swaziland",
    canonicalSlug: "eswatini",
    name: "Eswatini",
    abbreviation: "SWZ",
    logoUrl: "https://a.espncdn.com/i/teamlogos/cricket/500/300710.png",
  },
];

/** The ids a team's games and players may be stored under: its own and every alias that is the same team. */
export function teamIdsFor(league: string, teamEspnId: string): string[] {
  return [teamEspnId, ...TEAM_ALIASES.filter((a) => a.league === league && a.canonical === teamEspnId).map((a) => a.alias)];
}

/** The canonical team id for a stored one (the id itself when it is no alias). */
export function canonicalTeamId(league: string, teamEspnId: string): string {
  return TEAM_ALIASES.find((a) => a.league === league && a.alias === teamEspnId)?.canonical ?? teamEspnId;
}

/** The canonical slug when `slug` is an alias's page, else null. */
export function canonicalTeamSlug(league: string, slug: string): string | null {
  return TEAM_ALIASES.find((a) => a.league === league && a.aliasSlug === slug)?.canonicalSlug ?? null;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** SQL for a team id column read as its canonical id: `case when g.league = 't20i' and g.home_team_espn_id = 'cs-swaziland' then '300710' else ... end`. Constants only, no user input. */
export function canonicalTeamIdSql(leagueCol: string, idCol: string): string {
  if (TEAM_ALIASES.length === 0) return idCol;
  const whens = TEAM_ALIASES.map((a) => `when ${leagueCol} = ${lit(a.league)} and ${idCol} = ${lit(a.alias)} then ${lit(a.canonical)}`).join(" ");
  return `(case ${whens} else ${idCol} end)`;
}

/** SQL that is true for a team row that is only an alias of another (to keep it out of lists and the sitemap). */
export function isAliasTeamSql(alias: string): string {
  return TEAM_ALIASES.length === 0 ? "false" : `(${TEAM_ALIASES.map((a) => `(${alias}.league = ${lit(a.league)} and ${alias}.espn_id = ${lit(a.alias)})`).join(" or ")})`;
}
