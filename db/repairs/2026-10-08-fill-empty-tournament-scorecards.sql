-- Fills the 58 tournament-key cricket reports (cwc 8, t20wc 50) whose stored match report is the empty
-- template (`scorecard: []`, no venue, no leaders) from the same match's report under its format key
-- (odi / t20i), which has the full scorecard. Both rows describe one ESPN event; cwc / t20wc are only the
-- tournament's second key. The reports are keyed by team id, so a twin whose home/away order is swapped
-- is still correct (the repair requires the twin's scorecard teams to be exactly this game's two teams).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -X -v dry=1 -f db/repairs/2026-10-08-fill-empty-tournament-scorecards.sql   # dry run: everything, then ROLLBACK
--   psql "$URL" -v ON_ERROR_STOP=1 -X          -f db/repairs/2026-10-08-fill-empty-tournament-scorecards.sql   # for real: COMMIT
--
-- Safety: one transaction; aborts (nothing changes) unless exactly 58 rows are targeted and exactly 58
-- are updated. Only rows whose report is still empty are touched, so a re-run after success targets 0
-- rows and aborts harmlessly. Undo: 2026-10-08-fill-empty-tournament-scorecards-rollback.sql.
\set ON_ERROR_STOP on
begin;

create temp table repair_targets on commit drop as
select a.league, a.game_espn_id, tg.league as twin_league, t.details as twin_details
from game_details a
join games g on g.league = a.league and g.espn_id = a.game_espn_id
join games tg on tg.espn_id = a.game_espn_id and tg.league = case a.league when 'cwc' then 'odi' when 't20wc' then 't20i' end
join game_details t on t.league = tg.league and t.game_espn_id = tg.espn_id
where a.league in ('cwc', 't20wc')
  and jsonb_typeof(a.details -> 'scorecard') = 'array' and jsonb_array_length(a.details -> 'scorecard') = 0
  and jsonb_typeof(t.details -> 'scorecard') = 'array'
  -- the twin's scorecard has real rows ...
  and exists (select 1 from jsonb_array_elements(t.details -> 'scorecard') sc(v)
              where (jsonb_typeof(sc.v -> 'battingRows') = 'array' and jsonb_array_length(sc.v -> 'battingRows') > 0)
                 or (jsonb_typeof(sc.v -> 'bowlingRows') = 'array' and jsonb_array_length(sc.v -> 'bowlingRows') > 0))
  -- ... for exactly this game's two teams (order of home / away does not matter)
  and (select array_agg(distinct sc.v ->> 'teamId' order by sc.v ->> 'teamId') from jsonb_array_elements(t.details -> 'scorecard') sc(v))
      = (select array_agg(x order by x) from unnest(array[g.home_team_espn_id, g.away_team_espn_id]) x);

select 'targets' as what, count(*) as n from repair_targets
union all select 'of which cwc', count(*) from repair_targets where league = 'cwc'
union all select 'of which t20wc', count(*) from repair_targets where league = 't20wc';

do $$
declare n int;
begin
  select count(*) into n from repair_targets;
  if n <> 58 then raise exception 'expected 58 targets, found % - nothing changed, investigate before running', n; end if;
end $$;

update game_details d
set details = r.twin_details, fetched_at = now()
from repair_targets r
where d.league = r.league and d.game_espn_id = r.game_espn_id
  and jsonb_array_length(d.details -> 'scorecard') = 0;

do $$
declare n int;
begin
  -- the update above reported its count to the client; recheck from the table itself
  select count(*) into n from game_details d join repair_targets r on r.league = d.league and r.game_espn_id = d.game_espn_id
   where d.details = r.twin_details;
  if n <> 58 then raise exception 'expected 58 rows to now carry the twin report, found % - rolled back', n; end if;
end $$;

select 'still empty after repair (want 0)' as what, count(*) as n
from game_details where league in ('cwc', 't20wc') and jsonb_typeof(details -> 'scorecard') = 'array' and jsonb_array_length(details -> 'scorecard') = 0;

\if :{?dry}
  \echo 'DRY RUN: rolling back, nothing was changed'
  rollback;
\else
  commit;
  \echo 'COMMITTED'
\endif
