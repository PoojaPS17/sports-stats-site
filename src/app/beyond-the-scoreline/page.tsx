import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { listArticles } from "@/lib/beyondTheScoreline";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = pageMeta(
  "Beyond the Scoreline",
  "Original long-form sports writing from the SportsDB desk: history, data and the stories behind the scoreline.",
  "/beyond-the-scoreline"
);

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function BeyondTheScorelineIndexPage() {
  const articles = listArticles();
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Beyond the Scoreline" }]} />
      <PageHeader title="Beyond the Scoreline" subtitle="Original long-form sports writing from the SportsDB desk" />
      {articles.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing published yet. Check back soon.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {articles.map((a) => (
            <li key={a.slug} className="card flex flex-col gap-2 px-5 py-5">
              <Link href={`/beyond-the-scoreline/${a.slug}`} className="text-lg font-bold leading-snug text-[var(--text)] hover:text-[var(--accent)]">
                {a.title}
              </Link>
              <p className="text-sm text-[var(--text-muted)]">{a.dek}</p>
              <p className="text-xs text-[var(--text-faint)]">
                {formatPublished(a.publishedAt)} &middot; {a.readingMinutes} min read
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
