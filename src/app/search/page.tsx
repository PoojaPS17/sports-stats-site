import { pageMeta } from "@/lib/metadata";
import { teamDisplayName } from "@/lib/teamName";
import { f1TeamLabel } from "@/lib/f1Names";
import Link from "next/link";
import { search, searchGames, LEAGUE_LABEL, isLeague, type SearchResult, type GameSearchResult } from "@/lib/queries";
import { formatGameDate } from "@/lib/gameDay";
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
  if (r.type === "series") return `/cricket/series/${r.slug}`;
  if (r.league === "f1") return r.type === "team" ? `/f1/teams/${r.slug}` : `/f1/drivers/${r.slug}`;
  if (isTour(r.league)) return `/tennis/${r.league}/players/${r.slug}`;
  return r.type === "team" ? `/${r.league}/teams/${r.slug}` : `/${r.league}/players/${r.slug}`;
}

// An F1 constructor is listed under the name it races under now (Red Bull Racing), not the short name ESPN stores.
function resultName(r: SearchResult): string {
  if (r.league === "f1" && r.type === "team") return f1TeamLabel(new Date().getUTCFullYear(), r.name) ?? r.name;
  return teamDisplayName(r.name);
}

function resultLeagueLabel(r: SearchResult): string {
  if (r.type === "series") return "Cricket";
  if (r.league === "f1") return "F1";
  if (isTour(r.league)) return TOUR_LABEL[r.league];
  if (isLeague(r.league)) return LEAGUE_LABEL[r.league];
  return r.league;
}

// Enough for a common surname across every league; the page says so when the list was cut.
const RESULT_LIMIT = 60;

function gameLine(g: GameSearchResult): string {
  const score = g.completed && g.home_score != null && g.away_score != null ? `${g.home_score}-${g.away_score}` : null;
  return `${formatGameDate(g.date, g.league, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, g.local_date)}${score ? ` · ${score}` : ""}`;
}

export const metadata = pageMeta("Search", "Find any team, player or driver across football, NFL, NBA, cricket, tennis and F1.", "/search", { noindex: true });

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [results, games] = q.trim() ? await Promise.all([search(q.trim(), RESULT_LIMIT), searchGames(q.trim())]) : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Search</h1>
        <div className="mt-3 max-w-md">
          <SearchBar initialQuery={q} />
        </div>
      </div>

      {q.trim() === "" ? (
        <p className="text-sm text-[var(--text-muted)]">Search for any team, driver, player or cricket series we track.</p>
      ) : results.length === 0 && games.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No results for &ldquo;{q}&rdquo;.</p>
      ) : (
        <>
          {games.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-muted)]">Games</h2>
              {games.map((g) => (
                <Link key={`${g.league}-${g.espn_id}`} href={`/${g.league}/games/${g.espn_id}`} className="card flex flex-col px-4 py-3">
                  <span className="font-medium">{`${g.away} at ${g.home}`}</span>
                  <span className="text-xs text-[var(--text-muted)]">{`${isLeague(g.league) ? LEAGUE_LABEL[g.league] : g.league} · ${gameLine(g)}`}</span>
                </Link>
              ))}
            </section>
          )}
          {results.length > 0 && (
            <section className="flex flex-col gap-2">
              {games.length > 0 && <h2 className="text-sm font-semibold text-[var(--text-muted)]">Teams, players and series</h2>}
              {results.map((r, i) => (
                <Link key={i} href={resultHref(r)} className="card flex items-center gap-3 px-4 py-3">
                  <TeamLogo name={resultName(r)} logoUrl={r.image} size={32} />
                  <div className="flex flex-col">
                    <span className="font-medium">{resultName(r)}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {resultLeagueLabel(r)} {r.type === "player" ? "player" : r.type === "series" ? "series" : "team"}
                      {r.subtitle ? ` · ${teamDisplayName(r.subtitle)}` : ""}
                    </span>
                  </div>
                </Link>
              ))}
              {results.length >= RESULT_LIMIT && <p className="text-sm text-[var(--text-muted)]">Showing the first {RESULT_LIMIT}. Add a first name or a team to narrow it down.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
