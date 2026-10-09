"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { canShareImage, captureCard, copyText, preloadCapture, saveBlob, type CaptureResult } from "@/lib/shareImage";

/** One choice in the menu's picker: a size for the result card, or which part of the scorecard. */
export interface ShareVariant {
  id: string;
  label: string;
  /** Card width in CSS pixels; the picture is twice this. */
  width: number;
  /** A fixed height (portrait, story). Without one the card is as tall as its content. */
  height?: number;
  /** Added to the file name ("portrait" gives 123-result-portrait.png). */
  suffix?: string;
}

export interface ShareMenuProps {
  /** The section's name, for the button's accessible name and the picture's analytics: "Scorecard", "Playing XI". */
  section: string;
  /** Picture file name without the extension. */
  filename: string;
  /** Title handed to the share sheet. */
  shareTitle: string;
  /** Text that travels with the picture: the score, the result and the match link, no hashtags. */
  caption: string;
  /** Absolute address of the match page, for Copy link. */
  link: string;
  /** League slug for the GA4 share_card event. */
  league: string;
  /** The card for one variant; called only after the first click or hover. Must render a [data-share-card] root. */
  card: (variantId: string) => ReactNode;
  variants: ShareVariant[];
  /** Heading of the picker ("Size", "Show"). Hidden when there is a single variant. */
  variantLabel?: string;
  /** Plain text for Copy as text, per variant; omit for sections that are not text-friendly. */
  text?: (variantId: string) => string | null;
  /** Starts fetching the lazy card module on hover or focus. */
  preload?: () => Promise<unknown>;
  /** "deep" sits on the navy hero band. */
  tone?: "page" | "deep";
}

type Busy = "share" | "download" | "text" | null;
interface Note {
  text: string;
  /** Text to select for a manual copy when the clipboard refused. */
  select?: string;
}
interface Pos {
  top: number;
  right: number;
  maxHeight: number;
}

const MENU_W = 248;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}
const ShareIcon = () => (
  <Icon>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const SpinIcon = () => (
  <Icon>
    <path d="M12 3a9 9 0 1 0 9 9" className="motion-safe:origin-center motion-safe:animate-spin" />
  </Icon>
);
const DownloadIcon = () => (
  <Icon>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);
const TextIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Icon>
);
const LinkIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </Icon>
);

const itemClass =
  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] font-semibold text-[var(--text)] outline-none transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--sig-ink)] focus-visible:bg-[var(--surface-muted)] focus-visible:text-[var(--sig-ink)] disabled:opacity-60";

/**
 * The one share control every match section uses: a quiet outline "Share" button on the heading row that opens a small
 * menu (Share image, Download image, Copy as text, Copy link, and a picker for the card's size or scope). The menu is
 * fixed-positioned, so opening it moves nothing and a collapsed card's overflow cannot clip it. The card is mounted only
 * after the first hover or click, and the picture is made as soon as the menu opens so Share is instant.
 */
