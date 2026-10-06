"use client";

import type { HomeSetup } from "@/lib/homeSetup";
import { SendToPhone } from "./SendToPhone";

export function BuiltHero({ setup, headline, sub, liveCount, onEdit }: { setup: HomeSetup; headline: string; sub: string; liveCount: number; onEdit: () => void }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="band band-hero bleed -mt-6 py-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Your homepage · {today} · {setup.blocks.length} blocks</p>
          <h1 className="display max-w-4xl text-[30px] sm:text-[40px] lg:text-[50px]">{headline}</h1>
          {sub && <p className="max-w-2xl text-[15px] text-[var(--mast-muted)] sm:text-[16px]">{sub}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {liveCount > 0 && (
            <a href="#block-live" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--sig)] px-3.5 text-[13px] font-extrabold text-[var(--sig-on)]">
              <span className="live-dot bg-[var(--sig-on)]" aria-hidden />Jump to live ({liveCount})
            </a>
          )}
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center rounded-lg border border-[var(--mast-line)] px-3.5 text-[13px] font-bold text-[var(--mast-text)]">Edit blocks</button>
          <SendToPhone setup={setup} />
        </div>
      </div>
    </section>
  );
}
