import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

export function TeamExportCard({
  league,
  name,
  logoUrl,
  color,
  meta,
}: {
  league: League;
  name: string;
  logoUrl: string | null;
  color: string | null;
  meta?: string[];
}) {
  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 12, background: CARD.bg, flexShrink: 0 }}>
          <TeamLogo name={name} logoUrl={logoUrl} color={color} size={44} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>{LEAGUE_LABEL[league]}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: CARD.text, lineHeight: 1.15 }}>{teamDisplayName(name)}</div>
          {meta && meta.length > 0 && <div style={{ marginTop: 4, fontSize: 14, color: CARD.textMuted }}>{meta.join("   ")}</div>}
        </div>
      </div>
      <ExportFooter context={`${LEAGUE_LABEL[league]} team card`} />
    </div>
  );
}
