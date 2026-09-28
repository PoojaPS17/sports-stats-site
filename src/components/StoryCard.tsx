import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { articleArt } from "@/lib/articleArt";

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// One article as a card: its generated art on top (or on the left, as a row), then sport, title,
// dek and the meta line. "lead" is the index's top story, "grid" the index cards and homepage
// stack, "row" a slim art-left card for narrow columns.
export function StoryCard({ article, variant }: { article: BeyondTheScorelineArticle; variant: "lead" | "grid" | "row" }) {
  const art = articleArt(article);
  const row = variant === "row";
  const lead = variant === "lead";
  // The number scales with the panel (cqw = 1% of the panel width) so a two-character figure and
  // "114/115" both fill it, and neither spills out of the narrow row panel.
  const numberSize = row ? "text-[clamp(20px,30cqw,40px)]" : lead ? "text-[clamp(48px,26cqw,112px)]" : "text-[clamp(40px,22cqw,72px)]";
  const Title = lead ? "h2" : "h3";
  return (
    <Link href={`/beyond-the-scoreline/${article.slug}`} className={`card group flex overflow-hidden ${row ? "flex-row" : "flex-col"}`}>
      <span
        className={`art art-${art.palette} flex shrink-0 items-end p-4 ${row ? "w-28 self-stretch" : lead ? "aspect-[16/9]" : "aspect-[16/8]"}`}
        aria-hidden
      >
        <span className="relative">
          <span className={`display block break-words leading-[0.85] ${numberSize}`}>{art.number}</span>
          {!row && <span className="mt-2 block max-w-[30ch] text-xs font-semibold opacity-85">{art.caption}</span>}
        </span>
      </span>
      <span className={`flex min-w-0 flex-col gap-1.5 ${row ? "p-3" : "p-4"}`}>
        <span className="eyebrow text-[var(--sig-ink)]">{art.sport}</span>
        <Title className={`display text-[var(--text)] group-hover:text-[var(--sig-ink)] ${row ? "text-[20px]" : lead ? "text-[34px]" : "text-[24px]"}`}>{article.title}</Title>
        {!row && <span className="text-sm text-[var(--text-muted)]">{article.dek}</span>}
        <span className="mt-0.5 text-xs font-semibold text-[var(--text-faint)]">
          {formatPublished(article.publishedAt)} · {article.readingMinutes} min read
        </span>
      </span>
    </Link>
  );
}
