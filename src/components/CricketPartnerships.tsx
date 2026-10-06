import { SectionHeader } from "@/components/SectionHeader";
import type { StoryInnings } from "@/lib/cricketBalls";

const ORDINAL = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/**
 * Each innings' stands as bars, one column per innings: the wicket they were for, the pair, the runs and
 * balls, the bar scaled to the match's biggest stand in the batting side's colour; the pair still in when
 * the innings ended is marked unbroken.
 */
export function CricketPartnerships({ innings, colours }: { innings: StoryInnings[]; colours: Record<string, string> }) {
  const withStands = innings.filter((i) => i.partnerships.length > 0);
  if (withStands.length === 0) return null;
  const max = Math.max(1, ...withStands.flatMap((i) => i.partnerships.map((p) => p.runs)));
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description="Runs added for each wicket, scaled to the biggest stand of the match">Partnerships</SectionHeader>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {withStands.map((inn) => (
          <div key={inn.period} className="card px-4 py-3">
            <h3 className="eyebrow mb-2.5 text-[var(--text-muted)]">{inn.team}</h3>
            <ol className="flex flex-col gap-2 text-sm">
              {inn.partnerships.map((p) => (
                <li key={p.wicket} className="grid grid-cols-[2.4rem_minmax(0,1fr)_4rem] items-center gap-2">
                  <span className="text-xs tabular-nums text-[var(--text-faint)]">{ORDINAL(p.wicket)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {p.batters[0]} & {p.batters[1]}
                    </span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <span className="block h-2 rounded-full" style={{ width: `${Math.max(2, Math.round((p.runs / max) * 100))}%`, backgroundColor: colours[inn.teamId] ?? "var(--sig)" }} />
                    </span>
                  </span>
                  <span className="text-right text-[14px] font-bold tabular-nums">
                    {p.runs}
                    {p.unbroken ? "*" : ""}
                    <span className="block text-[11px] font-normal text-[var(--text-faint)]">
                      {p.balls}b{p.unbroken ? " · unbroken" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
