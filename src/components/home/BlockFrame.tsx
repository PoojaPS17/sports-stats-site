"use client";

import type { ReactNode } from "react";
import type { HomeBlock } from "@/lib/blockTypes";
import type { BlockState } from "./useBlocksData";

const TAG: Record<HomeBlock["type"], string> = {
  live: "Live",
  "team-next": "Fixtures",
  standings: "Table",
  "series-standings": "Cricket",
  "player-form": "Last 5",
  "f1-drivers": "Formula 1",
  bts: "Desk",
};

// One block's chrome on the built page: drag handle, name in the display face, a tag, the
// move buttons (always visible on phones, on focus elsewhere) and the remove control.
export function BlockFrame({
  block,
  index,
  count,
  state,
  onRemove,
  onMove,
  handleProps,
  children,
}: {
  block: HomeBlock;
  index: number;
  count: number;
  state: BlockState | undefined;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  handleProps: React.HTMLAttributes<HTMLButtonElement>;
  children: ReactNode;
}) {
  const liveCount = block.type === "live" && state?.data ? (state.data as { games: unknown[]; cricket: unknown[]; tennis: unknown[] }) : null;
  const n = liveCount ? liveCount.games.length + liveCount.cricket.length + liveCount.tennis.length : 0;
  return (
    <section
      id={`block-${block.id}`}
      data-drag-id={block.id}
      className={`card group flex flex-col gap-3 p-4 ${block.type === "live" ? "md:col-span-2" : ""}`}
      aria-label={block.label}
    >
      <header className="flex items-center gap-2">
        <button type="button" {...handleProps} aria-label={`Drag to move ${block.label}`} className="text-[var(--text-faint)] hover:text-[var(--text)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        <h3 className="display flex-1 truncate text-[20px] text-[var(--text)]">{block.label}</h3>
        {block.type === "live" && n > 0 ? (
          <span className="pill pill-live"><span className="live-dot" />{n}</span>
        ) : (
          <span className="rounded-full bg-[var(--sig-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--sig-ink)]">{TAG[block.type]}</span>
        )}
        <span className="flex gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${block.label} up`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${block.label} down`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↓</button>
        </span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${block.label}`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--live)]">×</button>
      </header>
      {state?.status === "loading" && <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-muted)]" aria-hidden />}
      {state?.status === "error" && <p className="text-sm text-[var(--text-muted)]">Couldn&apos;t load, retrying.</p>}
      {state?.status === "empty" && <p className="text-sm text-[var(--text-muted)]">Nothing to show yet.</p>}
      {state?.status === "ok" && children}
    </section>
  );
}
