/* Fantasy mode: enter a roster, get weekly projections, a best lineup and plain advice. Everything is computed in the browser from the board's own snapshot. */
const FBX = {roster: [], custom: [], scoring: 'half', week: null};
const FX_KEY = 'fb-fantasy-v1';
try { const s = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); if (s) { FBX.roster = s.roster || []; FBX.custom = s.custom || []; FBX.scoring = s.scoring || 'half'; } } catch (e) {}
const fxSave = () => { try { localStorage.setItem(FX_KEY, JSON.stringify({roster: FBX.roster, custom: FBX.custom, scoring: FBX.scoring})); } catch (e) {} };
const fxId = (p) => p.name + '|' + p.team;
const fxPool = () => DATA.fantasy_pool.concat(FBX.custom);
const fxPPR = () => ({std: 0, half: 0.5, ppr: 1}[FBX.scoring]);

/* season per-game fantasy points split into passing, rushing and receiving parts */
function fxBase(p) {
  if (p.custom) return {pass: 0, rush: 0, rec: +p.avg || 0, flat: true};
  if (p.pos === 'K') return {pass: 0, rush: 0, rec: +p.k_avg || 0, flat: true};
  if (p.pos === 'DST') { const t = nflTeam(p.team); return {pass: 0, rush: 0, rec: +p.sacks + 2 * +p.takeaways + fxPA(t ? +t.def_ppg : 22) + 0.5, flat: true}; }
  return {pass: p.pg ? (p.pass_yds * 0.04 + p.pass_td * 4 - p.ints * 2) / p.pg : 0, rush: p.rg ? (p.rush_yds * 0.1 + p.rush_td * 6) / p.rg : 0, rec: p.cg ? (p.rec_yds * 0.1 + p.rec_td * 6 + p.rec * fxPPR()) / p.cg : 0, flat: false};
}
/* fantasy points for points allowed, smoothed between the standard tiers */
function fxPA(x) { const pts = [[0, 10], [3.5, 7], [10, 4], [17, 1], [24, 0], [31, -1], [38, -4]]; if (x <= 0) return 10; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return -4; }
function fxGame(team, week) { return DATA.nfl_games.find((g) => +g.week === week && (g.away === team || g.home === team)) || null; }
function fxProject(p, week) {
  const g = fxGame(p.team, week), base = fxBase(p), avg = base.pass + base.rush + base.rec;
  if (!g) return {pts: 0, avg: avg, game: null, why: ['Already played or no game left this week']};
  const home = g.home === p.team, opp = nflTeam(home ? g.away : g.home), n = DATA.nfl_teams.length, why = [];
  const m = (rank) => 0.85 + 0.30 * (+rank - 1) / (n - 1);
  const passM = opp ? 0.7 * m(opp.r_def_pass) + 0.3 * m(opp.r_def_ppg) : 1, rushM = opp ? 0.7 * m(opp.r_def_rush) + 0.3 * m(opp.r_def_ppg) : 1;
  let wxPass = 1, wxRush = 1;
  if (g.roof === 'open' && g.wx_pop !== null && g.wx_pop !== '') { const pop = +g.wx_pop; if (pop >= 60) { wxPass = 0.9; wxRush = 0.98; why.push('Wet forecast (' + pop + '%)'); } else if (pop >= 40) { wxPass = 0.95; why.push('Rain possible (' + pop + '%)'); } if (g.wx_hi !== null && +g.wx_hi <= 32) { wxPass *= 0.96; why.push('Freezing'); } }
  if (p.pos === 'K' || p.pos === 'DST') {
    const me = nflTeam(p.team); if (!me || !opp) return {pts: base.rec, avg: avg, game: g, opp: opp ? opp.abbr : '', home: home, why: why};
    const pop = g.roof === 'open' && g.wx_pop !== null && g.wx_pop !== '' ? +g.wx_pop : null, wet = pop === null ? 1 : pop >= 60 ? 0.93 : pop >= 40 ? 0.97 : 1;
    const myPts = ((+me.off_ppg + +opp.def_ppg) / 2 + (home ? 1 : -1)) * wet, oppPts = ((+opp.off_ppg + +me.def_ppg) / 2 + (home ? -1 : 1)) * wet;
    if (p.pos === 'K') {
      const scale = Math.max(0.75, Math.min(1.25, myPts / (+me.off_ppg || 1))), wxK = g.roof !== 'open' ? 1.03 : pop === null ? 1 : pop >= 60 ? 0.92 : pop >= 40 ? 0.96 : 1;
      why.length = 0; why.push(me.abbr + ' project to score ' + myPts.toFixed(0)); if (g.roof !== 'open') why.push('Indoors'); else if (pop !== null && pop >= 40) why.push('Wet forecast (' + pop + '%)'); if (p.note) why.push(p.note);
      return {pts: base.rec * scale * wxK, avg: avg, game: g, opp: opp.abbr, home: home, why: why};
    }
    const f = 0.85 + 0.30 * (+opp.r_off_ppg - 1) / (n - 1);
    why.length = 0; why.push(opp.abbr + ' project to score ' + oppPts.toFixed(0) + ' (#' + opp.r_off_ppg + ' scoring offense)'); if (pop !== null && pop >= 40) why.push('Wet forecast (' + pop + '%) helps a defense');
    return {pts: +p.sacks * f + 2 * +p.takeaways * f + fxPA(oppPts) + 0.5, avg: avg, game: g, opp: opp.abbr, home: home, why: why};
  }
  const venue = home ? 1.02 : 0.98;
  const pts = base.flat ? base.rec * (0.5 * passM + 0.5 * rushM) * venue : (base.pass * passM * wxPass + base.rush * rushM * wxRush + base.rec * passM * wxPass) * venue;
  if (opp) { const r = p.pos === 'RB' ? +opp.r_def_rush : +opp.r_def_pass, what = p.pos === 'RB' ? 'run' : 'pass'; if (r <= 6) why.push('Tough matchup: ' + opp.abbr + ' is #' + r + ' against the ' + what); else if (r >= n - 5) why.push('Soft matchup: ' + opp.abbr + ' is #' + r + ' against the ' + what); }
  if (p.note) why.push(p.note);
  return {pts: pts, avg: avg, game: g, opp: opp ? opp.abbr : '', home: home, why: why};
}
function fxLineup(players, week) {
  const rows = players.map((p) => Object.assign({p: p}, fxProject(p, week))).sort((a, b) => b.pts - a.pts), used = new Set(), start = [];
  const take = (slot, ok) => { const r = rows.find((x) => !used.has(x) && ok(x.p.pos) && x.pts > 0); if (r) { used.add(r); start.push(Object.assign({slot: slot}, r)); } else start.push({slot: slot, empty: true}); };
  take('QB', (x) => x === 'QB'); take('RB', (x) => x === 'RB'); take('RB', (x) => x === 'RB'); take('WR', (x) => x === 'WR'); take('WR', (x) => x === 'WR'); take('TE', (x) => x === 'TE'); take('FLEX', (x) => x === 'RB' || x === 'WR' || x === 'TE'); take('K', (x) => x === 'K'); take('DST', (x) => x === 'DST');
  return {start: start, bench: rows.filter((r) => !used.has(r)), total: start.reduce((s, r) => s + (r.pts || 0), 0)};
}
function fxAdvice(players, week) {
  const L = fxLineup(players, week), out = [], pool = fxPool(), mine = new Set(players.map(fxId));
  const all = pool.map((p) => ({p: p, avg: (() => { const x = fxBase(p); return x.pass + x.rush + x.rec; })()}));
  const depth = {QB: 10, RB: 20, WR: 20, TE: 8, K: 8, DST: 8}, deep = new Set();
  Object.keys(depth).forEach((pos) => all.filter((x) => x.p.pos === pos).sort((x, y) => y.avg - x.avg).slice(depth[pos]).forEach((x) => deep.add(fxId(x.p))));
  const free = pool.filter((p) => !mine.has(fxId(p)) && deep.has(fxId(p)) && !p.note).map((p) => Object.assign({p: p}, fxProject(p, week))).filter((r) => r.pts > 0);
  const bestFree = (pos) => free.filter((r) => (pos === 'FLEX' ? ['RB', 'WR', 'TE'].includes(r.p.pos) : r.p.pos === pos)).sort((a, b) => b.pts - a.pts);
  const named = new Set();
  L.start.forEach((s) => {
    const cand = bestFree(s.empty ? s.slot : s.slot === 'FLEX' ? 'FLEX' : s.p.pos).find((r) => !named.has(fxId(r.p)));
    if (s.empty) { if (cand) named.add(fxId(cand.p)); out.push({level: 'bad', text: 'You have nobody to start at ' + s.slot + ' this week.' + (cand ? ' A pickup worth checking: ' + cand.p.name + ' (' + cand.p.team + ', projects ' + cand.pts.toFixed(1) + ').' : '')}); return; }
    if (s.p.note) out.push({level: 'bad', text: s.p.name + ': ' + s.p.note + '. Confirm he is playing before you lock him in.' + (cand ? ' Fallback if he is out: ' + cand.p.name + ' (' + cand.p.team + ', ' + cand.pts.toFixed(1) + ').' : '')});
    else if (cand && cand.pts - s.pts >= 2) { named.add(fxId(cand.p)); out.push({level: 'warn', text: 'Possible upgrade at ' + s.slot + ': ' + cand.p.name + ' (' + cand.p.team + ') projects ' + cand.pts.toFixed(1) + ' this week against ' + s.p.name + '\'s ' + s.pts.toFixed(1) + '. Worth a look if he is on your waiver wire.'}); }
  });
  L.bench.forEach((b) => { const sameOrFlex = L.start.filter((s) => !s.empty && (s.p.pos === b.p.pos)); const worst = sameOrFlex.sort((x, y) => x.pts - y.pts)[0]; if (worst && Math.abs(worst.pts - b.pts) < 1.2 && b.pts > 0) out.push({level: 'info', text: 'Close call: ' + worst.p.name + ' (' + worst.pts.toFixed(1) + ') over ' + b.p.name + ' (' + b.pts.toFixed(1) + '). That gap is inside the noise, so go with the one you trust.'}); });
  L.start.concat(L.bench).forEach((r) => { if (!r.empty && r.why) r.why.filter((w) => (w.startsWith('Wet') && r.p.pos !== 'DST') || w.startsWith('Freezing')).forEach((w) => out.push({level: 'warn', text: r.p.name + ' plays outdoors at ' + (r.game.home) + ': ' + w.toLowerCase() + '. His number is already trimmed for it.'})); });
  const idle = L.start.concat(L.bench).filter((r) => !r.empty && !r.game); if (idle.length) out.push({level: 'info', text: 'Not counted this week (already played, or no game left on the board): ' + idle.map((r) => r.p.name).join(', ') + '.'});
  const weeks = [...new Set(DATA.nfl_games.map((g) => +g.week))].sort((a, b) => a - b), totals = weeks.map((w) => ({week: w, total: fxLineup(players, w).total}));
  const rest = totals.filter((t) => t.week >= week); if (rest.length > 1) { const lo = rest.slice().sort((a, b) => a.total - b.total)[0], hi = rest.slice().sort((a, b) => b.total - a.total)[0]; if (hi.total - lo.total >= 6) out.push({level: 'info', text: 'Looking ahead: your best week is Week ' + hi.week + ' (' + hi.total.toFixed(0) + ') and your thinnest is Week ' + lo.week + ' (' + lo.total.toFixed(0) + '). Plan pickups for Week ' + lo.week + ' now.'}); }
  if (!out.length) out.push({level: 'good', text: 'Nothing to fix this week. Your best lineup is set and no one on this board clearly beats your starters.'});
  return {lineup: L, advice: out, totals: totals, free: free};
}

