(function () {
'use strict';
const E = window.Engine, $ = s => document.querySelector(s);
const CODES = { uh60m: '60M', uh60l: '60L', ch47f: '47F', ah64e: '64E', uh72a: '72A', hh60w: '60W', c130j30: '130J', c27j: '27J', c17a: 'C17', c5m: 'C5M', kc135r: '135R', kc46a: '46A', custom: 'CUST' };
const DEF = window.AIRFRAMES.map(a => ({ ...a, burnAlt: a.cruiseAlt, code: CODES[a.id] || a.id }));
const KEY = 'amp-state-v1';
const FIELDS = window.AIRFIELDS.map(f => ({ ...f, mil: true })), FMAP = new Map(FIELDS.map(f => [f.icao, f]));
(window.CIVIL_FIELDS || []).forEach(a => { if (!FMAP.has(a[0])) { const f = { icao: a[0], name: a[1] + ', ' + a[5], lat: a[2], lon: a[3], elev: a[4], mil: false }; FIELDS.push(f); FMAP.set(f.icao, f); } });
FIELDS.forEach(f => { const a = f.lat * Math.PI / 180, b = f.lon * Math.PI / 180; f.u = [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)]; f.up = f.name.toUpperCase(); });
const C = { green: 0x39d877, bright: 0xd2ffe0, dim: 0x1d5a3a, amber: 0xe8b64c, red: 0xff5d4f };
const CSS = { ink: '#9fe6b6', green: '#39d877', bright: '#d2ffe0', dim: '#5a9a74', amber: '#e8b64c', red: '#ff5d4f' };

const fmt = n => isFinite(n) ? Math.round(n).toLocaleString('en-US') : '-';
const hm = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const fmtK = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(n / 1e3) + 'k' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : a >= 10 || a === 0 ? String(Math.round(n)) : n.toFixed(1); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fld = icao => FMAP.get(icao);
const wpFrom = (f, type, payload) => ({ name: f.icao, lat: f.lat, lon: f.lon, elev: f.elev, oat: 15, type, payload, sling: false });

// ---------- state ----------
let S = {
  tempUnit: 'C', primary: 'uh60m', compare: ['uh60m', 'ch47f', 'ah64e'], yMode: 'pct', metric: 'range', edit: 'uh60m', overrides: {},
  mission: {
    wps: [wpFrom(fld('KHOP'), 'fuel', 3000), wpFrom(fld('KFTK'), 'fuel', 3000), wpFrom(fld('KFFO'), 'fuel', 2000),
      { name: 'FARP 1', lat: 39.30, lon: -80.23, elev: 1200, oat: 15, type: 'fuel', payload: 2000, sling: false }, wpFrom(fld('KADW'), 'stop', 0)],
    wind: { dir: 270, spd: 15 }, policy: 'full', requireOGE: true, aux: {}
  }
};
try { const t = JSON.parse(localStorage.getItem(KEY) || 'null'); if (t && t.mission && Array.isArray(t.mission.wps)) S = { ...S, ...t, mission: { ...S.mission, ...t.mission } }; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

let AFS = [], RES = {}, MIS = null, R = null;
const afById = id => AFS.find(a => a.id === id) || AFS[0];
function mission() {
  const w = S.mission.wps.map(x => ({ ...x }));
  if (w.length) { w[0].type = 'fuel'; if (w.length > 1) w[w.length - 1].type = 'stop'; }
  return { ...S.mission, wps: w };
}
function compute() {
  AFS = DEF.map(d => ({ ...d, ...(S.overrides[d.id] || {}) }));
  if (!AFS.some(a => a.id === S.primary)) S.primary = AFS[0].id;
  S.compare = S.compare.filter(id => AFS.some(a => a.id === id)); if (!S.compare.length) S.compare = [S.primary];
  MIS = mission(); RES = {};
  for (const a of AFS) RES[a.id] = E.analyze(a, MIS);
  R = RES[S.primary];
}
const tOut = c => { const v = S.tempUnit === 'F' ? c * 9 / 5 + 32 : +c; return Math.round(v * 10) / 10; };
const tIn = v => S.tempUnit === 'F' ? (v - 32) * 5 / 9 : v;
const compared = () => [S.primary, ...S.compare.filter(id => id !== S.primary)];

// ---------- coordinate entry ----------
function mgrsOf(lat, lon) { try { const m = window.mgrs.forward([lon, lat], 4); return m.replace(/^(\d{1,2}[A-Z])([A-Z]{2})(\d{4})(\d{4})$/, '$1 $2 $3 $4'); } catch (e) { return ''; } }
function parsePoint(raw) {
  const s = raw.trim(); if (!s) return null;
  const up = s.toUpperCase(), tok = up.split(/\s+/)[0];
  const f = fld(tok) || fld(up) || (/^[A-Z0-9]{3}$/.test(tok) ? fld('K' + tok) : null); if (f) return { name: f.icao, lat: f.lat, lon: f.lon, elev: f.elev };
  const tight = up.replace(/\s+/g, '');
  if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(\d\d){1,5}$/.test(tight)) {
    try { const p = window.mgrs.toPoint(tight); if (isFinite(p[0]) && isFinite(p[1])) return { lat: p[1], lon: p[0] }; } catch (e) {}
  }
  if (/[NS]/.test(up) && /[EW]/.test(up) && !/[A-DF-MO-RT-VX-Z]/.test(up)) {
    const nums = (up.match(/\d+(?:\.\d+)?/g) || []).map(Number), h = nums.length / 2;
    if (h === 1 || h === 2 || h === 3) {
      const dec = a => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
      const latFirst = up.search(/[NS]/) < up.search(/[EW]/);
      const A = dec(nums.slice(0, h)), B = dec(nums.slice(h));
      let lat = latFirst ? A : B, lon = latFirst ? B : A;
      if (up.includes('S')) lat = -lat; if (up.includes('W')) lon = -lon;
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
  }
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
  if (s.length >= 3) { const g = FIELDS.find(x => x.up.startsWith(up)) || FIELDS.find(x => x.up.includes(up)); if (g) return { name: g.icao, lat: g.lat, lon: g.lon, elev: g.elev }; }
  return null;
}
function addWp(p, at) {
  const w = S.mission.wps, n = w.length;
  const wp = { name: p.name || 'WP ' + (n + 1), lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), elev: p.elev || 0, oat: n ? w[n - 1].oat : 15, type: p.type || 'stop', payload: 0, sling: false };
  if (at == null) {
    if (n >= 2) { w[n - 1].payload = w[n - 1].payload || w[n - 2].payload || 0; }
    w.push(wp);
  } else { wp.payload = w[at - 1].payload; wp.sling = w[at - 1].sling; w.splice(at, 0, wp); }
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 6000); }

function suggestFuelStop() {
  const b = R && R.bingo; if (!b) return;
  const w = MIS.wps, a = w[b.leg], z = w[b.leg + 1], d = E.gcDist(a, z), reach = b.frac * d * 0.97;
  let best = null;
  for (const f of FIELDS) {
    const d1 = E.gcDist(a, f), d2 = E.gcDist(f, z);
    if (d1 < 5 || d1 > reach || d2 >= d) continue;
    const cost = d1 + d2 - d1 * 0.15; if (!best || cost < best.cost) best = { f, cost };
  }
  if (!best) return toast('No listed airfield is within reach on that leg. Tap the map near the red marker to place a fuel point, add aux tanks, or cut payload.');
  addWp({ name: best.f.icao, lat: best.f.lat, lon: best.f.lon, elev: best.f.elev, type: 'fuel' }, b.leg + 1);
  toast('Added ' + best.f.icao + ' (' + best.f.name + ') as a fuel stop.'); update();
}

