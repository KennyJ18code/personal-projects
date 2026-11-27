/* 3D last-play field. Reconstructs the most recent play from ESPN play-by-play text and yard lines. */
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
    off: homeOff ? ctx.home : ctx.away, def: homeOff ? ctx.away : ctx.home, home: ctx.home, away: ctx.away, text: text,
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

function fbFieldTexture(m) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 533; const g = c.getContext('2d'), px = 10;
  for (let i = 0; i < 12; i++) { g.fillStyle = i === 0 ? m.away.color : i === 11 ? m.home.color : i % 2 ? '#2f7d3b' : '#2a7135'; g.fillRect(i * 100, 0, 100, 533); }
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.strokeRect(2, 2, 1196, 529);
  for (let y = 0; y <= 100; y += 5) { g.lineWidth = y % 10 ? 1.5 : 3; g.beginPath(); g.moveTo(100 + y * px, 0); g.lineTo(100 + y * px, 533); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 44px system-ui,sans-serif'; g.textAlign = 'center';
  for (let y = 10; y <= 90; y += 10) { const n = String(y <= 50 ? y : 100 - y); g.fillText(n, 100 + y * px, 468); g.save(); g.translate(100 + y * px, 65); g.rotate(Math.PI); g.fillText(n, 0, 0); g.restore(); }
  g.font = 'bold 54px system-ui,sans-serif';
  [[m.away.short, 50, -1], [m.home.short, 1150, 1]].forEach(([name, x, s]) => { g.save(); g.translate(x, 266); g.rotate(s * Math.PI / 2); g.fillStyle = '#fff'; g.fillText(String(name).slice(0, 14).toUpperCase(), 0, 18); g.restore(); });
  return new THREE.CanvasTexture(c);
}

