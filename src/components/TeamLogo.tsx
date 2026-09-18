"use client";

import { useState } from "react";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(-2)
    .toUpperCase();
}

// Also the player avatar. A stored image URL is no guarantee the image exists —
// ESPN's cricket headshot path 404s for many players (Nepal's and Bangladesh's
// batters on the ODI leaders board, for instance), which rendered as the browser's
// broken-image icon. On load failure the initials disc takes over instead.
export function TeamLogo({
  name,
  logoUrl,
  color,
  size = 32,
}: {
  name: string;
  logoUrl: string | null;
  color?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, background: color ?? "var(--surface-muted)" }}
      className="flex shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
    >
      {initials(name)}
    </div>
  );
}
