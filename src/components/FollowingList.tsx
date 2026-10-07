"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FOLLOWS_EVENT, addFollows, getFollows, removeFollow, type FollowItem, type FollowKind } from "@/lib/follow";
import { MAX_SHARED, decodeFollows, encodeFollows } from "@/lib/followShare";

const GROUPS: { kind: FollowKind; title: string }[] = [
  { kind: "team", title: "Teams" },
  { kind: "player", title: "Players" },
  { kind: "series", title: "Series" },
  { kind: "tournament", title: "Tournaments" },
  { kind: "game", title: "Matches" },
];

const buttonClass =
  "inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]";

// Everything the visitor follows in one place, with a link that carries the list to another phone or a friend.
// The list lives in this browser (lib/follow.ts); a shared link is read here and added only when asked.
export function FollowingList() {
  const [items, setItems] = useState<FollowItem[] | null>(null);
  const [message, setMessage] = useState("");
  const shared = decodeFollows(useSearchParams().get("f"));

  useEffect(() => {
    const read = () => setItems(getFollows());
    read();
    window.addEventListener(FOLLOWS_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(FOLLOWS_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  async function copyLink() {
    const link = `${window.location.origin}/following?f=${encodeFollows(getFollows())}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My follows on SportsDB", url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setMessage("Link copied. Open it on another device to bring your follows with you.");
    } catch {
      setMessage(`Copy this link: ${link}`);
    }
  }

  function importShared() {
    const added = addFollows(shared);
    setMessage(added === 0 ? "Everything in that list is already in your follows." : `Added ${added} to your follows.`);
    window.history.replaceState(null, "", "/following");
  }

  if (items === null) return <p className="text-sm text-[var(--text-muted)]">Loading your follows…</p>;

  return (
    <div className="flex flex-col gap-6">
      {shared.length > 0 && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-bold">A shared list of {shared.length}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {shared.map((s) => (
              <li key={`${s.kind}:${s.league}:${s.refId}`}>
                <Link href={s.href} className="text-[var(--accent)] hover:underline">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" onClick={importShared} className={buttonClass}>
              Add these to my follows
            </button>
          </div>
        </section>
      )}

      {message && (
        <p role="status" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          {message}
        </p>
      )}

      {items.length === 0 ? (
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-base font-bold">You are not following anything yet</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Tap Follow on any team, player, series or match page and it shows up here. Teams, players and series also build your{" "}
            <Link href="/" className="text-[var(--accent)] hover:underline">
              homepage
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copyLink} className={buttonClass}>
              Share my follows
            </button>
            <span className="text-xs text-[var(--text-muted)]">{items.length > MAX_SHARED ? `The link carries your ${MAX_SHARED} most recent.` : "A link anyone can open, no sign-up."}</span>
          </div>
          {GROUPS.map(({ kind, title }) => {
            const rows = items.filter((i) => i.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} className="flex flex-col gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</h2>
                <ul className="card divide-y divide-[var(--border)]">
                  {rows.map((i) => (
                    <li key={`${i.league}:${i.refId}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link href={i.href} className="flex min-w-0 flex-col hover:text-[var(--accent)]">
                        <span className="truncate font-semibold">{i.label}</span>
                        {i.sublabel && <span className="text-xs text-[var(--text-muted)]">{i.sublabel}</span>}
                      </Link>
                      <button type="button" onClick={() => removeFollow(i.kind, i.league, i.refId)} className="shrink-0 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]" aria-label={`Unfollow ${i.label}`}>
                        Unfollow
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
