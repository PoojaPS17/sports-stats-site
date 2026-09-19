"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, isPathActive } from "@/lib/nav";
import { SearchBar } from "./SearchBar";
import { CricketSeriesPicker } from "./CricketSeriesPicker";

// Hamburger button + full-width drawer for small screens. Groups with children render
// as an always-open section (a two-level accordion adds taps for very little gain
// when the whole list is only ~12 links).
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close whenever navigation happens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--header-text)] transition hover:bg-[var(--header-hover-bg)] lg:hidden"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="mobile-menu"
          // Positioned against the sticky header itself (not the viewport): the header's
          // backdrop-blur makes it the containing block for fixed descendants, so a
          // `fixed` drawer would collapse to zero height.
          className="absolute inset-x-0 top-full z-40 h-[calc(100dvh-var(--header-h))] overflow-y-auto border-t border-[var(--header-border)] bg-[var(--bg)] lg:hidden"
        >
          <div className="container-x flex flex-col gap-6 py-5">
            <SearchBar />
            <nav className="grid grid-cols-2 gap-x-6 gap-y-3">
              {NAV_ITEMS.map((item) => {
                const groupActive = isNavItemActive(pathname, item);
                if (item.href) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`col-span-2 rounded-lg px-1 py-1 text-base font-semibold ${
                        groupActive ? "text-[var(--accent)]" : "text-[var(--text)]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                }
                return (
                  <div key={item.label} className="col-span-2 flex flex-col gap-1">
                    <p className="px-1 text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">{item.label}</p>
                    {item.picker === "cricket-series" && (
                      <div className="px-1 pb-1">
                        <CricketSeriesPicker />
                      </div>
                    )}
                    <ul className="flex flex-col">
                      {(item.children ?? []).map((c) => {
                        const active = isPathActive(pathname, c.href);
                        return (
                          <li key={c.href}>
                            <Link
                              href={c.href}
                              className={`block rounded-lg px-1 py-1.5 text-base font-semibold ${
                                active ? "text-[var(--accent)]" : "text-[var(--text)]"
                              }`}
                            >
                              {c.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
