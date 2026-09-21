import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup, ExportList, EXPORT_ROW_LIMIT, type ExportListRow } from "./ExportShell";
import type { League } from "@/lib/queries";
import type { RecordGame, StreakRecord } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";
import { formatGameDate } from "@/lib/gameDay";
import { scoreLineHomeFirst } from "@/lib/gamePage";

const fmtDate = (iso: string, league: League) => formatGameDate(iso, league, { month: "short", day: "numeric", year: "numeric" });

function gameRows(league: League, games: RecordGame[], unit: string): ExportListRow[] {
  return games.map((g) => {
    const homeWon = g.home_score > g.away_score;
    const side = (won: boolean) => ({ fontWeight: won ? 700 : 500, color: won ? CARD.text : CARD.textMuted });
    // Football lists the home side first; the NBA and NFL list the visitors first.
    const away = { team: g.away, score: g.away_score, won: !homeWon };
    const home = { team: g.home, score: g.home_score, won: homeWon };
    const [first, second] = scoreLineHomeFirst(league) ? [home, away] : [away, home];
    return {
      key: g.espn_id,
      title: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <TeamLogo name={first.team.name} logoUrl={first.team.logo_url} color={first.team.color} size={18} />
          <span style={side(first.won)}>{first.team.name}</span>
          <span style={{ fontWeight: 800 }}>
            {first.score}–{second.score}
          </span>
          <TeamLogo name={second.team.name} logoUrl={second.team.logo_url} color={second.team.color} size={18} />
          <span style={side(second.won)}>{second.team.name}</span>
        </span>
      ),
      sub: fmtDate(g.date, league),
      value: g.value,
      unit,
    };
  });
}

function streakRows(league: League, streaks: StreakRecord[]): ExportListRow[] {
  return streaks.map((s) => ({
    key: `${s.team.espn_id}-${s.start}`,
    lead: <TeamLogo name={teamDisplayName(s.team.name)} logoUrl={s.team.logo_url} color={s.team.color} size={24} />,
    title: teamDisplayName(s.team.name),
    sub: `${fmtDate(s.start, league)} to ${fmtDate(s.end, league)}`,
    value: s.length,
    unit: "games",
  }));
}

export type RecordBoard = { title: string; kind: "games" | "streaks"; games?: RecordGame[]; streaks?: StreakRecord[]; unit?: string };

// One section of the record book (Games, Streaks, Low scoring) as a picture: each of its
// boards is a ranked list, side by side when there are two.
export function RecordsExportCard({ league, title, subtitle, boards }: { league: League; title: string; subtitle?: string | null; boards: RecordBoard[] }) {
  const cols = recordsColumns(boards);
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, alignItems: "start" }}>
        {boards.map((b) => (
          <ExportGroup key={b.title} title={b.title}>
            <ExportList rows={b.kind === "games" ? gameRows(league, b.games ?? [], (b.unit ?? "").replace(/ margin$/, "")) : streakRows(league, b.streaks ?? [])} limit={EXPORT_ROW_LIMIT} />
          </ExportGroup>
        ))}
      </div>
    </ExportShell>
  );
}

function recordsColumns(boards: RecordBoard[]): number {
  return boards.length === 1 ? 1 : boards.length === 3 ? 3 : 2;
}

/** Width that gives each board room for a two-team line with logos. */
export function recordsExportWidth(boards: RecordBoard[]): number {
  return [640, 1100, 1100][recordsColumns(boards) - 1];
}
