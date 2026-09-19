"use client";

import { useRef, useState, type ReactNode } from "react";
import { toPng } from "html-to-image";
import { CARD, CARD_FONT } from "@/lib/exportTheme";

// Renders `card` off-screen at a fixed width - always the light export theme,
// regardless of the viewer's site theme or the live page's responsive layout - and
// turns it into a PNG on click. The visible page is untouched; what gets captured is
// a purpose-built template (see PlayerExportCard etc.), never the on-screen DOM, so
// labels never truncate and the image looks the same wherever it ends up shared.
export function DownloadCard({ filename, card, width = 720, compact = false }: { filename: string; card: ReactNode; width?: number; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: CARD.bg });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${filename}.png`;
      link.click();
    } catch {
      /* a blocked cross-origin asset can fail the canvas export; the page itself
         still works, so fail quietly rather than showing an error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Download as image"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {!compact && (busy ? "Saving…" : "Download")}
      </button>
      <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }} aria-hidden="true">
        <div ref={ref} style={{ width, boxSizing: "border-box", background: CARD.bg, padding: 20, fontFamily: CARD_FONT }}>
          {card}
        </div>
      </div>
    </>
  );
}
