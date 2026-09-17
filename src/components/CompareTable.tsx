import type { MetricGroup } from "@/lib/compare";

// Two-column comparison with a proportional bar per metric. The better value is
// bolded and colored; "better" respects lowerIsBetter (goals conceded, turnovers).
export function CompareTable({
  groups,
  colorA,
  colorB,
  nameA,
  nameB,
}: {
  groups: MetricGroup[];
  colorA: string | null;
  colorB: string | null;
  nameA: string;
  nameB: string;
}) {
  const ca = colorA ?? "var(--accent)";
  const cb = colorB ?? "var(--accent-2)";
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.title} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{g.title}</h2>
            <span className="hidden text-[11px] font-semibold text-[var(--text-faint)] sm:flex sm:gap-6">
              <span>{nameA}</span>
              <span>{nameB}</span>
            </span>
          </div>
          {g.note && <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-faint)]">{g.note}</p>}
          <ul className="divide-y divide-[var(--border)]">
            {g.metrics.map((m) => {
              const both = m.a != null && m.b != null;
              const aBetter = both && m.a !== m.b && (m.lowerIsBetter ? m.a! < m.b! : m.a! > m.b!);
              const bBetter = both && m.a !== m.b && !aBetter;
              const total = both ? Math.abs(m.a!) + Math.abs(m.b!) : 0;
              const pctA = total > 0 ? (Math.abs(m.a!) / total) * 100 : 50;
              return (
                <li key={m.label} className="px-4 py-2.5">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                    <span className={`tabular-nums ${aBetter ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{m.aText}</span>
                    <span className="text-center text-xs text-[var(--text-muted)]">{m.label}</span>
                    <span className={`text-right tabular-nums ${bBetter ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{m.bText}</span>
                  </div>
                  {!m.noBar && both && total > 0 && (
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-hidden="true">
                      <span className="h-full" style={{ width: `${pctA}%`, background: ca, opacity: aBetter || !bBetter ? 1 : 0.45 }} />
                      <span className="h-full flex-1" style={{ background: cb, opacity: bBetter || !aBetter ? 1 : 0.45 }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
