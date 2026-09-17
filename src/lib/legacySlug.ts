import { notFound, permanentRedirect } from "next/navigation";
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
