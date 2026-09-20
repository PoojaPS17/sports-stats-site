# Stage-aware player stats — design

Status: approved by the user on 2026-09-20 ("revised design approved, go ahead").

## Problem

Player pages sum every completed box score in `player_game_stats` into one "Regular season" style table, so the site's
games-played and per-game averages differ from ESPN's headline numbers. ESPN's athlete `/stats` endpoint counts
**regular-season games only**: it leaves out preseason, play-in, All-Star and Rising Stars games, and the NBA Cup final.
Its game log lists Play-In as its own group. Measured on 7 player-seasons: the site is right for regular season plus
postseason, plus the Cup final (Giannis 73 = 67 + 5 + 1, SGA 100 = 76 + 23 + 1, Luka 2019-20 67 = 61 + 6).

## Facts the design rests on (verified read-only against ESPN, 2026-09-20)

- Season type sits in a different field per feed: scoreboard `ev.season.type`, team-schedule `ev.seasonType.type`
  (1 preseason, 2 regular, 3 post, 5 play-in). Soccer leagues use large season ids there, so the split is NBA and NFL only.
- Competition type is `competitions[0].type.abbreviation` on both feeds: `STD` normal, `ALLSTAR` (NBA All-Star, NFL Pro Bowl),
  `CC` (NBA Cup final), playoff rounds `RD16`/`QTR`/`SEMI`/`FINAL`.
- The scoreboard classification equals ESPN's game-log grouping for every game in the 7 player-seasons checked.
- The historical backfill requests `seasontype` 2 and 3 only, so play-in games (`seasontype=5`) are missing before the live scan began.
- `parseRound` reads `ev.seasonType?.type`, absent on the scoreboard, so live-scanned playoff games get no `round`; the upsert
  then overwrites a backfilled `round` with null.
- Several pages treat `round is null` as "regular season" (simulator, computed tables, power-rankings fixtures, match context,
  matchweeks). Once play-in, preseason and Cup-final games are stored with a null `round`, those pages would count them.

## Design

**Stored classification.** `games` gains `season_type int`, `competition_type text` and a generated stored column `stage`:

| stage | rule (NBA and NFL) |
|---|---|
| `excluded` | competition type `ALLSTAR` or `CC`, or season type 1 (preseason) |
| `regular` | season type 2 |
| `playoffs` | season type 3 |
| `playin` | season type 5 |
| (no type known) | `regular` when `round` is null, else `playoffs` — exactly today's behaviour, so nothing regresses before the backfill |

Every other league: `regular` when `round` is null, else `other`. The generated column means the rule lives in one place and can
never drift from the columns it derives from.

**Ingestion.** Both feeds fill `season_type` and `competition_type` (`ev.seasonType?.type ?? ev.season?.type`; NBA/NFL only).
`parseRound` uses the same reading and returns null for `ALLSTAR`. Upserts use `coalesce(excluded.x, games.x)` for `season_type`,
`competition_type` and `round`, so a sparse feed never erases them. All-Star / Pro Bowl events are not stored at all: their
"teams" are not real teams and would otherwise be added to `teams` (ledger ruling; the approved design excluded them from totals,
this excludes them from the database).

**Backfill.** `backfill-games` requests seasontype 2, 3 and 5 for the NBA (2 and 3 for the NFL). A `backfill-game-stages` pass
gives a type to every NBA/NFL game still without one by re-reading that day's scoreboard. Preseason games are not backfilled.
Box scores for the newly stored play-in games come from the existing `backfill:game-stats`.

**Player pages** (`/[league]/players/[slug]` and `.../[season]`), NBA and NFL only:
Regular season (the career strip, season table, home/away, by-result, opponents and milestones), Playoffs table, Play-In table
(only when the player has play-in games). Best games and recent form use every counted game (regular, playoffs, play-in).
The game log lists every game with its stage labelled; preseason and Cup-final rows are dimmed and marked "not counted".
Soccer and cricket keep a single table.

**Other pages.** Everything that meant "regular season" by `round is null` switches to `stage = 'regular'`
(helper `isRegularSeasonGame` in TypeScript). Elo ratings skip `excluded` games. Pages that list games (scoreboards, team
schedules, game pages) keep listing them.

**Proof.** `audit:game-stages` (no NBA/NFL completed game without a season type) and `audit:player-totals` (the site's
regular-season games played and per-game or total figures against ESPN's stored and live headline numbers, expected 0 differences)
run on a local rehearsal database first, then on production after the user approves each command.

## Not in scope

Cricket and tennis player pages, soccer game pages, NBA standings, the F1 cancelled-race label, Phase B efficiency work.

## Rollback

Code: revert the merge. Data: the new columns are additive and unused by old code; the stored play-in games are harmless
to the old pages only because they carry a null `round`, which the old `round is null` filters would count, so revert the code
and the play-in rows together (`delete from games where league = 'nba' and season_type = 5`, with box scores).
