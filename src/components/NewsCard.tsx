import type { NewsArticle } from "@/lib/queries";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NewsCard({ article, compact = false }: { article: NewsArticle; compact?: boolean }) {
  return (
    <a
      href={article.link ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`card group flex gap-3 overflow-hidden ${compact ? "p-2.5" : "p-3"}`}
    >
      {article.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.image_url}
          alt=""
          loading="lazy"
          className={`shrink-0 rounded-md bg-[var(--surface-muted)] object-cover ${compact ? "h-14 w-20" : "h-20 w-28 rounded-lg"}`}
        />
      )}
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <p className={`line-clamp-2 font-semibold leading-snug group-hover:text-[var(--accent)] ${compact ? "text-[13px]" : "text-sm"}`}>
          {article.headline}
        </p>
        <p className="text-xs text-[var(--text-faint)]">{timeAgo(article.published)}</p>
      </div>
    </a>
  );
}
