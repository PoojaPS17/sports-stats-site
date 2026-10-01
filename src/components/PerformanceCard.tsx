// src/components/PerformanceCard.tsx
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { cardAccentColor } from "@/lib/cardColor";
import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { LEAGUE_LABEL } from "@/lib/leagues";
import type { PerformanceStat } from "@/lib/performanceLine";

// The family registered in cardFont.ts; Satori matches fonts by this name.
const DISPLAY = "Barlow Condensed";

// A card-only mirror of ExportFooter (src/components/ExportFooter.tsx), not that component itself:
// ExportFooter's X glyph span uses `display: "inline-flex"` and its wordmark nests a span inside
// text, both of which Satori rejects. Same band, same colours, flex only, handle as plain text.
function PerformanceCardFooter({ context }: { context: string }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })} UTC`;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", background: CARD.mast, color: CARD.mastText }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PixelBall size={22} fill={CARD.mastText} live={CARD.sig} />
        <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, lineHeight: 1, textTransform: "uppercase" }}>
          <span style={{ color: CARD.mastText }}>Sports</span><span style={{ color: CARD.sig }}>DB</span>
        </div>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>{domain}</span>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>·</span>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>@{X_HANDLE}</span>
      </div>
      <div style={{ display: "flex", fontSize: 14, color: CARD.mastMuted }}>
        {context} · {stamp}
      </div>
    </div>
  );
}

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
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD.surface, fontFamily: CARD_FONT, position: "relative" }}>
      {/* Oversized jersey number watermark, behind everything else. */}
      {jersey && (
        <div style={{ position: "absolute", top: -40, right: 20, fontFamily: DISPLAY, fontSize: 420, fontWeight: 800, color: `${accent}1a`, lineHeight: 1 }}>{jersey}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: CARD.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
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
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: accent, color: CARD.surface, alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: 24, fontWeight: 800 }}>
            {teamAbbr ?? ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", color: CARD.text }}>{playerName}</div>
            <div style={{ display: "flex", fontSize: 18, color: CARD.textMuted, marginTop: 6 }}>
              {[position, jersey ? `#${jersey}` : null].filter(Boolean).join(" · ")}
              {opponentAbbr ? ` vs ${opponentAbbr}` : ""}
            </div>
          </div>
        </div>

        {resultLetter && teamScore != null && opponentScore != null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14, fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
            <span style={{ color: resultLetter === "W" ? CARD.win : CARD.loss }}>{resultLetter}</span>
            <span style={{ color: CARD.text }}>
              {teamScore}-{opponentScore}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          {stats.map((s) => (
            <div key={s.key} style={{ display: "flex", flexDirection: "column", background: CARD.bg, borderRadius: 12, padding: "14px 18px", minWidth: 130 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, color: accent }}>{s.value}</span>
              <span style={{ fontSize: 13, color: CARD.textMuted, marginTop: 6 }}>{s.label}</span>
              {s.delta && <span style={{ fontSize: 12, color: CARD.textFaint, marginTop: 4 }}>{s.delta}</span>}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flex: 1 }} />
      </div>
      <PerformanceCardFooter context={`${LEAGUE_LABEL[league]} · Player card`} />
    </div>
  );
}
