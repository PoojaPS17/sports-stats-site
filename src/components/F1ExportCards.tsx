import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportTable, ExportList, EXPORT_ROW_LIMIT } from "./ExportShell";
import type { getF1Calendar, getF1ConstructorResults, getF1ConstructorStandings, getF1DriverResults, getF1DriverStandings, getF1EventResults } from "@/lib/f1";
import { CARD } from "@/lib/exportTheme";

type Awaited1<T extends (...a: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;

const EYEBROW = "Formula 1";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function F1DriverStandingsExportCard({ season, drivers }: { season: number; drivers: Awaited1<typeof getF1DriverStandings> }) {
  const title = `F1 drivers' standings ${season}`;
  return (
    <ExportShell header={<ExportTitle eyebrow={EYEBROW} title={title} subtitle="Drivers' championship" />} context={title}>
      <ExportTable
        firstHeader="Driver"
        headers={["Team", "Wins", "Points"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more drivers"
        rows={drivers.map((d) => ({
          key: d.driver_espn_id,
          rank: d.position ?? "—",
          lead: <TeamLogo name={d.name} logoUrl={d.headshot_url} size={26} />,
          name: d.name,
          cells: [d.constructor_name ?? "—", String(d.wins ?? 0), { text: String(d.points ?? 0), tone: "strong", bold: true }],
        }))}
      />
    </ExportShell>
  );
}

export function F1ConstructorStandingsExportCard({ season, constructors }: { season: number; constructors: Awaited1<typeof getF1ConstructorStandings> }) {
  const title = `F1 constructors' standings ${season}`;
  return (
    <ExportShell header={<ExportTitle eyebrow={EYEBROW} title={title} subtitle="Constructors' championship" />} context={title}>
      <ExportTable
        firstHeader="Constructor"
        headers={["Wins", "Points"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more constructors"
        rows={constructors.map((c) => ({
          key: c.team_espn_id,
          rank: c.position ?? "—",
          lead: <TeamLogo name={c.name} logoUrl={c.logo_url} color={c.color} size={26} />,
          name: c.name,
          cells: [String(c.wins ?? 0), { text: String(c.points ?? 0), tone: "strong", bold: true }],
        }))}
      />
    </ExportShell>
  );
}

// One session of a race weekend (practice, qualifying, sprint, race) as a classification.
export function F1SessionExportCard({ event, sessionLabel, results }: { event: { name: string; date: string; circuit: string | null }; sessionLabel: string; results: Awaited1<typeof getF1EventResults> }) {
  const title = `${event.name}: ${sessionLabel}`;
  const sorted = [...results].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  return (
    <ExportShell header={<ExportTitle eyebrow={EYEBROW} title={title} subtitle={[fmtDate(event.date), event.circuit].filter(Boolean).join(" · ")} />} context={title}>
      <ExportTable
        firstHeader="Driver"
        headers={["Team"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more drivers"
        rows={sorted.map((r) => ({
          key: r.driver_espn_id,
          rank: r.position ?? "—",
          name: r.winner ? `${r.driver_name}  ·  Winner` : r.driver_name,
          cells: [r.constructor_name ?? "—"],
        }))}
      />
    </ExportShell>
  );
}

type ResultRow = { key: string; title: string; sub: string; position: number | null; winner: boolean };

// A driver's or constructor's recent race results, newest first: the race, the date and
// where they finished.
export function F1ResultsExportCard({ title, subtitle, rows }: { title: string; subtitle?: string | null; rows: ResultRow[] }) {
  return (
    <ExportShell header={<ExportTitle eyebrow={EYEBROW} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
        <ExportList
          limit={EXPORT_ROW_LIMIT}
          rows={rows.map((r) => ({
            key: r.key,
            rank: "",
            title: r.title,
            sub: r.sub,
            value: <span style={{ color: r.winner ? CARD.accent : CARD.text }}>{r.position ? `P${r.position}` : "—"}{r.winner ? " · WIN" : ""}</span>,
          }))}
        />
      </div>
    </ExportShell>
  );
}

export function driverResultRows(results: Awaited1<typeof getF1DriverResults>): ResultRow[] {
  return results.map((r) => ({ key: r.event_espn_id, title: r.event_name, sub: [fmtDate(r.session_date), r.constructor_name].filter(Boolean).join(" · "), position: r.position ?? null, winner: Boolean(r.winner) }));
}

export function constructorResultRows(results: Awaited1<typeof getF1ConstructorResults>): ResultRow[] {
  return results.map((r) => ({ key: `${r.event_espn_id}-${r.driver_slug}`, title: r.event_name, sub: `${r.driver_name} · ${fmtDate(r.session_date)}`, position: r.position ?? null, winner: Boolean(r.winner) }));
}

export function F1CalendarExportCard({ season, calendar }: { season: number; calendar: Awaited1<typeof getF1Calendar> }) {
  const title = `F1 calendar ${season}`;
  return (
    <ExportShell header={<ExportTitle eyebrow={EYEBROW} title={title} subtitle="Race weekends with circuits and winners" />} context={title}>
      <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
        <ExportList
          limit={EXPORT_ROW_LIMIT}
          rows={calendar.map((ev) => ({
            key: ev.espn_id,
            rank: "",
            title: ev.name,
            sub: [new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), ev.circuit_name, ev.circuit_city && ev.circuit_country ? `${ev.circuit_city}, ${ev.circuit_country}` : null].filter(Boolean).join(" · "),
            value: <span style={{ fontSize: 14, color: ev.winner_name ? CARD.text : CARD.textFaint }}>{ev.winner_name ?? "Upcoming"}</span>,
          }))}
        />
      </div>
    </ExportShell>
  );
}
