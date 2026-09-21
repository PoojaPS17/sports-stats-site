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
-- The slug a row had before accents were handled properly (see slugify); the page
-- redirects it permanently to the current slug so old links keep working.
alter table players add column if not exists legacy_slug text;
-- When the roster fetch last listed this player on team_espn_id. Players who left
-- keep their last team (box scores from 2017 created many of them) — the current
-- squad is whoever was seen in the team's latest roster fetch.
alter table players add column if not exists roster_seen_at timestamptz;
create index if not exists players_legacy_slug_idx on players (league, legacy_slug) where legacy_slug is not null;
alter table teams add column if not exists legacy_slug text;
create index if not exists teams_legacy_slug_idx on teams (league, legacy_slug) where legacy_slug is not null;

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

-- Official week number where the feed provides one (NFL regular season and playoffs).
-- Soccer has no matchweek in any ESPN endpoint, so rounds there are reconstructed
-- from dates instead (see src/lib/matchweeks.ts).
alter table games add column if not exists week int;
-- The kickoff date the first time we saw the fixture. Postponed games move `date`
-- on every upsert, but this keeps the originally scheduled slot, which is what the
-- matchweek reconstruction needs to place a rescheduled game in its original round.
alter table games add column if not exists first_seen_date timestamptz;
update games set first_seen_date = date where first_seen_date is null;

-- ESPN's own classification of a game, filled from both feeds (scoreboard `season.type`,
-- team schedule `seasonType.type`) for NBA and NFL only: 1 preseason, 2 regular season,
-- 3 postseason, 5 play-in. `competition_type` is the competition's abbreviation: STD normal,
-- ALLSTAR (NBA All-Star, NFL Pro Bowl), CC (NBA Cup final), playoff rounds RD16/QTR/SEMI/FINAL.
alter table games add column if not exists season_type int;
alter table games add column if not exists competition_type text;
-- The one rule for "what kind of game is this". ESPN's headline player totals count regular-season
-- games only: they leave out preseason, play-in, All-Star and the NBA Cup final. A game with no
-- known type falls back to the old `round is null` reading so nothing changes until it is typed.
-- Generated, so it can never drift from the columns it is derived from.
alter table games add column if not exists stage text generated always as (
  case
    when league not in ('nba', 'nfl') then case when round is null then 'regular' else 'other' end
    when competition_type in ('ALLSTAR', 'CC') then 'excluded'
    when season_type = 1 then 'excluded'
    when season_type = 2 then 'regular'
    when season_type = 3 then 'playoffs'
    when season_type = 5 then 'playin'
    when round is null then 'regular'
    else 'playoffs'
  end
) stored;

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
-- Games played that season (NBA "GP"), so per-game leader boards can apply the
-- usual qualifying threshold instead of ranking a ten-game injury season first.
alter table player_season_stats add column if not exists games_played int;

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
-- Division within the conference (NFL: "AFC East"). Only the NFL standings fetch
-- asks ESPN for division-level groups; other leagues leave this null.
alter table standings add column if not exists division text;
-- ESPN's own position in its table (`rank` stat), which applies head-to-head and the other
-- tie-breaks that points, goal difference and goals scored cannot. Soccer and cricket tables
-- order by it; null when the feed sent none (older rows until `npm run backfill:standings`).
alter table standings add column if not exists rank int;
-- One row per stage table a team appears in (a T20 World Cup side has a group row and a Super
-- Eights row), which is the conflict target scripts/lib/standings.ts upserts on. The table was
-- created with a (league, season, team_espn_id) primary key; drop it and key on the conference too.
alter table standings drop constraint if exists standings_pkey;
-- Skipped when an equivalent unique index already exists under another name (one added by hand).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = current_schema() and tablename = 'standings'
      and indexdef ~* 'unique index .*\(league, season, team_espn_id, coalesce\(conference'
  ) then
    create unique index standings_stage_key on standings (league, season, team_espn_id, (coalesce(conference, '')));
  end if;
