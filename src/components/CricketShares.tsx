"use client";

import { lazy, Suspense } from "react";
import { ShareMenu, type ShareVariant } from "./ShareMenu";
import { useActiveInnings } from "./ScorecardActive";
import { CricketExportHeader } from "./CricketExportHeader";
import { inningsShareText, scorecardText, xiText } from "@/lib/cricketShareText";
import type { MatchShareCommon, PerformersShareData, ResultShareData, ScorecardShareData, StoryShareData, XiShareData } from "@/lib/cricketShare";

// The share controls of a cricket match page, one per section, all the same ShareMenu. They take plain data and
// draw their card from it only after the first hover or click: the page carries the data, never a hidden card.

const loadCards = () => import("./CricketShareCards");
const loadScorecardCards = () => import("./CricketScorecardExportCard");
const Result = lazy(() => loadCards().then((m) => ({ default: m.ResultExportCard })));
const Performers = lazy(() => loadCards().then((m) => ({ default: m.PerformersExportCard })));
const PlayingXi = lazy(() => loadCards().then((m) => ({ default: m.PlayingXiExportCard })));
const Story = lazy(() => loadCards().then((m) => ({ default: m.MatchStoryExportCard })));
const Whole = lazy(() => loadScorecardCards().then((m) => ({ default: m.CricketScorecardExportCard })));
const Innings = lazy(() => loadScorecardCards().then((m) => ({ default: m.CricketInningsExportCard })));

const RESULT_VARIANTS: ShareVariant[] = [
  { id: "standard", label: "Standard", width: 720 },
  { id: "portrait", label: "Portrait", width: 540, height: 675, suffix: "portrait" },
  { id: "story", label: "Story", width: 540, height: 960, suffix: "story" },
];
const ONE = (width: number): ShareVariant[] => [{ id: "card", label: "Image", width }];

export function ResultShare({ common, data, tone = "deep" }: { common: MatchShareCommon; data: ResultShareData; tone?: "page" | "deep" }) {
  return (
    <ShareMenu
      section="Result"
      filename={`${common.id}-result-cricket`}
      shareTitle={`${common.matchName} result`}
      caption={common.caption}
      link={common.link}
      league={common.league}
      tone={tone}
      variants={RESULT_VARIANTS}
      variantLabel="Size"
      preload={loadCards}
      card={(v) => (
        <Suspense fallback={null}>
          <Result data={data} context={`${common.matchName} · Result`} variant={v === "portrait" ? "portrait" : v === "story" ? "story" : "standard"} />
        </Suspense>
      )}
    />
  );
}

export function PerformersShare({ common, data }: { common: MatchShareCommon; data: PerformersShareData }) {
  return (
    <ShareMenu
      section="Top performers"
      filename={`${common.id}-performers-cricket`}
      shareTitle={`${common.matchName} top performers`}
      caption={common.caption}
      link={common.link}
      league={common.league}
      variants={ONE(720)}
      preload={loadCards}
      card={() => (
        <Suspense fallback={null}>
          <Performers data={data} context={`${common.matchName} · Top performers`} />
        </Suspense>
      )}
    />
  );
}

export function PlayingXiShare({ common, data }: { common: MatchShareCommon; data: XiShareData }) {
  return (
    <ShareMenu
      section="Playing XI"
      filename={`${common.id}-playing-xi-cricket`}
      shareTitle={`${common.matchName} Playing XI`}
      caption={common.caption}
      link={common.link}
      league={common.league}
      variants={ONE(860)}
      preload={loadCards}
      text={() => xiText({ matchName: common.matchName, sides: data.sides, link: common.link })}
      card={() => (
        <Suspense fallback={null}>
          <PlayingXi data={data} context={`${common.matchName} · Playing XI`} />
        </Suspense>
      )}
    />
  );
}

export function StoryShare({ common, data }: { common: MatchShareCommon; data: StoryShareData }) {
  return (
    <ShareMenu
      section="Match story"
      filename={`${common.id}-match-story-cricket`}
      shareTitle={`${common.matchName} match story`}
      caption={common.caption}
      link={common.link}
      league={common.league}
      variants={ONE(860)}
      preload={loadCards}
      card={() => (
        <Suspense fallback={null}>
          <Story data={data} context={`${common.matchName} · Match story`} />
        </Suspense>
      )}
    />
  );
}

/** The scorecard: the open innings, or the whole match. Text copies the same scope. */
export function ScorecardShare({ common, data }: { common: MatchShareCommon; data: ScorecardShareData }) {
  const open = useActiveInnings()?.key ?? null;
  const tab = data.tabs.find((t) => t.key === open) ?? data.tabs[0];
  const variants: ShareVariant[] = data.tabs.length > 1 ? [{ id: `innings:${tab.key}`, label: "This innings", width: 860, suffix: `innings-${tab.key}` }, { id: "match", label: "Whole match", width: 860 }] : [{ id: "match", label: "Whole match", width: 860 }];
  return (
    <ShareMenu
      section="Scorecard"
      filename={`${common.id}-scorecard-cricket`}
      shareTitle={`${common.matchName} scorecard`}
      caption={common.caption}
      link={common.link}
      league={common.league}
      variants={variants}
      variantLabel="Show"
      preload={loadScorecardCards}
      text={(v) => (v.startsWith("innings:") ? inningsShareText({ matchName: common.matchName, result: data.header.result, tab, link: common.link }) : scorecardText({ matchName: common.matchName, result: data.header.result, tabs: data.tabs, link: common.link }))}
      card={(v) => (
        <Suspense fallback={null}>
          {v.startsWith("innings:") ? (
            <Innings header={<CricketExportHeader header={data.header} />} context={`${common.matchName} · Scorecard`} tab={tab} />
          ) : (
            <Whole header={<CricketExportHeader header={data.header} />} context={`${common.matchName} · Scorecard`} scorecard={[]} blocks={data.tabs.map((t) => t.block)} />
          )}
        </Suspense>
      )}
    />
  );
}
