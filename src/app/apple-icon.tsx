import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// Home-screen icon. iOS rounds the corners itself, so the tile is square here.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <PixelBall size={180} fill="#ffffff" live="#fb7185" background="#1d4ed8" backgroundRadius={0} inset={0.66} />,
    size
  );
}
