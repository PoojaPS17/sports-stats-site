import { SectionHeader } from "@/components/SectionHeader";
import { teamDisplayName } from "@/lib/teamName";
import type { CricketSeriesStats, InningsHighlight } from "@/lib/cricketSeriesStats";

interface Team {
  id: string;
  name: string;
  abbreviation: string | null;
}

// The leaders of a series, summed from the stored scorecards of its completed matches: most runs and most
// wickets, with the best innings of each kind under them. Nothing to show renders nothing.
export function CricketSeriesLeaders({ stats, teams }: { stats: CricketSeriesStats | null; teams: Team[] }) {
  if (!stats || (stats.batting.length === 0 && stats.bowling.length === 0)) return null;
  const team = (id: string) => teams.find((t) => t.id === id) ?? null;
  const short = (id: string) => team(id)?.abbreviation ?? (team(id) ? teamDisplayName(team(id)!.name) : "");
  const full = (id: string) => (team(id) ? teamDisplayName(team(id)!.name) : null);
  const numCell = "px-2 py-2.5 text-right tabular-nums";
  const head = "text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]";
  const highlight = (label: string, h: InningsHighlight) => (
    <span>
      {label}: <strong className="tabular-nums">{h.figure}</strong> {h.name}
      {full(h.teamId) ? ` (${full(h.teamId)})` : ""}
      {h.stage ? `, ${h.stage}` : ""}
    </span>
  );
  const player = (name: string, teamId: string) => (
    <td className="py-2 pl-4">
      <span className="flex items-baseline gap-2 whitespace-nowrap font-medium">
        <span className="truncate">{name}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{short(teamId)}</span>
      </span>
    </td>
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description={`Most runs and most wickets across the ${stats.matches} completed match${stats.matches === 1 ? "" : "es"} with a stored scorecard`}>Series stats</SectionHeader>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {stats.batting.length > 0 && (
          <div className="card overflow-hidden">
            <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">Most runs</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className={head}>
                    <th className="py-2 pl-4 text-left font-semibold">Player</th>
                    {["Inns", "Runs", "HS", "Avg", "SR"].map((c) => (
                      <th key={c} className={`${numCell} font-semibold`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.batting.map((b) => (
                    <tr key={b.playerId} className="table-row">
                      {player(b.name, b.teamId)}
                      <td className={`${numCell} text-[var(--text-muted)]`}>{b.innings}</td>
                      <td className={`${numCell} font-bold`}>{b.runs}</td>
                      <td className={numCell}>{b.highScore}</td>
                      <td className={numCell}>{b.average ?? "-"}</td>
                      <td className={numCell}>{b.strikeRate ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {stats.bowling.length > 0 && (
          <div className="card overflow-hidden">
            <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">Most wickets</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className={head}>
                    <th className="py-2 pl-4 text-left font-semibold">Player</th>
                    {["Inns", "O", "Wkts", "Best", "Econ"].map((c) => (
                      <th key={c} className={`${numCell} font-semibold`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.bowling.map((b) => (
                    <tr key={b.playerId} className="table-row">
                      {player(b.name, b.teamId)}
                      <td className={`${numCell} text-[var(--text-muted)]`}>{b.innings}</td>
                      <td className={numCell}>{b.overs}</td>
                      <td className={`${numCell} font-bold`}>{b.wickets}</td>
                      <td className={numCell}>{b.best}</td>
                      <td className={numCell}>{b.economy ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {(stats.highestScore || stats.bestBowling) && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-muted)]">
          {stats.highestScore && highlight("Highest score", stats.highestScore)}
          {stats.bestBowling && highlight("Best bowling", stats.bestBowling)}
        </p>
      )}
    </section>
  );
}
