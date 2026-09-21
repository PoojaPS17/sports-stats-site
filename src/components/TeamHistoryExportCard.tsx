import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportLabel, ExportTable, EXPORT_ROW_LIMIT } from "./ExportShell";
import { formatSeasonLabel, isCupCompetition, hasTies, LEAGUE_LABEL, type League } from "@/lib/queries";
import type { TeamSeasonRow } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// The downloadable "Season by season": finish, record and points for every season on record,
// under the same four headline numbers the page opens with.
export function TeamHistoryExportCard({
  league,
  teamName,
  teamLogo,
  teamColor,
  played,
  soccer,
  summary,
}: {
  league: League;
  teamName: string;
  teamLogo: string | null;
  teamColor: string | null;
  played: TeamSeasonRow[];
  soccer: boolean;
  summary: { label: string; value: string | number; sub: string }[];
}) {
  const hasConference = played.some((h) => h.conference);
  const ties = hasTies(league);
  const headers = [
    "Finish",
    ...(hasConference ? [isCupCompetition(league) ? "Stage" : "Conference"] : []),
    "W",
    ...(soccer ? ["D"] : []),
    "L",
    ...(ties ? ["T"] : []),
    ...(soccer ? ["GF", "GA", "Pts"] : ["Pct"]),
  ];
  const rows = [...played].reverse().map((h) => ({
    key: String(h.season),
    name: formatSeasonLabel(league, h.season) ?? String(h.season),
    cells: [
      `${ordinal(h.position)} / ${h.teamsInSeason}`,
      ...(hasConference ? [h.conference ?? "—"] : []),
      String(h.wins),
      ...(soccer ? [String(h.draws ?? 0)] : []),
      String(h.losses),
      ...(ties ? [String(h.draws ?? 0)] : []),
      ...(soccer ? [String(h.goals_for ?? "—"), String(h.goals_against ?? "—"), String(h.points ?? "—")] : [h.win_percent ? Number(h.win_percent).toFixed(3) : "—"]),
    ],
  }));
  return (
    <ExportShell
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", height: 52, width: 52, alignItems: "center", justifyContent: "center", borderRadius: 10, background: CARD.bg, flexShrink: 0 }}>
            <TeamLogo name={teamName} logoUrl={teamLogo} color={teamColor} size={36} />
          </div>
          <div>
            <ExportLabel>{LEAGUE_LABEL[league]}</ExportLabel>
            <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text, lineHeight: 1.15 }}>{teamDisplayName(teamName)} season history</div>
          </div>
        </div>
      }
      context={`${teamDisplayName(teamName)} history`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {summary.map((s) => (
          <div key={s.label} style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: CARD.textMuted }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text }}>{s.value}</div>
            <div style={{ fontSize: 11, color: CARD.textFaint }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <ExportTable headers={headers} rows={rows} firstHeader="Season" limit={EXPORT_ROW_LIMIT} moreNoun="earlier seasons" />
    </ExportShell>
  );
}
