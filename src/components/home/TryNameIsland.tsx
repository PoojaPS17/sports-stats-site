"use client";

import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { Crest } from "./Crest";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addBlock, isSetup, newSetup, readSetup, writeSetup } from "@/lib/homeSetup";
import { isLeague, LEAGUE_LABEL } from "@/lib/leagues";
import type { SearchResult } from "@/lib/queries";
import type { TryCard } from "@/lib/tryCard";

export interface TryChip {
  league: string;
  slug: string;
  name: string;
}

// Where a search result lives. Mirrors the search page: tennis players sit under /tennis, F1 under /f1.
function resultHref(r: SearchResult): string {
  if (r.type === "series") return `/cricket/series/${r.slug}`;
  if (r.league === "f1") return r.type === "team" ? `/f1/teams/${r.slug}` : `/f1/drivers/${r.slug}`;
  if (r.league === "atp" || r.league === "wta") return `/tennis/${r.league}/players/${r.slug}`;
  return r.type === "team" ? `/${r.league}/teams/${r.slug}` : `/${r.league}/players/${r.slug}`;
}

/** A player with a card: one the player pages and the player-form block cover. Tennis and F1 people link out instead. */
function hasCard(r: SearchResult): boolean {
  return r.type === "player" && isLeague(r.league);
}

/** "Rohit Sharma" twice in one list gets the club or the competition after it, so the two can be told apart. */
export function resultLabels(results: SearchResult[]): string[] {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.name.toLowerCase(), (counts.get(r.name.toLowerCase()) ?? 0) + 1);
  return results.map((r) => {
    if ((counts.get(r.name.toLowerCase()) ?? 0) < 2) return r.name;
    const where = r.subtitle || (isLeague(r.league) ? LEAGUE_LABEL[r.league] : r.league);
    return `${r.name} (${where})`;
  });
}

