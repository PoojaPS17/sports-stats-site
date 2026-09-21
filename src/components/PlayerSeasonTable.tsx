import Link from "next/link";
import { Fragment } from "react";
import { joinTeams, teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { formatSeasonLabel, type League } from "@/lib/queries";
import { formatStat, gamesHeader, noBoxScoreGames, type PlayerProfile, type SeasonLine } from "@/lib/playerProfile";
import { nbaGamesStartedTitle, noBoxScoreGamesTitle } from "@/lib/playerCopy";
import { careerNoBoxScoreTitle, recordText } from "./PlayerStatsShared";

const num = "px-2 py-2 text-right tabular-nums";

export function PlayerSeasonTable({
  league,
  profile,
  basePath,
  activeSeason,
  careerLabel = "Career on record",
  baseSeason,
}: {
  league: League;
  profile: PlayerProfile;
  basePath: string;
  activeSeason?: number | null;
  /** The label of the totals row: "Career playoffs" and "Career play-in" for the other stages' tables. */
  careerLabel?: string;
  /** The season whose link is the player page itself (the latest). Defaults to this table's first
   * row; the playoffs and play-in tables pass the regular season's, since their first row can be an older year. */
  baseSeason?: number | null;
}) {
  const soccer = profile.sport === "soccer";
  const specs = profile.profile.specs.filter((s) => s.table !== false);
  const games = gamesHeader(profile);
  // An NFL table whose header says GP but that has a season with no ESPN figure marks that season's number. (An
  // NBA season is only ever ESPN's figure when it has games with no box score, so it takes the † instead.)
  const mixed = profile.sport === "nfl" && profile.gamesFromEspn && profile.seasons.some((s) => s.gamesSource === "logged");
  const careerNoBoxScore = careerNoBoxScoreTitle(profile);
  // GS is a count, not an average: in a table with a † season it says whose count it is.
  const gsTitle = careerNoBoxScore ? nbaGamesStartedTitle(profile.seasons.some((s) => s.lineSource === "espn")) : undefined;
  const gamesCell = (row: SeasonLine) => {
    const noBoxScore = noBoxScoreGames(profile.sport, row.games, row.recorded);
    if (noBoxScore > 0)
      return (
        <td className={num} title={noBoxScoreGamesTitle(noBoxScore, row.gamesSource)}>
          {row.games}†
        </td>
      );
    if (mixed && row.gamesSource === "logged")
      return (
        <td className={num} title="Games with a recorded stat line; ESPN's figure is not stored for this season.">
          {row.games}*
        </td>
      );
    return <td className={num}>{row.games}</td>;
  };
  const latest = baseSeason === undefined ? (profile.seasons[0]?.season ?? null) : baseSeason;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="table-head">
              <th className="py-2 pl-4 text-left font-semibold">Season</th>
              <th className="py-2 pl-2 text-left font-semibold">Team</th>
              <th className={`${num} font-semibold`} title={games.title}>
                {games.label}
              </th>
              <th className={`${num} font-semibold`}>{soccer ? "W-D-L" : "W-L"}</th>
              {specs.map((s) => (
                <th key={s.key} className={`${num} font-semibold`} title={s.key === "gs" && gsTitle ? gsTitle : s.title}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.seasons.map((row) => (
              <tr key={row.season} className={`table-row ${row.season === activeSeason ? "bg-[var(--accent-soft)]" : ""}`}>
                <td className="py-2 pl-4 font-medium">
                  <Link href={row.season === latest ? basePath : `${basePath}/${row.season}`} className="hover:text-[var(--accent)]">
                    {formatSeasonLabel(league, row.season)}
                  </Link>
                </td>
                <td className="py-2 pl-2" title={row.teams.length > 1 ? joinTeams(row.teams) : undefined}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {/* A traded player has several teams: chronological, with a slash between them so the names never run together. */}
                    {row.teams.map((t, i) => (
                      <Fragment key={t.espn_id}>
                        {i > 0 && (
                          <span aria-hidden className="hidden text-[var(--text-faint)] sm:inline">
                            /
                          </span>
                        )}
                        <Link href={`/${league}/teams/${t.slug}`} className="inline-flex items-center gap-1 hover:text-[var(--accent)]" title={t.name}>
                          <TeamLogo name={teamDisplayName(t.name)} logoUrl={t.logo} size={16} />
                          <span className="hidden sm:inline">{t.name}</span>
                        </Link>
                      </Fragment>
                    ))}
                  </span>
                </td>
                {gamesCell(row)}
                <td className={`${num} whitespace-nowrap text-[var(--text-muted)]`}>{recordText(row.record, soccer)}</td>
                {specs.map((s) => (
                  <td key={s.key} className={num}>
                    {formatStat(s, row.line[s.key])}
                  </td>
                ))}
              </tr>
            ))}
            {profile.seasons.length > 1 && (
              <tr className="table-row font-semibold">
                <td className="py-2 pl-4" colSpan={2}>
                  {careerLabel}
                </td>
                {careerNoBoxScore ? (
                  <td className={num} title={careerNoBoxScore}>
                    {profile.games}†
                  </td>
                ) : (
                  <td className={num}>{profile.games}</td>
                )}
                <td className={`${num} whitespace-nowrap text-[var(--text-muted)]`}>{recordText(profile.record, soccer)}</td>
                {specs.map((s) => (
                  <td key={s.key} className={num}>
                    {formatStat(s, profile.career[s.key])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {mixed && <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-faint)]">* Games with a recorded stat line; ESPN&apos;s figure is not stored for this season.</p>}
    </div>
  );
}
