# Football Matchup Board

Single-page board for NFL (Weeks 12-18 of 2026) and college rivalry-week matchups.

- `index.html` is self-contained: page, data snapshot and d3 are all inline.
- Team, player and weather numbers are a snapshot from Nov 27, 2026 (ESPN team stats, CBS Sports leader tables, TeamRankings).
- Live scores are read in the browser from ESPN's public scoreboard feed, about once a minute during games. The feed is unofficial and may change.
- The "model lean" is a rule of thumb described in the notes at the bottom of the page, not a betting line.
- During a live game the page shows a broadcast-style overhead field replaying the most recent play (drawn in SVG, no extra libraries). It is reconstructed from ESPN's play-by-play text and yard lines (direction, depth, gain, player names), not from player tracking, so routes and the other players' positions are approximate. `field.src.js` is the readable source of that module; it is already inlined in `index.html`.
- Add `?sample=1` or `?sample=2` to the URL to preview the field with a sample pass or run.
