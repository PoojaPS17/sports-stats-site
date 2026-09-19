import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportLabel, ExportMore, capRows } from "./ExportShell";
import { SERIES_KIND_LABEL, formatSeriesDates, type CricketSeries, type CricketSeriesMatch, type SeriesSide } from "@/lib/cricketSeries";
import { normalizeStage } from "@/lib/stage";
import { CARD } from "@/lib/exportTheme";

function Side({ side, decided }: { side: SeriesSide | null; decided: boolean }) {
  if (!side) return null;
  const loser = decided && !side.winner;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
      <TeamLogo name={teamDisplayName(side.name)} logoUrl={side.logo} size={20} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: loser ? 500 : 700, color: loser ? CARD.textMuted : CARD.text }}>{teamDisplayName(side.name)}</span>
      <span style={{ fontSize: 13, fontWeight: loser ? 500 : 700, color: loser ? CARD.textMuted : CARD.text, fontVariantNumeric: "tabular-nums" }}>{side.score ?? ""}</span>
    </div>
  );
}

function when(m: CricketSeriesMatch): string {
  const d = new Date(m.date);
  if (m.status_state === "post") return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

// The downloadable Fixtures / Results list for a cricket series: date, stage, both sides
// with their scores and the result line.
export function SeriesMatchesExportCard({ series, title, matches }: { series: CricketSeries; title: string; matches: CricketSeriesMatch[] }) {
  const dates = formatSeriesDates(series.start_date, series.end_date);
  const { shown, hidden } = capRows(matches);
  return (
    <ExportShell
      header={
        <div>
          <ExportLabel>
            Cricket · {SERIES_KIND_LABEL[series.kind]}
            {series.formats.length > 0 ? ` · ${series.formats.join(" · ")}` : ""}
          </ExportLabel>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: CARD.text }}>{series.name}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: CARD.textMuted }}>{[title, dates].filter(Boolean).join(" · ")}</div>
        </div>
      }
      context={`${series.name} · ${title}`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {shown.map((m) => {
          const decided = m.status_state === "post" && Boolean(m.home?.winner || m.away?.winner);
          return (
            <div key={m.espn_id} style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: 11, color: CARD.textMuted }}>
                <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{when(m)}</span>
                <span style={{ textAlign: "right" }}>{[normalizeStage(m.description), m.class_card].filter(Boolean).join(" · ")}</span>
              </div>
              <Side side={m.home} decided={decided} />
              <Side side={m.away} decided={decided} />
              {m.status_summary && m.status_state === "post" && <div style={{ marginTop: 4, fontSize: 12, color: CARD.textMuted }}>{teamDisplayName(m.status_summary)}</div>}
            </div>
          );
        })}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more match" : "more matches"} />
    </ExportShell>
  );
}
