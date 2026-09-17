"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ large = false, initialQuery = "" }: { large?: boolean; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative flex w-full items-center">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className={`pointer-events-none absolute text-[var(--text-faint)] ${large ? "left-4" : "left-3"}`}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        aria-label="Search teams and players"
        placeholder={large ? "Search a team or player, like Lakers or Haaland" : "Search teams, players"}
        className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] ${
          large ? "py-3 pl-11 pr-24 text-base" : "py-2 pl-9 pr-3 text-sm"
        }`}
      />
      {large && (
        <button
          type="submit"
          className="absolute right-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
        >
          Search
        </button>
      )}
    </form>
  );
}
