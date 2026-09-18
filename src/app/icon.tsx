import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// Browser-tab icon: the mark on its blue tile so it stays legible at 16px on
// any tab-strip colour.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <PixelBall size={64} fill="#ffffff" live="#fb7185" background="#1d4ed8" backgroundRadius={0.22} inset={0.72} />,
    size
  );
}
