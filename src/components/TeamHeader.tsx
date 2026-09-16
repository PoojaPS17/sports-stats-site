import { TeamLogo } from "./TeamLogo";
import { LEAGUE_LABEL, type League } from "@/lib/queries";

export function TeamHeader({
  league,
  name,
  logoUrl,
  color,
}: {
  league: League;
  name: string;
  logoUrl: string | null;
  color: string | null;
}) {
  const gradientColor = color ?? "var(--accent)";
  return (
    <div
      className="card flex items-center gap-4 overflow-hidden px-6 py-6"
      style={{ background: `linear-gradient(135deg, ${gradientColor}1a, var(--surface))` }}
    >
      <TeamLogo name={name} logoUrl={logoUrl} color={color} size={64} />
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{LEAGUE_LABEL[league]}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
      </div>
    </div>
  );
}
