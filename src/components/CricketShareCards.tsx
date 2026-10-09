import type { CSSProperties } from "react";
import { ExportShell, ExportGroup, ExportLabel } from "./ExportShell";
import { ExportFooter } from "./ExportFooter";
import { CricketExportHeader } from "./CricketExportHeader";
import { matchStoryModel } from "@/lib/cricketMatchStoryModel";
import { teamDisplayName } from "@/lib/teamName";
import { xiName } from "@/lib/cricketShareText";
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";
import type { Performer } from "@/lib/cricketPerformers";
import type { PerformersShareData, ResultShareData, StoryShareData, XiShareData } from "@/lib/cricketShare";

// The cricket match page's pictures, drawn from plain data in the card theme (fixed hex, never the site's CSS
// variables, so a card looks the same wherever it is posted). Each card's root carries data-share-card, which
// ShareMenu waits for before it captures. They are loaded only after a visitor first reaches for a share button.

export type ResultVariant = "standard" | "portrait" | "story";

const performerSub = (p: Performer, teams: Record<string, string>) => [p.detail, teams[p.teamId]].filter(Boolean).join(" · ");

function PerformerRows({ rows, teams, scale = 1 }: { rows: Performer[]; teams: Record<string, string>; scale?: number }) {
  return (
    <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
      {rows.map((p, i) => (
        <div key={`${p.athleteId}-${p.innings}-${p.kind}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: `${9 * scale}px 12px`, borderTop: i === 0 ? undefined : `1px solid ${CARD.border}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14 * scale, fontWeight: 700, color: CARD.text }}>{p.name}</div>
            <div style={{ fontSize: 11.5 * scale, color: CARD.textMuted, lineHeight: 1.35 }}>{performerSub(p, teams)}</div>
          </div>
          <div style={{ fontFamily: CARD_DISPLAY_FONT, fontSize: 24 * scale, fontWeight: 800, color: CARD.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{p.figure}</div>
        </div>
      ))}
    </div>
  );
}

/** The large panel: the Player of the Match (or the top scorer) with the figure that earned it. */
function LeadPanel({ label, name, figure, sub, scale = 1 }: { label: string; name: string; figure: string | null; sub: string | null; scale?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: CARD.accentSoft, border: `1px solid ${CARD.border}`, borderRadius: 14, padding: `${14 * scale}px ${16 * scale}px` }}>
      <div style={{ minWidth: 0 }}>
        <ExportLabel>{label}</ExportLabel>
        <div style={{ marginTop: 5, fontSize: 20 * scale, fontWeight: 800, lineHeight: 1.15, color: CARD.text }}>{name}</div>
        {sub && <div style={{ marginTop: 3, fontSize: 12.5 * scale, color: CARD.textMuted, lineHeight: 1.35 }}>{sub}</div>}
      </div>
      {figure && <div style={{ fontFamily: CARD_DISPLAY_FONT, fontSize: 40 * scale, lineHeight: 1, fontWeight: 800, color: CARD.accent, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{figure}</div>}
    </div>
  );
}

function Facts({ facts, scale = 1 }: { facts: [string, string][]; scale?: number }) {
  if (facts.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
      {facts.map(([label, value], i) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: `${7 * scale}px 12px`, borderTop: i === 0 ? undefined : `1px solid ${CARD.border}`, fontSize: 12.5 * scale }}>
          <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10.5 * scale, color: CARD.textMuted, paddingTop: 1 }}>{label}</span>
          <span style={{ fontWeight: 600, color: CARD.text, textAlign: "right" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

const SIZES: Record<ResultVariant, { scale: number; performers: number; facts: number; pad: number }> = {
  standard: { scale: 1, performers: 4, facts: 6, pad: 24 },
  portrait: { scale: 0.96, performers: 1, facts: 3, pad: 30 },
  story: { scale: 1.2, performers: 3, facts: 5, pad: 36 },
};

function ResultBody({ data, variant }: { data: ResultShareData; variant: ResultVariant }) {
  const { scale, performers, facts } = SIZES[variant];
  const lead = data.potm
    ? { label: "Player of the Match", name: data.potm.name, figure: data.large && data.large.name === data.potm.name ? data.large.figure : null, sub: data.large && data.large.name === data.potm.name ? performerSub(data.large, data.teams) : data.potm.line }
    : data.large
      ? { label: data.largeLabel, name: data.large.name, figure: data.large.figure, sub: performerSub(data.large, data.teams) }
      : null;
  // The Player of the Match's own line is the large panel; the rest below it.
  const rest = data.small.filter((p) => !(data.large && p.athleteId === data.large.athleteId && p.innings === data.large.innings && p.kind === data.large.kind)).slice(0, performers);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 * scale }}>
      {lead && <LeadPanel {...lead} scale={scale} />}
      {rest.length > 0 && <PerformerRows rows={rest} teams={data.teams} scale={scale} />}
      <Facts facts={data.facts.slice(0, facts)} scale={scale} />
    </div>
  );
}

/**
 * The result: scoreline, how it ended, the Player of the Match, the leading performers and the match facts. Standard
 * is as tall as it needs; portrait (540x675, saved at 1080x1350) and story (540x960, saved at 1080x1920) fill their
 * frame, the footer pinned to its bottom edge.
 */
