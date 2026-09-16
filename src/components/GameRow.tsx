import Link from "next/link";
import type { GameRow as GameRowType, League } from "@/lib/queries";

function formatKickoff(dateISO: string) {
  return new Date(dateISO).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GameRow({ league, game }: { league: League; game: GameRowType }) {
  const isLive = game.status_state === "in";
  const isPost = game.status_state === "post";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 py-3 last:border-0 dark:border-neutral-800">
      <div className="flex flex-1 flex-col gap-1">
        <Link href={`/${league}/teams/${game.away_slug}`} className="flex items-center gap-2 hover:underline">
          <span className="font-medium">{game.away_name}</span>
          {isPost && <span className="tabular-nums text-neutral-500">{game.away_score}</span>}
        </Link>
        <Link href={`/${league}/teams/${game.home_slug}`} className="flex items-center gap-2 hover:underline">
          <span className="font-medium">{game.home_name}</span>
          {isPost && <span className="tabular-nums text-neutral-500">{game.home_score}</span>}
        </Link>
      </div>
      <div className="text-right text-xs text-neutral-500">
        {isLive && <span className="font-semibold text-red-600">LIVE · {game.status_detail}</span>}
        {isPost && <span>Final</span>}
        {!isLive && !isPost && <span>{formatKickoff(game.date)}</span>}
      </div>
    </div>
  );
}
