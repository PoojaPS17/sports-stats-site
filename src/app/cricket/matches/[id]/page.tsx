/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { LocalTime } from "@/components/LocalTime";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CricketScorecards } from "@/components/CricketScorecard";
import { extractGameDetails } from "@/lib/matchDetail";
import { getCricketSeriesMatch, type SeriesSide } from "@/lib/cricketSeries";
import { fetchCricketSummaryLive } from "@/lib/cricketLive";
import { JsonLd } from "@/components/JsonLd";
import { cricketSeriesMatchSchema } from "@/lib/structuredData";
import { normalizeStage } from "@/lib/stage";

// The live page for any cricket match ESPN lists: read straight from ESPN's summary
// with a 10-second cache, refreshed in the browser while the match is in play.
export const revalidate = 10;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getCricketSeriesMatch(id);
  if (!m) return {};
  return pageMeta(`${m.name}${m.description ? `, ${m.description}` : ""} | ${m.series_name}`, `${m.name} live score and scorecard, ${m.series_name}${m.status_summary ? `: ${m.status_summary}` : ""}.`, `/cricket/matches/${id}`);
}

export default async function CricketLiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const stored = await getCricketSeriesMatch(id);
  // Competitions ScoreDB archives have their own match page with career links.
  if (stored?.scorecard_league) redirect(`/${stored.scorecard_league}/games/${id}`);

  const summary = await fetchCricketSummaryLive(id, stored?.series_espn_id);
  if (!summary && !stored) notFound();

  const comp = summary?.header?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home") ?? comp?.competitors?.[0];
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away") ?? comp?.competitors?.[1];
  const state: string | null = comp?.status?.type?.state ?? stored?.status_state ?? null;
  const live = state === "in";
  const summaryText: string | null = comp?.status?.summary ?? stored?.status_summary ?? null;
  const details = summary && home?.team?.id && away?.team?.id ? extractGameDetails("cricket", summary, String(home.team.id), String(away.team.id)) : null;
  const description = normalizeStage(comp?.description ?? stored?.description ?? null);
  const seriesName = stored?.series_name ?? summary?.header?.league?.name ?? null;
  const date = comp?.date ?? stored?.date ?? null;
  const potm = (comp?.status?.featuredAthletes ?? []).find((a: any) => a.name === "playerOfTheMatch")?.athlete?.displayName ?? null;

  const sideRow = (c: any, fallback: SeriesSide | null) => {
    const name = teamDisplayName(c?.team?.displayName ?? c?.team?.name ?? fallback?.name ?? "");
    const score = typeof c?.score === "string" && c.score ? c.score : fallback?.score ?? "";
    const winner = c ? c.winner === true : fallback?.winner === true;
    const logo = c?.team?.logo ?? fallback?.logo ?? (c?.team?.id ? `https://a.espncdn.com/i/teamlogos/cricket/500/${c.team.id}.png` : null);
    return (
      <div className="flex items-center gap-3">
        <TeamLogo name={name} logoUrl={logo} size={40} />
        <span className={`min-w-0 flex-1 truncate text-lg ${state === "post" && !winner ? "text-[var(--text-muted)]" : "font-bold"}`}>{name}</span>
        <span className={`shrink-0 text-lg tabular-nums ${state === "post" && !winner ? "text-[var(--text-muted)]" : "font-bold"}`}>{score}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh active={live} />
      {stored && <JsonLd data={cricketSeriesMatchSchema({ ...stored, status_state: state, status_summary: summaryText }, details?.venue ?? null)} />}
      <nav className="text-xs text-[var(--text-muted)]">
        <Link href="/cricket/series" className="hover:underline">
          Cricket series
        </Link>
        {stored && (
          <>
            {" "}
            ›{" "}
            <Link href={`/cricket/series/${stored.series_espn_id}`} className="hover:underline">
              {stored.series_name}
            </Link>
          </>
        )}
      </nav>

      <section className="card flex flex-col gap-3 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2">
            {live ? <span className="pill pill-live">Live</span> : state === "post" ? <span className="pill pill-final">Result</span> : <span className="pill pill-upcoming">Upcoming</span>}
            <span className="font-semibold text-[var(--text-muted)]">{[description, seriesName].filter(Boolean).join(" · ")}</span>
          </span>
          {date && <LocalTime iso={date} format="datetime" className="text-[var(--text-muted)]" />}
        </div>
        {sideRow(home, stored?.home ?? null)}
        {sideRow(away, stored?.away ?? null)}
        {summaryText && <p className="text-sm font-medium">{teamDisplayName(summaryText)}</p>}
        {potm && <p className="text-xs text-[var(--text-muted)]">Player of the Match: {potm}</p>}
        {details?.venue && <p className="text-xs text-[var(--text-muted)]">{details.city ? `${details.venue}, ${details.city}` : details.venue}</p>}
      </section>

      <AdSlot label="Cricket live match top" />

      {details && details.scorecard.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader description={live ? "Updating while the match is in play" : undefined}>Scorecard</SectionHeader>
          <CricketScorecards league="odi" scorecard={details.scorecard} playerSlugs={new Map()} />
        </section>
      ) : (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{state === "pre" ? "The scorecard appears once play starts." : "No scorecard is available for this match."}</p>
      )}

      <p className="text-xs text-[var(--text-muted)]">Live scores and scorecard from ESPN, refreshed every 10 seconds while in play.</p>
    </div>
  );
}