function fxRender() {
  const sec = document.getElementById('fantasy'); if (!sec) return;
  const weeks = [...new Set(DATA.nfl_games.map((g) => +g.week))].sort((a, b) => a - b); if (FBX.week === null) FBX.week = weeks[0];
  const wk = sec.querySelector('#fx-week'); if (!wk.options.length) wk.replaceChildren(...weeks.map((w) => new Option('Week ' + w, String(w)))); wk.value = String(FBX.week);
  sec.querySelector('#fx-scoring').value = FBX.scoring;
  const pool = fxPool(), dl = sec.querySelector('#fx-list'); dl.replaceChildren(...pool.map((p) => new Option(p.name + ' · ' + p.pos + ' · ' + p.team)));
  const players = FBX.roster.map((id) => pool.find((p) => fxId(p) === id)).filter(Boolean);
  const chips = sec.querySelector('.fx-roster'); chips.replaceChildren(...players.map((p) => { const c = fbEl('button', 'fx-chip'); c.type = 'button'; const t = nflTeam(p.team); c.style.borderColor = t ? t.color : 'var(--color-border-line)'; c.append(fbEl('b', '', p.name), fbEl('span', 'fb-sub', ' ' + p.pos + ' · ' + p.team + '  ✕')); c.setAttribute('aria-label', 'Remove ' + p.name); c.onclick = () => { FBX.roster = FBX.roster.filter((x) => x !== fxId(p)); fxSave(); fxRender(); }; return c; }));
  const out = sec.querySelector('.fx-out');
  if (!players.length) { out.replaceChildren(fbEl('p', 'fb-hint', 'Add your players above to see projections, your best lineup and advice for the week. Your team is saved on this device only.')); return; }
  const A = fxAdvice(players, FBX.week), L = A.lineup, kids = [];
  const sum = fbEl('div', 'fb-card'); sum.append(fbEl('h4', '', 'Week ' + FBX.week + ' projection'), fbEl('div', 'fb-temp', L.total.toFixed(1)), fbEl('div', 'fb-sub', 'Projected points from your best lineup (' + {std: 'standard', half: 'half-PPR', ppr: 'full PPR'}[FBX.scoring] + ' scoring)'));
  const maxT = Math.max(...A.totals.map((t) => t.total), 1), W = 320, H = 110, bw = W / A.totals.length;
  const svg = d3.create('svg').attr('viewBox', '0 0 ' + W + ' ' + (H + 34)).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Projected lineup points for each remaining week');
  A.totals.forEach((t, i) => { const h = H * t.total / maxT, on = t.week === FBX.week; svg.append('rect').attr('x', i * bw + 5).attr('y', H - h + 14).attr('width', bw - 10).attr('height', Math.max(1, h)).attr('rx', 4).style('fill', on ? '#ffb800' : dash.colors[0]).style('opacity', on ? 1 : 0.55);
    svg.append('text').attr('class', 'fb-svgtext').attr('x', i * bw + bw / 2).attr('y', H - h + 10).attr('text-anchor', 'middle').text(t.total.toFixed(0)); svg.append('text').attr('class', 'fb-svgmuted').attr('x', i * bw + bw / 2).attr('y', H + 29).attr('text-anchor', 'middle').text('Wk ' + t.week); });
  sum.appendChild(svg.node()); kids.push(sum);
  const adv = fbEl('div', 'fb-card'); adv.appendChild(fbEl('h4', '', 'What to do this week')); A.advice.forEach((a) => { const r = fbEl('div', 'fx-adv fx-' + a.level, a.text); adv.appendChild(r); }); kids.push(adv);
  const maxP = Math.max(...L.start.concat(L.bench).map((r) => r.pts || 0), 1);
  const rowOf = (r, slot) => { const row = fbEl('div', 'fx-row'); if (r.empty) { row.append(fbEl('span', 'fb-badge', slot), fbEl('span', 'fb-sub', 'Empty')); return row; }
    const t = nflTeam(r.p.team), top = fbEl('div', 'fx-top'); const left = fbEl('div'); left.append(fbEl('span', 'fb-badge', slot), fbEl('b', '', r.p.name), fbEl('span', 'fb-sub', ' ' + r.p.team + (r.game ? (r.home ? ' vs ' : ' at ') + r.opp : '')));
    top.append(left, fbEl('span', 'fx-pts', r.pts.toFixed(1))); const track = fbEl('div', 'fb-track'), fill = fbEl('div', 'fb-fill'); fill.style.cssText = 'width:' + Math.max(2, 100 * r.pts / maxP) + '%;background:' + (t ? t.color : dash.colors[0]); track.appendChild(fill);
    row.append(top, track, fbEl('div', 'fb-sub', ['Season average ' + r.avg.toFixed(1)].concat(r.why).join(' · '))); return row; };
  const lc = fbEl('div', 'fb-card'); lc.appendChild(fbEl('h4', '', 'Start')); L.start.forEach((r) => lc.appendChild(rowOf(r, r.slot)));
  if (L.bench.length) { lc.appendChild(fbEl('h4', 'fx-gap', 'Bench')); L.bench.forEach((r) => lc.appendChild(rowOf(r, r.p.pos))); } kids.push(lc);
  const fc = fbEl('div', 'fb-card'); fc.appendChild(fbEl('h4', '', 'Pickups to check, Week ' + FBX.week)); ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].forEach((pos) => { const top3 = A.free.filter((r) => r.p.pos === pos).sort((a, b) => b.pts - a.pts).slice(0, 3); if (top3.length) fc.appendChild(fbEl('div', 'fb-sub fx-free', pos + ': ' + top3.map((r) => r.p.name + ' ' + r.pts.toFixed(1)).join(' · '))); });
  fc.appendChild(fbEl('div', 'fb-hint', 'These are players outside the top tier at each position, the ones most likely to be free. The board cannot see your league, so check who is actually available.')); kids.push(fc);
  out.replaceChildren(...kids);
}
(function () {
  const sec = document.getElementById('fantasy'); if (!sec) return;
  const add = () => { const inp = sec.querySelector('#fx-add'), v = inp.value.trim().toLowerCase(); if (!v) return; const pool = fxPool();
    const hit = pool.find((p) => (p.name + ' · ' + p.pos + ' · ' + p.team).toLowerCase() === v) || pool.find((p) => p.name.toLowerCase() === v) || pool.find((p) => p.name.toLowerCase().includes(v));
    const msg = sec.querySelector('.fx-msg');
    if (!hit) { msg.textContent = 'No one on this board matches that. Use "Add a player who is not listed" below.'; return; }
    msg.textContent = ''; if (!FBX.roster.includes(fxId(hit))) FBX.roster.push(fxId(hit)); inp.value = ''; fxSave(); fxRender(); };
  sec.querySelector('#fx-addbtn').addEventListener('click', add);
  sec.querySelector('#fx-add').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  sec.querySelector('#fx-week').addEventListener('change', (e) => { FBX.week = +e.target.value; fxRender(); });
  sec.querySelector('#fx-scoring').addEventListener('change', (e) => { FBX.scoring = e.target.value; fxSave(); fxRender(); });
  sec.querySelector('#fx-cbtn').addEventListener('click', () => { const n = sec.querySelector('#fx-cname').value.trim(), team = sec.querySelector('#fx-cteam').value, pos = sec.querySelector('#fx-cpos').value, avg = parseFloat(sec.querySelector('#fx-cavg').value);
    const msg = sec.querySelector('.fx-msg'); if (!n || !team || isNaN(avg)) { msg.textContent = 'Give a name, team and average points per game.'; return; }
    const p = {name: n, team: team, pos: pos, avg: avg, custom: true, note: ''}; FBX.custom = FBX.custom.filter((x) => fxId(x) !== fxId(p)).concat([p]); if (!FBX.roster.includes(fxId(p))) FBX.roster.push(fxId(p)); msg.textContent = ''; sec.querySelector('#fx-cname').value = ''; sec.querySelector('#fx-cavg').value = ''; fxSave(); fxRender(); });
  sec.querySelector('#fx-clear').addEventListener('click', () => { FBX.roster = []; fxSave(); fxRender(); });
  sec.querySelector('#fx-cteam').replaceChildren(...DATA.nfl_teams.map((t) => new Option(t.abbr, t.abbr)));
  if (/[?&]fxdemo\b/.test(location.search)) FBX.roster = ['Josh Allen|BUF', 'Jahmyr Gibbs|DET', 'Chase Brown|CIN', 'CeeDee Lamb|DAL', 'Tee Higgins|CIN', 'George Kittle|SF', 'Bucky Irving|TB', 'Drake London|ATL', 'Aaron Rodgers|PIT', 'Evan McPherson|CIN', 'Steelers D/ST|PIT'];
  fxRender();
  if (location.hash === '#fantasy' || location.hash === '#recaps') document.querySelectorAll('.fb-tab[data-tab=' + location.hash.slice(1) + ']').forEach((b) => b.click());
})();