end $$;

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

-- Country: from the host edge's geolocation header (Cloudflare's cf-ipcountry, or Vercel's on
-- the review copy; real visitor IP geolocation — null locally or when the edge could not place
-- the visitor, which is an honest gap, not a bug). Platform: parsed from
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

-- Which ranking the rows are: ESPN's week number and its `lastUpdated` (the Thursday of that week; the tour
-- publishes the ranking the Monday after). Filled by the next fetch-tennis-rankings run; empty until then.
alter table tennis_rankings add column if not exists ranking_week int;
alter table tennis_rankings add column if not exists espn_updated timestamptz;

-- Day-by-day tennis, every tournament ESPN lists (tour events, Slams, Challengers,
-- 125s), from the cross-tour daily feed (see scripts/fetch-tennis-daily.ts). A match
-- keeps player1/player2 for singles; `side1`/`side2` carry everything the feed gives
-- per side, doubles pairs included:
--   { ids: text[], names: text[], countries: text[], seed, rank, score, sets: [{games, tiebreak, winner}] }
-- `day` is the calendar date ESPN files the match under (US Eastern), so a page for
-- a date shows exactly the day's play the way the feed groups it.
create table if not exists tennis_tournaments (
  espn_id text primary key,      -- "189-2026": tournament id + season (shared by both tours at a Slam)
  tour text not null,            -- atp | wta | both (the tour(s) ESPN lists it under)
  tournament_id text not null,
  season int not null,
  name text not null,
  location text,
  major boolean not null default false,
  start_date timestamptz,
  end_date timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tennis_tournaments_season_idx on tennis_tournaments (season, start_date);

alter table tennis_matches add column if not exists tournament_espn_id text;
alter table tennis_matches add column if not exists competition_type text; -- mens-singles | womens-singles | mens-doubles | womens-doubles | mixed-doubles
alter table tennis_matches add column if not exists round_number int;
alter table tennis_matches add column if not exists court text;
alter table tennis_matches add column if not exists day date;
alter table tennis_matches add column if not exists side1 jsonb;
alter table tennis_matches add column if not exists side2 jsonb;

create index if not exists tennis_matches_day_idx on tennis_matches (day);
create index if not exists tennis_matches_tournament_idx on tennis_matches (tournament_espn_id);
create index if not exists tennis_matches_sides_idx on tennis_matches using gin ((side1 -> 'ids'), (side2 -> 'ids'));

-- Nationality (ESPN's three-letter code, "ITA") — set for tennis players, where it is
-- part of how every scoreboard shows a name.
alter table players add column if not exists country text;

-- Every cricket series ESPN lists — tours, tournaments, domestic leagues, men's and
-- women's, youth and A-team — with its fixtures and results, from the same daily
-- listing the internationals importer reads (scripts/fetch-cricket-series.ts). This
-- is the "Series" directory: the competitions ScoreDB keeps scorecards for link
-- through to their match pages; everything else shows scores and results only.
create table if not exists cricket_series (
  espn_id text primary key,
  name text not null,
  short_name text,
  abbreviation text,
  slug text,
  is_tournament boolean not null default false,
  kind text not null,             -- international | womens-international | domestic | womens-domestic | other
  formats text[] not null default '{}',   -- distinct class cards seen: ODI, T20I, Test, First-class, ...
  season int,
  start_date timestamptz,
  end_date timestamptz,
  match_count int not null default 0,
  completed_count int not null default 0,
  teams jsonb not null default '[]'::jsonb,   -- [{id, name, abbreviation, logo}]
  updated_at timestamptz not null default now()
);

create index if not exists cricket_series_dates_idx on cricket_series (start_date, end_date);

create table if not exists cricket_series_matches (
  espn_id text primary key,
  series_espn_id text not null,
  date timestamptz not null,
  name text not null,
  short_name text,
  description text,               -- "2nd ODI", "Final", "10th Match" when the listing gives it
  class_card text,
  class_name text,
  international_class_id text,
  status_state text,              -- pre | in | post
  status_summary text,
  home jsonb,                     -- {id, name, abbreviation, score, winner, logo}
  away jsonb,
  league_candidates text[] not null default '{}',   -- ScoreDB leagues this match may have a scorecard under
  updated_at timestamptz not null default now()
);

create index if not exists cricket_series_matches_series_idx on cricket_series_matches (series_espn_id, date);
create index if not exists cricket_series_matches_date_idx on cricket_series_matches (date);

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

-- F1: individual drivers racing across a season-long calendar of weekend "events",
-- each made of multiple timed sessions (practice/qualifying/race) rather than a
-- single team-vs-team match — a fundamentally different shape from every other sport
-- here, so it's its own small parallel schema (same reasoning as tennis_matches).
-- Constructors reuse the existing `teams` table (league='f1') since they're a genuine
-- match for that shape (name/logo/color) — drivers likewise reuse `players`
-- (league='f1', team_espn_id pointing at their constructor).
create table if not exists f1_events (
  espn_id text primary key,
  name text not null,
  short_name text,
  date timestamptz not null,
  end_date timestamptz,
  season_year int,
  circuit_name text,
  circuit_city text,
  circuit_country text,
  updated_at timestamptz not null default now()
);

create index if not exists f1_events_season_idx on f1_events (season_year, date);

create table if not exists f1_sessions (
  espn_id text primary key,
  event_espn_id text not null,
  session_type text not null, -- 'FP1' | 'FP2' | 'FP3' | 'Qual' | 'Sprint' | 'Race', ESPN's own abbreviation
  date timestamptz not null,
  status_state text,
  status_detail text,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists f1_sessions_event_idx on f1_sessions (event_espn_id, date);

-- Finishing order only, not full timing/lap data (would need a separate request per
-- driver per session — a 20-driver grid x 5 sessions x every race adds up fast for
-- data a fan mostly just wants "who finished where"). Cumulative championship points
-- come from f1_standings instead of being recomputed from race results here.
create table if not exists f1_session_results (
  session_espn_id text not null,
  driver_espn_id text not null,
  position int,
  winner boolean not null default false,
  constructor_name text,
  car_number text,
  primary key (session_espn_id, driver_espn_id)
);

create table if not exists f1_standings (
  season_year int not null,
  standings_type text not null, -- 'driver' | 'constructor'
  entity_espn_id text not null, -- driver_espn_id (players.espn_id) or constructor team_espn_id (teams.espn_id)
  position int,
  points numeric,
  wins int,
  updated_at timestamptz not null default now(),
  primary key (season_year, standings_type, entity_espn_id)
);

-- One stored match report per completed game (venue, timeline, line-ups, team and
-- player box, win probability), extracted from ESPN's summary by the scraper so the
-- match page never depends on a live request. See scripts/lib/game-details.ts.
create table if not exists game_details (
  league text not null,
  game_espn_id text not null,
  details jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (league, game_espn_id)
);

-- Photograph from Wikimedia Commons for players ESPN has no headshot for (most
-- footballers), matched by the ESPN player id Wikidata stores — never by name.
-- Commons images are Creative Commons / public domain, so the photographer and
-- licence are kept and credited wherever the photo is shown at size.
-- Written by scripts/fetch-player-photos.ts; queries fall back to it when headshot_url is null.
alter table players add column if not exists photo_url text;
alter table players add column if not exists photo_credit text;
alter table players add column if not exists photo_license text;
alter table players add column if not exists photo_source_url text;

-- One row per scheduled scraper: when it last finished successfully, and when it last
-- actually changed data. Written by scripts/lib/heartbeat.ts, read by scripts/check-stale.ts
-- so a scraper that stops running is noticed instead of silently leaving pages stale.
create table if not exists scrape_runs (
  scraper text primary key,
  last_ok_at timestamptz not null default now(),
  last_changed_at timestamptz
);
