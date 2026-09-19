import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { FollowButton } from "./FollowButton";
import { ShareButton } from "./ShareButton";
import { DownloadCard } from "./DownloadCard";
import { PlayerExportCard } from "./PlayerExportCard";
import { LEAGUE_LABEL, type League } from "@/lib/queries";

export function PlayerHeader({
  league,
  slug,
  name,
  headshotUrl,
  teamName,
  teamSlug,
  teamColor,
  meta,
  photoCredit,
  stats = [],
}: {
  league: League;
  /** The player page's own slug, for the follow/share links. */
  slug: string;
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamSlug?: string | null;
  teamColor: string | null;
  /** Optional short facts shown under the name (position, number, age, ...). */
  meta?: string[];
  /** Attribution for a Wikimedia Commons photo (ESPN had no headshot); shown under the facts. */
  photoCredit?: { credit: string; license: string; sourceUrl: string } | null;
  /** Career headline numbers (PPG/RPG/APG, ...), baked into the downloadable card. */
  stats?: { label: string; value: string }[];
}) {
  const path = `/${league}/players/${slug}`;
  return (
    <div className="card flex items-start justify-between gap-4 overflow-hidden px-5 py-5" style={{ borderLeft: `4px solid ${teamColor ?? "var(--accent)"}` }}>
      <div className="flex min-w-0 items-center gap-4">
        {headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshotUrl}
            alt=""
            width={72}
            height={72}
            // Commons photos are portraits, not face crops: keep the head in the circle.
            className={`h-[72px] w-[72px] shrink-0 rounded-full bg-[var(--surface-muted)] object-cover ${photoCredit ? "object-[50%_18%]" : ""}`}
          />
        ) : (
          <TeamLogo name={name} logoUrl={null} color={teamColor} size={72} />
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Link href={`/${league}`} className="hover:text-[var(--accent)]">
              {LEAGUE_LABEL[league]}
            </Link>
            {teamName && (
              <>
                <span className="mx-1.5 text-[var(--text-faint)]">·</span>
                {teamSlug ? (
                  <Link href={`/${league}/teams/${teamSlug}`} className="hover:text-[var(--accent)]">
                    {teamDisplayName(teamName)}
                  </Link>
                ) : (
                  teamName
                )}
              </>
            )}
          </p>
          <h1 className="page-title truncate">{name}</h1>
          {meta && meta.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[var(--text-muted)]">
              {meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          )}
          {headshotUrl && photoCredit && (
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              Photo:{" "}
              <a href={photoCredit.sourceUrl} rel="noopener nofollow" className="hover:text-[var(--accent)]">
                {photoCredit.credit}, {photoCredit.license}, via Wikimedia Commons
              </a>
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2" data-capture-exclude="true">
        <FollowButton compact item={{ kind: "player", league, refId: slug, label: name, sublabel: LEAGUE_LABEL[league], href: path }} />
        <ShareButton compact path={path} title={`${name} — ${LEAGUE_LABEL[league]}`} />
        <DownloadCard
          compact
          filename={`${slug}-${league}`}
          card={<PlayerExportCard league={league} name={name} headshotUrl={headshotUrl} teamName={teamName} teamColor={teamColor} meta={meta ?? []} stats={stats} />}
        />
      </div>
    </div>
  );
}
