import { SectionHeader } from "@/components/SectionHeader";
import { teamDisplayName } from "@/lib/teamName";
import type { TeamXi } from "@/lib/cricketPlayingXi";

// Each side's Playing XI on a cricket match page: the names in roster order, the captain and the
// wicketkeeper marked, the player's usual role when ESPN knows it. Renders nothing without a squad
// (a fixture ESPN has not listed yet, a summary served without rosters).
export function CricketPlayingXi({ sides, collapsed = false, share }: { sides: TeamXi[]; collapsed?: boolean; /** The section's Share menu: beside the note once the card is open (never inside the summary), on the heading otherwise. */ share?: React.ReactNode }) {
  if (sides.length === 0) return null;
  const note = "Captain (c) and wicketkeeper (wk) as listed in the match summary";
  const lists = (
    <div className={collapsed ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 md:grid-cols-2"}>
        {sides.map((side) => (
          <div key={side.teamId || side.team} className="card overflow-hidden">
            <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{teamDisplayName(side.team)}</h3>
            <ol className="divide-y divide-[var(--border)] text-sm">
              {side.players.map((p, i) => (
                <li key={`${p.id}-${i}`} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words font-medium">
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
  );
  // Closed by default beside the match info: the heading stays an h2 inside the summary, the lists stay in the HTML.
  if (collapsed) {
    return (
      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-bold">Playing XI</h2>
          <span className="text-xs font-bold text-[var(--sig-ink)]">Show</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-3 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 pt-2.5 text-xs text-[var(--text-muted)]">{note}</p>
            {share}
          </div>
          {lists}
        </div>
      </details>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader menu={share} description={note}>Playing XI</SectionHeader>
      {lists}
    </section>
  );
}
