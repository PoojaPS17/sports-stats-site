import type { GameDetails } from "@/lib/matchDetail";
import { teamDisplayName } from "@/lib/teamName";
import type { GameRow, League } from "@/lib/queries";
import { isSoccerLeague } from "@/lib/queries";
import { scoreLineHomeFirst } from "@/lib/gamePage";

function periodLabels(league: League, n: number): string[] {
  const soccer = isSoccerLeague(league);
  return Array.from({ length: n }, (_, i) => {
    if (soccer) return i === 0 ? "1H" : i === 1 ? "2H" : `ET${i - 1}`;
    return i < 4 ? `Q${i + 1}` : n - 4 === 1 ? "OT" : `OT${i - 3}`;
  });
}

/**
 * True when one of the venue's comma-separated parts is the city: "Wankhede Stadium, Mumbai" for Mumbai,
 * "GB Oval, Szodliget, Budapest" for Szodliget. A city that is only part of the ground's name, or a venue
 * that is a single part ("Melbourne Cricket Ground" for Melbourne), is not a repeat: Cricinfo prints both.
 */
export function venueNamesCity(venue: string, city: string): boolean {
  const fold = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = venue.split(",").map(fold);
  const wanted = fold(city);
  return wanted.length > 0 && parts.length > 1 && parts.slice(1).includes(wanted);
}

// Venue, crowd and officials, plus the score by period when the feed carries it.
export function MatchFacts({ league, game, details }: { league: League; game: GameRow; details: GameDetails }) {
  const facts: string[] = [];
  // ESPN's venue often already ends in its city ("Wankhede Stadium, Mumbai"), which the city then repeats.
  if (details.venue) facts.push(details.city && !venueNamesCity(details.venue, details.city) ? `${details.venue}, ${details.city}` : details.venue);
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
              {(() => {
                const away = { name: game.away_abbr ?? teamDisplayName(game.away_name), scores: ls.away, total: game.away_score_display ?? game.away_score };
                const home = { name: game.home_abbr ?? teamDisplayName(game.home_name), scores: ls.home, total: game.home_score_display ?? game.home_score };
                // Football lists the home side first, like the scoreline above; the NBA and NFL the visitors.
                return scoreLineHomeFirst(league) ? [home, away] : [away, home];
              })().map((row) => (
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
