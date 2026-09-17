import Link from "next/link";
import { matchedTopicHref, type TrendingTopic } from "@/lib/queries";
import { TeamLogo } from "./TeamLogo";

export function TrendingFigures({ topics }: { topics: TrendingTopic[] }) {
  if (topics.length === 0) {
    return (
      <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
        No tracked players or teams are seeing a Wikipedia traffic spike right now.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {topics.map((t) => {
        const href = matchedTopicHref(t);
        return (
          <div key={t.rank} className="card flex items-center gap-3 px-3 py-2.5">
            <TeamLogo name={t.label} logoUrl={t.avatar_url} color={t.avatar_color} size={36} />
            <div className="min-w-0 flex-1">
              {href ? (
                <Link href={href} className="truncate text-sm font-semibold hover:text-[var(--accent)]">
                  {t.label}
                </Link>
              ) : (
                <p className="truncate text-sm font-semibold">{t.label}</p>
              )}
              <p className="text-xs text-[var(--text-muted)]">{t.detail}</p>
            </div>
            <a
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-[var(--text-muted)] underline decoration-dotted hover:text-[var(--accent)]"
            >
              Wikipedia
            </a>
          </div>
        );
      })}
    </div>
  );
}
