import Link from "next/link";
import type { League } from "@/lib/queries";
import type { TeamPlayerBox } from "@/lib/matchDetail";

export function PlayerBoxScoreTable({
  league,
  team,
  playerSlugs,
}: {
  league: League;
  team: TeamPlayerBox;
  playerSlugs: Map<string, string>;
}) {
  if (team.categories.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{team.teamName}</h3>
      {team.categories.map((cat) => (
        <div key={cat.name} className="overflow-x-auto">
          {cat.name && (
            <p className="px-4 pt-3 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{cat.name}</p>
          )}
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pl-4 font-medium">Player</th>
                {cat.labels.map((label) => (
                  <th key={label} className="px-2 py-2 text-right font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cat.rows.map((row) => {
                const slug = playerSlugs.get(row.athleteId);
                return (
                <tr key={row.athleteId} className="border-t border-[var(--border)]">
                  <td className="py-2 pl-4 font-medium">
                    {slug ? (
                      <Link href={`/${league}/players/${slug}`} className="hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                  </td>
                  {cat.labels.map((label, i) => (
                    <td key={label} className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {row.stats[i] ?? "-"}
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
