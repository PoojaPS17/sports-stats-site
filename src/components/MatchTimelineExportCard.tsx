import { teamDisplayName } from "@/lib/teamName";
import type { TimelineEvent, TimelineEventType } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { ExportShell } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { CARD } from "@/lib/exportTheme";

const BADGE: Record<TimelineEventType, { text: string; bg: string; fg: string }> = {
  goal: { text: "Goal", bg: CARD.win, fg: "#fff" },
  "own-goal": { text: "Own goal", bg: CARD.loss, fg: "#fff" },
  penalty: { text: "Penalty", bg: CARD.win, fg: "#fff" },
  "penalty-missed": { text: "Pen. missed", bg: CARD.bg, fg: CARD.textMuted },
  yellow: { text: "Yellow", bg: "#ca8a04", fg: "#fff" },
  red: { text: "Red", bg: CARD.loss, fg: "#fff" },
  sub: { text: "Sub", bg: CARD.bg, fg: CARD.textMuted },
  shootout: { text: "Shootout", bg: CARD.accent, fg: "#fff" },
  score: { text: "Score", bg: CARD.accent, fg: "#fff" },
};

function describe(e: TimelineEvent, nflStyle: boolean): string {
  if (nflStyle) return `${e.label ? `${e.label} · ` : ""}${e.text}`;
  if (e.type === "sub" && e.players.length >= 2) return `${e.players[0].name} on for ${e.players[1].name}`;
  if (e.players.length > 0) return `${e.players[0].name}${e.type === "own-goal" ? " (own goal)" : e.type === "penalty" ? " (penalty)" : ""}`;
  return e.text;
}

// The downloadable Timeline / Scoring summary: every goal, card and sub (or scoring play)
// in match order with the running score, under the scoreline.
export function MatchTimelineExportCard({ league, game, events, title }: { league: League; game: GameRow; events: TimelineEvent[]; title: string }) {
  const nflStyle = events.every((e) => e.type === "score");
  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${teamDisplayName(game.away_name)} vs ${teamDisplayName(game.home_name)} · ${title}`}>
      <div style={{ borderTop: `1px solid ${CARD.border}`, paddingTop: 12, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
        {events.map((e, i) => {
          const badge = BADGE[e.type];
          const home = e.team_id === game.home_team_espn_id;
          const scoring = e.home_score != null && e.away_score != null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${CARD.border}`, fontSize: 14, color: CARD.text }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: 12, color: CARD.textMuted, fontVariantNumeric: "tabular-nums" }}>{nflStyle ? `Q${e.period} ${e.clock}` : e.clock}</span>
              <span style={{ width: 74, flexShrink: 0, textAlign: "center", borderRadius: 6, padding: "2px 0", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, background: badge.bg, color: badge.fg }}>{badge.text}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{describe(e, nflStyle)}</span>
                <span style={{ marginLeft: 6, fontSize: 12, color: CARD.textMuted }}>{home ? (game.home_abbr ?? teamDisplayName(game.home_name)) : (game.away_abbr ?? teamDisplayName(game.away_name))}</span>
              </span>
              {scoring && <span style={{ flexShrink: 0, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{e.away_score}–{e.home_score}</span>}
            </div>
          );
        })}
      </div>
    </ExportShell>
  );
}
