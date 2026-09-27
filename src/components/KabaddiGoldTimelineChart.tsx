export interface KabaddiEditionResult {
  edition: string;
  men: "gold" | "runner-up" | null;
  women: "gold" | "runner-up" | null;
}

function Dot({ result }: { result: "gold" | "runner-up" | null }) {
  if (!result) return <span className="h-3 w-3 rounded-full" />;
  return (
    <span
      className={`h-3 w-3 rounded-full ${result === "gold" ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
      title={result === "gold" ? "Gold" : "Runner-up"}
    />
  );
}

export function KabaddiGoldTimelineChart({ data }: { data: KabaddiEditionResult[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">India&rsquo;s kabaddi results by Asian Games edition</p>
      <p className="text-[11px] text-[var(--text-faint)]">Women&rsquo;s event began in 2010. Gold in blue, runner-up in grey.</p>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs font-medium text-[var(--text-muted)]">Men</span>
          <div className="flex flex-1 justify-between">
            {data.map((d) => (
              <Dot key={`men-${d.edition}`} result={d.men} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs font-medium text-[var(--text-muted)]">Women</span>
          <div className="flex flex-1 justify-between">
            {data.map((d) => (
              <Dot key={`women-${d.edition}`} result={d.women} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0" />
          <div className="flex flex-1 justify-between">
            {data.map((d) => (
              <span key={`label-${d.edition}`} className="text-[10px] text-[var(--text-faint)]">
                {d.edition}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
