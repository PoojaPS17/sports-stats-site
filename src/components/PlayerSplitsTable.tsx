import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import type { League } from "@/lib/queries";
import { formatStat, type PlayerProfile, type Split } from "@/lib/playerProfile";
import { recordText } from "./PlayerStatsShared";

const num = "px-2 py-2 text-right tabular-nums";

type Row = Split & { slug?: string; logo?: string | null };

// One table shape for every split: home/away, by result, by opponent. Columns are the
// sport's headline figures; totals for counting stats, averages where the sport reads
// that way.
export function PlayerSplitsTable({ league, profile, rows, firstColumn, linkTeams = false }: { league: League; profile: PlayerProfile; rows: Row[]; firstColumn: string; linkTeams?: boolean }) {
  const soccer = profile.sport === "soccer";
  const specs = profile.profile.specs.filter((s) => s.headline);
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="table-head">
              <th className="py-2 pl-4 text-left font-semibold">{firstColumn}</th>
              <th className={`${num} font-semibold`}>{profile.profile.gamesLabel}</th>
              <th className={`${num} font-semibold`}>{soccer ? "W-D-L" : "W-L"}</th>
              {specs.map((s) => (
                <th key={s.key} className={`${num} font-semibold`} title={s.title}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="table-row">
                <td className="py-2 pl-4 font-medium">
                  {linkTeams && row.slug ? (
                    <Link href={`/${league}/teams/${row.slug}`} className="flex items-center gap-2 whitespace-nowrap hover:text-[var(--accent)]">
                      <TeamLogo name={row.label} logoUrl={row.logo ?? null} size={18} />
                      <span className="truncate">{row.label}</span>
                    </Link>
                  ) : (
                    row.label
                  )}
                </td>
                <td className={num}>{row.games}</td>
                <td className={`${num} whitespace-nowrap text-[var(--text-muted)]`}>{recordText(row.record, soccer)}</td>
                {specs.map((s) => (
                  <td key={s.key} className={num}>
                    {formatStat(s, row.line[s.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
