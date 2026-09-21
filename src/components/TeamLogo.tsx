"use client";

import { useEffect, useRef, useState } from "react";

// "Delhi Capitals Women" (shown as "Delhi Capitals-W") reads as DC, not CW: the
// women's-team suffix carries no identity.
function initials(name: string) {
  return name
    .replace(/(\s+(Women|Women's|W)|-W)$/i, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(-2)
    .toUpperCase();
}

// Also the player avatar. A stored image URL is no guarantee the image exists —
// ESPN's cricket headshot path 404s for many players (Nepal's and Bangladesh's
// batters on the ODI leaders board, for instance), and its team-logo path for
// many women's sides, which rendered as the browser's broken-image icon. On load
// failure the initials disc takes over instead. The page is server-rendered, so
// the failure usually happens before React hydrates and attaches onError; the
// effect catches that case by inspecting the image after mount.
export function TeamLogo({
  name,
  logoUrl,
  color,
  size = 32,
  priority = false,
}: {
  name: string;
  logoUrl: string | null;
  color?: string | null;
  size?: number;
  /** A logo in the page header, above the fold: loaded straight away. Every other crest waits until it is near the screen. */
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [logoUrl]);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={logoUrl}
        alt={name}
        loading={priority ? undefined : "lazy"}
        decoding={priority ? undefined : "async"}
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
