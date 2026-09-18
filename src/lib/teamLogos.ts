// ESPN team-logo paths that return 404 (checked 2026-09-18): mostly women's sides,
// whose card and table rows otherwise render the browser's broken-image glyph before
// the client-side fallback in TeamLogo can take over. Where the nation or franchise
// has a men's side with a logo, that logo stands in (the same crest or flag); the
// rest are blanked so the initials disc renders straight from the server. Applied
// wherever a logo URL is stored or read from an ESPN feed (team upserts, the series
// scraper and the live cricket overlay). Teams ESPN adds later fall back client-side.
const STAND_IN: Record<string, string> = {
  "774": "https://a.espncdn.com/i/teamlogos/cricket/500/13.png",
  "2234": "https://a.espncdn.com/i/teamlogos/cricket/500/29.png",
  "2280": "https://a.espncdn.com/i/teamlogos/cricket/500/32.png",
  "2410": "https://a.espncdn.com/i/teamlogos/cricket/500/15.png",
  "3454": "https://a.espncdn.com/i/teamlogos/cricket/500/30.png",
  "260133": "https://a.espncdn.com/i/teamlogos/cricket/500/19.png",
  "262723": "https://a.espncdn.com/i/teamlogos/cricket/500/17.png",
  "271866": "https://a.espncdn.com/i/teamlogos/cricket/500/9.png",
  "299039": "https://a.espncdn.com/i/teamlogos/cricket/500/27.png",
  "299043": "https://a.espncdn.com/i/teamlogos/cricket/500/33.png",
  "299045": "https://a.espncdn.com/i/teamlogos/cricket/500/70.png",
  "299047": "https://a.espncdn.com/i/teamlogos/cricket/500/23.png",
  "312282": "https://a.espncdn.com/i/teamlogos/cricket/500/20.png",
  "405379": "https://a.espncdn.com/i/teamlogos/cricket/500/11.png",
  "417083": "https://a.espncdn.com/i/teamlogos/cricket/500/136.png",
  "545926": "https://a.espncdn.com/i/teamlogos/cricket/500/122.png",
  "545928": "https://a.espncdn.com/i/teamlogos/cricket/500/28.png",
  "1090871": "https://a.espncdn.com/i/teamlogos/cricket/500/165.png",
  "1185203": "https://a.espncdn.com/i/teamlogos/cricket/500/218211.png",
  "1185205": "https://a.espncdn.com/i/teamlogos/cricket/500/1043.png",
  "1193661": "https://a.espncdn.com/i/teamlogos/cricket/500/124.png",
  "1272384": "https://a.espncdn.com/i/teamlogos/cricket/500/31.png",
  "1275073": "https://a.espncdn.com/i/teamlogos/cricket/500/153.png",
  "1275088": "https://a.espncdn.com/i/teamlogos/cricket/500/300710.png",
  "1279391": "https://a.espncdn.com/i/teamlogos/cricket/500/42.png",
  "1306375": "https://a.espncdn.com/i/teamlogos/cricket/500/57.png",
  "1306376": "https://a.espncdn.com/i/teamlogos/cricket/500/103.png",
  "1307853": "https://a.espncdn.com/i/teamlogos/cricket/500/84.png",
  "1310204": "https://a.espncdn.com/i/teamlogos/cricket/500/149.png",
  "1328835": "https://a.espncdn.com/i/teamlogos/cricket/500/45.png",
  "1328836": "https://a.espncdn.com/i/teamlogos/cricket/500/137.png",
  "1330792": "https://a.espncdn.com/i/teamlogos/cricket/500/86.png",
  "1330793": "https://a.espncdn.com/i/teamlogos/cricket/500/891143.png",
  "1339534": "https://a.espncdn.com/i/teamlogos/cricket/500/96.png",
  "1358720": "https://a.espncdn.com/i/teamlogos/cricket/500/335978.png",
  "1358721": "https://a.espncdn.com/i/teamlogos/cricket/500/335975.png",
  "1358723": "https://a.espncdn.com/i/teamlogos/cricket/500/335970.png",
  "1368815": "https://a.espncdn.com/i/teamlogos/cricket/500/78.png",
  "1368823": "https://a.espncdn.com/i/teamlogos/cricket/500/18.png",
  "1394786": "https://a.espncdn.com/i/teamlogos/cricket/500/71.png",
  "1395043": "https://a.espncdn.com/i/teamlogos/cricket/500/110.png",
  "1437218": "https://a.espncdn.com/i/teamlogos/cricket/500/75.png",
  "1438082": "https://a.espncdn.com/i/teamlogos/cricket/500/72.png",
  "1438086": "https://a.espncdn.com/i/teamlogos/cricket/500/74.png",
  "1445474": "https://a.espncdn.com/i/teamlogos/cricket/500/80.png",
  "1454933": "https://a.espncdn.com/i/teamlogos/cricket/500/63.png",
  "1478397": "https://a.espncdn.com/i/teamlogos/cricket/500/134.png",
  "1483797": "https://a.espncdn.com/i/teamlogos/cricket/500/154.png",
  "1528310": "https://a.espncdn.com/i/teamlogos/cricket/500/48.png",
};

const MISSING = new Set<string>(["206", "217", "418", "476", "532", "571", "600", "630", "907", "930", "1032", "1061", "1072", "1122", "1136", "1196", "1339", "1369", "1379", "1433", "1473", "1813", "2467", "2480", "2488", "2522", "2530", "2546", "2576", "2586", "2608", "3162", "3226", "3281", "3367", "239715", "297077", "315817", "386877", "386905", "510260", "560851", "594743", "594744", "638243", "938823", "1228924", "1235197", "1235198", "1244936", "1244937", "1244938", "1244940", "1244942", "1244943", "1244982", "1275089", "1302514", "1302515", "1302516", "1302517", "1323139", "1323140", "1323141", "1333987", "1333988", "1333989", "1333991", "1334886", "1334887", "1334890", "1338476", "1353663", "1354064", "1358722", "1358724", "1379667", "1399051", "1416774", "1422552", "1460988", "1468736", "1506241", "1506242", "1534721", "1540212"]);

export function resolveTeamLogo(teamId: string | number | null | undefined, logo: string | null | undefined): string | null {
  const id = teamId == null ? "" : String(teamId);
  if (id in STAND_IN) return STAND_IN[id];
  if (MISSING.has(id)) return null;
  return logo ?? null;
}
