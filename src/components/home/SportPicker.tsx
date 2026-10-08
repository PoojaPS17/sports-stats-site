"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cricketSideBlock, editionFor, type Edition, type EditionContext } from "@/lib/editions";
import { followsToBlocks, searchResultToBlock } from "@/lib/followBlocks";
import { getFollows } from "@/lib/follow";
import type { HomeBlock } from "@/lib/blockTypes";
import { MAX_BLOCKS, newSetup, readSetup, SETUP_EVENT, writeDeclined, writeSetup } from "@/lib/homeSetup";
import { blocksForSports, isSportPick, PICKED_EVENT, PICK_TOGGLE_EVENT, SPORT_PICK_LABEL, SPORT_PICKS, type SportPick } from "@/lib/sportPicks";
import type { SearchResult } from "@/lib/queries";
import type { SiteCounts } from "@/lib/siteCounts";
import { buildLogMs, startSteps } from "@/lib/makeItYours";

// Line-drawn glyphs, one per tile, in the same 24-unit box.
const GLYPH: Record<SportPick | "all" | "check", string> = {
  cricket: '<path d="M4 20.5 6.2 18.3m0 0 9.6-9.6 2.6 2.6-9.6 9.6-2.6-2.6Z"/><path d="m15.8 8.7 3-3"/><circle cx="18.2" cy="17.6" r="2.2"/>',
  football: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.8 2.8-1.4 4.4H9.6L8.2 10.3Z"/><path d="M12 3v4.5M15.8 10.3l4.4-1.4M14.4 14.7l2.7 3.8M9.6 14.7l-2.7 3.8M8.2 10.3 3.8 8.9"/>',
  nfl: '<path d="M5.2 18.8C2 15.6 3 9.4 6.2 6.2s9.4-4.2 12.6-1c3.2 3.2 2.2 9.4-1 12.6s-9.4 4.2-12.6 1Z"/><path d="m9 15 6-6M10.6 11.4l2 2M12.4 9.6l2 2"/>',
  nba: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5.4c2.6 3.4 2.6 9.8 0 13.2M18 5.4c-2.6 3.4-2.6 9.8 0 13.2"/>',
  mlb: '<circle cx="12" cy="12" r="9"/><path d="M7.4 4.4c2.2 4.4 2.2 10.8 0 15.2M16.6 4.4c-2.2 4.4-2.2 10.8 0 15.2"/><path d="M8.6 8h1.6M8.9 12h1.7M8.6 16h1.6M13.8 8h1.6M13.4 12h1.7M13.8 16h1.6"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9.2c4.6-.4 8.6 3.2 9 8.4.1 1.2 0 2.3-.3 3.3M11.4 3.1c-.2 1-.3 2.1-.2 3.2.4 5 4.4 8.6 9.4 8.3"/>',
  f1: '<path d="M5 21V3.5"/><path d="M5 4h14v9H5"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="currentColor" stroke="none"/>',
  all: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7" stroke-width="3"/>',
};

function Glyph({ name, className }: { name: keyof typeof GLYPH; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPH[name] }} />;
}

/** What the server knows about each tile: how many are live now, or what the sport covers. */
export type SportLines = Record<SportPick, { live: number; text: string }>;

