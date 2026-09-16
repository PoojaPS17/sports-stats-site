import type { NewsArticle } from "@/lib/queries";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.link ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex gap-3 overflow-hidden p-3 hover:-translate-y-0.5 hover:shadow-lg"
    >
      {article.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.image_url}
          alt=""
          className="h-20 w-28 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">{article.headline}</p>
        <p className="text-xs text-[var(--text-muted)]">{timeAgo(article.published)}</p>
      </div>
    </a>
  );
}
