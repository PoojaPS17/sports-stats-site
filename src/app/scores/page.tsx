import type { Metadata } from "next";
import { LEAGUE_LABEL } from "@/lib/queries";
import { SectionHeader } from "@/components/SectionHeader";
import { HomeCricket } from "@/components/HomeCricket";
import { LiveNowList, ComingUpList, hasComingUp } from "@/components/HomeLive";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LeagueBlock, OffSeasonList } from "@/components/ScoresBlocks";
import { ScoresFilter } from "@/components/ScoresFilter";
import { AdSlot } from "@/components/AdSlot";
import { getScoresData } from "@/lib/scoresData";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Live scores and fixtures",
  description: "Live scores, the next seven days of fixtures and the latest results across football, the NFL, NBA, MLB, cricket and tennis, with the table and leaders for every league.",
  alternates: { canonical: absoluteUrl("/scores") },
};

// Same cadence as the home page: regenerated every 10 seconds so in-play scores stay current, with the
// stored data behind it cached in longer tiers (getHomeData, getScoresData). Nothing here depends on the visitor.
export const revalidate = 10;

export default async function ScoresPage() {
  const { home, snapshots, otherSeries, offSeason } = await getScoresData();
  const liveCount = home.liveGames.length + home.liveCricket.length + home.liveTennis.length;
  const anyLive = home.anyLive;

  // League blocks most active first; the cricket block ranks by its own live count. Leagues between seasons collapse into one list at the end.
  const keys = home.sections.map((s) => ({ key: s.league as string, label: LEAGUE_LABEL[s.league] }));
  const cricketAt = home.sections.findIndex((s) => s.liveCount < home.liveCricket.length);
  keys.splice(cricketAt === -1 ? keys.length : cricketAt, 0, { key: "cricket", label: "Cricket" });
  const blocks = home.sections.map((s) => <LeagueBlock key={s.league} section={s} snapshot={snapshots[s.league]} />);
  blocks.splice(
    cricketAt === -1 ? blocks.length : cricketAt,
    0,
    <div key="cricket" id="scores-cricket" data-scores-block="cricket" className="scroll-mt-[calc(var(--header-h)+1rem)]">
      <HomeCricket live={home.liveCricket.length} next={home.moreCricket} otherSeries={otherSeries} />
    </div>
  );

  return (
    <div id="scores-top" className="scores-page flex flex-col gap-10">
      <header>
        <h1 className="display text-[32px] text-[var(--text)] sm:text-[40px]">Live scores and fixtures</h1>
        <p className="mt-1.5 text-sm font-medium text-[var(--text-muted)]">What is in play, what is next and the latest results, across every sport on the site.</p>
        <ScoresFilter items={keys} />
      </header>

      <LiveRefresh active={anyLive} />
      <section id="live" data-scores-block="all" className="scroll-mt-[calc(var(--header-h)+3.5rem)]">
        <SectionHeader description={anyLive ? `${liveCount} in play · scores refresh every 10 seconds` : "Across football, the NFL, NBA, cricket and tennis"}>
          <span className="flex items-center gap-2">
            {anyLive && <span className="live-dot" />}
            Live now
          </span>
        </SectionHeader>
        {!anyLive ? <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Nothing in play right now. The next fixtures are below.</p> : <LiveNowList data={home} />}
      </section>

      <section id="coming-up" data-scores-block="all">
        <SectionHeader description="The pick of the next seven days">Coming up</SectionHeader>
        {!hasComingUp(home) ? <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No fixtures listed for the coming week yet.</p> : <ComingUpList data={home} />}
      </section>

      <AdSlot label="Scores" />

      <div className="grid gap-8 sm:grid-cols-1">
        {blocks}
        <OffSeasonList items={offSeason} />
      </div>
    </div>
  );
}
