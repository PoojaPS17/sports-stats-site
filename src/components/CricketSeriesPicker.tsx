"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  espn_id: string;
  name: string;
  subtitle: string;
  live: boolean;
  featured: boolean;
}

// Typeahead over every cricket series and tournament in the database. The live and
// upcoming lists show headline cricket only (see lib/cricketFeatured.ts); this is
// how a reader reaches the Ranji Trophy, a county round or a bilateral tour.
// Choosing an entry navigates to its series page.
export function CricketSeriesPicker({ large = false, autoFocus = false, onNavigate }: { large?: boolean; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/cricket-series?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { results: Hit[] };
        setHits(data.results);
        setSearched(q);
        setOpen(true);
        setActive(0);
      } catch {
        /* aborted or offline: keep the previous list */
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function choose(h: Hit) {
    setOpen(false);
    setQuery("");
    setHits([]);
    onNavigate?.();
    router.push(`/cricket/series/${h.espn_id}`);
  }

  const empty = open && query.trim().length >= 2 && searched === query.trim() && hits.length === 0;

  return (
    <div ref={rootRef} className="relative w-full">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-faint)] ${large ? "left-3.5" : "left-3"}`}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) {
            setHits([]);
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(hits[active]);
          }
        }}
        placeholder={large ? "Find any series or tournament, like Ranji Trophy or PSL" : "Find a series or tournament"}
        aria-label="Find a cricket series or tournament"
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={`w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none transition [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] ${
          large ? "py-3 pl-10 pr-3 text-base" : "py-2 pl-8 pr-3 text-sm"
        }`}
      />
      {(open && hits.length > 0) || empty ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-pop)]"
        >
          {empty ? (
            <li className="px-2.5 py-2 text-sm text-[var(--text-muted)]">No series matches &ldquo;{query.trim()}&rdquo;.</li>
          ) : (
            hits.map((h, i) => (
              <li key={h.espn_id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(h)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-[var(--surface-muted)]" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.name}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{h.subtitle}</span>
                  </span>
                  {h.live && <span className="pill pill-live shrink-0">Live</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
