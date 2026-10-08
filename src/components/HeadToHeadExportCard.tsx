import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle } from "./ExportShell";
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "@/lib/queries";
import { isSoccer, type HeadToHead } from "@/lib/analytics";
import { isCricketLeague, isFirstClassCricket } from "@/lib/leagues";
import { h2hOtherResults } from "@/lib/h2h";
import { recordedResultNote } from "@/lib/h2hOutcome";
import { CARD } from "@/lib/exportTheme";
import { rivalryMeter } from "@/lib/rivalry";

// The record between two teams: the win split, the bar, and the four headline numbers
// the live page opens with.
export function HeadToHeadExportCard({ league, h2h, title, streakText, nextLine }: { league: League; h2h: HeadToHead; title: string; streakText: string | null; nextLine?: string }) {
  const soccer = isSoccer(league);
  const { teamA, teamB } = h2h;
  const cricket = isCricketLeague(league);
  // The bar spans the meetings with a recorded result; the middle is draws, ties and no results.
  const recorded = h2h.meetings - h2h.unknown;
  const total = recorded || 1;
  const otherResults = h2hOtherResults(h2h);
  const resultsNote = recordedResultNote(h2h);
  const short = (t: typeof teamA) => t.abbreviation ?? teamDisplayName(t.name);
  const tag = (t: typeof teamA) => t.abbreviation ?? teamDisplayName(t.name).slice(0, 3).toUpperCase();
  const stats = [
    { label: "Meetings", value: h2h.meetings, sub: h2h.firstSeason ? `since ${formatSeasonLabel(league, h2h.firstSeason)}` : undefined },
    // Cricket scores on file are a side's first innings or one match total: no goals-for style totals, the other results stand in.
    ...(cricket
      ? [
          { label: isFirstClassCricket(league) ? "Drawn" : "Tied", value: isFirstClassCricket(league) ? h2h.draws : h2h.ties, sub: undefined as string | undefined },
          { label: isFirstClassCricket(league) ? "Tied" : "No result", value: isFirstClassCricket(league) ? h2h.ties : h2h.noResults, sub: undefined as string | undefined },
        ]
      : [
          { label: `${soccer ? "Goals" : "Points"} for ${short(teamA)}`, value: h2h.goalsA, sub: h2h.meetings ? `${(h2h.goalsA / h2h.meetings).toFixed(1)} per game` : undefined },
          { label: `${soccer ? "Goals" : "Points"} for ${short(teamB)}`, value: h2h.goalsB, sub: h2h.meetings ? `${(h2h.goalsB / h2h.meetings).toFixed(1)} per game` : undefined },
        ]),
    { label: "Current run", value: h2h.streak && h2h.streak.length > 1 ? h2h.streak.length : "—", sub: streakText ?? undefined },
  ];
  const meter = rivalryMeter(h2h, (t) => teamDisplayName(t.name));
  const pill = (r: "A" | "B" | "D" | "T" | "N") => ({ text: r === "A" ? tag(teamA) : r === "B" ? tag(teamB) : r === "T" ? "TIE" : r === "N" ? "NR" : "D", border: r === "A" ? teamA.color ?? CARD.accent : r === "B" ? teamB.color ?? "#d97706" : CARD.textFaint });
  const side = (t: typeof teamA) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
      <TeamLogo name={teamDisplayName(t.name)} logoUrl={t.logo_url} color={t.color} size={64} />
      <span style={{ fontSize: 17, fontWeight: 800, color: CARD.text }}>{teamDisplayName(t.name)}</span>
    </div>
  );
  return (
    <ExportShell header={<ExportTitle eyebrow={`${LEAGUE_LABEL[league]} · Head-to-head`} title={title} subtitle={`${nextLine ? `${nextLine} · ` : ""}${h2h.meetings} ${h2h.meetings === 1 ? "meeting" : "meetings"} on record`} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, padding: "8px 0 4px" }}>
        {side(teamA)}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: CARD.text, fontVariantNumeric: "tabular-nums" }}>
            {h2h.winsA}
            <span style={{ margin: "0 10px", color: CARD.textFaint }}>–</span>
            {h2h.winsB}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>Wins</div>
          {soccer && <div style={{ marginTop: 4, fontSize: 12, color: CARD.textMuted }}>{h2h.draws} draws</div>}
          {cricket && otherResults && <div style={{ marginTop: 4, fontSize: 12, color: CARD.textMuted }}>{otherResults}</div>}
        </div>
        {side(teamB)}
      </div>
      {h2h.meetings > 0 && (
        <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 999, background: CARD.border, margin: "12px 0" }}>
          <span style={{ width: `${(h2h.winsA / total) * 100}%`, background: teamA.color ?? CARD.accent }} />
          <span style={{ width: `${((recorded - h2h.winsA - h2h.winsB) / total) * 100}%`, background: CARD.textFaint }} />
          <span style={{ flex: 1, background: teamB.color ?? "#d97706" }} />
        </div>
      )}
      {(meter.label || meter.last5.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: CARD.text }}>{meter.label ?? ""}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: CARD.textMuted }}>
            Last {meter.last5.length}
            {meter.last5.map((r, i) => (
              <span key={i} style={{ padding: "1px 7px", borderRadius: 999, border: `2px solid ${pill(r).border}`, fontSize: 10, fontWeight: 800, color: CARD.text }}>
                {pill(r).text}
              </span>
            ))}
          </span>
        </div>
      )}
      {resultsNote && <div style={{ marginTop: 6, fontSize: 11, color: CARD.textMuted }}>{resultsNote}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: CARD.textMuted }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11, color: CARD.textFaint }}>{s.sub}</div>}
          </div>
        ))}
      </div>
    </ExportShell>
  );
}
