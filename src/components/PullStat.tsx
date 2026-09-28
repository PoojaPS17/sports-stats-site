// A number pulled out of an article body: display-face value, small unit, one-line caption, Volt rule.
export function PullStat({ value, unit, caption }: { value: string; unit?: string; caption: string }) {
  return (
    <aside className="my-6 border-l-4 border-[var(--sig)] py-1.5 pl-5">
      <p className="display text-[56px] leading-[0.9] text-[var(--text)] sm:text-[64px]">
        {value}
        {unit && <span className="ml-2 text-[22px] font-bold text-[var(--text-muted)]">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--text-muted)]">{caption}</p>
    </aside>
  );
}
