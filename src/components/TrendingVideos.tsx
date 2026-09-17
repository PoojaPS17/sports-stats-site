import type { TrendingTopic } from "@/lib/queries";

export function TrendingVideos({ topics }: { topics: TrendingTopic[] }) {
  if (topics.length === 0) {
    return (
      <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
        No trending sports videos for this country right now.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => (
        <a
          key={t.rank}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="card flex flex-col gap-2 overflow-hidden p-2 transition hover:border-[var(--accent)]"
        >
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-[var(--surface-muted)]">
            {t.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.image_url} alt={t.label} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="px-1 pb-1">
            <p className="line-clamp-2 text-sm font-medium">{t.label}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.detail}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
