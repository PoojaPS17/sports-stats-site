"use client";

import { useEffect } from "react";
import type { League } from "@/lib/queries";

// Renders nothing — just fires one "this game page was viewed" ping per page load.
// Runs client-side (not during server render) so it reflects real visits even though
// the page itself is ISR-cached and won't re-run its server component every request.
export function ViewTracker({ league, gameId }: { league: League; gameId: string }) {
  useEffect(() => {
    fetch("/api/track-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, gameId }),
      keepalive: true,
    }).catch(() => {});
  }, [league, gameId]);

  return null;
}
