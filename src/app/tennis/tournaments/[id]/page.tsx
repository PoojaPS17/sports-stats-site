import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { FollowButton } from "@/components/FollowButton";
import { ShareButton } from "@/components/ShareButton";
import { TournamentCalendar } from "@/components/TennisCalendar";
import { TennisDrawSection, formatDateRange, groupMatches } from "@/components/TennisScores";
import { COMPETITION_LABEL, getTennisTournament, getTennisTournamentEditions, getTennisTournamentMatches, getTennisTournamentSeasons, getTennisTournaments } from "@/lib/tennis";

export const revalidate = 300;

const SEASON_RE = /^\d{4}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (SEASON_RE.test(id)) return pageMeta(`${id} Tennis Calendar`, `Every ATP and WTA tournament of ${id} with dates, venues and champions.`, `/tennis/tournaments/${id}`);
  const t = await getTennisTournament(id);
  if (!t) return {};
  const champions = t.champions.map((c) => `${COMPETITION_LABEL[c.competition_type]}: ${c.names.join(" / ")}`).join("; ");
  return pageMeta(
    `${t.name} ${t.season}`,
    `${t.name} ${t.season} results${t.location ? ` from ${t.location}` : ""}: every match by round with set scores${champions ? `. ${champions}` : ""}.`,
    `/tennis/tournaments/${t.espn_id}`
  );
}

export default async function TennisTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A four-digit id is a season: the calendar for that year.
  if (SEASON_RE.test(id)) {
    const seasons = await getTennisTournamentSeasons();
    if (!seasons.includes(Number(id))) notFound();
    return <TournamentCalendar season={Number(id)} seasons={seasons} tournaments={await getTennisTournaments(Number(id))} />;
  }

  const t = await getTennisTournament(id);
  if (!t) notFound();
  const [matches, editions] = await Promise.all([getTennisTournamentMatches(id), getTennisTournamentEditions(t.tournament_id)]);
  const draws = groupMatches(matches)[0]?.draws ?? [];
  const range = formatDateRange(t.start_date, t.end_date);
  const tourLabel = t.tour === "both" ? "ATP · WTA" : t.tour.toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <>
            {t.name} <span className="text-[var(--text-muted)]">{t.season}</span>
          </>
        }
        subtitle={[tourLabel + (t.major ? " · Grand Slam" : ""), t.location, range].filter(Boolean).join(" · ")}
      >
        <Link href="/tennis/tournaments" className="nav-pill">
          Calendar
        </Link>
        <FollowButton item={{ kind: "tournament", league: "tennis", refId: t.espn_id, label: `${t.name} ${t.season}`, sublabel: tourLabel, href: `/tennis/tournaments/${t.espn_id}` }} />
        <ShareButton path={`/tennis/tournaments/${t.espn_id}`} title={`${t.name} ${t.season}`} />
      </PageHeader>

      <AdSlot label="Tennis tournament top" />

      {t.champions.length > 0 && (
        <section className="card px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Champions</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {t.champions.map((c) => (
              <div key={c.competition_type} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-[var(--text-muted)]">{COMPETITION_LABEL[c.competition_type]}</span>
                <span className="text-right font-semibold">
                  {c.names.map((n, i) =>
                    c.slugs[i] ? (
                      <Link key={n} href={`/tennis/${c.competition_type.startsWith("womens") ? "wta" : "atp"}/players/${c.slugs[i]}`} className="hover:text-[var(--accent)]">
                        {n}
                        {i < c.names.length - 1 ? " / " : ""}
                      </Link>
                    ) : (
                      <span key={n}>
                        {n}
                        {i < c.names.length - 1 ? " / " : ""}
                      </span>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {editions.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {editions.map((e) => (
            <Link key={e.espn_id} href={`/tennis/tournaments/${e.espn_id}`} className={`nav-pill shrink-0 ${e.espn_id === t.espn_id ? "nav-pill-active" : ""}`}>
              {e.season}
            </Link>
          ))}
        </div>
      )}

      {draws.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          {t.start_date && t.start_date.slice(0, 10) > new Date().toISOString().slice(0, 10) ? "The draw is published once play begins." : "No matches on file for this edition."}
        </p>
      ) : (
        <section className="card overflow-hidden">
          {draws.map((d) => (
            <TennisDrawSection key={d.type ?? "singles"} type={d.type} matches={d.matches} byRound />
          ))}
        </section>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        {t.completed_count} of {t.match_count} matches on file completed.
      </p>
    </div>
  );
}
