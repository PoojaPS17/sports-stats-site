import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup, ExportTable, EXPORT_ROW_LIMIT, type ExportCell, type ExportRow } from "./ExportShell";
import { groupStandings, legendFor, zoneRules } from "./StandingsTable";
import type { League, StandingRow } from "@/lib/queries";
import { isSoccer, type ComputedTableRow } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";

const ZONE_COLOR: Record<string, string> = { "zone-1": "#1d4ed8", "zone-2": "#d97706", "zone-3": "#dc2626" };

function logo(name: string, url: string | null, color: string | null) {
  return <TeamLogo name={teamDisplayName(name)} logoUrl={url} color={color} size={22} />;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const tone = (n: number): "win" | "loss" | "muted" => (n > 0 ? "win" : n < 0 ? "loss" : "muted");

/** Width the standings image needs: two side-by-side tables when the league splits into several. */
export function standingsExportWidth(league: League, standings: StandingRow[]): number {
  return groupStandings(league, standings).sections.length > 1 ? 980 : 720;
}

// The downloadable version of the standings tables: the same grouping, columns and
// qualification / relegation colours as the live page, on the fixed light card.
export function StandingsExportCard({ league, standings, title, subtitle, context }: { league: League; standings: StandingRow[]; title: string; subtitle?: string | null; context: string }) {
  const { mode, sections } = groupStandings(league, standings);
  const sectionSize = sections.length ? sections[0][1].length : 0;
  const showZones = mode === "soccer" && sections.every(([, rows]) => rows.length === sectionSize) && zoneRules(league, sectionSize) !== null;
  const legend = showZones ? legendFor(league, sectionSize) : [];

  const headers = mode === "soccer" ? ["W", "D", "L", "GF", "GA", "GD", "Pts"] : mode === "cricket" ? ["M", "W", "L", "NR", "Pts", "NRR"] : ["W", "L", "Pct", "Streak"];

  const cellsFor = (r: StandingRow): ExportCell[] => {
    if (mode === "soccer") {
      const gd = r.goals_for != null && r.goals_against != null ? r.goals_for - r.goals_against : null;
      return [String(r.wins), String(r.draws ?? 0), String(r.losses), String(r.goals_for ?? "—"), String(r.goals_against ?? "—"), gd == null ? "—" : { text: signed(gd), tone: tone(gd) }, { text: String(r.points ?? "—"), tone: "strong", bold: true }];
    }
    if (mode === "cricket") {
      return [String(r.wins + r.losses + (r.no_result ?? 0)), String(r.wins), String(r.losses), String(r.no_result ?? 0), { text: String(r.points ?? "—"), tone: "strong", bold: true }, r.net_run_rate != null ? Number(r.net_run_rate).toFixed(3) : "—"];
    }
    const kind = r.streak?.[0]?.toUpperCase();
    return [String(r.wins), String(r.losses), Number(r.win_percent).toFixed(3), r.streak ? { text: r.streak, tone: kind === "W" ? "win" : kind === "L" ? "loss" : "muted", bold: true } : "—"];
  };

  const tables = sections.map(([name, rows]) => {
    const list: ExportRow[] = rows.map((r, i) => {
      const zone = showZones ? zoneRules(league, rows.length)?.(i + 1) ?? null : null;
      return { key: r.team_espn_id, rank: i + 1, lead: logo(r.name, r.logo_url, r.color), name: teamDisplayName(r.name), cells: cellsFor(r), marker: zone ? ZONE_COLOR[zone.cls] : undefined };
    });
    const table = <ExportTable firstHeader="Team" headers={headers} rows={list} limit={EXPORT_ROW_LIMIT} moreNoun="more teams" bare />;
    return sections.length === 1 && name === "All Teams" ? <div key={name} style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>{table}</div> : <ExportGroup key={name} title={name}>{table}</ExportGroup>;
  });

  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={context}>
      <div style={{ display: "grid", gridTemplateColumns: sections.length > 1 ? "1fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>{tables}</div>
      {legend.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 12, fontSize: 12, color: CARD.textMuted }}>
          {legend.map((z) => (
            <span key={z.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 4, height: 14, borderRadius: 2, background: ZONE_COLOR[z.cls] }} />
              {z.label}
            </span>
          ))}
        </div>
      )}
    </ExportShell>
  );
}

const FORM_COLOR = { W: CARD.win, L: CARD.loss, D: CARD.textFaint } as const;

function FormStrip({ form }: { form: ("W" | "D" | "L")[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {form.map((f, i) => (
        <span key={i} style={{ display: "inline-flex", width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: 4, background: FORM_COLOR[f], color: "#fff", fontSize: 10, fontWeight: 800 }}>
          {f}
        </span>
      ))}
    </span>
  );
}

// The Home / Away / Form tables computed from results.
export function ComputedStandingsExportCard({ league, rows, title, subtitle, context }: { league: League; rows: ComputedTableRow[]; title: string; subtitle?: string | null; context: string }) {
  const soccer = isSoccer(league);
  const headers = ["P", "W", ...(soccer ? ["D"] : []), "L", soccer ? "GF" : "PF", soccer ? "GA" : "PA", soccer ? "GD" : "Diff", soccer ? "Pts" : "Pct", "Form"];
  const list: ExportRow[] = rows.map((r, i) => {
    const diff = r.goalsFor - r.goalsAgainst;
    return {
      key: r.team.espn_id,
      rank: i + 1,
      lead: logo(r.team.name, r.team.logo_url, r.team.color),
      name: teamDisplayName(r.team.name),
      cells: [
        String(r.played),
        String(r.wins),
        ...(soccer ? [String(r.draws)] : []),
        String(r.losses),
        String(r.goalsFor),
        String(r.goalsAgainst),
        { text: signed(diff), tone: tone(diff) },
        { text: soccer ? String(r.points) : r.played ? (r.wins / r.played).toFixed(3) : "—", tone: "strong", bold: true },
        { text: <FormStrip form={[...r.form].reverse()} /> },
      ],
    };
  });
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={context}>
      <ExportTable firstHeader="Team" headers={headers} rows={list} limit={EXPORT_ROW_LIMIT} moreNoun="more teams" />
    </ExportShell>
  );
}
