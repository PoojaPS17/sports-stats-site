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
  primary key (league, espn_id),
  unique (league, slug)
);

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
  status_state text,
  status_detail text,
  period int,
  clock text,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (league, espn_id)
);

create index if not exists games_league_date_idx on games (league, date);

create table if not exists player_game_stats (
  league text not null,
  game_espn_id text not null,
  player_espn_id text not null,
  team_espn_id text,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (league, game_espn_id, player_espn_id)
);

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
  updated_at timestamptz not null default now(),
  primary key (league, season, team_espn_id)
);
