-- Undo for 2026-10-08-fill-empty-tournament-scorecards.sql: puts the same 58 rows back to the empty
-- template they held before (the exact shape the importer wrote). Only rows that still equal their
-- twin's report are reverted, so a report refreshed since by the scrapers is not clobbered.
--   psql "$URL" -v ON_ERROR_STOP=1 -X -f db/repairs/2026-10-08-fill-empty-tournament-scorecards-rollback.sql
\set ON_ERROR_STOP on
begin;
update game_details d
set details = '{"city": null, "venue": null, "events": [], "leaders": [], "lineups": [], "officials": [], "scorecard": [], "attendance": null, "linescores": null, "player_box": [], "team_stats": [], "win_probability": []}'::jsonb,
    fetched_at = now()
from (values
    ('cwc', '1144492'),
    ('cwc', '1144518'),
    ('cwc', '1144519'),
    ('cwc', '1144525'),
    ('cwc', '1144526'),
    ('cwc', '1384395'),
    ('cwc', '1384426'),
    ('cwc', '1384427'),
    ('t20wc', '1273737'),
    ('t20wc', '1273749'),
    ('t20wc', '1298138'),
    ('t20wc', '1298141'),
    ('t20wc', '1298142'),
    ('t20wc', '1298150'),
    ('t20wc', '1298152'),
    ('t20wc', '1298158'),
    ('t20wc', '1298164'),
    ('t20wc', '1298166'),
    ('t20wc', '1415702'),
    ('t20wc', '1415703'),
    ('t20wc', '1415714'),
    ('t20wc', '1415715'),
    ('t20wc', '1415716'),
    ('t20wc', '1415749'),
    ('t20wc', '1512719'),
    ('t20wc', '1512720'),
    ('t20wc', '1512731'),
    ('t20wc', '1512732'),
    ('t20wc', '1512733'),
    ('t20wc', '1512734'),
    ('t20wc', '1512738'),
    ('t20wc', '1512740'),
    ('t20wc', '1512741'),
    ('t20wc', '1512742'),
    ('t20wc', '1512745'),
    ('t20wc', '1512746'),
    ('t20wc', '356005'),
    ('t20wc', '412679'),
    ('t20wc', '412680'),
    ('t20wc', '412681'),
    ('t20wc', '412682'),
    ('t20wc', '412697'),
    ('t20wc', '682899'),
    ('t20wc', '682915'),
    ('t20wc', '682917'),
    ('t20wc', '682933'),
    ('t20wc', '682941'),
    ('t20wc', '682947'),
    ('t20wc', '682949'),
    ('t20wc', '682951'),
    ('t20wc', '682953'),
    ('t20wc', '682955'),
    ('t20wc', '682957'),
    ('t20wc', '682959'),
    ('t20wc', '682961'),
    ('t20wc', '951345'),
    ('t20wc', '951353'),
    ('t20wc', '951355')
) as ids(league, game_espn_id)
join game_details twin on twin.league = case ids.league when 'cwc' then 'odi' else 't20i' end and twin.game_espn_id = ids.game_espn_id
where d.league = ids.league and d.game_espn_id = ids.game_espn_id and d.details = twin.details;
select 'reverted to empty (want 58)' as what, count(*) as n
from game_details d where d.league in ('cwc', 't20wc') and jsonb_array_length(d.details -> 'scorecard') = 0;
commit;
