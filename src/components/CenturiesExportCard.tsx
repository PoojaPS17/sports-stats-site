import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportTable, EXPORT_ROW_LIMIT } from "./ExportShell";
import { LEAGUE_LABEL, type League } from "@/lib/queries";
import { formatGameDate } from "@/lib/gameDay";

type Century = Awaited<ReturnType<typeof import("@/lib/queries").getCricketCenturies>>[number];

// The centuries list as a picture, newest first, with the same columns as the live table.
export function CenturiesExportCard({ league, centuries, title, subtitle }: { league: League; centuries: Century[]; title: string; subtitle: string }) {
  return (
    <ExportShell header={<ExportTitle eyebrow={`Cricket · ${LEAGUE_LABEL[league]}`} title={title} subtitle={subtitle} />} context={title}>
      <ExportTable
        firstHeader="Player"
        firstMinWidth={310}
        headers={["Team", "Runs", "Balls", "4s", "6s", "SR", "Opponent", "Date"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more centuries"
        rows={centuries.map((c, i) => ({
          key: `${c.player_espn_id}-${c.date}-${i}`,
          lead: <TeamLogo name={c.player_name} logoUrl={c.headshot_url} size={24} />,
          name: c.player_name,
          note: c.venue,
          cells: [
            teamDisplayName(c.team_name),
            { text: `${c.runs}${c.not_out ? "*" : ""}`, tone: "strong", bold: true },
            String(c.balls_faced ?? "-"),
            String(c.fours ?? "-"),
            String(c.sixes ?? "-"),
            c.balls_faced ? ((c.runs / c.balls_faced) * 100).toFixed(1) : "-",
            `vs ${teamDisplayName(c.opponent_name)}`,
            formatGameDate(c.date, league, { month: "short", day: "numeric", year: "numeric" }),
          ],
        }))}
      />
    </ExportShell>
  );
}
