-- Undo for `npm run repair:cricket-empty-reports`: puts the six ipl/bbl match reports back to the empty
-- template they held before (only where the report still has the repaired scorecard, never a refreshed one
-- with other content: the guard is "has a scorecard", so run it right after the repair or not at all).
--   psql "$URL" -v ON_ERROR_STOP=1 -X -f db/repairs/2026-10-08-empty-iplbbl-reports-rollback.sql
\set ON_ERROR_STOP on
begin;
update game_details d
set details = '{"city": null, "venue": null, "events": [], "leaders": [], "lineups": [], "officials": [], "scorecard": [], "attendance": null, "linescores": null, "player_box": [], "team_stats": [], "win_probability": []}'::jsonb,
    fetched_at = now()
where (d.league, d.game_espn_id) in (('ipl', '1359477'), ('ipl', '1359476'), ('ipl', '1473440'), ('bbl', '524932'), ('bbl', '524937'), ('bbl', '897755'))
  and jsonb_array_length(d.details -> 'scorecard') > 0;
select 'back to empty (want 6)' as what, count(*) as n from game_details d
where (d.league, d.game_espn_id) in (('ipl', '1359477'), ('ipl', '1359476'), ('ipl', '1473440'), ('bbl', '524932'), ('bbl', '524937'), ('bbl', '897755')) and jsonb_array_length(d.details -> 'scorecard') = 0;
commit;
