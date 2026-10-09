"use client";

import { useState } from "react";
import type { EditionContext } from "@/lib/editions";
import type { HomeBlock } from "@/lib/blockTypes";
import { MAX_BLOCKS, writeSetup, type HomeSetup } from "@/lib/homeSetup";
import { BlockPalette } from "./BlockPalette";
import { useDragReorder } from "./useDragReorder";
import { BackToFullSite } from "./BackToFullSite";

// The editor on the built page ("Edit your blocks"): the current blocks as removable chips, the
// add palette, a draggable preview and a save button. The first-visit picker is SportPicker.
export function HomeBuilder({ ctx, initial, onClose }: { ctx: EditionContext; initial: HomeSetup; onClose?: () => void }) {
  const [blocks, setBlocks] = useState<HomeBlock[]>(initial.blocks);
  const [saveError, setSaveError] = useState(false);

  const chosen = new Set(blocks.map((b) => b.id));
  const add = (b: HomeBlock) => setBlocks((list) => (list.some((x) => x.id === b.id) || list.length >= MAX_BLOCKS ? list : [...list, b]));
  const remove = (id: string) => setBlocks((list) => list.filter((b) => b.id !== id));
  const unpick = (ids: string[]) => setBlocks((list) => list.filter((b) => !ids.includes(b.id)));
  // Same semantics as moveBlock in lib/homeSetup.ts, on the plain draft list this card edits
  // before it is saved.
  const move = (id: string, delta: -1 | 1) =>
    setBlocks((list) => {
      const i = list.findIndex((b) => b.id === id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const { handleProps } = useDragReorder(
    blocks.map((b) => b.id),
    (ids) => setBlocks((list) => ids.map((id) => list.find((b) => b.id === id)!).filter(Boolean)),
    () => {}
  );

  const save = () => {
    setSaveError(!writeSetup({ ...initial, blocks }));
    onClose?.();
  };

  return (
    <div className="band flex flex-col gap-5 rounded-2xl border border-[var(--mast-line)] bg-[color-mix(in_srgb,var(--mast-2)_80%,transparent)] p-5 text-[var(--mast-text)] sm:p-6">
      <p className="display text-[28px]">Edit your blocks</p>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <ul className="flex flex-wrap gap-2" aria-label="Your blocks">
            {blocks.map((b) => (
              <li key={b.id}>
                <span className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--sig)] pl-3.5 pr-2 text-[13px] font-bold text-[var(--sig-on)]">
                  {b.label}
                  <button type="button" onClick={() => remove(b.id)} aria-label={`Remove ${b.label}`} className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--sig-on)_12%,transparent)]">×</button>
                </span>
              </li>
            ))}
            {blocks.length === 0 && <li className="text-[13px] text-[var(--mast-muted)]">No blocks yet. Add some below, or go back to the full site view.</li>}
          </ul>
          <BlockPalette ctx={ctx} existing={chosen} onPick={add} onUnpick={unpick} />
        </div>
        <div className="rounded-xl bg-[var(--bg)] p-3 text-[var(--text)] lg:col-span-2">
          <p className="eyebrow eyebrow-quiet mb-2">Preview · {blocks.length} {blocks.length === 1 ? "block" : "blocks"} · drag to reorder</p>
          <ol className="flex flex-col gap-1.5">
            {blocks.map((b, i) => (
              <li key={b.id} data-drag-id={b.id} className="group flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-bold">
                <button type="button" {...handleProps(b.id)} tabIndex={-1} aria-label={`Drag to move ${b.label}`} className="text-[var(--text-faint)]">⋮⋮</button>
                <span className="flex-1 truncate">{b.label}</span>
                <span className="flex gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button type="button" onClick={() => move(b.id, -1)} disabled={i === 0} aria-label={`Move ${b.label} up`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} aria-label={`Move ${b.label} down`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↓</button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={blocks.length === 0} className="h-12 rounded-xl bg-[var(--sig)] px-6 text-[15px] font-extrabold text-[var(--sig-on)] disabled:opacity-50">
          Save my blocks
        </button>
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[var(--mast-line)] px-4 text-[14px] font-bold">Cancel</button>
        <BackToFullSite className="h-12 px-2 text-[14px] font-bold underline underline-offset-4 text-[var(--mast-muted)] hover:text-[var(--sig)]" />
        <span className="ml-auto text-[12px] text-[var(--mast-muted)]">{saveError ? "Couldn't save on this device" : "No sign-up. Saved in this browser only."}</span>
      </div>
    </div>
  );
}
