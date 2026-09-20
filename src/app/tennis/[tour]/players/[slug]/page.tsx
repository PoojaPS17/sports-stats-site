import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { playerNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { ImageActions } from "@/components/ImageActions";
import { TennisPlayerMatchesExportCard, TennisRivalsExportCard, TennisSeasonRecordExportCard } from "@/components/TennisExportCards";

import { Flag, TennisMatchLine } from "@/components/TennisScores";
import { TeamLogo } from "@/components/TeamLogo";
import {
  isTour,
  getTennisPlayerBySlug,
  getTennisPlayerMatches,
  getTennisPlayerRanking,
  getTennisPlayerRivals,
  getTennisPlayerSeasonRecords,
  TOUR_LABEL,
  type TennisMatch,
} from "@/lib/tennis";

export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ tour: string; slug: string }> }): Promise<Metadata> {
  const { tour, slug } = await params;
  if (!isTour(tour)) return {};
  const player = await getTennisPlayerBySlug(tour, slug);
  if (!player) return {};
  const ranking = await getTennisPlayerRanking(tour, player.espn_id);
  return pageMeta(
    player.name,
    `${player.name}${ranking ? `, ${TOUR_LABEL[tour]} No. ${ranking.rank}` : ""}: match results with set scores, season win–loss record, titles and head-to-head records.`,
    `/tennis/${tour}/players/${player.slug}`
  );
}

// Matches grouped by tournament edition, newest first, each group already in
// round order because the list arrives by date descending.
function groupByTournament(matches: TennisMatch[]): { key: string; name: string; id: string | null; season: string; matches: TennisMatch[] }[] {
  const out: { key: string; name: string; id: string | null; season: string; matches: TennisMatch[] }[] = [];
  for (const m of matches) {
    const key = m.tournament_espn_id ?? `${m.tournament_name}-${m.date.slice(0, 4)}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.matches.push(m);
    else out.push({ key, name: m.tournament_name, id: m.tournament_espn_id, season: m.date.slice(0, 4), matches: [m] });
  }
  return out;
}

export default async function TennisPlayerPage({ params }: { params: Promise<{ tour: string; slug: string }> }) {
  const { tour, slug } = await params;
  if (!isTour(tour)) notFound();

  const player = (await getTennisPlayerBySlug(tour, slug)) ?? (await playerNotFound(tour, slug, (s) => `/tennis/${tour}/players/${s}`));

  const [matches, ranking, records, rivals] = await Promise.all([
    getTennisPlayerMatches(tour, player.espn_id),
    getTennisPlayerRanking(tour, player.espn_id),
    getTennisPlayerSeasonRecords(tour, player.espn_id),
    getTennisPlayerRivals(tour, player.espn_id),
  ]);
  const groups = groupByTournament(matches);
  const career = records.reduce((acc, r) => ({ wins: acc.wins + r.wins, losses: acc.losses + r.losses, titles: acc.titles + r.titles }), { wins: 0, losses: 0, titles: 0 });

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex items-center gap-4 overflow-hidden px-6 py-6">
        <div className="shrink-0 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--surface-muted)]">
          <TeamLogo name={player.name} logoUrl={player.headshot_url} size={72} />
        </div>
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2">
            <Flag code={player.country} size={22} />
            <span className="truncate">{player.name}</span>
          </h1>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {TOUR_LABEL[tour]}
            {player.country ? ` · ${player.country}` : ""}
            {ranking ? ` · Ranked No. ${ranking.rank}${ranking.points ? ` · ${ranking.points.toLocaleString()} pts` : ""}` : ""}
          </p>
          {career.wins + career.losses > 0 && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Singles on file: <span className="font-semibold text-[var(--text)]">{career.wins}–{career.losses}</span>
              {career.titles > 0 && (
                <>
                  {" "}
                  · <span className="font-semibold text-[var(--text)]">{career.titles}</span> title{career.titles === 1 ? "" : "s"}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <AdSlot label="Tennis player top" />

      {records.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionHeader
              description="Singles win–loss by season, from every match on file"
              tools={<ImageActions filename={`tennis-${slug}-season-record`} shareTitle={`${player.name} season record`} width={640} card={<TennisSeasonRecordExportCard tourLabel={TOUR_LABEL[tour]} title={`${player.name}: season record`} subtitle="Singles win–loss by season, from every match on file" records={records} />} />}
            >
              Season record
            </SectionHeader>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-2">Season</th>
                    <th className="px-4 py-2 text-right">W</th>
                    <th className="px-4 py-2 text-right">L</th>
                    <th className="px-4 py-2 text-right">Win %</th>
                    <th className="px-4 py-2 text-right">Titles</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.season} className="table-row">
                      <td className="px-4 py-2 font-semibold">{r.season}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.wins}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.losses}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.wins + r.losses > 0 ? Math.round((100 * r.wins) / (r.wins + r.losses)) : 0}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.titles || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {rivals.length > 0 && (
            <div>
              <SectionHeader
                description="Most-played singles opponents on file"
                tools={<ImageActions filename={`tennis-${slug}-head-to-head`} shareTitle={`${player.name} head-to-head`} width={640} card={<TennisRivalsExportCard tourLabel={TOUR_LABEL[tour]} title={`${player.name}: head-to-head`} subtitle="Most-played singles opponents on file" rivals={rivals} />} />}
              >
                Head-to-head
              </SectionHeader>
              <div className="card overflow-hidden">
                {rivals.map((r) => (
                  <Link key={r.espn_id} href={`/tennis/${tour}/players/${r.slug}`} className="table-row flex items-center gap-3 px-4 py-2 text-sm first:border-t-0">
                    <span className="flex-1 truncate font-semibold">{r.name}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      <span className={r.wins * 2 > r.matches ? "font-bold text-[var(--win)]" : r.wins * 2 < r.matches ? "font-bold text-[var(--live)]" : "font-bold"}>
                        {r.wins}–{r.matches - r.wins}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <SectionHeader
          description="Singles and doubles, newest first"
          tools={matches.length > 0 && <ImageActions filename={`tennis-${slug}-matches`} shareTitle={`${player.name} recent matches`} width={820} card={<TennisPlayerMatchesExportCard title={`${player.name}: recent matches`} subtitle="Singles and doubles, newest first" matches={matches} />} />}
        >
          Matches
        </SectionHeader>
        {groups.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No matches recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.key} className="card overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
                  <h3 className="truncate text-sm font-bold">
                    {g.id ? (
                      <Link href={`/tennis/tournaments/${g.id}`} className="hover:text-[var(--accent)]">
                        {g.name}
                      </Link>
                    ) : (
                      g.name
                    )}
                  </h3>
                  <span className="text-xs text-[var(--text-muted)]">{g.season}</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {g.matches.map((m) => (
                    <TennisMatchLine key={m.espn_id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--text-muted)]">
        <Link href={`/tennis/${tour}/rankings`} className="text-[var(--accent)] hover:underline">
          View full {TOUR_LABEL[tour]} rankings →
        </Link>
      </p>
    </div>
  );
}
