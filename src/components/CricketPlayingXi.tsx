import { SectionHeader } from "@/components/SectionHeader";
import { teamDisplayName } from "@/lib/teamName";
import type { TeamXi } from "@/lib/cricketPlayingXi";

// Each side's Playing XI on a cricket match page: the names in roster order, the captain and the
// wicketkeeper marked, the player's usual role when ESPN knows it. Renders nothing without a squad
// (a fixture ESPN has not listed yet, a summary served without rosters).
export function CricketPlayingXi({ sides }: { sides: TeamXi[] }) {
  if (sides.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description="Captain (c) and wicketkeeper (wk) as listed in the match summary">Playing XI</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sides.map((side) => (
          <div key={side.teamId || side.team} className="card overflow-hidden">
            <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{teamDisplayName(side.team)}</h3>
            <ol className="divide-y divide-[var(--border)] text-sm">
              {side.players.map((p, i) => (
                <li key={`${p.id}-${i}`} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                    {(p.captain || p.keeper) && <span className="ml-1 text-xs font-semibold text-[var(--text-muted)]">{p.captain && p.keeper ? "(c & wk)" : p.captain ? "(c)" : "(wk)"}</span>}
                  </span>
                  {p.role && <span className="shrink-0 text-xs text-[var(--text-faint)]">{p.role}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
