"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { NavChild } from "@/lib/nav";

// Desktop dropdown for a sport group (Football → Premier League / La Liga, ...).
// Opens on hover or click, closes on outside click, Escape, or choosing an entry.
export function NavDropdown({ label, items, active }: { label: string; items: NavChild[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`nav-link ${active ? "nav-link-active" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 flex min-w-[190px] flex-col gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--accent)]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
