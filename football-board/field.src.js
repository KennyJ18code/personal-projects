/* Last-play field. Reconstructs the most recent play from ESPN play-by-play text and yard lines. */
const FBF = {scene: null, key: '', timer: 0, raf: 0, model: null, t0: 0, sample: false};
const F_LEN = 100, F_W = 53.3, EZ = 10;

function fbParsePlay(play, ctx) {
  /* play: ESPN play object (summary drives or scoreboard lastPlay). ctx: {homeId, awayId, home, away} with short names and colors */
  const text = String(play.text || ''), low = text.toLowerCase(), type = String((play.type && play.type.text) || '').toLowerCase();
  const offId = String((play.start && play.start.team && play.start.team.id) || (play.team && play.team.id) || ctx.driveTeamId || '');
  const homeOff = offId !== '' ? offId === String(ctx.homeId) : false;
  const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
  let gain = num(play.statYardage);
  if (gain === null) { const m = low.match(/for (a loss of )?(-?\d+) yards?/); gain = m ? (m[1] ? -(+m[2]) : +m[2]) : low.includes('no gain') ? 0 : null; }
  let toGoStart = num(play.start && play.start.yardsToEndzone), toGoEnd = num(play.end && play.end.yardsToEndzone);
  if (toGoStart === null && toGoEnd !== null && gain !== null) toGoStart = toGoEnd + gain;
  if (toGoEnd === null && toGoStart !== null && gain !== null) toGoEnd = toGoStart - gain;
  let approx = false;
  if (toGoStart === null) { toGoStart = 60; toGoEnd = 60 - (gain || 0); approx = true; }
  if (toGoEnd === null) toGoEnd = toGoStart;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  toGoStart = clamp(toGoStart, 0, 100); toGoEnd = clamp(toGoEnd, -8, 108);
  const dir = homeOff ? -1 : 1;
  const xOf = (toGo) => dir * (50 - toGo);
  let kind = 'other';
  if (type.includes('punt') || low.includes(' punts ')) kind = 'punt';
  else if (type.includes('kickoff') || low.includes(' kicks ')) kind = 'kickoff';
  else if (type.includes('field goal') || low.includes('field goal')) kind = 'fg';
  else if (type.includes('sack') || low.includes(' sacked ')) kind = 'sack';
  else if (type.includes('pass') || type.includes('interception') || low.includes(' pass ')) kind = 'pass';
  else if (type.includes('rush') || low.includes(' rush') || low.includes(' run ') || /\b(left|right) (end|tackle|guard)\b|up the middle|scrambles/.test(low)) kind = 'run';
  const lateral = /\bleft\b/.test(low) ? -1 : /\bright\b/.test(low) ? 1 : 0;
  const deep = /\bdeep\b/.test(low);
  const incomplete = type.includes('incompletion') || low.includes('incomplete');
  const intercepted = type.includes('interception') || low.includes('intercepted');
  const fumbleLost = low.includes('fumble') && low.includes('recovered by') && type.includes('opponent');
  const score = !!play.scoringPlay || low.includes('touchdown') || (kind === 'fg' && (low.includes('is good') || type.includes('good')));
  const gapZ = low.includes('left end') ? -15 : low.includes('left tackle') ? -8 : low.includes('left guard') ? -4 : low.includes('right end') ? 15 : low.includes('right tackle') ? 8 : low.includes('right guard') ? 4 : lateral * 6;
  const down = num(play.start && play.start.down), dist = num(play.start && play.start.distance);
  const ord = ['', '1st', '2nd', '3rd', '4th'];
  return {kind: kind, dir: dir, xs: xOf(toGoStart), xe: xOf(toGoEnd), gain: gain, lateral: lateral * dir, deep: deep, gapZ: gapZ * dir,
    complete: kind === 'pass' && !incomplete && !intercepted, incomplete: incomplete, turnover: intercepted || fumbleLost, score: score, approx: approx,
    firstX: dist !== null && down ? xOf(clamp(toGoStart - dist, 0, 100)) : null,
    downText: down && dist !== null && ord[down] ? ord[down] + ' & ' + (toGoStart <= dist ? 'goal' : dist) : '',
    off: homeOff ? ctx.home : ctx.away, def: homeOff ? ctx.away : ctx.home, home: ctx.home, away: ctx.away, text: text, college: !!ctx.college,
    clock: [(play.period && play.period.number) ? 'Q' + play.period.number : '', (play.clock && play.clock.displayValue) || ''].filter(Boolean).join(' · ')};
}

