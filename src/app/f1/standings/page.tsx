import { pageMeta } from "@/lib/metadata";
import Link from "next/link";
import { getF1DriverStandings, getF1ConstructorStandings, getF1Seasons } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { F1SeasonSelect } from "@/components/F1SeasonSelect";
import { TeamLogo } from "@/components/TeamLogo";

export const metadata = pageMeta("F1 Standings", "Formula 1 drivers' and constructors' championship standings.", "/f1/standings");

export const revalidate = 300;

const GROUPS = [
  { key: "drivers", label: "Drivers" },
  { key: "constructors", label: "Constructors" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

export default async function F1StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; group?: string }>;
}) {
  const { season: seasonParam, group: groupParam } = await searchParams;
  const seasons = await getF1Seasons();
  const defaultSeason = seasons[0] ?? new Date().getUTCFullYear();
  const activeSeason = seasonParam && seasons.includes(Number(seasonParam)) ? Number(seasonParam) : defaultSeason;
  const activeGroup: GroupKey = GROUPS.some((g) => g.key === groupParam) ? (groupParam as GroupKey) : "drivers";

  const [drivers, constructors] = await Promise.all([
    activeGroup === "drivers" ? getF1DriverStandings(activeSeason) : Promise.resolve([]),
    activeGroup === "constructors" ? getF1ConstructorStandings(activeSeason) : Promise.resolve([]),
  ]);

  function groupHref(group: GroupKey) {
    const sp = new URLSearchParams();
    if (group !== "drivers") sp.set("group", group);
    if (activeSeason !== defaultSeason) sp.set("season", String(activeSeason));
    const qs = sp.toString();
    return qs ? `/f1/standings?${qs}` : "/f1/standings";
  }

  return (
    <div className="flex flex-col gap-6">

      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">F1 Standings</h1>
        {seasons.length > 1 && <F1SeasonSelect seasons={seasons} defaultSeason={defaultSeason} />}
      </div>

      <AdSlot label="F1 standings top" />

      <div className="flex gap-1.5">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={groupHref(g.key)}
            className={`nav-pill text-sm ${activeGroup === g.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {activeGroup === "drivers" ? (
        drivers.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No {activeSeason} driver standings on record.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="table-head text-left">
                  <th className="py-2 pl-4 font-medium">#</th>
                  <th className="py-2 font-medium">Driver</th>
                  <th className="py-2 font-medium">Team</th>
                  <th className="py-2 text-right font-medium">Wins</th>
                  <th className="py-2 pr-4 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driver_espn_id} className="table-row">
                    <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{d.position ?? "—"}</td>
                    <td className="py-2">
                      <Link href={`/f1/drivers/${d.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                        <TeamLogo name={d.name} logoUrl={d.headshot_url} size={24} />
                        {d.name}
                      </Link>
                    </td>
                    <td className="py-2 text-[var(--text-muted)]">{d.constructor_name ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{d.wins ?? 0}</td>
                    <td className="py-2 pr-4 text-right font-bold tabular-nums">{d.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : constructors.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No {activeSeason} constructor standings on record.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="table-head text-left">
                <th className="py-2 pl-4 font-medium">#</th>
                <th className="py-2 font-medium">Constructor</th>
                <th className="py-2 text-right font-medium">Wins</th>
                <th className="py-2 pr-4 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {constructors.map((c) => (
                <tr key={c.team_espn_id} className="table-row">
                  <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{c.position ?? "—"}</td>
                  <td className="py-2">
                    <Link href={`/f1/teams/${c.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <TeamLogo name={c.name} logoUrl={c.logo_url} color={c.color} size={24} />
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{c.wins ?? 0}</td>
                  <td className="py-2 pr-4 text-right font-bold tabular-nums">{c.points ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
