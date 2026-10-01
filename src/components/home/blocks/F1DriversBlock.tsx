import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { F1DriversBlockData } from "@/lib/blockTypes";

export function F1DriversBlock({ data }: { data: F1DriversBlockData }) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-[var(--border)] text-sm">
        {data.rows.map((r) => (
          <li key={r.href} className="flex items-center gap-3 py-1.5">
            <span className="w-4 text-[var(--text-muted)]">{r.position ?? "–"}</span>
            <Link href={r.href} className="flex-1 truncate font-semibold hover:text-[var(--sig-ink)]">{r.name}</Link>
            <span className="truncate text-[var(--text-muted)]">{r.constructor ?? ""}</span>
            <span className="w-10 text-right font-bold">{r.points ?? 0}</span>
          </li>
        ))}
      </ol>
      {data.nextRace && (
        <Link href={data.nextRace.href} className="flex items-center justify-between rounded-lg bg-[var(--sig-soft)] px-3 py-2 text-sm">
          <span className="font-semibold text-[var(--sig-ink)]">{data.nextRace.name}</span>
          <LocalTime iso={data.nextRace.raceIso} format="datetime" serverTimeZone={data.nextRace.circuitTimeZone} className="text-[var(--text-muted)]" />
        </Link>
      )}
    </div>
  );
}
