import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportMore, EXPORT_ROW_LIMIT } from "./ExportShell";
import type { League } from "@/lib/queries";
import type { LeagueInjuryRow } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";

const STATUS_TONE = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("reserve") || s.includes("suspen")) return { bg: "#fee2e2", fg: "#b91c1c" };
  if (s.includes("doubt")) return { bg: "#fef3c7", fg: "#b45309" };
  return { bg: CARD.bg, fg: CARD.textMuted };
};

// The injury report as a picture: players grouped by team with their status. Stops after
// 25 players and says how many more the full report holds.
export function InjuriesExportCard({ league, rows, title, subtitle }: { league: League; rows: LeagueInjuryRow[]; title: string; subtitle: string }) {
  const shown = rows.slice(0, EXPORT_ROW_LIMIT);
  const hidden = rows.length - shown.length;
  const byTeam = new Map<string, LeagueInjuryRow[]>();
  for (const r of shown) {
    if (!byTeam.has(r.team.espn_id)) byTeam.set(r.team.espn_id, []);
    byTeam.get(r.team.espn_id)!.push(r);
  }
  // Two columns of teams, each new team going to whichever column holds fewer players so
  // the long injury notes don't leave one side much taller than the other.
  const columns: LeagueInjuryRow[][][] = [[], []];
  const sizes = [0, 0];
  for (const list of byTeam.values()) {
    const c = sizes[0] <= sizes[1] ? 0 : 1;
    columns[c].push(list);
    sizes[c] += list.length + 1;
  }
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        {columns.map((teams, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {teams.map((list) => {
              const team = list[0].team;
              return (
                <div key={team.espn_id} style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD.bg, padding: "8px 12px", fontSize: 14, fontWeight: 800, color: CARD.text }}>
                    <TeamLogo name={team.name} logoUrl={team.logo_url} color={team.color} size={22} />
                    {teamDisplayName(team.name)}
                  </div>
                  {list.map((i) => {
                    const tone = STATUS_TONE(i.status);
                    return (
                      <div key={i.player_espn_id} style={{ padding: "8px 12px", borderTop: `1px solid ${CARD.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: CARD.text }}>{i.player_name}</span>
                          {i.position && <span style={{ fontSize: 12, color: CARD.textFaint }}>{i.position}</span>}
                          <span style={{ marginLeft: "auto", borderRadius: 999, background: tone.bg, color: tone.fg, padding: "2px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{i.status}</span>
                        </div>
                        {i.short_comment && <div style={{ marginTop: 3, fontSize: 12, color: CARD.textMuted, lineHeight: 1.4 }}>{i.short_comment}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more player" : "more players"} />
    </ExportShell>
  );
}
