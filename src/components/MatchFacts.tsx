import type { GameDetails } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { isSoccerLeague } from "@/lib/queries";

function periodLabels(league: League, n: number): string[] {
  const soccer = isSoccerLeague(league);
  return Array.from({ length: n }, (_, i) => {
    if (soccer) return i === 0 ? "1H" : i === 1 ? "2H" : `ET${i - 1}`;
    return i < 4 ? `Q${i + 1}` : n - 4 === 1 ? "OT" : `OT${i - 3}`;
  });
}

// Venue, crowd and officials, plus the score by period when the feed carries it.
export function MatchFacts({ league, game, details }: { league: League; game: GameRow; details: GameDetails }) {
  const facts: string[] = [];
  if (details.venue) facts.push(details.city ? `${details.venue}, ${details.city}` : details.venue);
  if (details.attendance) facts.push(`Attendance ${details.attendance.toLocaleString("en-US")}`);
  const referees = details.officials.filter((o) => /referee|umpire/i.test(o.role) && !/assistant|video|fourth|replay/i.test(o.role));
  if (referees.length > 0) facts.push(`${referees.length > 1 ? "Officials" : referees[0].role || "Referee"}: ${referees.map((o) => o.name).join(", ")}`);
  const ls = details.linescores;
  if (facts.length === 0 && !ls) return null;
  const labels = ls ? periodLabels(league, Math.max(ls.home.length, ls.away.length)) : [];

  return (
    <div className="card flex flex-col gap-3 px-4 py-3">
      {facts.length > 0 && <p className="text-sm text-[var(--text-muted)]">{facts.join(" · ")}</p>}
      {ls && (
        <div className="overflow-x-auto">
          <table className="w-full max-w-md border-collapse text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                <th className="py-1 text-left font-semibold">Score by period</th>
                {labels.map((l) => (
                  <th key={l} className="px-2 py-1 text-right font-semibold">{l}</th>
                ))}
                <th className="px-2 py-1 text-right font-semibold">T</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: game.away_abbr ?? game.away_name, scores: ls.away, total: game.away_score_display ?? game.away_score },
                { name: game.home_abbr ?? game.home_name, scores: ls.home, total: game.home_score_display ?? game.home_score },
              ].map((row) => (
                <tr key={row.name} className="border-t border-[var(--border)]">
                  <td className="py-1.5 font-medium">{row.name}</td>
                  {labels.map((l, i) => (
                    <td key={l} className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{row.scores[i] ?? "—"}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">{row.total ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
