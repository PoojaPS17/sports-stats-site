import Link from "next/link";
import type { BtsBlockData } from "@/lib/blockTypes";

export function BtsBlock({ data }: { data: BtsBlockData }) {
  return (
    <div className="flex flex-col gap-2">
      {data.articles.map((a) => (
        <Link key={a.slug} href={a.href} className="group flex items-center gap-3 rounded-lg border border-[var(--border)] p-2 hover:border-[var(--sig-ink)]">
          <span className={`art art-${a.palette} flex h-14 w-16 shrink-0 items-center justify-center rounded-md`} aria-hidden>
            <span className="display relative text-[22px] leading-none">{a.number}</span>
          </span>
          <span className="min-w-0">
            <span className="eyebrow block text-[var(--sig-ink)]">{a.sport}</span>
            <span className="display block truncate text-[18px] text-[var(--text)] group-hover:text-[var(--sig-ink)]">{a.title}</span>
          </span>
        </Link>
      ))}
      <Link href="/beyond-the-scoreline" className="text-sm font-semibold text-[var(--sig-ink)]">All articles →</Link>
    </div>
  );
}
