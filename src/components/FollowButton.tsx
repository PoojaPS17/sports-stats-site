"use client";

import { useEffect, useState } from "react";
import { FOLLOWS_EVENT, isFollowing, toggleFollow, type FollowItem } from "@/lib/follow";

type Item = Omit<FollowItem, "addedAt">;

// "+ Follow" toggle for a match, player, team, series or tournament. State lives in
// localStorage (see lib/follow.ts); this just renders whatever the current tab's copy
// of the list says, and re-checks it whenever any button on the page changes it.
export function FollowButton({ item, compact = false }: { item: Item; compact?: boolean }) {
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    const check = () => setFollowing(isFollowing(item.kind, item.league, item.refId));
    check();
    window.addEventListener(FOLLOWS_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(FOLLOWS_EVENT, check);
      window.removeEventListener("storage", check);
    };
  }, [item.kind, item.league, item.refId]);

  return (
    <button
      type="button"
      onClick={() => setFollowing(toggleFollow(item))}
      aria-pressed={following}
      title={following ? `Unfollow ${item.label}` : `Follow ${item.label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
        following
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
    >
      {following ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
      {!compact && (following ? "Following" : "Follow")}
    </button>
  );
}