// The first-visit hero: seven big sport tiles, an optional second step for a team or player, and a
// tray that shows the page forming as the visitor taps. One button writes the setup. A visitor who
// already has a setup, or who chose "just show me everything", never sees it (the pre-paint script in
// app/layout.tsx hides the section, and this component renders nothing once the stored setup exists).
export function SportPicker({ ctx, lines, liveNow, counts }: { ctx: EditionContext; lines: SportLines; liveNow: number; counts: SiteCounts | null }) {
  const [hidden, setHidden] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [edition, setEdition] = useState<Edition>(editionFor(null));
  const [sports, setSports] = useState<SportPick[]>([]);
  const [extra, setExtra] = useState<HomeBlock[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HomeBlock[]>([]);
  const [saveError, setSaveError] = useState(false);
  // The lines of the build log while the page forms: the blocks about to be saved, nothing else.
  const [building, setBuilding] = useState<string[] | null>(null);
  const buildTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (buildTimer.current !== null) window.clearTimeout(buildTimer.current);
  }, []);
  const bandRef = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(false);
  const [finalHost, setFinalHost] = useState<HTMLElement | null>(null);

  // The closing call to action lives at the foot of the page (server-rendered empty slot) but shares this state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinalHost(document.getElementById("home-final-cta"));
  }, []);

  // The dock appears once the picker has scrolled off the top, so the way to build is never out of reach.
  useEffect(() => {
    const check = () => {
      const el = bandRef.current;
      if (el) setDock(el.getBoundingClientRect().bottom < 140);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // A browser that already has a setup or declined does not see the picker; a later clear brings it back.
  useEffect(() => {
    const check = () => setHidden(readSetup() !== null);
    check();
    window.addEventListener(SETUP_EVENT, check);
    return () => window.removeEventListener(SETUP_EVENT, check);
  }, []);

  // The visitor's region only picks the national side and the domestic league; it never reaches the server render.
  useEffect(() => {
    if (readSetup() !== null) return;
    let cancelled = false;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d: { country?: string | null }) => {
        if (cancelled) return;
        setCountry(d.country ?? null);
        setEdition(editionFor(d.country ?? null));
      })
      .catch(() => {});
    // Teams and players this browser already follows start on the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExtra(followsToBlocks(getFollows()).slice(0, MAX_BLOCKS - 2));
    return () => {
      cancelled = true;
    };
  }, []);

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
          if (!cancelled) setResults(d.results.map(searchResultToBlock).filter((b): b is HomeBlock => b !== null).slice(0, 6));
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

  // The "Start here" cards further down the page toggle a sport here and read back which are picked.
  useEffect(() => {
    const onToggle = (e: Event) => {
      const sport = (e as CustomEvent<unknown>).detail;
      if (typeof sport === "string" && isSportPick(sport)) setSports((list) => (list.includes(sport) ? list.filter((x) => x !== sport) : [...list, sport]));
    };
    window.addEventListener(PICK_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(PICK_TOGGLE_EVENT, onToggle);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PICKED_EVENT, { detail: sports }));
  }, [sports]);

  const blocks = useMemo(() => blocksForSports(sports, edition, ctx, extra), [sports, edition, ctx, extra]);
  const chosen = new Set(extra.map((b) => b.id));

  if (hidden) return null;

  const toggleSport = (s: SportPick) => setSports((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  const toggleExtra = (b: HomeBlock) => setExtra((list) => (list.some((x) => x.id === b.id) ? list.filter((x) => x.id !== b.id) : list.length >= MAX_BLOCKS - 2 ? list : [...list, b]));
  const save = () => {
    startSteps();
    setSaveError(!writeSetup(newSetup(edition.key, country, blocks)));
    setBuilding(null);
  };
  const build = () => {
    if (blocks.length === 0 || building) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return save();
    // A short, honest log: each line is a block this page will have. It ends by saving, exactly as before.
    setBuilding(blocks.map((b) => b.label));
    bandRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    buildTimer.current = window.setTimeout(save, buildLogMs(blocks.length));
  };

  const toTop = () => bandRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const buildOrPick = () => (blocks.length === 0 ? toTop() : build());
  const sportPills = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sports">
      {SPORT_PICKS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => toggleSport(s)}
          aria-pressed={sports.includes(s)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-extrabold transition ${sports.includes(s) ? "border-[var(--volt)] bg-[var(--volt)] text-[var(--navy)]" : "border-[var(--band-deep-line)] bg-[color-mix(in_srgb,white_8%,transparent)] text-white"}`}
        >
          <Glyph name={s} className={`h-[15px] w-[15px] ${sports.includes(s) ? "text-[var(--navy)]" : "text-[var(--volt)]"}`} />
          {SPORT_PICK_LABEL[s]}
        </button>
      ))}
    </div>
  );
  const sides = sports.includes("cricket") ? ctx.cricketSides.slice(0, 8) : [];

  const chip = (b: HomeBlock, key: string) => {
    const on = chosen.has(b.id);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleExtra(b)}
        aria-pressed={on}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition ${on ? "border-white bg-white text-[var(--navy)]" : "border-[var(--band-deep-line)] bg-[color-mix(in_srgb,white_4%,transparent)] text-[var(--band-deep-text)] hover:border-white"}`}
      >
        {on ? "✓" : "+"} {b.label.replace(/: next three$|: last five$/, "")}
      </button>
    );
  };

  return (
    <>
    <div ref={bandRef} className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-12">
      <div className="min-w-0">
        <p className="eyebrow eyebrow-quiet !text-[var(--band-deep-muted)]">{liveNow > 0 ? <>Right now · <span className="text-[var(--volt)]">{liveNow} in play</span></> : "Live scores, tables and stats"}</p>
        <h1 className="display mt-2.5 max-w-3xl text-[31px] sm:text-[44px] lg:text-[52px]">
          Live scores and stats, <span className="text-[var(--volt)]">built around what you follow.</span>
        </h1>
        {counts && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-bold text-[var(--band-deep-muted)] sm:text-[13px]" aria-label="What the site holds">
            <span><b className="tabular-nums text-white">{counts.playerPages.toLocaleString("en-GB")}</b> player pages</span>
            <span><b className="tabular-nums text-white">{counts.cricketScorecards.toLocaleString("en-GB")}</b> cricket scorecards</span>
            <span>No sign-up</span>
          </p>
        )}
        <p className="mt-4 flex items-center gap-2.5 text-[15px] font-extrabold">
          <span className="rounded-full bg-[var(--volt)] px-2 py-0.5 text-[11px] tracking-[0.06em] text-[var(--navy)]">STEP 1 OF 2</span>
          What do you follow?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="Sports">
          {SPORT_PICKS.map((s) => {
            const on = sports.includes(s);
            const line = lines[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSport(s)}
                aria-pressed={on}
                className={`relative flex min-h-[104px] flex-col justify-between rounded-[18px] border-[1.5px] p-3.5 text-left transition duration-150 active:scale-[0.96] ${on ? "-translate-y-0.5 border-[var(--volt)] bg-[var(--volt)] text-[var(--navy)]" : "border-[var(--band-deep-line)] bg-[color-mix(in_srgb,white_6%,transparent)] text-[var(--band-deep-text)] hover:bg-[color-mix(in_srgb,white_10%,transparent)]"}`}
              >
                <span className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] ${on ? "border-[var(--navy)] bg-[var(--navy)] text-[var(--volt)]" : "border-[var(--band-deep-line)]"}`}>
                  {on && <Glyph name="check" className="h-3.5 w-3.5" />}
                </span>
                <Glyph name={s} className={`h-[30px] w-[30px] ${on ? "text-[var(--navy)]" : "text-[var(--volt)]"}`} />
                <span>
                  <span className="mt-2.5 block text-[17px] font-extrabold tracking-[-0.01em]">{SPORT_PICK_LABEL[s]}</span>
                  <span className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${on ? "text-[var(--navy)]" : "text-[var(--band-deep-muted)]"}`}>
                    {line.live > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--live)]" aria-hidden />}
                    {line.text}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={writeDeclined}
            className="flex min-h-[104px] flex-col justify-between rounded-[18px] border-[1.5px] border-dashed border-[var(--band-deep-line)] p-3.5 text-left text-[var(--band-deep-text)] transition hover:bg-[color-mix(in_srgb,white_6%,transparent)] active:scale-[0.96]"
          >
            <Glyph name="all" className="h-[30px] w-[30px] text-[var(--volt)]" />
            <span>
              <span className="mt-2.5 block text-[14.5px] font-extrabold">Just show me everything</span>
              <span className="text-[11.5px] font-semibold text-[var(--band-deep-muted)]">Pick later</span>
            </span>
          </button>
        </div>

        {sports.length > 0 && (
          <div className="mt-5">
            <p className="flex items-center gap-2.5 text-[14px] font-extrabold">
              <span className="rounded-full bg-[var(--volt)] px-2 py-0.5 text-[11px] tracking-[0.06em] text-[var(--navy)]">STEP 2</span>
              Any team or player? <span className="text-[12px] font-semibold text-[var(--band-deep-muted)]">Optional</span>
            </p>
            {sides.length > 0 && <div className="mt-2.5 flex flex-wrap gap-2">{sides.map((side) => chip(cricketSideBlock(side), side.id))}</div>}
            <label className="mt-3 block">
              <span className="sr-only">Type a team, player or competition</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a team, player or competition"
                className="h-11 w-full rounded-xl border border-[var(--band-deep-line)] bg-[color-mix(in_srgb,white_6%,transparent)] px-4 text-[14px] text-[var(--band-deep-text)] outline-none placeholder:text-[var(--band-deep-muted)] focus:border-[var(--volt)]"
              />
            </label>
            {results.length > 0 && <div className="mt-2.5 flex flex-wrap gap-2">{results.map((b) => chip(b, b.id))}</div>}
          </div>
        )}
      </div>

      <div className="sticky bottom-3 z-10 lg:top-24 lg:bottom-auto">
        <div className="rounded-[22px] bg-[var(--bg)] p-3 text-[var(--text)] shadow-[0_-6px_40px_-6px_rgba(0,0,0,0.55)] lg:p-3.5 lg:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]" aria-live="polite">
          <div className="flex items-center justify-between px-1 pb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <span>{building ? "Building your page" : "Your page, forming"}</span>
            <b className="text-[var(--sig-ink)]">{blocks.length} {blocks.length === 1 ? "block" : "blocks"}</b>
          </div>
          {building ? (
            <div role="status" className="sp-log">
              <ul>
                {building.map((label, i) => (
                  <li key={i} style={{ "--i": i } as React.CSSProperties}>
                    <i aria-hidden>✓</i>
                    {label}
                  </li>
                ))}
              </ul>
              <div className="sp-log-bar" style={{ "--t": `${buildLogMs(building.length)}ms` } as React.CSSProperties}>
                <i />
              </div>
            </div>
          ) : blocks.length === 0 ? (
            <ul className="grid gap-1.5" aria-label="Your page so far">
              <li className="flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--border)] px-2.5 py-2 text-[12.5px] font-bold text-[var(--text-faint)]">Tap a sport and watch this fill</li>
              <li className="hidden items-center gap-2.5 rounded-xl border border-dashed border-[var(--border)] px-2.5 py-2 text-[12.5px] font-bold text-[var(--text-faint)] lg:flex">Your next block</li>
            </ul>
          ) : (
            <ol className="grid gap-1.5" aria-label="Your page so far">
              {blocks.map((b, i) => (
                <li key={b.id} className={`items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12.5px] font-bold ${i < 2 ? "flex" : "hidden lg:flex"}`}>
                  <span className="w-4 text-[var(--text-faint)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{b.label}</span>
                </li>
              ))}
              {blocks.length > 2 && <li className="px-1 text-[12px] font-semibold text-[var(--text-muted)] lg:hidden">+ {blocks.length - 2} more</li>}
            </ol>
          )}
          <div className="mt-2.5 flex items-center gap-2.5">
            <button type="button" onClick={build} disabled={blocks.length === 0 || building !== null} className="h-12 shrink-0 rounded-xl bg-[var(--volt)] px-5 text-[15px] font-extrabold text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--navy)] disabled:opacity-45">
              Build my page
            </button>
            <p className="text-[11.5px] font-semibold leading-snug text-[var(--text-muted)]">
              {saveError ? "Couldn't save on this device" : sports.length === 0 ? "Pick at least one sport. Two taps, no account." : "Saved in this browser only. No sign-up."}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div
      role="region"
      aria-label="Your page"
      aria-hidden={!dock}
      className={`fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[920px] items-center gap-2.5 rounded-[18px] bg-[var(--navy-2)] py-2 pl-3.5 pr-2 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55),0_0_0_1px_var(--band-deep-line)] transition duration-300 ${dock ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
    >
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-extrabold">{sports.length ? `Your page: ${sports.map((s) => SPORT_PICK_LABEL[s]).join(", ")}${extra.length ? ` + ${extra.length} ${extra.length > 1 ? "teams" : "team"}` : ""}` : "Your page is two taps away"}</b>
        <span className="block truncate text-[11.5px] font-semibold text-[var(--band-deep-muted)]">{sports.length ? `${blocks.length} blocks · saved on this device, no account` : "Pick a sport, or build it from the top"}</span>
      </div>
      <button type="button" tabIndex={dock ? 0 : -1} onClick={buildOrPick} className="h-10 shrink-0 rounded-[11px] bg-[var(--volt)] px-4 text-[13px] font-extrabold text-[var(--navy)]">
        {sports.length ? "Build my page" : "Pick sports ↑"}
      </button>
    </div>

    {finalHost &&
      createPortal(
        <section className="band band-deep bleed relative mt-0 overflow-hidden bg-[radial-gradient(600px_300px_at_100%_0%,rgba(56,182,232,0.18),transparent_60%),radial-gradient(500px_260px_at_0%_100%,rgba(37,99,217,0.35),transparent_60%)] py-9 sm:py-12">
          <p className="eyebrow eyebrow-quiet !text-[var(--band-deep-muted)]">Two taps · no account · saved on this device</p>
          <h2 className="display mt-2 max-w-3xl text-[28px] sm:text-[40px]">
            Your sports, one page. <span className="text-[var(--volt)]">Built in ten seconds.</span>
          </h2>
          <div className="mt-4">{sportPills}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={buildOrPick} className="h-12 rounded-xl bg-[var(--volt)] px-5 text-[15px] font-extrabold text-[var(--navy)]">
              Build my page
            </button>
            <button type="button" onClick={toTop} className="h-10 rounded-xl border border-[var(--band-deep-line)] px-3.5 text-[13px] font-bold text-white">
              Back to the picker ↑
            </button>
            <span className="text-[12px] font-semibold text-[var(--band-deep-muted)]">{sports.length ? `${blocks.length} blocks so far` : "Tap a sport above, then build."}</span>
          </div>
        </section>,
        finalHost
      )}
    </>
  );
}
