import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";
import { NBA_NO_BOX_SCORE_CARD_NOTE } from "@/lib/playerCopy";

// The downloadable version of PlayerHeader + PlayerCareerStrip: same facts (name,
// team, headline numbers), redrawn on a fixed-width light card so nothing truncates
// and the image looks the same wherever it's shared.
export function PlayerExportCard({
  league,
  name,
  headshotUrl,
  teamName,
  teamColor,
  meta,
  stats,
  context = "Career stats",
}: {
  league: League;
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamColor: string | null;
  meta: string[];
  /** `noBoxScore` marks a value that carries the † (see `careerStripStats`); the card then explains it. */
  stats: { label: string; value: string; noBoxScore?: boolean }[];
  /** What the numbers cover, shown in the footer ("Career stats", "2025-26 stats"). */
  context?: string;
}) {
  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={headshotUrl} width={72} height={72} crossOrigin="anonymous" alt="" style={{ width: 72, height: 72, borderRadius: 999, objectFit: "cover", background: CARD.accentSoft }} />
        ) : (
          <TeamLogo name={name} logoUrl={null} color={teamColor} size={72} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>
            {LEAGUE_LABEL[league]}
            {teamName ? ` · ${teamDisplayName(teamName)}` : ""}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: CARD.text, lineHeight: 1.15 }}>{name}</div>
          {meta.length > 0 && <div style={{ marginTop: 4, fontSize: 14, color: CARD.textMuted }}>{meta.join("  ·  ")}</div>}
        </div>
      </div>
      {stats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${CARD.border}` }}>
          {stats.map((s) => (
            <div key={s.label} style={{ minWidth: 84 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: CARD.textMuted }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
      {stats.some((s) => s.noBoxScore) && <div style={{ marginTop: 12, fontSize: 12, color: CARD.textMuted }}>{NBA_NO_BOX_SCORE_CARD_NOTE}</div>}
      <ExportFooter context={context} />
    </div>
  );
}
