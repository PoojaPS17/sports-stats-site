"use client";

import { useEffect, useState } from "react";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LastUpdated({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelative(iso));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatRelative(iso)), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-[var(--bg)]/20 pl-4 text-xs opacity-90">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Updated {label}
    </span>
  );
}
