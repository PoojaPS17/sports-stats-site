import { TeamLogo } from "./TeamLogo";
import { teamDisplayName } from "@/lib/teamName";
import { CARD } from "@/lib/exportTheme";

// A team + score row shared by TeamStatsExportCard and TeamScheduleExportCard - the
// live-page equivalents (GameCard, MatchHeader) truncate long names to fit a
// responsive column; a downloadable card has no such constraint, so full names.
export function ExportTeamLine({
  name,
  logo,
  color,
  score,
  scoreDisplay,
  completed,
  won,
  showScore = completed,
}: {
  name: string;
  logo: string | null;
  color: string | null;
  score: number | null;
  scoreDisplay: string | null;
  completed: boolean;
  won: boolean;
  /** Scores show for finished games by default; pass true for one in play. */
  showScore?: boolean;
}) {
  const loser = completed && !won;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <TeamLogo name={name} logoUrl={logo} color={color} size={24} />
        <span style={{ fontSize: 14, fontWeight: loser ? 500 : 700, color: loser ? CARD.textMuted : CARD.text }}>{teamDisplayName(name)}</span>
      </div>
      {showScore && (score !== null || scoreDisplay) && (
        <span style={{ fontSize: 15, fontWeight: won ? 800 : 500, color: won ? CARD.text : CARD.textMuted, whiteSpace: "nowrap" }}>
          {scoreDisplay ?? score}
        </span>
      )}
    </div>
  );
}
