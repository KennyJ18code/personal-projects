/* 3D aircraft built from lofted fuselage sections and simple parts. Axes: +X right, +Y up, -Z forward, origin at the CG. */
(function (root) {
  const S = root.SIM, T3 = root.THREE;
  const M = {}; function mats() {
    if (M.od) return M;
    M.od = new T3.MeshLambertMaterial({ color: 0x4b5140 }); M.od2 = new T3.MeshLambertMaterial({ color: 0x3d4335 }); M.dark = new T3.MeshLambertMaterial({ color: 0x1b1d1c });
    M.glass = new T3.MeshPhongMaterial({ color: 0x0c1418, shininess: 90, specular: 0x8899aa, transparent: true, opacity: 0.82 });
    M.metal = new T3.MeshLambertMaterial({ color: 0x6d706c }); M.tire = new T3.MeshLambertMaterial({ color: 0x151515 }); M.blade = new T3.MeshLambertMaterial({ color: 0x1e201f });
    M.blur = new T3.MeshBasicMaterial({ color: 0x202220, transparent: true, opacity: 0.0, side: T3.DoubleSide, depthWrite: false });
    M.inner = new T3.MeshLambertMaterial({ color: 0x23262a, side: T3.DoubleSide }); M.panel = new T3.MeshLambertMaterial({ color: 0x15171a, side: T3.DoubleSide });
    M.red = new T3.MeshBasicMaterial({ color: 0xff2a1a }); M.green = new T3.MeshBasicMaterial({ color: 0x22ff55 }); M.white = new T3.MeshBasicMaterial({ color: 0xffffff }); M.off = new T3.MeshBasicMaterial({ color: 0x222222 });
    M.crate = new T3.MeshLambertMaterial({ color: 0x6b5a3a }); M.cable = new T3.LineBasicMaterial({ color: 0x111111 }); M.yellow = new T3.MeshLambertMaterial({ color: 0xc9a227 });
    return M;
  }
  // secs: [z, halfWidth, yCentre, halfHeight, squareness] from nose to tail
  function loft(secs, mat, K) {
    K = K || 18; const P = [], I = [], n = secs.length;
    for (let i = 0; i < n; i++) { const [z, hw, y, hh, e] = secs[i], ex = 2 / (e || 2.6);
      for (let k = 0; k < K; k++) { const a = k / K * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); P.push(hw * Math.sign(c) * Math.pow(Math.abs(c), ex), y + hh * Math.sign(s) * Math.pow(Math.abs(s), ex), z); } }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) { const A = i * K + k, B = i * K + (k + 1) % K, C = A + K, D = B + K; I.push(A, B, C, B, D, C); }
    const c0 = P.length / 3; P.push(0, secs[0][2], secs[0][0]); const c1 = c0 + 1; P.push(0, secs[n - 1][2], secs[n - 1][0]);
    for (let k = 0; k < K; k++) { I.push(c0, (k + 1) % K, k); I.push(c1, (n - 1) * K + k, (n - 1) * K + (k + 1) % K); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return new T3.Mesh(g, mat);
  }
  const box = (w, h, d, mat, x, y, z, rx, ry, rz) => { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); return m; };
  const cyl = (r1, r2, l, mat, x, y, z, axis, seg) => { const g = new T3.CylinderGeometry(r1, r2, l, seg || 14); if (axis === 'z') g.rotateX(Math.PI / 2); if (axis === 'x') g.rotateZ(Math.PI / 2); const m = new T3.Mesh(g, mat); m.position.set(x, y, z); return m; };
  function wheel(g, x, y, z, r, w) { g.add(cyl(r, r, w, M.tire, x, y + r, z, 'x', 16)); g.add(cyl(r * 0.45, r * 0.45, w + 0.02, M.metal, x, y + r, z, 'x', 10)); }
  function strut(g, x1, y1, z1, x2, y2, z2, r) { const a = new T3.Vector3(x1, y1, z1), b = new T3.Vector3(x2, y2, z2), l = a.distanceTo(b), m = new T3.Mesh(new T3.CylinderGeometry(r, r, l, 8), M.metal); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), b.sub(a).normalize()); g.add(m); }
  function rotor(R, nb, chord, dir, phase) {
    const g = new T3.Group(), blades = new T3.Group();
    for (let i = 0; i < nb; i++) { const b = new T3.Group(), bl = box(R - 0.5, 0.06, chord, M.blade, (R - 0.5) / 2 + 0.5, 0, 0, 0, 0, -0.035); const tip = box(0.5, 0.065, chord * 0.8, M.yellow, R - 0.25, -(R - 0.5) * 0.035, chord * 0.1); b.add(bl, tip, box(0.6, 0.12, 0.16, M.metal, 0.3, 0, 0)); b.rotation.y = i / nb * Math.PI * 2; blades.add(b); }
    g.add(blades, cyl(0.28, 0.3, 0.35, M.metal, 0, 0, 0, 'y'));
    const disc = new T3.Mesh(new T3.RingGeometry(0.5, R, 48, 1), M.blur.clone()); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.1; g.add(disc);
    g.userData = { blades, disc, dir, ang: phase || 0 }; return g;
  }
  function tailRotor(R, nb, scissor) {
    const g = new T3.Group(), bl = new T3.Group();
    for (let i = 0; i < nb; i++) { const b = box(0.07, R, 0.24, M.blade, 0, R / 2, 0); const h = new T3.Group(); h.add(b); h.rotation.x = scissor ? [0.48, 2.66, 3.62, 5.8][i] : i / nb * Math.PI * 2; bl.add(h); }
    const disc = new T3.Mesh(new T3.RingGeometry(0.15, R, 28, 1), M.blur.clone()); disc.rotation.y = Math.PI / 2; g.add(bl, disc); g.userData = { blades: bl, disc, ang: 0 }; return g;
  }
  function lamp(g, mat, x, y, z, r) { const m = new T3.Mesh(new T3.SphereGeometry(r || 0.07, 8, 6), mat.clone()); m.position.set(x, y, z); g.add(m); return m; }
  function lights(g, o, lx, ly, lz, tail, top) {
    o.navL = lamp(g, M.red, -lx, ly, lz); o.navR = lamp(g, M.green, lx, ly, lz); o.navT = lamp(g, M.white, tail[0], tail[1], tail[2]); o.beacon = lamp(g, M.red, top[0], top[1], top[2], 0.1);
    o.spot = new T3.SpotLight(0xfff4d6, 0, 420, 0.5, 0.5, 1.2); o.spot.position.set(0, -1.0, -3); o.spot.target.position.set(0, -14, -40); g.add(o.spot, o.spot.target);
  }
  // Interior frame seen from the pilot's seat (camera sits at eye).
  function cockpit(eye, w, tandem) {
    const g = new T3.Group(), ey = eye[1], ez = eye[2];
    g.add(box(w * 2.1, 0.05, 0.5, M.panel, 0, ey - 0.34, ez - 0.72, 0.12));      // glareshield
    g.add(box(w * 2.1, 0.6, 0.05, M.panel, 0, ey - 0.65, ez - 0.52));            // panel face
    g.add(box(w * 2.1, 0.07, 0.07, M.inner, 0, ey + 0.7, ez - 0.64));            // top of windshield
    for (const s of [-1, 1]) { g.add(box(0.07, 1.2, 0.07, M.inner, s * w, ey + 0.18, ez - 0.86, 0.38)); g.add(box(0.05, 0.35, 1.4, M.inner, s * w * 1.02, ey - 0.56, ez - 0.15)); }
    if (!tandem) { g.add(box(0.06, 1.15, 0.06, M.inner, 0, ey + 0.18, ez - 0.9, 0.38)); g.add(box(0.42, 0.07, 0.9, M.panel, 0, ey + 0.68, ez - 0.1)); }
    g.visible = false; return g;
  }

  function uh60() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    g.add(loft([[-6.0, 0.22, -0.6, 0.28], [-5.5, 0.72, -0.5, 0.58], [-4.7, 1.05, -0.38, 0.8, 3.2], [-3.5, 1.16, -0.32, 0.92, 3.6], [-1.5, 1.18, -0.3, 0.95, 4], [1.2, 1.15, -0.28, 0.93, 4], [2.4, 0.85, -0.1, 0.75, 3], [3.6, 0.5, 0.1, 0.5], [9.2, 0.26, 0.38, 0.3], [10.4, 0.14, 0.6, 0.24]], M.od));
    g.add(loft([[-5.25, 0.66, -0.2, 0.36, 3], [-4.6, 1.04, 0.02, 0.44, 3.4], [-3.6, 1.15, 0.12, 0.5, 3.6], [-3.3, 1.1, 0.12, 0.5, 3.6]], M.glass));
    g.add(loft([[-3.0, 0.6, 0.72, 0.3, 3], [-2.0, 0.85, 0.82, 0.4, 3], [2.2, 0.85, 0.82, 0.4, 3], [3.4, 0.4, 0.6, 0.25]], M.od2));
    for (const s of [-1, 1]) { g.add(cyl(0.36, 0.33, 2.3, M.od2, s * 0.82, 0.95, 0.7, 'z')); g.add(cyl(0.26, 0.3, 0.5, M.dark, s * 0.9, 0.95, 2.0, 'z')); g.add(box(0.02, 0.5, 1.9, M.glass, s * 1.185, -0.05, -1.2)); g.add(box(0.02, 0.45, 0.8, M.glass, s * 1.17, -0.05, 0.6)); }
    g.add(box(0.2, 3.1, 1.0, M.od, 0, 1.75, 10.35, -0.5)); g.add(box(4.3, 0.09, 1.0, M.od, 0, 0.55, 10.3));
    const mr = rotor(8.18, 4, 0.53, 1); mr.position.set(0, 1.85, 0); g.add(cyl(0.16, 0.2, 0.7, M.metal, 0, 1.5, 0, 'y'), mr); o.rotors.push(mr);
    const tr = tailRotor(1.68, 4); tr.position.set(0.42, 2.95, 11.0); tr.rotation.z = -0.35; g.add(tr); o.tail = tr;
    for (const s of [-1, 1]) { wheel(g, s * 1.35, -1.9, -1.2, 0.33, 0.26); strut(g, s * 1.35, -1.5, -1.2, s * 1.0, -0.7, -1.0, 0.07); strut(g, s * 1.35, -1.55, -1.2, s * 1.05, -1.0, 0.2, 0.05); }
    wheel(g, 0, -1.55, 7.6, 0.2, 0.16); strut(g, 0, -1.3, 7.6, 0, 0.1, 7.3, 0.06);
    lights(g, o, 1.3, 0.2, -1.0, [0, 3.3, 11.0], [0, 1.25, 3.2]); o.cockpit = cockpit(S.AIRCRAFT.uh60.eye, 0.95, false); g.add(o.cockpit); return o;
  }
  function ah64() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    g.add(loft([[-6.7, 0.18, -0.75, 0.2], [-6.0, 0.42, -0.65, 0.42], [-5.0, 0.56, -0.5, 0.62, 3], [-3.4, 0.6, -0.42, 0.75, 3.2], [-1.2, 0.62, -0.38, 0.82, 3.4], [1.4, 0.58, -0.3, 0.78, 3], [2.8, 0.38, -0.05, 0.5], [8.6, 0.2, 0.42, 0.24], [9.6, 0.12, 0.6, 0.2]], M.od));
    g.add(loft([[-5.3, 0.36, 0.05, 0.3, 3.4], [-4.6, 0.5, 0.2, 0.42, 3.6], [-3.3, 0.52, 0.42, 0.5, 3.6], [-2.0, 0.54, 0.6, 0.55, 3.6], [-0.9, 0.5, 0.62, 0.5, 3.4]], M.glass));
    g.add(loft([[-1.2, 0.5, 0.75, 0.42, 3], [1.6, 0.5, 0.78, 0.42, 3], [2.6, 0.3, 0.6, 0.25]], M.od2));
    for (const s of [-1, 1]) {
      g.add(cyl(0.4, 0.38, 2.6, M.od2, s * 0.98, 0.32, 0.9, 'z')); g.add(cyl(0.3, 0.34, 0.5, M.dark, s * 1.0, 0.36, 2.4, 'z'));
      g.add(box(2.1, 0.13, 1.0, M.od, s * 1.6, -0.35, -0.2)); g.add(box(0.5, 0.6, 3.6, M.od2, s * 0.75, -0.75, -2.4));
      g.add(cyl(0.2, 0.2, 1.7, M.od2, s * 2.45, -0.72, -0.3, 'z')); g.add(cyl(0.2, 0.05, 0.25, M.dark, s * 2.45, -0.72, -1.25, 'z'));
      for (const dx of [-0.16, 0.16]) for (const dy of [0, -0.28]) g.add(cyl(0.085, 0.085, 1.6, M.dark, s * 1.55 + dx, -0.62 + dy, -0.35, 'z', 8));
      g.add(box(0.1, 0.3, 0.5, M.od2, s * 2.45, -0.52, -0.2)); g.add(box(0.1, 0.25, 0.5, M.od2, s * 1.55, -0.48, -0.2));
      wheel(g, s * 1.02, -1.95, -1.6, 0.32, 0.24); strut(g, s * 1.02, -1.6, -1.6, s * 0.6, -0.9, -0.6, 0.07); strut(g, s * 1.02, -1.62, -1.6, s * 0.62, -0.7, -1.9, 0.05);
    }
    const tads = new T3.Group(); tads.add(cyl(0.3, 0.3, 0.5, M.dark, 0, 0, 0, 'x', 12)); tads.position.set(0, -0.75, -6.75); g.add(tads); g.add(cyl(0.16, 0.16, 0.3, M.dark, 0, -0.38, -6.5, 'y'));
    const gun = new T3.Group(); gun.add(cyl(0.05, 0.05, 1.5, M.dark, 0, -0.12, -0.7, 'z', 8), box(0.3, 0.25, 0.6, M.dark, 0, -0.05, 0)); gun.position.set(0, -1.28, -3.6); g.add(gun); o.gun = gun;
    g.add(box(0.18, 2.9, 1.0, M.od, 0, 1.6, 9.2, -0.55)); g.add(box(3.4, 0.09, 0.9, M.od, 0, 0.25, 9.6));
    const mr = rotor(7.32, 4, 0.53, 1); mr.position.set(0, 1.75, 0); g.add(cyl(0.15, 0.2, 0.8, M.metal, 0, 1.35, 0, 'y'), mr); o.rotors.push(mr);
    const tr = tailRotor(1.4, 4, true); tr.position.set(-0.4, 2.55, 9.75); g.add(tr); o.tail = tr;
    wheel(g, 0, -1.35, 8.9, 0.18, 0.14); strut(g, 0, -1.1, 8.9, 0, 0.3, 8.7, 0.05);
    lights(g, o, 2.6, -0.35, -0.2, [0, 3.0, 9.9], [0, 1.25, 2.6]); o.cockpit = cockpit(S.AIRCRAFT.ah64.eye, 0.5, true); g.add(o.cockpit); return o;
  }
  function ch47() {
    const g = new T3.Group(), o = { rotors: [], group: g };
    g.add(loft([[-7.8, 0.35, -0.75, 0.45], [-7.3, 0.95, -0.6, 0.9, 3], [-6.4, 1.25, -0.42, 1.18, 3.6], [-5.2, 1.3, -0.4, 1.25, 5], [5.4, 1.3, -0.4, 1.25, 5], [6.6, 1.2, -0.2, 1.1, 4], [7.5, 0.9, 0.2, 0.75, 3]], M.od));
    g.add(loft([[-7.45, 0.82, -0.28, 0.42, 3], [-6.9, 1.12, -0.05, 0.55, 3.6], [-6.1, 1.27, 0.08, 0.6, 4], [-5.7, 1.26, 0.08, 0.58, 4]], M.glass));
    g.add(loft([[-7.0, 0.3, 0.9, 0.3], [-6.4, 0.55, 1.3, 0.65, 3], [-5.2, 0.6, 1.35, 0.7, 3], [-3.6, 0.45, 1.05, 0.35, 3], [3.6, 0.42, 1.0, 0.25, 3]], M.od2));
    g.add(loft([[3.4, 0.4, 1.2, 0.5, 3], [4.6, 0.62, 1.9, 1.3, 3], [6.0, 0.62, 2.1, 1.5, 3], [7.4, 0.35, 2.2, 1.2, 3]], M.od2));
    for (const s of [-1, 1]) {
      g.add(loft([[-4.8, 0.3, -1.25, 0.4, 3], [-4.0, 0.48, -1.2, 0.5, 3.4], [4.0, 0.48, -1.2, 0.5, 3.4], [4.9, 0.3, -1.2, 0.4, 3]].map(a => [a[0], a[1], a[2], a[3], a[4]]), M.od2).translateX(s * 1.5));
      g.add(cyl(0.46, 0.42, 2.1, M.od2, s * 1.35, 1.25, 5.3, 'z')); g.add(cyl(0.32, 0.36, 0.5, M.dark, s * 1.35, 1.25, 6.5, 'z'));
      for (let i = 0; i < 5; i++) g.add(cyl(0.22, 0.22, 0.03, M.glass, s * 1.31, -0.05, -3.6 + i * 1.75, 'x', 12));
      for (const z of [-3.5, 3.4]) { wheel(g, s * 1.6 - 0.14, -2.25, z, 0.3, 0.2); wheel(g, s * 1.6 + 0.14, -2.25, z, 0.3, 0.2); strut(g, s * 1.6, -1.9, z, s * 1.5, -1.3, z, 0.08); }
    }
    const f = rotor(9.14, 3, 0.81, 1, 0); f.position.set(0, 2.15, -5.95); const a = rotor(9.14, 3, 0.81, -1, Math.PI / 3); a.position.set(0, 3.75, 5.95);
    g.add(cyl(0.2, 0.25, 0.5, M.metal, 0, 1.9, -5.95, 'y'), cyl(0.2, 0.25, 0.5, M.metal, 0, 3.5, 5.95, 'y'), f, a); o.rotors.push(f, a);
    lights(g, o, 1.95, -1.0, 0, [0, 1.8, 7.6], [0, 3.6, 6.6]); o.cockpit = cockpit(S.AIRCRAFT.ch47.eye, 1.0, false); g.add(o.cockpit); return o;
  }
  S.buildAircraft = id => { mats(); const o = ({ uh60, ah64, ch47 })[id](); o.group.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); return o; };

  // Spin rotors, fade to a blur disc at speed, cone the blades with thrust, drive lights.
  S.animateAircraft = (o, dt, sys, heli, night) => {
    const nr = sys.nr, s = heli.s, cone = S.clamp(heli.out.T / (s.mgw * S.G) * 0.07, 0, 0.12) * (nr > 0.3 ? 1 : 0) - (1 - Math.min(1, nr * 2)) * 0.05;
    o.rotors.forEach(r => { const u = r.userData; u.ang += u.dir * nr * s.omega * dt; r.rotation.y = u.ang; u.disc.material.opacity = S.clamp((nr - 0.3) * 0.6, 0, 0.34); u.blades.children.forEach(b => { b.rotation.z = cone; b.visible = nr < 0.72; }); });
    if (o.tail) { const u = o.tail.userData; u.ang += nr * s.omega * 5 * dt; u.blades.rotation.x = u.ang; u.disc.material.opacity = S.clamp((nr - 0.2) * 0.6, 0, 0.3); u.blades.visible = nr < 0.6 || sys.fail.tr; }
    const sw = sys.sw, pw = sys.dc, t = performance.now() / 1000;
    const set = (m, on, mat) => { m.material.color.copy(on ? mat.color : M.off.color); m.scale.setScalar(on && night ? 2.2 : 1); };
    set(o.navL, pw && sw.pos, M.red); set(o.navR, pw && sw.pos, M.green); set(o.navT, pw && sw.pos, M.white); set(o.beacon, pw && sw.acol && (t % 1.1) < 0.12, M.red);
    o.spot.intensity = pw && (sw.land || sw.search) ? (sw.land && sw.search ? 3.2 : 2.2) : 0;
  };
  S.buildLoad = kg => { mats(); const g = new T3.Group(), s = S.clamp(Math.cbrt(kg / 400), 0.9, 2.6); g.add(box(1.2 * s, 1.0 * s, 1.2 * s, M.crate, 0, 0, 0)); g.add(box(1.25 * s, 0.08, 1.25 * s, M.dark, 0, 0.2 * s, 0)); g.add(box(1.25 * s, 0.08, 1.25 * s, M.dark, 0, -0.2 * s, 0)); g.userData.top = 0.5 * s; return g; };
  S.buildCable = () => { const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3)); const l = new T3.Line(g, mats().cable); l.frustumCulled = false; return l; };
  S.M = M; S.mk = { box, cyl, loft };
})(typeof window !== 'undefined' ? window : globalThis);
