// Tells the cookie banner whether this visitor is somewhere that requires consent
// before analytics cookies are set. The country comes from the host's edge header;
// nothing is stored. With no header (local development) the answer is the cautious one.
import { CONSENT_REGIONS } from "@/lib/consent";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const country = request.headers.get("x-vercel-ip-country");
  const consentRequired = !country || CONSENT_REGIONS.includes(country.toUpperCase());
  return Response.json({ consentRequired }, { headers: { "Cache-Control": "private, no-store" } });
}
