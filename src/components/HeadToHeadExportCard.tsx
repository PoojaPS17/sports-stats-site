import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle } from "./ExportShell";
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "@/lib/queries";
import { isSoccer, type HeadToHead } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";

// The record between two teams: the win split, the bar, and the four headline numbers
// the live page opens with.
export function HeadToHeadExportCard({ league, h2h, title, streakText }: { league: League; h2h: HeadToHead; title: string; streakText: string | null }) {
  const soccer = isSoccer(league);
  const { teamA, teamB } = h2h;
  const total = h2h.meetings || 1;
  const short = (t: typeof teamA) => t.abbreviation ?? teamDisplayName(t.name);
  const stats = [
    { label: "Meetings", value: h2h.meetings, sub: h2h.firstSeason ? `since ${formatSeasonLabel(league, h2h.firstSeason)}` : undefined },
    { label: `${soccer ? "Goals" : "Points"} for ${short(teamA)}`, value: h2h.goalsA, sub: h2h.meetings ? `${(h2h.goalsA / total).toFixed(1)} per game` : undefined },
    { label: `${soccer ? "Goals" : "Points"} for ${short(teamB)}`, value: h2h.goalsB, sub: h2h.meetings ? `${(h2h.goalsB / total).toFixed(1)} per game` : undefined },
    { label: "Current run", value: h2h.streak && h2h.streak.length > 1 ? h2h.streak.length : "—", sub: streakText ?? undefined },
  ];
  const side = (t: typeof teamA) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
      <TeamLogo name={teamDisplayName(t.name)} logoUrl={t.logo_url} color={t.color} size={64} />
      <span style={{ fontSize: 17, fontWeight: 800, color: CARD.text }}>{teamDisplayName(t.name)}</span>
    </div>
  );
  return (
    <ExportShell header={<ExportTitle eyebrow={`${LEAGUE_LABEL[league]} · Head-to-head`} title={title} subtitle={`${h2h.meetings} ${h2h.meetings === 1 ? "meeting" : "meetings"} on record`} />} context={title}>
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
        </div>
        {side(teamB)}
      </div>
      {h2h.meetings > 0 && (
        <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 999, background: CARD.border, margin: "12px 0" }}>
          <span style={{ width: `${(h2h.winsA / total) * 100}%`, background: teamA.color ?? CARD.accent }} />
          <span style={{ width: `${(h2h.draws / total) * 100}%`, background: CARD.textFaint }} />
          <span style={{ flex: 1, background: teamB.color ?? "#d97706" }} />
        </div>
      )}
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