function fbPickPlay(summary, situation) {
  const real = (p) => p && p.text && !/timeout|end of|end period|coin toss|two-minute warning/i.test(String((p.type && p.type.text) || '') + ' ' + p.text);
  const d = summary && summary.drives;
  if (d) {
    const drives = (d.previous || []).concat(d.current ? [d.current] : []);
    for (let i = drives.length - 1; i >= 0; i--) {
      const plays = drives[i].plays || [];
      for (let j = plays.length - 1; j >= 0; j--) if (real(plays[j])) return {play: plays[j], driveTeamId: drives[i].team && drives[i].team.id};
    }
  }
  if (situation && real(situation.lastPlay)) return {play: situation.lastPlay, driveTeamId: situation.possession};
  return null;
}

const fbEase = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function fbNames(text) {
  const N = "([A-Z][A-Za-z'\\-]*\\.? ?[A-Z][A-Za-z'\\-]+(?: (?:Jr|Sr|II|III|IV)\\.?)?)";
  const clean = String(text).replace(/^\s*\([^)]*\)\s*/, '');
  const first = (clean.match(new RegExp('^' + N)) || [])[1] || '';
  const to = (clean.match(new RegExp('(?: to | intended for )' + N)) || [])[1] || '';
  return {first: first, to: to};
}
function fbBuild(el, m) {
  if (FBF.raf) cancelAnimationFrame(FBF.raf);
  el.replaceChildren();
  const U = 10, HALF = F_W / 2, PAD = 34, f = m.dir, lat = m.lateral, college = !!m.college;
  const X = (x) => (x + 60) * U, Z = (z) => (z + HALF) * U + PAD;
  const names = fbNames(m.text), shotgun = /shotgun/i.test(m.text) || m.kind === 'pass';
  /* ---- key frames (yards) ---- */
  const P = (x, z) => ({x: x, z: z}), lerp = (a, b, u) => P(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u);
  const qb0 = P(m.xs - f * (shotgun ? 5 : 1.4), 0), qb1 = P(m.xs - f * 8, lat * 1.5);
  let carrier = [], flight = null, kick = false, endPt;
  const side = lat || 1;
  if (m.kind === 'pass') {
    const g0 = m.gain === null ? 6 : m.gain;
    let air = m.complete ? (m.deep ? Math.max(15, g0 * 0.75) : Math.min(Math.max(g0 * 0.6, -2), 9)) : (m.deep ? 24 : 8);
    if (m.complete) air = Math.min(air, Math.max(g0, -3));
    const zc = (lat || 0.35) * (m.deep ? 17 : 11), catchPt = P(m.xs + f * air, zc);
    endPt = m.complete ? P(m.xe, zc * 0.78) : catchPt;
    carrier = [P(m.xs - f * 0.4, side * 20), P(m.xs + f * Math.max(air * 0.7, 1), side * 20), catchPt].concat(m.complete ? [endPt] : []);
    flight = [qb1, catchPt];
  } else if (m.kind === 'run') {
    endPt = P(m.xe, Math.max(-22, Math.min(22, m.gapZ * 1.3)));
    carrier = [P(m.xs - f * 7, 1.2), P(m.xs - f * 3.5, m.gapZ * 0.45), P(m.xs + f * 0.6, m.gapZ), endPt];
  } else if (m.kind === 'sack') { endPt = P(m.xe, lat * 3); carrier = [qb0, qb1, endPt]; }
  else if (m.kind === 'punt' || m.kind === 'kickoff' || m.kind === 'fg') {
    const from = P(m.xs - f * (m.kind === 'punt' ? 13 : m.kind === 'fg' ? 7 : 0), 0), to = m.kind === 'fg' ? P(f * 60, m.score ? 0.6 : 5.5) : P(m.xe, lat * 8);
    flight = [from, to]; kick = true; endPt = to; carrier = [from, from];
  } else { endPt = P(m.xe, 0); carrier = [qb0, qb0]; }
  /* ---- view window ---- */
  const lo = Math.min(m.xs, endPt.x) - 13, hi = Math.max(m.xs, endPt.x) + 13, vw = Math.max(50, hi - lo), cx = (lo + hi) / 2;
  const vx = Math.max(-62, Math.min(62 - vw, cx - vw / 2)), VBW = vw * U, VBH = F_W * U + PAD * 2;
  const svg = d3.create('svg').attr('viewBox', X(vx) + ' 0 ' + VBW + ' ' + VBH).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Replay diagram of the last play: ' + m.text).style('display', 'block');
  const defs = svg.append('defs');
  const turf = defs.append('filter').attr('id', 'fbTurf').attr('x', 0).attr('y', 0).attr('width', '100%').attr('height', '100%');
  turf.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', '0.85 0.5').attr('numOctaves', 2).attr('seed', 4).attr('result', 'n');
  turf.append('feColorMatrix').attr('in', 'n').attr('type', 'matrix').attr('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.62').attr('result', 'a');
  turf.append('feComposite').attr('in', 'a').attr('in2', 'SourceGraphic').attr('operator', 'in');
  const sheen = defs.append('linearGradient').attr('id', 'fbSheen').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
  [[0, 'rgba(255,255,255,.10)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.22)']].forEach(([o, c]) => sheen.append('stop').attr('offset', o).attr('stop-color', c));
  const vig = defs.append('radialGradient').attr('id', 'fbVig').attr('cx', '50%').attr('cy', '50%').attr('r', '75%');
  [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.42)']].forEach(([o, c]) => vig.append('stop').attr('offset', o).attr('stop-color', c));
  const ballG = defs.append('radialGradient').attr('id', 'fbBall').attr('cx', '40%').attr('cy', '35%');
  [[0, '#b9713a'], [1, '#5e3216']].forEach(([o, c]) => ballG.append('stop').attr('offset', o).attr('stop-color', c));
  const glow = defs.append('filter').attr('id', 'fbGlow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%'); glow.append('feGaussianBlur').attr('stdDeviation', 3.2);
  const bg = svg.append('g');
  bg.append('rect').attr('x', 0).attr('y', 0).attr('width', 1200).attr('height', VBH).attr('fill', '#17461f');
  d3.range(20).forEach((i) => bg.append('rect').attr('x', X(-50 + i * 5)).attr('y', PAD).attr('width', 5 * U).attr('height', F_W * U).attr('fill', i % 2 ? '#2f8a3f' : '#28793a'));
  [[-60, m.away], [50, m.home]].forEach(([x, t], i) => {
    bg.append('rect').attr('x', X(x)).attr('y', PAD).attr('width', 10 * U).attr('height', F_W * U).attr('fill', t.color);
    bg.append('rect').attr('x', X(x)).attr('y', PAD).attr('width', 10 * U).attr('height', F_W * U).attr('fill', 'rgba(0,0,0,.18)');
    const label = String(t.long || t.short).split(' ').slice(-1)[0].toUpperCase();
    bg.append('text').attr('transform', 'translate(' + (X(x) + 5 * U) + ',' + Z(0) + ') rotate(' + (i ? 90 : -90) + ')').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-family', 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif').attr('font-size', Math.min(64, 520 / Math.max(5, label.length) * 1.5)).attr('letter-spacing', 6).attr('fill', '#fff').attr('fill-opacity', 0.92).text(label);
  });
  bg.append('rect').attr('x', 0).attr('y', 0).attr('width', 1200).attr('height', VBH).attr('fill', '#fff').attr('filter', 'url(#fbTurf)').attr('opacity', 0.16);
  const paint = bg.append('g').attr('stroke', '#fff').attr('stroke-opacity', 0.88).attr('fill', 'none');
  paint.append('rect').attr('x', X(-60)).attr('y', PAD).attr('width', 1200).attr('height', F_W * U).attr('stroke-width', 5);
  d3.range(0, 101, 5).forEach((y) => paint.append('line').attr('x1', X(-50 + y)).attr('x2', X(-50 + y)).attr('y1', PAD).attr('y2', PAD + F_W * U).attr('stroke-width', y % 10 === 0 || y === 0 ? 2.6 : 1.8));
  const hash = college ? 6.67 : 3.08;
  d3.range(1, 100).forEach((y) => { if (y % 5) [[-HALF + 0.3, -HALF + 1], [-hash - 0.35, -hash + 0.35], [hash - 0.35, hash + 0.35], [HALF - 1, HALF - 0.3]].forEach(([a, b]) => paint.append('line').attr('x1', X(-50 + y)).attr('x2', X(-50 + y)).attr('y1', Z(a)).attr('y2', Z(b)).attr('stroke-width', 1.3)); });
  const nums = bg.append('g').attr('fill', '#fff').attr('fill-opacity', 0.9).attr('font-family', 'Georgia, Times New Roman, serif').attr('font-weight', 700).attr('font-size', 36).attr('text-anchor', 'middle');
  d3.range(10, 91, 10).forEach((y) => { const n = y <= 50 ? y : 100 - y, a = String(n)[0], b = String(n)[1];
    [[HALF - 11, 0], [-HALF + 11, 180]].forEach(([z, rot]) => { const g = nums.append('g').attr('transform', 'translate(' + X(-50 + y) + ',' + Z(z) + ') rotate(' + rot + ')');
      g.append('text').attr('x', -13).attr('y', 12).text(a); g.append('text').attr('x', 13).attr('y', 12).text(b);
      if (y !== 50) { const s = (y < 50 ? -1 : 1) * (rot ? -1 : 1); g.append('path').attr('d', 'M' + s * 30 + ',-2 l' + s * 9 + ',5 l' + -s * 9 + ',5 z'); } }); });
  bg.append('rect').attr('x', 0).attr('y', 0).attr('width', 1200).attr('height', VBH).attr('fill', 'url(#fbSheen)');
  /* ---- broadcast lines ---- */
  const bandLine = (x, color) => { const g = svg.append('g'); g.append('rect').attr('x', X(x) - 5).attr('y', PAD).attr('width', 10).attr('height', F_W * U).attr('fill', color).attr('opacity', 0.35).attr('filter', 'url(#fbGlow)'); g.append('rect').attr('x', X(x) - 1.8).attr('y', PAD).attr('width', 3.6).attr('height', F_W * U).attr('fill', color).attr('opacity', 0.95); };
  bandLine(m.xs, '#2f8dff'); if (m.firstX !== null) bandLine(m.firstX, '#ffd21f');
  if (m.downText) { const tg = svg.append('g').attr('transform', 'translate(' + (X(m.xs) - f * 44) + ',' + (PAD + 20) + ')'); tg.append('rect').attr('x', -40).attr('y', -13).attr('width', 80).attr('height', 26).attr('rx', 5).attr('fill', '#0b1626').attr('opacity', 0.86); tg.append('text').attr('text-anchor', 'middle').attr('y', 5.5).attr('fill', '#ffd21f').attr('font-family', 'system-ui,sans-serif').attr('font-weight', 800).attr('font-size', 15).text(m.downText.toUpperCase()); }
  /* ---- trails ---- */
  const toPath = (pts) => d3.line().x((p) => X(p.x)).y((p) => Z(p.z)).curve(d3.curveCatmullRom.alpha(0.5))(pts);
  const trail = (pts, color, w, dash) => { const g = svg.append('g'); if (pts.length < 2) return {set: () => {}}; const d = toPath(pts);
    g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', '#000').attr('stroke-opacity', 0.35).attr('stroke-width', w + 3).attr('stroke-linecap', 'round').attr('pathLength', 1).attr('stroke-dasharray', '0 1');
    g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', color).attr('stroke-width', w).attr('stroke-linecap', 'round').attr('pathLength', 1).attr('stroke-dasharray', '0 1');
    const ps = g.selectAll('path'); if (dash) g.attr('opacity', 0.9); return {set: (u) => ps.attr('stroke-dasharray', Math.max(0, Math.min(1, u)) + ' 1')}; };
  const routeTrail = trail(carrier, '#ffe14a', 4.5), flightTrail = trail(flight || [], '#ffffff', 2.2, true);
  const spot = svg.append('g').attr('transform', 'translate(' + X(endPt.x) + ',' + Z(endPt.z) + ')').attr('opacity', 0);
  spot.append('circle').attr('r', 13).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 2.5); spot.append('circle').attr('r', 4).attr('fill', '#fff');
  /* ---- players ---- */
  const layer = svg.append('g');
  const figure = (team, isAway, face, key) => {
    const jersey = isAway ? '#f4f5f7' : team.color, trim = isAway ? team.color : '#ffffff', g = layer.append('g');
    const body = g.append('g');
    body.append('ellipse').attr('cx', 3).attr('cy', 4.5).attr('rx', 9.5).attr('ry', 12.5).attr('fill', '#000').attr('opacity', 0.28);
    if (key) body.append('circle').attr('r', 17).attr('fill', 'none').attr('stroke', '#ffe14a').attr('stroke-width', 2.2).attr('opacity', 0.9);
    [-1, 1].forEach((s) => { body.append('ellipse').attr('cx', 2.5).attr('cy', s * 11.5).attr('rx', 5).attr('ry', 3.4).attr('fill', jersey).attr('stroke', 'rgba(0,0,0,.45)').attr('stroke-width', 0.8); body.append('circle').attr('cx', 7).attr('cy', s * 12.2).attr('r', 2.4).attr('fill', '#c98d63'); });
    body.append('rect').attr('x', -6.5).attr('y', -11).attr('width', 12).attr('height', 22).attr('rx', 5.5).attr('fill', jersey).attr('stroke', 'rgba(0,0,0,.5)').attr('stroke-width', 0.9);
    body.append('rect').attr('x', -6.5).attr('y', -11).attr('width', 3.2).attr('height', 22).attr('rx', 1.6).attr('fill', trim).attr('opacity', 0.85);
    body.append('circle').attr('cx', 2).attr('cy', 0).attr('r', 5.8).attr('fill', team.color).attr('stroke', 'rgba(0,0,0,.55)').attr('stroke-width', 0.9);
    body.append('rect').attr('x', -3.6).attr('y', -1).attr('width', 11).attr('height', 2).attr('rx', 1).attr('fill', '#fff').attr('opacity', 0.9);
    body.append('path').attr('d', 'M6.4,-3.6 Q9.6,0 6.4,3.6').attr('fill', 'none').attr('stroke', '#d9dde3').attr('stroke-width', 1.5).attr('stroke-linecap', 'round');
    body.append('ellipse').attr('cx', 0.5).attr('cy', -2.2).attr('rx', 2.6).attr('ry', 1.4).attr('fill', '#fff').attr('opacity', 0.28);
    return {g: g, body: body, face: face, label: null};
  };
  const place = (o, p, face) => { o.p = p; o.g.attr('transform', 'translate(' + X(p.x) + ',' + Z(p.z) + ')'); o.body.attr('transform', 'rotate(' + (face === undefined ? o.face : face) + ') scale(0.95)'); };
  const tag = (o, text) => { if (!text) return; const w = text.length * 7.4 + 14; const t = o.g.append('g').attr('transform', 'translate(0,-27)'); t.append('rect').attr('x', -w / 2).attr('y', -10).attr('width', w).attr('height', 19).attr('rx', 9.5).attr('fill', '#0b1626').attr('opacity', 0.88); t.append('text').attr('text-anchor', 'middle').attr('y', 4.2).attr('fill', '#fff').attr('font-family', 'system-ui,sans-serif').attr('font-weight', 700).attr('font-size', 12.5).text(text); };
  const offAway = m.off === m.away, offFace = f > 0 ? 0 : 180, defFace = f > 0 ? 180 : 0;
  const scrim = m.kind === 'pass' || m.kind === 'run' || m.kind === 'sack' || m.kind === 'other';
  const extras = [];
  const add = (team, isAway, face, start, end, key) => { const o = figure(team, isAway, face, key); o.a = start; o.b = end || start; place(o, start); extras.push(o); return o; };
  const ballEnd = endPt, toward = (p, k) => lerp(p, ballEnd, k);
  let qb = null, mover = null;
  if (scrim) {
    const olPush = m.kind === 'run' ? 1.6 : -1.3;
    [-4.4, -2.2, 0, 2.2, 4.4].forEach((z) => add(m.off, offAway, offFace, P(m.xs - f * 1.0, z), P(m.xs - f * 1.0 + f * olPush, z * 1.1)));
    add(m.off, offAway, offFace, P(m.xs - f * 1.0, -side * 6.6), P(m.xs + f * (m.kind === 'run' ? 2 : 6), -side * 8.5));
    add(m.off, offAway, offFace, P(m.xs - f * 0.4, -side * 20), P(m.xs + f * 14, -side * 19));
    add(m.off, offAway, offFace, P(m.xs - f * 1.4, -side * 12), P(m.xs + f * 9, -side * 6));
    if (m.kind !== 'run') add(m.off, offAway, offFace, P(m.xs - f * 6.5, -side * 2.2), P(m.xs - f * 5, -side * 3.5));
    if (m.kind !== 'pass') add(m.off, offAway, offFace, P(m.xs - f * 0.4, side * 20), P(m.xs + f * 8, side * 20));
    [-5.6, -1.9, 1.9, 5.6].forEach((z) => add(m.def, !offAway, defFace, P(m.xs + f * 1.3, z), toward(P(m.xs + f * (m.kind === 'run' ? 0.6 : -2.6), z * 0.9), 0.12)));
    [-7.5, 0, 7.5].forEach((z) => add(m.def, !offAway, defFace, P(m.xs + f * 5.2, z), toward(P(m.xs + f * 5.2, z), 0.3)));
    [-20, 20].forEach((z) => add(m.def, !offAway, defFace, P(m.xs + f * 6.5, z), toward(P(m.xs + f * 13, z), z * side > 0 ? 0.55 : 0.1)));
    [-9, 9].forEach((z) => add(m.def, !offAway, defFace, P(m.xs + f * 13.5, z), toward(P(m.xs + f * 16, z), 0.35)));
    qb = figure(m.off, offAway, offFace, m.kind !== 'run'); place(qb, qb0);
    if (m.kind !== 'sack' && m.kind !== 'other') { mover = figure(m.off, offAway, offFace, true); place(mover, carrier[0]); }
    if (m.kind === 'pass') { tag(qb, names.first); if (mover) tag(mover, names.to); } else if (m.kind === 'run') { if (mover) tag(mover, names.first); } else tag(qb, names.first);
  } else if (kick) { qb = figure(m.off, offAway, offFace, true); place(qb, flight[0]); tag(qb, names.first); }
  /* ---- ball ---- */
  const ballShadow = svg.append('ellipse').attr('rx', 6).attr('ry', 3.6).attr('fill', '#000').attr('opacity', 0.3);
  const ball = svg.append('g'); const ballIn = ball.append('g');
  ballIn.append('path').attr('d', 'M-8,0 Q0,-6.6 8,0 Q0,6.6 -8,0 Z').attr('fill', 'url(#fbBall)').attr('stroke', '#3a1d0b').attr('stroke-width', 0.8);
  ballIn.append('path').attr('d', 'M-3,0 H3 M-2,-1.4 V1.4 M0,-1.6 V1.6 M2,-1.4 V1.4').attr('stroke', '#fff').attr('stroke-width', 0.9).attr('fill', 'none');
  /* ---- result toast ---- */
  const word = m.score ? (m.kind === 'fg' ? 'FIELD GOAL' : 'TOUCHDOWN') : m.turnover ? 'TURNOVER' : m.kind === 'pass' && !m.complete ? 'INCOMPLETE' : m.kind === 'sack' ? 'SACK' : m.gain !== null && (m.kind === 'run' || m.kind === 'pass') ? (m.gain > 0 ? '+' : '') + m.gain + ' YDS' : m.kind === 'punt' ? 'PUNT' : m.kind === 'kickoff' ? 'KICKOFF' : '';
  const toast = svg.append('g').attr('opacity', 0);
  if (word) { const tw = word.length * 17 + 34, tx = X(vx) + VBW / 2; toast.attr('transform', 'translate(' + tx + ',' + (VBH - PAD - 30) + ')'); toast.append('rect').attr('x', -tw / 2).attr('y', -22).attr('width', tw).attr('height', 40).attr('rx', 8).attr('fill', '#0b1626').attr('opacity', 0.9); toast.append('rect').attr('x', -tw / 2).attr('y', -22).attr('width', 7).attr('height', 40).attr('rx', 3).attr('fill', m.off.color); toast.append('text').attr('text-anchor', 'middle').attr('x', 3).attr('y', 8).attr('fill', '#fff').attr('font-family', 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif').attr('font-size', 27).attr('letter-spacing', 2).text(word); }
  svg.append('rect').attr('x', X(vx)).attr('y', 0).attr('width', VBW).attr('height', VBH).attr('fill', 'url(#fbVig)').attr('pointer-events', 'none');
  el.appendChild(svg.node());
  /* ---- animation ---- */
  const along = (pts, u) => { const n = pts.length - 1, x = Math.max(0, Math.min(0.9999, u)) * n, i = Math.floor(x); return lerp(pts[i], pts[i + 1], x - i); };
  const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const heading = (a, b, fallback) => (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) < 0.01 ? fallback : Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI);
  const LOOP = 6.4; FBF.t0 = performance.now();
  const frame = (now) => {
    const t = FB_FIXED_T !== null ? FB_FIXED_T : ((now - FBF.t0) / 1000) % LOOP;
    const live = fbEase(seg(t, 0.8, 4.1));
    extras.forEach((o) => { const p = lerp(o.a, o.b, live); place(o, p, heading(o.a, o.b, o.face)); });
    let bp = endPt, bh = 0, bdir = offFace, ru = 0, fu = 0;
    if (m.kind === 'pass') {
      const q = lerp(qb0, qb1, fbEase(seg(t, 0.8, 1.7))); place(qb, q, heading(q, flight[1], offFace));
      const stemEnd = m.complete ? (carrier.length - 2) / (carrier.length - 1) : 1;
      ru = t < 2.8 ? fbEase(seg(t, 0.8, 2.8)) * stemEnd : stemEnd + seg(t, 2.8, 4.2) * (1 - stemEnd);
      const mp = along(carrier, ru), ahead = along(carrier, Math.min(1, ru + 0.03)); place(mover, mp, heading(mp, ahead, offFace));
      fu = seg(t, 1.8, 2.8);
      if (t < 1.8) { bp = P(q.x + f * 0.6, q.z + 0.5); } else if (t < 2.8) { bp = lerp(flight[0], flight[1], fu); bh = Math.sin(Math.PI * fu); bdir = heading(flight[0], flight[1], offFace); } else if (m.complete) { bp = P(mp.x + f * 0.5, mp.z + 0.5); } else { bp = lerp(flight[1], P(flight[1].x + f * 2.5, flight[1].z + side * 1.5), seg(t, 2.8, 3.4)); bh = 0.25 * Math.abs(Math.sin(seg(t, 2.8, 3.4) * Math.PI * 2)); }
    } else if (m.kind === 'run') {
      const q = lerp(qb0, P(m.xs - f * 4.2, 0.6), fbEase(seg(t, 0.8, 1.4))); place(qb, q);
      ru = fbEase(seg(t, 1.0, 4.1)); const mp = along(carrier, ru), ahead = along(carrier, Math.min(1, ru + 0.03)); place(mover, mp, heading(mp, ahead, offFace));
      bp = t < 1.4 ? P(q.x + f * 0.6, q.z + 0.5) : P(mp.x + f * 0.5, mp.z + 0.5);
    } else if (m.kind === 'sack') { ru = fbEase(seg(t, 0.8, 3.4)); const q = along(carrier, ru); place(qb, q); bp = P(q.x + f * 0.6, q.z + 0.5); }
    else if (kick) { fu = seg(t, 1.0, 4.0); bp = lerp(flight[0], flight[1], fu); bh = Math.sin(Math.PI * fu) * 1.7; bdir = heading(flight[0], flight[1], offFace); }
    routeTrail.set(ru); flightTrail.set(fu);
    const bx = X(bp.x), bz = Z(bp.z), lift = bh * 26, sc = 1 + bh * 0.9;
    ballShadow.attr('cx', bx + 2 + lift * 0.25).attr('cy', bz + 3 + lift * 0.5).attr('opacity', 0.3 - bh * 0.12).attr('rx', 6 * (1 + bh * 0.3));
    ball.attr('transform', 'translate(' + bx + ',' + (bz - lift) + ') rotate(' + bdir + ') scale(' + sc + ')'); ballIn.attr('transform', bh > 0.02 ? 'scale(1,' + (0.72 + 0.28 * Math.cos(now / 45)) + ')' : null);
    const done = seg(t, 4.1, 4.5); spot.attr('opacity', done).attr('transform', 'translate(' + X(endPt.x) + ',' + Z(endPt.z) + ') scale(' + (1 + 0.18 * Math.sin(now / 200)) + ')'); toast.attr('opacity', done);
    FBF.raf = requestAnimationFrame(frame);
  };
  FBF.raf = requestAnimationFrame(frame);
}

