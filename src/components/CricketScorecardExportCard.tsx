import type { ReactNode } from "react";
import type { CricketTeamScorecard } from "@/lib/matchDetail";
import { ExportShell, ExportGroup, ExportTable } from "./ExportShell";
import { scorecardBlocks, type ScorecardBlock, type ScorecardTableData } from "./CricketScorecard";
import type { ScorecardTabData } from "@/lib/cricketScorecardView";
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

function Block({ b, children }: { b: ScorecardBlock; children?: ReactNode }) {
  return (
    <ExportGroup
      title={
        <>
          {b.team}
          {b.label && <span style={{ fontWeight: 600, color: CARD.textMuted }}> {b.label}</span>}
        </>
      }
      aside={b.total}
    >
      <Table t={b.batting} />
      {children}
      <Table t={b.bowling} />
    </ExportGroup>
  );
}

// The downloadable Scorecard: every innings in match order, batters then bowlers, under
// whatever header the page supplies (the scoreline and result). `blocks` replaces the
// ones read from `scorecard` when the page has them already.
export function CricketScorecardExportCard({ header, context, scorecard, blocks }: { header: ReactNode; context: string; scorecard: CricketTeamScorecard[]; blocks?: ScorecardBlock[] }) {
  return (
    <div data-share-card>
      <ExportShell header={header} context={context}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
          {(blocks ?? scorecardBlocks(scorecard)).map((b) => (
            <Block key={b.key} b={b} />
          ))}
        </div>
      </ExportShell>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "8px 12px", borderTop: `1px solid ${CARD.border}`, fontSize: 12, lineHeight: 1.45, color: CARD.textMuted }}>
      <span style={{ fontWeight: 800, color: CARD.text }}>{label} </span>
      {value}
    </div>
  );
}

// One innings, as the open tab shows it: the batters, the extras, the total and the fall of wickets, then the bowlers.
export function CricketInningsExportCard({ header, context, tab }: { header: ReactNode; context: string; tab: ScorecardTabData }) {
  const extras = tab.extras.total === null ? null : `${tab.extras.total}${tab.extras.breakdown ? ` (${tab.extras.breakdown})` : ""}`;
  return (
    <div data-share-card>
    <ExportShell header={header} context={context}>
      <div style={{ borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
        <Block b={tab.block}>
          {extras && <Line label="Extras" value={extras} />}
          {tab.totalLine && <Line label="Total" value={tab.totalLine} />}
        </Block>
        {tab.fallOfWickets && (
          <div style={{ marginTop: 12 }}>
            <ExportGroup title="Fall of wickets">
              <div style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.5, color: CARD.textMuted }}>{tab.fallOfWickets}</div>
            </ExportGroup>
          </div>
        )}
      </div>
    </ExportShell>
    </div>
  );
}
