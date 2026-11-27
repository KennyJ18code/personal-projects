/* Game recaps for finished games, built from ESPN's public game summary. */
const FBR = {key: '', week: null, league: 'nfl', games: [], pick: null, cache: {}};
const fbEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
const fbApi = (league) => 'https://site.api.espn.com/apis/site/v2/sports/football/' + (league === 'nfl' ? 'nfl' : 'college-football');
const fbTeamColor = (league, abbr, name) => { if (league === 'nfl') { const t = nflTeam(abbr); if (t) return t.color; } return hue(name || abbr); };

function fbRecapModel(j, league) {
  const comp = j && j.header && j.header.competitions && j.header.competitions[0]; if (!comp) return null;
  const side = (ha) => { const c = (comp.competitors || []).find((x) => x.homeAway === ha) || {}; const t = c.team || {};
    return {id: String(t.id || c.id || ''), short: t.abbreviation || t.displayName || '', long: t.displayName || t.location || t.abbreviation || '', score: +c.score || 0, record: (c.record && c.record[0] && c.record[0].summary) || '',
      lines: (c.linescores || []).map((x) => x.displayValue !== undefined ? x.displayValue : x.value), color: fbTeamColor(league, t.abbreviation, t.displayName || t.location)}; };
  const away = side('away'), home = side('home');
  const statOf = (teamId) => { const t = ((j.boxscore && j.boxscore.teams) || []).find((x) => String(x.team && x.team.id) === teamId); const o = {}; ((t && t.statistics) || []).forEach((s) => { o[s.name] = s.displayValue; }); return o; };
  const leadOf = (teamId) => { const t = (j.leaders || []).find((x) => String(x.team && x.team.id) === teamId); return ((t && t.leaders) || []).map((c) => { const l = c.leaders && c.leaders[0]; return l && l.athlete ? {cat: c.displayName || c.name, who: l.athlete.displayName || l.athlete.shortName, line: l.displayValue} : null; }).filter(Boolean).slice(0, 3); };
  const scoring = (j.scoringPlays || []).map((p) => ({q: p.period && p.period.number, clock: p.clock && p.clock.displayValue, team: (p.team && (p.team.abbreviation || p.team.displayName)) || '', text: p.text || '', away: p.awayScore, home: p.homeScore, type: (p.type && p.type.text) || ''}));
  return {away: away, home: home, astat: statOf(away.id), hstat: statOf(home.id), alead: leadOf(away.id), hlead: leadOf(home.id), scoring: scoring,
    done: !comp.status || !comp.status.type || comp.status.type.completed !== false, venue: (j.gameInfo && j.gameInfo.venue && j.gameInfo.venue.fullName) || '', date: comp.date || ''};
}
function fbRecapStory(m) {
  const w = m.away.score >= m.home.score ? m.away : m.home, l = w === m.away ? m.home : m.away, margin = w.score - l.score, out = [];
  if (margin === 0) out.push(m.away.long + ' and ' + m.home.long + ' finished tied at ' + w.score + '.');
  else out.push(w.long + ' beat ' + l.long + ' ' + w.score + '–' + l.score + (margin <= 3 ? ', a one-score game decided by ' + margin + '.' : margin >= 17 ? ', a ' + margin + '-point runaway.' : '.'));
  const num = (v) => { const n = parseFloat(String(v === undefined ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const ws = w === m.away ? m.astat : m.hstat, ls = w === m.away ? m.hstat : m.astat, wy = num(ws.totalYards), ly = num(ls.totalYards);
  if (wy !== null && ly !== null) out.push(wy >= ly ? w.short + ' outgained ' + l.short + ' ' + wy + ' to ' + ly + ' yards.' : l.short + ' actually outgained ' + w.short + ' ' + ly + ' to ' + wy + ' yards and still lost.');
  const wt = num(ws.turnovers), lt = num(ls.turnovers);
  if (wt !== null && lt !== null && wt !== lt) out.push(lt > wt ? l.short + ' turned it over ' + lt + ' time' + (lt === 1 ? '' : 's') + ' to ' + w.short + '\'s ' + wt + '.' : w.short + ' won despite losing the turnover count ' + wt + ' to ' + lt + '.');
  const wl = (w.lines || []).map(num), ll = (l.lines || []).map(num);
  if (wl.length >= 4 && ll.length >= 4 && margin > 0) { const h1 = (wl[0] + wl[1]) - (ll[0] + ll[1]); if (h1 < 0) out.push(w.short + ' trailed by ' + (-h1) + ' at halftime and came back.'); else { let best = 0, bq = -1; wl.forEach((v, i) => { const d = v - (ll[i] || 0); if (d > best) { best = d; bq = i; } }); if (bq >= 0 && best >= 7) out.push('The biggest swing was the ' + ['first', 'second', 'third', 'fourth'][bq] + ' quarter, which ' + w.short + ' won ' + wl[bq] + '–' + (ll[bq] || 0) + '.'); } }
  const last = m.scoring[m.scoring.length - 1];
  if (last && margin > 0 && margin <= 8 && last.q >= 4) out.push('Last score: ' + last.team + ', ' + (last.clock || '') + ' left in the ' + (last.q > 4 ? 'overtime' : 'fourth') + '.');
  return out.join(' ');
}
function fbRecapRender(box, m, league, eventId) {
  const kids = [];
  const head = fbEl('div', 'fb-banner'); head.style.background = 'linear-gradient(105deg,' + m.away.color + ' 0 50%,' + m.home.color + ' 50% 100%)';
  [[m.away, 'fb-side'], null, [m.home, 'fb-side fb-r']].forEach((x) => { if (!x) return head.appendChild(fbEl('div', 'fb-mid', m.away.score + ' – ' + m.home.score)); const s = fbEl('div', x[1]); s.append(fbEl('span', 'fb-big', x[0].short), fbEl('span', 'fb-small', [x[0].long, x[0].record].filter(Boolean).join(' · '))); head.appendChild(s); });
  const wrap = fbEl('div', 'fb-hero'); wrap.appendChild(head); kids.push(wrap);
  kids.push(fbEl('p', 'fb-rstory', fbRecapStory(m)));
  const n = Math.max(m.away.lines.length, m.home.lines.length);
  if (n) { const t = fbEl('table', 'fb-rline'); const hr = fbEl('tr'); hr.appendChild(fbEl('th', '', '')); for (let i = 0; i < n; i++) hr.appendChild(fbEl('th', '', i < 4 ? String(i + 1) : 'OT')); hr.appendChild(fbEl('th', '', 'T')); t.appendChild(hr);
    [m.away, m.home].forEach((s) => { const r = fbEl('tr'); const nm = fbEl('td', 'fb-rname', s.short); nm.style.borderLeft = '4px solid ' + s.color; r.appendChild(nm); for (let i = 0; i < n; i++) r.appendChild(fbEl('td', '', s.lines[i] === undefined ? '' : String(s.lines[i]))); r.appendChild(fbEl('td', 'fb-rtot', String(s.score))); t.appendChild(r); }); kids.push(t); }
  const rows = [['totalYards', 'Total yards'], ['netPassingYards', 'Passing yards'], ['rushingYards', 'Rushing yards'], ['firstDowns', 'First downs'], ['turnovers', 'Turnovers'], ['possessionTime', 'Time of possession']].filter(([k]) => m.astat[k] !== undefined && m.hstat[k] !== undefined);
  if (rows.length) { kids.push(fbEl('h5', 'fb-rh', 'Team stats')); const g = fbEl('div', 'fb-rstats');
    rows.forEach(([k, label]) => { const toN = (v) => { const s = String(v); if (s.includes(':')) { const p = s.split(':'); return +p[0] * 60 + +p[1]; } return parseFloat(s.replace(/,/g, '')) || 0; }; const a = toN(m.astat[k]), h = toN(m.hstat[k]), tot = a + h || 1;
      const row = fbEl('div', 'fb-rstat'); row.append(fbEl('span', 'fb-rv', m.astat[k]), fbEl('span', 'fb-rl', label), fbEl('span', 'fb-rv fb-r', m.hstat[k]));
      const bar = fbEl('div', 'fb-leanbar'); const x = fbEl('span'), y = fbEl('span'); x.style.cssText = 'width:' + (100 * a / tot) + '%;background:' + m.away.color; y.style.cssText = 'width:' + (100 * h / tot) + '%;background:' + m.home.color; bar.append(x, y); g.append(row, bar); }); kids.push(g); }
  if (m.alead.length || m.hlead.length) { kids.push(fbEl('h5', 'fb-rh', 'Leaders')); const g = fbEl('div', 'fb-grid2');
    [[m.away, m.alead], [m.home, m.hlead]].forEach(([s, ls]) => { const c = fbEl('div', 'fb-rlead'); const chip = fbEl('span', 'fb-chipc', s.short); chip.style.background = s.color; c.appendChild(chip); ls.forEach((l) => { const p = fbEl('div', 'fb-pl'); const top = fbEl('div'); top.append(fbEl('span', 'fb-badge', l.cat.replace(' Yards', '')), fbEl('b', '', l.who)); p.append(top, fbEl('span', 'fb-sub', l.line)); c.appendChild(p); }); g.appendChild(c); }); kids.push(g); }
  if (m.scoring.length) { kids.push(fbEl('h5', 'fb-rh', 'Scoring plays')); const list = fbEl('div', 'fb-rplays');
    m.scoring.forEach((p) => { const r = fbEl('div', 'fb-rplay'); const col = p.team === m.away.short ? m.away.color : p.team === m.home.short ? m.home.color : 'var(--color-border-line)'; r.style.borderLeft = '4px solid ' + col;
      r.append(fbEl('div', 'fb-rwhen', (p.q ? (p.q > 4 ? 'OT' : 'Q' + p.q) : '') + (p.clock ? ' · ' + p.clock : '') + ' · ' + p.team + (p.away !== undefined ? '   ' + p.away + '–' + p.home : '')), fbEl('div', 'fb-sub', p.text)); list.appendChild(r); }); kids.push(list); }
  const link = fbEl('a', 'fb-rlinkout', 'Full recap and box score on ESPN'); link.href = 'https://www.espn.com/' + (league === 'nfl' ? 'nfl' : 'college-football') + '/game/_/gameId/' + encodeURIComponent(eventId); link.target = '_blank'; link.rel = 'noopener'; kids.push(link);
  box.replaceChildren(...kids);
}
async function fbRecapLoad(box, league, eventId) {
  box.hidden = false; const k = league + eventId;
  if (!FBR.cache[k]) { box.replaceChildren(fbEl('p', 'fb-hint', 'Loading the recap…')); try { FBR.cache[k] = await (await fetch(fbApi(league) + '/summary?event=' + eventId, {cache: 'no-store'})).json(); } catch (e) { box.replaceChildren(fbEl('p', 'fb-hint', 'The recap could not be loaded right now.')); return; } }
  const m = fbRecapModel(FBR.cache[k], league);
  if (!m) { box.replaceChildren(fbEl('p', 'fb-hint', 'No recap is available for this game.')); return; }
  fbRecapRender(box, m, league, eventId);
}

/* recap inside the NFL and College tabs when the selected game is final */
setInterval(() => {
  const tab = document.querySelector('.fb-sec:not([hidden])'); if (!tab || (tab.id !== 'nfl' && tab.id !== 'cfb')) return;
  const box = tab.querySelector('.fb-recap'); if (!box) return;
  const g = tab.id === 'nfl' ? curGame() : curCfb(); const l = g && liveOf(tab.id, g);
  const key = tab.id + '|' + (g ? g.id : '') + '|' + (l ? l.status : '');
  if (key === FBR.key) return; FBR.key = key;
  if (l && l.status === 'final' && l.event_id) fbRecapLoad(box, tab.id, l.event_id); else { box.hidden = true; box.replaceChildren(); }
}, 1000);

/* Recaps tab: any finished game this season */
async function fbRecapsWeek() {
  const sec = document.getElementById('recaps'); if (!sec) return;
  const rail = sec.querySelector('.fb-rrail'), box = sec.querySelector('.fb-recap'), wk = sec.querySelector('#fb-rweek'), league = FBR.league;
  rail.replaceChildren(fbEl('p', 'fb-hint', 'Loading games…')); box.hidden = true;
  let j = null;
  try { j = await (await fetch(fbApi(league) + '/scoreboard?' + (league === 'nfl' ? 'seasontype=2' : 'groups=80&limit=300') + (FBR.week ? '&week=' + FBR.week : ''), {cache: 'no-store'})).json(); } catch (e) { rail.replaceChildren(fbEl('p', 'fb-hint', 'Scores could not be loaded right now.')); return; }
  const events = j.events || (j.leagues && j.leagues[0] && j.leagues[0].events) || [];
  const cur = (j.week && j.week.number) || FBR.week || 1;
  if (!FBR.week) FBR.week = cur;
  if (!wk.options.length || wk.getAttribute('data-league') !== league) { const maxW = Math.max(cur, FBR.week); wk.replaceChildren(...Array.from({length: maxW}, (_, i) => new Option('Week ' + (i + 1), String(i + 1)))); wk.setAttribute('data-league', league); }
  wk.value = String(FBR.week);
  const done = events.map((ev) => { const c = ev.competitions && ev.competitions[0]; if (!c) return null; const st = c.status || ev.status || {}; if (!st.type || st.type.state !== 'post') return null;
    const h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away'); if (!h || !a) return null;
    const nm = (t) => league === 'nfl' ? t.abbreviation : (t.location || t.abbreviation);
    return {id: ev.id, a: nm(a.team), h: nm(h.team), as: a.score, hs: h.score, ac: fbTeamColor(league, a.team.abbreviation, a.team.location), hc: fbTeamColor(league, h.team.abbreviation, h.team.location)}; }).filter(Boolean);
  if (!done.length) { rail.replaceChildren(fbEl('p', 'fb-hint', 'No finished games found for this week yet.')); return; }
  rail.replaceChildren(...done.map((g) => { const card = fbEl('div', 'fb-g'); card.tabIndex = 0; card.setAttribute('role', 'button');
    const band = fbEl('div', 'fb-band'); band.style.background = 'linear-gradient(90deg,' + g.ac + ' 50%,' + g.hc + ' 50%)'; const inn = fbEl('div', 'fb-gin');
    [[g.a, g.as, +g.as >= +g.hs], [g.h, g.hs, +g.hs >= +g.as]].forEach(([n, s, won]) => { const r = fbEl('div', 'fb-row'); const name = fbEl('span', 'fb-nm', n); if (!won) name.style.fontWeight = '400'; r.append(name, fbEl('span', 'fb-sc', String(s))); inn.appendChild(r); });
    inn.appendChild(fbEl('div', 'fb-sub', 'Final')); card.append(band, inn);
    const go = () => { rail.querySelectorAll('.fb-g').forEach((c) => c.classList.toggle('fb-sel', c === card)); fbRecapLoad(box, league, g.id); };
    card.onclick = go; card.onkeydown = (e) => { if (e.key === 'Enter') go(); }; return card; }));
  const first = rail.querySelector('.fb-g'); if (first) first.onclick();
}
(function () {
  const sec = document.getElementById('recaps'); if (!sec) return;
  let loaded = false;
  document.querySelectorAll('.fb-tab[data-tab=recaps]').forEach((b) => b.addEventListener('click', () => { if (!loaded) { loaded = true; fbRecapsWeek(); } }));
  sec.querySelector('#fb-rleague').addEventListener('change', (e) => { FBR.league = e.target.value; FBR.week = null; fbRecapsWeek(); });
  sec.querySelector('#fb-rweek').addEventListener('change', (e) => { FBR.week = +e.target.value; fbRecapsWeek(); });
  if (location.hash === '#recaps') { loaded = true; setTimeout(fbRecapsWeek, 50); }
})();
