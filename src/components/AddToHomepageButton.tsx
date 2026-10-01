"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FollowItem } from "@/lib/follow";
import { followToBlock } from "@/lib/followBlocks";
import { addBlock, hasBlock, isSetup, newSetup, readSetup, SETUP_EVENT, writeSetup } from "@/lib/homeSetup";

type Item = Omit<FollowItem, "addedAt">;

// "Add to my homepage" beside the follow button on team, player and series pages. Adds the
// matching block to the setup saved in this browser (or starts one), and says so.
export function AddToHomepageButton({ item }: { item: Item }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- item is a fresh object each render; these fields are what followToBlock reads
  const block = useMemo(() => followToBlock(item), [item.kind, item.league, item.refId, item.label]);
  const [onPage, setOnPage] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!block) return;
    const check = () => {
      const s = readSetup();
      setOnPage(isSetup(s) && hasBlock(s, block.id));
    };
    check();
    window.addEventListener(SETUP_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(SETUP_EVENT, check);
      window.removeEventListener("storage", check);
    };
  }, [block]);

  if (!block) return null;

  if (onPage && !justAdded) {
    return (
      <Link href="/" className="inline-flex shrink-0 items-center rounded-lg border border-[var(--sig-ink)] bg-[var(--sig-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--sig-ink)]">
        On your homepage
      </Link>
    );
  }

  const add = () => {
    const s = readSetup();
    writeSetup(isSetup(s) ? addBlock(s, block) : newSetup("blank", null, [block]));
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <button type="button" onClick={add} aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]">
      {justAdded ? "Added" : "Add to my homepage"}
    </button>
  );
}
