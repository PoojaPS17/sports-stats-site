import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import { ShareButton } from "./ShareButton";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

const DESK_BYLINE = "Beyond the Scoreline Desk";

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function BeyondTheScorelineArticleLayout({ article }: { article: BeyondTheScorelineArticle }) {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }, { label: article.title }]} />
      <article className="card mx-auto max-w-3xl px-6 py-8 sm:px-10">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Beyond the Scoreline</p>
          <ShareButton path={`/beyond-the-scoreline/${article.slug}`} title={article.title} text={article.dek} />
        </div>
        <h1 className="page-title mt-2">{article.title}</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-muted)]">{article.dek}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border)] pb-5 text-xs text-[var(--text-faint)]">
          <span className="font-semibold text-[var(--text-muted)]">{DESK_BYLINE}</span>
          <span aria-hidden>&middot;</span>
          <span>{formatPublished(article.publishedAt)}</span>
          <span aria-hidden>&middot;</span>
          <span>{article.readingMinutes} min read</span>
        </div>

        <div className="mt-6 flex max-w-[62ch] flex-col gap-4 text-[15px] leading-relaxed text-[var(--text)] [&_a]:text-[var(--accent)] [&_a]:underline [&_strong]:font-semibold">
          {article.body()}
        </div>

        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">Related on SportsDB</p>
          <ul className="mt-3 flex flex-col gap-2">
            {article.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm font-semibold text-[var(--accent)] hover:underline">
                  {link.label}
                </Link>
                {link.description && <p className="text-xs text-[var(--text-faint)]">{link.description}</p>}
              </li>
            ))}
          </ul>
        </div>

        {article.dataAttribution && <p className="mt-6 text-xs text-[var(--text-faint)]">{article.dataAttribution}</p>}
      </article>
    </div>
  );
}
