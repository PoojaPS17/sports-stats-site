"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";
import { LogoMark } from "./Logo";
import { NavDropdown } from "./NavDropdown";
import { MobileMenu } from "./MobileMenu";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--header-border)] bg-[var(--mast)] text-[var(--mast-text)]">
      <div className="container-x flex h-[var(--header-h)] items-center gap-1.5">
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2.5 text-[var(--mast-text)]" aria-label="SportsDB home">
          <LogoMark size={30} />
          <span className="text-[19px] font-extrabold tracking-tight">SportsDB</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item);
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                  {item.label}
                </Link>
              );
            }
            return <NavDropdown key={item.label} label={item.label} items={item.children ?? []} picker={item.picker} active={active} />;
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 176px until the nav has room at 1280px: at a 1024px viewport the old 256px box pushed the header past the screen. */}
          <div className="hidden w-44 md:block xl:w-64">
            <SearchBar />
          </div>
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--mast-text)] transition hover:bg-[var(--header-hover-bg)] md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </Link>
          <ThemeToggle />
          <a
            href="https://x.com/sportsdblive"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow SportsDB on X"
            title="Follow us on X"
            className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] font-bold transition xl:bg-[var(--sig)] xl:text-[var(--sig-on)] xl:hover:bg-[var(--accent-hover)] xl:hover:text-white text-[var(--mast-text)] hover:bg-[var(--header-hover-bg)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
            </svg>
            <span className="hidden xl:inline">Follow</span>
          </a>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
