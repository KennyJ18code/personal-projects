/* Interface: cockpit switch pages, checklist, map and route planner, service, missions, weather and failures, menu. */
(function () {
  const S = window.SIM, clamp = S.clamp, $ = id => document.getElementById(id), G = () => S.game;
  const U = S.ui = { page: null, swPage: 'ELEC' }, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lb = kg => S.fmt(kg * S.LB);
  let guards = {}, shown = [], mapS = { cx: 0, cz: 0, mpp: 60, add: false, sel: null, follow: true }, menuSel = null;

  // ---------- overlay shell ----------
  function open(page, full) { const ov = $('ov'); if (U.page === page) return close(); U.page = page; ov.className = 'on' + (full ? ' full' : ''); render(); }
  function close() { U.page = null; $('ov').className = ''; }
  function head(title, tabs, cur) { $('ovh').innerHTML = `<b>${title}</b>` + (tabs || []).map(t => `<button data-tab="${t}" class="${t === cur ? 'on' : ''}">${t}</button>`).join('') + '<span style="flex:1"></span><button data-close="1">Close</button>'; }
  function render() { const p = U.page; if (!p || !G().heli) return; ({ sw: rSw, chk: rChk, map: rMap, svc: rSvc, msn: rMsn, wx: rWx })[p](); }

  // ---------- cockpit switches ----------
  function rSw() {
    const g = G(), sys = g.sys, spec = g.spec, pages = ['ELEC', 'ENG', 'AFCS', 'LIGHTS', 'MISC'].concat(spec.weapons ? ['WPN'] : []); if (!pages.includes(U.swPage)) U.swPage = 'ELEC';
    head('COCKPIT', pages, U.swPage);
    let h = '<div class="grid">';
    S.SWITCHES.filter(d => d.page === U.swPage).forEach(d => {
      if ((d.id === 'hookArm' || d.id === 'hookRel') && !spec.hook) return;
      const opts = d.kind === 'm' ? ['PUSH'] : d.opts || ['OFF', 'ON'], covered = d.guard && !(guards[d.id] > performance.now());
      h += `<div class="swc ${d.guard ? 'guard' : ''}"><span>${d.label}</span><div class="seg">` + (covered ? `<button class="cover" data-guard="${d.id}">GUARD: TAP TO LIFT</button>` : opts.map((o, i) => `<button data-sw="${d.id}" data-v="${i}">${o}</button>`).join('')) + '</div></div>';
    });
    h += '</div>';
    if (U.swPage === 'AFCS') h += `<h3>Heading select</h3><div class="row"><button data-hb="-10">-10</button><button data-hb="-1">-1</button><button data-hb="0">Sync to heading</button><button data-hb="1">+1</button><button data-hb="10">+10</button><span id="hbv" class="dim"></span></div>
      <p class="dim">SAS damps the aircraft. TRIM and FPS together hold the attitude you set with the TRIM button and hold heading. ALT, IAS, HDG and NAV need FPS. All need AC power and hydraulics.</p>`;
    if (U.swPage === 'MISC') h += `<h3>Altimeter setting</h3><div class="row"><button data-baro="-1">-1 hPa</button><button data-baro="1">+1 hPa</button><button data-baro="0">Set from tower</button><span id="barov" class="dim"></span></div>`;
    if (U.swPage === 'ELEC') h += '<p class="dim" id="elecv"></p>';
    if (U.swPage === 'ENG') h += '<p class="dim" id="engv"></p><p class="dim">Start: starter, then power lever to IDLE once NG is above 15%. Moving the lever with no starter, or too early, gives a hot start.</p>';
    $('ovb').innerHTML = h; syncSw();
  }
  function syncSw() {
    if (U.page !== 'sw') return; const g = G(), sys = g.sys, sw = sys.sw;
    $('ovb').querySelectorAll('button[data-sw]').forEach(b => { const id = b.dataset.sw, d = S.SWITCHES.find(x => x.id === id); let on = d.kind === 'm' ? (id === 'start1' ? sys.eng[0].starter : id === 'start2' ? sys.eng[1].starter : false) : sw[id] === +b.dataset.v;
      b.className = on ? (d.guard || (d.kind !== 'm' && d.kind === 2 && !d.opts && +b.dataset.v === 0) ? (d.guard && +b.dataset.v ? 'warn' : 'on') : 'on') : ''; });
    const e = sys.eng, t = (id, s) => { const el = $(id); if (el) el.textContent = s; };
    t('hbv', 'Bug ' + String(Math.round(g.heli.hdgBug)).padStart(3, '0') + '   heading ' + String(Math.round(g.heli.out.hdg)).padStart(3, '0'));
    t('barov', 'Set ' + S.baroSet + ' hPa (' + (S.baroSet * 0.02953).toFixed(2) + ' inHg)');
    t('elecv', 'Battery ' + Math.round(sys.batt * 100) + '%   DC bus ' + (sys.dc ? 'ON' : 'off') + '   AC bus ' + (sys.ac ? 'ON' : 'off') + '   APU ' + Math.round(sys.apuN * 100) + '%   Hydraulics ' + (sys.hyd ? sys.hyd.map(v => v ? 'OK' : '--').join(' / ') : ''));
    t('engv', 'NG ' + Math.round(e[0].ng) + ' / ' + Math.round(e[1].ng) + ' %   TGT ' + Math.round(e[0].tgt) + ' / ' + Math.round(e[1].tgt) + ' C   NR ' + Math.round(sys.nr * 100) + ' %   fire bottles ' + sys.bottles);
  }
  function setSw(id, v) {
    const g = G(), sys = g.sys, h = g.heli, d = S.SWITCHES.find(x => x.id === id);
    if (d.kind === 'm') { if (id === 'hookRel') { if (h.load && h.load.on) { h.release(); sys.say('Load released'); } } else sys.press(id); return; }
    if (['altHold', 'iasHold', 'hdgHold', 'navMode'].includes(id) && v && !sys.fpsOK) return sys.say('Needs SAS, TRIM and FPS on, with AC power and hydraulics');
    if (id === 'navMode' && v && !S.route.wps.length) return sys.say('No route: add waypoints on the MAP');
    if (id === 'hdgHold' && v) { h.hdgBug = h.hdgBug || h.out.hdg; sys.sw.navMode = 0; } if (id === 'navMode' && v) sys.sw.hdgHold = 0;
    if (id === 'trim' && v) h.setTrim();
    sys.sw[id] = v;
  }

  // ---------- checklist ----------
  const CHK = [
    ['Parking brake SET', s => s.sw.pbrake, 'MISC'], ['Battery ON', s => s.sw.batt, 'ELEC'], ['Fuel boost pumps 1 and 2 ON', s => s.sw.boost1 && s.sw.boost2, 'ENG'], ['Fuel selectors 1 and 2 DIR', s => s.sw.fuelSel1 && s.sw.fuelSel2, 'ENG'],
    ['APU RUN, wait for APU ON', s => s.apuN > 0.95 || s.ac && s.nr > 0.9, 'ELEC', s => 'APU ' + Math.round(s.apuN * 100) + '%'], ['APU generator ON', s => s.ac, 'ELEC'], ['Backup hydraulic pump AUTO', s => s.sw.bkpPump > 0, 'ELEC'],
    ['Engine ignition ON', s => s.sw.ign, 'ENG'], ['Rotor brake OFF', s => !s.sw.rbrake, 'ENG'],
    ['Starter 1, then power lever 1 IDLE above 15% NG', s => s.eng[0].lit && !s.eng[0].hot, 'ENG', s => 'NG ' + Math.round(s.eng[0].ng) + '%'], ['Starter 2, then power lever 2 IDLE above 15% NG', s => s.eng[1].lit && !s.eng[1].hot, 'ENG', s => 'NG ' + Math.round(s.eng[1].ng) + '%'],
    ['Both engines stable at idle (NG 66%)', s => s.eng[0].ng > 63 && s.eng[1].ng > 63, 'ENG'], ['Power levers 1 and 2 FLY, rotor 100%', s => s.sw.pcl1 === 2 && s.sw.pcl2 === 2 && s.nr > 0.98, 'ENG', s => 'NR ' + Math.round(s.nr * 100) + '%'],
    ['Generators 1 and 2 ON', s => s.gens && s.gens[0] && s.gens[1], 'ELEC'], ['APU generator OFF, APU OFF', s => !s.sw.apu && !s.sw.apuGen, 'ELEC'], ['SAS 1, SAS 2, TRIM and FPS ON', s => s.fpsOK, 'AFCS'],
    ['Pitot heat ON (anti-ice if cold and in cloud)', s => s.sw.pitot, 'ELEC'], ['Position and anti-collision lights ON', s => s.sw.pos && s.sw.acol, 'LIGHTS'], ['Parking brake OFF when ready to lift', s => !s.sw.pbrake, 'MISC']
  ];
  function rChk() { head('START CHECKLIST'); $('ovb').innerHTML = '<ol class="chk">' + CHK.map((c, i) => `<li data-chk="${i}"><i></i><span>${i + 1}. ${c[0]}</span><small></small></li>`).join('') + '</ol><p class="dim" style="margin-top:8px">Tap a line to open the panel it is on. Items tick themselves when the aircraft is actually in that state.</p>'; syncChk(); }
  function syncChk() { if (U.page !== 'chk') return; const sys = G().sys; let next = true; $('ovb').querySelectorAll('li[data-chk]').forEach((li, i) => { const ok = !!CHK[i][1](sys); li.className = ok ? 'ok' : next ? 'next' : ''; if (!ok) next = false; li.querySelector('small').textContent = CHK[i][3] ? CHK[i][3](sys) : ''; }); }

  // ---------- map and route ----------
  const tileImg = new Map();
  function tileCanvas(t) {
    let c = tileImg.get(t.key); if (c) return c; c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), im = x.createImageData(128, 128), d = t.data;
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const h = d[(j * 2) * 256 + i * 2], hx = d[(j * 2) * 256 + Math.min(255, i * 2 + 2)], hz = d[Math.min(255, j * 2 + 2) * 256 + i * 2], sh = clamp(0.75 + (h - hx) * 0.004 + (h - hz) * 0.004, 0.35, 1.2), k = (j * 128 + i) * 4, e = clamp(h / 2500, 0, 1);
      let r = 40 + 110 * e, g = 78 + 50 * e, b = 46 + 50 * e; if (h <= 0.2) { r = 14; g = 44; b = 70; } im.data[k] = r * sh; im.data[k + 1] = g * sh; im.data[k + 2] = b * sh; im.data[k + 3] = 255; }
    x.putImageData(im, 0, 0); tileImg.set(t.key, c); if (tileImg.size > 90) tileImg.delete(tileImg.keys().next().value); return c;
  }
  function rMap() {
    head('MAP AND ROUTE');
    $('ovb').innerHTML = `<div style="display:flex;gap:8px;height:100%;flex-wrap:wrap"><div class="mapwrap" style="flex:3 1 300px"><canvas id="map"></canvas><div class="tools"><button data-m="in">+</button><button data-m="out">-</button><button data-m="ctr">Centre</button><button data-m="add" id="m-add">Add waypoints</button><button data-m="undo">Undo</button><button data-m="clr">Clear</button></div></div>
      <div style="flex:1 1 210px;min-width:200px;overflow:auto;max-height:100%"><div id="m-info" class="dim" style="margin-bottom:6px">Turn on "Add waypoints", then tap the map. Tap an airfield to snap to it.</div><table id="m-route"></table></div></div>`;
    const cv = $('map'), ptr = new Map(); let moved = 0, pinch = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) moved = 0; pinch = 0; });
    cv.addEventListener('pointermove', e => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptr.size === 1) { moved += Math.abs(dx) + Math.abs(dy); mapS.cx -= dx * mapS.mpp; mapS.cz -= dy * mapS.mpp; if (moved > 8) mapS.follow = false; } else if (ptr.size === 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch) mapS.mpp = clamp(mapS.mpp * pinch / d, 4, 2500); pinch = d; moved = 99; } drawMap(); });
    const up = e => { if (!ptr.delete(e.pointerId)) return; pinch = 0; if (!ptr.size && moved < 8 && e.type === 'pointerup') mapTap(e); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', e => { mapS.mpp = clamp(mapS.mpp * (e.deltaY > 0 ? 1.25 : 0.8), 4, 2500); drawMap(); e.preventDefault(); }, { passive: false });
    if (mapS.follow) { mapS.cx = G().heli.pos.x; mapS.cz = G().heli.pos.z; } drawMap(); routeTable();
  }
  function mapTap(e) {
    const cv = $('map'), r = cv.getBoundingClientRect(), x = mapS.cx + (e.clientX - r.left - r.width / 2) * mapS.mpp, z = mapS.cz + (e.clientY - r.top - r.height / 2) * mapS.mpp;
    let best = null, bd = (14 * mapS.mpp) ** 2; for (const f of S.terrain.fields) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; best = f; } }
    if (mapS.add) { if (best) S.route.add(best.icao, S.terrain.layout(best).rx, best.geo.rz); else S.route.add('WP' + (S.route.wps.length + 1), x, z); routeTable(); }
    else if (best) { const h = G().heli, d = Math.hypot(best.x - h.pos.x, best.z - h.pos.z) / S.NM; $('m-info').innerHTML = `<b>${best.icao}</b> ${esc(best.name)}<br>${Math.round(best.elev)} ft, ${d.toFixed(1)} nm, ${(best.rw || []).length} runway(s). Fuel and rearm on the ramp. <button data-m="dct" data-id="${best.icao}">Direct to</button>`; mapS.sel = best; }
    drawMap();
  }
  function drawMap() {
    const cv = $('map'); if (!cv) return; const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0a1416'; x.fillRect(0, 0, W, H);
    const m = mapS, p = S.proj, sx = wx => (wx - m.cx) / m.mpp + W / 2, sz = wz => (wz - m.cz) / m.mpp + H / 2, g = G(), h = g.heli;
    const zm = clamp(Math.round(Math.log2(40075016 * p.k / (m.mpp * 256))), 5, 11), ts = p.tileSize(zm), a = p.tileAt(zm, m.cx - W / 2 * m.mpp, m.cz - H / 2 * m.mpp), b = p.tileAt(zm, m.cx + W / 2 * m.mpp, m.cz + H / 2 * m.mpp);
    if ((b.tx - a.tx + 1) * (b.ty - a.ty + 1) <= 40) for (let ty = a.ty; ty <= b.ty; ty++) for (let tx = a.tx; tx <= b.tx; tx++) { const t = S.terrain.tileData(zm, tx, ty), o = p.tileOrigin(zm, tx, ty); if (t) x.drawImage(tileCanvas(t), sx(o.x), sz(o.z), ts / m.mpp + 0.6, ts / m.mpp + 0.6); else S.terrain.request(zm, tx, ty, () => { if (U.page === 'map') drawMap(); }); }
    x.font = '600 10px ui-monospace,Menlo,monospace'; x.textBaseline = 'middle';
    for (const f of S.terrain.fields) { const px = sx(f.x), pz = sz(f.z); if (px < -20 || pz < -20 || px > W + 20 || pz > H + 20) continue; if (m.mpp > 500 && (f.rw || []).length < 2) continue;
      if (m.mpp < 40 && f.geo) { x.strokeStyle = '#d8d8d8'; x.lineWidth = Math.max(1.5, 30 / m.mpp); f.geo.rw.forEach(r => { x.beginPath(); x.moveTo(sx(r.ax), sz(r.az)); x.lineTo(sx(r.bx), sz(r.bz)); x.stroke(); }); }
      x.strokeStyle = f === m.sel ? '#fff' : '#4fd8ff'; x.lineWidth = 1.5; x.beginPath(); x.arc(px, pz, 5, 0, 7); x.stroke(); if (m.mpp < 320) { x.fillStyle = '#cfefff'; x.textAlign = 'left'; x.fillText(f.icao, px + 8, pz); } }
    const R = S.route; x.strokeStyle = '#ff5be1'; x.lineWidth = 2; x.beginPath(); x.moveTo(sx(h.pos.x), sz(h.pos.z)); R.wps.slice(R.active).forEach(w => x.lineTo(sx(w.x), sz(w.z))); x.stroke();
    R.wps.forEach((w, i) => { const px = sx(w.x), pz = sz(w.z); x.fillStyle = i === R.active ? '#ff5be1' : '#7a3a70'; x.beginPath(); x.moveTo(px, pz - 6); x.lineTo(px + 6, pz); x.lineTo(px, pz + 6); x.lineTo(px - 6, pz); x.fill(); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(w.name, px + 8, pz - 8); });
    S.wpn.targets.forEach(t => { if (t.alive) { x.fillStyle = '#ff4a3d'; x.fillRect(sx(t.x) - 2, sz(t.z) - 2, 4, 4); } });
    x.save(); x.translate(sx(h.pos.x), sz(h.pos.z)); x.rotate(h.out.hdg * S.D2R); x.fillStyle = '#39e07a'; x.beginPath(); x.moveTo(0, -10); x.lineTo(6, 8); x.lineTo(0, 4); x.lineTo(-6, 8); x.fill(); x.restore();
    const bar = 100 * m.mpp / S.NM, nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100].find(v => v > bar * 0.6) || 100, bl = nice * S.NM / m.mpp; x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(10, H - 12); x.lineTo(10 + bl, H - 12); x.stroke(); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(nice + ' nm', 14 + bl, H - 12);
    x.fillText(S.terrain.offline ? 'Generated terrain (offline)' : 'Elevation: Mapzen / AWS Terrain Tiles', 10, H - 26);
  }
  function routeTable() {
    const el = $('m-route'); if (!el) return; const g = G(), h = g.heli, R = S.route, gs = Math.max(60, h.out.gs * S.KT), ff = Math.max(g.sys.ffTotal * 3600, g.spec.eng.idleFF * 2 + g.spec.eng.sfc * g.spec.eng.xmsn / 1000 * 0.55);
    let px = h.pos.x, pz = h.pos.z, tot = 0, hrs = 0, rows = '<tr><th>Waypoint</th><th>Brg</th><th>nm</th><th>ETE</th><th></th></tr>';
    R.wps.forEach((w, i) => { const d = Math.hypot(w.x - px, w.z - pz) / S.NM, b = S.wrap360(Math.atan2(w.x - px, -(w.z - pz)) * S.R2D), t = d / gs; if (i >= R.active) { tot += d; hrs += t; }
      rows += `<tr style="${i < R.active ? 'opacity:.4' : ''}"><td>${i === R.active ? '&gt; ' : ''}${esc(w.name)}</td><td>${String(Math.round(b)).padStart(3, '0')}</td><td>${d.toFixed(1)}</td><td>${Math.floor(t * 60)}m</td><td><button data-m="go" data-i="${i}">To</button></td></tr>`; px = w.x; pz = w.z; });
    const need = hrs * ff, have = g.sys.fuelTotal();
    rows += `<tr><td>Total</td><td></td><td>${tot.toFixed(1)}</td><td>${Math.floor(hrs * 60)}m</td><td></td></tr>`;
    el.innerHTML = rows; const info = document.createElement('p'); info.className = need + ff * 0.5 > have ? '' : 'dim'; info.style.color = need + ff * 0.5 > have ? '#ffb52e' : '';
    info.textContent = R.wps.length ? `Fuel needed about ${lb(need)} lb at ${Math.round(gs)} kt and ${lb(ff)} lb/hr. On board ${lb(have)} lb.` + (need + ff * 0.5 > have ? ' Not enough for a 30 minute reserve: plan a fuel stop.' : '') : '';
    el.parentNode.querySelectorAll('p').forEach(p => p.remove()); el.parentNode.appendChild(info);
  }

  // ---------- service: fuel, cargo, arming, repair ----------
  function rSvc() {
    const g = G(), h = g.heli, sys = g.sys, spec = g.spec, at = g.atFuel(), ramp = g.atRamp(), grd = h.onGround && h.out.gs < 0.5, m = S.mission.cur;
    head('SERVICE'); let s = `<h3>Fuel</h3><p>${lb(sys.fuelTotal())} of ${lb(spec.fuelCap)} lb on board. ${at.ok ? 'On the fuel pad.' : 'Refuelling needs: ' + at.why + '.'}</p>
      <div class="row"><label>Fill to ${'<span id="sv-ft"></span>'}<input type="range" id="sv-fuel" min="0" max="${spec.fuelCap}" step="10" value="${Math.round(g.svc.fueling ? g.svc.target : spec.fuelCap)}"></label><button data-s="fuel" ${at.ok ? '' : 'disabled'} class="${g.svc.fueling ? 'amb' : ''}">${g.svc.fueling ? 'Stop' : 'Start refuelling'}</button></div>`;
    if (spec.cabinMax) { s += `<h3>Cabin load</h3><div class="row"><label>Internal cargo <span id="sv-ct"></span><input type="range" id="sv-cargo" min="0" max="${spec.cabinMax}" step="50" value="${Math.round(h.payload)}"></label><button data-s="cargo" ${grd ? '' : 'disabled'}>Load</button></div>`;
      if (m && m.type === 'troops' && !m.complete) s += `<div class="row"><button data-s="board" ${m.stage === 0 && ramp ? '' : 'disabled'}>Board ${m.n} troops</button><button data-s="out" ${m.stage === 1 && m.atLZ ? '' : 'disabled'}>Troops out at the LZ</button></div>`; }
    if (spec.hook) s += `<h3>Sling load</h3><div class="row"><label>Weight <span id="sv-st"></span><input type="range" id="sv-sling" min="200" max="${spec.hookMax}" step="50" value="${Math.round(spec.hookMax * 0.4)}"></label><button data-s="sling" ${grd ? '' : 'disabled'}>Rig a load 30 m ahead</button></div><p class="dim">Arm the cargo hook (Cockpit, MISC), hover over the crate, and tap HOOK UP when it appears.</p>`;
    if (spec.weapons) s += `<h3>Weapons</h3><div class="row"><span>Gun ${h.ammo.gun}, rockets ${h.ammo.rkt}, missiles ${h.ammo.msl}</span><button data-s="arm" ${ramp ? '' : 'disabled'}>Rearm on the ramp</button></div>`;
    s += `<h3>Maintenance</h3><div class="row"><button data-s="fix" ${ramp ? '' : 'disabled'}>Repair aircraft and clear failures</button><span class="dim">Gross weight ${lb(h.mass())} lb, limit ${lb(spec.mgw)} lb${h.mass() > spec.mgw ? ' (OVERWEIGHT)' : ''}</span></div>`;
    $('ovb').innerHTML = s; sliders();
  }
  function sliders() { const t = (a, b, f) => { const el = $(a); if (el && $(b)) $(b).textContent = f(+el.value); }; t('sv-fuel', 'sv-ft', v => lb(v) + ' lb'); t('sv-cargo', 'sv-ct', v => lb(v) + ' lb'); t('sv-sling', 'sv-st', v => lb(v) + ' lb'); }

  // ---------- missions ----------
  function rMsn() {
    const g = G(), m = S.mission.cur, f = g.atRamp(); head('MISSION');
    let s = ''; if (m) s = `<h3>${esc(m.title)}</h3><p>${esc(m.text)}</p><p class="dim">${m.complete ? 'Complete.' : 'In progress. Follow the magenta bug to the active waypoint.'} Missions completed this session: ${S.mission.done}</p><div class="row"><button data-n="clear">${m.complete ? 'Clear' : 'Abandon mission'}</button></div>`;
    else if (!f) s = '<p>Missions are briefed on the ramp. Land and stop at an airfield ramp to see what is available.</p>';
    else { U.msnOpts = S.mission.options(f, g.spec); s = `<p>Available at ${f.icao} ${esc(f.name)}:</p>` + U.msnOpts.map((o, i) => `<div class="row"><button data-n="${i}">Accept</button><span>${esc(o.title)}</span></div>`).join(''); }
    $('ovb').innerHTML = s;
  }

  // ---------- weather and failures ----------
  const WX = [['timeH', 'Local time', 0, 24, 0.25, v => Math.floor(v) + ':' + String(Math.round(v % 1 * 60)).padStart(2, '0')], ['windDir', 'Wind from', 0, 360, 10, v => v + ' deg'], ['windKt', 'Wind speed', 0, 50, 1, v => v + ' kt'], ['gustKt', 'Gusts', 0, 25, 1, v => '+' + v + ' kt'], ['turb', 'Turbulence', 0, 2, 0.1, v => v.toFixed(1)],
    ['vis', 'Visibility', 300, 60000, 100, v => (v / 1609).toFixed(1) + ' sm'], ['cloudBase', 'Cloud base (MSL)', 100, 5000, 50, v => S.fmt(v * S.FT) + ' ft'], ['cloudTop', 'Cloud tops (MSL)', 300, 7000, 50, v => S.fmt(v * S.FT) + ' ft'], ['cloudCover', 'Cloud cover', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
    ['oatSL', 'Sea-level temperature', -30, 48, 1, v => v + ' C / ' + Math.round(v * 1.8 + 32) + ' F'], ['qnh', 'Pressure (QNH)', 980, 1040, 1, v => v + ' hPa']];
  function rWx() {
    const g = G(), e = S.env; head('WEATHER AND FAILURES');
    $('ovb').innerHTML = '<h3>Weather</h3><div class="row">' + WX.map(w => `<label>${w[1]}: <span id="wx-${w[0]}-v">${w[5](e[w[0]])}</span><input type="range" data-wx="${w[0]}" min="${w[2]}" max="${w[3]}" step="${w[4]}" value="${e[w[0]]}"></label>`).join('') + '</div>' +
      '<h3>Failures</h3><div class="row">' + S.FAILURES.filter(f => !(f[0] === 'tr' && g.spec.tandem)).map(f => `<button data-f="${f[0]}" class="${g.sys.fail[f[0]] ? 'warn' : ''}">${f[1]}</button>`).join('') + `</div><div class="row"><button data-f="rand" class="${g.randFail ? 'amb' : ''}">Random failures in flight: ${g.randFail ? 'ON' : 'OFF'}</button></div>
      <p class="dim">Temperature and pressure change air density, so they change hover power, engine limits and the altimeter. Below freezing in cloud you will pick up ice: use pitot heat and engine anti-ice.</p>`;
  }

  // ---------- menu ----------
  U.menu = () => {
    const g = G(), o = menuSel || (menuSel = Object.assign({ ac: 'uh60', icao: 'KHOP', state: 'cold', quality: 'med', mode: 'sticks', sens: 1, vol: 0.7 }, g.opts || {})), f = S.terrain.findField(o.icao), run = !!g.heli;
    $('menu').style.display = 'flex'; if (g.heli) g.paused = true;
    $('menubox').innerHTML = `<h1>Rotor Wing Flight Simulator</h1><p class="dim">Real-world terrain streamed as you fly. Full cold-start procedures. Planning estimates and a simplified flight model: for entertainment, not training.</p>
      <h3>Aircraft</h3><div class="acs">${Object.values(S.AIRCRAFT).map(a => `<button data-ac="${a.id}" class="${o.ac === a.id ? 'on' : ''}">${a.name}</button>`).join('')}</div>
      <h3>Start at</h3><div class="row"><label>Airfield: type an ICAO code or name<input type="text" id="mn-q" placeholder="KHOP, Ramstein, Evansville..." autocomplete="off" autocapitalize="characters"></label></div><div class="row" id="mn-res"></div><p id="mn-f"><b>${f ? f.icao : ''}</b> ${f ? esc(f.name) + ', elevation ' + f.elev + ' ft' : ''}</p>
      <div class="row">${[['cold', 'Cold and dark'], ['ready', 'Running on the pad'], ['air', 'In flight']].map(s => `<button data-st="${s[0]}" class="${o.state === s[0] ? 'on' : ''}">${s[1]}</button>`).join('')}</div>
      <h3>Controls</h3><div class="row">${[['sticks', 'Two touch sticks'], ['tilt', 'Tilt to fly']].map(s => `<button data-md="${s[0]}" class="${o.mode === s[0] ? 'on' : ''}">${s[1]}</button>`).join('')}<button data-cal="1">Re-centre tilt</button>
        <label>Stick sensitivity<input type="range" id="mn-sens" min="0.5" max="1.6" step="0.05" value="${o.sens}"></label><label>Sound<input type="range" id="mn-vol" min="0" max="1" step="0.05" value="${o.vol}"></label></div>
      <p class="dim">Left pad: slide up and down for collective (it stays where you leave it), left and right for pedals. Right pad: cyclic. Drag anywhere else to look around. TRIM holds the current attitude. A Bluetooth gamepad or a keyboard (arrows, W/S, A/D) also works.</p>
      <h3>Graphics</h3><div class="row">${['low', 'med', 'high'].map(q => `<button data-q="${q}" class="${o.quality === q ? 'on' : ''}">${q === 'med' ? 'Medium' : q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px">${run ? '<button data-go="resume" class="on">Resume flight</button>' : ''}<button data-go="fly" class="${run ? '' : 'on'}">${run ? 'Start a new flight' : 'Fly'}</button></div>`;
  };
  function search(q) { q = q.trim().toUpperCase(); if (q.length < 2) return []; const a = [], b = []; for (const f of S.terrain.fields) { if (f.icao.startsWith(q) || f.icao === 'K' + q) a.push(f); else if (f.up.includes(q)) b.push(f); if (a.length > 8) break; } return a.concat(b).slice(0, 8); }
  function applyOpts() { const o = menuSel, I = S.input; I.mode = o.mode; I.sens = +o.sens; S.audio.vol = +o.vol; }

  // ---------- wiring ----------
  U.onStart = () => { close(); $('fire').style.display = $('a-zoom').style.display = G().spec.weapons ? '' : 'none'; };
  U.init = () => {
    const B = (id, fn) => $(id).addEventListener('click', fn);
    B('b-view', () => { const v = G().heli && G().cycleView(); $('b-view').textContent = 'View: ' + v; }); B('b-inst', () => { const g = G(); g.showPanel = !g.showPanel; $('panel').className = g.showPanel ? '' : 'hide'; $('b-inst').className = g.showPanel ? 'on' : ''; });
    B('b-sw', () => open('sw')); B('b-chk', () => open('chk')); B('b-map', () => open('map', true)); B('b-svc', () => open('svc')); B('b-msn', () => open('msn')); B('b-wx', () => open('wx')); B('b-menu', () => { menuSel = null; U.menu(); });
    B('a-trim', () => { const g = G(); if (!g.heli) return; g.heli.setTrim(); g.sys.say(g.sys.fpsOK ? 'Trim set: holding this attitude' : 'Trim needs FPS'); });
    const hold = (id, key) => { const el = $(id); el.addEventListener('pointerdown', e => { S.input[key] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); }); const up = () => { S.input[key] = false; el.classList.remove('on'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
    hold('a-brake', 'brakeBtn'); hold('fire', 'fireBtn');
    B('a-hook', () => { const g = G(); if (g.heli.hookUp()) g.sys.say('Load hooked up: ' + lb(g.heli.load.m) + ' lb'); }); B('a-rel', () => { const g = G(); g.heli.release(); g.sys.say('Load released'); });
    B('a-zoom', () => { const g = G(); if (g.view !== 'cockpit') { g.view = 'cockpit'; g.sight = true; g.sightNarrow = false; } else if (!g.sight) { g.sight = true; g.sightNarrow = false; } else if (!g.sightNarrow) g.sightNarrow = true; else g.sight = false; $('a-zoom').textContent = g.sight ? (g.sightNarrow ? 'Sight x20' : 'Sight x5') : 'Sight'; });
    B('b-reset', () => G().reset());
    $('ov').addEventListener('click', e => {
      const b = e.target.closest('button'), li = e.target.closest('li[data-chk]'), g = G(); if (li) { U.swPage = CHK[+li.dataset.chk][2]; U.page = null; return open('sw'); } if (!b) return; const d = b.dataset, sys = g.sys, h = g.heli;
      if (d.close) return close(); if (d.tab) { U.swPage = d.tab; return render(); }
      if (d.guard) { guards[d.guard] = performance.now() + 5000; return render(); } if (d.sw) { setSw(d.sw, +d.v); return syncSw(); }
      if (d.hb != null) { h.hdgBug = +d.hb === 0 ? Math.round(h.out.hdg) : S.wrap360(Math.round(h.hdgBug) + +d.hb); return syncSw(); }
      if (d.baro != null) { S.baroSet = +d.baro === 0 ? Math.round(S.env.qnh) : S.baroSet + +d.baro; return syncSw(); }
      if (d.m) { const m = mapS; if (d.m === 'in') m.mpp = clamp(m.mpp * 0.6, 4, 2500); if (d.m === 'out') m.mpp = clamp(m.mpp * 1.6, 4, 2500); if (d.m === 'ctr') { m.cx = h.pos.x; m.cz = h.pos.z; m.follow = true; }
        if (d.m === 'add') { m.add = !m.add; b.className = m.add ? 'on' : ''; } if (d.m === 'undo') S.route.wps.pop(); if (d.m === 'clr') { S.route.wps = []; S.route.active = 0; } if (d.m === 'go') S.route.active = +d.i;
        if (d.m === 'dct') { const f = S.terrain.findField(d.id); S.route.wps = []; S.route.active = 0; S.route.add(f.icao, S.terrain.layout(f).rx, f.geo.rz); sys.say('Direct to ' + f.icao); } S.route.active = Math.min(S.route.active, Math.max(0, S.route.wps.length - 1)); drawMap(); return routeTable(); }
      if (d.s) { const sv = g.svc;
        if (d.s === 'fuel') { sv.fueling = !sv.fueling; sv.target = +$('sv-fuel').value; if (sv.fueling && sv.target < sys.fuelTotal()) { const k = sv.target / Math.max(1, sys.fuelTotal()); sys.fuel[0] *= k; sys.fuel[1] *= k; sv.fueling = false; sys.say('Defuelled to ' + lb(sv.target) + ' lb'); } else if (sv.fueling) sys.say('Refuelling to ' + lb(sv.target) + ' lb'); }
        if (d.s === 'cargo') { h.payload = +$('sv-cargo').value + (S.mission.cur && S.mission.cur.stage === 1 && S.mission.cur.type === 'troops' ? S.mission.cur.kg : 0); sys.say('Cabin load now ' + lb(h.payload) + ' lb'); }
        if (d.s === 'board') { const m = S.mission.cur; m.stage = 1; h.payload += m.kg; sys.say(m.n + ' troops aboard: ' + lb(m.kg) + ' lb'); } if (d.s === 'out') { const m = S.mission.cur; m.stage = 2; h.payload = Math.max(0, h.payload - m.kg); }
        if (d.s === 'sling') { tvx(h, 30); h.attachLoad(+$('sv-sling').value, U._x, S.terrain.height(U._x, U._z) + 0.6, U._z); g._reload = true; sys.say('Load rigged 30 m ahead: ' + lb(h.load.m) + ' lb'); }
        if (d.s === 'arm') { h.ammo = { gun: 1200, rkt: 38, msl: 8 }; sys.say('Rearmed'); }
        if (d.s === 'fix') { h.damage = 0; sys.fail = {}; sys.xmsnDead = false; sys.otq = 0; sys.chipT = 0; sys.bottles = 2; sys.ice = 0; sys.eng.forEach(en => { en.dead = false; en.fire = false; en.hot = 0; }); sys.batt = 1; sys.say('Aircraft repaired'); }
        return render(); }
      if (d.n != null) { if (d.n === 'clear') S.mission.clear(); else S.mission.start(U.msnOpts[+d.n], g.atRamp() || g.field, h, sys); return render(); }
      if (d.f) { if (d.f === 'rand') g.randFail = !g.randFail; else sys.fail[d.f] = !sys.fail[d.f]; return render(); }
    });
    $('ov').addEventListener('input', e => { const d = e.target.dataset; if (d.wx) { S.env[d.wx] = +e.target.value; const w = WX.find(q => q[0] === d.wx); $('wx-' + d.wx + '-v').textContent = w[5](+e.target.value); } sliders(); });
    $('menu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset, o = menuSel, g = G();
      if (d.ac) o.ac = d.ac; if (d.st) o.state = d.st; if (d.q) o.quality = d.q; if (d.pick) o.icao = d.pick;
      if (d.md) { o.mode = d.md; if (d.md === 'tilt') S.input.enableTilt().then(ok => { if (!ok) { o.mode = 'sticks'; U.menu(); } }); } if (d.cal) S.input.centerTilt();
      if (d.go) { o.sens = +$('mn-sens').value; o.vol = +$('mn-vol').value; applyOpts(); S.audio.start(); $('menu').style.display = 'none'; if (d.go === 'resume') { g.paused = false; g.opts = Object.assign(g.opts, { mode: o.mode, sens: o.sens, vol: o.vol }); S.terrain.quality = o.quality; return; } return g.start({ ...o }); }
      U.menu(); });
    $('menu').addEventListener('input', e => { if (e.target.id !== 'mn-q') return; $('mn-res').innerHTML = search(e.target.value).map(f => `<button data-pick="${f.icao}">${f.icao} ${esc(f.name.slice(0, 28))}</button>`).join(''); });
  };
  function tvx(h, d) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(h.q); U._x = h.pos.x + f.x * d; U._z = h.pos.z + f.z * d; }
  U.tick = () => {
    const g = G(), h = g.heli, sys = g.sys; if (!h) return;
    while (sys.msgs.length) { const d = document.createElement('div'); d.textContent = sys.msgs.shift(); $('msgs').appendChild(d); shown.push({ d, t: performance.now() + 5500 }); if (shown.length > 4) shown.shift().d.remove(); }
    while (shown.length && shown[0].t < performance.now()) shown.shift().d.remove();
    syncSw(); syncChk(); if (U.page === 'map' && g.frame % 32 === 0) { if (mapS.follow) { mapS.cx = h.pos.x; mapS.cz = h.pos.z; } drawMap(); routeTable(); }
    const l = h.load, sp = g.spec; let can = false; if (l && !l.on && sp.hook && sys.sw.hookArm) { const hk = new THREE.Vector3().fromArray(sp.hook).applyQuaternion(h.q).add(h.pos); can = Math.hypot(hk.x - l.pos.x, hk.z - l.pos.z) < 5 && hk.y - l.pos.y < 11 && hk.y > l.pos.y; }
    $('a-hook').style.display = can ? '' : 'none'; $('a-rel').style.display = l && l.on ? '' : 'none';
    const o = h.out, ext = $('ext'); ext.textContent = g.showPanel ? '' : `IAS ${Math.round(o.ias * S.KT)} KT\nALT ${S.fmt(h.pos.y * S.FT)} FT\nAGL ${S.fmt(Math.max(0, o.agl * S.FT))}\nVS  ${Math.round(o.vs * 196.85 / 50) * 50}\nHDG ${String(Math.round(o.hdg)).padStart(3, '0')}\nTQ  ${Math.round(sys.eng[0].tq)}/${Math.round(sys.eng[1].tq)}\nNR  ${Math.round(sys.nr * 100)}%\nFUEL ${lb(sys.fuelTotal())}`;
    const ret = $('ret'), showRet = sp.weapons && g.view === 'cockpit'; ret.style.display = showRet ? 'block' : 'none'; ret.className = S.wpn.lock ? 'lock' : ''; ret.style.top = g.showPanel ? '36%' : '50%';
    $('b-msn').className = S.mission.cur && !S.mission.cur.complete ? 'amb' : ''; $('b-svc').className = g.svc.fueling ? 'amb' : '';
    $('b-wx').className = Object.values(sys.fail).some(v => v) ? 'warn' : '';
  };
})();
