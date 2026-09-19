"use client";

import { useEffect, useId, useRef, useState } from "react";
import { absoluteUrl } from "@/lib/site";

// Share this page: the native share sheet where available (most mobile browsers),
// falling back to a small menu of social links + copy-link everywhere else (desktop
// browsers largely don't implement navigator.share).
export function ShareButton({ path, title, text, compact = false }: { path: string; title: string; text?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const url = absoluteUrl(path);
  const shareText = text ?? title;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the link is still visible via the address bar */
    }
  }

  async function onClick() {
    if (canNativeShare) {
      try {
        await navigator.share({ title, text: shareText, url });
      } catch {
        /* user cancelled the share sheet - nothing to do */
      }
      return;
    }
    setOpen((v) => !v);
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-muted)]";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={canNativeShare ? undefined : open}
        aria-haspopup={canNativeShare ? undefined : "menu"}
        aria-controls={canNativeShare ? undefined : menuId}
        title="Share"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
        </svg>
        {!compact && "Share"}
      </button>
      {open && !canNativeShare && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]"
        >
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={item}
          >
            Share on X
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={item}
          >
            Share on Facebook
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={item}
          >
            Share on WhatsApp
          </a>
          <button type="button" onClick={copy} role="menuitem" className={item}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
