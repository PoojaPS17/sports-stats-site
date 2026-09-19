import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup, ExportList, ExportTable, EXPORT_ROW_LIMIT } from "./ExportShell";
import { isSoccer } from "@/lib/analytics";
import type { PerformerBoard, TableMovementRow } from "@/lib/matchweeks";
import type { League } from "@/lib/queries";

// "Table after round N": position, movement since the round before, and the running
// record, as the page's sidebar shows it.
export function WeekTableExportCard({ league, title, subtitle, table }: { league: League; title: string; subtitle: string; table: TableMovementRow[] }) {
  const soccer = isSoccer(league);
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <ExportTable
        firstHeader="Team"
        headers={[soccer ? "P" : "W-L", "Move", soccer ? "Pts" : "Pct"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more teams"
        rows={table.map((r) => ({
          key: r.team.espn_id,
          rank: r.position,
          lead: <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={22} />,
          name: teamDisplayName(r.team.name),
          cells: [
            soccer ? String(r.played) : `${r.wins}-${r.losses}`,
            { text: r.movement > 0 ? `▲${r.movement}` : r.movement < 0 ? `▼${-r.movement}` : "–", tone: r.movement > 0 ? "win" : r.movement < 0 ? "loss" : "muted", bold: true },
            { text: soccer ? String(r.points) : r.played ? (r.wins / r.played).toFixed(3) : "—", tone: "strong", bold: true },
          ],
        }))}
      />
    </ExportShell>
  );
}

// The round's best single-game figures, one ranked list per category.
export function WeekPerformersExportCard({ league, title, subtitle, boards }: { league: League; title: string; subtitle: string; boards: PerformerBoard[] }) {
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: boards.length === 1 ? "1fr" : "1fr 1fr", gap: 14, alignItems: "start" }}>
        {boards.map((b) => (
          <ExportGroup key={b.title} title={b.title}>
            <ExportList
              rows={b.rows.map((r) => ({
                key: `${r.slug}-${r.game_espn_id}`,
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
