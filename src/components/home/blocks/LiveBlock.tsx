import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { SeriesMatchList } from "@/components/CricketSeries";
import { TennisMatchLine } from "@/components/TennisScores";
import type { LiveBlockData } from "@/lib/blockTypes";

export function LiveBlock({ data }: { data: LiveBlockData }) {
  if (data.games.length + data.cricket.length + data.tennis.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Nothing in play right now. <Link href="#live" className="font-semibold text-[var(--sig-ink)]">Next fixtures below.</Link></p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {data.games.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.games.map((g) => <GameCard key={`${g.league}-${g.espn_id}`} league={g.league} game={g} />)}
        </div>
      )}
      {data.cricket.length > 0 && <SeriesMatchList matches={data.cricket} showSeries />}
      {data.tennis.length > 0 && (
        <div className="card divide-y divide-[var(--border)] overflow-hidden">
          {data.tennis.map((m) => <TennisMatchLine key={m.espn_id} match={m} showTournament />)}
        </div>
      )}
    </div>
  );
}
