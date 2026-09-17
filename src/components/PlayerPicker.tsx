"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Option {
  slug: string;
  name: string;
  subtitle: string | null;
  image: string | null;
}

// Typeahead that resolves a player name to a slug and stores it in a hidden input,
// so the surrounding <form method="get"> submits ?a=slug&b=slug with no JS needed
// for the page itself.
export function PlayerPicker({
  league,
  name,
  label,
  initial,
}: {
  league: string;
  name: string;
  label: string;
  initial: { slug: string; name: string } | null;
}) {
  const [query, setQuery] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<{ slug: string; name: string } | null>(initial);
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Chrome ignores autocomplete="off" once it decides (from the paired A/B fields
  // and their label wording) that this looks like a personal-name field, and shows
  // saved-name suggestions instead of our own results. Starting the field readOnly
  // and lifting that on the first real focus keeps Chrome from ever attaching its
  // autofill UI to it in the first place.
  const [locked, setLocked] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (selected && query === selected.name) return;
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?league=${encodeURIComponent(league)}&type=player&q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: Option[] };
        setOptions(data.results);
        setOpen(true);
        setActive(0);
      } catch {
        /* aborted or offline: keep previous options */
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query, league, selected]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function choose(o: Option) {
    setSelected({ slug: o.slug, name: o.name });
    setQuery(o.name);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex-1">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
      <input type="hidden" name={name} value={selected?.slug ?? ""} />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          if (e.target.value.trim().length < 2) {
            setOptions([]);
            setOpen(false);
          }
        }}
        onFocus={() => {
          setLocked(false);
          if (options.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search players"
        autoComplete="off"
        readOnly={locked}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-pop)]"
        >
          {options.map((o, i) => (
            <li key={o.slug} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-[var(--surface-muted)]" : ""}`}
              >
                {o.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.image} alt="" className="h-7 w-7 rounded-full bg-[var(--surface-muted)] object-cover" />
                ) : (
                  <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.name}</span>
                  {o.subtitle && <span className="block truncate text-xs text-[var(--text-muted)]">{o.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
