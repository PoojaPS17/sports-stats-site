"use client";

import { clearSetup } from "@/lib/homeSetup";

// Shown instead of the hero after "I'll decide later" (CSS keys on html[data-home="collapsed"]).
export function CollapsedBar() {
  return (
    <div className="home-collapsed-bar band bleed -mt-6 items-center justify-between gap-4 py-3">
      <p className="display text-[20px] sm:text-[24px]">Build the sports page you keep looking for.</p>
      <button type="button" onClick={clearSetup} className="btn-lift h-9 shrink-0 rounded-lg bg-[var(--sig)] px-3.5 text-[13px] font-extrabold text-[var(--sig-on)]">
        Start now
      </button>
    </div>
  );
}
