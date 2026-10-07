import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { SeriesMatchRow } from "@/components/CricketSeries";
import type { CricketSeriesMatch } from "@/lib/cricketSeriesTypes";

/** The series' next fixture after this match and the series page, side by side; nothing when the series has no later fixture. */
export function CricketNextMatch({ next, series, seriesNote }: { next: CricketSeriesMatch | null; series: { name: string; href: string }; seriesNote: string | null }) {
  if (!next) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Next in this series</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card overflow-hidden">
          <SeriesMatchRow m={next} />
        </div>
        <Link href={series.href} className="card card-link flex flex-col justify-center gap-1 px-4 py-3">
          <span className="eyebrow text-[var(--text-muted)]">Series</span>
          <span className="text-[15px] font-bold">{series.name}</span>
          <span className="text-xs text-[var(--text-muted)]">{seriesNote ?? "Fixtures, results and the table"}</span>
        </Link>
      </div>
    </section>
  );
}
