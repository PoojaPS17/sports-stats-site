import Link from "next/link";
import type { StandingsBlockData } from "@/lib/blockTypes";

export function StandingsBlock({ data }: { data: StandingsBlockData }) {
  return (
    <div>
      {data.preseason && <p className="eyebrow mb-1 text-[var(--text-faint)]">Preseason records, not ranked</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <th className="w-6 py-1 text-left" aria-label="Position" />
            <th className="py-1 text-left font-bold">Team</th>
            <th className="py-1 text-right font-bold">P</th>
            {data.rows.some((r) => r.netRunRate) && <th className="py-1 text-right font-bold">NRR</th>}
            <th className="py-1 text-right font-bold">{data.record ? "W-L" : "Pts"}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.href} className="border-t border-[var(--border)]">
              <td className="py-1.5 pr-1 text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className={`zone-marker ${r.zone ?? ""}`} aria-hidden />
                  {r.position ?? "–"}
                </span>
              </td>
              <td className="py-1.5"><Link href={r.href} className="font-semibold hover:text-[var(--sig-ink)]">{r.name}</Link></td>
              <td className="py-1.5 text-right text-[var(--text-muted)]">{r.played}</td>
              {data.rows.some((x) => x.netRunRate) && <td className="py-1.5 text-right text-[var(--text-muted)]">{r.netRunRate ?? ""}</td>}
              <td className="py-1.5 text-right font-bold">{r.figure}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href={data.href} className="mt-2 block text-sm font-semibold text-[var(--sig-ink)]">Full table →</Link>
    </div>
  );
}