function Bars({ card }: { card: TryCard }) {
  const max = Math.max(1, ...card.bars.map((b) => b.value));
  const last = card.bars.length - 1;
  return (
    <ul className="relative mb-3 mt-2 flex h-[84px] items-end gap-1.5 border-b-2 border-[var(--border)] pt-1.5" aria-label={`${card.barsCaption ?? "Recent games"}, oldest first`}>
      {card.bars.map((b, i) => (
        <li key={`${b.href}-${i}`} className="relative flex h-full min-w-0 flex-1 items-end">
          <Link
            href={b.href}
            prefetch={false}
            title={`${b.label} ${b.title}`}
            aria-label={`${b.label} ${b.title}`}
            style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
            className={`relative block min-h-1 w-full rounded-t-[7px] rounded-b-[3px] ${i === last ? "bg-[var(--sky)]" : "bg-[var(--tint-2)]"}`}
          >
            {i === last && <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-extrabold text-[var(--text)]">{b.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CardView({ card, followed, onFollow }: { card: TryCard; followed: boolean; onFollow: () => void }) {
  return (
    <article className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-card)]" data-testid="try-card" data-league={card.league} data-slug={card.slug}>
      <div className="flex items-center gap-3">
        <Crest name={card.name} color={card.teamColor} size={46} />
        <div className="min-w-0">
          <h3 className="truncate text-[18px] font-extrabold tracking-[-0.02em]">{card.name}</h3>
          <p className="truncate text-[12.5px] font-semibold text-[var(--text-muted)]">{[card.role, card.team, card.leagueLabel].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[var(--sky-tint)] px-2.5 py-1 text-[11.5px] font-extrabold text-[var(--sky-ink)]">{card.leagueShort}</span>
      </div>

      {card.stats.length > 0 && (
        <div className="my-3.5 grid grid-cols-3 gap-2">
          {card.stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-[14px] bg-[var(--bg)] px-3 py-2.5">
              <b className="block whitespace-nowrap text-[20px] font-extrabold tracking-[-0.03em] tabular-nums">{s.value}</b>
              <span className="text-[11.5px] font-semibold text-[var(--text-muted)]">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {card.statsCaption && card.stats.length > 0 && <p className="text-[11.5px] font-semibold text-[var(--text-muted)]">{card.statsCaption}</p>}
      {card.bars.length > 0 && (
        <>
          <p className="mt-2 text-xs font-bold text-[var(--text-muted)]">{card.barsCaption}</p>
          <Bars card={card} />
        </>
      )}
      {card.insight && (
        <p className="rounded-[14px] bg-[var(--surface-muted)] px-3.5 py-3 text-[14.5px] leading-[1.5]">
          {card.insight.lead}
          {card.insight.strong && <b className="font-extrabold">{card.insight.strong}</b>}
          {card.insight.tail}
        </p>
      )}
      {card.small && <p className="text-[13px] text-[var(--text-muted)]">No game-by-game figures for {card.name} in {card.leagueLabel} on this site yet. The player page has what we hold.</p>}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <Link prefetch={prefetchFor(card.href)} href={card.href} className="inline-flex items-center rounded-xl bg-[var(--sig)] px-4 py-[9px] text-[13.5px] font-extrabold text-[var(--sig-on)] shadow-[0_8px_18px_-8px_var(--sig)]">
          Full profile →
        </Link>
        {card.block && (
          <button
            type="button"
            onClick={onFollow}
            aria-pressed={followed}
            className={`inline-flex items-center rounded-full px-[13px] py-[7px] text-[12.5px] font-extrabold ${
              followed ? "bg-[var(--win-tint)] text-[var(--win)] shadow-[inset_0_0_0_1.5px_var(--win)]" : "bg-[var(--surface)] text-[var(--sig-ink)] shadow-[inset_0_0_0_1.5px_var(--sig)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            {followed ? "✓ On your page" : `+ Follow ${card.name}`}
          </button>
        )}
      </div>
      {card.note && <span className="mt-2.5 block text-[11.5px] leading-snug text-[var(--text-muted)]">{card.note}</span>}
    </article>
  );
}

// "Try a name": a search box, a few chips and a player card. The server sends the default card (the week's top
// performer) already drawn, so the section is in the HTML for everyone; typing or tapping a chip swaps the card for
// another player's, read from /api/try-card. + Follow writes the player-form block into this browser's setup, which
// is what turns the first-visit page into the visitor's own.
export function TryNameIsland({ initial, chips }: { initial: TryCard | null; chips: TryChip[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState("");
  const [card, setCard] = useState<TryCard | null>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; kept: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const latest = useRef(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearched("");
      return;
    }
    const id = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&fold=1`)
        .then((r) => r.json())
        .then((d: { results: SearchResult[] }) => {
          if (cancelled) return;
          setResults(d.results.slice(0, 6));
          setSearched(q);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearched(q);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  const show = (league: string, slug: string, name: string) => {
    const mine = ++latest.current;
    setBusy(true);
    setFailed(false);
    fetch(`/api/try-card?league=${encodeURIComponent(league)}&player=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: { card: TryCard | null }) => {
        if (mine !== latest.current) return;
        // A page we cannot read figures from still gets a card: the name and the way to the page.
        setCard(d.card ?? { league, leagueLabel: isLeague(league) ? LEAGUE_LABEL[league] : league, leagueShort: league.toUpperCase(), slug, name, href: `/${league}/players/${slug}`, team: null, teamColor: null, role: null, stats: [], statsCaption: null, barsCaption: null, bars: [], insight: null, note: null, block: null, small: true });
        setBusy(false);
      })
      .catch(() => {
        if (mine !== latest.current) return;
        setFailed(true);
        setBusy(false);
      });
  };

  const pick = (r: SearchResult) => {
    setQuery("");
    setResults([]);
    show(r.league, r.slug, r.name);
  };

  const follow = () => {
    const block = card?.block;
    if (!block) return;
    const stored = readSetup();
    const kept = writeSetup(isSetup(stored) ? addBlock(stored, block) : newSetup("blank", null, [block]));
    setFollowed((f) => new Set(f).add(block.id));
    setToast({ text: `${card.name} is on your page.`, kept });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
    // The first follow turns this page into the visitor's own: take them to where it appears.
    window.scrollTo({ top: 0 });
  };

  const labels = resultLabels(results);
  const firstCard = results.find(hasCard);
  const isFollowed = !!card?.block && followed.has(card.block.id);

  return (
    <div className="grid gap-4">
      <div className="min-w-0">
        <label className="flex h-[52px] items-center gap-2.5 rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] px-3.5 shadow-[var(--shadow-card)] focus-within:border-[var(--sig)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--sig)_20%,transparent)]">
          <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstCard) pick(firstCard);
            }}
            placeholder="Try a player"
            autoComplete="off"
            aria-label="Search for a player"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </label>

        {results.length > 0 && (
          <ul className="mt-2 grid gap-1" aria-label="Matches">
            {results.map((r, i) => {
              const row = (
                <>
                  <span className="min-w-0 truncate">{labels[i]}</span>
                  <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[11.5px] font-semibold text-[var(--text-muted)]">
                    {r.type === "series" ? "Cricket series" : isLeague(r.league) ? LEAGUE_LABEL[r.league] : r.league.toUpperCase()}
                    {hasCard(r) ? "" : " · opens the page"}
                  </span>
                </>
              );
              const cls = "flex w-full min-w-0 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left text-[13.5px] font-bold hover:bg-[var(--surface-hover)]";
              return (
                <li key={`${r.type}-${r.league}-${r.slug}`}>
                  {hasCard(r) ? (
                    <button type="button" onClick={() => pick(r)} className={cls}>
                      {row}
                    </button>
                  ) : (
                    <Link prefetch={prefetchFor(resultHref(r))} href={resultHref(r)} className={cls}>
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {searched && results.length === 0 && query.trim() === searched && <p className="mt-2 px-0.5 text-xs font-semibold text-[var(--text-muted)]">No match for &ldquo;{searched}&rdquo;. Try a surname.</p>}

        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11.5px] font-extrabold text-[var(--text-muted)]">Try:</span>
            {chips.map((c) => (
              <button
                key={`${c.league}/${c.slug}`}
                type="button"
                onClick={() => show(c.league, c.slug, c.name)}
                aria-pressed={card?.league === c.league && card?.slug === c.slug}
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--text)] aria-pressed:border-[var(--sig)] aria-pressed:bg-[var(--sig-soft)] aria-pressed:text-[var(--sig-ink)]"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`min-w-0 transition-opacity ${busy ? "opacity-60" : ""}`} aria-live="polite" aria-busy={busy}>
        {failed && <p className="mb-2 rounded-xl bg-[var(--sig-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--text)]">That card did not load. Try again in a moment.</p>}
        {card ? (
          <CardView card={card} followed={isFollowed} onFollow={follow} />
        ) : (
          <div className="rounded-[20px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-muted)]">
            Type a player&apos;s name to see their season, their last games and how they do against each side, in one card.
          </div>
        )}
      </div>

      {mounted &&
        toast &&
        createPortal(
          <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-[var(--win)] bg-[var(--surface)] px-4 py-3 text-sm font-bold text-[var(--text)] shadow-[var(--shadow-pop)]">
            <span aria-hidden className="mr-1.5 text-[var(--win)]">✓</span>
            {toast.text} {toast.kept ? "This page now opens on it." : "Saved for this visit only; this browser is not keeping it."}
          </div>,
          document.body
        )}
    </div>
  );
}
