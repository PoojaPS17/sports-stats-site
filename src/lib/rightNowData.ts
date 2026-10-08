// What the "Right now" card draws: the featured match (rightNow.ts) and, for a chase in progress, the match story
// read the way the match page reads it (ESPN's ball-by-ball through deriveMatchStory and matchStoryModel).
import { getHomeData } from "./homeData";
import { deriveMatchStory, fetchCricketBallByBall } from "./cricketBalls";
import { pickRightNow, storyView, type RightNowView } from "./rightNow";

/** How long the home render waits for the ball-by-ball before it draws the card without the chart. */
const STORY_WAIT_MS = 2500;

/**
 * The card's view. A chase reads the ball-by-ball for its chart, last over and rates, with the same fetcher and
 * windows as the match page (10 seconds live); if ESPN is slow or fails the card still draws, from the score text
 * alone, without the chart.
 */
export async function getRightNow(): Promise<RightNowView> {
  const home = await getHomeData();
  const pick = pickRightNow(home);
  if (!pick.story || !pick.chase) return { pick, worm: null, lastBalls: null, overNumber: null };

  const balls = await Promise.race([
    fetchCricketBallByBall(pick.story.eventId, pick.story.seriesId, { settled: false }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), STORY_WAIT_MS)),
  ]);
  if (!balls) return { pick, worm: null, lastBalls: null, overNumber: null };
  const story = deriveMatchStory(balls);
  const last = story.at(-1);
  // The story is the match page's own source, so its rates are what that page prints; take them when the story is
  // at the same score as the feed's header (a story cached a few seconds behind does not rewrite the rates).
  if (last && last.total.runs === pick.chase.runs) {
    pick.chase = {
      ...pick.chase,
      currentRate: last.runRate ?? pick.chase.currentRate,
      requiredRate: last.requiredRunRate ?? pick.chase.requiredRate,
    };
  }
  return { pick, ...storyView(story) };
}
