/* Sky, light, cloud, wind; effects; Apache weapons and range targets; navigation route; missions. */
(function (root) {
  const S = root.SIM, T3 = root.THREE, clamp = S.clamp, V = () => new T3.Vector3();

  // ================= sky and weather =================
  const Sky = S.sky = { inCloud: false, night: 0, sunDir: V() };
  Sky.init = (near, far) => {
    Sky.near = near; Sky.far = far;
    const g = new T3.SphereGeometry(1, 24, 12), n = g.attributes.position.count; g.setAttribute('color', new T3.BufferAttribute(new Float32Array(n * 3), 3));
    Sky.dome = new T3.Mesh(g, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide, depthWrite: false, fog: false })); Sky.dome.scale.setScalar(150000); far.add(Sky.dome);
    const sp = []; for (let i = 0; i < 700; i++) { const a = Math.random() * 6.283, e = Math.asin(Math.random()); sp.push(Math.cos(a) * Math.cos(e) * 140000, Math.sin(e) * 140000, Math.sin(a) * Math.cos(e) * 140000); }
    const sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.Float32BufferAttribute(sp, 3)); Sky.stars = new T3.Points(sg, new T3.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); far.add(Sky.stars);
    const disc = new T3.Mesh(new T3.CircleGeometry(4200, 20), new T3.MeshBasicMaterial({ color: 0xfff6d8, fog: false, depthWrite: false })); Sky.sunMesh = disc; far.add(disc);
    Sky.lights = [near, far].map(sc => { const h = new T3.HemisphereLight(0xbfd8ff, 0x4a4a3a, 0.6), d = new T3.DirectionalLight(0xfff2dd, 1); sc.add(h, d, d.target); sc.fog = new T3.Fog(0xbcd0e0, 200, 40000); return { h, d }; });
    // the sun casts the aircraft's shadow: a tight shadow box that follows the helicopter
    const sd = Sky.lights[0].d; sd.castShadow = true; sd.shadow.mapSize.set(1024, 1024); const sc = sd.shadow.camera; sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 10; sc.far = 2600; sd.shadow.bias = -0.0006; sd.shadow.normalBias = 0.05;
    // sun glare and cumulus puffs
    const blob = (n, f) => { const c2 = document.createElement('canvas'); c2.width = c2.height = n; const x2 = c2.getContext('2d'), im2 = x2.createImageData(n, n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = (j * n + i) * 4, a = f((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1, i, j); im2.data[k] = im2.data[k + 1] = im2.data[k + 2] = 255; im2.data[k + 3] = S.clamp(a, 0, 1) * 255; } x2.putImageData(im2, 0, 0); return new T3.CanvasTexture(c2); };
    Sky.glare = new T3.Sprite(new T3.SpriteMaterial({ map: blob(64, (u, v) => Math.pow(Math.max(0, 1 - Math.hypot(u, v)), 2.6)), color: 0xfff1c9, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: T3.AdditiveBlending })); Sky.glare.scale.setScalar(60000); far.add(Sky.glare);
    const puffTex = blob(128, (u, v, i, j) => { const r = Math.hypot(u, v * 1.25 + 0.15); return (1 - r) * 2.2 * (0.45 + 0.9 * S.fbm(i / 22, j / 22, 4)) - (v > 0.35 ? (v - 0.35) * 2 : 0); });
    Sky.puffMat = new T3.SpriteMaterial({ map: puffTex, color: 0xffffff, transparent: true, depthWrite: false, fog: true });
    Sky.puffs = []; for (let i = 0; i < 280; i++) { const s = new T3.Sprite(Sky.puffMat); s.visible = false; s.renderOrder = 6; far.add(s); Sky.puffs.push(s); } Sky.cells = []; Sky.cloudKey = '';
    // cloud deck: one noisy sheet at the base, one at the top
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const k = (j * 256 + i) * 4, v = S.fbm(i / 38, j / 38, 5); im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = v * 255; }
    x.putImageData(im, 0, 0); Sky.cloudTex = new T3.CanvasTexture(c); Sky.cloudTex.wrapS = Sky.cloudTex.wrapT = T3.RepeatWrapping; Sky.cloudTex.repeat.set(6, 6);
    Sky.clouds = [0, 1].map(() => { const m = new T3.Mesh(new T3.PlaneGeometry(90000, 90000), new T3.MeshBasicMaterial({ map: Sky.cloudTex, transparent: true, side: T3.DoubleSide, depthWrite: false, alphaTest: 0.02, fog: true })); m.rotation.x = -Math.PI / 2; m.renderOrder = 5; far.add(m); return m; });
  };
  Sky.update = (env, pos, ro, dt) => {
    const h = env.timeH, el = Math.sin((h - 6) / 12 * Math.PI) * 62 * S.D2R, az = (h - 12) / 12 * Math.PI + Math.PI;
    Sky.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const day = clamp((el * S.R2D + 6) / 14, 0, 1), dusk = clamp(1 - Math.abs(el * S.R2D) / 12, 0, 1); Sky.night = 1 - day;
    const ov = clamp((env.cloudCover - 0.55) * 2.2, 0, 1), top = new T3.Color().setRGB(S.lerp(0.012, 0.25, day), S.lerp(0.018, 0.47, day), S.lerp(0.04, 0.8, day)).lerp(new T3.Color(0x7d858c).multiplyScalar(0.25 + day * 0.75), ov * 0.8);
    const hor = new T3.Color().setRGB(S.lerp(0.03, 0.74, day), S.lerp(0.035, 0.83, day), S.lerp(0.06, 0.9, day)).lerp(new T3.Color(1.0, 0.55, 0.3), dusk * 0.55 * (1 - ov)).lerp(new T3.Color(0x9aa0a4).multiplyScalar(0.2 + day * 0.8), ov * 0.7);
    const P = Sky.dome.geometry.attributes.position, C = Sky.dome.geometry.attributes.color, c = new T3.Color();
    for (let i = 0; i < P.count; i++) { const t = clamp(P.getY(i) * 2.2, 0, 1); c.copy(hor).lerp(top, Math.pow(t, 0.6)); C.setXYZ(i, c.r, c.g, c.b); } C.needsUpdate = true;
    Sky.stars.material.opacity = clamp((Sky.night - 0.6) * 2.5, 0, 1) * (1 - ov);
    Sky.sunMesh.position.copy(Sky.sunDir).multiplyScalar(130000); Sky.sunMesh.lookAt(0, 0, 0); Sky.sunMesh.visible = el > -0.03 && ov < 0.9; Sky.sunMesh.material.color.setRGB(1, S.lerp(0.55, 0.97, clamp(el * 4, 0, 1)), S.lerp(0.3, 0.85, clamp(el * 4, 0, 1)));
    // cloud layer and visibility
    const base = env.cloudBase, ctop = Math.max(base + 150, env.cloudTop), alt = pos.y;
    // lay out cumulus cells around the aircraft; overcast uses the solid deck instead
    const cs = 4200, ccx = Math.round(pos.x / cs), ccz = Math.round(pos.z / cs), key = ccx + ',' + ccz + ',' + env.cloudCover + ',' + base + ',' + ctop, deck = env.cloudCover > 0.78;
    if (key !== Sky.cloudKey) { Sky.cloudKey = key; Sky.cells = []; let n = 0; const thick = Math.min(ctop - base, 1600);
      for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) { const gx = ccx + dx, gz = ccz + dz, hsh = S.hash2(gx * 3 + 11, gz * 5 - 7); if (deck || hsh > env.cloudCover * 1.1 || dx * dx + dz * dz > 50) continue;
        const x0 = (gx + S.hash2(gx, gz) - 0.5) * cs, z0 = (gz + S.hash2(gz, gx) - 0.5) * cs, big = 0.7 + S.hash2(gx + 5, gz + 9) * 0.9, r = 1100 * big; Sky.cells.push({ x: x0, z: z0, r });
        for (let k = 0; k < 5 && n < Sky.puffs.length; k++) { const p = Sky.puffs[n++], a = S.hash2(gx * 7 + k, gz) * 6.283, d = S.hash2(gx, gz * 7 + k) * r * 0.75, sz = (1000 + S.hash2(gx + k, gz - k) * 1100) * big; p.userData.w = [x0 + Math.cos(a) * d, base + sz * 0.3 + (k === 0 ? thick * 0.35 : S.hash2(k, gx + gz) * thick * 0.3), z0 + Math.sin(a) * d]; p.scale.set(sz * 1.5, sz, 1); p.visible = true; } }
      for (let i = n; i < Sky.puffs.length; i++) Sky.puffs[i].visible = false; }
    for (const p of Sky.puffs) if (p.visible) p.position.set(p.userData.w[0] - ro.x, p.userData.w[1] - ro.y, p.userData.w[2] - ro.z);
    let inCell = deck; if (!deck) for (const c of Sky.cells) if ((pos.x - c.x) ** 2 + (pos.z - c.z) ** 2 < c.r * c.r) { inCell = true; break; }
    const inLayer = alt > base && alt < ctop && env.cloudCover > 0.05 && inCell;
    Sky.inCloud = inLayer; const edge = Math.min(Math.abs(alt - base), Math.abs(alt - ctop));
    let vis = env.vis; if (inLayer) vis = Math.min(vis, 60 + edge * 6);
    Sky.visNow = Sky.visNow == null ? vis : Sky.visNow + (vis - Sky.visNow) * Math.min(1, dt * 2.5);
    const fogC = inLayer ? new T3.Color(0xb9bfc4).multiplyScalar(0.12 + day * 0.88) : hor;
    Sky.puffMat.color.copy(new T3.Color(1, 1, 1).lerp(new T3.Color(1.0, 0.72, 0.5), dusk * 0.6)).multiplyScalar(0.08 + day * 0.92); Sky.glare.position.copy(Sky.sunDir).multiplyScalar(125000); Sky.glare.material.opacity = S.clamp(el * 6, 0, 1) * (1 - ov) * 0.85; Sky.glare.visible = el > -0.02;
    Sky.clouds.forEach((m, i) => { m.visible = deck; m.material.alphaTest = clamp(1 - env.cloudCover * 1.25, 0.02, 0.95); m.material.color.setScalar(i ? 0.25 + day * 0.75 : 0.18 + day * 0.6); m.material.opacity = 0.96; });
    Sky.cloudTex.offset.set(pos.x / 15000, -pos.z / 15000);
    Sky.lights.forEach((L, i) => { const sc = i ? Sky.far : Sky.near; sc.fog.color.copy(fogC); sc.fog.near = Sky.visNow * 0.08; sc.fog.far = Sky.visNow;
      if (i === 0) { L.d.target.position.set(pos.x - ro.x, pos.y - ro.y, pos.z - ro.z); L.d.position.copy(L.d.target.position).addScaledVector(Sky.sunDir, 700); L.d.castShadow = el > 0.06 && ov < 0.85; } else L.d.position.copy(Sky.sunDir).multiplyScalar(1000);
      L.d.intensity = clamp(Math.sin(Math.max(el, 0)) * 1.25 + 0.05, 0.02, 1.15) * (1 - ov * 0.6) + (el < 0 ? 0.05 : 0); L.d.color.setRGB(1, S.lerp(0.7, 0.96, day), S.lerp(0.5, 0.88, day));
      L.h.intensity = 0.07 + day * 0.55 + ov * day * 0.1; });
    if (S.terrain.fieldMats) { S.terrain.fieldMats.light.opacity = S.terrain.fieldMats.blue.opacity = clamp(Sky.night * 1.6, 0, 1); }
  };
  // wind: steady + gusts + turbulence, lighter near the surface
  let wt = 0; Sky.tick = dt => { wt += dt; };
  S.env.windAt = (p, out, agl) => {
    const e = S.env, sh = 0.55 + 0.45 * clamp((agl || 0) / 250, 0, 1), g = e.gustKt * (0.5 * Math.sin(wt * 0.31) + 0.5 * Math.sin(wt * 0.83 + 2)) , sp = (e.windKt * sh + g * sh) / S.KT, a = e.windDir * S.D2R;
    const tb = e.turb * (0.6 + e.windKt / 20) * (Sky.inCloud ? 2 : 1);
    out.set(-Math.sin(a) * sp + (S.vnoise(wt * 0.9, p.x / 300) - 0.5) * tb * 3, (S.vnoise(wt * 1.1 + 50, p.z / 300) - 0.5) * tb * 2.4, Math.cos(a) * sp + (S.vnoise(wt * 0.8 + 90, p.y / 100) - 0.5) * tb * 3);
  };

  // ================= effects =================
  const FX = S.fx = { parts: [] };
  FX.init = scene => {
    FX.group = new T3.Group(); scene.add(FX.group);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    FX.tex = new T3.CanvasTexture(c);
    FX.tracerGeo = new T3.BufferGeometry(); FX.tracerGeo.setAttribute('position', new T3.BufferAttribute(new Float32Array(400 * 6), 3)); FX.tracers = new T3.LineSegments(FX.tracerGeo, new T3.LineBasicMaterial({ color: 0xffd27a })); FX.tracers.frustumCulled = false; FX.group.add(FX.tracers);
  };
  FX.puff = (pos, color, size, life, vy, grow) => {
    if (FX.parts.length > 220) return; const s = new T3.Sprite(new T3.SpriteMaterial({ map: FX.tex, color, transparent: true, depthWrite: false })); s.scale.setScalar(size);
    FX.group.add(s); FX.parts.push({ s, p: pos.clone(), life, t: 0, vy: vy || 0, grow: grow || 0, size });
  };
  FX.explode = (pos, big) => { FX.puff(pos, 0xffc266, big ? 22 : 7, 0.35, 2, 40); for (let i = 0; i < (big ? 6 : 2); i++) FX.puff(pos.clone().add(new T3.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6)), 0x2a2a2a, big ? 12 : 5, 3 + Math.random() * 3, 3, 5); S.audio && S.audio.boom(big); };
  FX.update = (dt, ro) => {
    for (let i = FX.parts.length - 1; i >= 0; i--) { const a = FX.parts[i]; a.t += dt; a.p.y += a.vy * dt; a.s.position.copy(a.p).sub(ro); a.s.scale.setScalar(a.size + a.grow * a.t); a.s.material.opacity = clamp(1 - a.t / a.life, 0, 1) * 0.85;
      if (a.t > a.life) { FX.group.remove(a.s); a.s.material.dispose(); FX.parts.splice(i, 1); } }
  };

  // ================= weapons and targets =================
  const W = S.wpn = { rounds: [], targets: [], cool: 0, score: 0, lock: null, pair: 1 };
  W.reset = () => { W.targets.forEach(t => t.mesh && FX.group.remove(t.mesh)); W.targets = []; W.rounds = []; W.lock = null; };
  W.spawnRange = (cx, cz, n) => {
    W.reset(); const M = S.M;
    for (let i = 0; i < n; i++) { const a = S.hash2(i, 77) * 6.283, r = 60 + S.hash2(i, 91) * 420, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, g = new T3.Group(), truck = i % 3 === 0;
      g.add(S.mk.box(truck ? 2.4 : 3.2, truck ? 2.2 : 1.1, truck ? 6 : 6.6, new T3.MeshLambertMaterial({ color: truck ? 0x6a5a3c : 0x54563c }), 0, truck ? 1.4 : 0.9, 0));
      if (!truck) { g.add(S.mk.box(2.2, 0.7, 2.6, new T3.MeshLambertMaterial({ color: 0x4a4c36 }), 0, 1.8, 0.3)); g.add(S.mk.cyl(0.09, 0.09, 4, M.dark, 0, 1.85, -2.8, 'z', 6)); }
      g.rotation.y = a * 3; FX.group.add(g); W.targets.push({ x, z, y: 0, mesh: g, alive: true, hp: truck ? 40 : 160, moving: truck ? 5 : 0, hd: a, cx: x, cz: z }); }
  };
  W.fire = (heli, sys, aim, dt) => {
    const sw = sys.sw; W.cool -= dt; if (!sw.masterArm || !sys.dc || W.cool > 0 || heli.crashed) return false;
    const q = heli.q, a = heli.ammo;
    if (sw.wpn === 0 && a.gun > 0) { // 30 mm, slaved to the pilot's line of sight
      const o = new T3.Vector3(0, -1.3, -3.9).applyQuaternion(q).add(heli.pos), d = aim.clone(); d.x += (Math.random() - 0.5) * 0.006; d.y += (Math.random() - 0.5) * 0.006; d.z += (Math.random() - 0.5) * 0.006; d.normalize();
      W.rounds.push({ p: o, v: d.multiplyScalar(805).add(heli.vel), t: 0, k: 0 }); a.gun--; W.cool = 0.096; S.audio && S.audio.gun(); return true;
    }
    if (sw.wpn === 1 && a.rkt > 0) { W.pair = -W.pair; const o = new T3.Vector3(W.pair * 2.45, -0.75, -1.4).applyQuaternion(q).add(heli.pos), d = new T3.Vector3(0, 0.035, -1).normalize().applyQuaternion(q);
      W.rounds.push({ p: o, v: d.multiplyScalar(60).add(heli.vel), t: 0, k: 1, d: d.clone().normalize() }); a.rkt--; W.cool = 0.28; S.audio && S.audio.rocket(); return true; }
    if (sw.wpn === 2 && a.msl > 0) { if (!W.lock) { sys.say('No lock: turn LASER on and put the sight on a target'); W.cool = 1; return false; }
      W.pair = -W.pair; const o = new T3.Vector3(W.pair * 1.55, -0.9, -1.2).applyQuaternion(q).add(heli.pos), d = new T3.Vector3(0, 0, -1).applyQuaternion(q);
      W.rounds.push({ p: o, v: d.multiplyScalar(40).add(heli.vel), t: 0, k: 2, tg: W.lock }); a.msl--; W.cool = 1.2; S.audio && S.audio.rocket(); return true; }
    return false;
  };
  const tv = V();
  W.update = (dt, heli, sys, aim, terrain, ro) => {
    // laser lock: nearest live target within 3.5 degrees of the sight line
    W.lock = null; if (heli.s.weapons && sys.sw.laser && sys.dc) { let best = 0.9982; for (const t of W.targets) { if (!t.alive) continue; tv.set(t.x - heli.pos.x, t.y + 1 - heli.pos.y, t.z - heli.pos.z); const d = tv.length(); if (d > 8000) continue; const c = tv.multiplyScalar(1 / d).dot(aim); if (c > best) { best = c; W.lock = t; t.rng = d; } } }
    for (const t of W.targets) { if (t.alive && t.moving) { t.hd += dt * 0.05; t.x = t.cx + Math.cos(t.hd) * 90; t.z = t.cz + Math.sin(t.hd) * 90; t.mesh.rotation.y = -t.hd; } t.y = terrain.height(t.x, t.z); t.mesh.position.set(t.x - ro.x, t.y - ro.y, t.z - ro.z); }
    const arr = FX.tracerGeo.attributes.position.array; let n = 0;
    for (let i = W.rounds.length - 1; i >= 0; i--) {
      const r = W.rounds[i]; r.t += dt;
      if (r.k === 1 && r.t < 1.1) r.v.addScaledVector(r.d, 650 * dt);
      if (r.k === 2) { const tg = r.tg; if (tg && tg.alive) { tv.set(tg.x - r.p.x, tg.y + 1 - r.p.y, tg.z - r.p.z).normalize(); const sp = Math.min(420, r.v.length() + 260 * dt); r.v.normalize().lerp(tv, Math.min(1, dt * 3.5)).normalize().multiplyScalar(sp); } }
      else r.v.y -= 9.81 * dt;
      const px = r.p.x, py = r.p.y, pz = r.p.z; r.p.addScaledVector(r.v, dt);
      if (r.k && Math.random() < 0.6) FX.puff(r.p, 0xbbbbbb, 2.5, 1.2, 0.5, 3);
      if (n < 400) { arr[n * 6] = px - ro.x; arr[n * 6 + 1] = py - ro.y; arr[n * 6 + 2] = pz - ro.z; arr[n * 6 + 3] = r.p.x - ro.x; arr[n * 6 + 4] = r.p.y - ro.y; arr[n * 6 + 5] = r.p.z - ro.z; n++; }
      let hit = r.p.y <= terrain.height(r.p.x, r.p.z), rad = r.k === 0 ? 4 : r.k === 1 ? 11 : 6;
      for (const t of W.targets) { if (!t.alive) continue; const dx = t.x - r.p.x, dz = t.z - r.p.z, dy = t.y + 1 - r.p.y; if (dx * dx + dz * dz + dy * dy < (rad + 3) * (rad + 3)) hit = true; }
      if (hit || r.t > (r.k === 2 ? 30 : 9)) {
        if (hit) { FX.explode(r.p, r.k > 0); const dmg = r.k === 0 ? 14 : r.k === 1 ? 70 : 400;
          for (const t of W.targets) { if (!t.alive) continue; const d = Math.hypot(t.x - r.p.x, t.z - r.p.z, t.y + 1 - r.p.y); if (d < rad + 3) { t.hp -= dmg * (1 - d / (rad + 4)); if (t.hp <= 0) { t.alive = false; W.score++; t.mesh.scale.y = 0.45; t.mesh.traverse(m => { if (m.isMesh) m.material = S.M.dark; }); FX.explode(new T3.Vector3(t.x, t.y + 2, t.z), true); sys.say('Target destroyed (' + W.targets.filter(q => q.alive).length + ' left)'); } } } }
        W.rounds.splice(i, 1);
      }
    }
    FX.tracerGeo.setDrawRange(0, n * 2); FX.tracerGeo.attributes.position.needsUpdate = true;
    for (const t of W.targets) if (!t.alive && Math.random() < dt * 2) FX.puff(new T3.Vector3(t.x, t.y + 2, t.z), 0x181818, 6, 5, 4, 4);
  };

  // ================= route and navigation =================
  const R = S.route = { wps: [], active: 0 };
  R.add = (name, x, z) => { const g = S.proj.toGeo(x, z); R.wps.push({ name, x, z, lat: g.lat, lon: g.lon }); };
  R.addGeo = (name, lat, lon) => { const l = S.proj.toLocal(lat, lon); R.wps.push({ name, x: l.x, z: l.z, lat, lon }); };
  R.reproject = () => R.wps.forEach(w => { const l = S.proj.toLocal(w.lat, w.lon); w.x = l.x; w.z = l.z; });
  R.nav = (heli, out) => {
    const w = R.wps[R.active]; out.name = ''; out.brg = null; out.dist = 0;
    if (!w) return out; const dx = w.x - heli.pos.x, dz = w.z - heli.pos.z, d = Math.hypot(dx, dz);
    out.name = w.name; out.brg = S.wrap360(Math.atan2(dx, -dz) * S.R2D); out.dist = d / S.NM;
    if (d < 450 && R.active < R.wps.length - 1) { R.active++; S.sysSay && S.sysSay('Waypoint ' + w.name + ' passed. Next: ' + R.wps[R.active].name); }
    return out;
  };

  // ================= missions =================
  const Mi = S.mission = { cur: null, done: 0 };
  function lzNear(f, minKm, maxKm, seed) { // pick a landable spot: gentle slope, above water
    for (let i = 0; i < 40; i++) { const a = S.hash2(seed + i, 5) * 6.283, r = (minKm + S.hash2(seed + i, 9) * (maxKm - minKm)) * 1000, x = f.geo.rx + Math.cos(a) * r, z = f.geo.rz + Math.sin(a) * r; return { x, z }; }
  }
  Mi.options = (f, spec) => {
    const o = [], seed = Math.floor(Date.now() / 60000) % 1000, g = f.geo;
    if (spec.hook) { const kg = Math.round(spec.hookMax * (0.3 + S.hash2(seed, 1) * 0.45) / 50) * 50; o.push({ type: 'sling', title: 'Sling load: ' + S.fmt(kg * S.LB) + ' lb to a forward LZ', kg, lz: lzNear(f, 6, 14, seed) }); }
    if (spec.seats) { const n = Math.max(4, Math.round(spec.seats * (0.6 + S.hash2(seed, 2) * 0.4))); o.push({ type: 'troops', title: 'Air assault: ' + n + ' troops to an LZ', kg: n * 109, n, lz: lzNear(f, 8, 18, seed + 50) }); }
    if (spec.weapons) { const p = lzNear(f, 5, 8, seed + 90); o.push({ type: 'gunnery', title: 'Gunnery range: destroy 9 targets', lz: p }); }
    const other = S.terrain.fields.filter(q => q !== f && (q.x - f.x) ** 2 + (q.z - f.z) ** 2 < 90000 * 90000 && (q.x - f.x) ** 2 + (q.z - f.z) ** 2 > 12000 * 12000).sort((a, b) => S.hash2(a.icao.charCodeAt(1), seed) - S.hash2(b.icao.charCodeAt(1), seed))[0];
    if (other) o.push({ type: 'ferry', title: 'Ferry flight to ' + other.icao + ' ' + other.name, dest: other });
    return o;
  };
  Mi.start = (m, f, heli, sys) => {
    Mi.clear(); Mi.cur = m; m.stage = 0; m.from = f; R.wps = []; R.active = 0;
    if (m.lz) { m.lz.y = 0; const g = new T3.Group(); for (let i = 0; i < 8; i++) { const a = i * 0.785; g.add(S.mk.box(1.5, 0.15, 4, new T3.MeshBasicMaterial({ color: 0xff7a1a }), Math.cos(a) * 22, 0.3, Math.sin(a) * 22, 0, -a + 1.57)); } m.marker = g; FX.group.add(g); R.add(m.type === 'gunnery' ? 'RANGE' : 'LZ', m.lz.x, m.lz.z); }
    if (m.type === 'sling') { const c = f.geo.cargo; heli.attachLoad(m.kg, c.x, S.terrain.height(c.x, c.z) + 0.6, c.z); m.text = 'Arm the cargo hook, hover over the crate on the ramp, tap HOOK UP, fly to the LZ and release it there.'; }
    if (m.type === 'troops') m.text = 'On the ground at the ramp, open SERVICE and load the troops. Fly to the LZ, land inside the orange panels and unload.';
    if (m.type === 'gunnery') { W.spawnRange(m.lz.x, m.lz.z, 9); m.text = 'Targets are at the RANGE waypoint. MASTER ARM on, pick a weapon, and fire. LASER on for missiles.'; }
    if (m.type === 'ferry') { R.addGeo(m.dest.icao, m.dest.lat, m.dest.lon); m.text = 'Fly to ' + m.dest.icao + ' and land on the ramp.'; }
    R.add('RTB ' + f.icao, f.geo.rx, f.geo.rz); sys.say('Mission: ' + m.title);
  };
  Mi.clear = () => { const m = Mi.cur; if (m && m.marker) FX.group.remove(m.marker); Mi.cur = null; };
  Mi.update = (dt, heli, sys, terrain, ro) => {
    const m = Mi.cur; if (!m || m.complete) return;
    if (m.marker) { m.lz.y = terrain.height(m.lz.x, m.lz.z); m.marker.position.set(m.lz.x - ro.x, m.lz.y - ro.y, m.lz.z - ro.z); if (Math.random() < dt * 6 && m.type !== 'gunnery') FX.puff(new T3.Vector3(m.lz.x + 26, m.lz.y + 1, m.lz.z), 0xb04cff, 5, 7, 5, 3); }
    const stopped = heli.onGround && heli.out.gs < 1, dLZ = m.lz ? Math.hypot(heli.pos.x - m.lz.x, heli.pos.z - m.lz.z) : 1e9; let ok = false;
    if (m.type === 'sling' && heli.load) { const l = heli.load; if (l.on) m.stage = 1; if (m.stage === 1 && !l.on && l.grounded) { const d = Math.hypot(l.pos.x - m.lz.x, l.pos.z - m.lz.z); if (d < 70) ok = true; else if (!m.warned) { m.warned = true; sys.say('Load is ' + Math.round(d) + ' m from the LZ. Pick it up and try again.'); } } if (l.on) m.warned = false; }
    if (m.type === 'troops') { m.atLZ = stopped && dLZ < 90; if (m.stage === 2) ok = true; }
    if (m.type === 'gunnery') ok = W.targets.length > 0 && W.targets.every(t => !t.alive);
    if (m.type === 'ferry') ok = stopped && Math.hypot(heli.pos.x - m.dest.x, heli.pos.z - m.dest.z) < 2500 && sys.nr >= 0;
    if (ok) { m.complete = true; Mi.done++; sys.say('MISSION COMPLETE: ' + m.title + (heli.out.maxG > 2 ? ' (max ' + heli.out.maxG.toFixed(1) + ' g)' : '')); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
