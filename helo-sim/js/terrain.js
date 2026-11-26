/* Real-world terrain streamed as elevation tiles (Mapzen "terrarium" tiles on AWS Open Data), meshed around the aircraft.
   If a tile cannot be fetched (no signal) a generated landscape is used for that tile instead, so the sim always runs.
   Also: trees near the aircraft, and airfields with runways, pads and fuel points from the airport database. */
(function (root) {
  const S = root.SIM, T3 = root.THREE, clamp = S.clamp;
  const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const ZN = 12, ZF = 9, N = 256;
  const Q = { low: { ring: 1, seg: [96, 64], far: 64, trees: 500 }, med: { ring: 2, seg: [128, 96, 48], far: 96, trees: 1100 }, high: { ring: 2, seg: [192, 128, 64], far: 128, trees: 1800 } };
  const tiles = new Map(); let queue = [], active = 0, cv = null, cx = null;
  const Tn = S.terrain = { quality: 'med', offline: false, live: 0, synth: 0, near: null, far: null, ro: new T3.Vector3(), fields: [], activeFields: [], loadedNear: 0, wantNear: 0 };

  // Generated fallback: rolling hills and ridges, continuous across tiles.
  function synth(gx, gz) {
    const a = S.fbm(gx / 9000, gz / 9000, 5), b = S.fbm(gx / 2200 + 40, gz / 2200 - 17, 4), r = Math.abs(S.fbm(gx / 30000 + 9, gz / 30000 + 3, 3) - 0.5) * 2;
    return 40 + a * 520 * (0.35 + r) + b * 70;
  }
  function getTile(z, x, y) {
    const key = z + '/' + x + '/' + y; let t = tiles.get(key);
    if (!t) { t = { z, x, y, key, data: null, state: 0, mesh: null, seg: 0, cbs: [] }; tiles.set(key, t); }
    return t;
  }
  function fill(t) { // generated data for a tile
    const o = S.proj.tileOrigin(t.z, t.x, t.y), sz = S.proj.tileSize(t.z) / N, d = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) d[j * N + i] = synth(o.x + (i + 0.5) * sz, o.z + (j + 0.5) * sz);
    t.data = d; t.state = 2; t.synth = true; Tn.synth++;
  }
  function done(t) { active--; if (t.z === ZN) t.ext = minmax(t.data); const c = t.cbs; t.cbs = []; c.forEach(f => f(t)); pump(); }
  function minmax(d) { let a = 1e9, b = -1e9; for (let i = 0; i < d.length; i += 7) { if (d[i] < a) a = d[i]; if (d[i] > b) b = d[i]; } return [a, b]; }
  function request(t, cb, pri) {
    if (t.state === 2) { cb && cb(t); return; }
    cb && t.cbs.push(cb); if (t.state === 1) return; t.state = 1; t.pri = pri || 0; queue.push(t); pump();
  }
  function pump() {
    while (active < 6 && queue.length) {
      queue.sort((a, b) => b.pri - a.pri); const t = queue.pop(); active++;
      if (Tn.offline || typeof Image === 'undefined') { fill(t); setTimeout(() => done(t), 0); continue; }
      const img = new Image(); img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => { img.onload = img.onerror = null; img.src = ''; fail(t); }, 12000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = N; cx = cv.getContext('2d', { willReadFrequently: true }); }
          cx.drawImage(img, 0, 0, N, N); const px = cx.getImageData(0, 0, N, N).data, d = new Float32Array(N * N);
          for (let i = 0, p = 0; i < N * N; i++, p += 4) d[i] = Math.max(0, px[p] * 256 + px[p + 1] + px[p + 2] / 256 - 32768);
          t.data = d; t.state = 2; Tn.live++; done(t);
        } catch (e) { fail(t); }
      };
      img.onerror = () => { clearTimeout(timer); fail(t); };
      img.src = URL.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
    }
  }
  let fails = 0;
  function fail(t) { fails++; if (fails >= 3 && Tn.live === 0) Tn.offline = true; fill(t); done(t); }
  Tn.request = (z, x, y, cb) => request(getTile(z, x, y), cb, -5);

  // ---- height lookup (bilinear, metres) ----
  function sampleTile(t, fx, fz) {
    const u = clamp(fx * N - 0.5, 0, N - 1.001), v = clamp(fz * N - 0.5, 0, N - 1.001), i = u | 0, j = v | 0, a = u - i, b = v - j, d = t.data, k = j * N + i;
    return (d[k] * (1 - a) + d[k + 1] * a) * (1 - b) + (d[k + N] * (1 - a) + d[k + N + 1] * a) * b;
  }
  let lastT = null;
  Tn.height = (x, z) => {
    const p = S.proj, sz = p.tileSize(ZN);
    if (lastT) { const fx = (x - lastT.ox) / sz, fz = (z - lastT.oz) / sz; if (fx >= 0 && fx < 1 && fz >= 0 && fz < 1) return sampleTile(lastT, fx, fz); }
    const c = p.tileAt(ZN, x, z); let t = tiles.get(ZN + '/' + c.tx + '/' + c.ty);
    if (t && t.state === 2) { const o = p.tileOrigin(ZN, c.tx, c.ty); t.ox = o.x; t.oz = o.z; lastT = t; return sampleTile(t, (x - o.x) / sz, (z - o.z) / sz); }
    const cf = p.tileAt(ZF, x, z); t = tiles.get(ZF + '/' + cf.tx + '/' + cf.ty);
    if (t && t.state === 2) { const o = p.tileOrigin(ZF, cf.tx, cf.ty), s2 = p.tileSize(ZF); return sampleTile(t, (x - o.x) / s2, (z - o.z) / s2); }
    return 0;
  };
  Tn.ready = (x, z) => { const c = S.proj.tileAt(ZN, x, z), t = tiles.get(ZN + '/' + c.tx + '/' + c.ty); return !!(t && t.state === 2); };

  // ---- colouring ----
  Tn.forest = (x, z) => S.fbm(x / 1400 + 31, z / 1400 - 12, 3);
  const col = [0, 0, 0];
  function shade(h, slope, x, z, lat) {
    const n = S.vnoise(x / 260, z / 260), f = Tn.forest(x, z), snow = 5000 - Math.abs(lat) * 48;
    let r, g, b;
    if (h <= 0.2) { r = 0.07; g = 0.2; b = 0.3; }
    else {
      const e = clamp(h / 2600, 0, 1);
      r = 0.24 + 0.24 * e; g = 0.36 + 0.06 * e; b = 0.17 + 0.12 * e;
      if (f > 0.5) { const k = clamp((f - 0.5) * 6, 0, 1) * (1 - e * 0.7); r = S.lerp(r, 0.12, k); g = S.lerp(g, 0.25, k); b = S.lerp(b, 0.11, k); }
      else { const k = clamp((0.42 - f) * 5, 0, 1) * 0.5; r = S.lerp(r, 0.47, k); g = S.lerp(g, 0.45, k); b = S.lerp(b, 0.26, k); }
      const rk = clamp((slope - 0.18) * 4, 0, 1); r = S.lerp(r, 0.4, rk); g = S.lerp(g, 0.38, rk); b = S.lerp(b, 0.35, rk);
      const sn = clamp((h - snow + n * 300) / 350, 0, 1) * (1 - rk * 0.5); r = S.lerp(r, 0.93, sn); g = S.lerp(g, 0.95, sn); b = S.lerp(b, 0.97, sn);
      const v = 0.88 + n * 0.24; r *= v; g *= v; b *= v;
    }
    col[0] = r; col[1] = g; col[2] = b;
  }

  // ---- tile meshes ----
  let matNear, matFar;
  function materials() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const a = S.vnoise(i / 5.3, j / 5.3), b = S.vnoise(i / 21 + 9, j / 21 + 4), v = 190 + (a - 0.5) * 70 + (b - 0.5) * 60 + (S.hash2(i, j) - 0.5) * 40, k = (j * 256 + i) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = clamp(v, 0, 255); im.data[k + 3] = 255;
    }
    x.putImageData(im, 0, 0); const tex = new T3.CanvasTexture(c); tex.wrapS = tex.wrapT = T3.RepeatWrapping; tex.anisotropy = 4;
    matNear = new T3.MeshLambertMaterial({ vertexColors: true, map: tex }); matFar = new T3.MeshLambertMaterial({ vertexColors: true });
  }
  function build(t, seg, far) {
    const p = S.proj, o = p.tileOrigin(t.z, t.x, t.y), sz = p.tileSize(t.z), n1 = seg + 1, cnt = n1 * n1 + 4 * n1;
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), colr = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2), d = t.data;
    const lat = p.toGeo(o.x, o.z).lat, px = sz / N, drop = far ? 500 : 90;
    const at = (i, j) => d[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
    let q = 0;
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++, q++) {
      const fx = i / seg, fz = j / seg, h = sampleTile(t, fx, fz), pi = Math.round(fx * N - 0.5), pj = Math.round(fz * N - 0.5);
      const dx = (at(pi + 1, pj) - at(pi - 1, pj)) / (2 * px), dz = (at(pi, pj + 1) - at(pi, pj - 1)) / (2 * px), il = 1 / Math.hypot(dx, 1, dz);
      pos[q * 3] = fx * sz; pos[q * 3 + 1] = h - (far ? 25 : 0); pos[q * 3 + 2] = fz * sz;
      nor[q * 3] = -dx * il; nor[q * 3 + 1] = il; nor[q * 3 + 2] = -dz * il;
      shade(h, 1 - il, o.x + fx * sz, o.z + fz * sz, lat); colr[q * 3] = col[0]; colr[q * 3 + 1] = col[1]; colr[q * 3 + 2] = col[2];
      uv[q * 2] = (o.x + fx * sz) / 55; uv[q * 2 + 1] = (o.z + fz * sz) / 55;
    }
    const idx = []; for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * n1 + i, b = a + 1, c = a + n1, e = c + 1; idx.push(a, c, b, b, c, e); }
    // skirts hide the hairline gaps between neighbouring tiles
    const edge = (get, flip) => { const base = q; for (let i = 0; i < n1; i++, q++) { const s = get(i); for (let k = 0; k < 3; k++) { pos[q * 3 + k] = pos[s * 3 + k]; nor[q * 3 + k] = nor[s * 3 + k]; colr[q * 3 + k] = colr[s * 3 + k]; } pos[q * 3 + 1] -= drop; uv[q * 2] = uv[s * 2]; uv[q * 2 + 1] = uv[s * 2 + 1]; }
      for (let i = 0; i < seg; i++) { const a = get(i), b = get(i + 1), c = base + i, e = c + 1; flip ? idx.push(a, b, c, b, e, c) : idx.push(a, c, b, b, c, e); } };
    edge(i => i, true); edge(i => seg * n1 + i, false); edge(i => i * n1, false); edge(i => i * n1 + seg, true);
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('normal', new T3.BufferAttribute(nor, 3)); g.setAttribute('color', new T3.BufferAttribute(colr, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    g.setIndex(cnt > 65535 ? new T3.Uint32BufferAttribute(idx, 1) : new T3.Uint16BufferAttribute(idx, 1)); g.computeBoundingSphere();
    const m = new T3.Mesh(g, far ? matFar : matNear); m.userData.o = o; m.matrixAutoUpdate = false; return m;
  }
  function drop(t) { if (t.mesh) { t.mesh.parent && t.mesh.parent.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh = null; t.seg = 0; } }

  Tn.init = (sceneNear, sceneFar) => {
    materials(); Tn.near = new T3.Group(); Tn.far = new T3.Group(); sceneNear.add(Tn.near); sceneFar.add(Tn.far);
    Tn.objs = new T3.Group(); sceneNear.add(Tn.objs); initTrees(sceneNear);
  };
  Tn.reset = () => { tiles.forEach(drop); tiles.clear(); queue = []; lastT = null; Tn.live = Tn.synth = 0; fails = 0; Tn.activeFields.forEach(f => removeField(f)); Tn.activeFields = []; treeKey = ''; };

  let buildBudget = 0;
  Tn.update = (x, z, dt) => {
    const p = S.proj, q = Q[Tn.quality], c = p.tileAt(ZN, x, z), cf = p.tileAt(ZF, x, z), want = new Set(); buildBudget = 2;
    let loaded = 0, total = 0;
    for (let dj = -q.ring; dj <= q.ring; dj++) for (let di = -q.ring; di <= q.ring; di++) {
      const ring = Math.max(Math.abs(di), Math.abs(dj)), t = getTile(ZN, c.tx + di, c.ty + dj), seg = q.seg[Math.min(ring, q.seg.length - 1)]; want.add(t.key); total++;
      if (t.state === 0) request(t, null, 10 - ring); else if (t.state === 2) { loaded++; if (t.seg !== seg && buildBudget > 0) { buildBudget--; drop(t); t.mesh = build(t, seg, false); t.seg = seg; Tn.near.add(t.mesh); } }
    }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const t = getTile(ZF, cf.tx + di, cf.ty + dj); want.add(t.key);
      if (t.state === 0) request(t, null, 3); else if (t.state === 2 && !t.mesh && buildBudget > 0) { buildBudget--; t.mesh = build(t, q.far, true); t.seg = q.far; Tn.far.add(t.mesh); }
    }
    Tn.loadedNear = loaded; Tn.wantNear = total;
    tiles.forEach(t => { if (t.mesh && !want.has(t.key)) drop(t); });
    if (tiles.size > 220) tiles.forEach((t, k) => { if (!want.has(k) && t.state === 2 && tiles.size > 160) tiles.delete(k); });
    const ro = Tn.ro; tiles.forEach(t => { if (t.mesh) { const o = t.mesh.userData.o; t.mesh.position.set(o.x - ro.x, -ro.y, o.z - ro.z); t.mesh.updateMatrix(); } });
    updateFields(x, z); updateTrees(x, z);
    Tn.objs.position.set(-ro.x, -ro.y, -ro.z);
  };

  // ---- trees ----
  let trees = null, treeKey = ''; const dummy = new T3.Object3D();
  function initTrees(scene) {
    const cone = new T3.ConeGeometry(0.38, 1, 6, 1); cone.translate(0, 0.62, 0); const trunk = new T3.CylinderGeometry(0.05, 0.07, 0.2, 5); trunk.translate(0, 0.1, 0);
    const paint = (g, r, gg, b) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i), k = 0.7 + y * 0.5; c[i * 3] = r * k; c[i * 3 + 1] = gg * k; c[i * 3 + 2] = b * k; } g.setAttribute('color', new T3.BufferAttribute(c, 3)); };
    paint(cone, 0.16, 0.33, 0.14); paint(trunk, 0.3, 0.22, 0.14);
    const g = mergeGeo([cone.toNonIndexed(), trunk.toNonIndexed()]);
    trees = new T3.InstancedMesh(g, new T3.MeshLambertMaterial({ vertexColors: true }), 1800); trees.count = 0; trees.frustumCulled = false; scene.add(trees);
  }
  function mergeGeo(list) {
    let n = 0; list.forEach(g => { n += g.attributes.position.count; }); const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
    list.forEach(g => { P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(P, 3)); g.setAttribute('normal', new T3.BufferAttribute(Nn, 3)); g.setAttribute('color', new T3.BufferAttribute(C, 3)); return g;
  }
  S.mergeGeo = mergeGeo;
  function updateTrees(x, z) {
    const cell = 34, cxi = Math.round(x / 240), czi = Math.round(z / 240), key = cxi + ',' + czi + ',' + Tn.loadedNear;
    if (key === treeKey || !trees) return; treeKey = key;
    const max = Q[Tn.quality].trees, R = 760, x0 = cxi * 240, z0 = czi * 240, ro = Tn.ro; let n = 0;
    for (let gz = Math.floor((z0 - R) / cell); gz <= (z0 + R) / cell && n < max; gz++) for (let gx = Math.floor((x0 - R) / cell); gx <= (x0 + R) / cell && n < max; gx++) {
      const hh = S.hash2(gx, gz); if (hh > 0.62) continue;
      const wx = (gx + S.hash2(gx + 7, gz)) * cell, wz = (gz + S.hash2(gx, gz + 13)) * cell, f = Tn.forest(wx, wz);
      if (f < 0.5 && hh > 0.05) continue; if ((wx - x0) ** 2 + (wz - z0) ** 2 > R * R) continue;
      const h = Tn.height(wx, wz); if (h < 1 || Math.abs(Tn.height(wx + 8, wz) - h) > 5 || nearField(wx, wz)) continue;
      const s = 9 + hh * 22; dummy.position.set(wx, h, wz); dummy.scale.set(s, s * (0.9 + S.hash2(gz, gx) * 0.5), s); dummy.rotation.y = hh * 20; dummy.updateMatrix(); trees.setMatrixAt(n++, dummy.matrix);
    }
    trees.count = n; trees.instanceMatrix.needsUpdate = true; trees.userData.base = true;
  }
  Tn.placeTrees = () => { if (trees) trees.position.set(-Tn.ro.x, -Tn.ro.y, -Tn.ro.z); };

  // ---- airfields ----
  Tn.loadFields = () => {
    Tn.fields = (root.SIM_FIELDS || []).map(a => ({ icao: a[0], name: a[1], lat: a[2], lon: a[3], elev: a[4], reg: a[5], rw: a[6], up: (a[0] + ' ' + a[1]).toUpperCase() }));
  };
  Tn.projectFields = () => { Tn.fields.forEach(f => { const l = S.proj.toLocal(f.lat, f.lon); f.x = l.x; f.z = l.z; f.geo = null; }); };
  Tn.findField = id => Tn.fields.find(f => f.icao === id);
  // Layout of a field in local metres: runways, ramp, pads and fuel point.
  Tn.layout = f => {
    if (f.geo) return f.geo; const g = { rw: [] };
    (f.rw || []).forEach(r => { const a = S.proj.toLocal(r[0], r[1]), b = S.proj.toLocal(r[2], r[3]); g.rw.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, w: Math.max(18, r[4] * 0.3048) }); });
    let cx0 = f.x, cz0 = f.z, dx = 1, dz = 0;
    if (g.rw.length) { const r = g.rw[0], L = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1; dx = (r.bx - r.ax) / L; dz = (r.bz - r.az) / L; cx0 = (r.ax + r.bx) / 2; cz0 = (r.az + r.bz) / 2; }
    // ramp sits beside the main runway, on the side away from any other runway
    let side = 1; const px = -dz, pz = dx;
    if (g.rw.length > 1) { const r2 = g.rw[1], mx = (r2.ax + r2.bx) / 2 - cx0, mz = (r2.az + r2.bz) / 2 - cz0; if (mx * px + mz * pz > 0) side = -1; }
    const off = (g.rw.length ? g.rw[0].w / 2 : 0) + 190;
    g.dx = dx; g.dz = dz; g.px = px * side; g.pz = pz * side; g.rx = cx0 + g.px * off; g.rz = cz0 + g.pz * off;
    g.pads = [-1, 0, 1].map(i => ({ x: g.rx + dx * i * 55, z: g.rz + dz * i * 55 }));
    g.fuel = { x: g.rx - dx * 110, z: g.rz - dz * 110 }; g.cargo = { x: g.rx + dx * 120, z: g.rz + dz * 120 };
    g.hdg = S.wrap360(Math.atan2(dx, -dz) * S.R2D); f.geo = g; return g;
  };
  function nearField(x, z) {
    for (const f of Tn.activeFields) { const g = f.geo; if (!g) continue; if ((x - g.rx) ** 2 + (z - g.rz) ** 2 < 260 * 260) return true;
      for (const r of g.rw) { const L2 = (r.bx - r.ax) ** 2 + (r.bz - r.az) ** 2, t = clamp(((x - r.ax) * (r.bx - r.ax) + (z - r.az) * (r.bz - r.az)) / L2, 0, 1); if ((x - r.ax - t * (r.bx - r.ax)) ** 2 + (z - r.az - t * (r.bz - r.az)) ** 2 < (r.w + 70) ** 2) return true; } }
    return false;
  }
  let fieldT = 0, mats = null;
  function updateFields(x, z) {
    if (++fieldT % 30 !== 1) return;
    const near = Tn.fields.filter(f => (f.x - x) ** 2 + (f.z - z) ** 2 < 16000 * 16000).sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2)).slice(0, 6);
    Tn.activeFields.filter(f => !near.includes(f)).forEach(removeField);
    Tn.activeFields = near;
    near.forEach(f => { if (!f.obj && Tn.ready(f.x, f.z)) { const g = Tn.layout(f); if (Tn.ready(g.rx, g.rz) && g.rw.every(r => Tn.ready(r.ax, r.az) && Tn.ready(r.bx, r.bz))) buildField(f); } });
  }
  function removeField(f) { if (f.obj) { Tn.objs.remove(f.obj); f.obj.traverse(o => { o.geometry && o.geometry.dispose(); }); f.obj = null; } }
  function strip(ax, az, bx, bz, w, mat, lift, segLen, uRep) { // ribbon draped on the terrain
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (segLen || 30))), dx = (bx - ax) / L, dz = (bz - az) / L, px = -dz * w / 2, pz = dx * w / 2;
    const P = [], U = [], I = [];
    for (let i = 0; i <= n; i++) { const x = ax + dx * L * i / n, z = az + dz * L * i / n;
      for (const s of [-1, 0, 1]) { const vx = x + px * s, vz = z + pz * s; P.push(vx, Tn.height(vx, vz) + (lift || 0.25), vz); U.push((s + 1) / 2, i / n * (uRep || L / 60)); } }
    for (let i = 0; i < n; i++) { const a = i * 3; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    return new T3.Mesh(g, mat);
  }
  function tex(draw, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T3.CanvasTexture(c); t.anisotropy = 4; return t; }
  function fieldMats() {
    const rw = tex((x, w, h) => { x.fillStyle = '#2b2d30'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '255,255,255' : '0,0,0') + ',0.05)'; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); } x.fillStyle = '#e8e8e8'; x.fillRect(w / 2 - 3, 0, 6, h * 0.55); x.fillRect(4, 0, 4, h); x.fillRect(w - 8, 0, 4, h); }, 128, 128);
    rw.wrapT = T3.RepeatWrapping;
    const apron = tex((x, w, h) => { x.fillStyle = '#7d7f7c'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i <= 8; i++) { x.strokeRect(i * w / 8, 0, 0.5, h); x.strokeRect(0, i * h / 8, w, 0.5); } }, 128, 128);
    apron.wrapS = apron.wrapT = T3.RepeatWrapping;
    const pad = tex((x, w, h) => { x.fillStyle = '#56595a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2f2f2'; x.lineWidth = 8; x.beginPath(); x.arc(w / 2, h / 2, w * 0.42, 0, 7); x.stroke(); x.fillStyle = '#f2f2f2'; x.font = 'bold 130px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', w / 2, h / 2 + 8); }, 256, 256);
    const po = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    mats = { rw: new T3.MeshLambertMaterial({ map: rw, ...po }), apron: new T3.MeshLambertMaterial({ map: apron, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), pad: new T3.MeshLambertMaterial({ map: pad, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
      hangar: new T3.MeshLambertMaterial({ color: 0x8a8f86 }), roof: new T3.MeshLambertMaterial({ color: 0x4d5a52 }), tank: new T3.MeshLambertMaterial({ color: 0xd8d8d2 }), red: new T3.MeshLambertMaterial({ color: 0xb23a2a }), orange: new T3.MeshLambertMaterial({ color: 0xff7a1a, side: T3.DoubleSide }),
      light: new T3.PointsMaterial({ color: 0xfff2c0, size: 3, sizeAttenuation: false, transparent: true, opacity: 0 }), blue: new T3.PointsMaterial({ color: 0x4aa3ff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0 }) };
    Tn.fieldMats = mats;
  }
  function box(w, h, d, mat, x, y, z, ry) { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry || 0; return m; }
  function buildField(f) {
    if (!mats) fieldMats(); const g = f.geo, grp = new T3.Group(), ry = Math.atan2(-g.dz, g.dx), H = Tn.height;
    const lights = [];
    g.rw.forEach(r => { grp.add(strip(r.ax, r.az, r.bx, r.bz, r.w, mats.rw, 0.3, 30));
      const L = Math.hypot(r.bx - r.ax, r.bz - r.az), dx = (r.bx - r.ax) / L, dz = (r.bz - r.az) / L; for (let d = 0; d <= L; d += 60) for (const s of [-1, 1]) { const x = r.ax + dx * d - dz * s * (r.w / 2 + 2), z = r.az + dz * d + dx * s * (r.w / 2 + 2); lights.push(x, H(x, z) + 0.6, z); } });
    // taxi link and ramp
    if (g.rw.length) grp.add(strip(g.rx, g.rz, g.rx - g.px * 190, g.rz - g.pz * 190, 18, mats.apron, 0.22, 20, 4));
    grp.add(strip(g.rx - g.dx * 170, g.rz - g.dz * 170, g.rx + g.dx * 170, g.rz + g.dz * 170, 90, mats.apron, 0.25, 20, 12));
    const flat = (x, z, s, mat) => { const y = Math.max(H(x - s, z - s), H(x + s, z - s), H(x - s, z + s), H(x + s, z + s), H(x, z)) + 0.32; const m = new T3.Mesh(new T3.PlaneGeometry(s * 2, s * 2), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.position.set(x, y, z); return m; };
    g.pads.forEach(p => grp.add(flat(p.x, p.z, 13, mats.pad)));
    const blue = []; g.pads.forEach(p => { for (let a = 0; a < 8; a++) { const x = p.x + Math.cos(a * 0.785) * 14, z = p.z + Math.sin(a * 0.785) * 14; blue.push(x, H(x, z) + 0.5, z); } });
    // fuel point: two tanks and a red pump cabinet
    const fy = H(g.fuel.x, g.fuel.z);
    for (const s of [-1, 1]) { const m = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.2, 9, 12), mats.tank); m.rotation.z = Math.PI / 2; m.rotation.y = ry; m.position.set(g.fuel.x + g.px * (38 + s * 3.2), fy + 2.6, g.fuel.z + g.pz * (38 + s * 3.2)); grp.add(m); }
    grp.add(box(2, 2.2, 1.2, mats.red, g.fuel.x + g.px * 24, fy, g.fuel.z + g.pz * 24, ry));
    grp.add(flat(g.fuel.x, g.fuel.z, 13, mats.pad));
    // hangars, tower, windsock
    for (let i = -1; i <= 1; i += 2) { const hx = g.rx + g.dx * i * 80 + g.px * 95, hz = g.rz + g.dz * i * 80 + g.pz * 95, hy = H(hx, hz); grp.add(box(46, 12, 34, mats.hangar, hx, hy, hz, ry)); grp.add(box(48, 1.2, 36, mats.roof, hx, hy + 12, hz, ry)); }
    const tx = g.rx + g.px * 70, tz = g.rz + g.pz * 70, ty = H(tx, tz); grp.add(box(6, 22, 6, mats.hangar, tx, ty, tz, ry)); grp.add(box(9, 4, 9, mats.roof, tx, ty + 22, tz, ry));
    const wx = g.rx - g.px * 60 + g.dx * 150, wz = g.rz - g.pz * 60 + g.dz * 150, wy = H(wx, wz); grp.add(box(0.25, 7, 0.25, mats.tank, wx, wy, wz));
    const sock = new T3.Mesh(new T3.ConeGeometry(0.7, 4, 8, 1, true), mats.orange); sock.geometry.rotateX(-Math.PI / 2); sock.geometry.translate(0, 0, 2); sock.position.set(wx, wy + 7, wz); grp.add(sock); f.sock = sock;
    const pts = a => { const pg = new T3.BufferGeometry(); pg.setAttribute('position', new T3.Float32BufferAttribute(a, 3)); return pg; };
    grp.add(new T3.Points(pts(lights), mats.light)); grp.add(new T3.Points(pts(blue), mats.blue));
    f.obj = grp; Tn.objs.add(grp); treeKey = '';
  }
  Tn.nearestField = (x, z, max) => { let b = null, bd = (max || 1e12) ** 2; for (const f of Tn.fields) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; b = f; } } return b; };
  Tn.ZN = ZN; Tn.ZF = ZF; Tn.tileData = (z, x, y) => { const t = tiles.get(z + '/' + x + '/' + y); return t && t.state === 2 ? t : null; };
})(typeof window !== 'undefined' ? window : globalThis);
