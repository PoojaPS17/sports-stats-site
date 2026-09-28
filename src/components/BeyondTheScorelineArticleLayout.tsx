import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import { ShareButton } from "./ShareButton";
import { articleArt } from "@/lib/articleArt";
import { listArticles, type BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

const DESK_BYLINE = "Beyond the Scoreline Desk";

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function BeyondTheScorelineArticleLayout({ article }: { article: BeyondTheScorelineArticle }) {
  const art = articleArt(article);
  return (
    <div className="flex flex-col">
      <header className="band bleed -mt-6 py-9 sm:py-11">
        <div className="mx-auto max-w-4xl">
          <Breadcrumbs items={[{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }, { label: article.title }]} tone="band" />
          <p className="eyebrow mt-5">Beyond the Scoreline · {art.sport}</p>
          <h1 className="display mt-2 max-w-[18ch] text-[40px] sm:text-[56px] lg:text-[72px]">{article.title}</h1>
          <p className="mt-4 max-w-[58ch] text-[19px] leading-[1.45] text-[var(--mast-muted)]">{article.dek}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px] text-[var(--mast-muted)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sig)] text-[11px] font-extrabold text-[var(--sig-on)]" aria-hidden>
              BS
            </span>
            <span>
              <span className="font-bold text-[var(--mast-text)]">{DESK_BYLINE}</span> · {formatPublished(article.publishedAt)} · {article.readingMinutes} min read
            </span>
            <span className="ml-auto">
              <ShareButton path={`/beyond-the-scoreline/${article.slug}`} title={article.title} text={article.dek} tone="band" />
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_200px]">
        <article className="prose-bts max-w-[64ch] text-[17px] leading-[1.65] text-[var(--text)] [&_a]:text-[var(--sig-ink)] [&_a]:underline [&_strong]:font-semibold">
          {article.body()}
          {article.dataAttribution && <p className="mt-8 text-xs text-[var(--text-faint)]">{article.dataAttribution}</p>}
        </article>

        <aside className="text-[13px] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
          <h2 className="eyebrow text-[var(--text-faint)]">Related on SportsDB</h2>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {article.relatedLinks.map((link) => (
              <li key={link.href} className="py-2.5">
                <Link href={link.href} className="block font-bold text-[var(--sig-ink)] hover:underline">
                  {link.label}
                </Link>
                {link.description && <p className="text-xs text-[var(--text-faint)]">{link.description}</p>}
              </li>
            ))}
          </ul>
          <h2 className="eyebrow mt-6 text-[var(--text-faint)]">More from the desk</h2>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {listArticles()
              .filter((a) => a.slug !== article.slug)
              .slice(0, 3)
              .map((a) => (
                <li key={a.slug} className="py-2.5">
                  <Link href={`/beyond-the-scoreline/${a.slug}`} className="block font-bold hover:text-[var(--sig-ink)]">
                    {a.title}
                  </Link>
                  <p className="text-xs text-[var(--text-faint)]">
                    {articleArt(a).sport} · {a.readingMinutes} min
                  </p>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