function fbShowPlay(card, m, note) {
  FBF.model = m;
  const cap = card.querySelector('.fb-fcap'), chips = card.querySelector('.fb-fchips'), stage = card.querySelector('.fb-fstage');
  const chip = (text, cls) => { const s = document.createElement('span'); s.className = 'fb-fchip' + (cls ? ' ' + cls : ''); s.textContent = text; return s; };
  const out = [chip(m.off.short + ' ball')];
  if (m.downText) out.push(chip(m.downText)); if (m.clock) out.push(chip(m.clock));
  const label = {pass: m.complete ? 'Pass complete' : m.turnover ? 'Intercepted' : 'Pass incomplete', run: 'Run', sack: 'Sack', punt: 'Punt', kickoff: 'Kickoff', fg: 'Field goal try', other: 'Play'}[m.kind];
  out.push(chip(label));
  if (m.gain !== null && (m.kind === 'run' || m.kind === 'sack' || m.complete)) out.push(chip((m.gain > 0 ? '+' : '') + m.gain + ' yards'));
  if (m.score) out.push(chip('Score', 'fb-fgood')); if (m.turnover) out.push(chip('Turnover', 'fb-fbad'));
  if (note) out.push(chip(note, 'fb-fbad'));
  chips.replaceChildren(...out); cap.textContent = m.text + (m.approx ? ' (Field position not in the feed, so the spot shown is approximate.)' : '');
  stage.hidden = false; fbBuild(stage, m);
}

