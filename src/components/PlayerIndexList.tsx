"use client";

import type { PackedPlayers } from "@/lib/playerIndex";
import { PlayerIndexLink } from "./PlayerIndexLink";

// The list itself is a client component so that the page carries each player once in its data (a few
// dozen bytes: see packPlayers) instead of a full element tree per row. It is still rendered on the
// server, so every player's link is in the HTML that crawlers read.
export function PlayerIndexList({ league, teams, rows }: { league: string } & PackedPlayers) {
  return (
    <div className="player-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(([name, slug, team]) => (
        <PlayerIndexLink key={slug} league={league} name={name} slug={slug} team={team < 0 ? null : teams[team]} />
      ))}
    </div>
  );
}
