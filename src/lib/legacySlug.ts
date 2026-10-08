import { notFound, permanentRedirect } from "next/navigation";
import { canonicalTeamSlug } from "./teamAliases";
import { findPlayerSlugByLegacy, findTeamSlugByLegacy, type League } from "./queries";

// Called when a team or player slug isn't found: sends an old accent-mangled slug
// ("atl-tico-madrid") permanently to its current address, and 404s anything else.
export async function teamNotFound(league: League, slug: string, suffix = ""): Promise<never> {
  const current = await findTeamSlugByLegacy(league, slug);
  if (current) permanentRedirect(`/${league}/teams/${current}${suffix}`);
  notFound();
}

export async function playerNotFound(league: string, slug: string, basePath: (current: string) => string): Promise<never> {
  const current = await findPlayerSlugByLegacy(league, slug);
  if (current) permanentRedirect(basePath(current));
  notFound();
}

/** A team page whose slug belongs to a stored duplicate of another team (see teamAliases.ts) goes permanently to the real team's page. */
export function aliasTeamRedirect(league: string, slug: string, suffix = ""): void {
  const canonical = canonicalTeamSlug(league, slug);
  if (canonical) permanentRedirect(`/${league}/teams/${canonical}${suffix}`);
}
