// One-shot: announce every URL the site publishes to IndexNow, so Bing (and Yandex,
// Seznam, Naver) can start from the full inventory instead of discovering 130k pages a
// crawl at a time. Google does not take part, so this does nothing for Search Console.
//
// This is a bootstrap, not a routine. Running it repeatedly re-announces pages that have
// not changed, which is exactly what gets a site throttled -- day to day, fetch-fixtures
// announces the fixtures it actually created.
//
//   npx tsx scripts/indexnow-bootstrap.ts --dry-run          # count what would be sent
//   npx tsx scripts/indexnow-bootstrap.ts                    # send it
//   npx tsx scripts/indexnow-bootstrap.ts --file urls.txt    # send exactly these instead
//
// --file takes one URL per line and skips the sitemaps entirely. It exists so an
// interrupted bootstrap can be finished by announcing only what never arrived, rather
// than re-announcing the whole site.
import { INDEXNOW_KEY, INDEXNOW_ORIGIN, indexNowBatches, submitToIndexNow } from "../src/lib/indexnow";

const UA = "sportsdb-indexnow-bootstrap";

async function xml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

const locs = (body: string): string[] => [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fileArg = process.argv.indexOf("--file");
  const listFile = fileArg >= 0 ? process.argv[fileArg + 1] : null;
  if (fileArg >= 0 && !listFile) {
    console.error("[indexnow] --file needs a path to a file of URLs, one per line");
    process.exit(1);
  }

  // The key has to be readable at its published address before anything is submitted,
  // or every batch is refused and the site looks like it is claiming a host it does not own.
  const keyUrl = `${INDEXNOW_ORIGIN}/${INDEXNOW_KEY}.txt`;
  const keyRes = await fetch(keyUrl, { headers: { "User-Agent": UA } });
  const served = keyRes.ok ? (await keyRes.text()).trim() : null;
  if (served !== INDEXNOW_KEY) {
    console.error(`[indexnow] ${keyUrl} does not serve the key (status ${keyRes.status}, body ${JSON.stringify(served)?.slice(0, 40)}).`);
    console.error("[indexnow] deploy the key file first -- until it is live every submission is refused.");
    process.exit(1);
  }
  console.log(`[indexnow] key verified at ${keyUrl}`);

  const urls: string[] = [];
  if (listFile) {
    const { readFileSync } = await import("node:fs");
    urls.push(...readFileSync(listFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
    console.log(`[indexnow] ${urls.length} URLs read from ${listFile}`);
  } else {
    const maps = locs(await xml(`${INDEXNOW_ORIGIN}/sitemap.xml`));
    console.log(`[indexnow] ${maps.length} sitemaps listed`);
    for (const map of maps) {
      try {
        urls.push(...locs(await xml(map)));
      } catch (err) {
        console.error(`[indexnow] skipped ${map}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const batches = indexNowBatches(urls);
  console.log(`[indexnow] ${urls.length} URLs -> ${batches.length} request(s) of up to 10,000`);
  if (dryRun) {
    console.log("[indexnow] dry run, nothing sent");
    return;
  }

  const { submitted, failed, refusals } = await submitToIndexNow(urls);
  console.log(`[indexnow] announced ${submitted} of ${urls.length} URLs`);
  if (failed) {
    // The endpoint throttles a burst; the submission already paced and retried, so a
    // refusal that survived that is worth seeing rather than counting.
    console.error(`[indexnow] ${failed} request(s) refused after retries: ${refusals.join(", ")}`);
    console.error("[indexnow] re-run later to announce the URLs those requests carried");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[indexnow] failed:", err);
  process.exit(1);
});
