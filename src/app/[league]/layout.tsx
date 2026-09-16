import { notFound } from "next/navigation";
import { isLeague, LEAGUES } from "@/lib/queries";

export function generateStaticParams() {
  return LEAGUES.map((league) => ({ league }));
}

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  if (!isLeague(league)) notFound();
  return children;
}
