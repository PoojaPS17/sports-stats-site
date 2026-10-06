/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// The cricket match page, shared by its two routes (see CricketMatchPage below).
import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound, redirect } from "next/navigation";
import { fitTitle, pageMeta } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CricketScorecards } from "@/components/CricketScorecard";
import { ImageActions } from "@/components/ImageActions";
import { CricketScorecardExportCard } from "@/components/CricketScorecardExportCard";
import { ExportTeamLine } from "@/components/ExportTeamLine";
import { ExportLabel } from "@/components/ExportShell";
import { CARD } from "@/lib/exportTheme";
import { extractGameDetails } from "@/lib/matchDetail";
import { getCricketSeriesMatch, getCricketSeriesMatches, type SeriesSide } from "@/lib/cricketSeries";
import { fetchCricketSummaryLive } from "@/lib/cricketLive";
import { FINISHED_MATCH_REVALIDATE, isSettledCricketMatch } from "@/lib/cricketMatchCache";
import { resolveTeamLogo } from "@/lib/teamLogos";
import { JsonLd } from "@/components/JsonLd";
import { cricketSeriesMatchSchema } from "@/lib/structuredData";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { normalizeStage } from "@/lib/stage";
import { venueWithCity } from "@/components/MatchFacts";
import { classifyCricketMatch, cricketMatchDescription, cricketMatchTitleCandidates, cricketMatchName } from "@/lib/cricketMatchStatus";
import { cricketMatchReport } from "@/lib/cricketMatchReport";
import { playingXi } from "@/lib/cricketPlayingXi";
import { seriesFormatLabels } from "@/lib/cricketSeriesSeo";
import { CricketPlayingXi } from "@/components/CricketPlayingXi";
import { CricketMatchInfo } from "@/components/CricketMatchInfo";
import { CricketMatchHero } from "@/components/CricketMatchHero";
import { CricketMatchStory } from "@/components/CricketMatchStory";
import { deriveMatchStory, fetchCricketBallByBall } from "@/lib/cricketBalls";
import { liveStatusLine, matchPills, potmLine, seriesNote, teamColours } from "@/lib/cricketMatchExtras";
import { CricketKeyMoments } from "@/components/CricketKeyMoments";
import { CricketTopPerformers } from "@/components/CricketTopPerformers";
import { CricketPartnerships } from "@/components/CricketPartnerships";
import { CricketNextMatch } from "@/components/CricketNextMatch";
import { keyMoments, parseMilestones } from "@/lib/cricketMatchMoments";
import { topPerformers } from "@/lib/cricketPerformers";

/** The page title, description and canonical of a match, the same on the public and the final route. */
export async function cricketMatchMetadata(id: string): Promise<Metadata> {
  const m = await getCricketSeriesMatch(id);
  // A match ESPN lists that is not stored yet still renders from ESPN's live summary (the page), so it
  // keeps the address as its canonical; the title and description stay the site's.
  if (!m) return { alternates: { canonical: absoluteUrl(`/cricket/matches/${id}`) } };
  // "A vs B Scorecard, 14th Match, President's Trophy 2026-27", shortened from the series end while it is over the
  // title budget, down to the full names and the keyword (see cricketMatchTitleCandidates); the description names
  // the series and the date either way.
  const titled = { ...m, description: normalizeStage(m.description) };
  // The card is named outright rather than left to the file beside the page: a finished match renders under
  // /cricket/matches/final/<id> (the proxy's rewrite), a segment with no image file of its own.
  return pageMeta(fitTitle(...cricketMatchTitleCandidates(titled)), cricketMatchDescription(titled), `/cricket/matches/${id}`, { image: { path: `/cricket/matches/${id}/opengraph-image`, alt: `${cricketMatchName(m.name)} on SportsDB` } });
}

export type CricketMatchMode = "live" | "final";

/**
 * The match's ESPN summary. On the final route (a stored result, see cricketMatchCache.ts) it is read
 * with the day window; if that copy is not final (ESPN's feed mid-update, an error body) a second read
 * from its own address, kept 10 seconds, replaces it, and this render is kept 10 seconds too, since a
 * page's window is the shortest of its fetches. The public route reads with the live window.
 */
