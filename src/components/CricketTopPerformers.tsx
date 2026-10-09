import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { SectionHeader } from "@/components/SectionHeader";
import type { Performer } from "@/lib/cricketPerformers";
import type { League } from "@/lib/leagues";

function Card({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? (
    <Link prefetch={prefetchFor(href)} href={href} className={`${className} card-link`}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/**
 * The match's leading players: one large card in the accent colour for the Player of the Match (or the top
 * scorer), then the innings leaders as small cards. A card links to the player's page when SportsDB has one.
 */
export function CricketTopPerformers({ large, small, league, playerSlugs, teams, largeLabel = "Player of the Match" }: { large: Performer | null; small: Performer[]; league: League; playerSlugs: Map<string, string>; teams: Record<string, string>; largeLabel?: string }) {
  if (!large && small.length === 0) return null;
  const href = (p: Performer) => {
    const slug = playerSlugs.get(p.athleteId);
    return slug ? `/${league}/players/${slug}` : null;
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description="The best batting and bowling of each innings">Top performers</SectionHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {large && (
          <Card href={href(large)} className="flex flex-col gap-1 rounded-2xl bg-[var(--sig)] px-5 py-5 text-[var(--sig-on)] sm:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">{largeLabel}</span>
            <span className="display text-[48px] leading-none tabular-nums sm:text-[56px]">{large.figure}</span>
            <span className="text-[18px] font-extrabold leading-tight">{large.name}</span>
            <span className="text-[13px] opacity-80">{[large.detail, teams[large.teamId]].filter(Boolean).join(" · ")}</span>
          </Card>
        )}
        {small.map((p) => (
          <Card key={`${p.athleteId}-${p.innings}-${p.kind}`} href={href(p)} className="card flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold">{p.name}</span>
              <span className="truncate text-xs text-[var(--text-muted)]">{[p.detail, teams[p.teamId]].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="display shrink-0 text-[28px] leading-none tabular-nums">{p.figure}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}
