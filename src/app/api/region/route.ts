// Tells the cookie banner whether this visitor is somewhere that requires consent
// before analytics cookies are set. The country comes from the host's edge header
// (Cloudflare, or Vercel on the review copy); nothing is stored. With no usable
// header (local development, or a country the edge could not place) the answer is
// the cautious one.
import { CONSENT_REGIONS } from "@/lib/consent";
import { visitorCountry } from "@/lib/country";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const country = visitorCountry(request.headers);
  const consentRequired = !country || CONSENT_REGIONS.includes(country);
  return Response.json({ consentRequired }, { headers: { "Cache-Control": "private, no-store" } });
}
