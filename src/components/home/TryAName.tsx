import { SectionHeader } from "@/components/SectionHeader";
import { getTryDefaults } from "@/lib/tryCardLoader";
import { TryNameIsland } from "./TryNameIsland";

// Module 4 of the first-visit page: search any player and get a card. The default card and the chips come from the
// stored data (the week's top performers, lib/tryCardLoader.ts) and are the same HTML for everyone, so they stay under
// the page's revalidate and are crawlable; the swap on a search is client-side. Shown only to a visitor with no saved
// setup: `home-firstvisit` is hidden under html[data-home="built"|"collapsed"] (globals.css).
export async function TryAName() {
  const defaults = await getTryDefaults();
  return (
    <section className="home-firstvisit" data-module="try-a-name">
      <SectionHeader description="Any player. What the site holds on them, in one tap.">Try a name</SectionHeader>
      <TryNameIsland initial={defaults?.card ?? null} chips={defaults?.suggestions.chips ?? []} />
    </section>
  );
}
