import { pool } from "./db";
import { resolveTeamLogo } from "../../src/lib/teamLogos";
import { slugify } from "./espn";

// A hex color comes back bare ("552583") from the site API's /teams and scoreboard
// `teams[]` shapes, but already `#`-prefixed ("#14c9e1") from an event's own embedded
// home/away team object (cricket backfill's only team source for most competitions,
// since there's no working /teams endpoint) — strip any existing "#" before adding
// one so it's never doubled into an invalid "##...".
function normalizeColor(raw: unknown): string | null {
  if (!raw) return null;
  return `#${String(raw).replace(/^#/, "")}`;
}

// ESPN occasionally has a not-yet-determined playoff/qualifier slot show up as a
// placeholder "team" (e.g. "TBA") in an event's competitor data — not a real team,
// so it shouldn't get its own team page or clutter a teams index.
function isPlaceholderTeam(name: string): boolean {
  return /^(tba|tbd|to be (announced|determined))$/i.test(name.trim());
}

// `league` is a plain scoping string, not the team-sports `League` union — F1's
// constructors reuse this same table/function with league='f1', which isn't a
// `League` value (same reasoning as uniqueSlugFor in players.ts for tennis's tours).
export async function upsertTeam(league: string, team: any) {
  const name = team?.displayName ?? team?.name;
  if (!team?.id || !name || isPlaceholderTeam(name)) return;
  // The event-embedded team object (cricket's usual source) has a singular `logo`
  // string field instead of the site API's `logos` array.
  const logo = resolveTeamLogo(team.id, team.logos?.find((l: any) => l.rel?.includes("default"))?.href ?? team.logos?.[0]?.href ?? team.logo ?? null);
  const color = normalizeColor(team.color);
  const alternateColor = normalizeColor(team.alternateColor);
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
    [league, team.id, name, slugify(name), team.abbreviation ?? null, logo, color, alternateColor]
  );
}
