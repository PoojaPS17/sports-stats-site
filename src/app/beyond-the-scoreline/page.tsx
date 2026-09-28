import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { listArticles } from "@/lib/beyondTheScoreline";
import { articleArt } from "@/lib/articleArt";
import { topicsFor } from "@/lib/articleTopics";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StoryCard } from "@/components/StoryCard";
import { ArticleTopicFilter } from "@/components/ArticleTopicFilter";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = pageMeta(
  "Beyond the Scoreline",
  "Original long-form sports writing from the SportsDB desk: history, data and the stories behind the scoreline.",
  "/beyond-the-scoreline"
);

export default function BeyondTheScorelineIndexPage() {
  const articles = listArticles();
  const [lead, ...rest] = articles;
  const topics = topicsFor(articles);
  return (
    <div className="flex flex-col gap-8">
      <section className="band bleed -mt-6 py-9 sm:py-11">
        <Breadcrumbs items={[{ label: "Beyond the Scoreline" }]} tone="band" />
        <p className="eyebrow mt-5">Original writing · SportsDB desk</p>
        <h1 className="display mt-2 text-[48px] sm:text-[72px] lg:text-[92px]">Beyond the Scoreline</h1>
        <p className="mt-3 max-w-[58ch] text-[16px] text-[var(--mast-muted)]">
          History, data and the stories the final score doesn&rsquo;t tell. Every piece is built on the same records that power the rest of the site.
        </p>
        {topics.length > 1 && <ArticleTopicFilter topics={topics} />}
      </section>

      {articles.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing published yet. Check back soon.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3" data-topic-card={articleArt(lead).palette}>
              <StoryCard article={lead} variant="lead" />
            </div>
            <aside className="lg:col-span-2">
              <h2 className="display text-[22px]">Most recent</h2>
              <ol className="mt-2 divide-y divide-[var(--border)]">
                {rest.slice(0, 5).map((a, i) => (
                  <li key={a.slug} className="py-3">
                    <Link href={`/beyond-the-scoreline/${a.slug}`} className="flex items-baseline gap-3">
                      <span className="display w-7 shrink-0 text-[26px] text-[var(--sig-ink)]">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-bold leading-snug hover:text-[var(--sig-ink)]">{a.title}</span>
                        <span className="text-xs text-[var(--text-faint)]">
                          {articleArt(a).sport} · {a.readingMinutes} min
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--sig)_40%,transparent)] bg-[var(--sig-soft)] p-4">
                <p className="display text-[22px] text-[var(--text)]">New every day</p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">The desk publishes one piece a day, built from the day&rsquo;s results.</p>
                <a href="https://x.com/sportsdblive" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg bg-[var(--mast)] px-3.5 py-2 text-[13px] font-bold text-[var(--mast-text)]">
                  Follow @sportsdblive
                </a>
              </div>
            </aside>
          </div>

          {rest.length > 0 && (
            <section>
              <SectionHeader>Latest</SectionHeader>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <li key={a.slug} data-topic-card={articleArt(a).palette}>
                    <StoryCard article={a} variant="grid" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
