import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getPlayerBySlug, getPlayerGameLog, getPlayerSeasonStats } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader } from "@/components/SectionHeader";

export const revalidate = 300;

function StatGroup({ category, values }: { category: string; values: Record<string, string> }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{category}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(values).map(([k, v]) => (
          <span key={k} className="text-sm">
            <span className="font-semibold tabular-nums">{v}</span>{" "}
            <span className="text-xs text-[var(--text-muted)]">{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const player = await getPlayerBySlug(league, slug);
  if (!player) notFound();

  const [gameLog, seasonStats] = await Promise.all([
    getPlayerGameLog(league, player.espn_id),
    getPlayerSeasonStats(league, player.espn_id),
  ]);
  const color = player.team_color ?? "var(--accent)";

  return (
    <div className="flex flex-col gap-6">
      <div
        className="card flex items-center gap-4 overflow-hidden px-6 py-6"
        style={{ background: `linear-gradient(135deg, ${color}1a, var(--surface))` }}
      >
        {player.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot_url}
            alt={player.name}
            width={72}
            height={72}
            className="rounded-full border-2 border-[var(--surface)] bg-[var(--surface-muted)] object-cover"
          />
        ) : (
          <TeamLogo name={player.name} logoUrl={null} color={player.team_color} size={72} />
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{player.name}</h1>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {LEAGUE_LABEL[league]}
            {player.team_name ? ` · ${player.team_name}` : ""}
          </p>
        </div>
      </div>

      <AdSlot label="Player page top" />

      {seasonStats && (
        <section>
          <SectionHeader>{seasonStats.season} Season Stats</SectionHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(seasonStats.categories).map(([category, { labels, values }]) => (
              <StatGroup
                key={category}
                category={category}
                values={Object.fromEntries(labels.map((l, i) => [l, values[i]]))}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader>Game Log</SectionHeader>
        {gameLog.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No stats recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {gameLog.map((row) => (
              <div key={row.game_espn_id} className="card px-4 py-3">
                <Link
                  href={`/${league}/teams/${row.opponent_slug}`}
                  className="mb-2 flex items-center justify-between gap-2 text-sm hover:underline"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <TeamLogo name={row.opponent_name} logoUrl={row.opponent_logo} size={20} />
                    vs {row.opponent_name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </Link>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(row.stats).map(([category, values]) => (
                    <StatGroup key={category} category={category} values={values} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
