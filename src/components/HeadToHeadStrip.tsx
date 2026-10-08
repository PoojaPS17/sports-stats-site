import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { getHeadToHead, isCountedMeeting, isSoccer } from "@/lib/analytics";
import { h2hPath } from "@/lib/h2h";
import type { League } from "@/lib/queries";
import { scoreLineHomeFirst } from "@/lib/gamePage";
import { formatGameDate } from "@/lib/gameDay";
import { rivalryMeter, streakText } from "@/lib/rivalry";
import { meetingResult, tallyMeetings } from "@/lib/h2hOutcome";
import { ImageActions } from "./ImageActions";
import { HeadToHeadExportCard } from "./HeadToHeadExportCard";

// Compact head-to-head record shown on a match page, linking to the full head-to-head
// history. `excludeGameId` keeps a completed match from counting itself in "previous
// meetings". `preGame` is set on a game still to be played: it adds how close the rivalry is, the last
// meeting and a one-tap share image of the record.
export async function HeadToHeadStrip({
  league,
  homeSlug,
  awaySlug,
  excludeGameId,
  preGame,
}: {
  league: League;
  homeSlug: string;
  awaySlug: string;
  excludeGameId: string | null;
  preGame?: { nextLine: string };
}) {
  // teamA is the side listed first: football lists the home side first (like the match header above), the NBA and NFL the visitors.
  const [firstSlug, secondSlug] = scoreLineHomeFirst(league) ? [homeSlug, awaySlug] : [awaySlug, homeSlug];
  const h2h = await getHeadToHead(league, firstSlug, secondSlug);
  if (!h2h) return null;
  // The meetings the head-to-head page counts: preseason and All-Star games say nothing about the rivalry.
  const games = (excludeGameId ? h2h.games.filter((g) => g.espn_id !== excludeGameId) : h2h.games).filter(isCountedMeeting);
  if (games.length === 0) return null;

  // Recount without the excluded game, by the same result rule as the head-to-head page.
  const { winsA, winsB, draws } = tallyMeetings(league, games, h2h.teamA.espn_id);
  const total = games.length;
  const soccer = isSoccer(league);
  const last = games.slice(0, 5);
  const nameOf = (t: typeof h2h.teamA) => teamDisplayName(t.name);
  const meter = preGame ? rivalryMeter(h2h, nameOf) : null;
  const lastMeeting = preGame ? games[0] : null;
  const pairTitle = `${nameOf(h2h.teamA)} vs ${nameOf(h2h.teamB)}`;

  return (
    <div className="card flex flex-col">
    <Link href={h2hPath(league, homeSlug, awaySlug)} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Head-to-head</span>
      <span className="flex items-center gap-2 font-semibold">
        <span>{h2h.teamA.abbreviation ?? teamDisplayName(h2h.teamA.name)}</span>
        <span className="tabular-nums text-[var(--win)]">{winsA}</span>
        {soccer && (
          <>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="tabular-nums text-[var(--draw)]">{draws}</span>
          </>
        )}
        <span className="text-[var(--text-faint)]">·</span>
        <span className="tabular-nums text-[var(--win)]">{winsB}</span>
        <span>{h2h.teamB.abbreviation ?? teamDisplayName(h2h.teamB.name)}</span>
      </span>
      <span className="text-xs text-[var(--text-muted)]">
        {total} previous {total === 1 ? "meeting" : "meetings"}
      </span>
      <span className="ml-auto flex items-center gap-1" aria-label="Last five meetings">
        {last.map((g) => {
          const res = meetingResult(league, g, h2h.teamA.espn_id);
          const r = res === "A" ? "W" : res === "B" ? "L" : "D";
          return (
            <span key={g.espn_id} className={`result-badge result-${r.toLowerCase()}`} title={scoreLineHomeFirst(league) ? `${teamDisplayName(g.home_name)} ${g.home_score} - ${g.away_score} ${teamDisplayName(g.away_name)}` : `${teamDisplayName(g.away_name)} ${g.away_score} - ${g.home_score} ${teamDisplayName(g.home_name)}`}>
              {r === "W" ? (h2h.teamA.abbreviation ?? "A").slice(0, 3) : r === "L" ? (h2h.teamB.abbreviation ?? "B").slice(0, 3) : "D"}
            </span>
          );
        })}
        <span className="ml-2 text-xs font-semibold text-[var(--accent)]">Full history →</span>
      </span>
    </Link>
    {preGame && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] px-4 py-3 text-sm">
        {meter?.label && <span className="font-semibold">{meter.label}</span>}
        {lastMeeting && (
          <span className="text-[var(--text-muted)]">
            Last meeting: {scoreLineHomeFirst(league) ? `${teamDisplayName(lastMeeting.home_name)} ${lastMeeting.home_score}-${lastMeeting.away_score} ${teamDisplayName(lastMeeting.away_name)}` : `${teamDisplayName(lastMeeting.away_name)} ${lastMeeting.away_score}-${lastMeeting.home_score} ${teamDisplayName(lastMeeting.home_name)}`},{" "}
            {formatGameDate(lastMeeting.date, league, { month: "short", day: "numeric", year: "numeric" }, lastMeeting.local_date)}
          </span>
        )}
        <span className="ml-auto">
          <ImageActions
            filename={`${league}-${h2h.teamA.slug}-vs-${h2h.teamB.slug}-preview`}
            shareTitle={`${pairTitle}: ${preGame.nextLine}`}
            width={720}
            card={<HeadToHeadExportCard league={league} h2h={h2h} title={pairTitle} streakText={streakText(h2h, nameOf)} nextLine={preGame.nextLine} />}
          />
        </span>
      </div>
    )}
    </div>
  );
}
