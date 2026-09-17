import type { Metadata } from "next";

// Small helper so every page ships a distinct <title> and description (the root
// layout's title template appends " | ScoreDB").
export function pageMeta(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description, siteName: "ScoreDB", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
