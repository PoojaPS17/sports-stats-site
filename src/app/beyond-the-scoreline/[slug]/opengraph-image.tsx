import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { getArticle, listArticles } from "@/lib/beyondTheScoreline";
import { ART_GRADIENT, articleArt, shareTitleSize } from "@/lib/articleArt";

export const alt = "Beyond the Scoreline";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

/** Width of the art panel; the scrim over it needs the number too, since satori sizes no box from `inset`. */
const PANEL = 430;

// Every article, so each has its card built with the page it belongs to. The list is five entries
// long and compiled in, not queried, so naming them all costs nothing a query would.
export function generateStaticParams() {
  return listArticles().map((a) => ({ slug: a.slug }));
}

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Every article shared the site's generic card, so five different pieces looked like one link on
 * social and in the BlogPosting `image`. This draws the article's own: its key number on the
 * sport-coloured panel the index cards already use, beside the headline.
 *
 * The text sits on a solid masthead panel rather than over the gradient — the lime and orange
 * palettes are far too light to read white type against, and a share card gets no second chance.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  const art = article ? articleArt(article) : null;
  const title = article?.title ?? "Beyond the Scoreline";
  const dek = article?.dek ?? "Original long-form sports writing from the SportsDB desk.";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0f2745", color: "#eef1f7", fontFamily: "sans-serif" }}>
        <div
          style={{
            width: PANEL,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: 48,
            background: ART_GRADIENT[art?.palette ?? "neutral"],
          }}
        >
          {/* The same navy scrim as `.art::before`: the lime, orange and sky-blue palettes are far
              too light to carry white type on their own, and the numeral sits at the bottom. */}
          <div style={{ position: "absolute", top: 0, left: 0, width: PANEL, height: size.height, background: "linear-gradient(to top, rgba(11, 19, 36, 0.62), rgba(11, 19, 36, 0) 70%)" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: art ? 150 : 64, fontWeight: 800, lineHeight: 0.85, letterSpacing: -4 }}>{art?.number ?? "SportsDB"}</div>
            {art ? <div style={{ fontSize: 24, fontWeight: 600, marginTop: 20, opacity: 0.85 }}>{art.caption}</div> : null}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 60px", gap: 20 }}>
          <div style={{ fontSize: 24, color: "#38b6e8", textTransform: "uppercase", letterSpacing: 4, fontWeight: 700 }}>{art?.sport ?? "Beyond the Scoreline"}</div>
          <div style={{ fontSize: shareTitleSize(title), fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</div>
          <div style={{ fontSize: 26, color: "#9aa5bd", lineHeight: 1.35 }}>{dek}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: "#9aa5bd", marginTop: 14 }}>
            <PixelBall size={24} fill="#ffffff" live="#c6f135" />
            <span style={{ color: "#c6f135", fontWeight: 700 }}>SportsDB</span>
            {article ? <span>· {formatPublished(article.publishedAt)} · {article.readingMinutes} min read</span> : null}
          </div>
        </div>
      </div>
    ),
    size
  );
}
