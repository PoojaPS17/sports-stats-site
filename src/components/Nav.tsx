import Link from "next/link";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <rect x="7" y="17" width="4" height="8" rx="1.5" fill="#ffffff" />
      <rect x="14" y="11" width="4" height="14" rx="1.5" fill="#ffffff" />
      <rect x="21" y="7" width="4" height="18" rx="1.5" fill="#ffffff" />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--header-border)] bg-[var(--header-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-3">
        <Link href="/" className="mr-3 flex items-center gap-2">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight text-[var(--header-text)]">ScoreDB</span>
        </Link>
        <nav className="flex gap-1 text-sm text-[var(--header-text-muted)]">
          <Link href="/epl" className="nav-pill">
            Soccer
          </Link>
          <Link href="/nfl" className="nav-pill">
            NFL
          </Link>
          <Link href="/nba" className="nav-pill">
            NBA
          </Link>
          <Link href="/ipl" className="nav-pill">
            Cricket
          </Link>
        </nav>
        <div className="order-last flex w-full items-center gap-3 sm:order-none sm:ml-auto sm:w-auto">
          <div className="w-full sm:w-64">
            <SearchBar />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
