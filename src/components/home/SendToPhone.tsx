"use client";

import { useEffect, useRef, useState } from "react";
import { encodeSetup, type HomeSetup } from "@/lib/homeSetup";

// Carries the setup to another device with no login: the setup travels inside the link
// (lib/homeSetup.ts encodeSetup) and HomeBlocks imports it on arrival. Phones get the
// share sheet; everything else copies the link and says so.
export function SendToPhone({ setup }: { setup: HomeSetup }) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const fallbackInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (fallbackUrl) fallbackInput.current?.select();
  }, [fallbackUrl]);

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
      try {
        window.prompt("Copy this link to open your homepage on another device", url);
      } catch {
        // prompt() can throw or be unavailable (some embedded/in-app browsers); always leave a
        // visible way to grab the link.
        setFallbackUrl(url);
      }
    }
  };

  if (fallbackUrl) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor="send-to-phone-link" className="text-[13px] font-bold text-[var(--mast-text)]">
          Copy this link to open your homepage on another device
        </label>
        <input
          id="send-to-phone-link"
          ref={fallbackInput}
          type="text"
          readOnly
          value={fallbackUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 rounded-lg border border-[var(--mast-line)] bg-transparent px-3.5 text-[13px] text-[var(--mast-text)]"
        />
      </div>
    );
  }

  return (
    <button type="button" onClick={send} className="inline-flex h-10 items-center rounded-lg border border-[var(--mast-line)] px-3.5 text-[13px] font-bold text-[var(--mast-text)]" aria-live="polite">
      {copied ? "Link copied" : "Send to my phone"}
    </button>
  );
}
