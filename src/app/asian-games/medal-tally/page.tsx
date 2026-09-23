import { pageMeta } from "@/lib/metadata";
import { getMedalTallyEditions, getMedalTally } from "@/lib/asianGamesMedals";
import { CURRENT_EDITION_YEAR } from "@/lib/asianGamesEditions";
import { AsianGamesEditionSelect } from "@/components/AsianGamesEditionSelect";
import { AdSlot } from "@/components/AdSlot";

export const metadata = pageMeta("Asian Games Medal Tally", "Gold, silver and bronze medal counts for every Asian Games edition, 1951-2026.", "/asian-games/medal-tally");

export const revalidate = 300;

export default async function AsianGamesMedalTallyPage({ searchParams }: { searchParams: Promise<{ edition?: string }> }) {
  const { edition: editionParam } = await searchParams;
  const editions = await getMedalTallyEditions();
  const defaultEdition = editions.includes(CURRENT_EDITION_YEAR) ? CURRENT_EDITION_YEAR : (editions[0] ?? CURRENT_EDITION_YEAR);
  const activeEdition = editionParam && editions.includes(Number(editionParam)) ? Number(editionParam) : defaultEdition;

  const rows = await getMedalTally(activeEdition);
  const sourceUrl = rows[0]?.source_url ?? `https://en.wikipedia.org/wiki/${activeEdition}_Asian_Games_medal_table`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Asian Games Medal Tally</h1>
        {editions.length > 1 && <AsianGamesEditionSelect editions={editions} defaultEdition={defaultEdition} />}
      </div>

      <AdSlot label="Asian Games medal tally top" />

      {rows.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No {activeEdition} medal data on record.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="table-head text-left">
                <th className="py-2 pl-4 font-medium">#</th>
                <th className="py-2 font-medium">Nation</th>
                <th className="py-2 text-right font-medium">Gold</th>
                <th className="py-2 text-right font-medium">Silver</th>
                <th className="py-2 text-right font-medium">Bronze</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nation_slug} className="table-row">
                  <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{r.rank}</td>
                  <td className="py-2 font-medium">{r.nation_name}</td>
                  <td className="py-2 text-right tabular-nums">{r.gold}</td>
                  <td className="py-2 text-right tabular-nums">{r.silver}</td>
                  <td className="py-2 text-right tabular-nums">{r.bronze}</td>
                  <td className="py-2 pr-4 text-right font-bold tabular-nums">{r.gold + r.silver + r.bronze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Medal data from Wikipedia&apos;s{" "}
        <a href={sourceUrl} className="underline" target="_blank" rel="noopener noreferrer">
          &quot;{activeEdition} Asian Games medal table&quot;
        </a>
        , used under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline" target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
    </div>
  );
}
