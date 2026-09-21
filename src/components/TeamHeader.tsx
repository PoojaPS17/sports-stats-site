import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { FollowButton } from "./FollowButton";
import { LEAGUE_LABEL, type League } from "@/lib/queries";

export function TeamHeader({
  league,
  slug,
  name,
  logoUrl,
  color,
  meta,
}: {
  league: League;
  /** The team page's own slug, for the follow/share links. */
  slug: string;
  name: string;
  logoUrl: string | null;
  color: string | null;
  /** Optional short facts shown under the name (venue, record, ...). */
  meta?: string[];
}) {
  const path = `/${league}/teams/${slug}`;
  return (
    <div className="card flex flex-col gap-4 overflow-hidden px-5 py-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderLeft: `4px solid ${color ?? "var(--accent)"}` }}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)]">
          <TeamLogo name={name} logoUrl={logoUrl} color={color} size={48} priority />
        </div>
        <div className="min-w-0">
          <Link href={`/${league}`} className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]">
            {LEAGUE_LABEL[league]}
          </Link>
          <h1 className="page-title truncate">{teamDisplayName(name)}</h1>
          {meta && meta.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[var(--text-muted)]">
              {meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <FollowButton item={{ kind: "team", league, refId: slug, label: teamDisplayName(name), sublabel: LEAGUE_LABEL[league], href: path }} />
      </div>
    </div>
  );
}
