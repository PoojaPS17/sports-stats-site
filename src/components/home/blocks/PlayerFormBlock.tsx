import Link from "next/link";
import type { PlayerFormBlockData } from "@/lib/blockTypes";

export function PlayerFormBlock({ data }: { data: PlayerFormBlockData }) {
  const values = data.games.map((g) => g.value ?? 0);
  const max = Math.max(1, ...values);
  const latest = data.games[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-4">
        <div>
          <p className="display text-[44px] leading-none text-[var(--sig-ink)]">{latest?.display || "–"}</p>
          <p className="text-xs text-[var(--text-muted)]">{latest ? `v ${latest.opponent}` : "No recent games"}</p>
        </div>
        <div className="flex h-12 flex-1 items-end gap-1.5" aria-label={`${data.statLabel}, last ${data.games.length} games, newest first`}>
          {[...data.games].reverse().map((g, i, arr) => (
            <Link
              key={g.id}
              href={g.href}
              title={`${g.display} v ${g.opponent}`}
              style={{ height: `${Math.max(8, ((g.value ?? 0) / max) * 100)}%` }}
              className={`flex-1 rounded-sm ${i === arr.length - 1 ? "bg-[var(--sig)]" : "bg-[var(--sig)] opacity-45"}`}
            />
          ))}
        </div>
      </div>
      <Link href={data.player.href} className="text-sm font-semibold text-[var(--sig-ink)]">{data.player.name}&apos;s page →</Link>
    </div>
  );
}