export function ShareMenu({ section, filename, shareTitle, caption, link, league, card, variants, variantLabel = "Size", text, preload, tone = "page" }: ShareMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const cache = useRef(new Map<string, Promise<CaptureResult>>());
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  // The picked id, kept only while the section still offers it (the scorecard's "this innings" id follows the open tab).
  const [picked, setPicked] = useState<string | null>(null);
  const variant = variants.find((v) => v.id === picked)?.id ?? variants[0]?.id ?? "";
  const [busy, setBusy] = useState<Busy>(null);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const current = variants.find((v) => v.id === variant) ?? variants[0];
  const fileName = `${filename}${current?.suffix ? `-${current.suffix}` : ""}`;
  const variantRef = useRef(variant);
  useLayoutEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  const arm = useCallback(() => {
    setArmed(true);
    void (preload?.() ?? Promise.resolve()).catch(() => {});
    void preloadCapture().catch(() => {});
  }, [preload]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = menuRef.current?.offsetHeight ?? 260;
    const flip = below < wanted && above > below;
    const room = flip ? above : below;
    setPos({
      top: flip ? Math.max(8, r.top - 6 - Math.min(wanted, room)) : r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
      maxHeight: Math.max(160, room - 6),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place, note]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Outside press closes, as does Escape (handled on the menu and the trigger).
  useEffect(() => {
    if (!open && !note) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
      setNote(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, note]);

  // Focus the first control when the menu opens. The menu stays visibility:hidden until the layout effect above has
  // placed it, and a hidden element cannot take focus, so the first open waits for `placed` (later opens reuse the
  // last position and are visible at once).
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemradio"]')?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!note) return;
    if (note.select) {
      noteInput.current?.select();
      return;
    }
    // A plain note says its piece and goes.
    const gone = window.setTimeout(() => setNote(null), 7000);
    return () => window.clearTimeout(gone);
  }, [note]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function flash(label: string) {
    setDone(label);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 2200);
  }
  function track(action: string) {
    window.gtag?.("event", "share_card", { league, format: section.toLowerCase().replace(/\s+/g, "_"), action });
  }

  /** The picture for the selected variant, made once and kept until the variant changes. */
  const picture = useCallback((): Promise<CaptureResult> => {
    const id = variantRef.current;
    const hit = cache.current.get(id);
    if (hit) return hit;
    const made = (async () => {
      const started = Date.now();
      let node: HTMLElement | null = null;
      while (Date.now() - started < 8000) {
        const c = cardRef.current;
        if (c && c.dataset.variant === id && c.querySelector("[data-share-card]")) {
          node = c;
          break;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (!node) throw new Error("card did not mount");
      return captureCard(node);
    })();
    made.catch(() => cache.current.delete(id));
    cache.current.set(id, made);
    return made;
  }, []);

  function openMenu() {
    arm();
    setNote(null);
    setOpen(true);
    // Start the picture now: by the time a choice is made it is usually ready.
    void picture().catch(() => {});
  }

  function pickVariant(id: string) {
    setPicked(id);
    variantRef.current = id;
    // The card swaps size on the next paint; start its picture then.
    window.requestAnimationFrame(() => void picture().catch(() => {}));
  }

  const crestNote = "Team crests couldn't load, so the picture has names only.";
  const failNote = () => (text?.(variantRef.current) ? "Couldn't make the picture here. Copy as text works instead." : "Couldn't make the picture here. Copy link still works.");

  async function doShare() {
    close(true);
    setBusy("share");
    try {
      const { blob, withoutCrests } = await picture();
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (canShareImage(fileName)) {
        try {
          await navigator.share({ files: [file], title: shareTitle, text: caption });
          track("share");
          flash("Shared");
          if (withoutCrests) setNote({ text: crestNote });
        } catch (e) {
          if ((e as DOMException).name !== "AbortError") {
            saveBlob(blob, fileName);
            track("download");
            flash("Saved");
            setNote({ text: "Sharing isn't available here, so the picture was saved instead." });
          }
        }
      } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        track("copy");
        flash("Image copied");
        setNote({ text: withoutCrests ? `Copied. ${crestNote}` : "Image copied. Paste it into X, WhatsApp or any chat." });
      } else {
        saveBlob(blob, fileName);
        track("download");
        flash("Saved");
      }
    } catch {
      setNote({ text: failNote() });
    } finally {
      setBusy(null);
    }
  }

  async function doDownload() {
    close(true);
    setBusy("download");
    try {
      const { blob, withoutCrests } = await picture();
      saveBlob(blob, fileName);
      track("download");
      flash("Saved");
      if (withoutCrests) setNote({ text: crestNote });
    } catch {
      setNote({ text: failNote() });
    } finally {
      setBusy(null);
    }
  }

  async function doText() {
    const value = text?.(variantRef.current);
    close(true);
    if (!value) return;
    setBusy("text");
    if (await copyText(value)) {
      track("copy_text");
      flash("Copied");
    } else {
      track("copy_text");
      setNote({ text: "Your browser blocked the clipboard. The text is selected: copy it from here.", select: value });
    }
    setBusy(null);
  }

  async function doLink() {
    close(true);
    if (await copyText(link)) {
      track("copy_link");
      flash("Link copied");
    } else {
      setNote({ text: "Your browser blocked the clipboard. The link is selected: copy it from here.", select: link });
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled),[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  }

  const tonal =
    tone === "deep"
      ? "border-[var(--mast-line)] text-inherit hover:border-[var(--sig)] hover:text-[var(--sig)]"
      : "border-[var(--border-strong)] text-[var(--text)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]";
  const status = busy ? "Preparing…" : done;
  const textValue = text?.(variant) ?? null;
  const fixedHeight = current?.height;

  return (
    <div className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Share ${section}`}
        onPointerEnter={arm}
        onFocus={arm}
        onPointerDown={arm}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu();
          } else if (e.key === "Escape" && open) {
            close(true);
          }
        }}
        className={`btn-lift inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border bg-transparent px-2.5 text-[13px] font-bold sm:px-3 ${tonal}`}
      >
        {busy ? <SpinIcon /> : done ? <CheckIcon /> : <ShareIcon />}
        <span className="max-sm:hidden text-left" data-share-label>
          {status ?? "Share"}
        </span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status ?? ""}
      </span>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Share ${section}`}
          onKeyDown={onMenuKey}
          style={{ position: "fixed", top: pos?.top ?? -9999, right: pos?.right ?? 8, width: MENU_W, maxWidth: "calc(100vw - 16px)", maxHeight: pos?.maxHeight, overflowY: "auto", visibility: pos ? "visible" : "hidden" }}
          className="z-50 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 text-[var(--text)] shadow-[var(--shadow-pop)]"
        >
          {variants.length > 1 && (
            <div role="group" aria-label={variantLabel} className="mb-1 border-b border-[var(--border)] pb-1.5">
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{variantLabel}</p>
              <div className="flex gap-1 px-1">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={v.id === variant}
                    onClick={() => pickVariant(v.id)}
                    className={`min-h-10 flex-1 rounded-lg border px-1.5 text-[13px] font-bold outline-none transition-colors focus-visible:border-[var(--sig-ink)] ${v.id === variant ? "border-[var(--sig-ink)] bg-[var(--sig-soft)] text-[var(--sig-ink)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" role="menuitem" className={itemClass} onClick={doShare}>
            <ShareIcon />
            Share image
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={doDownload}>
            <DownloadIcon />
            Download image
          </button>
          {textValue && (
            <button type="button" role="menuitem" className={itemClass} onClick={doText}>
              <TextIcon />
              Copy as text
            </button>
          )}
          <button type="button" role="menuitem" className={itemClass} onClick={doLink}>
            <LinkIcon />
            Copy link
          </button>
        </div>
      )}

      {note && !open && (
        <div
          role="status"
          style={{ position: "fixed", top: pos?.top ?? 8, right: pos?.right ?? 8, width: 280, maxWidth: "calc(100vw - 16px)" }}
          className="z-50 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[13px] leading-snug text-[var(--text)] shadow-[var(--shadow-pop)]"
        >
          <p>{note.text}</p>
          {note.select && <textarea ref={noteInput} readOnly value={note.select} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[12px] text-[var(--text)]" />}
          <button type="button" onClick={() => setNote(null)} className="mt-2 text-[12px] font-bold text-[var(--sig-ink)] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {armed && (
        <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }} aria-hidden="true">
          <div
            key={variant}
            ref={cardRef}
            data-variant={variant}
            style={{ width: current?.width, height: fixedHeight, boxSizing: "border-box", background: CARD.bg, padding: fixedHeight ? 0 : 20, fontFamily: CARD_FONT, overflow: fixedHeight ? "hidden" : undefined }}
          >
            {card(variant)}
          </div>
        </div>
      )}
    </div>
  );
}
