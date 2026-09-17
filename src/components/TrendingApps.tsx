import type { TrendingTopic } from "@/lib/queries";

export function TrendingApps({ topics }: { topics: TrendingTopic[] }) {
  if (topics.length === 0) {
    return (
      <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
        No trending sports apps for this country right now.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => (
        <a
          key={t.rank}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="card flex items-center gap-3 px-3 py-2.5 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-muted)]">
            {t.rank}
          </span>
          {t.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image_url} alt={t.label} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--surface-muted)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t.label}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{t.detail}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
