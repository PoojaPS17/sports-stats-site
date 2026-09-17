import Link from "next/link";
import { matchedTopicHref, type TrendingTopic } from "@/lib/queries";

export function TrendingSearches({ topics }: { topics: TrendingTopic[] }) {
  if (topics.length === 0) {
    return (
      <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
        Nothing sports-related is in today&apos;s top 10 searches for this country — Google&apos;s daily trends list
        covers every topic, not just sports, so this is often empty.
      </p>
    );
  }

  return (
    <div className="card divide-y divide-[var(--border)]">
      {topics.map((t) => {
        const href = matchedTopicHref(t);
        return (
          <div key={t.rank} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-muted)]">
              {t.rank}
            </span>
            <div className="min-w-0 flex-1">
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[var(--accent)]">
                {t.label}
              </a>
              {t.detail && <p className="text-xs text-[var(--text-muted)]">{t.detail}</p>}
            </div>
            {href && (
              <Link
                href={href}
                className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                View on ScoreDB
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
