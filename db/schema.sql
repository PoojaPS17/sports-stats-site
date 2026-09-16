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
alter table games add column if not exists away_winner boolean;

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

create index if not exists player_season_stats_pts_idx on player_season_stats (league, season, pts_avg desc nulls last);
create index if not exists player_season_stats_reb_idx on player_season_stats (league, season, reb_avg desc nulls last);
create index if not exists player_season_stats_ast_idx on player_season_stats (league, season, ast_avg desc nulls last);
create index if not exists player_season_stats_pass_idx on player_season_stats (league, season, passing_yards desc nulls last);
create index if not exists player_season_stats_rush_idx on player_season_stats (league, season, rushing_yards desc nulls last);
create index if not exists player_season_stats_recv_idx on player_season_stats (league, season, receiving_yards desc nulls last);

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