const FB_SAMPLES = [
  {type: {text: 'Pass Reception'}, text: '(Shotgun) Q.Back pass deep right to W.Receiver for 27 yards. Sample play.', statYardage: 27, start: {down: 2, distance: 7, yardsToEndzone: 62, team: {id: 'A'}}, end: {yardsToEndzone: 35}, period: {number: 2}, clock: {displayValue: '8:41'}},
  {type: {text: 'Rush'}, text: 'R.Back left tackle for 9 yards. Sample play.', statYardage: 9, start: {down: 1, distance: 10, yardsToEndzone: 44, team: {id: 'H'}}, end: {yardsToEndzone: 35}, period: {number: 3}, clock: {displayValue: '11:02'}},
];
let fbSampleIx = 0;
const FB_FIXED_T = /[?&]t=([\d.]+)/.test(location.search) ? +location.search.match(/[?&]t=([\d.]+)/)[1] : null;

async function fbFieldTick() {
  const tab = document.querySelector('.fb-sec:not([hidden])'); if (!tab) return;
  const league = tab.id, card = tab.querySelector('.fb-field'); if (!card) return;
  const g = league === 'nfl' ? curGame() : curCfb(); if (!g) return;
  const sides = league === 'nfl' ? nflSides(g) : cfbSides(g); if (!sides) return;
  const l = liveOf(league, g), status = l ? l.status : 'scheduled';
  const idle = card.querySelector('.fb-fidle'), stage = card.querySelector('.fb-fstage'), key = league + '|' + g.id + '|' + status;
  const ctx = {homeId: l ? l.home_id : 'H', awayId: l ? l.away_id : 'A', home: sides[1], away: sides[0], college: league === 'cfb'};
  if (status !== 'live' && status !== 'final') {
    if (FBF.key !== key) { FBF.key = key; FBF.sample = false; if (FBF.raf) cancelAnimationFrame(FBF.raf); stage.hidden = true; card.querySelector('.fb-fchips').replaceChildren(); card.querySelector('.fb-fcap').textContent = ''; idle.hidden = false; }
    return;
  }
  idle.hidden = true;
  const due = FBF.key !== key || (status === 'live' && Date.now() - FBF.timer > 15000);
  if (!due) return;
  FBF.key = key; FBF.timer = Date.now();
  let summary = null;
  try { summary = await (await fetch('https://site.api.espn.com/apis/site/v2/sports/football/' + (league === 'nfl' ? 'nfl' : 'college-football') + '/summary?event=' + l.event_id, {cache: 'no-store'})).json(); } catch (e) { console.warn('play feed unavailable', e); }
  const pick = fbPickPlay(summary, l.situation);
  if (!pick) { stage.hidden = true; card.querySelector('.fb-fcap').textContent = 'No play-by-play is available for this game yet.'; return; }
  ctx.driveTeamId = pick.driveTeamId;
  const m = fbParsePlay(pick.play, ctx);
  if (!FBF.model || FBF.model.text !== m.text || stage.hidden) fbShowPlay(card, m, status === 'final' ? 'Last play of the game' : '');
}
document.querySelectorAll('.fb-fsample').forEach((b) => b.addEventListener('click', () => {
  const card = b.closest('.fb-field'), tab = b.closest('.fb-sec'), g = tab.id === 'nfl' ? curGame() : curCfb(); if (!g) return;
  const sides = tab.id === 'nfl' ? nflSides(g) : cfbSides(g); if (!sides) return;
  const m = fbParsePlay(FB_SAMPLES[fbSampleIx++ % FB_SAMPLES.length], {homeId: 'H', awayId: 'A', home: sides[1], away: sides[0], college: tab.id === 'cfb'});
  const lv = liveOf(tab.id, g); FBF.key = tab.id + '|' + g.id + '|' + (lv ? lv.status : 'scheduled'); FBF.sample = true; card.querySelectorAll('.fb-fidle p').forEach((x) => { x.hidden = true; }); fbShowPlay(card, m, 'Sample, not a real play');
}));
setInterval(() => { fbFieldTick().catch((e) => console.error(e)); }, 1000);
if (/[?&]sample\b/.test(location.search)) setTimeout(() => { const b = document.querySelector('.fb-sec:not([hidden]) .fb-fsample'); if (b) { if (/sample=2/.test(location.search)) fbSampleIx = 1; b.click(); } }, 600);
