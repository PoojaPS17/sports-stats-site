"use client";

import { useEffect, useRef, useState } from "react";
import { encodeSetup, type HomeSetup } from "@/lib/homeSetup";

// Carries the setup to another device with no login: the setup travels inside the link
// (lib/homeSetup.ts encodeSetup) and HomeBlocks imports it on arrival. Phones get the
// share sheet; everything else copies the link and says so.
export function SendToPhone({ setup }: { setup: HomeSetup }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const send = async () => {
    const url = `${window.location.origin}/?setup=${encodeSetup(setup)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My SportsDB homepage", url });
        return;
      } catch {
        /* the visitor closed the sheet: fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to open your homepage on another device", url);
    }
  };
  return (
    <button type="button" onClick={send} className="inline-flex h-10 items-center rounded-lg border border-[var(--mast-line)] px-3.5 text-[13px] font-bold text-[var(--mast-text)]" aria-live="polite">
      {copied ? "Link copied" : "Send to my phone"}
    </button>
  );
}
