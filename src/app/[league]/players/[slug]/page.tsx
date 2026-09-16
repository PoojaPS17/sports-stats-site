import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getPlayerBySlug, getPlayerGameLog } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 300;

function formatStats(stats: Record<string, Record<string, string>>) {
  return Object.entries(stats).map(([category, values]) => (
    <div key={category} className="text-sm">
      <span className="font-medium capitalize">{category}: </span>
      <span className="text-neutral-600 dark:text-neutral-400">
        {Object.entries(values)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}
      </span>
    </div>
  ));
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

  const gameLog = await getPlayerGameLog(league, player.espn_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {player.headshot_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshot_url} alt={player.name} width={56} height={56} className="rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-sm text-neutral-500">
            {LEAGUE_LABEL[league]}
            {player.team_name ? ` · ${player.team_name}` : ""}
          </p>
        </div>
      </div>

      <AdSlot label="Player page top" />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Log</h2>
        {gameLog.length === 0 ? (
          <p className="text-sm text-neutral-500">No stats recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {gameLog.map((row) => (
              <div key={row.game_espn_id} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                  <span>vs {row.opponent_name}</span>
                  <span>{new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                {formatStats(row.stats)}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
