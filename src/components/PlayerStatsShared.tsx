import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import type { League } from "@/lib/queries";
import type { PlayerLogRow, Record3 } from "@/lib/playerProfile";

export function fmtDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function recordText(r: Record3, soccer: boolean): string {
  return soccer ? `${r.w}-${r.d}-${r.l}` : `${r.w}-${r.l}`;
}

const RESULT_CLASS: Record<string, string> = {
  W: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  D: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
  L: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/** "W 2–1" chip, from the player's side. */
export function ResultChip({ row }: { row: PlayerLogRow }) {
  if (!row.result || row.team_score === null || row.opponent_score === null) return <span className="text-[var(--text-faint)]">–</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${RESULT_CLASS[row.result]}`}>
      <span>{row.result}</span>
      <span>
        {row.team_score}–{row.opponent_score}
      </span>
    </span>
  );
}

/** Opponent with venue marker, linking to the match page. */
export function OpponentCell({ league, row, withDate = false }: { league: League; row: PlayerLogRow; withDate?: boolean }) {
  return (
    <Link href={`/${league}/games/${row.game_espn_id}`} className="flex items-center gap-2 whitespace-nowrap hover:text-[var(--accent)]">
      <span className="w-5 text-[11px] font-semibold uppercase text-[var(--text-faint)]">{row.is_home ? "vs" : "at"}</span>
      <TeamLogo name={teamDisplayName(row.opponent_name)} logoUrl={row.opponent_logo} size={18} />
      <span className="truncate font-medium">{teamDisplayName(row.opponent_name)}</span>
      {withDate && <span className="text-xs text-[var(--text-muted)]">{fmtDate(row.date)}</span>}
    </Link>
  );
}
