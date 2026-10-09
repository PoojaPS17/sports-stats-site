import { TeamLogo } from "./TeamLogo";
import { ExportLabel } from "./ExportShell";
import { teamDisplayName } from "@/lib/teamName";
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";
import { splitCricketScore } from "@/lib/cricketMatchExtras";
import type { ShareHeaderData } from "@/lib/cricketShare";

// The top of every cricket match image: what the match was (format, stage, series), when, both crests with their
// scores and how it ended. One header for every card on both match routes, so the pictures from one match always
// open the same way. A side that lost is grey, never red.
export function CricketExportHeader({ header, size = "standard" }: { header: ShareHeaderData; size?: "standard" | "large" }) {
  const large = size === "large";
  const showScore = header.state === "post" || header.state === "in";
  const done = header.state === "post";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <ExportLabel>{header.eyebrow}</ExportLabel>
        {header.when && <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: CARD.textMuted }}>{header.state === "in" ? `Live · ${header.when}` : header.when}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: large ? 16 : 10, marginTop: large ? 20 : 16 }}>
        {header.sides.map((s) => {
          const lost = done && !s.winner;
          const { main, detail } = splitCricketScore(s.score);
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: large ? 14 : 8, minWidth: 0 }}>
                <TeamLogo name={s.name} logoUrl={s.logo} size={large ? 48 : 28} priority />
                <span style={{ fontSize: large ? 20 : 15, fontWeight: lost ? 500 : 800, color: lost ? CARD.textMuted : CARD.text }}>{teamDisplayName(s.name)}</span>
              </div>
              {showScore && main && (
                <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: CARD_DISPLAY_FONT, fontSize: large ? 34 : 24, lineHeight: 1, fontWeight: lost ? 600 : 800, color: lost ? CARD.textMuted : CARD.text }}>{main}</span>
                  {detail && <span style={{ display: "block", marginTop: 3, fontSize: large ? 12 : 11, color: CARD.textMuted }}>{detail}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {header.result && <div style={{ marginTop: large ? 18 : 12, fontSize: large ? 18 : 14, fontWeight: 700, lineHeight: 1.3, color: CARD.accent }}>{header.result}</div>}
    </div>
  );
}
