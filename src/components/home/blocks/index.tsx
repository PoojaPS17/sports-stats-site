import type { ReactNode } from "react";
import type { BtsBlockData, F1DriversBlockData, HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "@/lib/blockTypes";
import type { BlockState } from "../useBlocksData";
import { LiveBlock } from "./LiveBlock";
import { TeamNextBlock } from "./TeamNextBlock";
import { StandingsBlock } from "./StandingsBlock";
import { PlayerFormBlock } from "./PlayerFormBlock";
import { F1DriversBlock } from "./F1DriversBlock";
import { BtsBlock } from "./BtsBlock";

/** The block's body for its payload; the frame handles loading, empty and error states. */
export function renderBlock(block: HomeBlock, state: BlockState | undefined): ReactNode {
  const data = state?.data;
  if (!data) return null;
  switch (block.type) {
    case "live":
      return <LiveBlock data={data as LiveBlockData} />;
    case "team-next":
      return <TeamNextBlock data={data as TeamNextBlockData} />;
    case "standings":
    case "series-standings":
      return <StandingsBlock data={data as StandingsBlockData} />;
    case "player-form":
      return <PlayerFormBlock data={data as PlayerFormBlockData} />;
    case "f1-drivers":
      return <F1DriversBlock data={data as F1DriversBlockData} />;
    case "bts":
      return <BtsBlock data={data as BtsBlockData} />;
    case "moments":
      // Drawn by MomentsMissed above the grid, never as a block of the setup.
      return null;
  }
}
