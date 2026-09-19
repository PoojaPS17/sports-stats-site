import { TeamLogo } from "./TeamLogo";
import { Flag, groupMatches } from "./TennisScores";
import { MatchBox } from "./TennisTournamentExportCards";
import { ExportShell, ExportTitle, ExportTable, ExportList, ExportMore, EXPORT_ROW_LIMIT } from "./ExportShell";
import { COMPETITION_LABEL, type TennisMatch, type TennisRankingRow } from "@/lib/tennis";
import { CARD } from "@/lib/exportTheme";

function caption(m: TennisMatch): string {
  const state = m.status_state === "in" ? (m.status_detail ?? "Live") : m.completed ? (m.status_detail && m.status_detail !== "Final" ? m.status_detail : "Final") : `${new Date(m.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
  return [state, m.round, m.court].filter(Boolean).join(" · ");
}

// Matches grouped by tournament and draw, each with set scores and the winner ticked.
// Stops at 25 matches and says how many more there were.
export function TennisScoresExportCard({ title, subtitle, matches, eyebrow = "Tennis" }: { title: string; subtitle?: string | null; matches: TennisMatch[]; eyebrow?: string }) {
  const shown = matches.slice(0, EXPORT_ROW_LIMIT);
  const hidden = matches.length - shown.length;
  const groups = groupMatches(shown);
  return (
    <ExportShell header={<ExportTitle eyebrow={eyebrow} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((g) => (
          <div key={g.key}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: `2px solid ${CARD.accent}`, paddingBottom: 4, fontSize: 14, fontWeight: 800, color: CARD.text }}>
              <span>
                {g.tournament.name}
                {g.tournament.major && <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: CARD.accent }}>Grand Slam</span>}
              </span>
              {g.tournament.location && <span style={{ fontSize: 12, fontWeight: 500, color: CARD.textMuted }}>{g.tournament.location}</span>}
            </div>
            {g.draws.map((d) => (
              <div key={d.type ?? "singles"} style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: CARD.textMuted }}>{d.type ? COMPETITION_LABEL[d.type] : "Singles"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {d.matches.map((m) => (
                    <MatchBox key={m.espn_id} m={m} caption={caption(m)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more match" : "more matches"} />
    </ExportShell>
  );
}

// A player's matches, newest first, with the tournament and year on each tile.
export function TennisPlayerMatchesExportCard({ title, subtitle, matches }: { title: string; subtitle?: string | null; matches: (TennisMatch & { season?: number })[] }) {
  const shown = matches.slice(0, EXPORT_ROW_LIMIT);
  const hidden = matches.length - shown.length;
  return (
    <ExportShell header={<ExportTitle eyebrow="Tennis" title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {shown.map((m) => (
          <MatchBox key={m.espn_id} m={m} caption={`${m.tournament_name} · ${new Date(m.date).getUTCFullYear()}${m.round ? ` · ${m.round}` : ""}`} />
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more match" : "more matches"} />
    </ExportShell>
  );
}

// World rankings: rank, player, points and movement since last week.
export function TennisRankingsExportCard({ title, subtitle, rankings, tourLabel, limit }: { title: string; subtitle?: string | null; rankings: TennisRankingRow[]; tourLabel: string; limit?: number }) {
  return (
    <ExportShell header={<ExportTitle eyebrow={`Tennis · ${tourLabel}`} title={title} subtitle={subtitle} />} context={title}>
      <ExportTable
        firstHeader="Player"
        headers={["Points", "Move"]}
        limit={limit ?? EXPORT_ROW_LIMIT}
        moreNoun="more players"
        rows={rankings.map((r) => {
          const movement = r.previous_rank !== null ? r.previous_rank - r.rank : 0;
          return {
            key: r.player_espn_id,
            rank: r.rank,
            lead: (
              <>
                <TeamLogo name={r.name} logoUrl={r.headshot_url} size={26} />
                <Flag code={r.country} />
              </>
            ),
            name: r.name,
            cells: [
              { text: r.points != null ? r.points.toLocaleString() : "-", tone: "strong" as const, bold: true },
              { text: movement > 0 ? `▲${movement}` : movement < 0 ? `▼${Math.abs(movement)}` : "—", tone: movement > 0 ? ("win" as const) : movement < 0 ? ("loss" as const) : ("muted" as const), bold: true },
            ],
          };
        })}
      />
    </ExportShell>
  );
}

export function TennisSeasonRecordExportCard({ title, subtitle, tourLabel, records }: { title: string; subtitle?: string | null; tourLabel: string; records: { season: number; wins: number; losses: number; titles: number }[] }) {
  return (
    <ExportShell header={<ExportTitle eyebrow={`Tennis · ${tourLabel}`} title={title} subtitle={subtitle} />} context={title}>
      <ExportTable
        firstHeader="Season"
        headers={["W", "L", "Win %", "Titles"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="earlier seasons"
        rows={records.map((r) => ({
          key: String(r.season),
          name: String(r.season),
          cells: [String(r.wins), String(r.losses), `${r.wins + r.losses > 0 ? Math.round((100 * r.wins) / (r.wins + r.losses)) : 0}%`, r.titles ? { text: String(r.titles), tone: "strong" as const, bold: true } : ""],
        }))}
      />
    </ExportShell>
  );
}

export function TennisRivalsExportCard({ title, subtitle, tourLabel, rivals }: { title: string; subtitle?: string | null; tourLabel: string; rivals: { espn_id: string; name: string; wins: number; matches: number }[] }) {
  return (
    <ExportShell header={<ExportTitle eyebrow={`Tennis · ${tourLabel}`} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
        <ExportList
          rows={rivals.map((r) => ({
            key: r.espn_id,
            rank: "",
            title: r.name,
            value: <span style={{ color: r.wins * 2 > r.matches ? CARD.win : r.wins * 2 < r.matches ? CARD.loss : CARD.text }}>{r.wins}–{r.matches - r.wins}</span>,
          }))}
          limit={EXPORT_ROW_LIMIT}
        />
      </div>
    </ExportShell>
  );
}
