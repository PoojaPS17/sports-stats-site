import type { ReactNode } from "react";
import type { CricketTeamScorecard } from "@/lib/matchDetail";
import { ExportShell, ExportGroup, ExportTable } from "./ExportShell";
import { scorecardBlocks, type ScorecardTableData } from "./CricketScorecard";
import { CARD } from "@/lib/exportTheme";

function Table({ t }: { t: ScorecardTableData }) {
  if (t.rows.length === 0) return null;
  return (
    <div>
      <div style={{ padding: "8px 12px 2px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: CARD.textMuted }}>{t.title}</div>
      <ExportTable bare headers={t.labels} rows={t.rows.map((r, i) => ({ key: `${r.athleteId}-${r.innings ?? 0}-${i}`, name: r.name, note: r.dismissal, cells: r.stats }))} />
    </div>
  );
}

// The downloadable Scorecard: every innings in match order, batters then bowlers, under
// whatever header the page supplies (the scoreline and result).
export function CricketScorecardExportCard({ header, context, scorecard }: { header: ReactNode; context: string; scorecard: CricketTeamScorecard[] }) {
  return (
    <ExportShell header={header} context={context}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
        {scorecardBlocks(scorecard).map((b) => (
          <ExportGroup
            key={b.key}
            title={
              <>
                {b.team}
                {b.label && <span style={{ fontWeight: 600, color: CARD.textMuted }}> {b.label}</span>}
              </>
            }
            aside={b.total}
          >
            <Table t={b.batting} />
            <Table t={b.bowling} />
          </ExportGroup>
        ))}
      </div>
    </ExportShell>
  );
}
