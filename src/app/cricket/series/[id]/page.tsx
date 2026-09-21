import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { FollowButton } from "@/components/FollowButton";
import { ImageActions } from "@/components/ImageActions";
import { SeriesMatchesExportCard } from "@/components/SeriesMatchesExportCard";
import { SeriesCard, SeriesMatchList, formatSeriesDates } from "@/components/CricketSeries";
import { LEAGUE_LABEL } from "@/lib/leagues";
import { getCricketSeries, getCricketSeriesBySeason, getCricketSeriesMatches, getCricketSeriesSeasons, SERIES_KIND_LABEL } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { classifyCricketMatch } from "@/lib/cricketMatchStatus";
import { LiveRefresh } from "@/components/LiveRefresh";

export const revalidate = 15;

// Dynamic on purpose: no generateStaticParams here, so which matches are in play is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), and a render made in the pre state ships no LiveRefresh timer,
// so it would not catch up on its own. The window above still sets the default for the cached
// fetches inside this render.

// A season archive is a calendar year. ESPN's older series ids are four digits too
// (8048 IPL, 8050 Ranji Trophy, 8679 PSL), and must reach the series page.
const SEASON_RE = /^(19|20)\d{2}$/;

// Wall-clock read kept out of the render body (the purity lint), as a plain call.
function clock(): number {
  return Date.now();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (id === "archive") return pageMeta("Cricket Series Archive", "Past cricket series and tournaments by season.", "/cricket/series/archive");
  if (SEASON_RE.test(id)) return pageMeta(`${id} Cricket Series`, `Every cricket series, league and tournament of ${id} with results.`, `/cricket/series/${id}`);
  const s = await getCricketSeries(id);
  if (!s) return {};
  return pageMeta(
    s.name,
    `${s.name}: fixtures, live scores and results for every match${s.formats.length ? ` (${s.formats.join(", ")})` : ""}${s.teams.length && s.teams.length <= 4 ? `, ${s.teams.map((t) => t.name).join(", ")}` : ""}.`,
    `/cricket/series/${s.espn_id}`
  );
}

export default async function CricketSeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "archive" || SEASON_RE.test(id)) {
    const seasons = await getCricketSeriesSeasons();
    const season = SEASON_RE.test(id) ? Number(id) : seasons[0];
    if (!season || !seasons.includes(season)) notFound();
    const series = await getCricketSeriesBySeason(season);
    const now = clock();
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`${season} Cricket Series`} subtitle={`${series.length} series, leagues and tournaments that started in ${season}.`}>
          <Link href="/cricket/series" className="nav-pill">
            Current
          </Link>
        </PageHeader>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {seasons.map((y) => (
            <Link key={y} href={`/cricket/series/${y}`} className={`nav-pill shrink-0 ${y === season ? "nav-pill-active" : ""}`}>
              {y}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <SeriesCard key={s.espn_id} s={s} now={now} />
          ))}
        </div>
      </div>
    );
  }

  const s = await getCricketSeries(id);
  if (!s) notFound();
  const matches = await overlayLiveCricket(await getCricketSeriesMatches(id), id);
  // A match ESPN closed without playing is neither a fixture nor a result: it gets its own list, with no start time.
  const kinds = new Map(matches.map((m) => [m.espn_id, classifyCricketMatch(m)]));
  const live = matches.filter((m) => kinds.get(m.espn_id) === "live");
  const results = matches.filter((m) => kinds.get(m.espn_id) === "result").reverse();
  const fixtures = matches.filter((m) => kinds.get(m.espn_id) === "fixture");
  const calledOff = matches.filter((m) => typeof kinds.get(m.espn_id) === "object");
  const dates = formatSeriesDates(s.start_date, s.end_date);

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh active={live.length > 0} />
      <PageHeader title={s.name} subtitle={[SERIES_KIND_LABEL[s.kind], s.formats.join(" · ") || null, dates, `${s.match_count} match${s.match_count === 1 ? "" : "es"}`].filter(Boolean).join(" · ")}>
        <Link href="/cricket/series" className="nav-pill">
          All series
        </Link>
        {s.league && (
          <Link href={`/${s.league}`} className="nav-pill nav-pill-active">
            {LEAGUE_LABEL[s.league]} hub →
          </Link>
        )}
        <FollowButton item={{ kind: "series", league: s.league ?? "cricket", refId: s.espn_id, label: s.name, sublabel: "Cricket", href: `/cricket/series/${s.espn_id}` }} />
      </PageHeader>

      <AdSlot label="Cricket series detail top" />

      {s.teams.length > 0 && (
        <section className="card px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Teams</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {s.teams.map((t) => (
              <span key={t.id} className="flex items-center gap-2 text-sm font-semibold">
                <TeamLogo name={t.name} logoUrl={t.logo} size={22} />
                {t.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {live.length > 0 && (
        <section>
          <SectionHeader description="Scores refresh every 10 seconds">Live now</SectionHeader>
          <SeriesMatchList matches={live} />
        </section>
      )}

      {fixtures.length > 0 && (
        <section>
          <SectionHeader description="Times shown in your local time zone" tools={<ImageActions filename={`${s.espn_id}-fixtures-cricket`} width={860} shareTitle={`${s.name} fixtures`} card={<SeriesMatchesExportCard series={s} title="Fixtures" matches={fixtures} />} />}>Fixtures</SectionHeader>
          <SeriesMatchList matches={fixtures} />
        </section>
      )}

      {calledOff.length > 0 && (
        <section>
          <SectionHeader description="Not played as scheduled. A suspended match may resume.">Postponed, cancelled or suspended</SectionHeader>
          <SeriesMatchList matches={calledOff} />
        </section>
      )}

      {results.length > 0 && (
        <section>
          <SectionHeader description="Most recent first" tools={<ImageActions filename={`${s.espn_id}-results-cricket`} width={860} shareTitle={`${s.name} results`} card={<SeriesMatchesExportCard series={s} title="Results" matches={results} />} />}>Results</SectionHeader>
          <SeriesMatchList matches={results} />
        </section>
      )}

      {matches.length === 0 && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No matches listed for this series yet.</p>}

      <p className="text-xs text-[var(--text-muted)]">
        {s.league
          ? `This competition is fully covered on SportsDB: every match links to its stored scorecard, and the ${LEAGUE_LABEL[s.league]} hub has tables, leaders and player records.`
          : "Scores and results for every match in the series. A match's scorecard opens live while it is in play and stays available after it ends."}
      </p>
    </div>
  );
}