function fbBuild(el, m) {
  if (FBF.raf) cancelAnimationFrame(FBF.raf);
  if (FBF.renderer) { FBF.renderer.dispose(); }
  el.replaceChildren();
  let renderer;
  try { renderer = new THREE.WebGLRenderer({antialias: true, alpha: true}); } catch (e) { el.textContent = 'This device could not start the 3D view.'; return; }
  const W = Math.max(280, el.clientWidth || 360), H = Math.round(Math.min(420, W * 0.62));
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H); el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', '3D replay of the last play: ' + m.text);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, W / H, 1, 600);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(-30, 80, 40); scene.add(sun);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.MeshLambertMaterial({color: 0x1d4d27})); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; scene.add(apron);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(F_LEN + 2 * EZ, F_W), new THREE.MeshLambertMaterial({map: fbFieldTexture(m)})); field.rotation.x = -Math.PI / 2; scene.add(field);
  const yellow = new THREE.MeshLambertMaterial({color: 0xf2c200});
  [-1, 1].forEach((s) => { const post = new THREE.Group(); const cyl = (r, h) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), yellow);
    const base = cyl(0.35, 10); base.position.y = 5; const bar = cyl(0.3, 18.5); bar.rotation.x = Math.PI / 2; bar.position.y = 10;
    const u1 = cyl(0.25, 20); u1.position.set(0, 20, -9.25); const u2 = cyl(0.25, 20); u2.position.set(0, 20, 9.25); post.add(base, bar, u1, u2); post.position.x = s * (50 + EZ); scene.add(post); });
  const stripe = (x, color, op) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, F_W), new THREE.MeshBasicMaterial({color: color, transparent: true, opacity: op})); s.position.set(x, 0.08, 0); scene.add(s); };
  stripe(m.xs, 0x3aa0ff, 0.95); if (m.firstX !== null) stripe(m.firstX, 0xffd400, 0.95);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 24), new THREE.MeshBasicMaterial({color: 0xffffff, side: THREE.DoubleSide})); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const man = (color, big) => { const g = new THREE.Group(); const mat = new THREE.MeshLambertMaterial({color: color});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 2.6, 10), mat); body.position.y = 1.3; const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshLambertMaterial({color: 0xf2f2f2})); head.position.y = 3.1;
    g.add(body, head); if (big) g.scale.set(1.25, 1.25, 1.25); scene.add(g); return g; };
  const f = m.dir, offC = new THREE.Color(m.off.color), defC = new THREE.Color(m.def.color);
  const scrimmage = m.kind === 'pass' || m.kind === 'run' || m.kind === 'sack' || m.kind === 'other';
  if (scrimmage) {
    [-6, -3, 0, 3, 6].forEach((z) => man(offC).position.set(m.xs - f * 0.8, 0, z));
    [-5, -1.7, 1.7, 5].forEach((z) => man(defC).position.set(m.xs + f * 1.2, 0, z));
    [[-8, 5], [0, 5.5], [8, 5], [-20, 7], [20, 7], [-7, 14], [7, 14]].forEach(([z, d]) => man(defC).position.set(m.xs + f * d, 0, z));
    [[-20, 0.6], [20, 0.6], [11, 1.4]].forEach(([z, d]) => { if (!(m.kind === 'pass' && Math.sign(z) === (m.lateral || 1) && Math.abs(z) === 20)) man(offC).position.set(m.xs - f * d, 0, z); });
  }
  const qb = man(offC, true), mover = man(offC, true);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshLambertMaterial({color: 0x8a4b22})); ball.scale.set(1.6, 1, 1); scene.add(ball);
  /* key frames */
  const V = (x, z, y) => new THREE.Vector3(x, y || 0, z);
  const lat = m.lateral, P = {};
  P.qb0 = V(m.xs - f * 1.6, 0); P.qb1 = V(m.xs - f * 7, lat * 1.5);
  let carrier = [], flight = null, kickH = 0;
  if (m.kind === 'pass') {
    const g0 = m.gain === null ? 6 : m.gain;
    let air = m.complete ? (m.deep ? Math.max(15, g0 * 0.75) : Math.min(Math.max(g0 * 0.6, -2), 9)) : (m.deep ? 24 : 8);
    if (m.complete) air = Math.min(air, Math.max(g0, -3));
    const zc = (lat || 0.35) * (m.deep ? 17 : 12);
    const catchPt = V(m.xs + f * air, zc), endPt = V(m.xe, zc * 0.8);
    const wr0 = V(m.xs - f * 0.6, (lat || 1) * 20);
    carrier = [wr0, V(m.xs + f * air * 0.65, (lat || 1) * 20), catchPt].concat(m.complete ? [endPt] : []);
    flight = [V(P.qb1.x, P.qb1.z, 2.4), V(catchPt.x, catchPt.z, 2.2)]; P.end = m.complete ? endPt : catchPt;
  } else if (m.kind === 'run') {
    const rb0 = V(m.xs - f * 6.5, 1.5);
    carrier = [rb0, V(m.xs - f * 3, m.gapZ * 0.5), V(m.xs + f * 0.5, m.gapZ), V(m.xe, m.gapZ * 1.25)]; P.end = carrier[3];
  } else if (m.kind === 'sack') { carrier = [P.qb0, P.qb1, V(m.xe, lat * 3)]; P.end = carrier[2]; }
  else if (m.kind === 'punt' || m.kind === 'kickoff' || m.kind === 'fg') {
    const from = V(m.xs - f * (m.kind === 'punt' ? 13 : m.kind === 'fg' ? 7 : 0), 0, 0.5), to = m.kind === 'fg' ? V(f * (50 + EZ), 0, m.score ? 12 : 4) : V(m.xe, lat * 8, 0.5);
    flight = [from, to]; kickH = m.kind === 'fg' ? 9 : 22; P.end = V(to.x, to.z); carrier = [V(from.x, from.z), V(from.x, from.z)];
  } else { carrier = [P.qb0, P.qb0]; P.end = V(m.xe, 0); }
  ring.position.set(P.end.x, 0.1, P.end.z);
  const pathPts = (pts) => { const out = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 16; k++) out.push(pts[i].clone().lerp(pts[i + 1], k / 16)); out.push(pts[pts.length - 1].clone()); return out; };
  const route = pathPts(carrier).map((p) => V(p.x, p.z, 0.25));
  const arcAt = (u) => { const p = flight[0].clone().lerp(flight[1], u); const dist = flight[0].distanceTo(flight[1]); p.y += Math.sin(Math.PI * u) * (kickH || (1.5 + dist * 0.17)); return p; };
  const arc = flight ? d3.range(41).map((i) => arcAt(i / 40)) : [];
  const SEGS = 64;
  const tube = (pts, color, r) => { const ok = pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) > 0.5; const geo = ok ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), SEGS, r, 6, false) : new THREE.BufferGeometry(); const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: color})); mesh.visible = ok; scene.add(mesh); return {geometry: {setDrawRange: (a, n, total) => { if (ok) geo.setDrawRange(0, Math.round(SEGS * (total ? n / total : 0)) * 36); }}}; };
  const routeT = tube(route, 0xffffff, 0.32), arcT = tube(arc, 0xffd24a, 0.26);
  const routeLine = {geometry: {setDrawRange: (a, n) => routeT.geometry.setDrawRange(a, n, route.length)}}, arcLine = {geometry: {setDrawRange: (a, n) => arcT.geometry.setDrawRange(a, n, 41)}};
  const midX = (m.xs + P.end.x) / 2, span = Math.max(26, Math.abs(P.end.x - m.xs) + 22);
  cam.position.set(midX - f * span * 0.18, span * 0.85 + 6, span * 1.0 + 14); cam.lookAt(midX + f * 2, 0, -2);
  const along = (pts, u) => { const n = pts.length - 1, x = Math.max(0, Math.min(0.9999, u)) * n, i = Math.floor(x); return pts[i].clone().lerp(pts[i + 1], x - i); };
  const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const LOOP = 6.2;
  FBF.renderer = renderer; FBF.t0 = performance.now();
  const frame = (now) => {
    const t = FB_FIXED_T !== null ? FB_FIXED_T : ((now - FBF.t0) / 1000) % LOOP;
    qb.position.copy(P.qb0); mover.visible = m.kind !== 'sack' && m.kind !== 'other' && !flight || m.kind === 'pass';
    let ballPos;
    if (m.kind === 'pass') {
      qb.position.copy(P.qb0.clone().lerp(P.qb1, seg(t, 0.7, 1.6)));
      const stemEnd = m.complete ? (carrier.length - 2) / (carrier.length - 1) : 1;
      const u = t < 2.7 ? seg(t, 0.7, 2.7) * stemEnd : stemEnd + seg(t, 2.7, 4.1) * (1 - stemEnd);
      mover.position.copy(along(carrier, u));
      ballPos = t < 1.7 ? V(qb.position.x, qb.position.z, 2.2) : t < 2.7 ? arcAt(seg(t, 1.7, 2.7)) : m.complete ? V(mover.position.x, mover.position.z, 2.2) : V(flight[1].x, flight[1].z, 0.5);
      arcLine.geometry.setDrawRange(0, Math.round(41 * seg(t, 1.7, 2.7))); routeLine.geometry.setDrawRange(0, Math.round(route.length * u));
    } else if (m.kind === 'run') {
      qb.position.copy(P.qb0.clone().lerp(V(m.xs - f * 4, 0.5), seg(t, 0.7, 1.3)));
      const u = seg(t, 0.9, 3.9); mover.position.copy(along(carrier, u)); ballPos = t < 1.3 ? V(qb.position.x, qb.position.z, 2.2) : V(mover.position.x, mover.position.z, 2.2);
      routeLine.geometry.setDrawRange(0, Math.round(route.length * u)); arcLine.geometry.setDrawRange(0, 0);
    } else if (m.kind === 'sack') {
      const u = seg(t, 0.7, 3.2); qb.position.copy(along(carrier, u)); mover.visible = false; ballPos = V(qb.position.x, qb.position.z, 2.2);
      routeLine.geometry.setDrawRange(0, Math.round(route.length * u)); arcLine.geometry.setDrawRange(0, 0);
    } else if (flight) {
      const u = seg(t, 0.9, 3.9); qb.position.set(flight[0].x, 0, flight[0].z); mover.visible = false; ballPos = arcAt(u);
      arcLine.geometry.setDrawRange(0, Math.round(41 * u)); routeLine.geometry.setDrawRange(0, 0);
    } else { mover.visible = false; ballPos = V(P.end.x, P.end.z, 0.6); routeLine.geometry.setDrawRange(0, 0); arcLine.geometry.setDrawRange(0, 0); }
    ball.position.copy(ballPos); ball.rotation.y += 0.25;
    ring.scale.setScalar(1 + 0.25 * Math.sin(now / 220));
    renderer.render(scene, cam);
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
  {type: {text: 'Pass Reception'}, text: 'Sample play: quarterback pass deep right to the wide receiver for 27 yards.', statYardage: 27, start: {down: 2, distance: 7, yardsToEndzone: 62, team: {id: 'A'}}, end: {yardsToEndzone: 35}, period: {number: 2}, clock: {displayValue: '8:41'}},
  {type: {text: 'Rush'}, text: 'Sample play: running back runs off left tackle for 9 yards.', statYardage: 9, start: {down: 1, distance: 10, yardsToEndzone: 44, team: {id: 'H'}}, end: {yardsToEndzone: 35}, period: {number: 3}, clock: {displayValue: '11:02'}},
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
  const ctx = {homeId: l ? l.home_id : 'H', awayId: l ? l.away_id : 'A', home: sides[1], away: sides[0]};
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
  const m = fbParsePlay(FB_SAMPLES[fbSampleIx++ % FB_SAMPLES.length], {homeId: 'H', awayId: 'A', home: sides[1], away: sides[0]});
  const lv = liveOf(tab.id, g); FBF.key = tab.id + '|' + g.id + '|' + (lv ? lv.status : 'scheduled'); FBF.sample = true; card.querySelectorAll('.fb-fidle p').forEach((x) => { x.hidden = true; }); fbShowPlay(card, m, 'Sample, not a real play');
}));
setInterval(() => { fbFieldTick().catch((e) => console.error(e)); }, 1000);
if (/[?&]sample\b/.test(location.search)) setTimeout(() => { const b = document.querySelector('.fb-sec:not([hidden]) .fb-fsample'); if (b) { if (/sample=2/.test(location.search)) fbSampleIx = 1; b.click(); } }, 600);
