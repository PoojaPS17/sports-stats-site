"use client";

import { useEffect, useRef, useState } from "react";
import { usableImageUrl } from "@/lib/imageUrl";

// A remote photo (headshot, flag, article image) that swaps to an empty disc/box of the same size and
// classes when the image is missing, instead of the browser's broken-image glyph. Being a client
// component also keeps the image out of the server's resource hints: a server-rendered <img> makes
// every page that prefetches this one request (and 404 on) its images before any fallback can run.
// The page is server-rendered, so the failure can happen before hydration attaches onError; the
// effect catches that by inspecting the image after mount (same approach as TeamLogo).
export function SafeImg({
  src,
  alt = "",
  className,
  width,
  height,
  style,
  title,
  loading = "lazy",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  title?: string;
  loading?: "lazy" | "eager";
}) {
  const url = usableImageUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedUrl(url);
  }, [url]);
  if (!url || failedUrl === url) {
    return <span className={`${className ?? ""} inline-block bg-[var(--surface-muted)]`} style={style} title={title} aria-hidden="true" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={url}
      alt={alt}
      title={title}
      width={width}
      height={height}
      style={style}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailedUrl(url)}
    />
  );
}
