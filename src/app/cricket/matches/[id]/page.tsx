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
import { ImageActions } from "@/components/ImageActions";
import { CricketScorecardExportCard } from "@/components/CricketScorecardExportCard";
import { ExportTeamLine } from "@/components/ExportTeamLine";
import { ExportLabel } from "@/components/ExportShell";
import { CARD } from "@/lib/exportTheme";
import { extractGameDetails } from "@/lib/matchDetail";
import { getCricketSeriesMatch, type SeriesSide } from "@/lib/cricketSeries";
import { fetchCricketSummaryLive } from "@/lib/cricketLive";
import { JsonLd } from "@/components/JsonLd";
import { cricketSeriesMatchSchema } from "@/lib/structuredData";
import { normalizeStage } from "@/lib/stage";
import { classifyCricketMatch, cricketMatchDescription } from "@/lib/cricketMatchStatus";

// The live page for any cricket match ESPN lists: read straight from ESPN's summary
// with a 10-second cache, refreshed in the browser while the match is in play.
export const revalidate = 10;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getCricketSeriesMatch(id);
  if (!m) return {};
  // Name, stage and series when they fit a search result's title; otherwise the month
  // stands in for the series, which the description still names.
  const stage = m.description ? `, ${m.description}` : "";
  const full = `${m.name}${stage} | ${m.series_name}`;
  const month = m.date ? `, ${new Date(m.date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}` : "";
  return pageMeta(full.length <= 60 ? full : `${m.name}${stage}${month}`, cricketMatchDescription(m), `/cricket/matches/${id}`);
}

export default async function CricketLiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const stored = await getCricketSeriesMatch(id);
  // Competitions SportsDB archives have their own match page with career links.
  if (stored?.scorecard_league) redirect(`/${stored.scorecard_league}/games/${id}`);

  const summary = await fetchCricketSummaryLive(id, stored?.series_espn_id);
  if (!summary && !stored) notFound();

  const comp = summary?.header?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home") ?? comp?.competitors?.[0];
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away") ?? comp?.competitors?.[1];
  const state: string | null = comp?.status?.type?.state ?? stored?.status_state ?? null;
  const live = state === "in";
  const summaryText: string | null = comp?.status?.summary ?? stored?.status_summary ?? null;
  // A match ESPN closed without playing is neither upcoming nor a result: it says why, with no start time.
  const kind = classifyCricketMatch({ status_state: state, status_summary: summaryText });
  const calledOff = typeof kind === "object" ? kind.calledOff : null;
  const details = summary && home?.team?.id && away?.team?.id ? extractGameDetails("cricket", summary, String(home.team.id), String(away.team.id)) : null;
  const description = normalizeStage(comp?.description ?? stored?.description ?? null);
  const seriesName = stored?.series_name ?? summary?.header?.league?.name ?? null;
  const date = comp?.date ?? stored?.date ?? null;
  const sideName = (c: any, fallback: SeriesSide | null) => teamDisplayName(c?.team?.displayName ?? c?.team?.name ?? fallback?.name ?? "");
  const matchName = [sideName(home, stored?.home ?? null), sideName(away, stored?.away ?? null)].filter(Boolean).join(" v ");
  const potm = (comp?.status?.featuredAthletes ?? []).find((a: any) => a.name === "playerOfTheMatch")?.athlete?.displayName ?? null;

  const sideData = (c: any, fallback: SeriesSide | null) => ({
    name: teamDisplayName(c?.team?.displayName ?? c?.team?.name ?? fallback?.name ?? ""),
    score: typeof c?.score === "string" && c.score ? c.score : fallback?.score ?? "",
    winner: c ? c.winner === true : fallback?.winner === true,
    logo: (c?.team?.logo ?? fallback?.logo ?? (c?.team?.id ? `https://a.espncdn.com/i/teamlogos/cricket/500/${c.team.id}.png` : null)) as string | null,
  });
  const sides = [sideData(home, stored?.home ?? null), sideData(away, stored?.away ?? null)];
  const sideRow = ({ name, score, winner, logo }: (typeof sides)[number]) => {
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
            {live ? <span className="pill pill-live">Live</span> : calledOff ? <span className="pill pill-final">{calledOff}</span> : state === "post" ? <span className="pill pill-final">Result</span> : <span className="pill pill-upcoming">Upcoming</span>}
            <h1 className="font-semibold text-[var(--text-muted)]">{[matchName, description, seriesName].filter(Boolean).join(" · ")}</h1>
          </span>
          {date && <LocalTime iso={date} format={calledOff ? "date" : "datetime"} className="text-[var(--text-muted)]" />}
        </div>
        {sideRow(sides[0])}
        {sideRow(sides[1])}
        {summaryText && <p className="text-sm font-medium">{teamDisplayName(summaryText)}</p>}
        {potm && <p className="text-xs text-[var(--text-muted)]">Player of the Match: {potm}</p>}
        {details?.venue && <p className="text-xs text-[var(--text-muted)]">{details.city ? `${details.venue}, ${details.city}` : details.venue}</p>}
      </section>

      <AdSlot label="Cricket live match top" />

      {details && details.scorecard.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            description={live ? "Updating while the match is in play" : undefined}
            tools={
              <ImageActions
                filename={`${id}-scorecard-cricket`}
                width={860}
                shareTitle={`${matchName} scorecard`}
                card={
                  <CricketScorecardExportCard
                    context={`${matchName} · Scorecard`}
                    scorecard={details.scorecard}
                    header={
                      <div>
                        <ExportLabel>{["Cricket", description, seriesName].filter(Boolean).join(" · ")}</ExportLabel>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                          {sides.map((s) => (
                            <ExportTeamLine key={s.name} name={s.name} logo={s.logo} color={null} score={null} scoreDisplay={s.score || null} completed={state === "post"} won={s.winner} showScore={state === "post" || live} />
                          ))}
                        </div>
                        {summaryText && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: CARD.accent }}>{teamDisplayName(summaryText)}</div>}
                      </div>
                    }
                  />
                }
              />
            }
          >
            Scorecard
          </SectionHeader>
          <CricketScorecards league="odi" scorecard={details.scorecard} playerSlugs={new Map()} />
        </section>
      ) : (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{calledOff ? `No scorecard: this match was ${calledOff.toLowerCase()}.` : state === "pre" ? "The scorecard appears once play starts." : "No scorecard is available for this match."}</p>
      )}

      <p className="text-xs text-[var(--text-muted)]">Live scores and scorecard, refreshed every 10 seconds while in play.</p>
    </div>
  );
}
