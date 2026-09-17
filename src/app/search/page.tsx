import Link from "next/link";
import { search, LEAGUE_LABEL, isLeague, type SearchResult } from "@/lib/queries";
import { isTour, TOUR_LABEL } from "@/lib/tennisTours";
import { TeamLogo } from "@/components/TeamLogo";
import { SearchBar } from "@/components/SearchBar";

// search() has no league filter, so results span every sport this site tracks — each
// with its own route shape (team-sport leagues use /[league]/teams|players/[slug];
// tennis tours live under /tennis/[tour]/players/[slug], no teams at all; F1 drivers
// are at /f1/drivers/[slug], not /f1/players/[slug]). A single `/${league}/${type}s/${slug}`
// template can't express all three, so this maps each case explicitly instead of
// guessing — the earlier version's guess produced 404s for every tennis result.
function resultHref(r: SearchResult): string {
  if (r.league === "f1") return r.type === "team" ? `/f1/teams/${r.slug}` : `/f1/drivers/${r.slug}`;
  if (isTour(r.league)) return `/tennis/${r.league}/players/${r.slug}`;
  return r.type === "team" ? `/${r.league}/teams/${r.slug}` : `/${r.league}/players/${r.slug}`;
}

function resultLeagueLabel(r: SearchResult): string {
  if (r.league === "f1") return "F1";
  if (isTour(r.league)) return TOUR_LABEL[r.league];
  if (isLeague(r.league)) return LEAGUE_LABEL[r.league];
  return r.league;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? await search(q.trim()) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <div className="mt-3 max-w-md">
          <SearchBar initialQuery={q} />
        </div>
      </div>

      {q.trim() === "" ? (
        <p className="text-sm text-[var(--text-muted)]">Search for any team, driver, or player we track.</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No results for &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <Link
              key={i}
              href={resultHref(r)}
              className="card flex items-center gap-3 px-4 py-3 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <TeamLogo name={r.name} logoUrl={r.image} size={32} />
              <div className="flex flex-col">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {resultLeagueLabel(r)} {r.type === "player" ? "player" : "team"}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
