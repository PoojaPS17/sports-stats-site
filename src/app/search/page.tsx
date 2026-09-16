import Link from "next/link";
import { search, LEAGUE_LABEL } from "@/lib/queries";
import { TeamLogo } from "@/components/TeamLogo";
import { SearchBar } from "@/components/SearchBar";

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
        <p className="text-sm text-[var(--text-muted)]">Search for any NBA or NFL team or player.</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No results for &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <Link
              key={i}
              href={r.type === "team" ? `/${r.league}/teams/${r.slug}` : `/${r.league}/players/${r.slug}`}
              className="card flex items-center gap-3 px-4 py-3 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <TeamLogo name={r.name} logoUrl={r.image} size={32} />
              <div className="flex flex-col">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {LEAGUE_LABEL[r.league]} {r.type === "player" ? "player" : "team"}
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
