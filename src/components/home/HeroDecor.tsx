// Background shapes for the built-page hero (the first-visit hero and closing band carry their own, .pick-deco and .pk-final): a soft
// sky glow, a pale disc, two diagonal pills and a solid sky dot, copied from the approved homepage
// design (Palettes board, `.deco`). Pure CSS (see `.home-decor` in globals.css): no script, no image, static, behind the content
// (z-index -1 inside the band's own stacking context), never reacts to the pointer.
export function HeroDecor({ variant = "built" }: { variant?: "built" }) {
  return (
    <span className={`home-decor home-decor-${variant}`} aria-hidden="true">
      <i className="hd-glow" />
      <i className="hd-disc" />
      <i className="hd-bar hd-bar-a" />
      <i className="hd-bar hd-bar-b" />
      <i className="hd-dot" />
    </span>
  );
}
