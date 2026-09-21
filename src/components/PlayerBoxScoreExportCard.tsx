import { teamDisplayName } from "@/lib/teamName";
import type { TeamPlayerBox } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";
import type { GameRow, League } from "@/lib/queries";
import { ExportShell, ExportGroup, ExportTable } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { matchupLabel } from "@/lib/gamePage";
import { CARD } from "@/lib/exportTheme";

// The downloadable Player Stats: the full box score for both teams, every category table,
// under the scoreline.
export function PlayerBoxScoreExportCard({ league, game, playerBox }: { league: League; game: GameRow; playerBox: TeamPlayerBox[] }) {
  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${matchupLabel(league, game)} · Box score`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
        {playerBox
          .filter((team) => team.categories.length > 0)
          .map((team) => (
            <ExportGroup key={team.teamId} title={teamDisplayName(team.teamName)}>
              {team.categories.map((cat) => (
                <div key={cat.name}>
                  {cat.name && <div style={{ padding: "8px 12px 2px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: CARD.textMuted }}>{cat.name}</div>}
                  <ExportTable
                    bare
                    headers={cat.labels}
                    rows={cat.rows.map((row) => ({ key: row.athleteId, name: row.name, cells: cat.labels.map((label, i) => (row.stats[i] !== undefined ? formatStat(label, row.stats[i]) : "-")) }))}
                  />
                </div>
              ))}
            </ExportGroup>
          ))}
      </div>
    </ExportShell>
  );
}
