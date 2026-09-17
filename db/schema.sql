-- Sports stats tracker schema (NBA + NFL). Postgres, works locally or on Supabase.

create table if not exists teams (
  league text not null,
  espn_id text not null,
  name text not null,
  slug text not null,
  abbreviation text,
  logo_url text,
  color text,
  alternate_color text,
  primary key (league, espn_id),
  unique (league, slug)
);

alter table teams add column if not exists color text;
-- Team background info ("About" page) — venue and head coach, sourced from ESPN's
-- core API (venue is a stable franchise fact; coach can change season to season, so
-- this is refreshed alongside the daily roster fetch, not backfilled once and left).
-- Not available for IPL: cricket's team-level endpoints 404 for this competition,
-- same limitation as /teams and /roster.
alter table teams add column if not exists venue_name text;
alter table teams add column if not exists venue_city text;
alter table teams add column if not exists venue_state text;
alter table teams add column if not exists venue_country text;
alter table teams add column if not exists head_coach text;
alter table teams add column if not exists alternate_color text;

create table if not exists players (
  league text not null,
  espn_id text not null,
  team_espn_id text,
  name text not null,
  slug text not null,
  position text,
  headshot_url text,
  jersey text,
  height text,
  weight text,
  age int,
  is_captain boolean,
  is_wicketkeeper boolean,
  primary key (league, espn_id),
  unique (league, slug)
);

alter table players add column if not exists jersey text;
alter table players add column if not exists height text;
alter table players add column if not exists weight text;
alter table players add column if not exists age int;
alter table players add column if not exists is_captain boolean;
alter table players add column if not exists is_wicketkeeper boolean;

create table if not exists games (
  league text not null,
  espn_id text not null,
  date timestamptz not null,
  name text not null,
  short_name text,
  home_team_espn_id text not null,
  away_team_espn_id text not null,
  home_score int,
  away_score int,
  home_score_display text,
  away_score_display text,
  home_winner boolean,
  away_winner boolean,
  season_year int,
  status_state text,
  status_detail text,
  status_summary text,
  round text,
  period int,
  clock text,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (league, espn_id)
);

