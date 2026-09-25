import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

export function ArticleTeaserCard({ article }: { article: BeyondTheScorelineArticle }) {
  return (
    <Link href={`/beyond-the-scoreline/${article.slug}`} className="card group flex flex-col gap-1 p-3">
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-[var(--accent)]">{article.title}</p>
      <p className="text-xs text-[var(--text-faint)]">{article.readingMinutes} min read</p>
    </Link>
  );
}
