"use client";

import { useState } from "react";
import Link from "next/link";
import { TOURS, TOUR_LABEL } from "@/lib/tennisTours";

export function TennisDropdown() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="nav-pill flex items-center gap-1" aria-expanded={open}>
        Tennis
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-full z-20 mt-1.5 flex min-w-[160px] flex-col gap-0.5 p-1.5">
            {TOURS.map((tour) => (
              <Link
                key={tour}
                href={`/tennis/${tour}`}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--accent)]"
              >
                {TOUR_LABEL[tour]}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
