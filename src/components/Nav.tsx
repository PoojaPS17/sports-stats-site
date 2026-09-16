import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ScoreDB
        </Link>
        <nav className="flex gap-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          <Link href="/nba" className="hover:text-neutral-950 dark:hover:text-white">
            NBA
          </Link>
          <Link href="/nfl" className="hover:text-neutral-950 dark:hover:text-white">
            NFL
          </Link>
        </nav>
      </div>
    </header>
  );
}
