import { teamDisplayName } from "@/lib/teamName";
import type { LineupPlayer, TeamLineup } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { ExportShell, ExportGroup } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { CARD } from "@/lib/exportTheme";

function PlayerRow({ p, sub }: { p: LineupPlayer; sub: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderTop: `1px solid ${CARD.border}`, fontSize: 13, color: CARD.text }}>
      <span style={{ width: 22, textAlign: "right", flexShrink: 0, fontSize: 12, color: CARD.textFaint, fontVariantNumeric: "tabular-nums" }}>{p.jersey ?? ""}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {p.name}
        {!sub && p.position && <span style={{ marginLeft: 6, fontSize: 11, color: CARD.textFaint }}>{p.position}</span>}
        {sub && p.in_for && <span style={{ marginLeft: 6, fontSize: 11, color: CARD.textMuted }}>for {p.in_for}</span>}
      </span>
      {p.minute && <span style={{ flexShrink: 0, fontSize: 12, color: CARD.textMuted, fontVariantNumeric: "tabular-nums" }}>{sub ? "▲" : "▼"} {p.minute}</span>}
    </div>
  );
}

// The downloadable Line-ups: both starting XIs (with formation) and the substitutes used.
export function MatchLineupsExportCard({ league, game, lineups }: { league: League; game: GameRow; lineups: TeamLineup[] }) {
  const ordered = [game.home_team_espn_id, game.away_team_espn_id].map((id) => lineups.find((l) => l.team_id === id)).filter((l): l is TeamLineup => Boolean(l));
  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${teamDisplayName(game.home_name)} vs ${teamDisplayName(game.away_name)} · Line-ups`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {ordered.map((l) => (
          <ExportGroup key={l.team_id} title={teamDisplayName(l.team_id === game.home_team_espn_id ? game.home_name : game.away_name)} aside={l.formation}>
            {l.starters.map((p) => (
              <PlayerRow key={p.id} p={p} sub={false} />
            ))}
            {l.subs.length > 0 && (
              <>
                <div style={{ borderTop: `1px solid ${CARD.border}`, background: CARD.bg, padding: "5px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: CARD.textMuted }}>Substitutes used</div>
                {l.subs.map((p) => (
                  <PlayerRow key={p.id} p={p} sub />
                ))}
              </>
            )}
          </ExportGroup>
        ))}
      </div>
    </ExportShell>
  );
}
