import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup } from "./ExportShell";
import type { MetricGroup } from "@/lib/compare";
import type { League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

export type CompareSide = { name: string; logoUrl: string | null; color: string | null; lines: string[] };

// Two fixed colours rather than the entrants' own: rival teams often share one (two red
// clubs), and a shared picture has to say which bar is whose.
const COLOR_A = CARD.accent;
const COLOR_B = "#d97706";

function SideHeader({ side, align, color }: { side: CompareSide; align: "left" | "right"; color: string }) {
  const row = align === "left" ? "row" : "row-reverse";
  return (
    <div style={{ display: "flex", flexDirection: row, alignItems: "center", gap: 12, borderTop: `3px solid ${color}`, background: CARD.bg, borderRadius: 10, padding: "10px 14px", textAlign: align }}>
      <TeamLogo name={side.name} logoUrl={side.logoUrl} color={side.color} size={44} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: CARD.text }}>{side.name}</div>
        {side.lines.map((l) => (
          <div key={l} style={{ fontSize: 12, color: CARD.textMuted }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// The downloadable side-by-side: both entrants on top, then every metric group with the
// same proportional bars and "better value in bold" rule as the live comparison.
export function CompareExportCard({
  league,
  title,
  subtitle,
  a,
  b,
  groups,
  nameA,
  nameB,
}: {
  league: League;
  title: string;
  subtitle?: string | null;
  a: CompareSide;
  b: CompareSide;
  groups: MetricGroup[];
  nameA: string;
  nameB: string;
}) {
  const ca = COLOR_A;
  const cb = COLOR_B;
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SideHeader side={a} align="left" color={ca} />
        <SideHeader side={b} align="right" color={cb} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
        {groups.map((g) => (
          <ExportGroup key={g.title} title={g.title} aside={<span style={{ fontSize: 11, color: CARD.textFaint }}>{nameA} · {nameB}</span>}>
            {g.note && <div style={{ padding: "6px 12px", fontSize: 12, color: CARD.textFaint, borderTop: `1px solid ${CARD.border}` }}>{g.note}</div>}
            {g.metrics.map((m) => {
              const both = m.a != null && m.b != null;
              const aBetter = both && m.a !== m.b && (m.lowerIsBetter ? m.a! < m.b! : m.a! > m.b!);
              const bBetter = both && m.a !== m.b && !aBetter;
              const total = both ? Math.abs(m.a!) + Math.abs(m.b!) : 0;
              const pctA = total > 0 ? (Math.abs(m.a!) / total) * 100 : 50;
              return (
                <div key={m.label} style={{ padding: "8px 12px", borderTop: `1px solid ${CARD.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: aBetter ? 800 : 500, color: aBetter ? CARD.text : CARD.textMuted }}>{m.aText}</span>
                    <span style={{ fontSize: 12, color: CARD.textMuted, textAlign: "center" }}>{m.label}</span>
                    <span style={{ fontWeight: bBetter ? 800 : 500, color: bBetter ? CARD.text : CARD.textMuted }}>{m.bText}</span>
                  </div>
                  {!m.noBar && both && total > 0 && (
                    <div style={{ display: "flex", height: 6, overflow: "hidden", borderRadius: 999, background: CARD.border, marginTop: 6 }}>
                      <span style={{ width: `${pctA}%`, background: ca, opacity: aBetter || !bBetter ? 1 : 0.45 }} />
                      <span style={{ flex: 1, background: cb, opacity: bBetter || !aBetter ? 1 : 0.45 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </ExportGroup>
        ))}
      </div>
    </ExportShell>
  );
}