alter table games add column if not exists home_score_display text;
alter table games add column if not exists away_score_display text;
alter table games add column if not exists season_year int;
alter table games add column if not exists status_summary text;
alter table games add column if not exists home_winner boolean;
-- The stage of the match (e.g. cricket's "Qualifier 1"/"Eliminator"/"Final", parsed
-- from ESPN's `description` field) — without this, every completed game rendered a
-- generic "Final" status pill, which is correct broadcast terminology for NBA/NFL/EPL
-- but misleading for IPL, where "Final" is also a specific, single playoff match.
alter table games add column if not exists round text;
alter table games add column if not exists away_winner boolean;
-- Match venue, currently only populated for IPL (powers cricket career "by venue"
-- splits) — sourced from the summary endpoint's gameInfo.venue during the cricket
-- player-stats backfill, not from the regular scores scrape.
alter table games add column if not exists venue text;
-- Odds/broadcast/weather all arrive embedded in the same scoreboard response the
-- regular scrape already fetches every 15 minutes — previously discarded. Odds are a
-- single provider's line (whichever ESPN lists first, usually DraftKings) rather than
-- every book's, since this is display context for readers, not a betting product.
alter table games add column if not exists odds_details text;
alter table games add column if not exists odds_spread numeric;
alter table games add column if not exists odds_over_under numeric;
alter table games add column if not exists odds_provider text;
alter table games add column if not exists broadcast_network text;
alter table games add column if not exists weather_display text;
alter table games add column if not exists weather_temperature int;

create index if not exists games_league_date_idx on games (league, date);
create index if not exists games_league_season_idx on games (league, season_year);

create table if not exists player_game_stats (
  league text not null,
  game_espn_id text not null,
  player_espn_id text not null,
  team_espn_id text,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (league, game_espn_id, player_espn_id)
);

create table if not exists player_season_stats (
  league text not null,
  season int not null,
  player_espn_id text not null,
  team_espn_id text,
  categories jsonb not null default '{}'::jsonb,
  pts_avg numeric,
  reb_avg numeric,
  ast_avg numeric,
  passing_yards int,
  rushing_yards int,
  receiving_yards int,
  updated_at timestamptz not null default now(),
  primary key (league, season, player_espn_id)
);

-- Season-total goals/assists for soccer, extracted from categories the same way
-- pts_avg/passing_yards/etc already are — powers the Leaders page.
alter table player_season_stats add column if not exists goals int;
alter table player_season_stats add column if not exists assists int;

create index if not exists player_season_stats_pts_idx on player_season_stats (league, season, pts_avg desc nulls last);
create index if not exists player_season_stats_reb_idx on player_season_stats (league, season, reb_avg desc nulls last);
create index if not exists player_season_stats_ast_idx on player_season_stats (league, season, ast_avg desc nulls last);
create index if not exists player_season_stats_pass_idx on player_season_stats (league, season, passing_yards desc nulls last);
create index if not exists player_season_stats_rush_idx on player_season_stats (league, season, rushing_yards desc nulls last);
create index if not exists player_season_stats_recv_idx on player_season_stats (league, season, receiving_yards desc nulls last);
create index if not exists player_season_stats_goals_idx on player_season_stats (league, season, goals desc nulls last);
create index if not exists player_season_stats_assists_idx on player_season_stats (league, season, assists desc nulls last);

create table if not exists news_articles (
  league text not null,
  article_id text not null,
  headline text not null,
  description text,
  image_url text,
  link text,
  published timestamptz,
  primary key (league, article_id)
);

create index if not exists news_articles_league_published_idx on news_articles (league, published desc);

create table if not exists standings (
  league text not null,
  season int not null,
  team_espn_id text not null,
  conference text,
  wins int,
  losses int,
  win_percent numeric,
  streak text,
  playoff_seed int,
  games_behind text,
  draws int,
  points int,
  goals_for int,
  goals_against int,
  no_result int,
  net_run_rate numeric,
  updated_at timestamptz not null default now(),
  primary key (league, season, team_espn_id)
);

alter table standings add column if not exists draws int;
alter table standings add column if not exists points int;
alter table standings add column if not exists goals_for int;
alter table standings add column if not exists goals_against int;
alter table standings add column if not exists no_result int;
alter table standings add column if not exists net_run_rate numeric;

-- One row per real page view of a match-detail page, recorded client-side (see
-- src/app/api/track-view) so it reflects actual visits rather than server-render
-- count (which ISR caching would undercount). Powers "Top Games" — genuinely
-- popularity-ranked, the same way an App Store chart is built from real usage, not a
-- fabricated or editorial score. Starts empty for a new site; becomes meaningful once
-- there's real traffic.
create table if not exists game_views (
  id bigserial primary key,
  league text not null,
  game_espn_id text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists game_views_lookup_idx on game_views (league, game_espn_id, viewed_at desc);
create index if not exists game_views_time_idx on game_views (viewed_at desc);

-- Country: from Vercel's edge-injected geolocation header (real visitor IP geolocation
-- — null locally/off-Vercel, which is an honest gap, not a bug). Platform: parsed from
-- the request's own User-Agent (iOS/Android/Desktop), not fetched from any app store.
alter table game_views add column if not exists country text;
alter table game_views add column if not exists platform text;
create index if not exists game_views_country_idx on game_views (country, viewed_at desc);
create index if not exists game_views_platform_idx on game_views (platform, viewed_at desc);

-- Tennis doesn't fit the team-vs-team schema everything else uses — matches are
-- player-vs-player (not two teams), scored in sets, and there's no season-long
-- standings table, just a weekly ranking ladder. Kept as its own small, parallel
-- schema rather than forced into `games`/`teams`. Player identity itself does reuse
-- the existing `players` table (tour: 'atp'/'wta' as the league value, no team_espn_id).
create table if not exists tennis_matches (
  tour text not null,
  espn_id text not null,
  tournament_name text not null,
  round text,
  date timestamptz not null,
  player1_espn_id text not null,
  player2_espn_id text not null,
  score_display text,
  winner_espn_id text,
  completed boolean not null default false,
  status_state text,
  status_detail text,
  updated_at timestamptz not null default now(),
  primary key (tour, espn_id)
);

create index if not exists tennis_matches_date_idx on tennis_matches (tour, date desc);
create index if not exists tennis_matches_player1_idx on tennis_matches (tour, player1_espn_id, date desc);
create index if not exists tennis_matches_player2_idx on tennis_matches (tour, player2_espn_id, date desc);

-- Current ranking only (not a weekly history) — keyed by player, so each fetch just
-- overwrites a player's rank with this week's.
create table if not exists tennis_rankings (
  tour text not null,
  player_espn_id text not null,
  rank int not null,
  previous_rank int,
  points numeric,
  updated_at timestamptz not null default now(),
  primary key (tour, player_espn_id)
);

create index if not exists tennis_rankings_rank_idx on tennis_rankings (tour, rank);

-- Real external trending signals (Wikipedia pageview spikes, Apple App Store Sports
-- app charts) to complement game_views, which only tells us what's popular on ScoreDB
-- itself. Each fetch script wipes and re-inserts its own (source, country) slice, so
-- a row's mere presence means "still trending as of the last fetch" — no separate
-- expiry logic needed. A Google Trends daily-searches source was tried and dropped:
-- only 10 general-topic items/day/country meant most countries were sports-empty
-- most days, with no working category filter to narrow the pool (a category=sports
-- param looked promising but was confirmed to be silently ignored).
create table if not exists trending_topics (
  id bigserial primary key,
  source text not null, -- 'wikipedia' | 'app_store_ios'
  country text not null, -- 'global' or an ISO-3166-1 alpha-2 code
  rank int not null,
  label text not null,
  detail text,
  url text not null,
  image_url text,
  matched_league text, -- our own League/Tour value, when this topic maps to a tracked player/team
  matched_type text, -- 'player' | 'team', paired with matched_league/matched_slug
  matched_slug text,
  fetched_at timestamptz not null default now()
);

create index if not exists trending_topics_lookup_idx on trending_topics (source, country, rank);

-- NFL/NBA/EPL/La Liga injury reports — ESPN's own /injuries endpoint, one call per
-- league covering every team at once. Cricket has no equivalent (404s, same gap as
-- its /teams and /roster endpoints); soccer's endpoint responds but has come back
-- consistently empty in testing, so its rows may just never populate — that's the
-- endpoint being sparse, not a bug in the fetch script. Replaced wholesale on every
-- fetch (delete-then-insert per league) rather than upserted, since a player who's
-- no longer listed has recovered and should simply disappear, not linger as stale.
create table if not exists injuries (
  id bigserial primary key,
  league text not null,
  team_espn_id text not null,
  player_espn_id text not null,
  player_name text not null,
  status text not null, -- 'Questionable' | 'Doubtful' | 'Out' | etc., ESPN's own wording
  short_comment text,
  long_comment text,
  reported_date timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists injuries_team_idx on injuries (league, team_espn_id);
