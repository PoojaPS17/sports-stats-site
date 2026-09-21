import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup, ExportList } from "./ExportShell";
import { formatSeasonLabel, type League, type LeaderRow } from "@/lib/queries";

// The downloadable leaderboards: every category on the page as its own top-ten list, laid
// out two to a row so a full set of leaders is one picture.
export function LeadersExportCard({ league, season, title, note, boards }: { league: League; season: number | null; title: string; note: string | null; boards: { label: string; unit: string; rows: LeaderRow[] }[] }) {
  const filled = boards.filter((b) => b.rows.length > 0);
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={season ? `${formatSeasonLabel(league, season)} season${note ? `. ${note}` : ""}` : note} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        {filled.map((b) => (
          <ExportGroup key={b.label} title={b.label}>
            <ExportList
              rows={b.rows.map((r) => ({
                key: r.player_espn_id,
                rank: r.rank,
                lead: <TeamLogo name={r.name} logoUrl={r.headshot_url} size={28} />,
                title: r.name,
                sub: r.team_name ? teamDisplayName(r.team_name) : null,
                value: r.value,
                unit: b.unit,
              }))}
            />
          </ExportGroup>
        ))}
      </div>
    </ExportShell>
  );
}
