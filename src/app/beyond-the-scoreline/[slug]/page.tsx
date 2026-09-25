import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fitTitle, pageMeta } from "@/lib/metadata";
import { getArticle, listArticles } from "@/lib/beyondTheScoreline";
import { blogPostingSchema } from "@/lib/structuredData";
import { BeyondTheScorelineArticleLayout } from "@/components/BeyondTheScorelineArticleLayout";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 300;

export function generateStaticParams() {
  return listArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) {
    return pageMeta("Beyond the Scoreline", "Original long-form sports writing from the SportsDB desk.", undefined, { noindex: true });
  }
  return pageMeta(fitTitle(article.title), article.dek, `/beyond-the-scoreline/${article.slug}`);
}

export default async function BeyondTheScorelineArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  return (
    <>
      <JsonLd data={blogPostingSchema(article)} />
      <BeyondTheScorelineArticleLayout article={article} />
    </>
  );
}
