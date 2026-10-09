"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cricketSideBlock, editionFor, type Edition, type EditionContext } from "@/lib/editions";
import { followsToBlocks } from "@/lib/followBlocks";
import { getFollows } from "@/lib/follow";
import type { HomeBlock } from "@/lib/blockTypes";
import { MAX_BLOCKS, newSetup, readSetup, SETUP_EVENT, writeDeclined, writeSetup } from "@/lib/homeSetup";
import { blocksForSports, isSportPick, PICKED_BLOCKS_EVENT, PICKED_EVENT, PICK_FOLLOW_EVENT, PICK_TOGGLE_EVENT, SPORT_PICK_LABEL, SPORT_PICKS, type SportPick } from "@/lib/sportPicks";
import type { SiteCounts } from "@/lib/siteCounts";
import type { PopularFollow } from "@/lib/popularFollows";
import { Crest } from "./Crest";
import { Glyph } from "./Glyph";
import { buildLogMs, startSteps } from "@/lib/makeItYours";

/** What the server knows about each tile: how many are live now, or what the sport covers. */
export type SportLines = Record<SportPick, { live: number; text: string }>;

// The first-visit hero: seven big sport tiles, an optional second step for a team or player, and a
// tray that shows the page forming as the visitor taps. One button writes the setup. A visitor who
// already has a setup, or who chose "just show me everything", never sees it (the pre-paint script in
// app/layout.tsx hides the section, and this component renders nothing once the stored setup exists).
export function SportPicker({ ctx, lines, liveNow, counts, popular }: { ctx: EditionContext; lines: SportLines; liveNow: number; counts: SiteCounts | null; popular: Partial<Record<SportPick, PopularFollow[]>> }) {
  const [hidden, setHidden] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [edition, setEdition] = useState<Edition>(editionFor(null));
  const [sports, setSports] = useState<SportPick[]>([]);
  const [extra, setExtra] = useState<HomeBlock[]>([]);
  const [saveError, setSaveError] = useState(false);
  // The lines of the build log while the page forms: the blocks about to be saved, nothing else.
  const [building, setBuilding] = useState<string[] | null>(null);
  const buildTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (buildTimer.current !== null) window.clearTimeout(buildTimer.current);
  }, []);
  const bandRef = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  // A short bump on the dock whenever a pick is added from elsewhere on the page (a Start-here card, a Follow).
  const pulse = () => {
    const el = dockRef.current;
    if (!el) return;
    el.classList.remove("sp-bump");
    void el.offsetWidth;
    el.classList.add("sp-bump");
  };
  const extraRef = useRef<HomeBlock[]>([]);
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

  // The "Start here" cards further down the page toggle a sport here and read back which are picked.
  useEffect(() => {
    const onToggle = (e: Event) => {
      const sport = (e as CustomEvent<unknown>).detail;
      if (typeof sport === "string" && isSportPick(sport)) {
        setSports((list) => (list.includes(sport) ? list.filter((x) => x !== sport) : [...list, sport]));
        pulse();
      }
    };
    // "+ Follow" on a card: the sport, and the team or player when the card names one. A second tap on a followed team or
    // player takes it off again (the sport stays); a sport-only card toggles the sport.
    const onFollow = (e: Event) => {
      const d = (e as CustomEvent<{ sport?: unknown; block?: HomeBlock | null }>).detail;
      if (!d || typeof d.sport !== "string" || !isSportPick(d.sport)) return;
      const sport = d.sport;
      const block = d.block && typeof d.block.id === "string" && typeof d.block.label === "string" ? d.block : null;
      if (!block) {
        setSports((list) => (list.includes(sport) ? list.filter((x) => x !== sport) : [...list, sport]));
      } else if (extraRef.current.some((x) => x.id === block.id)) {
        setExtra((list) => list.filter((x) => x.id !== block.id));
      } else {
        if (extraRef.current.length >= MAX_BLOCKS - 2) return;
        setExtra((list) => (list.length >= MAX_BLOCKS - 2 || list.some((x) => x.id === block.id) ? list : [...list, block]));
        setSports((list) => (list.includes(sport) ? list : [...list, sport]));
      }
      pulse();
    };
    window.addEventListener(PICK_TOGGLE_EVENT, onToggle);
    window.addEventListener(PICK_FOLLOW_EVENT, onFollow);
    return () => {
      window.removeEventListener(PICK_TOGGLE_EVENT, onToggle);
      window.removeEventListener(PICK_FOLLOW_EVENT, onFollow);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PICKED_EVENT, { detail: sports }));
  }, [sports]);
  useEffect(() => {
    extraRef.current = extra;
    window.dispatchEvent(new CustomEvent(PICKED_BLOCKS_EVENT, { detail: extra.map((b) => b.id) }));
  }, [extra]);

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
  const sides = sports.includes("cricket") ? ctx.cricketSides.slice(0, 5) : [];
  // Step 2 chips: the cricket sides with play coming up, then the top of each picked sport's stored table.
  const chips: { block: HomeBlock; name: string; color: string | null }[] = [
    ...sides.map((side) => ({ block: cricketSideBlock(side), name: side.name, color: null })),
    ...SPORT_PICKS.filter((sp) => sports.includes(sp)).flatMap((sp) => popular[sp] ?? []),
  ];
  const picks = sports.length + extra.length;

  const chip = (c: { block: HomeBlock; name: string; color: string | null }) => {
    const on = chosen.has(c.block.id);
    return (
      <button key={c.block.id} type="button" onClick={() => toggleExtra(c.block)} aria-pressed={on} className="pk-chip">
        <Crest name={c.name} color={c.color} size={24} />
        {c.name}
      </button>
    );
  };

  return (
    <>
    <div ref={bandRef} className="pk-in">
      <div className="pk-main">
        <p className="pk-eyebrow">Live scores, tables and stats · pick yours</p>
        <h1 className="pk-h1">
          Live scores and stats, <em>built around what you follow.</em>
        </h1>
        <p className="pk-proof" aria-label="What the site holds">
          {liveNow > 0 && (
            <span>
              <span className="live-dot" aria-hidden />
              <b>{liveNow}</b> in play
            </span>
          )}
          {counts && (
            <>
              <span><b>{counts.playerPages.toLocaleString("en-GB")}</b> player pages</span>
              <span><b>{counts.cricketScorecards.toLocaleString("en-GB")}</b> cricket scorecards</span>
            </>
          )}
          <span>No sign-up</span>
        </p>
        <p className="pk-q">
          <span className="pk-stp">STEP 1 OF 2</span>What do you follow?
        </p>
        <div className="pk-tiles" role="group" aria-label="Sports">
          {SPORT_PICKS.map((s) => {
            const on = sports.includes(s);
            const line = lines[s];
            return (
              <button key={s} type="button" onClick={() => toggleSport(s)} aria-pressed={on} className="pk-tile">
                <span className="pk-ck" aria-hidden>
                  <Glyph name="check" />
                </span>
                <span className="pk-ib">
                  <Glyph name={s} />
                </span>
                <span className="pk-tx">
                  <b>{SPORT_PICK_LABEL[s]}</b>
                  <span className="pk-l">
                    {line.live > 0 && <span className="live-dot pk-dot" aria-hidden />}
                    {line.text}
                  </span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={writeDeclined} className="pk-tile">
            <span className="pk-ib">
              <Glyph name="all" />
            </span>
            <span className="pk-tx">
              <b>Everything</b>
              <span className="pk-l">Pick later</span>
            </span>
          </button>
        </div>

        {sports.length > 0 && chips.length > 0 && (
          <div className="pk-teamq">
            <p>
              <span className="pk-stp">STEP 2</span>Any team or player? <small>Optional</small>
            </p>
            <div className="pk-tchips">{chips.map(chip)}</div>
          </div>
        )}
      </div>

      <div className="pk-trayw">
        <div className="pk-tray" aria-live="polite">
          <div className="pk-ph">
            <span>{building ? "Building your page" : "Your page, forming"}</span>
            <b>{picks} {picks === 1 ? "pick" : "picks"}</b>
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
          ) : picks > 0 ? (
            <ul className="pk-rows" aria-label="Your page so far">
              {SPORT_PICKS.filter((sp) => sports.includes(sp)).map((sp) => (
                <li key={sp}>
                  <span className="pk-ib">
                    <Glyph name={sp} />
                  </span>
                  <div>
                    <b>{SPORT_PICK_LABEL[sp]}</b>
                    <span>{lines[sp].live > 0 ? "Live games first" : "Fixtures, tables, leaders"}</span>
                  </div>
                </li>
              ))}
              {extra.map((b) => (
                <li key={b.id}>
                  <Crest name={b.label.replace(/: next three$|: last five$/, "")} color={chips.find((c) => c.block.id === b.id)?.color ?? null} size={30} />
                  <div>
                    <b>{b.label.replace(/: next three$|: last five$/, "")}</b>
                    <span>Form, position, next game</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pk-empty">Tap a sport and it appears here.</div>
          )}
          <button type="button" onClick={build} disabled={blocks.length === 0 || building !== null} className="pk-btn">
            Build my page
          </button>
          {picks > 0 && !building && (
            <button type="button" className="pk-clear" onClick={() => { setSports([]); setExtra([]); }}>
              Clear my picks
            </button>
          )}
          <small className="pk-note">{saveError ? "Couldn't save on this device" : sports.length === 0 ? "Pick at least one sport" : "Saved on this device. No account."}</small>
        </div>
      </div>
    </div>

    <div ref={dockRef} role="region" aria-label="Your page" aria-hidden={!dock} className={`pk-dock ${dock ? "is-on" : ""}`}>
      <div className="pk-dock-tx">
        <b>{sports.length ? `Your page: ${sports.map((s) => SPORT_PICK_LABEL[s]).join(", ")}${extra.length ? ` + ${extra.length} ${extra.length > 1 ? "teams" : "team"}` : ""}` : "Your page is two taps away"}</b>
        <span>{sports.length ? "Saved on this device" : "Pick a sport, or build it from the top"}</span>
      </div>
      <div className="pk-minis" role="group" aria-label="Sports">
        {SPORT_PICKS.map((sp) => (
          <button key={sp} type="button" tabIndex={dock ? 0 : -1} onClick={() => toggleSport(sp)} aria-pressed={sports.includes(sp)} title={SPORT_PICK_LABEL[sp]}>
            <Glyph name={sp} />
            {SPORT_PICK_LABEL[sp]}
          </button>
        ))}
      </div>
      <button type="button" tabIndex={dock ? 0 : -1} onClick={buildOrPick} className="pk-btn pk-btn-sm">
        {sports.length ? "Build my page" : "Pick sports ↑"}
      </button>
    </div>

    {finalHost &&
      createPortal(
        <section className="pk-final bleed">
          <div className="pk-final-in">
            <p className="pk-final-eyebrow">Two taps · no account · saved on this device</p>
            <h2>
              Your sports, one page. <em>Built in ten seconds.</em>
            </h2>
            <div className="pk-minis pk-minis-final" role="group" aria-label="Sports">
              {SPORT_PICKS.map((sp) => (
                <button key={sp} type="button" onClick={() => toggleSport(sp)} aria-pressed={sports.includes(sp)}>
                  <Glyph name={sp} />
                  {SPORT_PICK_LABEL[sp]}
                </button>
              ))}
            </div>
            <div className="pk-final-row">
              <button type="button" onClick={buildOrPick} className="pk-btn pk-btn-final">
                Build my page
              </button>
              <button type="button" onClick={toTop} className="pk-back">
                Back to the picker ↑
              </button>
            </div>
          </div>
        </section>,
        finalHost
      )}
    </>
  );
}
