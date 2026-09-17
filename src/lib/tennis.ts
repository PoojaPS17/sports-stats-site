import { pool } from "./db";
import type { Tour } from "./tennisTours";

export type { Tour } from "./tennisTours";
export { TOURS, TOUR_LABEL, isTour } from "./tennisTours";

export interface TennisRankingRow {
  rank: number;
  previous_rank: number | null;
  points: number | null;
  player_espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
}

export async function getTennisRankings(tour: Tour, limit = 100): Promise<TennisRankingRow[]> {
  const { rows } = await pool.query(
    `select tr.rank, tr.previous_rank, tr.points, p.espn_id as player_espn_id, p.name, p.slug, p.headshot_url
     from tennis_rankings tr
     join players p on p.league = tr.tour and p.espn_id = tr.player_espn_id
     where tr.tour = $1
     order by tr.rank asc
     limit $2`,
    [tour, limit]
  );
  return rows;
}

export interface TennisMatchRow {
  espn_id: string;
  tournament_name: string;
  round: string | null;
  date: string;
  score_display: string | null;
  completed: boolean;
  status_state: string | null;
  status_detail: string | null;
  winner_espn_id: string | null;
  player1_espn_id: string;
  player1_name: string;
  player1_slug: string;
  player1_headshot: string | null;
  player2_espn_id: string;
  player2_name: string;
  player2_slug: string;
  player2_headshot: string | null;
}

const MATCH_SELECT = `
  select m.espn_id, m.tournament_name, m.round, m.date, m.score_display, m.completed,
         m.status_state, m.status_detail, m.winner_espn_id,
         m.player1_espn_id, p1.name as player1_name, p1.slug as player1_slug, p1.headshot_url as player1_headshot,
         m.player2_espn_id, p2.name as player2_name, p2.slug as player2_slug, p2.headshot_url as player2_headshot
  from tennis_matches m
  join players p1 on p1.league = m.tour and p1.espn_id = m.player1_espn_id
  join players p2 on p2.league = m.tour and p2.espn_id = m.player2_espn_id
`;

// daysBack is wider than daysForward because, unlike team sports, a tour can go a
// week or more between tournaments — a narrow window would show a blank page during
// every gap week even though there are recent results worth displaying.
export async function getTennisMatches(tour: Tour, daysBack = 10, daysForward = 7): Promise<TennisMatchRow[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where m.tour = $1 and m.date > now() - ($2 || ' days')::interval and m.date < now() + ($3 || ' days')::interval
     order by m.date asc`,
    [tour, daysBack, daysForward]
  );
  return rows;
}

export interface TennisPlayer {
  espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
}

export async function getTennisPlayerBySlug(tour: Tour, slug: string): Promise<TennisPlayer | null> {
  const { rows } = await pool.query(`select espn_id, name, slug, headshot_url from players where league = $1 and slug = $2`, [
    tour,
    slug,
  ]);
  return rows[0] ?? null;
}

export async function getTennisPlayerMatches(tour: Tour, playerEspnId: string): Promise<TennisMatchRow[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT} where m.tour = $1 and (m.player1_espn_id = $2 or m.player2_espn_id = $2) order by m.date desc limit 50`,
    [tour, playerEspnId]
  );
  return rows;
}

export interface TennisRanking {
  rank: number;
  previous_rank: number | null;
  points: number | null;
}

export async function getTennisPlayerRanking(tour: Tour, playerEspnId: string): Promise<TennisRanking | null> {
  const { rows } = await pool.query(`select rank, previous_rank, points from tennis_rankings where tour = $1 and player_espn_id = $2`, [
    tour,
    playerEspnId,
  ]);
  return rows[0] ?? null;
}

// Every match between two specific players, either order — powers a simple
// head-to-head record on the player page.
export async function getTennisHeadToHead(tour: Tour, playerAEspnId: string, playerBEspnId: string): Promise<TennisMatchRow[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where m.tour = $1
       and ((m.player1_espn_id = $2 and m.player2_espn_id = $3) or (m.player1_espn_id = $3 and m.player2_espn_id = $2))
     order by m.date desc`,
    [tour, playerAEspnId, playerBEspnId]
  );
  return rows;
}
