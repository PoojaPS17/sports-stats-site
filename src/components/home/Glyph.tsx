import type { SportPick } from "@/lib/sportPicks";

// Line-drawn glyphs, one per tile, in the same 24-unit box.
const GLYPH: Record<SportPick | "all" | "check" | "shield" | "clock" | "device" | "source", string> = {
  cricket: '<path d="M4 20.5 6.2 18.3m0 0 9.6-9.6 2.6 2.6-9.6 9.6-2.6-2.6Z"/><path d="m15.8 8.7 3-3"/><circle cx="18.2" cy="17.6" r="2.2"/>',
  football: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.8 2.8-1.4 4.4H9.6L8.2 10.3Z"/><path d="M12 3v4.5M15.8 10.3l4.4-1.4M14.4 14.7l2.7 3.8M9.6 14.7l-2.7 3.8M8.2 10.3 3.8 8.9"/>',
  nfl: '<path d="M5.2 18.8C2 15.6 3 9.4 6.2 6.2s9.4-4.2 12.6-1c3.2 3.2 2.2 9.4-1 12.6s-9.4 4.2-12.6 1Z"/><path d="m9 15 6-6M10.6 11.4l2 2M12.4 9.6l2 2"/>',
  nba: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5.4c2.6 3.4 2.6 9.8 0 13.2M18 5.4c-2.6 3.4-2.6 9.8 0 13.2"/>',
  mlb: '<circle cx="12" cy="12" r="9"/><path d="M7.4 4.4c2.2 4.4 2.2 10.8 0 15.2M16.6 4.4c-2.2 4.4-2.2 10.8 0 15.2"/><path d="M8.6 8h1.6M8.9 12h1.7M8.6 16h1.6M13.8 8h1.6M13.4 12h1.7M13.8 16h1.6"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9.2c4.6-.4 8.6 3.2 9 8.4.1 1.2 0 2.3-.3 3.3M11.4 3.1c-.2 1-.3 2.1-.2 3.2.4 5 4.4 8.6 9.4 8.3"/>',
  f1: '<path d="M5 21V3.5"/><path d="M5 4h14v9H5"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="currentColor" stroke="none"/>',
  all: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  device: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  source: '<path d="M5 5h14v14H5z"/><path d="M9 9h6M9 12h6M9 15h3"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7" stroke-width="3"/>',
};

export function Glyph({ name, className }: { name: keyof typeof GLYPH; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPH[name] }} />;
}

