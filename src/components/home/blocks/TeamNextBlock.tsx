import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { FixtureLine, TeamNextBlockData } from "@/lib/blockTypes";

function Line({ f, team }: { f: FixtureLine; team: string }) {
  const sides = f.home ? `${team} v ${f.opponent}` : `${f.opponent} v ${team}`;
  return (
    <Link href={f.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-[var(--sig-ink)]">
      <span className="flex items-center gap-2 truncate">
        {f.result && <span className={`result-badge result-${f.result.toLowerCase()}`}>{f.result}</span>}
        {f.live && <span className="live-dot" />}
        <span className="truncate font-semibold">{sides}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)]">
        {f.score ?? (f.live ? f.status : <LocalTime iso={f.date} format="datetime" />)}
      </span>
    </Link>
  );
}

export function TeamNextBlock({ data }: { data: TeamNextBlockData }) {
  return (
    <div className="divide-y divide-[var(--border)]">
      {data.last && (
        <div className="pb-1">
          <p className="eyebrow text-[var(--text-faint)]">Last</p>
          <Line f={data.last} team={data.team.name} />
        </div>
      )}
      <div className="pt-1">
        <p className="eyebrow text-[var(--text-faint)]">Next</p>
        {data.next.length === 0 ? <p className="py-2 text-sm text-[var(--text-muted)]">No fixtures listed yet.</p> : data.next.map((f) => <Line key={f.id} f={f} team={data.team.name} />)}
      </div>
      <Link href={data.team.href} className="block pt-2 text-sm font-semibold text-[var(--sig-ink)]">All fixtures →</Link>
    </div>
  );
}
