import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/metadata";
import Link from "next/link";
import { isLeague, isCricketLeague, getCricketCenturies, LEAGUE_LABEL } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { ImageActions } from "@/components/ImageActions";
import { CenturiesExportCard } from "@/components/CenturiesExportCard";
import { formatGameDate } from "@/lib/gameDay";

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  if (league === "test") return pageMeta("Test Centuries", "Every Test century since 2015, most recent first, with balls faced, boundaries, opponent and ground.", "/test/centuries");
  return pageMeta(`${label} Centuries`, `Every century scored in the ${label}, most recent first.`, `/${league}/centuries`);
}

// A new century joins this list the moment a match is ingested.
export const revalidate = 300;

export default async function CenturiesPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !isCricketLeague(league)) notFound();

  const centuries = await getCricketCenturies(league);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">{league === "test" ? "Test" : LEAGUE_LABEL[league]} Centuries</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {league === "test"
            ? `All ${centuries.length} Test centuries since the start of 2015, newest first.`
            : `All ${centuries.length} centuries scored in the ${LEAGUE_LABEL[league]}, newest first.`}
        </p>
      </div>

      <AdSlot label={`${LEAGUE_LABEL[league]} centuries top`} />

      {centuries.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No centuries on record yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ImageActions
            filename={`${league}-centuries`}
            shareTitle={`${LEAGUE_LABEL[league]} centuries`}
            width={1120}
            card={
              <CenturiesExportCard
                league={league}
                centuries={centuries}
                title={`${league === "test" ? "Test" : LEAGUE_LABEL[league]} centuries`}
                subtitle={league === "test" ? `All ${centuries.length} Test centuries since the start of 2015, newest first` : `All ${centuries.length} centuries scored in the ${LEAGUE_LABEL[league]}, newest first`}
              />
            }
          />
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="table-head text-left">
                  <th className="py-2 pl-4 font-medium">Player</th>
                  <th className="px-2 py-2 font-medium">Team</th>
                  <th className="px-2 py-2 text-right font-medium">Runs</th>
                  <th className="px-2 py-2 text-right font-medium">Balls</th>
                  <th className="px-2 py-2 text-right font-medium">4s</th>
                  <th className="px-2 py-2 text-right font-medium">6s</th>
                  <th className="px-2 py-2 text-right font-medium">SR</th>
                  <th className="px-2 py-2 font-medium">Opponent</th>
                  <th className="px-2 py-2 font-medium">Venue</th>
                  <th className="py-2 pr-4 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {centuries.map((c, i) => (
                  <tr key={`${c.player_espn_id}-${c.date}-${i}`} className="table-row">
                    <td className="py-2 pl-4">
                      <Link href={`/${league}/players/${c.player_slug}`} className="flex items-center gap-2 font-medium hover:underline">
                        {c.headshot_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.headshot_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <span className="h-6 w-6 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                        )}
                        {c.player_name}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/${league}/teams/${c.team_slug}`} className="flex items-center gap-1.5 text-[var(--text-muted)] hover:underline">
                        <TeamLogo name={teamDisplayName(c.team_name)} logoUrl={c.team_logo} color={c.team_color} size={18} />
                        <span className="hidden sm:inline">{teamDisplayName(c.team_name)}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">
                      {c.runs}
                      {c.not_out ? "*" : ""}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.balls_faced ?? "-"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.fours ?? "-"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.sixes ?? "-"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {c.balls_faced ? ((c.runs / c.balls_faced) * 100).toFixed(1) : "-"}
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/${league}/teams/${c.opponent_slug}`} className="text-[var(--text-muted)] hover:underline">
                        vs {teamDisplayName(c.opponent_name)}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-[var(--text-muted)]">{c.venue ?? "-"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">
                      {formatGameDate(c.date, league, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
