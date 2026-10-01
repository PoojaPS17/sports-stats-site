"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockPayload, BlockResponse, HomeBlock } from "@/lib/blockTypes";

export type BlockState = { status: "loading" | "ok" | "empty" | "error"; data: BlockPayload | null };

const RETRY_MS = 5000;
const LIVE_REFRESH_MS = 30000;

export function blockUrl(block: HomeBlock): string {
  const qs = new URLSearchParams(block.params).toString();
  return `/api/block/${block.type}${qs ? `?${qs}` : ""}`;
}

/** Fetches every block of the setup once, retries a failure once after five seconds, keeps the last
 * good payload through later failures, and refreshes live blocks every 30 seconds while the tab is visible. */
export function useBlocksData(blocks: HomeBlock[]): Record<string, BlockState> {
  const [states, setStates] = useState<Record<string, BlockState>>({});
  const blocksRef = useRef(blocks);

  // Keeps the latest `blocks` available to the effects below without making them re-run on
  // every render where the array is re-created with the same ids (see the `ids` effect).
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const load = useCallback(async function load(block: HomeBlock, retry: boolean) {
    try {
      const res = await fetch(blockUrl(block));
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as BlockResponse;
      setStates((s) => ({ ...s, [block.id]: { status: body.block ? "ok" : "empty", data: body.block } }));
    } catch {
      setStates((s) => {
        const prev = s[block.id];
        return { ...s, [block.id]: { status: prev?.data ? "ok" : "error", data: prev?.data ?? null } };
      });
      if (retry) window.setTimeout(() => load(block, false), RETRY_MS);
    }
  }, []);

  const ids = blocks.map((b) => b.id).join("|");
  useEffect(() => {
    for (const block of blocksRef.current) {
      setStates((s) => (s[block.id] ? s : { ...s, [block.id]: { status: "loading", data: null } }));
      load(block, true);
    }
  }, [ids, load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      for (const block of blocksRef.current) if (block.type === "live") load(block, false);
    };
    const id = window.setInterval(tick, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return states;
}
