import type { SportLines } from "./SportPicker";
import { HomeExplainersView } from "./HomeExplainersView";
import { getExplainerExamples, getNewestResult } from "@/lib/homeExplainersData";

// Modules 8 to 11 of the first-visit page (see HomeExplainersView for what they say). The reads are cached and fail soft.
export async function HomeExplainers({ lines }: { lines: SportLines }) {
  const [examples, newest] = await Promise.all([getExplainerExamples(), getNewestResult()]);
  return <HomeExplainersView lines={lines} examples={examples} newest={newest} />;
}
