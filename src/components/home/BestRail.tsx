"use client";

import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { useEffect, useState, type ReactNode } from "react";
import { blockId, type HomeBlock } from "@/lib/blockTypes";
import type { BestChip } from "@/lib/bestOfWeek";
import type { FactFollow } from "@/lib/threeLines";
import { isSportPick, PICKED_BLOCKS_EVENT, PICKED_EVENT, PICK_FOLLOW_EVENT, SPORT_PICK_LABEL, type SportPick } from "@/lib/sportPicks";

export interface BestItem {
  id: string;
  /** The sport chip this card sits under. */
  chip: string;
  follow: FactFollow | null;
  /** The server-drawn card body. */
  card: ReactNode;
  /** The page the card's figure is on, and the link's words. */
  href: string;
  go: string;
}

/** The block a card's Follow adds: the same shape the Try-a-name Follow and the picker write. */
export function followBlock(follow: FactFollow | null): HomeBlock | null {
  const b = follow?.block;
  return b ? { id: blockId(b.type, b.params), type: b.type, params: b.params, label: b.label } : null;
}

// "The best of this week": sport chips over a rail of cards. All cards are in the server HTML; a chip hides the others
// and with no JavaScript every card shows. + Follow hands the picker the sport (and the team or player) through the
// same window event the Start-here cards use; the picker owns the picks and tells this rail what it holds.
export function BestRail({ chips, items }: { chips: BestChip[]; items: BestItem[] }) {
  const [chip, setChip] = useState("all");
  const [mounted, setMounted] = useState(false);
  const [sports, setSports] = useState<SportPick[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onSports = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      setSports(Array.isArray(d) ? d.filter((s): s is SportPick => typeof s === "string" && isSportPick(s)) : []);
    };
    const onBlocks = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      setBlocks(Array.isArray(d) ? d.filter((s): s is string => typeof s === "string") : []);
    };
    window.addEventListener(PICKED_EVENT, onSports);
    window.addEventListener(PICKED_BLOCKS_EVENT, onBlocks);
    return () => {
      window.removeEventListener(PICKED_EVENT, onSports);
      window.removeEventListener(PICKED_BLOCKS_EVENT, onBlocks);
    };
  }, []);

  const follow = (f: FactFollow) => window.dispatchEvent(new CustomEvent(PICK_FOLLOW_EVENT, { detail: { sport: f.sport, block: followBlock(f) } }));

  return (
    <>
      {chips.length > 2 && (
        <div className="bw-chips" role="group" aria-label="Filter by sport" hidden={!mounted}>
          {chips.map((c) => (
            <button key={c.key} type="button" aria-pressed={chip === c.key} onClick={() => setChip(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <ul className="bw-rail">
        {items.map((it) => {
          const block = followBlock(it.follow);
          const on = it.follow ? (block ? blocks.includes(block.id) : isSportPick(it.follow.sport) && sports.includes(it.follow.sport)) : false;
          const what = block ? block.label.replace(/: next three$|: last five$/, "") : it.follow && isSportPick(it.follow.sport) ? SPORT_PICK_LABEL[it.follow.sport] : "";
          return (
            <li key={it.id} hidden={chip !== "all" && it.chip !== chip} className="bw-card card">
              <Link prefetch={prefetchFor(it.href)} href={it.href} className="bw-link">
                {it.card}
              </Link>
              <div className="bw-foot">
                <Link prefetch={prefetchFor(it.href)} href={it.href} className="bw-go">
                  {it.go}
                </Link>
                {it.follow && (
                  <span hidden={!mounted}>
                  <button type="button" className="bw-follow" aria-pressed={on} aria-label={`${on ? "Following" : "Follow"} ${what}`} title={`${on ? "On your page" : `Add ${what} to your page`}`} onClick={() => it.follow && follow(it.follow)}>
                    {on ? "✓ Following" : "+ Follow"}
                  </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
