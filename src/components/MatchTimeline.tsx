import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { TimelineEvent, TimelineEventType } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { scoreLineHomeFirst } from "@/lib/gamePage";

const BADGE: Record<TimelineEventType, { text: string; cls: string }> = {
  goal: { text: "Goal", cls: "bg-[var(--win)] text-white" },
  "own-goal": { text: "Own goal", cls: "bg-[var(--loss)] text-white" },
  penalty: { text: "Penalty", cls: "bg-[var(--win)] text-white" },
  "penalty-missed": { text: "Pen. missed", cls: "bg-[var(--surface-muted)] text-[var(--text-muted)]" },
  yellow: { text: "Yellow", cls: "bg-[var(--zone-2)] text-white" },
  red: { text: "Red", cls: "bg-[var(--loss)] text-white" },
  sub: { text: "Sub", cls: "bg-[var(--surface-muted)] text-[var(--text-muted)]" },
  shootout: { text: "Shootout", cls: "bg-[var(--accent)] text-white" },
  score: { text: "Score", cls: "bg-[var(--accent)] text-white" },
};

function PlayerName({ league, player, slugs }: { league: League; player: { id: string; name: string }; slugs: Map<string, string> }) {
  const slug = slugs.get(player.id);
  return slug ? (
    <Link href={`/${league}/players/${slug}`} className="font-semibold hover:text-[var(--accent)]">{player.name}</Link>
  ) : (
    <span className="font-semibold">{player.name}</span>
  );
}

// Goals, cards and substitutions (football) or scoring plays (NFL), in match order,
// with the running score after each score. Home-side events sit on the left, away
// on the right, so the flow of the game reads at a glance.
export function MatchTimeline({ league, game, events, playerSlugs }: { league: League; game: GameRow; events: TimelineEvent[]; playerSlugs: Map<string, string> }) {
  if (events.length === 0) return null;
  const nflStyle = events.every((e) => e.type === "score");

  return (
    <ol className="card divide-y divide-[var(--border)]">
      {events.map((e, i) => {
        const home = e.team_id === game.home_team_espn_id;
        const badge = BADGE[e.type];
        const scoring = e.home_score != null && e.away_score != null;
        const description = nflStyle ? (
          <span>
            {e.label && <span className="font-semibold">{e.label} · </span>}
            {e.text}
          </span>
        ) : e.type === "sub" && e.players.length >= 2 ? (
          <span>
            <PlayerName league={league} player={e.players[0]} slugs={playerSlugs} /> <span className="text-[var(--text-muted)]">on for</span>{" "}
            <PlayerName league={league} player={e.players[1]} slugs={playerSlugs} />
          </span>
        ) : e.players.length > 0 ? (
          <span>
            <PlayerName league={league} player={e.players[0]} slugs={playerSlugs} />
            {e.type === "own-goal" && <span className="text-[var(--text-muted)]"> (own goal)</span>}
            {e.type === "penalty" && <span className="text-[var(--text-muted)]"> (penalty)</span>}
          </span>
        ) : (
          <span>{e.text}</span>
        );
        return (
          <li key={i} className={`flex items-center gap-3 px-4 py-2 text-sm ${home ? "" : "flex-row-reverse text-right"}`}>
            <span className="w-12 shrink-0 tabular-nums text-xs text-[var(--text-muted)]">{nflStyle ? `Q${e.period} ${e.clock}` : e.clock}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}>{badge.text}</span>
            <span className="min-w-0 flex-1">
              {description}
              <span className="ml-1 text-xs text-[var(--text-muted)]">{home ? game.home_abbr ?? teamDisplayName(game.home_name) : game.away_abbr ?? teamDisplayName(game.away_name)}</span>
            </span>
            {scoring && (
              <span className="shrink-0 font-bold tabular-nums">
                {scoreLineHomeFirst(league) ? `${e.home_score}–${e.away_score}` : `${e.away_score}–${e.home_score}`}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
