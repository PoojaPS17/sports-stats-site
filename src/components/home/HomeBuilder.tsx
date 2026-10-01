"use client";

import { useEffect, useRef, useState } from "react";
import { editionFor, editionNote, editionToggleLabel, startingBlocks, type Edition, type EditionContext } from "@/lib/editions";
import { followsToBlocks } from "@/lib/followBlocks";
import { getFollows } from "@/lib/follow";
import type { HomeBlock } from "@/lib/blockTypes";
import { MAX_BLOCKS, newSetup, readSetup, writeDeclined, writeSetup, SETUP_EVENT, type HomeSetup } from "@/lib/homeSetup";
import { BlockPalette } from "./BlockPalette";
import { useDragReorder } from "./useDragReorder";

// The hero on a first visit: the product claim, a draft of blocks for the visitor's
// country (plus anything they already follow), the add palette, and one button that
// makes it their homepage. In `edit` mode the same card edits an existing setup.
export function HomeBuilder({ ctx, mode = "first", initial, onClose }: { ctx: EditionContext; mode?: "first" | "edit"; initial?: HomeSetup; onClose?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [country, setCountry] = useState<string | null>(initial?.country ?? null);
  const [edition, setEdition] = useState<Edition>(editionFor(initial?.country ?? null));
  const [blank, setBlank] = useState(initial?.edition === "blank");
  const [blocks, setBlocks] = useState<HomeBlock[]>(initial?.blocks ?? []);
  const [saveError, setSaveError] = useState(false);
  // Bumped by the SETUP_EVENT listener below whenever the stored setup becomes null (cleared via
  // clearSetup()), so the region lookup effect re-runs and the builder repopulates its draft.
  const [version, setVersion] = useState(0);
  // True once the visitor has edited the draft (add/remove/move/reorder); a region response that
  // arrives afterwards must not clobber their edits.
  const touched = useRef(false);

  // First visit: nothing to show if this browser already has a setup or declined; the pre-paint
  // script hides the hero before this runs, this keeps the DOM consistent afterwards. When the
  // setup is cleared later (clearSetup()), the builder becomes visible again, so bump `version`
  // to re-trigger the region lookup that was skipped while it was hidden.
  useEffect(() => {
    if (mode !== "first") return;
    // Only a later change (not this initial check) should re-run the region lookup below: a
    // first-time visitor already has no setup, and that case is handled by the lookup effect itself.
    const check = () => setHidden(readSetup() !== null);
    const onChange = () => {
      const stillSet = readSetup() !== null;
      setHidden(stillSet);
      if (!stillSet) setVersion((v) => v + 1);
    };
    check();
    window.addEventListener(SETUP_EVENT, onChange);
    return () => window.removeEventListener(SETUP_EVENT, onChange);
  }, [mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (mode !== "first") return;
    // A visitor who already has a setup or declined doesn't see this card at all (see `hidden`
    // above); skip the lookup so a built or declined visitor never fires /api/region.
    if (readSetup() !== null) return;
    touched.current = false;
    // A Strict Mode double-invoke (or an unmount mid-request) must not let a late response
    // clobber edits the visitor made in the meantime.
    let cancelled = false;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d: { country?: string | null }) => {
        if (cancelled || touched.current) return;
        const ed = editionFor(d.country ?? null);
        setCountry(d.country ?? null);
        setEdition(ed);
        setBlocks(draft(ed, ctx));
      })
      .catch(() => {
        if (!cancelled && !touched.current) setBlocks(draft(editionFor(null), ctx));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, version]);

  const chosen = new Set(blocks.map((b) => b.id));
  const add = (b: HomeBlock) => {
    touched.current = true;
    setBlocks((list) => (list.some((x) => x.id === b.id) || list.length >= MAX_BLOCKS ? list : [...list, b]));
  };
  const remove = (id: string) => {
    touched.current = true;
    setBlocks((list) => list.filter((b) => b.id !== id));
  };
  // Same semantics as moveBlock in lib/homeSetup.ts, on the plain draft list this card edits
  // before there is a setup to call it on.
  const move = (id: string, delta: -1 | 1) => {
    touched.current = true;
    setBlocks((list) => {
      const i = list.findIndex((b) => b.id === id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const { handleProps } = useDragReorder(
    blocks.map((b) => b.id),
    (ids) => {
      touched.current = true;
      setBlocks((list) => ids.map((id) => list.find((b) => b.id === id)!).filter(Boolean));
    },
    () => {}
  );

  const save = () => {
    const setup = mode === "edit" && initial ? { ...initial, blocks } : newSetup(blank ? "blank" : edition.key, country, blocks);
    setSaveError(!writeSetup(setup));
    onClose?.();
  };
  const decline = () => {
    writeDeclined();
  };
  const pickEdition = (useBlank: boolean) => {
    setBlank(useBlank);
    setBlocks(useBlank ? [] : draft(edition, ctx));
  };

  if (hidden) return null;

  const card = (
    <div className={`flex flex-col gap-5 rounded-2xl border border-[var(--mast-line)] bg-[color-mix(in_srgb,var(--mast-2)_80%,transparent)] p-5 sm:p-6 ${mode === "edit" ? "band text-[var(--mast-text)]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="display text-[28px]">{mode === "edit" ? "Edit your blocks" : "We started one for you"}</p>
          {mode === "first" && <p className="text-[13px] text-[var(--mast-muted)]">{mounted ? editionNote(edition) : "Finding your picks…"}</p>}
        </div>
        {mode === "first" && (
          <div className="flex gap-2">
            <button type="button" onClick={() => pickEdition(false)} aria-pressed={!blank} className={`h-9 rounded-full border px-3 text-[12px] font-bold ${!blank ? "border-[var(--sig)] text-[var(--sig)]" : "border-[var(--mast-line)] text-[var(--mast-muted)]"}`}>{editionToggleLabel(edition)}</button>
            <button type="button" onClick={() => pickEdition(true)} aria-pressed={blank} className={`h-9 rounded-full border px-3 text-[12px] font-bold ${blank ? "border-[var(--sig)] text-[var(--sig)]" : "border-[var(--mast-line)] text-[var(--mast-muted)]"}`}>Start blank</button>
          </div>
        )}
      </div>

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
            {blocks.length === 0 && mounted && <li className="text-[13px] text-[var(--mast-muted)]">No blocks yet. Add some below.</li>}
          </ul>
          <BlockPalette ctx={ctx} existing={chosen} onPick={add} />
        </div>
        <div className="rounded-xl bg-[var(--bg)] p-3 text-[var(--text)] lg:col-span-2">
          <p className="eyebrow mb-2 text-[var(--text-faint)]">Preview · {blocks.length} {blocks.length === 1 ? "block" : "blocks"} · drag to reorder</p>
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
          {mode === "edit" ? "Save my blocks" : "Make this my homepage"}
        </button>
        {mode === "first" ? (
          <button type="button" onClick={decline} className="h-12 rounded-xl border border-[var(--mast-line)] px-4 text-[14px] font-bold text-[var(--mast-text)]">I&apos;ll decide later</button>
        ) : (
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[var(--mast-line)] px-4 text-[14px] font-bold">Cancel</button>
        )}
        <span className="ml-auto text-[12px] text-[var(--mast-muted)]">{saveError ? "Couldn't save on this device" : "No sign-up. Saved in this browser only."}</span>
      </div>
    </div>
  );

  if (mode === "edit") return card;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Your homepage, your rules</p>
        <h1 className="display mt-2 max-w-4xl text-[44px] leading-[0.95] sm:text-[64px] lg:text-[84px]">
          Build the sports page <span className="text-[var(--sig)]">you keep looking for.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] text-[var(--mast-muted)] sm:text-[18px]">
          Choose what sits here: live scores, tables, a player&apos;s form, your team&apos;s next three. It stays this way every time you come back.
        </p>
      </div>
      {card}
    </div>
  );
}

function draft(edition: Edition, ctx: EditionContext): HomeBlock[] {
  const start = startingBlocks(edition, ctx);
  const seen = new Set(start.map((b) => b.id));
  const follows = followsToBlocks(getFollows()).filter((b) => !seen.has(b.id));
  return [...start, ...follows].slice(0, MAX_BLOCKS);
}
