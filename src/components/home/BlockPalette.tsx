"use client";

import { useEffect, useState } from "react";
import { paletteGroups } from "@/lib/blockCatalogue";
import type { EditionContext } from "@/lib/editions";
import type { HomeBlock } from "@/lib/blockTypes";
import { searchResultToBlock } from "@/lib/followBlocks";
import type { SearchResult } from "@/lib/queries";

// The "Add more blocks" palette: grouped chips plus a search box for any team, player or
// competition. `existing` chips are shown ticked and do nothing. Used inside the builder
// and, inside a dialog, from the built page's "+ Add another block".
export function BlockPalette({ ctx, existing, onPick, dark = true }: { ctx: EditionContext; existing: Set<string>; onPick: (block: HomeBlock) => void; dark?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HomeBlock[]>([]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const id = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { results: SearchResult[] }) => {
          if (cancelled) return;
          setResults(d.results.map(searchResultToBlock).filter((b): b is HomeBlock => b !== null).slice(0, 6));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  const chip = (b: HomeBlock) => {
    const on = existing.has(b.id);
    return (
      <button
        key={b.id}
        type="button"
        disabled={on}
        onClick={() => onPick(b)}
        aria-pressed={on}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition ${
          on
            ? "border-transparent bg-[var(--sig)] text-[var(--sig-on)]"
            : dark
              ? "border-[var(--mast-line)] text-[var(--mast-text)] hover:border-[var(--sig)] hover:text-[var(--sig)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]"
        }`}
      >
        {on ? "✓" : "+"} {b.label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className={`eyebrow ${dark ? "text-[var(--mast-muted)]" : "text-[var(--text-faint)]"}`}>Add more blocks</p>
      {paletteGroups(ctx).map((g) => (
        <div key={g.name} className="flex gap-3">
          <span className={`w-[74px] shrink-0 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] ${dark ? "text-[var(--mast-muted)]" : "text-[var(--text-faint)]"}`}>{g.name}</span>
          <div className="flex flex-wrap gap-2">{g.blocks.map(chip)}</div>
        </div>
      ))}
      <label className="flex flex-col gap-2">
        <span className="sr-only">Type a team, player or competition</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a team, player or competition"
          className={`h-11 rounded-xl border px-4 text-[14px] outline-none focus:border-[var(--sig)] ${
            dark ? "border-[var(--mast-line)] bg-[var(--mast-2)] text-[var(--mast-text)] placeholder:text-[var(--mast-muted)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          }`}
        />
      </label>
      {results.length > 0 && <div className="flex flex-wrap gap-2">{results.map(chip)}</div>}
    </div>
  );
}
