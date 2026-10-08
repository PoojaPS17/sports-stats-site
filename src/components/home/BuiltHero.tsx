"use client";

import type { CSSProperties } from "react";
import type { HomeSetup } from "@/lib/homeSetup";
import { SendToPhone } from "./SendToPhone";

// The built homepage's hero: the approved deep navy band, with a glow in each of the visitor's team colours
// (brand blue when they follow no team). The text stays white on the navy, so a pale team colour never
// touches legibility.
export function BuiltHero({ setup, headline, sub, liveCount, colours, onEdit }: { setup: HomeSetup; headline: string; sub: string; liveCount: number; colours: [string, string]; onEdit: () => void }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const glow = { "--tc": colours[0], "--tc2": colours[1] } as CSSProperties;
  return (
    <section
      style={glow}
      className="band band-deep bleed relative -mt-6 overflow-hidden bg-[radial-gradient(520px_320px_at_105%_-10%,color-mix(in_srgb,var(--tc)_30%,transparent),transparent_65%),radial-gradient(420px_260px_at_-10%_120%,color-mix(in_srgb,var(--tc2)_22%,transparent),transparent_60%)] py-8 sm:py-10"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="eyebrow eyebrow-quiet flex flex-wrap items-center gap-2 !text-[var(--band-deep-muted)]">
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pill-live-bg)] px-2 py-0.5 text-[10.5px] text-[var(--pill-live-text)]">
                <span className="live-dot bg-white" aria-hidden />
                {liveCount} live
              </span>
            )}
            Your homepage · {today} · {setup.blocks.length} blocks
          </p>
          <h1 className="display max-w-4xl text-[30px] text-white sm:text-[40px] lg:text-[50px]">{headline}</h1>
          {sub && <p className="max-w-2xl text-[15px] font-semibold text-[var(--band-deep-muted)] sm:text-[16px]">{sub}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {liveCount > 0 && (
            <a href="#block-live" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--volt)] px-3.5 text-[13px] font-extrabold text-[var(--navy)]">
              <span className="live-dot bg-[var(--navy)]" aria-hidden />Jump to live ({liveCount})
            </a>
          )}
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center rounded-lg border border-[var(--band-deep-line)] px-3.5 text-[13px] font-bold text-white">Edit blocks</button>
          <SendToPhone setup={setup} />
        </div>
      </div>
    </section>
  );
}
