import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { SeriesMatchList } from "@/components/CricketSeries";
import type { CricketSeriesMatch } from "@/lib/cricketSeries";

// The homepage's cricket block: not one competition but the sport's headline
// cricket (internationals, World Cups, the IPL and the other big franchise leagues,
// see cricketFeatured.ts). Matches in play sit in Live now and the biggest fixtures
// in Coming up; this block carries the rest of the week's fixtures.
export interface HomeOtherSeries {
  espn_id: string;
  name: string;
  live: boolean;
}

// `otherSeries`: the domestic, women's and youth series with play in progress, outside headline cricket. They
// are what search sends readers to (Search Console, 2026-10-05), so the homepage names and links them.
export function HomeCricket({ live, next, otherSeries = [] }: { live: number; next: CricketSeriesMatch[]; otherSeries?: HomeOtherSeries[] }) {
  return (
    <section className="sm:col-span-2">
      <SectionHeader
        action={{ label: "All series", href: "/cricket/series" }}
        description={live > 0 ? `${live} match${live === 1 ? "" : "es"} in play, listed under Live now above` : "Internationals, World Cups and the big T20 leagues, men's and women's"}
      >
        Cricket
      </SectionHeader>
      {next.length > 0 ? (
        <>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">More this week</p>
          <SeriesMatchList matches={next} showSeries />
        </>
      ) : (
        <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">{live > 0 ? "Every fixture this week is listed above." : "No fixtures listed for the next week."}</p>
      )}
      {otherSeries.length > 0 && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">Also in progress:</span>{" "}
          {otherSeries.map((s, i) => (
            <span key={s.espn_id}>
              {i > 0 && <span aria-hidden> · </span>}
              <Link href={`/cricket/series/${s.espn_id}`} className="font-semibold text-[var(--accent)] hover:underline">
                {s.name}
              </Link>
              {s.live && <span className="pill pill-live ml-1 align-middle">Live</span>}
            </span>
          ))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/cricket/series" className="text-[var(--accent)] hover:underline">
          All series &amp; tournaments
        </Link>
        <Link href="/ipl" className="text-[var(--accent)] hover:underline">
          IPL
        </Link>
        <Link href="/test" className="text-[var(--accent)] hover:underline">
          Tests
        </Link>
        <Link href="/odi" className="text-[var(--accent)] hover:underline">
          ODIs
        </Link>
        <Link href="/t20i" className="text-[var(--accent)] hover:underline">
          T20Is
        </Link>
        <Link href="/odi/leaders" className="text-[var(--accent)] hover:underline">
          Leaders
        </Link>
      </div>
    </section>
  );
}
