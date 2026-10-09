"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditionContext } from "@/lib/editions";
import type { HomeBlock } from "@/lib/blockTypes";
import { heroLine, heroTeamColours, type LoadedBlock } from "@/lib/homeHeroLine";
import { addBlock, applyHomeAttribute, clearSetup, decodeSetup, isSetup, moveBlock, newSetup, readSetup, removeBlock, reorderBlocks, SETUP_EVENT, writeSetup, type HomeSetup } from "@/lib/homeSetup";
import { BlockFrame } from "./BlockFrame";
import { BlockPalette } from "./BlockPalette";
import { BuiltHero } from "./BuiltHero";
import { HomeBuilder } from "./HomeBuilder";
import { MakeItYours } from "./MakeItYours";
import { MomentsMissed } from "./MomentsMissed";
import { renderBlock } from "./blocks";
import { useBlocksData } from "./useBlocksData";
import { useDragReorder } from "./useDragReorder";
import { useFlip } from "../motion/useFlip";
import { prefersReducedMotion } from "../motion/reduced";

// How long a removed block shrinks and fades (the .block-leaving animation in globals.css) before it is taken out.
const LEAVE_MS = 240;

// The built homepage: reads the setup saved in this browser, fetches its blocks, writes the
// hero from them and lets the visitor reorder, remove and add. Renders nothing on the server
// and nothing when there is no setup; the pre-paint script in app/layout.tsx shows a
// skeleton in the hero's place until this mounts.
export function HomeBlocks({ ctx }: { ctx: EditionContext }) {
  const [setup, setSetup] = useState<HomeSetup | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const snapshot = useFlip(gridRef);
  const setupRef = useRef(setup);
  // react-hooks/refs forbids writing a ref during render; this keeps the ref in sync for the
  // drag-drop onDrop below (which needs the latest setup, not the one from when the drag started).
  useEffect(() => {
    setupRef.current = setup;
  }, [setup]);

  useEffect(() => {
    const read = () => {
      const s = readSetup();
      applyHomeAttribute(s);
      setSetup(isSetup(s) ? s : null);
      document.documentElement.dataset.homeReady = "1";
    };
    const encoded = new URLSearchParams(window.location.search).get("setup");
    if (encoded) {
      const incoming = decodeSetup(encoded);
      const existing = readSetup();
      if (incoming && (!isSetup(existing) || window.confirm("Replace the homepage saved on this device with the one from this link?"))) {
        writeSetup(newSetup(incoming.edition, incoming.country, incoming.blocks));
      }
      const u = new URL(window.location.href);
      u.searchParams.delete("setup");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    }
    read();
    window.addEventListener(SETUP_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(SETUP_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const blocks = useMemo(() => setup?.blocks ?? [], [setup]);
  const states = useBlocksData(blocks);
  const loaded: LoadedBlock[] = blocks.map((b) => ({ block: b, data: states[b.id]?.data ?? null }));
  const line = heroLine(loaded, {
    now: new Date(),
    formatTime: (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    formatDay: (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" }),
  });

  const commit = useCallback(
    (next: HomeSetup) => {
      snapshot();
      setSetup(next);
      writeSetup(next);
    },
    [snapshot]
  );
  const { handleProps } = useDragReorder(
    blocks.map((b) => b.id),
    (ids) => {
      snapshot();
      setSetup((s) => (s ? reorderBlocks(s, ids) : s));
    },
    () => {
      if (setupRef.current) writeSetup(setupRef.current);
    }
  );

  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAdding(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding]);

  if (!setup) return null;

  // A removed block shrinks and fades first, then leaves; the blocks after it glide up (FLIP) when it goes.
  const remove = (id: string) => {
    const take = () => {
      const current = setupRef.current;
      if (!current) return;
      const next = removeBlock(current, id);
      setLeaving(null);
      if (next.blocks.length === 0) clearSetup();
      else commit(next);
    };
    if (prefersReducedMotion()) return take();
    setLeaving(id);
    window.setTimeout(take, LEAVE_MS);
  };

  const onPick = (b: HomeBlock) => {
    commit(addBlock(setup, b));
    setAdding(false);
  };

  return (
    <>
      {editing ? (
        <section className="band bleed -mt-6 py-8">
          <HomeBuilder ctx={ctx} initial={setup} onClose={() => setEditing(false)} />
        </section>
      ) : (
        <BuiltHero setup={setup} headline={line.headline} sub={line.sub} liveCount={line.liveCount} colours={heroTeamColours(loaded)} onEdit={() => setEditing(true)} />
      )}

      {!editing && <MakeItYours setup={setup} onEdit={() => setEditing(true)} />}

      {!editing && <MomentsMissed blocks={blocks} />}

      <div ref={gridRef} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {blocks.map((b, i) => (
          <BlockFrame
            key={b.id}
            block={b}
            index={i}
            count={blocks.length}
            state={states[b.id]}
            leaving={leaving === b.id}
            onRemove={() => remove(b.id)}
            onMove={(d) => commit(moveBlock(setup, b.id, d))}
            handleProps={handleProps(b.id)}
          >
            {renderBlock(b, states[b.id])}
          </BlockFrame>
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="add-block btn-lift flex min-h-24 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-strong)] text-[14px] font-bold text-[var(--text-muted)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]"
        >
          + Add another block
        </button>
      </div>

      {adding && (
        <div role="dialog" aria-modal="true" aria-label="Add another block" className="fixed inset-0 z-40 flex items-end justify-center bg-[color-mix(in_srgb,var(--mast)_60%,transparent)] p-4 sm:items-center" onClick={() => setAdding(false)}>
          <div className="card max-h-[85vh] w-full max-w-2xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="display text-[24px]">Add another block</p>
              <button type="button" onClick={() => setAdding(false)} aria-label="Close" className="text-[var(--text-faint)]">×</button>
            </div>
            <BlockPalette ctx={ctx} existing={new Set(blocks.map((b) => b.id))} onPick={onPick} dark={false} />
          </div>
        </div>
      )}
    </>
  );
}