// ---------- DOM rendering ----------
function renderHeader() {
  const groups = {}; AFS.forEach(a => (groups[a.group] = groups[a.group] || []).push(a));
  const opts = Object.keys(groups).map(g => `<optgroup label="${esc(g)}">${groups[g].map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</optgroup>`).join('');
  $('#primary').innerHTML = opts; $('#primary').value = S.primary;
  $('#edsel').innerHTML = opts; $('#edsel').value = S.edit;
  const st = $('#status');
  if (!R.legs.length) { st.className = 'pill caution'; st.textContent = 'ADD WAYPOINTS'; }
  else if (!R.feasible) { st.className = 'pill warn'; st.textContent = R.bingo ? 'FUEL REQUIRED' : 'OVERWEIGHT'; }
  else if (R.warnings.length) { st.className = 'pill caution'; st.textContent = 'CAUTION'; }
  else { st.className = 'pill ok'; st.textContent = 'PLAN OK'; }
}
function renderTiles() {
  const t = R.totals, has = R.legs.length > 0, last = has ? R.legs[R.legs.length - 1] : null;
  const m = R.minPayMargin, low = has && R.landFuel < last.reserve - 1;
  const tile = (v, l, c) => `<div class="tile ${c || ''}"><b>${v}</b><span>${l}</span></div>`;
  $('#tiles').innerHTML = [
    tile(has ? fmt(t.dist) + ' nm' : '-', 'Distance'), tile(has ? hm(t.time) : '-', 'Flight time'),
    tile(has ? fmt(t.burn) + ' lb' : '-', 'Fuel burned'), tile(has ? t.fuelStops : '-', 'Refuels en route', R.bingo ? 'warn' : ''),
    tile(has ? (m >= 0 ? '+' : '') + fmt(m) + ' lb' : '-', 'Tightest payload margin', m < 0 ? 'warn' : ''),
    tile(has ? fmt(R.landFuel) + ' lb' : '-', 'Landing fuel', low ? 'warn' : '')
  ].join('');
}
function renderMsgs() {
  let h = R.warnings.map(w => `<li class="${w.lvl === 'warn' ? 'warn' : ''}">${esc(w.msg)}</li>`).join('');
  if (R.bingo) h += `<li class="warn"><button type="button" id="suggest">Add a fuel stop from the airfield list</button></li>`;
  if (!R.warnings.length && R.legs.length) { const L = R.legs[R.legs.length - 1]; h = `<li class="ok">${esc(R.af.name)} flies this plan as entered and lands with ${fmt(R.landFuel)} lb against a ${fmt(L.reserve)} lb reserve.</li>`; }
  if (!R.legs.length) h = '<li>Add at least two waypoints to build a route.</li>';
  $('#msgs').innerHTML = h;
}
function renderSetup() {
  const af = R.af, m = S.mission, aux = af.aux || [];
  $('#setup').innerHTML =
    (aux.length ? `<label class="wide" for="s-aux">Aux fuel<select id="s-aux" data-k="aux"><option value="">None</option>${aux.map(x => `<option value="${x.id}" ${m.aux[af.id] === x.id ? 'selected' : ''}>${esc(x.name)} (+${fmt(x.fuel)} lb)</option>`).join('')}</select></label>` : '') +
    `<div class="wide" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)">Fuel at each stop</span>
      <div class="seg"><button type="button" data-pol="full" class="${m.policy !== 'min' ? 'on' : ''}">Fill tanks</button><button type="button" data-pol="min" class="${m.policy === 'min' ? 'on' : ''}">Minimum needed</button></div></div>
    <label for="s-wd">Wind from &deg;<input id="s-wd" type="number" min="0" max="360" data-k="wdir" value="${m.wind.dir}"></label>
    <label for="s-ws">Wind kt<input id="s-ws" type="number" min="0" max="150" data-k="wspd" value="${m.wind.spd}"></label>
    <label for="s-oat">Set all OAT &deg;${S.tempUnit}<input id="s-oat" type="number" step="any" data-k="alloat" placeholder="e.g. ${S.tempUnit === 'F' ? 95 : 35}"></label>
    <div style="display:flex;flex-direction:column;gap:4px;flex:1 1 110px"><span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)">Temperature</span>
      <div class="seg"><button type="button" data-tu="C" class="${S.tempUnit !== 'F' ? 'on' : ''}">&deg;C</button><button type="button" data-tu="F" class="${S.tempUnit === 'F' ? 'on' : ''}">&deg;F</button></div></div>
    ${af.role === 'helo' ? `<label class="chk wide" for="s-oge"><input id="s-oge" type="checkbox" data-k="oge" ${m.requireOGE ? 'checked' : ''}>Require hover out of ground effect at every landing zone</label>` : ''}`;
}
const TYPES = { stop: 'Land, no fuel', fuel: 'Land and refuel', aar: 'Air refuel', turn: 'Turn point' };
function renderWps() {
  const w = MIS.wps, n = w.length; let h = '';
  w.forEach((p, i) => {
    const first = i === 0, last = i === n - 1 && n > 1, ground = E.grounded(p);
    const da = E.densityAlt(+p.elev || 0, +p.oat), stop = R.stops.find(s => s.wp === i);
    const typeSel = first ? '<select disabled aria-label="Type"><option>Origin</option></select>' : last ? '<select disabled aria-label="Type"><option>Destination</option></select>'
      : `<select id="wp${i}-type" data-i="${i}" data-f="type" aria-label="Waypoint type">${Object.keys(TYPES).map(k => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${TYPES[k]}</option>`).join('')}</select>`;
    h += `<li class="wp"><div class="wp-head"><span class="wp-n">${i + 1}</span>
      <input id="wp${i}-name" data-i="${i}" data-f="name" value="${esc(p.name)}" aria-label="Waypoint name">
      <button type="button" data-i="${i}" data-act="up" aria-label="Move up" ${first ? 'disabled' : ''}>&#9650;</button>
      <button type="button" data-i="${i}" data-act="down" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>&#9660;</button>
      <button type="button" data-i="${i}" data-act="del" aria-label="Remove waypoint">&#10005;</button></div>
      <div class="wp-sub">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)} &middot; ${esc(mgrsOf(p.lat, p.lon))} &middot; density alt ${fmt(da)} ft</div>
      ${stop && R.legs.length ? `<div class="wp-fuel">${stop.type === 'origin' ? 'Load' : 'Arrive ' + fmt(stop.arrFuel) + ' lb, take on'} ${fmt(stop.uplift)} lb, depart with ${fmt(stop.depFuel)} lb</div>` : ''}
      <div class="wp-fields">${typeSel.replace('<select', '<label>Type<select').replace('</select>', '</select></label>')}
        <label for="wp${i}-elev">Elev ft<input id="wp${i}-elev" type="number" data-i="${i}" data-f="elev" value="${p.elev}"></label>
        <label for="wp${i}-oat">OAT &deg;${S.tempUnit}<input id="wp${i}-oat" type="number" step="any" data-i="${i}" data-f="oat" value="${tOut(p.oat)}"></label>
        ${!last && ground ? `<label for="wp${i}-ru">Run-up min<input id="wp${i}-ru" type="number" min="0" step="1" data-i="${i}" data-f="runup" value="${p.runup == null ? '' : p.runup}" placeholder="${R.af.runupMin}"></label>
        <label for="wp${i}-tx">Taxi out min<input id="wp${i}-tx" type="number" min="0" step="1" data-i="${i}" data-f="taxi" value="${p.taxi == null ? '' : p.taxi}" placeholder="${R.af.taxiOutMin}"></label>` : ''}
        ${!first && ground ? `<label for="wp${i}-ti">Taxi in min<input id="wp${i}-ti" type="number" min="0" step="1" data-i="${i}" data-f="taxiIn" value="${p.taxiIn == null ? '' : p.taxiIn}" placeholder="${R.af.taxiInMin}"></label>` : ''}
        ${!last && ground ? `<label for="wp${i}-pay">Payload out lb<input id="wp${i}-pay" type="number" min="0" step="100" data-i="${i}" data-f="payload" value="${p.payload}"></label>
        ${R.af.role === 'helo' ? `<label class="chk" for="wp${i}-sl"><input id="wp${i}-sl" type="checkbox" data-i="${i}" data-f="sling" ${p.sling ? 'checked' : ''}>Sling</label>` : ''}` : ''}
      </div></li>`;
    const L = R.legs[i];
    if (L) {
      const mg = L.payMax - L.payload, cls = mg < 0 ? 'bad' : mg < L.payMax * 0.1 ? 'mid' : '';
      h += `<li class="leg"><span><i>Leg ${i + 1}</i> <b>${fmt(L.dist)} nm</b></span><span><i>crs</i> ${String(Math.round(L.crs)).padStart(3, '0')}&deg;</span>
        <span><i>GS</i> ${fmt(L.gs)} kt</span><span><i>time</i> ${hm(L.time)}</span>
        ${L.go ? `<span><i>start</i> ${fmt(L.go.start)}</span><span><i>run-up ${L.go.runupMin} min</i> ${fmt(L.go.runup)}</span><span><i>taxi ${L.go.taxiMin} min</i> ${fmt(L.go.taxi)}</span><span><i>takeoff/climb</i> ${fmt(L.go.climb)}</span>` : ''}
        <span><i>cruise</i> ${fmt(L.cruise)}</span>${L.tin ? `<span><i>taxi in</i> ${fmt(L.tin)}</span>` : ''}<span><i>leg total</i> <b>${fmt(L.burn)} lb</b></span>
        <span class="${L.fuelArr < L.reserve - 1 ? 'bad' : ''}"><i>touch down with</i> ${fmt(Math.max(0, L.fuelArr))} lb</span>
        <span class="${cls}"><i>can carry</i> <b>${fmt(L.payMax)} lb</b> <i>(${L.payLimiter})</i></span></li>`;
    }
  });
  $('#wps').innerHTML = h;
}
function chips(sel) {
  $(sel).innerHTML = AFS.map(a => `<button type="button" data-cmp="${a.id}" class="${a.id === S.primary || S.compare.includes(a.id) ? 'on' : ''}" ${a.id === S.primary ? 'disabled title="Selected airframe"' : ''}>${esc(a.name.split(' ')[0])}</button>`).join('');
}
function renderFuelView() {
  chips('#cmp-fuel');
  document.querySelectorAll('#ymode button').forEach(b => b.classList.toggle('on', b.dataset.m === S.yMode));
  $('#fuel-h').textContent = 'Fuel plan, ' + R.af.name;
  let h = '<tr><th>Waypoint</th><th>Arrive lb</th><th>Take on lb</th><th>Depart lb</th><th>Minimum lb</th><th>Spare lb</th></tr>';
  for (const s of R.stops) {
    const w = MIS.wps[s.wp], spare = s.depFuel - s.required;
    h += `<tr><td>${s.wp + 1} ${esc(w.name)}${s.type === 'aar' ? ' (air)' : ''}</td><td>${s.type === 'origin' ? '-' : fmt(s.arrFuel)}</td><td>${fmt(s.uplift)}</td><td>${fmt(s.depFuel)}</td>
      <td class="${s.short ? 'bad' : ''}">${fmt(s.required)}</td><td class="${spare < -1 ? 'bad' : ''}">${fmt(spare)}</td></tr>`;
  }
  if (R.legs.length) { const L = R.legs[R.legs.length - 1]; h += `<tr><td>${MIS.wps.length} ${esc(L.to)} (land)</td><td class="${R.landFuel < L.reserve - 1 ? 'bad' : ''}">${fmt(R.landFuel)}</td><td>-</td><td>-</td><td>${fmt(L.reserve)}</td><td>${fmt(R.landFuel - L.reserve)}</td></tr>`; }
  $('#t-fuel').innerHTML = h;
  const P = R.totals.phase, z = v => v ? fmt(v) : '-';
  let g = '<tr><th>Leg</th><th>Start</th><th>Run-up</th><th>Taxi out</th><th>Takeoff/climb</th><th>Cruise</th><th>Taxi in</th><th>Total lb</th></tr>';
  for (const L of R.legs) g += `<tr><td>${L.k + 1} ${esc(L.from)} to ${esc(L.to)}</td><td>${L.go ? z(L.go.start) : '-'}</td><td>${L.go ? z(L.go.runup) + ' (' + L.go.runupMin + ' min)' : '-'}</td><td>${L.go ? z(L.go.taxi) + ' (' + L.go.taxiMin + ' min)' : '-'}</td><td>${L.go ? z(L.go.climb) : '-'}</td><td>${fmt(L.cruise)}</td><td>${z(L.tin)}</td><td>${fmt(L.burn)}</td></tr>`;
  if (R.legs.length) g += `<tr class="sel"><td>Mission</td><td>${z(P.start)}</td><td>${z(P.runup)}</td><td>${z(P.taxi)}</td><td>${z(P.climb)}</td><td>${fmt(P.cruise)}</td><td>${z(P.taxiIn)}</td><td>${fmt(R.totals.burn)}</td></tr>`;
  $('#t-phase').innerHTML = g;
}
function renderPayView() {
  chips('#cmp-pay');
  $('#pay-h').textContent = 'Leg weights, ' + R.af.name;
  let h = '<tr><th>Leg</th><th>Planned lb</th><th>Can carry lb</th><th>Limited by</th><th>Takeoff wt</th><th>Limit</th><th>Density alt</th></tr>';
  for (const L of R.legs) h += `<tr><td>${L.k + 1} ${esc(L.from)} to ${esc(L.to)}${L.sling ? ' (sling)' : ''}</td><td>${fmt(L.payload)}</td><td class="${L.payMax < L.payload ? 'bad' : ''}">${fmt(L.payMax)}</td>
    <td class="dimc">${L.payLimiter}</td><td class="${L.tow > L.limDep + 1 ? 'bad' : ''}">${fmt(L.tow)}</td><td>${fmt(L.limDep)}</td><td>${fmt(L.daDep)} ft</td></tr>`;
  $('#t-pay').innerHTML = h;
}
function fleetMetric(a, r) {
  const w0 = MIS.wps[0] || { elev: 0, oat: 15, payload: 0 };
  if (S.metric === 'range') return E.rangeAt(a, MIS, { payload: +w0.payload || 0, sling: !!w0.sling && a.hook > 0, elev: +w0.elev || 0, oat: +w0.oat }).range;
  if (S.metric === 'pay') return r.legs.length ? Math.min(...r.legs.map(L => L.payMax)) : 0;
  if (S.metric === 'burn') return r.totals.burn;
  return r.totals.time;
}
function renderFleetView() {
  $('#metric').value = S.metric;
  const w0 = MIS.wps[0] || { elev: 0, oat: 15, payload: 0 };
  let h = '<tr><th>Airframe</th><th>Status</th><th>Range nm</th><th>Burn lb</th><th>Time</th><th>Fuel short lb</th><th>Tightest payload lb</th><th>Compare</th><th></th></tr>';
  for (const a of AFS) {
    const r = RES[a.id], rng = E.rangeAt(a, MIS, { payload: +w0.payload || 0, sling: false, elev: +w0.elev || 0, oat: +w0.oat }).range;
    const st = !r.legs.length ? '-' : !r.feasible ? (r.bingo ? 'Fuel required' : 'Overweight') : r.warnings.length ? 'Caution' : 'OK';
    const cls = st === 'OK' ? '' : st === 'Caution' ? 'mid' : 'bad', short = r.bingo ? r.bingo.short : 0;
    h += `<tr class="${a.id === S.primary ? 'sel' : ''}"><td>${esc(a.name)}</td><td class="${cls}">${st}</td><td>${fmt(rng)}</td><td>${fmt(r.totals.burn)}</td><td>${hm(r.totals.time)}</td>
      <td class="${short ? 'bad' : 'dimc'}">${short ? fmt(short) : '-'}</td><td class="${r.minPayMargin < 0 ? 'bad' : ''}">${r.legs.length ? fmt(Math.min(...r.legs.map(L => L.payMax))) : '-'}</td>
      <td><input type="checkbox" id="fc-${a.id}" data-cmpbox="${a.id}" aria-label="Compare ${esc(a.name)}" ${a.id === S.primary || S.compare.includes(a.id) ? 'checked' : ''} ${a.id === S.primary ? 'disabled' : ''}></td>
      <td><button type="button" data-use="${a.id}" ${a.id === S.primary ? 'disabled' : ''}>${a.id === S.primary ? 'In use' : 'Use'}</button></td></tr>`;
  }
  $('#t-fleet').innerHTML = h;
}
const EDF = [
  ['oew', 'Empty weight lb'], ['crew', 'Crew and kit lb'], ['mgw', 'Max gross weight lb'], ['mgwExt', 'Max gross with sling lb', 'helo'],
  ['maxPayload', 'Max internal payload lb'], ['hook', 'Cargo hook limit lb', 'helo'], ['fuel', 'Internal fuel lb'], ['cruise', 'Cruise speed KTAS'],
  ['slingSpeed', 'Sling load speed kt', 'helo'], ['burn', 'Cruise fuel burn lb/hr'], ['burnRefW', 'Burn quoted at weight lb'], ['cruiseAlt', 'Cruise altitude ft'],
  ['startFuel', 'Engine start and APU lb'], ['idleBurn', 'Run-up burn lb/hr'], ['runupMin', 'Run-up minutes'], ['taxiBurn', 'Taxi burn lb/hr'], ['taxiOutMin', 'Taxi out minutes'], ['taxiInMin', 'Taxi in minutes'], ['climbFuel', 'Takeoff and climb allowance lb'], ['reserveMin', 'Reserve minutes'], ['hogeDA', 'Hovers OGE at max gross up to density alt ft', 'helo'],
  ['refDA', 'Takeoff derate starts at density alt ft', 'fixed'], ['derate', 'Derate per 1,000 ft (fraction)', 'fixed']
];
function renderEditView() {
  const a = afById(S.edit), helo = a.role === 'helo';
  const r0 = E.rangeAt(a, { aux: {}, requireOGE: true }, { payload: 0, elev: 0 }), r1 = E.rangeAt(a, { aux: {}, requireOGE: true }, { payload: a.maxPayload, elev: 0 });
  const tile = (v, l) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
  $('#edtiles').innerHTML = tile(fmt(r0.range) + ' nm', 'Range, no payload') + tile(fmt(r1.range) + ' nm', 'Range, max payload') +
    tile(fmt(a.mgw - a.oew - a.crew) + ' lb', 'Useful load') + tile(fmt(a.fuel / 6.7) + ' gal', 'Internal fuel') + tile(hm(Math.max(0, a.fuel - E.groundOut(a, null).total) / a.burn), 'Endurance to dry tanks') + tile(a.aar ? 'Yes' : 'No', 'Air refuelable');
  let h = a.id === 'custom' ? `<label for="ed-name">Name<input id="ed-name" data-ef="name" value="${esc(a.name)}"></label>
    <label for="ed-role">Type<select id="ed-role" data-ef="role"><option value="helo" ${helo ? 'selected' : ''}>Helicopter</option><option value="fixed" ${!helo ? 'selected' : ''}>Fixed wing</option></select></label>` : '';
  for (const [k, l, only] of EDF) { if (only === 'helo' && !helo) continue; if (only === 'fixed' && helo) continue; h += `<label for="ed-${k}">${l}<input id="ed-${k}" type="number" step="any" data-ef="${k}" value="${a[k]}"></label>`; }
  h += `<label class="chk" for="ed-aar"><input id="ed-aar" type="checkbox" data-ef="aar" ${a.aar ? 'checked' : ''}>Can take fuel in the air</label>`;
  $('#edform').innerHTML = h;
}

// ---------- three.js helpers ----------
const HAS3D = !!window.THREE;
function textSprite(text, size, color, align, world) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), fs = 44, font = `700 ${fs}px "B612 Mono", ui-monospace, monospace`;
  x.font = font; const w = Math.ceil(x.measureText(text).width) + 16; c.width = w; c.height = fs + 18;
  x.font = font; x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 8, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: world !== false }));
  s.scale.set(size * w / c.height, size, 1); s.center.set(align === 'r' ? 1 : align === 'l' ? 0 : 0.5, 0.5); s.renderOrder = 10; return s;
}
function lines(arr, color, opacity) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity: opacity == null ? 1 : opacity }));
}
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } }); }
function nice(max, n) { if (!(max > 0)) max = 1; const raw = max / (n || 4), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; return { step, top: Math.ceil(max / step - 1e-9) * step }; }

// ---------- 3D charts ----------
const stages = {};
function stage(id) {
  if (stages[id] !== undefined) return stages[id];
  const cv = $(id); let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return (stages[id] = null); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400), root = new THREE.Group(); scene.add(root);
  const st = { cv, root, box: { w: 10, h: 4.5, d: 3 }, yaw: -0.48, pitch: 0.4, k: 1 };
  st.clear = () => { while (root.children.length) { const o = root.children[root.children.length - 1]; root.remove(o); disposeTree(o); } st.k = clamp(760 / (cv.clientWidth || 760), 1, 1.9); };
  st.render = () => {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const vf = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * camera.aspect), b = st.box;
    const dist = Math.max((Math.hypot(b.w, b.d) / 2 + 0.75 * st.k) / Math.tan(hf), (b.h * 0.62 + 1.3) / Math.tan(vf)) * 1.04;
    const c = new THREE.Vector3(b.w / 2, b.h * 0.42, b.d / 2);
    camera.position.set(c.x + dist * Math.sin(st.yaw) * Math.cos(st.pitch), c.y + dist * Math.sin(st.pitch), c.z + dist * Math.cos(st.yaw) * Math.cos(st.pitch));
    camera.lookAt(c); camera.updateProjectionMatrix(); renderer.render(scene, camera);
  };
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; st.yaw = clamp(st.yaw - (e.clientX - drag.x) * 0.006, -1.25, 1.25); st.pitch = clamp(st.pitch + (e.clientY - drag.y) * 0.004, 0.1, 1.1);
    drag = { x: e.clientX, y: e.clientY }; st.render();
  });
  return (stages[id] = st);
}
function frame(st, W, H, D, ys, sy, yFmt, yUnit, xUnit) {
  const g = [], dim = [];
  g.push(0, 0, 0, W, 0, 0, W, 0, 0, W, 0, D, W, 0, D, 0, 0, D, 0, 0, D, 0, 0, 0, 0, 0, 0, 0, H, 0, W, 0, 0, W, H, 0, 0, H, 0, W, H, 0, 0, 0, D, 0, H, D, 0, H, D, 0, H, 0);
  for (let v = ys.step; v <= ys.top + 1e-9; v += ys.step) {
    const y = v * sy; dim.push(0, y, 0, W, y, 0, 0, y, 0, 0, y, D);
    const l = textSprite(yFmt(v), 0.3 * st.k, CSS.dim, 'r'); l.position.set(-0.2, y, D); st.root.add(l);
  }
  st.root.add(lines(g, C.green, 0.55), lines(dim, C.dim, 0.9));
  const u = textSprite(yUnit, 0.3 * st.k, CSS.dim, 'l'); u.position.set(-0.9, H + 0.5 * st.k, D); st.root.add(u);
  if (xUnit) { const x = textSprite(xUnit, 0.3 * st.k, CSS.dim, 'c'); x.position.set(W / 2, 0, D + 1.35 * st.k); st.root.add(x); }
}
// rows: [{name, pts:[{x,y}], ref}] ; rows[0] is drawn nearest the viewer
function ribbonChart(st, o) {
  if (!st) return; st.clear();
  const W = 10, H = 4.5, gap = 1.1, n = Math.max(1, o.rows.length), D = Math.max(1.6, n * gap + 0.3);
  st.box = { w: W, h: H, d: D };
  const ys = nice(o.ymax, 4), xs = nice(o.xmax, 5), sx = W / xs.top, sy = H / ys.top;
  frame(st, W, H, D, ys, sy, o.yFmt || fmtK, o.yUnit, o.xUnit);
  const fl = [];
  for (let v = xs.step; v <= xs.top + 1e-9; v += xs.step) { const x = v * sx; fl.push(x, 0, 0, x, 0, D); const l = textSprite(fmtK(v), 0.28 * st.k, CSS.dim, 'c'); l.position.set(x, 0, D + 0.45 * st.k); st.root.add(l); }
  st.root.add(lines(fl, C.dim, 0.6));
  const posts = [];
  (o.posts || []).forEach(p => { const x = p.x * sx; posts.push(x, 0, 0, x, H, 0); const l = textSprite(p.label, 0.3 * st.k, CSS.bright, 'c'); l.position.set(x, H + 0.3 * st.k, 0); st.root.add(l); });
  if (posts.length) st.root.add(lines(posts, C.green, 0.5));
  o.rows.forEach((r, i) => {
    const z1 = D - 0.3 - i * gap, z0 = z1 - 0.6, p = r.pts.map(q => ({ x: q.x * sx, y: Math.max(0, q.y) * sy, raw: q.y }));
    const front = [], top = [], edge = [], col = [], refY = r.ref != null ? r.ref * sy : null;
    const g = new THREE.Color(i === 0 ? C.bright : C.green), red = new THREE.Color(C.red);
    for (let q = 1; q < p.length; q++) {
      const a = p[q - 1], b = p[q];
      if (b.x > a.x) front.push(a.x, 0, z1, b.x, 0, z1, b.x, b.y, z1, a.x, 0, z1, b.x, b.y, z1, a.x, a.y, z1);
      top.push(a.x, a.y, z0, a.x, a.y, z1, b.x, b.y, z1, a.x, a.y, z0, b.x, b.y, z1, b.x, b.y, z0);
      edge.push(a.x, a.y, z1, b.x, b.y, z1, a.x, a.y, z0, b.x, b.y, z0);
      const bad = r.ref != null && Math.min(a.raw, b.raw) < r.ref - 1e-6, c = bad ? red : g;
      for (let t = 0; t < 4; t++) col.push(c.r, c.g, c.b);
    }
    const mk = (arr, op) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })); };
    if (front.length) st.root.add(mk(front, i === 0 ? 0.3 : 0.16));
    if (top.length) st.root.add(mk(top, i === 0 ? 0.6 : 0.38));
    if (edge.length) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); st.root.add(new THREE.LineSegments(ge, new THREE.LineBasicMaterial({ vertexColors: true }))); }
    if (refY != null) st.root.add(lines([0, refY, z1, W, refY, z1], C.amber, 0.9));
    if (r.dry != null) { const x = r.dry * sx; st.root.add(lines([x, 0, z1, x, H * 0.3, z1], C.red, 1)); const l = textSprite('DRY', 0.3 * st.k, CSS.red, 'c'); l.position.set(x, H * 0.3 + 0.25, z1); st.root.add(l); }
    const l = textSprite(r.name, 0.32 * st.k, i === 0 ? CSS.bright : CSS.green, 'l'); l.position.set(W + 0.15, 0.2, (z0 + z1) / 2); st.root.add(l);
  });
  st.render();
}
// vals[r][c]; rows[0] nearest the viewer
function barChart(st, o) {
  if (!st) return; st.clear();
  const W = 10, H = 4.5, nC = Math.max(1, o.cols.length), nR = Math.max(1, o.rows.length), gap = 1.0, D = Math.max(1.4, nR * gap + 0.4);
  st.box = { w: W, h: H, d: D };
  let ymax = 0; o.vals.forEach(r => r.forEach(v => { ymax = Math.max(ymax, v); })); (o.marks || []).forEach(v => { ymax = Math.max(ymax, v); });
  const ys = nice(ymax, 4), sy = H / ys.top, cw = W / nC, bw = Math.min(cw * 0.62, 1.1);
  frame(st, W, H, D, ys, sy, o.yFmt || fmtK, o.yUnit, null);
  o.cols.forEach((c, ci) => { const l = textSprite(c, 0.3 * st.k, CSS.bright, 'c'); l.position.set(cw * (ci + 0.5), 0, D + (0.4 + (o.stagger && ci % 2 ? 0.55 : 0)) * st.k); st.root.add(l); });
  o.rows.forEach((name, ri) => {
    const zc = D - 0.7 - ri * gap;
    o.vals[ri].forEach((v, ci) => {
      const hh = Math.max(0.02, v * sy), cls = o.cls ? o.cls[ri][ci] : 'ok', color = cls === 'bad' ? C.red : cls === 'mid' ? C.amber : (ri === 0 ? C.bright : C.green);
      const geo = new THREE.BoxGeometry(bw, hh, 0.6), m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ri === 0 ? 0.42 : 0.26, depthWrite: false }));
      m.position.set(cw * (ci + 0.5), hh / 2, zc);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color })); e.position.copy(m.position);
      st.root.add(m, e);
      if (nR === 1) { const l = textSprite(fmtK(v), 0.28 * st.k, cls === 'bad' ? CSS.red : cls === 'mid' ? CSS.amber : CSS.bright, 'c'); l.position.set(m.position.x, hh + 0.28 * st.k, zc); st.root.add(l); }
    });
    if (name) { const l = textSprite(name, 0.32 * st.k, ri === 0 ? CSS.bright : CSS.green, 'l'); l.position.set(W + 0.15, 0.2, zc); st.root.add(l); }
  });
  if (o.marks) { const a = []; o.marks.forEach((v, ci) => { const y = v * sy, x0 = cw * (ci + 0.5) - bw / 2 - 0.08, x1 = x0 + bw + 0.16; a.push(x0, y, 0.1, x0, y, D - 0.1, x1, y, 0.1, x1, y, D - 0.1, x0, y, D - 0.1, x1, y, D - 0.1, x0, y, 0.1, x1, y, 0.1); }); st.root.add(lines(a, C.bright, 1)); }
  st.render();
}
const short = a => a.name.split(' ')[0];
function drawFuelChart() {
  if (!HAS3D || !R.legs.length) return;
  const ids = compared(), pct = S.yMode === 'pct', xmax = R.totals.dist; let ymax = pct ? 100 : 0;
  const rows = ids.map(id => {
    const r = RES[id], cap = r.cfg.fuelCap, f = v => pct ? v / cap * 100 : v, pts = []; let dry = null;
    for (let q = 0; q < r.profile.length; q++) {
      const p = r.profile[q];
      if (p.fuel < 0) { const a = r.profile[q - 1]; if (a && a.fuel > 0 && p.d > a.d) { dry = a.d + (p.d - a.d) * a.fuel / (a.fuel - p.fuel); pts.push({ x: dry, y: 0 }); } else dry = p.d; break; }
      pts.push({ x: p.d, y: f(p.fuel) });
    }
    if (!pct) ymax = Math.max(ymax, cap);
    return { name: short(r.af), pts, ref: f(Math.max(...r.legs.map(L => L.reserve))), dry };
  });
  let acc = 0; const posts = [{ x: 0, label: '1' }]; R.legs.forEach((L, i) => { acc += L.dist; posts.push({ x: acc, label: String(i + 2) }); });
  ribbonChart(stage('#c-fuel'), { rows, xmax, ymax, xUnit: 'nm along route', yUnit: pct ? '% of tanks' : 'lb fuel', yFmt: pct ? v => v + '%' : fmtK, posts });
}
function drawPayCharts() {
  if (!HAS3D || !R.legs.length) return;
  const ids = compared();
  barChart(stage('#c-pay'), { cols: R.legs.map(L => 'L' + (L.k + 1)), rows: ids.map(id => short(afById(id))),
    vals: ids.map(id => RES[id].legs.map(L => L.payMax)), cls: ids.map(id => RES[id].legs.map(L => L.payMax < L.payload ? 'bad' : 'ok')),
    marks: R.legs.map(L => L.payload), yUnit: 'lb payload' });
  const w0 = MIS.wps[0]; let xmax = 0, ymax = 0;
  const rows = ids.map(id => {
    const a = afById(id), cur = E.payloadRange(a, MIS, { elev: +w0.elev || 0, oat: +w0.oat, sling: false }, 14).filter(p => p.range > 0).sort((p, q) => p.range - q.range);
    const pts = cur.map(p => ({ x: p.range, y: p.payload })); if (pts.length) pts.unshift({ x: 0, y: pts[0].y });
    pts.forEach(p => { xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y); });
    return { name: short(a), pts };
  });
  ribbonChart(stage('#c-pr'), { rows, xmax, ymax, xUnit: 'nm still-air range', yUnit: 'lb payload' });
}
function drawFleetChart() {
  if (!HAS3D) return;
  const vals = AFS.map(a => fleetMetric(a, RES[a.id])), cls = AFS.map(a => { const r = RES[a.id]; return r.feasible ? 'ok' : r.bingo ? 'bad' : 'mid'; });
  barChart(stage('#c-fleet'), { cols: AFS.map(a => a.code), rows: [''], vals: [vals], cls: [cls], stagger: true,
    yUnit: { range: 'nm', pay: 'lb', burn: 'lb', time: 'hours' }[S.metric], yFmt: S.metric === 'time' ? v => String(+v.toFixed(1)) : fmtK });
}

// ---------- 3D map ----------
const G = (function () {
  const cv = $('#globe'); if (!HAS3D) return null;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x010402);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.004, 20), dyn = new THREE.Group();
  const cam = { lat: 38, lon: -84, dist: 1.4 }; let sprites = [], builtDist = 0, raf = 0, tapMode = false, lastArgs = null;
  const V = (lat, lon, r) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)); };
  // surface texture: land fill only, vector lines carry the detail
  (function () {
    const W = 2048, H = 1024, c = document.createElement('canvas'), x = c.getContext('2d'); c.width = W; c.height = H;
    x.fillStyle = '#020a06'; x.fillRect(0, 0, W, H); x.fillStyle = '#0b2617';
    for (const r of window.LAND) { x.beginPath(); for (let i = 0; i < r.length; i += 2) { const px = (r[i] / 10 + 180) / 360 * W, py = (90 - r[i + 1] / 10) / 180 * H; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ map: t })));
    const coast = [], grat = [], grat30 = [];
    for (const r of window.LAND) for (let i = 2; i < r.length; i += 2) {
      const lo0 = r[i - 2] / 10, la0 = r[i - 1] / 10, lo1 = r[i] / 10, la1 = r[i + 1] / 10;
      if ((Math.abs(lo0) > 179.9 && Math.abs(lo1) > 179.9) || (la0 < -89.9 && la1 < -89.9)) continue;
      const a = V(la0, lo0, 1.0006), b = V(la1, lo1, 1.0006); coast.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let lon = -180; lon < 180; lon += 10) for (let lat = -80; lat < 80; lat += 2) { const a = V(lat, lon, 1.0003), b = V(lat + 2, lon, 1.0003); (lon % 30 ? grat : grat30).push(a.x, a.y, a.z, b.x, b.y, b.z); }
    for (let lat = -80; lat <= 80; lat += 10) for (let lon = -180; lon < 180; lon += 2) { const a = V(lat, lon, 1.0003), b = V(lat, lon + 2, 1.0003); (lat % 30 ? grat : grat30).push(a.x, a.y, a.z, b.x, b.y, b.z); }
    scene.add(lines(grat, C.dim, 0.35), lines(grat30, C.dim, 0.8), lines(coast, 0x2f9a5e, 1));
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 48, 32), new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0.06, side: THREE.BackSide })));
    const dots = (mil, color, size) => { const pos = []; FIELDS.forEach(f => { if (f.mil === mil) pos.push(f.u[0] * 1.001, f.u[1] * 1.001, f.u[2] * 1.001); });
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }))); };
    dots(false, 0x2b7a52, 2.2); dots(true, 0x7fe0a6, 4.5);
  })();
  scene.add(dyn);
  const fieldLabels = new Map();

  function markerSprite(num, name, kind) {
    const c = document.createElement('canvas'), x = c.getContext('2d'); c.width = 384; c.height = 96;
    const col = kind === 'bingo' ? CSS.red : CSS.bright;
    x.lineWidth = 6; x.strokeStyle = col; x.fillStyle = kind === 'fuel' || kind === 'aar' ? CSS.green : 'rgba(1,4,2,.85)';
    x.beginPath();
    if (kind === 'turn') { x.moveTo(48, 14); x.lineTo(82, 78); x.lineTo(14, 78); x.closePath(); }
    else if (kind === 'aar') { x.moveTo(48, 8); x.lineTo(88, 48); x.lineTo(48, 88); x.lineTo(8, 48); x.closePath(); }
    else x.arc(48, 48, 34, 0, 7);
    if (kind === 'bingo') { x.fillStyle = CSS.red; }
    x.fill(); x.stroke();
    x.font = '700 40px "B612 Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = kind === 'fuel' || kind === 'aar' || kind === 'bingo' ? '#02140a' : col; x.fillText(num, 48, kind === 'turn' ? 58 : 51);
    x.textAlign = 'left'; x.font = '700 38px "B612 Mono", monospace'; x.lineWidth = 8; x.strokeStyle = 'rgba(1,4,2,.9)'; x.strokeText(name, 98, 50); x.fillStyle = col; x.fillText(name, 98, 50);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.center.set(0.125, 0.5); s.renderOrder = 20; return s;
  }
  function arc(a, b, color) {
    const d = E.gcDist(a, b), n = Math.max(8, Math.min(160, Math.ceil(d / 25))), pts = [];
    for (let i = 0; i <= n; i++) { const p = E.interp(a, b, i / n); pts.push(V(p.lat, p.lon, 1.0025)); }
    const grp = new THREE.Group();
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
    if (pts.length > 1 && d > 0.5) grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.0035 * (cam.dist - 1), 5, false), new THREE.MeshBasicMaterial({ color })));
    return grp;
  }
  function build(mis, res) {
    lastArgs = [mis, res]; while (dyn.children.length) { const o = dyn.children[dyn.children.length - 1]; dyn.remove(o); disposeTree(o); }
    sprites = []; builtDist = cam.dist;
    const w = mis.wps;
    for (let k = 0; k < w.length - 1; k++) { const L = res.legs[k]; dyn.add(arc(w[k], w[k + 1], L && L.fuelArr < L.reserve - 1 ? C.red : C.bright)); }
    w.forEach((p, i) => {
      const kind = i === 0 ? 'fuel' : i === w.length - 1 ? 'stop' : p.type, s = markerSprite(String(i + 1), p.name, kind);
      s.position.copy(V(p.lat, p.lon, 1.003)); s.scale.set(0.2, 0.05, 1); dyn.add(s); sprites.push(s);
    });
    if (res.bingo) { const s = markerSprite('!', 'FUEL REQUIRED', 'bingo'); s.position.copy(V(res.bingo.lat, res.bingo.lon, 1.003)); s.scale.set(0.2, 0.05, 1); dyn.add(s); sprites.push(s); }
    // still-air range ring from each fuel point
    for (const st of res.stops) {
      const p = w[st.wp], L = res.legs.find(x => x.k === st.wp); if (!L) continue;
      const rng = E.rangeAt(res.af, mis, { payload: L.payload, sling: L.sling, elev: +p.elev || 0, oat: +p.oat }).range;
      if (rng < 5 || rng > 9000) continue;
      const pts = []; for (let b = 0; b <= 360; b += 3) { const q = E.destPoint(p, b, rng); pts.push(V(q.lat, q.lon, 1.002)); }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: C.amber, dashSize: 0.012 * (cam.dist - 1) + 0.0008, gapSize: 0.01 * (cam.dist - 1) + 0.0006, transparent: true, opacity: 0.8 }));
      ln.computeLineDistances(); dyn.add(ln);
    }
    invalidate();
  }
  function draw() {
    raf = 0; const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (lastArgs && Math.abs(cam.dist - 1 - (builtDist - 1)) / (builtDist - 1) > 0.25) { build(lastArgs[0], lastArgs[1]); cancelAnimationFrame(raf); raf = 0; }
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.copy(V(cam.lat, cam.lon, cam.dist)); camera.lookAt(0, 0, 0);
    const dir = camera.position.clone().normalize(), hor = 1 / cam.dist;
    sprites.forEach(s => { s.visible = s.position.clone().normalize().dot(dir) > hor; });
    // airfield codes when zoomed in
    const show = cam.dist < 1.32, near = [];
    if (show) { const lim = Math.cos((cam.dist - 1) * 0.9); for (const f of FIELDS) { const d = f.u[0] * dir.x + f.u[1] * dir.y + f.u[2] * dir.z; if (d > lim) near.push([d + (f.mil ? 1 : 0), f]); } }
    near.sort((a, b) => b[0] - a[0]); const keep = new Set(near.slice(0, 16).map(x => x[1].icao));
    near.slice(0, 16).forEach(([, f]) => { if (!fieldLabels.has(f.icao)) { const s = textSprite(f.icao, 0.026, f.mil ? CSS.ink : CSS.dim, 'l', false); s.position.copy(V(f.lat, f.lon, 1.002)); s.center.set(-0.12, 0.5); s.renderOrder = 5; scene.add(s); fieldLabels.set(f.icao, s); } });
    fieldLabels.forEach((s, k) => { s.visible = show && keep.has(k); });
    renderer.render(scene, camera);
  }
  function invalidate() { if (!raf) raf = requestAnimationFrame(draw); }
  function fit(wps) {
    if (!wps.length) return; const c = new THREE.Vector3(); wps.forEach(p => c.add(V(p.lat, p.lon, 1))); if (c.length() < 1e-6) c.set(1, 0, 0); c.normalize();
    let th = 0.01; wps.forEach(p => { th = Math.max(th, Math.acos(clamp(V(p.lat, p.lon, 1).dot(c), -1, 1))); }); th = Math.min(th, 1.2);
    cam.lat = Math.asin(c.y) * 180 / Math.PI; cam.lon = Math.atan2(-c.z, c.x) * 180 / Math.PI;
    const asp = (cv.clientWidth || 1) / (cv.clientHeight || 1), tf = Math.tan(20 * Math.PI / 180) * Math.min(1, asp);
    cam.dist = clamp(Math.cos(th) + Math.sin(th) * 1.5 / tf, 1.03, 4.5); invalidate();
  }
  function zoom(f) { cam.dist = clamp(1 + (cam.dist - 1) * f, 1.02, 4.5); invalidate(); }
  // pointer interaction
  const ptr = new Map(); let moved = 0, pinch = 0, t0 = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) { moved = 0; t0 = Date.now(); } pinch = 0; });
  cv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1) { moved += Math.abs(dx) + Math.abs(dy); const k = 0.28 * (cam.dist - 1) / 0.9; cam.lon -= dx * k; cam.lat = clamp(cam.lat + dy * k, -85, 85); invalidate(); }
    else if (ptr.size === 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch) zoom(pinch / d); pinch = d; moved = 99; }
  });
  const up = e => {
    const had = ptr.delete(e.pointerId); pinch = 0;
    if (had && ptr.size === 0 && moved < 8 && Date.now() - t0 < 600 && e.type === 'pointerup') tap(e);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 0.87); }, { passive: false });
  function tap(e) {
    const r = cv.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster(); ray.setFromCamera({ x: nx, y: ny }, camera);
    const o = ray.ray.origin, d = ray.ray.direction, b = o.dot(d), c = o.dot(o) - 1, disc = b * b - c; if (disc < 0) return;
    const p = o.clone().addScaledVector(d, -b - Math.sqrt(disc)), lat = Math.asin(clamp(p.y, -1, 1)) * 180 / Math.PI, lon = Math.atan2(-p.z, p.x) * 180 / Math.PI;
    if (!tapMode) { $('#globecap').textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}  ${mgrsOf(lat, lon)}. Turn on "Tap to add waypoint" to drop a point here.`; return; }
    const here = { lat, lon }, snap = 45 * (cam.dist - 1) + 2; let best = null;
    FIELDS.forEach(f => { const dd = E.gcDist(here, f); if (dd < snap && (!best || dd < best.d)) best = { d: dd, f }; });
    addWp(best ? { name: best.f.icao, lat: best.f.lat, lon: best.f.lon, elev: best.f.elev } : here);
    if (!best) toast('Point added. Set its elevation and temperature in the route list.');
    update();
  }
  $('#tapmode').addEventListener('click', () => { tapMode = !tapMode; $('#tapmode').classList.toggle('on', tapMode); $('#tapmode').setAttribute('aria-pressed', tapMode); cv.style.cursor = tapMode ? 'crosshair' : 'grab'; });
  $('#zin').addEventListener('click', () => zoom(0.7)); $('#zout').addEventListener('click', () => zoom(1.4));
  return { build, fit, invalidate };
})();

