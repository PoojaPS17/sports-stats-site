"use client";

import { useEffect, useId, useRef, useState } from "react";

// "Add to calendar" menu for a fixture feed. `path` is the site-relative feed path
// (/calendar/epl/arsenal). Subscribing keeps the calendar in sync; downloading is a
// one-off snapshot.
export function CalendarButton({ path, label = "Add to calendar" }: { path: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
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

  const httpsUrl = `${origin}${path}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent("ScoreDB fixtures")}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the link is still visible in the menu */
    }
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-muted)]";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4" />
        </svg>
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Subscribe (stays up to date)</p>
          <a href={webcalUrl} role="menuitem" className={item}>
            Apple Calendar / Outlook desktop
          </a>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" role="menuitem" className={item}>
            Google Calendar
          </a>
          <a href={outlookUrl} target="_blank" rel="noopener noreferrer" role="menuitem" className={item}>
            Outlook.com
          </a>
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">One-off</p>
          <a href={`${path}?download=1`} role="menuitem" className={item}>
            Download .ics file
          </a>
          <button type="button" onClick={copy} role="menuitem" className={item}>
            {copied ? "Link copied" : "Copy feed link"}
          </button>
          <p className="px-3 pb-1.5 pt-2 text-[11px] leading-snug text-[var(--text-faint)]">
            Kickoff times show in your calendar&apos;s time zone. Scores are added to event titles as games finish.
          </p>
        </div>
      )}
    </div>
  );
}
