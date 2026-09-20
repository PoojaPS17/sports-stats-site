// The visitor's country as reported by the host's edge, with nothing fetched from a
// third party at request time. Cloudflare sets cf-ipcountry on sports-db.live; Vercel
// sets x-vercel-ip-country on the vercel.app review copy. Both are read, Cloudflare first.
const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country"];

// Two ASCII letters only. That leaves out Cloudflare's placeholders: "XX" (unknown,
// handled below) and "T1" (Tor) are not real countries.
const COUNTRY_CODE = /^[A-Za-z]{2}$/;

export function visitorCountry(headers: { get(name: string): string | null }): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)?.trim();
    if (!value || !COUNTRY_CODE.test(value)) continue;
    const country = value.toUpperCase();
    if (country === "XX") continue;
    return country;
  }
  return null;
}
