import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// The brand PNG that the Organization structured data points at (lib/structuredData.ts).
// Generated from the mark's own geometry so it can never drift from the header.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <PixelBall size={512} fill="#ffffff" live="#c6f135" background="#0b1324" backgroundRadius={0.2} inset={0.66} />,
    { width: 512, height: 512 }
  );
}