// ---------- update cycle ----------
let view = 'mission';
function drawView() {
  if (view === 'mission') { if (G) G.build(MIS, R); }
  else if (view === 'fuel') drawFuelChart();
  else if (view === 'payload') drawPayCharts();
  else if (view === 'fleet') drawFleetChart();
}
function update() {
  compute(); save();
  renderHeader(); renderTiles(); renderMsgs(); renderSetup(); renderWps();
  renderFuelView(); renderPayView(); renderFleetView(); renderEditView();
  drawView();
}
function route() {
  const h = (location.hash || '').replace('#', ''); view = ['mission', 'fuel', 'payload', 'fleet', 'airframes'].includes(h) ? h : 'mission';
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + view));
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + view));
  drawView();
}

// ---------- events ----------
$('#primary').addEventListener('change', e => { S.primary = e.target.value; S.edit = S.primary; update(); });
$('#setup').addEventListener('change', e => {
  const k = e.target.dataset.k, m = S.mission; if (!k) return;
  if (k === 'aux') m.aux = { ...m.aux, [S.primary]: e.target.value };
  if (k === 'wdir') m.wind.dir = clamp(+e.target.value || 0, 0, 360);
  if (k === 'wspd') m.wind.spd = clamp(+e.target.value || 0, 0, 200);
  if (k === 'oge') m.requireOGE = e.target.checked;
  if (k === 'alloat' && e.target.value !== '') m.wps.forEach(w => { w.oat = tIn(+e.target.value); });
  update();
});
$('#setup').addEventListener('click', e => { const p = e.target.dataset.pol, u = e.target.dataset.tu; if (p) { S.mission.policy = p; update(); } if (u) { S.tempUnit = u; update(); } });
$('#wps').addEventListener('change', e => {
  const t = e.target, i = +t.dataset.i, f = t.dataset.f, w = S.mission.wps[i]; if (!f || !w) return;
  if (f === 'name') w.name = t.value.trim() || 'WP ' + (i + 1);
  else if (f === 'type') w.type = t.value;
  else if (f === 'sling') w.sling = t.checked;
  else if (f === 'payload') w.payload = Math.max(0, +t.value || 0);
  else if (f === 'oat') w.oat = tIn(+t.value || 0);
  else if (f === 'runup' || f === 'taxi' || f === 'taxiIn') w[f] = t.value === '' ? null : Math.max(0, +t.value || 0);
  else w[f] = +t.value || 0;
  update();
});
$('#wps').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return; const i = +b.dataset.i, w = S.mission.wps, a = b.dataset.act;
  if (a === 'del') w.splice(i, 1);
  if (a === 'up' && i > 0) [w[i - 1], w[i]] = [w[i], w[i - 1]];
  if (a === 'down' && i < w.length - 1) [w[i + 1], w[i]] = [w[i], w[i + 1]];
  update();
});
function addFromText() {
  const el = $('#addtxt'), p = parsePoint(el.value);
  if (!p) return toast('Could not read that. Try an ICAO code such as KHOP, "36.67, -87.50", "N36 40.2 W087 30.0" or an MGRS grid such as 16SDF5532058382.');
  addWp(p); el.value = ''; update(); if (G) G.fit(MIS.wps);
}
$('#addbtn').addEventListener('click', addFromText);
$('#addtxt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromText(); } });
function suggest() {
  const q = $('#addtxt').value.trim().toUpperCase(); let hits = [];
  if (q.length >= 2 && !/^[-\d]/.test(q)) {
    const a = [], b = [], c = [];
    for (const f of FIELDS) { if (f.icao.startsWith(q) || f.icao === 'K' + q) a.push(f); else if (f.up.startsWith(q)) b.push(f); else if (q.length >= 3 && f.up.includes(q)) c.push(f); if (a.length >= 12) break; }
    hits = a.concat(b, c).slice(0, 12);
  } else if (!q) hits = FIELDS.slice(0, 12);
  $('#aflist').innerHTML = hits.map(f => `<option value="${f.icao} ${esc(f.name)}"></option>`).join('');
}
$('#addtxt').addEventListener('input', suggest); suggest();
$('#msgs').addEventListener('click', e => { if (e.target.id === 'suggest') suggestFuelStop(); });
$('#fit').addEventListener('click', () => { if (G) G.fit(MIS.wps); });
function toggleCmp(id) { if (id === S.primary) return; S.compare = S.compare.includes(id) ? S.compare.filter(x => x !== id) : [...S.compare, id]; update(); }
['#cmp-fuel', '#cmp-pay'].forEach(s => $(s).addEventListener('click', e => { const id = e.target.dataset.cmp; if (id) toggleCmp(id); }));
$('#ymode').addEventListener('click', e => { const m = e.target.dataset.m; if (m) { S.yMode = m; update(); } });
$('#metric').addEventListener('change', e => { S.metric = e.target.value; update(); });
$('#t-fleet').addEventListener('click', e => { const id = e.target.dataset.use; if (id) { S.primary = id; S.edit = id; update(); } });
$('#t-fleet').addEventListener('change', e => { const id = e.target.dataset.cmpbox; if (id) toggleCmp(id); });
$('#edsel').addEventListener('change', e => { S.edit = e.target.value; update(); });
$('#edreset').addEventListener('click', () => { delete S.overrides[S.edit]; update(); });
$('#edform').addEventListener('change', e => {
  const k = e.target.dataset.ef; if (!k) return; const o = { ...(S.overrides[S.edit] || {}) };
  if (k === 'aar') o.aar = e.target.checked;
  else if (k === 'name') o.name = e.target.value.trim() || 'Custom airframe';
  else if (k === 'role') { o.role = e.target.value; if (o.role === 'fixed') Object.assign(o, { burnExp: 0.7, refDA: 3000, derate: 0.012, altK: 0.012 }); else Object.assign(o, { burnExp: 0.6, altK: 0.008 }); }
  else { const v = +e.target.value; if (!isFinite(v) || v < 0) return update(); o[k] = v; }
  S.overrides[S.edit] = o; update();
});
window.addEventListener('hashchange', route);
let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawView, 120); });

update(); route();
if (G) G.fit(MIS.wps);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawView());
})();
