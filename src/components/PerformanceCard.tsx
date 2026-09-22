// src/components/PerformanceCard.tsx
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { cardAccentColor } from "@/lib/cardColor";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL } from "@/lib/leagues";
import type { PerformanceStat } from "@/lib/performanceLine";

export interface PerformanceCardProps {
  league: "nba" | "nfl";
  playerName: string;
  position: string | null;
  jersey: string | null;
  teamAbbr: string | null;
  teamColor: string | null;
  opponentAbbr: string | null;
  resultLetter: "W" | "L" | null;
  teamScore: number | null;
  opponentScore: number | null;
  date: string;
  stageLabel: string | null;
  stats: PerformanceStat[];
}

// Flexbox and inline styles only — this subset renders identically in Satori (ImageResponse,
// the card route) and a real browser, per design doc §1. No <table>, no CSS grid, no <img>.
export function PerformanceCard({ league, playerName, position, jersey, teamAbbr, teamColor, opponentAbbr, resultLetter, teamScore, opponentScore, date, stageLabel, stats }: PerformanceCardProps) {
  const accent = cardAccentColor(teamColor);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD.surface, fontFamily: CARD_FONT, padding: 40, position: "relative" }}>
      {/* Oversized jersey number watermark, behind everything else. */}
      {jersey && (
        <div style={{ position: "absolute", top: -40, right: 20, fontSize: 340, fontWeight: 700, color: `${accent}1a`, lineHeight: 1 }}>{jersey}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: CARD.textMuted, fontWeight: 700 }}>
        <span>{LEAGUE_LABEL[league]}</span>
        <span>·</span>
        <span>{date}</span>
        {stageLabel && (
          <>
            <span>·</span>
            <span>{stageLabel}</span>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
        <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: accent, color: CARD.surface, alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>
          {teamAbbr ?? ""}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: CARD.text }}>{playerName}</div>
          <div style={{ fontSize: 18, color: CARD.textMuted, marginTop: 4 }}>
            {[position, jersey ? `#${jersey}` : null].filter(Boolean).join(" · ")}
            {opponentAbbr ? ` vs ${opponentAbbr}` : ""}
          </div>
        </div>
      </div>

      {resultLetter && teamScore != null && opponentScore != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: resultLetter === "W" ? CARD.win : CARD.loss }}>{resultLetter}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: CARD.text }}>
            {teamScore}-{opponentScore}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
        {stats.map((s) => (
          <div key={s.key} style={{ display: "flex", flexDirection: "column", background: CARD.bg, borderRadius: 12, padding: "14px 18px", minWidth: 130 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: accent }}>{s.value}</span>
            <span style={{ fontSize: 13, color: CARD.textMuted, marginTop: 2 }}>{s.label}</span>
            {s.delta && <span style={{ fontSize: 12, color: CARD.textFaint, marginTop: 4 }}>{s.delta}</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1 }} />
      <ExportFooter context={`${LEAGUE_LABEL[league]} · Player card`} />
    </div>
  );
}
