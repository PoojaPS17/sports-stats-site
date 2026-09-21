import { teamDisplayName } from "@/lib/teamName";
import type { MatchLeader } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { ExportShell } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { matchupLabel } from "@/lib/gamePage";
import { CARD } from "@/lib/exportTheme";

// The downloadable Game leaders: each category's top performer and their number.
export function MatchLeadersExportCard({ league, game, leaders }: { league: League; game: GameRow; leaders: MatchLeader[] }) {
  const abbr = (id: string) => (id === game.home_team_espn_id ? (game.home_abbr ?? teamDisplayName(game.home_name)) : (game.away_abbr ?? teamDisplayName(game.away_name)));
  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${matchupLabel(league, game)} · Game leaders`}>
      <div style={{ borderTop: `1px solid ${CARD.border}`, paddingTop: 12, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>Game leaders</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
        {leaders.map((l, i) => (
          <div key={i} style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: CARD.textMuted }}>
              {l.label} · {abbr(l.team_id)}
            </div>
            <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, color: CARD.text }}>{l.athlete}</div>
            <div style={{ fontSize: 13, color: CARD.textMuted, fontVariantNumeric: "tabular-nums" }}>{l.value}</div>
          </div>
        ))}
      </div>
    </ExportShell>
  );
}
