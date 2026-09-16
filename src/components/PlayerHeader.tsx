import { TeamLogo } from "./TeamLogo";
import { LEAGUE_LABEL, type League } from "@/lib/queries";

export function PlayerHeader({
  league,
  name,
  headshotUrl,
  teamName,
  teamColor,
}: {
  league: League;
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamColor: string | null;
}) {
  const color = teamColor ?? "var(--accent)";
  return (
    <div className="card flex items-center gap-4 overflow-hidden px-6 py-6" style={{ background: `linear-gradient(135deg, ${color}1a, var(--surface))` }}>
      {headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headshotUrl}
          alt={name}
          width={72}
          height={72}
          className="rounded-full border-2 border-[var(--surface)] bg-[var(--surface-muted)] object-cover"
        />
      ) : (
        <TeamLogo name={name} logoUrl={null} color={teamColor} size={72} />
      )}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
        <p className="text-sm font-medium text-[var(--text-muted)]">
          {LEAGUE_LABEL[league]}
          {teamName ? ` · ${teamName}` : ""}
        </p>
      </div>
    </div>
  );
}
