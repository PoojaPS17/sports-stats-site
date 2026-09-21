import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import type { League, StandingRow } from "@/lib/queries";
import { SOCCER_LEAGUES, isCupCompetition } from "@/lib/leagues";
import type { PlayoffResult } from "@/lib/seasonSummary";
import { tableComplete } from "@/lib/standingsOrder";
import { relegationSummary } from "@/lib/standingsZones";

// IPL/NBA/NFL: a chronological list of every playoff-stage result found for the
// season (Qualifier 1/Eliminator/Final for IPL, each series for NBA/NFL).
function PlayoffSummary({ league, results }: { league: League; results: PlayoffResult[] }) {
  if (results.length === 0) return null;
  return (
    <section>
      <SectionHeader>{isCupCompetition(league) ? "Knockout rounds" : "Playoffs"}</SectionHeader>
      <div className="card divide-y divide-[var(--border)]">
        {results.map((r, i) => (
          <div key={`${r.round}-${i}`} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] sm:w-44 sm:shrink-0">{r.round}</span>
            <span className="text-sm">
              <Link href={`/${league}/teams/${r.winnerSlug}`} className="font-semibold hover:underline">
                {r.winnerName}
              </Link>
              {" beat "}
              <Link href={`/${league}/teams/${r.loserSlug}`} className="hover:underline">
                {r.loserName}
              </Link>
              <span className="text-[var(--text-muted)]">, {r.resultText}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// A row of clubs under a label ("Relegated", "Relegation play-off").
function ClubsLine({ league, label, clubs }: { league: League; label: string; clubs: StandingRow[] }) {
  return (
    <p className="text-sm">
      <span className="mr-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {clubs.map((t, i) => (
        <span key={t.team_espn_id}>
          <Link href={`/${league}/teams/${t.slug}`} className="hover:underline">
            {t.name}
          </Link>
          {i < clubs.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}

// League soccer (EPL, La Liga) has no postseason of its own: the meaningful "what happened" facts
// for a season are the table itself: who won the title, and who went down. But that's only true
// once the season has actually finished (tableComplete: every team has played its full double round
// robin); before that "Champion"/"Relegated" would just be describing whoever's leading and
// trailing right now, not what actually happened. How many go down is the league's own rule, from
// the stored ESPN notes where the season has them (the Bundesliga relegates two and its 16th-placed
// club plays a play-off, which is not "Relegated").
function TableHighlights({ league, standings }: { league: League; standings: StandingRow[] }) {
  if (standings.length === 0 || !tableComplete(standings)) return null;

  const champion = standings[0];
  const { relegated, playoff } = relegationSummary(league, standings);
  return (
    <section>
      <SectionHeader>Season Highlights</SectionHeader>
      <div className="card flex flex-col gap-2.5 px-4 py-3">
        <p className="text-sm">
          <span className="mr-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Champion</span>
          <Link href={`/${league}/teams/${champion.slug}`} className="font-semibold hover:underline">
            {champion.name}
          </Link>
        </p>
        <ClubsLine league={league} label="Relegated" clubs={relegated} />
        {playoff.length > 0 && <ClubsLine league={league} label="Relegation play-off" clubs={playoff} />}
      </div>
    </section>
  );
}

export function SeasonSummary({
  league,
  playoffResults,
  standings,
}: {
  league: League;
  playoffResults: PlayoffResult[];
  standings: StandingRow[];
}) {
  // A cup's table decides who progresses, not who wins; the knockout results tell that story.
  if (isCupCompetition(league)) return <PlayoffSummary league={league} results={playoffResults} />;
  if ((SOCCER_LEAGUES as League[]).includes(league)) return <TableHighlights league={league} standings={standings} />;
  return <PlayoffSummary league={league} results={playoffResults} />;
}