async function loadSummary(id: string, stored: { series_espn_id: string; status_state: string | null; status_summary: string | null } | null, mode: CricketMatchMode): Promise<any | null> {
  if (mode === "final" && stored) {
    const summary = await fetchCricketSummaryLive(id, stored.series_espn_id, { revalidate: FINISHED_MATCH_REVALIDATE });
    if (isSettledCricketMatch(stored, summary)) return summary;
    return fetchCricketSummaryLive(id, stored.series_espn_id, { attempt: 2 });
  }
  return fetchCricketSummaryLive(id, stored?.series_espn_id);
}

/**
 * One cricket match, from ESPN's summary over the stored row: the live page for anything ESPN lists.
 * Rendered by two routes: /cricket/matches/<id>, per request, and /cricket/matches/final/<id>, the
 * day-cached copy the proxy serves for a settled result.
 */
export async function CricketMatchPage({ id, mode }: { id: string; mode: CricketMatchMode }) {
  if (!/^\d+$/.test(id)) notFound();
  const stored = await getCricketSeriesMatch(id);
  // Competitions SportsDB archives have their own match page with career links.
  if (stored?.scorecard_league) redirect(`/${stored.scorecard_league}/games/${id}`);

  const summary = await loadSummary(id, stored, mode);
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
  // "vs", as searchers type it (ESPN's listing says "v"; cricketMatchName makes the same change for the title).
  const matchName = [sideName(home, stored?.home ?? null), sideName(away, stored?.away ?? null)].filter(Boolean).join(" vs ");
  const format = stored?.class_card ? (seriesFormatLabels([stored.class_card])[0] ?? null) : null;
  const potm = (comp?.status?.featuredAthletes ?? []).find((a: any) => a.name === "playerOfTheMatch")?.athlete?.displayName ?? null;

  const sideData = (c: any, fallback: SeriesSide | null) => ({
    name: teamDisplayName(c?.team?.displayName ?? c?.team?.name ?? fallback?.name ?? ""),
    score: typeof c?.score === "string" && c.score ? c.score : fallback?.score ?? "",
    winner: c ? c.winner === true : fallback?.winner === true,
    logo: resolveTeamLogo(c?.team?.id ?? fallback?.id, c?.team?.logo ?? fallback?.logo ?? (c?.team?.id ? `https://a.espncdn.com/i/teamlogos/cricket/500/${c.team.id}.png` : null)),
  });
  const sides = [sideData(home, stored?.home ?? null), sideData(away, stored?.away ?? null)];
  // The report paragraph: the result in full names with the top performers, or a fixture's preview; nothing while
  // live or called off, when ESPN's own status line stays.
  const report = cricketMatchReport({
    kind,
    home: { name: sides[0].name, abbreviation: home?.team?.abbreviation ?? stored?.home?.abbreviation ?? null, score: sides[0].score, winner: sides[0].winner },
    away: { name: sides[1].name, abbreviation: away?.team?.abbreviation ?? stored?.away?.abbreviation ?? null, score: sides[1].score, winner: sides[1].winner },
    statusSummary: summaryText,
    stage: description,
    seriesName,
    venue: details?.venue ? venueWithCity(details.venue, details.city) : stored?.venue ?? null,
    date,
    scorecard: details?.scorecard ?? [],
    playerOfTheMatch: potm,
  });
  // The match story needs every ball; only limited-overs matches are asked (a first-class match is
  // 80+ pages) and only once play has started (an upcoming match has none).
  const limitedOvers = comp?.limitedOvers === true;
  const balls = summary && limitedOvers && state !== "pre" ? await fetchCricketBallByBall(id, stored?.series_espn_id ?? "8048", { settled: isSettledCricketMatch(stored, summary) }) : null;
  const story = balls ? deriveMatchStory(balls) : [];
  const colours = teamColours(summary);
  const colourById: Record<string, string> = {};
  if (home?.team?.id && colours.home) colourById[String(home.team.id)] = colours.home;
  if (away?.team?.id && colours.away) colourById[String(away.team.id)] = colours.away;
  const potmFigures = potm && details ? potmLine(details.scorecard, potm) : null;
  const liveLine = live ? liveStatusLine(summaryText ? teamDisplayName(summaryText) : null, story.at(-1)) : null;
  // The story blocks: wickets and landmarks, the innings leaders, the stands, the series' next fixture.
  const scorecard = details?.scorecard ?? [];
  const names = scorecard.flatMap((t) => [...t.battingRows, ...t.bowlingRows].map((r) => r.name));
  const moments = keyMoments(story, parseMilestones(summary?.notes, names), scorecard);
  const performers = topPerformers(scorecard, potm);
  const teamNames: Record<string, string> = {};
  if (home?.team?.id) teamNames[String(home.team.id)] = sides[0].name;
  if (away?.team?.id) teamNames[String(away.team.id)] = sides[1].name;
  const nextMatch = stored ? ((await getCricketSeriesMatches(stored.series_espn_id)).find((m) => m.espn_id !== stored.espn_id && m.date > stored.date && m.status_state === "pre") ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh active={live} />
      {stored && <JsonLd data={cricketSeriesMatchSchema({ ...stored, status_state: state, status_summary: summaryText }, details?.venue ?? null)} />}
      <Breadcrumbs
        items={[
          { label: "Cricket series", href: "/cricket/series" },
          ...(stored ? [{ label: stored.series_name, href: `/cricket/series/${stored.series_espn_id}` }] : []),
          ...(matchName ? [{ label: matchName }] : []),
        ]}
      />

      <CricketMatchHero
        state={state === "in" ? "in" : state === "post" ? "post" : "pre"}
        calledOff={calledOff}
        headline={[matchName, description, seriesName].filter(Boolean).join(" · ")}
        date={date}
        sides={[
          { name: sides[0].name, score: sides[0].score, winner: sides[0].winner, logo: sides[0].logo, colour: colours.home },
          { name: sides[1].name, score: sides[1].score, winner: sides[1].winner, logo: sides[1].logo, colour: colours.away },
        ]}
        result={state === "post" && summaryText ? teamDisplayName(summaryText) : null}
        potm={potm ? { name: potm, line: potmFigures } : null}
        pills={matchPills(summary?.notes)}
        liveLine={liveLine}
        venue={details?.venue ? venueWithCity(details.venue, details.city) : (stored?.venue ?? null)}
      />
      {report ? <p className="text-sm leading-relaxed">{report}</p> : null}

      <AdSlot label="Cricket live match top" />

      {story.length > 0 && <CricketMatchStory innings={story} colours={colourById} />}

      {(moments.length > 0 || performers.large) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <CricketKeyMoments moments={moments} colours={colourById} teams={teamNames} />
          <CricketTopPerformers large={performers.large} small={performers.small} league="odi" playerSlugs={new Map()} teams={teamNames} largeLabel={potm && performers.large?.name === potm ? "Player of the Match" : "Top scorer"} />
        </div>
      )}

      <CricketPartnerships innings={story} colours={colourById} />

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

      <CricketPlayingXi sides={playingXi(summary)} />

      <CricketMatchInfo
        series={stored ? { name: stored.series_name, href: `/cricket/series/${stored.series_espn_id}` } : seriesName ? { name: seriesName, href: null } : null}
        stage={description}
        format={format ? format[0].toUpperCase() + format.slice(1) : null}
        date={date}
        venue={details?.venue ? venueWithCity(details.venue, details.city) : null}
        officials={details?.officials ?? []}
        playerOfTheMatch={potm}
        result={state === "post" && summaryText ? summaryText : null}
      />

      {stored && <CricketNextMatch next={nextMatch} series={{ name: stored.series_name, href: `/cricket/series/${stored.series_espn_id}` }} seriesNote={seriesNote(summary?.notes)} />}

      <p className="text-xs text-[var(--text-muted)]">Live score, scorecard, Playing XI and match facts, refreshed every 10 seconds while in play.</p>
    </div>
  );
}
