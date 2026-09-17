import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import { LEAGUE_LABEL, type League } from "@/lib/queries";

export function PlayerHeader({
  league,
  name,
  headshotUrl,
  teamName,
  teamSlug,
  teamColor,
  meta,
}: {
  league: League;
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamSlug?: string | null;
  teamColor: string | null;
  /** Optional short facts shown under the name (position, number, age, ...). */
  meta?: string[];
}) {
  return (
    <div className="card flex items-center gap-4 overflow-hidden px-5 py-5" style={{ borderLeft: `4px solid ${teamColor ?? "var(--accent)"}` }}>
      {headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headshotUrl}
          alt=""
          width={72}
          height={72}
          className="h-[72px] w-[72px] shrink-0 rounded-full bg-[var(--surface-muted)] object-cover"
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
                  {teamName}
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
      </div>
    </div>
  );
}
