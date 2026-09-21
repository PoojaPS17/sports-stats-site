// What a Grand Prix is called. ESPN names each race weekend with its title sponsor ("Qatar Airways Azerbaijan Grand
// Prix", "Heineken Dutch Grand Prix") and gets a few 2020-21 events wrong; the reference site uses the plain name.
// Applied wherever a race name is read for display (src/lib/f1.ts and the home card query); the stored name stays as ESPN sent it.

/** ESPN's mistaken or dated names, by event id, with the name the championship used. */
const RACE_NAME_BY_EVENT: Record<string, string> = {
  // ESPN names both Austrian Grands Prix of 2020 and 2021 alike, or calls the second one by the first's name.
  "600006840": "Styrian Grand Prix", // 2021-06-27, ESPN: "Austrian Grand Prix"
  "600001764": "Austrian Grand Prix", // 2021-07-04, ESPN: "Austrian Grand Prix 2"
  "401220848": "Styrian Grand Prix", // 2020-07-12, ESPN: "Austrian Grand Prix 2"
  "401221786": "Eifel Grand Prix", // 2020-10-11, ESPN: "Pries Der Eifel Grand Prix"
  "401220871": "70th Anniversary Grand Prix", // 2020-08-09, ESPN: "Rolex British Grand Prix 2"
  // The 2026 Bahrain Grand Prix, postponed from April 12 and rescheduled at Sepang (Malaysia) for Oct 2-4. Wikipedia's 2026 season
  // page (round 16) and Formula 1's announcement both call it the Bahrain Grand Prix and say it kept its name because Bahrain remained
  // the promoter; ESPN calls it "Gulf Air Bahrain Grand Prix in Malaysia". (ESPN's April event, cancelled, has the same name.)
  "600060990": "Bahrain Grand Prix",
  // Names the championship changed to, which ESPN still gives in its older or informal form.
  "600001774": "Mexico City Grand Prix", // 2021-11-07, ESPN: "Mexican Grand Prix"
  "600001775": "São Paulo Grand Prix", // 2021-11-14, ESPN: "Brazilian Grand Prix"
  "600014135": "Canadian Grand Prix", // 2022-06-19, ESPN: "AWS Canada Grand Prix"
  "600014144": "Singapore Grand Prix", // 2022-10-02, ESPN: "Singapore Air Singapore GP"
  "600014147": "Mexico City Grand Prix", // 2022-10-30, ESPN: "Mexico Grand Prix"
  "600014148": "São Paulo Grand Prix", // 2022-11-13, ESPN: "Heineken Brazil Grand Prix"
};

/** Title sponsors seen in ESPN's event names, 2016-2026. A new one has to be added here. */
const SPONSOR_PREFIXES = [
  "AWS Made in Italy", "AWS", "Aramco", "Crypto.com", "Etihad Airways", "Gulf Air", "Heineken", "Honda", "Lenovo", "Louis Vuitton",
  "MSC Cruises", "Mercedes-Benz", "Moët & Chandon", "Pirelli", "Qatar Airways", "Rolex", "STC", "Singapore Airlines", "Socar", "Tag Heuer", "VTB",
].sort((a, b) => b.length - a.length);

export function f1RaceName(eventId: string, espnName: string): string {
  const override = RACE_NAME_BY_EVENT[eventId];
  if (override) return override;
  for (const sponsor of SPONSOR_PREFIXES) {
    if (espnName.startsWith(`${sponsor} `) && espnName.length > sponsor.length + 1) return espnName.slice(sponsor.length + 1);
  }
  return espnName;
}
