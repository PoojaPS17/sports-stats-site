// `game_views.league` for a view of /cricket/matches/<id>. Cricket matches outside the archived
// competitions have no `games` row, so they are counted under this marker instead of a league; the
// archived ones redirect to /<league>/games/<id> and count there.
export const CRICKET_VIEW_LEAGUE = "cricket";
