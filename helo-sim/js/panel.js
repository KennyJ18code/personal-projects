/* Glass-cockpit instrument panel drawn on a canvas: flight display, engine and fuel display, mode and caution panel.
   Screens only light up when the aircraft has electrical power. */
(function (root) {
  const S = root.SIM, clamp = S.clamp;
  const GRN = '#39e07a', WHT = '#e8f0ea', AMB = '#ffb52e', RED = '#ff4a3d', CYN = '#4fd8ff', MAG = '#ff5be1', DIM = '#5d7a68', BG = '#05080a';
  S.baroSet = 1013;
  // shared image of the panel used by the displays in the 3D cockpit
  if (typeof document !== 'undefined' && root.THREE) { const pc = S.panelCanvas = document.createElement('canvas'); pc._w = 1100; pc._h = 440; pc.width = 1100; pc.height = 440; const t = S.panelTex = new root.THREE.CanvasTexture(pc); t.minFilter = root.THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 4; }
  S.drawPanel = (cv, heli, sys, nav, env) => {
    const dpr = cv._w ? 1 : Math.min(root.devicePixelRatio || 1, 2), W = cv._w || cv.clientWidth, H = cv._h || cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0d0f10'; x.fillRect(0, 0, W, H);
    const o = heli.out, pw = sys.avionics, gap = 4, wP = Math.round(W * 0.42), wE = Math.round(W * 0.33), wM = W - wP - wE - gap * 2;
    const fs = clamp(H / 15, 8, cv._w ? 30 : 15); x.font = `600 ${fs}px ui-monospace,Menlo,Consolas,monospace`; x.textBaseline = 'middle';
    const scr = (sx, sw) => { x.fillStyle = pw ? BG : '#020303'; x.fillRect(sx, 0, sw, H); x.strokeStyle = '#2a2f31'; x.lineWidth = 2; x.strokeRect(sx + 1, 1, sw - 2, H - 2); };
    scr(0, wP); scr(wP + gap, wM); scr(wP + wM + gap * 2, wE); if (!pw) return;
    const txt = (s, px, py, c, al) => { x.fillStyle = c || WHT; x.textAlign = al || 'left'; x.fillText(s, px, py); };

    // ================= primary flight display =================
    x.save(); x.beginPath(); x.rect(2, 2, wP - 4, H - 4); x.clip();
    const tapeW = clamp(wP * 0.17, 30, 52), ax = tapeW, aw = wP - tapeW * 2, hsiH = Math.round(H * 0.26), ah = H - hsiH, cx = ax + aw / 2, cy = ah / 2, ppd = ah / 46;
    x.save(); x.beginPath(); x.rect(ax, 2, aw, ah - 2); x.clip(); x.translate(cx, cy); x.rotate(-o.roll); x.translate(0, o.pitch * S.R2D * ppd);
    x.fillStyle = '#1b5f9e'; x.fillRect(-600, -900, 1200, 900); x.fillStyle = '#6b4a22'; x.fillRect(-600, 0, 1200, 900); x.strokeStyle = WHT; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-600, 0); x.lineTo(600, 0); x.stroke();
    x.lineWidth = 1; for (let p = -90; p <= 90; p += 5) { if (!p) continue; const y = -p * ppd, l = p % 10 ? aw * 0.07 : aw * 0.15; x.beginPath(); x.moveTo(-l, y); x.lineTo(l, y); x.stroke(); if (p % 10 === 0) { txt(Math.abs(p), -l - 3, y, WHT, 'right'); txt(Math.abs(p), l + 3, y, WHT, 'left'); } }
    x.restore();
    x.save(); x.translate(cx, cy); x.strokeStyle = WHT; x.lineWidth = 1.5; const rr = Math.min(aw, ah) * 0.44;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const r = a * S.D2R - Math.PI / 2, l = a % 30 ? 5 : 9; x.beginPath(); x.moveTo(Math.cos(r) * rr, Math.sin(r) * rr); x.lineTo(Math.cos(r) * (rr + l), Math.sin(r) * (rr + l)); x.stroke(); }
    x.save(); x.rotate(-o.roll); x.fillStyle = WHT; x.beginPath(); x.moveTo(0, -rr); x.lineTo(-5, -rr + 9); x.lineTo(5, -rr + 9); x.fill(); x.restore();
    x.strokeStyle = '#ffd400'; x.lineWidth = 3; x.beginPath(); x.moveTo(-aw * 0.3, 0); x.lineTo(-aw * 0.1, 0); x.lineTo(-aw * 0.1, 6); x.moveTo(aw * 0.3, 0); x.lineTo(aw * 0.1, 0); x.lineTo(aw * 0.1, 6); x.stroke(); x.fillStyle = '#ffd400'; x.fillRect(-2, -2, 4, 4);
    const bw = aw * 0.3, by = ah / 2 - 9; x.strokeStyle = WHT; x.lineWidth = 1; x.strokeRect(-bw / 2, by - 5, bw, 10); x.fillStyle = WHT; x.beginPath(); x.arc(clamp(-(o.slip || 0) * 0.9 * (o.tas > 8 ? 1 : 0.3), -1, 1) * bw / 2 * 0.85, by, 4, 0, 7); x.fill();
    x.restore();
    // speed tape
    const kt = o.ias * S.KT, tape = (tx, val, step, pxPer, big, lim) => {
      x.fillStyle = 'rgba(8,12,14,.92)'; x.fillRect(tx, 2, tapeW, ah - 2); x.save(); x.beginPath(); x.rect(tx, 2, tapeW, ah - 2); x.clip(); x.strokeStyle = WHT; x.lineWidth = 1;
      const v0 = Math.floor((val - cy / pxPer) / step) * step;
      for (let v = v0; v < val + cy / pxPer + step; v += step) { const y = cy - (v - val) * pxPer; if (lim && v < 0) continue; x.beginPath(); x.moveTo(tx + (tx ? 0 : tapeW - 5), y); x.lineTo(tx + (tx ? 5 : tapeW), y); x.stroke(); if (Math.round(v / step) % big === 0) txt(String(Math.round(v)), tx + (tx ? 8 : tapeW - 8), y, WHT, tx ? 'left' : 'right'); }
      x.restore(); x.fillStyle = '#000'; x.fillRect(tx + 1, cy - fs * 0.8, tapeW - 2, fs * 1.6); x.strokeStyle = WHT; x.strokeRect(tx + 1, cy - fs * 0.8, tapeW - 2, fs * 1.6);
    };
    tape(0, kt, 10, ah / 90, 2, true); txt(String(Math.round(kt)), tapeW - 5, cy, kt > heli.s.vne * S.KT ? RED : GRN, 'right'); txt('KIAS', 3, fs * 0.8, DIM);
    const altFt = (heli.pos.y - 0) * S.FT + (S.baroSet - env.qnh) * 27;
    tape(wP - tapeW, altFt, 100, ah / 700, 2, false); txt(String(Math.round(altFt / 10) * 10), wP - 4, cy, GRN, 'right'); txt(S.baroSet + '', wP - 4, fs * 0.8, CYN, 'right');
    const agl = o.agl * S.FT; if (agl < 1500) { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(cx - 26, ah - fs * 1.6 - 14, 52, fs * 1.4); txt('R ' + Math.max(0, Math.round(agl < 100 ? agl : agl / 10 * 1) ), cx, ah - fs * 0.9 - 14, agl < 50 ? AMB : GRN, 'center'); }
    const vs = o.vs * 196.85, vx = wP - tapeW - 7; x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(vx - 3, cy - ah * 0.36, 6, ah * 0.72); x.fillStyle = Math.abs(vs) > 1500 ? AMB : MAG; const vh = clamp(vs / 2000, -1, 1) * ah * 0.36; x.fillRect(vx - 3, vh > 0 ? cy - vh : cy, 6, Math.abs(vh)); txt(String(Math.round(vs / 50) * 50), vx - 6, cy + (vs >= 0 ? -1 : 1) * (Math.abs(vh) + fs * 0.7), MAG, 'right');
    // heading strip
    const hy = ah, hd = o.hdg, pxd = wP / 110; x.fillStyle = '#0a0f12'; x.fillRect(2, hy, wP - 4, hsiH - 2); x.save(); x.beginPath(); x.rect(2, hy, wP - 4, hsiH - 2); x.clip(); x.strokeStyle = WHT; x.lineWidth = 1;
    for (let d = Math.floor((hd - 60) / 5) * 5; d < hd + 60; d += 5) { const px = wP / 2 + (d - hd) * pxd, dd = S.wrap360(d); x.beginPath(); x.moveTo(px, hy); x.lineTo(px, hy + (dd % 10 ? 4 : 8)); x.stroke(); if (dd % 30 === 0) txt(dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10), px, hy + 8 + fs * 0.6, WHT, 'center'); }
    const bug = (b, c) => { if (b == null) return; const px = wP / 2 + clamp(S.wrap180(b - hd), -54, 54) * pxd; x.fillStyle = c; x.beginPath(); x.moveTo(px, hy + 9); x.lineTo(px - 5, hy); x.lineTo(px + 5, hy); x.fill(); };
    bug(heli.hdgBug, CYN); bug(nav.brg, MAG); x.restore();
    x.fillStyle = '#000'; x.fillRect(wP / 2 - 20, hy + hsiH - fs * 1.7, 40, fs * 1.4); txt(String(Math.round(hd)).padStart(3, '0'), wP / 2, hy + hsiH - fs, GRN, 'center');
    txt('GS ' + Math.round(o.gs * S.KT), 5, hy + hsiH - fs, WHT);
    if (nav.name) txt(nav.name + ' ' + String(Math.round(nav.brg)).padStart(3, '0') + '/' + nav.dist.toFixed(1), wP - 5, hy + hsiH - fs, MAG, 'right');
    x.restore();

    // ================= centre: modes, weapons, load =================
    const mx = wP + gap + 5, lh = fs * 1.35; let y = lh * 0.8; const sw = sys.sw;
    const lamp = (label, on, c) => { x.fillStyle = on ? (c || GRN) : '#1a2224'; x.fillRect(mx, y - lh * 0.42, wM - 10, lh * 0.84); txt(label, mx + (wM - 10) / 2, y, on ? '#03140a' : DIM, 'center'); y += lh; };
    lamp('SAS', sys.sasOK); lamp('FPS', sys.fpsOK);
    lamp(sw.altHold ? 'ALT ' + Math.round(heli.altRef * S.FT / 10) * 10 : 'ALT', sw.altHold, CYN); lamp(sw.iasHold ? 'IAS ' + Math.round(heli.iasRef * S.KT) : 'IAS', sw.iasHold, CYN);
    lamp(sw.navMode ? 'NAV' : 'HDG ' + String(Math.round(heli.hdgBug)).padStart(3, '0'), sw.navMode || sw.hdgHold, CYN);
    if (heli.s.weapons) { lamp(sw.masterArm ? 'ARMED' : 'SAFE', sw.masterArm, RED); const a = heli.ammo; txt((sw.wpn === 0 ? '>' : ' ') + 'GUN ' + a.gun, mx, y, sw.wpn === 0 ? WHT : DIM); y += lh; txt((sw.wpn === 1 ? '>' : ' ') + 'RKT ' + a.rkt, mx, y, sw.wpn === 1 ? WHT : DIM); y += lh; txt((sw.wpn === 2 ? '>' : ' ') + 'MSL ' + a.msl + (nav.lock ? ' LOCK' : ''), mx, y, sw.wpn === 2 ? (nav.lock ? RED : WHT) : DIM); y += lh; }
    else if (heli.load && heli.load.on) { lamp('LOAD ' + S.fmt(heli.load.m * S.LB), true, AMB); txt('TEN ' + S.fmt(heli.load.tension / S.G * S.LB), mx, y, WHT); y += lh; }
    else if (heli.payload > 0) { txt('CARGO', mx, y, DIM); y += lh; txt(S.fmt(heli.payload * S.LB) + ' LB', mx, y, WHT); y += lh; }
    txt('GW ' + S.fmt((heli.mass() + (heli.load && heli.load.on ? heli.load.m : 0)) * S.LB), mx, H - lh * 2.3, WHT); txt('OAT ' + Math.round(S.atmo(heli.pos.y, env).T) + 'C', mx, H - lh * 1.4, DIM);
    const hh = env.timeH; txt(String(Math.floor(hh)).padStart(2, '0') + ':' + String(Math.floor(hh % 1 * 60)).padStart(2, '0') + 'L', mx, H - lh * 0.55, DIM);

    // ================= engines, rotor, fuel, cautions =================
    const ex = wP + wM + gap * 2, e = sys.eng, bh = H * 0.44, top = fs * 1.5, colW = wE / 9;
    const bar = (i, label, v, max, red, amber, digits) => {
      const bx = ex + colW * (0.5 + i * 1.02); x.fillStyle = '#152024'; x.fillRect(bx, top, colW * 0.62, bh); const f = clamp(v / max, 0, 1);
      x.fillStyle = v >= red ? RED : v >= amber ? AMB : GRN; x.fillRect(bx, top + bh * (1 - f), colW * 0.62, bh * f);
      x.fillStyle = RED; x.fillRect(bx - 2, top + bh * (1 - red / max), colW * 0.62 + 4, 1.5);
      txt(digits, bx + colW * 0.31, top + bh + fs * 0.8, WHT, 'center'); if (label) txt(label, bx + colW * 0.62, fs * 0.75, DIM, 'center');
    };
    bar(0, 'TQ', e[0].tq, 140, 100, 90, Math.round(e[0].tq)); bar(1, '', e[1].tq, 140, 100, 90, Math.round(e[1].tq));
    bar(2.3, 'TGT', e[0].tgt, 1000, 880, 810, Math.round(e[0].tgt)); bar(3.3, '', e[1].tgt, 1000, 880, 810, Math.round(e[1].tgt));
    const nrP = sys.nr * 100, rc = v => (v < 95 || v > 105) ? (v < 90 || v > 110 ? RED : AMB) : GRN;
    const tb = (i, v, lab) => { const bx = ex + colW * (5.1 + i * 0.82); x.fillStyle = '#152024'; x.fillRect(bx, top, colW * 0.5, bh); const f = clamp(v / 125, 0, 1); x.fillStyle = rc(v); x.fillRect(bx, top + bh * (1 - f), colW * 0.5, bh * f); x.fillStyle = WHT; x.fillRect(bx - 2, top + bh * 0.2, colW * 0.5 + 4, 1); txt(lab, bx + colW * 0.25, fs * 0.75, DIM, 'center'); };
    tb(0, e[0].np, '1'); tb(1, nrP, 'R'); tb(2, e[1].np, '2'); txt(Math.round(nrP) + '%', ex + colW * 6.2, top + bh + fs * 0.8, rc(nrP), 'center');
    let fy = top + bh + fs * 2.1; const lb = v => S.fmt(v * S.LB / 10) + '0', ffh = sys.ffTotal * 3600;
    txt('NG ' + Math.round(e[0].ng) + ' / ' + Math.round(e[1].ng), ex + 5, fy, WHT); txt('OIL ' + Math.round(e[0].oil) + '/' + Math.round(e[1].oil), ex + wE - 5, fy, DIM, 'right'); fy += lh;
    const low = sys.fuelTotal() < heli.s.fuelCap * 0.14;
    txt('FUEL ' + lb(sys.fuel[0]) + ' | ' + lb(sys.fuel[1]), ex + 5, fy, low ? AMB : WHT); txt('= ' + lb(sys.fuelTotal()), ex + wE - 5, fy, low ? AMB : GRN, 'right'); fy += lh;
    const end = ffh > 1 ? sys.fuelTotal() / ffh : 0; txt('FLOW ' + S.fmt(ffh * S.LB) + ' PPH', ex + 5, fy, WHT); txt(ffh > 1 ? Math.floor(end) + '+' + String(Math.floor(end % 1 * 60)).padStart(2, '0') : '-+--', ex + wE - 5, fy, CYN, 'right'); fy += lh;
    const blink = (performance.now() % 700) < 420, list = (sys.warnings || []).map(w => [w, RED]).concat((sys.cautions || []).map(c => [c, AMB]));
    const cols = 2, cw = (wE - 8) / cols; let n = 0; x.font = `700 ${fs * 0.86}px ui-monospace,Menlo,Consolas,monospace`;
    for (const [m, c] of list) { const cxx = ex + 4 + (n % cols) * cw, cyy = fy + Math.floor(n / cols) * lh * 0.92; if (cyy > H - 4) break; if (c === RED) { if (blink) { x.fillStyle = RED; x.fillRect(cxx, cyy - lh * 0.42, cw - 3, lh * 0.84); txt(m, cxx + 3, cyy, '#fff'); } } else txt(m, cxx + 3, cyy, c); n++; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
