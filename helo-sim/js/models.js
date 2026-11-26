/* 3D aircraft: textured lofted fuselages with detail parts, rotor systems, lights, and a modelled cockpit interior
   whose displays show the live instrument panel. Axes: +X right, +Y up, -Z forward, origin at the CG. */
(function (root) {
  const S = root.SIM, T3 = root.THREE, clamp = S.clamp;
  const M = {};
  function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T3.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = T3.RepeatWrapping; } t.anisotropy = 4; return t; }
  function mats() {
    if (M.od) return M;
    // painted skin: mottled, with panel lines, rivets and streaks
    const skin = canvasTex(512, 512, (x, w, h) => {
      const im = x.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = (j * w + i) * 4, v = 200 + (S.fbm(i / 60, j / 60, 4) - 0.5) * 70 + (S.hash2(i, j) - 0.5) * 14 - Math.max(0, S.vnoise(i / 9, j / 140) - 0.62) * 90; im.data[k] = im.data[k + 1] = im.data[k + 2] = clamp(v, 0, 255); im.data[k + 3] = 255; }
      x.putImageData(im, 0, 0); x.strokeStyle = 'rgba(0,0,0,.42)'; x.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) { const p = i * 64 + (i % 2 ? 9 : 0); x.beginPath(); x.moveTo(0, p + 0.5); x.lineTo(w, p + 0.5); x.stroke(); }
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { if (S.hash2(i, j + 40) > 0.6) continue; const px = i * 64 + S.hash2(i, j) * 30; x.beginPath(); x.moveTo(px + 0.5, j * 64); x.lineTo(px + 0.5, j * 64 + 64); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.3)'; for (let j = 0; j < 8; j++) for (let i = 0; i < w; i += 8) x.fillRect(i, j * 64 + 4, 1.4, 1.4);
      x.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 40; i++) x.fillRect(S.hash2(i, 3) * w, S.hash2(i, 8) * h, 30 + S.hash2(i, 5) * 60, 1);
    }, true);
    const ph = (c, sh) => new T3.MeshPhongMaterial({ color: c, map: skin, shininess: sh || 16, specular: 0x242622 });
    M.od = ph(0x5a6149); M.od2 = ph(0x4a5040); M.dark = new T3.MeshPhongMaterial({ color: 0x1b1d1c, shininess: 30, specular: 0x333333 });
    M.glass = new T3.MeshPhongMaterial({ color: 0x0a1217, shininess: 140, specular: 0xcfe2f2, transparent: true, opacity: 0.86 });
    M.metal = new T3.MeshPhongMaterial({ color: 0x777a76, shininess: 60, specular: 0x666666 }); M.tire = new T3.MeshLambertMaterial({ color: 0x141414 }); M.blade = new T3.MeshPhongMaterial({ color: 0x1d1f1e, shininess: 10, specular: 0x222222 });
    M.discTex = canvasTex(256, 256, (x, w) => { const im = x.createImageData(w, w); for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) { const u = i / w * 2 - 1, v = j / w * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u), k = (j * w + i) * 4; const al = r > 1 || r < 0.05 ? 0 : (0.2 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin(a * 4 + r * 1.5), 3)) * (0.35 + 0.65 * r) * clamp((1 - r) * 30, 0, 1); im.data[k] = im.data[k + 1] = im.data[k + 2] = r > 0.93 ? 150 : 28; im.data[k + 3] = al * 255; } x.putImageData(im, 0, 0); });
    M.inner = new T3.MeshLambertMaterial({ color: 0x2b2f33, side: T3.DoubleSide }); M.panel = new T3.MeshLambertMaterial({ color: 0x16181b, side: T3.DoubleSide }); M.bezel = new T3.MeshLambertMaterial({ color: 0x33373b }); M.seat = new T3.MeshLambertMaterial({ color: 0x3a4034 });
    M.red = new T3.MeshBasicMaterial({ color: 0xff2a1a }); M.green = new T3.MeshBasicMaterial({ color: 0x22ff55 }); M.white = new T3.MeshBasicMaterial({ color: 0xffffff }); M.off = new T3.MeshBasicMaterial({ color: 0x222222 });
    M.crate = new T3.MeshLambertMaterial({ color: 0x6b5a3a }); M.cable = new T3.LineBasicMaterial({ color: 0x111111 }); M.yellow = new T3.MeshLambertMaterial({ color: 0xc9a227 });
    // cockpit surfaces: keypads and switch rows
    M.console = new T3.MeshLambertMaterial({ map: canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#1a1c1f'; x.fillRect(0, 0, w, h); for (let b = 0; b < 4; b++) { const y = 12 + b * 124; x.fillStyle = '#0b0d0e'; x.fillRect(12, y, w - 24, 112); x.strokeStyle = '#3c4146'; x.strokeRect(12, y, w - 24, 112); if (b % 2 === 0) { x.fillStyle = '#0d2a18'; x.fillRect(24, y + 10, w - 48, 30); x.fillStyle = '#39e07a'; x.font = '14px monospace'; x.fillText(b ? 'COM2 243.000' : 'COM1 121.500', 30, y + 30); } for (let r = 0; r < (b % 2 ? 4 : 3); r++) for (let c = 0; c < 6; c++) { x.fillStyle = '#2c3034'; x.fillRect(26 + c * 35, y + (b % 2 ? 12 : 50) + r * 22, 28, 16); } } }) });
    M.overhead = new T3.MeshLambertMaterial({ side: T3.DoubleSide, map: canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#1b1d20'; x.fillRect(0, 0, w, h); x.font = '9px monospace'; for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { const px = 22 + c * 46, py = 28 + r * 54; x.fillStyle = '#0a0b0c'; x.fillRect(px - 14, py - 16, 28, 34); x.fillStyle = '#c9ccd0'; x.fillRect(px - 2, py - 10 + ((r + c) % 2) * 6, 4, 14); x.fillStyle = '#7d858c'; x.fillText(['BATT', 'GEN', 'APU', 'FUEL', 'IGN', 'HYD', 'LTS', 'ICE', 'SAS'][r], px - 12, py + 26); } }) });
    M.stby = new T3.MeshBasicMaterial({ map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#101214'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3; i++) { const cx = 44 + i * 84, cy = 64; x.fillStyle = '#050607'; x.beginPath(); x.arc(cx, cy, 36, 0, 7); x.fill(); x.strokeStyle = '#d8dde0'; x.lineWidth = 1.5; for (let a = 0; a < 12; a++) { const t = a * 0.5236; x.beginPath(); x.moveTo(cx + Math.cos(t) * 28, cy + Math.sin(t) * 28); x.lineTo(cx + Math.cos(t) * 34, cy + Math.sin(t) * 34); x.stroke(); } x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 18, cy - 20); x.stroke(); } }) });
    M.lampOff = new T3.Color(0x2a1210); M.lampRed = new T3.Color(0xff3a2a); M.lampAmb = new T3.Color(0xffb52e);
    return M;
  }
  // secs: [z, halfWidth, yCentre, halfHeight, squareness] from nose to tail
  function loft(secs, mat, K) {
    K = K || 20; const P = [], U = [], I = [], n = secs.length;
    for (let i = 0; i < n; i++) { const [z, hw, y, hh, e] = secs[i], ex = 2 / (e || 2.6);
      for (let k = 0; k <= K; k++) { const a = k / K * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); P.push(hw * Math.sign(c) * Math.pow(Math.abs(c), ex), y + hh * Math.sign(s) * Math.pow(Math.abs(s), ex), z); U.push(k / K * 3, z / 2.6); } }
    const R = K + 1; for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) { const A = i * R + k, B = A + 1, C = A + R, D = C + 1; I.push(A, B, C, B, D, C); }
    const c0 = P.length / 3; P.push(0, secs[0][2], secs[0][0]); U.push(0, 0); const c1 = c0 + 1; P.push(0, secs[n - 1][2], secs[n - 1][0]); U.push(0, 0);
    for (let k = 0; k < K; k++) { I.push(c0, k + 1, k); I.push(c1, (n - 1) * R + k, (n - 1) * R + k + 1); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    // weld the seam normals so the join does not show
    const N = g.attributes.normal; for (let i = 0; i < n; i++) { const a = i * R, b = a + K, nx = N.getX(a) + N.getX(b), ny = N.getY(a) + N.getY(b), nz = N.getZ(a) + N.getZ(b), l = Math.hypot(nx, ny, nz) || 1; N.setXYZ(a, nx / l, ny / l, nz / l); N.setXYZ(b, nx / l, ny / l, nz / l); }
    return new T3.Mesh(g, mat);
  }
  const box = (w, h, d, mat, x, y, z, rx, ry, rz) => { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); return m; };
  const cyl = (r1, r2, l, mat, x, y, z, axis, seg) => { const g = new T3.CylinderGeometry(r1, r2, l, seg || 16); if (axis === 'z') g.rotateX(Math.PI / 2); if (axis === 'x') g.rotateZ(Math.PI / 2); const m = new T3.Mesh(g, mat); m.position.set(x, y, z); return m; };
  const ball = (r, mat, x, y, z, sx, sy, sz) => { const m = new T3.Mesh(new T3.SphereGeometry(r, 16, 12), mat); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); return m; };
  function wheel(g, x, y, z, r, w) { g.add(cyl(r, r, w, M.tire, x, y + r, z, 'x', 18)); g.add(cyl(r * 0.5, r * 0.5, w + 0.02, M.metal, x, y + r, z, 'x', 12)); }
  function strut(g, x1, y1, z1, x2, y2, z2, r) { const a = new T3.Vector3(x1, y1, z1), b = new T3.Vector3(x2, y2, z2), l = a.distanceTo(b), m = new T3.Mesh(new T3.CylinderGeometry(r, r, l, 8), M.metal); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), b.sub(a).normalize()); g.add(m); }
  function rotor(R, nb, chord, dir, phase, swept) {
    const g = new T3.Group(), blades = new T3.Group();
    for (let i = 0; i < nb; i++) { const b = new T3.Group(), L = R - 0.7;
      b.add(box(L, 0.05, chord, M.blade, L / 2 + 0.7, 0, 0), box(0.5, 0.055, chord * 0.85, M.yellow, R - 0.05, 0, swept ? chord * 0.22 : 0, 0, swept ? -0.35 : 0, 0), box(0.75, 0.1, 0.14, M.metal, 0.38, 0, 0), cyl(0.03, 0.03, 0.45, M.metal, 0.55, -0.22, chord * 0.5, 'y', 6));
      b.rotation.y = i / nb * Math.PI * 2; blades.add(b); }
    g.add(blades, cyl(0.3, 0.34, 0.3, M.metal, 0, 0, 0, 'y'), cyl(0.5, 0.5, 0.05, M.metal, 0, 0.2, 0, 'y'), cyl(0.42, 0.42, 0.05, M.dark, 0, -0.42, 0, 'y'));
    const disc = new T3.Mesh(new T3.CircleGeometry(R, 48), new T3.MeshBasicMaterial({ map: M.discTex, transparent: true, opacity: 0, side: T3.DoubleSide, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
    g.userData = { blades, disc, dir, ang: phase || 0 }; return g;
  }
  function tailRotor(R, nb, scissor) {
    const g = new T3.Group(), bl = new T3.Group();
    for (let i = 0; i < nb; i++) { const h = new T3.Group(); h.add(box(0.06, R, 0.24, M.blade, 0, R / 2, 0)); h.rotation.x = scissor ? [0.48, 2.66, 3.62, 5.8][i] : i / nb * Math.PI * 2; bl.add(h); }
    const disc = new T3.Mesh(new T3.CircleGeometry(R, 28), new T3.MeshBasicMaterial({ map: M.discTex, transparent: true, opacity: 0, side: T3.DoubleSide, depthWrite: false })); disc.rotation.y = Math.PI / 2; g.add(bl, disc, cyl(0.12, 0.12, 0.3, M.metal, 0, 0, 0, 'x', 10)); g.userData = { blades: bl, disc, ang: 0 }; return g;
  }
  function lamp(g, mat, x, y, z, r) { const m = new T3.Mesh(new T3.SphereGeometry(r || 0.07, 8, 6), mat.clone()); m.position.set(x, y, z); m.userData.noShadow = true; g.add(m); return m; }
  function lights(g, o, lx, ly, lz, tail, top) {
    o.navL = lamp(g, M.red, -lx, ly, lz); o.navR = lamp(g, M.green, lx, ly, lz); o.navT = lamp(g, M.white, tail[0], tail[1], tail[2]); o.beacon = lamp(g, M.red, top[0], top[1], top[2], 0.1);
    o.spot = new T3.SpotLight(0xfff4d6, 0, 480, 0.55, 0.5, 1.1); o.spot.position.set(0, -1.0, -3); o.spot.target.position.set(0, -14, -40); g.add(o.spot, o.spot.target);
  }

  // ---- cockpit interior: structure, instrument panel with live displays, consoles, controls ----
  function screen(w, h, u0, u1, x, y, z, parent) { // a display showing part of the shared panel image
    const g = new T3.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    const m = new T3.Mesh(g, S.panelMat); m.position.set(x, y, z + 0.004); parent.add(box(w + 0.04, h + 0.04, 0.02, M.bezel, x, y, z - 0.012), m);
    for (let i = 0; i < 5; i++) { parent.add(box(0.014, 0.01, 0.012, M.inner, x - w / 2 + (i + 0.5) * w / 5, y - h / 2 - 0.012, z)); parent.add(box(0.014, 0.01, 0.012, M.inner, x - w / 2 + (i + 0.5) * w / 5, y + h / 2 + 0.012, z)); }
  }
  function cockpit(spec, w, tandem) {
    const g = new T3.Group(), [ex, ey, ez] = spec.eye, o = { group: g }, W = w * 2.12;
    S.panelMat = S.panelMat || new T3.MeshBasicMaterial({ map: S.panelTex });
    // shell
    g.add(box(W, 0.04, 2.3, M.inner, 0, ey - 1.24, ez + 0.05), box(W, 0.04, 1.35, M.inner, 0, ey + 0.74, ez + 0.2), box(W, 2.0, 0.05, M.inner, 0, ey - 0.25, ez + 0.82));
    for (const s of [-1, 1]) { g.add(box(0.04, 0.72, 1.75, M.inner, s * w * 1.06, ey - 0.86, ez - 0.05), box(0.055, 1.22, 0.055, M.inner, s * w * 1.02, ey + 0.16, ez - 0.9, 0.36), box(0.06, 0.06, 1.2, M.inner, s * w * 1.05, ey + 0.72, ez - 0.2), box(0.05, 1.2, 0.07, M.inner, s * w * 1.06, ey + 0.13, ez + 0.4)); }
    g.add(box(W, 0.07, 0.07, M.inner, 0, ey + 0.72, ez - 0.68), box(W, 0.55, 0.04, M.inner, 0, ey - 1.0, ez - 1.02));
    // instrument panel, tilted to face the crew
    const P = new T3.Group(); P.position.set(0, ey - 0.53, ez - 0.72); P.rotation.x = -0.24; g.add(P);
    P.add(box(W * 0.97, 0.5, 0.05, M.panel, 0, 0, -0.03));
    if (tandem) { screen(0.26, 0.25, 0, 0.42, -0.16, 0.02, 0, P); screen(0.2, 0.25, 0.675, 1, 0.14, 0.02, 0, P); }
    else { for (const s of [1, -1]) { screen(0.3, 0.29, 0, 0.42, s * (ex + 0.02), 0.03, 0, P); screen(0.235, 0.29, 0.675, 1, s * (ex - 0.3), 0.03, 0, P); } screen(0.16, 0.26, 0.43, 0.665, 0, 0.03, 0, P); }
    // glareshield with master warning and caution lamps
    g.add(box(W, 0.03, 0.26, M.panel, 0, ey - 0.27, ez - 0.8, 0.08), box(W, 0.05, 0.03, M.panel, 0, ey - 0.285, ez - 0.675));
    o.mw = new T3.Mesh(new T3.BoxGeometry(0.07, 0.035, 0.012), new T3.MeshBasicMaterial({ color: 0x2a1210 })); o.mc = new T3.Mesh(new T3.BoxGeometry(0.07, 0.035, 0.012), new T3.MeshBasicMaterial({ color: 0x2a1210 }));
    o.mw.position.set(ex - 0.06, ey - 0.285, ez - 0.657); o.mc.position.set(ex + 0.04, ey - 0.285, ez - 0.657); g.add(o.mw, o.mc);
    // consoles, seats, flight controls
    if (!tandem) {
      g.add(box(0.4, 0.42, 1.25, M.panel, 0, ey - 1.02, ez - 0.05));
      o.pcl = [];
      g.add(box(0.5, 0.78, 0.1, M.seat, -ex, ey - 0.55, ez + 0.3, -0.1), box(0.5, 0.1, 0.5, M.seat, -ex, ey - 0.98, ez + 0.05), box(0.26, 0.2, 0.09, M.seat, -ex, ey - 0.02, ez + 0.36));
    } else { g.add(box(0.22, 0.3, 0.9, M.panel, -w * 0.8, ey - 0.75, ez), box(0.22, 0.3, 0.9, M.panel, w * 0.8, ey - 0.75, ez)); o.pcl = []; }
    o.cyc = new T3.Group(); o.cyc.add(cyl(0.016, 0.016, 0.62, M.dark, 0, 0.31, 0, 'y', 8), box(0.05, 0.13, 0.05, M.dark, 0, 0.66, -0.01, -0.3)); o.cyc.position.set(ex, ey - 1.2, ez - 0.42); g.add(o.cyc);
    o.col = new T3.Group(); o.col.add(cyl(0.018, 0.018, 0.5, M.dark, 0, 0, -0.25, 'z', 8), box(0.06, 0.07, 0.12, M.dark, 0, 0.02, -0.52)); o.col.position.set(ex - (tandem ? 0.3 : 0.33), ey - 0.98, ez + 0.2); g.add(o.col);
    if (S.buildPanels) S.buildPanels(o, spec, tandem, g, P);
    g.traverse(m => { if (m.isMesh) { m.receiveShadow = true; m.userData.inside = true; } }); g.visible = false; return o;
  }

  function uh60() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    o.hull = loft([[-6.05, 0.2, -0.62, 0.26], [-5.6, 0.68, -0.52, 0.56], [-4.7, 1.05, -0.38, 0.8, 3.2], [-3.5, 1.16, -0.32, 0.92, 3.6], [-1.5, 1.18, -0.3, 0.95, 4], [1.2, 1.15, -0.28, 0.93, 4], [2.4, 0.85, -0.1, 0.75, 3], [3.6, 0.5, 0.1, 0.5], [9.2, 0.26, 0.38, 0.3], [10.4, 0.14, 0.6, 0.24]], M.od); g.add(o.hull);
    g.add(loft([[-5.3, 0.62, -0.2, 0.36, 3], [-4.6, 1.045, 0.02, 0.44, 3.4], [-3.6, 1.155, 0.12, 0.5, 3.6], [-3.3, 1.1, 0.12, 0.5, 3.6]], M.glass));
    g.add(loft([[-3.0, 0.6, 0.72, 0.3, 3], [-2.0, 0.85, 0.82, 0.4, 3], [2.2, 0.85, 0.82, 0.4, 3], [3.4, 0.4, 0.6, 0.25]], M.od2));
    g.add(box(0.05, 0.75, 0.06, M.od2, 0, 0.1, -4.75, 0.55), ball(0.2, M.dark, 0, -1.02, -5.55), box(0.02, 0.3, 0.5, M.dark, 0, 0.75, -4.2, 0.5), box(0.02, 0.3, 0.5, M.dark, 0, -1.35, -3.9, -0.5));
    for (const s of [-1, 1]) { g.add(cyl(0.36, 0.33, 2.3, M.od2, s * 0.82, 0.95, 0.7, 'z'), cyl(0.3, 0.3, 0.12, M.dark, s * 0.82, 0.95, -0.5, 'z'), box(0.5, 0.42, 1.1, M.od2, s * 0.9, 0.98, 2.3), box(0.44, 0.34, 0.1, M.dark, s * 0.9, 0.98, 2.86));
      g.add(box(0.02, 0.52, 0.86, M.glass, s * 1.185, -0.05, -1.75), box(0.02, 0.52, 0.86, M.glass, s * 1.185, -0.05, -0.72), box(0.02, 0.45, 0.8, M.glass, s * 1.17, -0.05, 0.6), box(0.03, 0.05, 3.3, M.od2, s * 1.2, 0.36, -0.6), box(0.02, 0.5, 0.55, M.glass, s * 1.13, -0.02, -3.95));
      g.add(cyl(0.012, 0.012, 0.5, M.metal, s * 0.5, 0.55, -4.9, 'z', 6), box(0.3, 0.02, 0.5, M.od2, s * 1.3, -0.95, -1.9)); }
    g.add(loft([[9.4, 0.12, 0.6, 0.25], [9.9, 0.11, 1.5, 0.5, 2.2], [10.6, 0.1, 2.5, 0.45, 2.2], [11.1, 0.09, 3.1, 0.3, 2.2]], M.od), box(4.3, 0.09, 1.0, M.od, 0, 0.55, 10.3), box(0.3, 0.3, 0.4, M.od2, 0.2, 2.95, 10.95), box(0.02, 0.5, 0.25, M.dark, 0, -0.15, 6.2), box(0.02, 0.45, 0.2, M.dark, 0, 0.9, 5.2));
    const mr = rotor(8.18, 4, 0.53, 1, 0, true); mr.position.set(0, 1.85, 0); g.add(cyl(0.16, 0.22, 0.75, M.metal, 0, 1.45, 0, 'y'), mr); o.rotors.push(mr);
    const tr = tailRotor(1.68, 4); tr.position.set(0.42, 2.95, 11.0); tr.rotation.z = -0.35; g.add(tr); o.tail = tr;
    for (const s of [-1, 1]) { wheel(g, s * 1.35, -1.9, -1.2, 0.33, 0.26); strut(g, s * 1.35, -1.5, -1.2, s * 1.0, -0.7, -1.0, 0.07); strut(g, s * 1.35, -1.55, -1.2, s * 1.05, -1.0, 0.2, 0.05); strut(g, s * 1.35, -1.57, -1.2, s * 1.05, -0.95, -2.2, 0.04); }
    wheel(g, 0, -1.55, 7.6, 0.2, 0.16); strut(g, 0, -1.3, 7.6, 0, 0.1, 7.3, 0.06);
    lights(g, o, 1.3, 0.2, -1.0, [0, 3.3, 11.2], [0, 1.25, 3.2]); o.cp = cockpit(S.AIRCRAFT.uh60, 0.98, false); o.cockpit = o.cp.group; g.add(o.cockpit); return o;
  }
  function ah64() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    o.hull = loft([[-6.7, 0.18, -0.75, 0.2], [-6.0, 0.42, -0.65, 0.42], [-5.0, 0.56, -0.5, 0.62, 3], [-3.4, 0.6, -0.42, 0.75, 3.2], [-1.2, 0.62, -0.38, 0.82, 3.4], [1.4, 0.58, -0.3, 0.78, 3], [2.8, 0.38, -0.05, 0.5], [8.6, 0.2, 0.42, 0.24], [9.6, 0.12, 0.6, 0.2]], M.od); g.add(o.hull);
    g.add(loft([[-5.3, 0.36, 0.05, 0.3, 3.4], [-4.6, 0.5, 0.2, 0.42, 3.6], [-3.3, 0.52, 0.42, 0.5, 3.6], [-2.0, 0.54, 0.6, 0.55, 3.6], [-0.9, 0.5, 0.62, 0.5, 3.4]], M.glass));
    for (const z of [-4.55, -3.3, -2.05]) g.add(box(1.1, 0.04, 0.05, M.od2, 0, z > -3 ? 1.12 : z > -4 ? 0.9 : 0.6, z), box(0.04, 0.5, 0.05, M.od2, -0.52, z > -3 ? 0.85 : 0.65, z), box(0.04, 0.5, 0.05, M.od2, 0.52, z > -3 ? 0.85 : 0.65, z));
    g.add(loft([[-1.2, 0.5, 0.75, 0.42, 3], [1.6, 0.5, 0.78, 0.42, 3], [2.6, 0.3, 0.6, 0.25]], M.od2));
    for (const s of [-1, 1]) {
      g.add(cyl(0.4, 0.38, 2.6, M.od2, s * 0.98, 0.32, 0.9, 'z'), cyl(0.33, 0.33, 0.1, M.dark, s * 0.98, 0.32, -0.42, 'z'), box(0.55, 0.4, 0.9, M.dark, s * 1.02, 0.4, 2.5));
      g.add(box(2.1, 0.13, 1.0, M.od, s * 1.6, -0.35, -0.2), box(0.5, 0.6, 3.6, M.od2, s * 0.75, -0.75, -2.4));
      g.add(cyl(0.2, 0.2, 1.7, M.od2, s * 2.45, -0.72, -0.3, 'z'), cyl(0.2, 0.06, 0.25, M.dark, s * 2.45, -0.72, -1.25, 'z'), cyl(0.19, 0.19, 0.03, M.dark, s * 2.45, -0.72, 0.56, 'z'));
      for (const dx of [-0.16, 0.16]) for (const dy of [0, -0.28]) { g.add(cyl(0.085, 0.085, 1.6, M.dark, s * 1.55 + dx, -0.62 + dy, -0.35, 'z', 10)); g.add(ball(0.085, M.metal, s * 1.55 + dx, -0.62 + dy, -1.15)); }
      g.add(box(0.1, 0.3, 0.5, M.od2, s * 2.45, -0.52, -0.2), box(0.1, 0.25, 0.5, M.od2, s * 1.55, -0.48, -0.2), box(0.5, 0.05, 0.3, M.od2, s * 1.55, -0.6, -0.2));
      wheel(g, s * 1.02, -1.95, -1.6, 0.32, 0.24); strut(g, s * 1.02, -1.6, -1.6, s * 0.6, -0.9, -0.6, 0.07); strut(g, s * 1.02, -1.62, -1.6, s * 0.62, -0.7, -1.9, 0.05);
    }
    g.add(cyl(0.3, 0.3, 0.5, M.dark, 0, -0.75, -6.75, 'x', 14), cyl(0.16, 0.16, 0.3, M.dark, 0, -0.38, -6.5, 'y'), ball(0.16, M.glass, 0.12, -0.72, -6.98), ball(0.1, M.glass, -0.14, -0.7, -6.98));
    const gun = new T3.Group(); gun.add(cyl(0.05, 0.05, 1.5, M.dark, 0, -0.12, -0.7, 'z', 8), box(0.3, 0.25, 0.6, M.dark, 0, -0.05, 0), cyl(0.07, 0.07, 0.2, M.metal, 0, -0.12, -1.4, 'z', 8)); gun.position.set(0, -1.28, -3.6); g.add(gun); o.gun = gun;
    g.add(loft([[8.7, 0.1, 0.6, 0.2], [9.1, 0.1, 1.4, 0.45, 2.2], [9.7, 0.09, 2.3, 0.4, 2.2], [10.1, 0.08, 2.9, 0.25, 2.2]], M.od), box(3.4, 0.09, 0.9, M.od, 0, 0.25, 9.6));
    const mr = rotor(7.32, 4, 0.53, 1, 0, true); mr.position.set(0, 1.75, 0); g.add(cyl(0.15, 0.2, 0.8, M.metal, 0, 1.35, 0, 'y'), cyl(0.1, 0.1, 0.5, M.metal, 0, 2.0, 0, 'y'), ball(0.55, M.od2, 0, 2.35, 0, 1, 0.42, 1), mr); o.rotors.push(mr);
    const tr = tailRotor(1.4, 4, true); tr.position.set(-0.4, 2.55, 9.75); g.add(tr); o.tail = tr;
    wheel(g, 0, -1.35, 8.9, 0.18, 0.14); strut(g, 0, -1.1, 8.9, 0, 0.3, 8.7, 0.05);
    lights(g, o, 2.6, -0.35, -0.2, [0, 3.0, 10.1], [0, 1.25, 2.6]); o.cp = cockpit(S.AIRCRAFT.ah64, 0.52, true); o.cockpit = o.cp.group; g.add(o.cockpit); return o;
  }
  function ch47() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    o.hull = loft([[-7.8, 0.35, -0.75, 0.45], [-7.3, 0.95, -0.6, 0.9, 3], [-6.4, 1.25, -0.42, 1.18, 3.6], [-5.2, 1.3, -0.4, 1.25, 5], [5.4, 1.3, -0.4, 1.25, 5], [6.6, 1.2, -0.2, 1.1, 4], [7.5, 0.9, 0.2, 0.75, 3]], M.od); g.add(o.hull);
    g.add(loft([[-7.45, 0.82, -0.28, 0.42, 3], [-6.9, 1.12, -0.05, 0.55, 3.6], [-6.1, 1.275, 0.08, 0.6, 4], [-5.7, 1.26, 0.08, 0.58, 4]], M.glass));
    g.add(box(0.06, 0.9, 0.06, M.od2, 0, 0.1, -6.95, 0.6), box(0.05, 0.75, 0.05, M.od2, -0.8, 0.05, -6.7, 0.55), box(0.05, 0.75, 0.05, M.od2, 0.8, 0.05, -6.7, 0.55));
    g.add(loft([[-7.0, 0.3, 0.9, 0.3], [-6.4, 0.55, 1.3, 0.65, 3], [-5.2, 0.6, 1.35, 0.7, 3], [-3.6, 0.45, 1.05, 0.35, 3], [3.6, 0.42, 1.0, 0.25, 3]], M.od2));
    g.add(loft([[3.4, 0.4, 1.2, 0.5, 3], [4.6, 0.62, 1.9, 1.3, 3], [6.0, 0.62, 2.1, 1.5, 3], [7.4, 0.35, 2.2, 1.2, 3]], M.od2), box(0.9, 0.7, 0.1, M.dark, 0, 2.6, 4.55, -0.5), box(2.2, 0.06, 1.9, M.od2, 0, -1.2, 7.2, -0.45));
    for (const s of [-1, 1]) {
      const pod = loft([[-4.8, 0.3, -1.25, 0.4, 3], [-4.0, 0.48, -1.2, 0.5, 3.4], [4.0, 0.48, -1.2, 0.5, 3.4], [4.9, 0.3, -1.2, 0.4, 3]], M.od2); pod.position.x = s * 1.5; g.add(pod);
      g.add(cyl(0.46, 0.42, 2.1, M.od2, s * 1.35, 1.25, 5.3, 'z'), cyl(0.36, 0.36, 0.1, M.dark, s * 1.35, 1.25, 4.22, 'z'), cyl(0.32, 0.36, 0.5, M.dark, s * 1.35, 1.25, 6.5, 'z'));
      for (let i = 0; i < 5; i++) g.add(cyl(0.23, 0.23, 0.03, M.glass, s * 1.31, -0.05, -3.6 + i * 1.75, 'x', 14));
      g.add(box(0.02, 0.6, 0.6, M.glass, s * 1.28, -0.1, -6.25));
      for (const z of [-3.5, 3.4]) { wheel(g, s * 1.6 - 0.14, -2.25, z, 0.3, 0.2); wheel(g, s * 1.6 + 0.14, -2.25, z, 0.3, 0.2); strut(g, s * 1.6, -1.9, z, s * 1.5, -1.3, z, 0.08); }
    }
    const f = rotor(9.14, 3, 0.81, 1, 0); f.position.set(0, 2.15, -5.95); const a = rotor(9.14, 3, 0.81, -1, Math.PI / 3); a.position.set(0, 3.75, 5.95);
    g.add(cyl(0.2, 0.25, 0.5, M.metal, 0, 1.9, -5.95, 'y'), cyl(0.2, 0.25, 0.5, M.metal, 0, 3.5, 5.95, 'y'), f, a, cyl(0.1, 0.1, 0.2, M.metal, 0, -1.72, 0, 'y', 8)); o.rotors.push(f, a);
    lights(g, o, 1.95, -1.0, 0, [0, 1.8, 7.6], [0, 3.6, 6.6]); o.cp = cockpit(S.AIRCRAFT.ch47, 1.02, false); o.cockpit = o.cp.group; g.add(o.cockpit); return o;
  }
  S.buildAircraft = id => { mats(); const o = ({ uh60, ah64, ch47 })[id](); o.group.traverse(m => { if (m.isMesh) { m.frustumCulled = false; if (!m.userData.inside && !m.userData.noShadow && !m.material.transparent) m.castShadow = true; if (!m.material.transparent) m.receiveShadow = true; } }); return o; };

  // Spin rotors, blur at speed, cone with thrust, lights, cockpit levers and warning lamps.
  S.animateAircraft = (o, dt, sys, heli, night) => {
    const nr = sys.nr, s = heli.s, cone = clamp(heli.out.T / (s.mgw * S.G) * 0.07, 0, 0.12) * (nr > 0.3 ? 1 : 0) - (1 - Math.min(1, nr * 2)) * 0.05;
    o.rotors.forEach(r => { const u = r.userData; u.ang += u.dir * nr * s.omega * dt; r.rotation.y = u.ang; u.disc.material.opacity = clamp((nr - 0.3) * 1.6, 0, 1); u.disc.position.y = 0.02 + cone * s.R * 0.5; u.blades.visible = nr < 0.72; u.blades.children.forEach(b => { b.rotation.z = cone; }); });
    if (o.tail) { const u = o.tail.userData; u.ang += nr * s.omega * 5 * dt; u.blades.rotation.x = u.ang; u.disc.material.opacity = clamp((nr - 0.2) * 1.6, 0, 1); u.blades.visible = nr < 0.6 || !!sys.fail.tr; }
    const sw = sys.sw, pw = sys.dc, t = performance.now() / 1000;
    const set = (m, on, mat) => { m.material.color.copy(on ? mat.color : M.off.color); m.scale.setScalar(on && night ? 2.2 : 1); };
    set(o.navL, pw && sw.pos, M.red); set(o.navR, pw && sw.pos, M.green); set(o.navT, pw && sw.pos, M.white); set(o.beacon, pw && sw.acol && (t % 1.1) < 0.12, M.red);
    o.spot.intensity = pw && (sw.land || sw.search) ? (sw.land && sw.search ? 3.2 : 2.2) : 0;
    const cp = o.cp; if (cp && cp.group.visible) {
      const blink = (t % 0.7) < 0.42; cp.mw.material.color.copy(pw && sys.warnings && sys.warnings.length && blink ? M.lampRed : M.lampOff); cp.mc.material.color.copy(pw && sys.cautions && sys.cautions.length ? M.lampAmb : M.lampOff);
      if (cp.ctl) S.updatePanels(cp, sys, heli, dt, night); cp.cyc.rotation.set(-heli.eff.lon * 0.22, 0, -heli.eff.lat * 0.22); cp.col.rotation.x = heli.eff.coll * 0.5;
    }
  };
  S.buildLoad = kg => { mats(); const g = new T3.Group(), s = clamp(Math.cbrt(kg / 400), 0.9, 2.6); g.add(box(1.2 * s, 1.0 * s, 1.2 * s, M.crate, 0, 0, 0)); g.add(box(1.25 * s, 0.08, 1.25 * s, M.dark, 0, 0.2 * s, 0)); g.add(box(1.25 * s, 0.08, 1.25 * s, M.dark, 0, -0.2 * s, 0)); g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.userData.top = 0.5 * s; return g; };
  S.buildCable = () => { const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3)); const l = new T3.Line(g, mats().cable); l.frustumCulled = false; return l; };
  S.M = M; S.mk = { box, cyl, loft };
})(typeof window !== 'undefined' ? window : globalThis);
