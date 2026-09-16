import { pool } from "./db";
import { slugify, type League } from "./espn";

export async function upsertTeam(league: League, team: any) {
  if (!team?.id) return;
  const logo = team.logos?.find((l: any) => l.rel?.includes("default"))?.href ?? team.logos?.[0]?.href ?? null;
  const color = team.color ? `#${team.color}` : null;
  const alternateColor = team.alternateColor ? `#${team.alternateColor}` : null;
  await pool.query(
    `insert into teams (league, espn_id, name, slug, abbreviation, logo_url, color, alternate_color)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (league, espn_id) do update set
       -- keep existing name/slug/logo/color if the current row already has them —
       -- don't let a sparse historical event overwrite a richer current record
       name = coalesce(excluded.name, teams.name),
       slug = coalesce(excluded.slug, teams.slug),
       abbreviation = coalesce(excluded.abbreviation, teams.abbreviation),
       logo_url = coalesce(excluded.logo_url, teams.logo_url),
       color = coalesce(excluded.color, teams.color),
       alternate_color = coalesce(excluded.alternate_color, teams.alternate_color)`,
    [league, team.id, team.displayName ?? team.name, slugify(team.displayName ?? team.name), team.abbreviation ?? null, logo, color, alternateColor]
  );
}
