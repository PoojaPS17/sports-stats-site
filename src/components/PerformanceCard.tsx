// src/components/PerformanceCard.tsx
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { cardAccentColor } from "@/lib/cardColor";
import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { LEAGUE_LABEL } from "@/lib/leagues";
import type { PerformanceStat } from "@/lib/performanceLine";

// A card-only mirror of ExportFooter (src/components/ExportFooter.tsx), not that component itself.
// ExportFooter's X/Twitter glyph span uses `display: "inline-flex"`, which Satori (next/og's
// ImageResponse, used by the card route) rejects outright ("Allowed values: flex | block | contents |
// none | -webkit-box") — confirmed by running the route's test against the real renderer, not assumed.
// ExportFooter itself is left untouched since every other downloadable card on the site depends on its
// current, working, html-to-image-rendered (real-browser) form; this drops the icon and prints the
// handle as plain text instead, which needs no flex context at all. See task-5-report.md.
function PerformanceCardFooter({ context }: { context: string }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })} UTC`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "8px 16px",
        marginTop: 20,
        paddingTop: 16,
        borderTop: `1px solid ${CARD.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        <PixelBall size={20} fill={CARD.accent} live={CARD.loss} />
        <span style={{ fontSize: 14, fontWeight: 800, color: CARD.text }}>SportsDB</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>{domain}</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>·</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>@{X_HANDLE}</span>
      </div>
      <div style={{ display: "flex", fontSize: 12, color: CARD.textFaint, whiteSpace: "nowrap" }}>
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
          <div style={{ display: "flex", fontSize: 18, color: CARD.textMuted, marginTop: 4 }}>
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
      <PerformanceCardFooter context={`${LEAGUE_LABEL[league]} · Player card`} />
    </div>
  );
}
