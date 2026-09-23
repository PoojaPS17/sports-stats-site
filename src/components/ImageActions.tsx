"use client";

import { useRef, useState, type ReactNode } from "react";
import { CARD, CARD_FONT } from "@/lib/exportTheme";

type Busy = "share" | "download" | null;

const pill =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// "Share image" + "Download image" for one data section. `card` is rendered off-screen
// at a fixed width in the light export theme and captured from there - never the live,
// responsive DOM - so labels never truncate and the picture looks the same wherever it
// ends up. Share hands the PNG to the native share sheet where the browser supports
// files (phones), copies the image to the clipboard on desktop, and saves it otherwise.
export function ImageActions({ filename, card, imageUrl, width = 720, shareTitle }: { filename: string; card?: ReactNode; imageUrl?: string; width?: number; shareTitle: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [copied, setCopied] = useState(false);

  const render = async (): Promise<Blob> => {
    if (imageUrl) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error("render failed");
      return res.blob();
    }
    // Loaded on the first click rather than shipped with every page that has a share button.
    const { toBlob } = await import("html-to-image");
    const blob = ref.current ? await toBlob(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: CARD.bg }) : null;
    if (!blob) throw new Error("render failed");
    return blob;
  };

  function save(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function download() {
    if (busy) return;
    setBusy("download");
    try {
      save(await render());
    } catch {
      /* a blocked cross-origin asset can fail the canvas export; the page still works */
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (busy) return;
    setBusy("share");
    try {
      const probe = new File([], `${filename}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [probe] })) {
        const blob = await render();
        try {
          await navigator.share({ files: [new File([blob], `${filename}.png`, { type: "image/png" })], title: shareTitle });
        } catch (e) {
          if ((e as DOMException).name !== "AbortError") save(blob);
        }
      } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Passing the pending render keeps the click's permission alive in Safari.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": render() })]);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } else {
        save(await render());
      }
    } catch {
      /* clipboard or share refused: nothing was sent, and Download image is right beside it */
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Image options">
        <button type="button" onClick={share} disabled={busy !== null} className={pill}>
          {copied ? (
            <Icon>
              <path d="M20 6 9 17l-5-5" />
            </Icon>
          ) : (
            <Icon>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
            </Icon>
          )}
          {copied ? "Image copied" : busy === "share" ? "Preparing…" : "Share image"}
        </button>
        <button type="button" onClick={download} disabled={busy !== null} className={pill}>
          <Icon>
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </Icon>
          {busy === "download" ? "Saving…" : "Download image"}
        </button>
        {copied && <span className="text-xs text-[var(--text-muted)]">Paste it into X, WhatsApp or any chat.</span>}
      </div>
      {card && (
        <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }} aria-hidden="true">
          <div ref={ref} style={{ width, boxSizing: "border-box", background: CARD.bg, padding: 20, fontFamily: CARD_FONT }}>
            {card}
          </div>
        </div>
      )}
    </>
  );
}
