"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FOLLOWS_EVENT, getFollows, removeFollow, type FollowItem } from "@/lib/follow";
import { isLeague } from "@/lib/leagues";
import type { GameRow } from "@/lib/queries";
import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";

const KIND_LABEL: Record<FollowItem["kind"], string> = {
  game: "Match",
  player: "Player",
  team: "Team",
  series: "Series",
  tournament: "Tournament",
};

function UnfollowBadge({ item }: { item: FollowItem }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // The card underneath is a Link covering the whole area.
        e.preventDefault();
        e.stopPropagation();
        removeFollow(item.kind, item.league, item.refId);
      }}
      aria-label={`Unfollow ${item.label}`}
      title="Unfollow"
      className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] shadow-[var(--shadow-pop)] transition hover:text-[var(--text)]"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function FollowRow({ item }: { item: FollowItem }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <Link href={item.href} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)]">{item.label}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {KIND_LABEL[item.kind]}
          {item.sublabel ? ` · ${item.sublabel}` : ""}
        </p>
      </Link>
      <button
        type="button"
        onClick={() => removeFollow(item.kind, item.league, item.refId)}
        aria-label={`Unfollow ${item.label}`}
        title="Unfollow"
        className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}

// The homepage's personal feed: whatever matches, players, teams, series and
// tournaments this visitor has tapped "+ Follow" on (see FollowButton), most recently
// followed first. Follows live in localStorage (lib/follow.ts) - there's no login on
// the site, so this is per-browser rather than per-account.
export function MyFollows() {
  const [items, setItems] = useState<FollowItem[]>([]);
  const [liveGames, setLiveGames] = useState<Record<string, GameRow>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      setItems(getFollows());
      setLoaded(true);
    };
    load();
    window.addEventListener(FOLLOWS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(FOLLOWS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const gameFollows = items.filter((i) => i.kind === "game" && isLeague(i.league));
  const gameKey = gameFollows.map((g) => `${g.league}:${g.refId}`).join(",");

  useEffect(() => {
    if (!gameKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveGames({});
      return;
    }
    let cancelled = false;
    fetch(`/api/follows/games?ids=${encodeURIComponent(gameKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { games?: Record<string, GameRow> } | null) => {
        if (!cancelled && data?.games) setLiveGames(data.games);
      })
      .catch(() => {
        /* the stored label still renders as a plain link below */
      });
    return () => {
      cancelled = true;
    };
  }, [gameKey]);

  if (!loaded || items.length === 0) return null;

  const otherFollows = items.filter((i) => i.kind !== "game" || !isLeague(i.league));

  return (
    <section>
      <SectionHeader description="Matches, players, teams and tournaments you're following on this device">Following</SectionHeader>
      <div className="flex flex-col gap-3">
        {gameFollows.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {gameFollows.map((g) => {
              const game = liveGames[`${g.league}:${g.refId}`];
              return game ? (
                <div key={`${g.league}:${g.refId}`} className="relative">
                  <GameCard league={game.league} game={game} />
                  <UnfollowBadge item={g} />
                </div>
              ) : (
                <ul key={`${g.league}:${g.refId}`} className="card divide-y divide-[var(--border)] overflow-hidden">
                  <FollowRow item={g} />
                </ul>
              );
            })}
          </div>
        )}
        {otherFollows.length > 0 && (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {otherFollows.map((i) => (
              <FollowRow key={`${i.kind}:${i.league}:${i.refId}`} item={i} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
