import { colourForWhiteText } from "@/lib/teamColor";

/** The team's initials on its own colour, as the palettes artifact draws a crest (no image: a stored logo may be missing). */
function initials(name: string): string {
  return name
    .replace(/(\s+(Women|Women's|W)|-W)$/i, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function Crest({ name, color, size = 34 }: { name: string; color?: string | null; size?: number }) {
  return (
    <span className="crest" aria-hidden style={{ background: colourForWhiteText(color, "#0f2745"), width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.32)), borderRadius: Math.round(size * 0.32) }}>
      {initials(name)}
    </span>
  );
}
