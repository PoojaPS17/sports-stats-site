import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getNews } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { NewsCard } from "@/components/NewsCard";
import { PageHeader } from "@/components/PageHeader";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} News`, `The latest ${label} headlines, updated throughout the day.`);
}

export default async function NewsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const news = await getNews(league, 20);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} News`} subtitle="Headlines from around the league. Links open the original story." />
      <AdSlot label={`${LEAGUE_LABEL[league]} news top`} />
      {news.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No articles yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {news.map((a) => (
            <NewsCard key={a.article_id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
