"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the page from the server on a timer while something on it is live, so
// a scoreboard tracks ESPN's feed (which the server reads with a 10-second cache)
// instead of waiting for the next visit. Pauses when the tab is hidden.
export function LiveRefresh({ active, seconds = 10 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, seconds, router]);
  return null;
}