export function ResultExportCard({ data, context, variant = "standard" }: { data: ResultShareData; context: string; variant?: ResultVariant }) {
  if (variant === "standard") {
    return (
      <div data-share-card>
        <ExportShell header={<CricketExportHeader header={data.header} />} context={context}>
          <ResultBody data={data} variant="standard" />
        </ExportShell>
      </div>
    );
  }
  const { pad, scale } = SIZES[variant];
  const frame: CSSProperties = { height: "100%", width: "100%", boxSizing: "border-box", background: CARD.surface, padding: pad, display: "flex", flexDirection: "column" };
  return (
    <div data-share-card style={frame}>
      <CricketExportHeader header={data.header} size="large" />
      <div style={{ marginTop: 20 * scale }}>
        <ResultBody data={data} variant={variant} />
      </div>
      <div style={{ flex: 1, minHeight: 12 }} />
      <ExportFooter context={context} inset={pad} radius={0} />
    </div>
  );
}

/** The top performers: the large panel, then each innings' leading batter and bowler. */
export function PerformersExportCard({ data, context }: { data: PerformersShareData; context: string }) {
  return (
    <div data-share-card>
      <ExportShell header={<CricketExportHeader header={data.header} />} context={context}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
          <ExportLabel>Top performers</ExportLabel>
          {data.large && <LeadPanel label={data.largeLabel} name={data.large.name} figure={data.large.figure} sub={performerSub(data.large, data.teams)} />}
          {data.small.length > 0 && <PerformerRows rows={data.small} teams={data.teams} />}
        </div>
      </ExportShell>
    </div>
  );
}

/** Both Playing XIs side by side, captain (c) and wicketkeeper (wk) marked. */
export function PlayingXiExportCard({ data, context }: { data: XiShareData; context: string }) {
  return (
    <div data-share-card>
      <ExportShell header={<CricketExportHeader header={data.header} />} context={context}>
        <div style={{ borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
          <ExportLabel>Playing XI</ExportLabel>
          <div style={{ display: "grid", gridTemplateColumns: data.sides.length > 1 ? "1fr 1fr" : "1fr", gap: 14, marginTop: 10 }}>
            {data.sides.map((side) => (
              <ExportGroup key={side.teamId || side.team} title={teamDisplayName(side.team)}>
                {side.players.map((p, i) => (
                  <div key={`${p.id}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 12px", borderTop: `1px solid ${CARD.border}`, fontSize: 13 }}>
                    <span style={{ minWidth: 16, textAlign: "right", fontSize: 11.5, color: CARD.textMuted, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 700, color: CARD.text }}>{xiName(p)}</span>
                    {p.role && <span style={{ fontSize: 11, color: CARD.textFaint }}>{p.role}</span>}
                  </div>
                ))}
              </ExportGroup>
            ))}
          </div>
        </div>
      </ExportShell>
    </div>
  );
}

/** Two side colours that would be read as one line fall back to the card's own pair. */
function lineColours(data: StoryShareData): Record<string, string> {
  const FALLBACK = [CARD.accent, CARD.textMuted];
  const out: Record<string, string> = {};
  const used = new Set<string>();
  data.innings.forEach((inn, i) => {
    if (out[inn.teamId]) return;
    const own = data.colours[inn.teamId];
    const pick = own && !used.has(own) ? own : (FALLBACK.find((c) => !used.has(c)) ?? FALLBACK[i % 2]);
    out[inn.teamId] = pick;
    used.add(pick);
  });
  return out;
}

/** The run worm for every innings with the wickets marked: the match story's default view, fixed. */
export function MatchStoryExportCard({ data, context }: { data: StoryShareData; context: string }) {
  const model = matchStoryModel(data.innings);
  const colour = lineColours(data);
  return (
    <div data-share-card>
      <ExportShell header={<CricketExportHeader header={data.header} />} context={context}>
        <div style={{ borderTop: `1px solid ${CARD.border}`, paddingTop: 16 }}>
          <ExportLabel>Match story</ExportLabel>
          <div style={{ marginTop: 4, fontSize: 12.5, color: CARD.textMuted }}>Runs over the match, over by over. A ring marks a wicket.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10, fontSize: 13, fontWeight: 700, color: CARD.text }}>
            {data.innings.map((inn) => (
              <span key={inn.period} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 16, height: 4, borderRadius: 2, background: colour[inn.teamId] }} />
                {teamDisplayName(inn.team)} {inn.total.wickets >= 10 ? `${inn.total.runs} all out` : `${inn.total.runs}/${inn.total.wickets}`}
              </span>
            ))}
          </div>
          <svg viewBox={`0 0 ${model.width} ${model.height}`} width="100%" style={{ display: "block", marginTop: 8 }} role="img" aria-label="Runs over the match for each innings">
            {model.wormGrid.map((g) => (
              <g key={g.label}>
                <line x1={model.plot.x0} x2={model.plot.x1} y1={g.y} y2={g.y} stroke={CARD.border} strokeWidth="1" />
                <text x={model.plot.x0 - 8} y={g.y + 5} fontSize="16" fill={CARD.textFaint} textAnchor="end">
                  {g.label}
                </text>
              </g>
            ))}
            {model.axis.map((a) => (
              <text key={a.label} x={a.x} y={model.height - 10} fontSize="16" fill={CARD.textFaint} textAnchor="middle">
                {a.label}
              </text>
            ))}
            {model.worm.map((w) => (
              <g key={w.period}>
                <polyline points={w.points} fill="none" stroke={colour[w.teamId]} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={w.period > 2 ? "8 6" : undefined} />
                <text x={w.end.x + 8} y={w.end.y + 5} fontSize="17" fontWeight="700" fill={colour[w.teamId]}>
                  {w.end.label}
                </text>
              </g>
            ))}
            {model.wormWickets.map((w, i) => (
              <circle key={i} cx={w.x} cy={w.y} r="6" fill={CARD.surface} stroke={colour[w.teamId]} strokeWidth="3" />
            ))}
          </svg>
        </div>
      </ExportShell>
    </div>
  );
}
