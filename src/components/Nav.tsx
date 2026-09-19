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
    <header className="sticky top-0 z-30 border-b border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur">
      <div className="container-x flex h-[var(--header-h)] items-center gap-2">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2" aria-label="SportsDB home">
          <LogoMark size={28} />
          <span className="text-[17px] font-extrabold tracking-tight text-[var(--header-text)]">SportsDB</span>
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

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-64 md:block">
            <SearchBar />
          </div>
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--header-text)] transition hover:bg-[var(--header-hover-bg)] md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </Link>
          <a
            href="https://x.com/sportsdblive"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow SportsDB on X"
            title="Follow us on X"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--header-text)] transition hover:bg-[var(--header-hover-bg)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
            </svg>
          </a>
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
