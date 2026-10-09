// Browser-side helpers for turning an off-screen export card into a PNG and handing it on. Used by ShareMenu;
// nothing here runs on the server. html-to-image is imported on the first call, never shipped with the page.
import { CARD } from "@/lib/exportTheme";

export interface CaptureResult {
  blob: Blob;
  /** True when the picture was made without the team crests because they would not load. */
  withoutCrests: boolean;
}

/** Resolves once the web fonts and every image inside `el` have settled (loaded or failed), so the capture is not half-drawn. */
export async function settle(el: HTMLElement): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    /* no font API: draw with what is loaded */
  }
  const pending = Array.from(el.querySelectorAll("img"))
    .filter((img) => !img.complete)
    .map((img) => new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    }));
  await Promise.race([Promise.all(pending), new Promise((resolve) => window.setTimeout(resolve, 4000))]);
}

/** Warm the capture library ahead of the click (hover, focus, first menu open). */
export function preloadCapture(): Promise<unknown> {
  return import("html-to-image");
}

/**
 * The PNG of `el` at twice its CSS size. A crest that will not load (cross-origin, blocked, 404) can fail the whole
 * export, so a failure is retried once without any images: the names and scores still tell the story, and the caller is
 * told so it can say the crests are missing.
 */
export async function captureCard(el: HTMLElement): Promise<CaptureResult> {
  const { toBlob } = await import("html-to-image");
  await settle(el);
  const options = { pixelRatio: 2, cacheBust: true, backgroundColor: CARD.bg };
  try {
    const blob = await toBlob(el, options);
    if (blob) return { blob, withoutCrests: false };
  } catch {
    /* fall through to the retry without crests */
  }
  const blob = await toBlob(el, { ...options, filter: (node) => node.nodeName !== "IMG" });
  if (!blob) throw new Error("render failed");
  return { blob, withoutCrests: true };
}

/** Saves a blob through a temporary download link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Whether this browser's share sheet can take a picture file (phones, some desktops). */
export function canShareImage(filename: string): boolean {
  try {
    const probe = new File([], `${filename}.png`, { type: "image/png" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Copies text to the clipboard; false when the browser refuses (no permission, insecure frame). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
