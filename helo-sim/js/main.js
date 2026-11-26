/* Game loop: spawn, physics stepping, cameras (cockpit, chase, fly-by, sight), rendering, service and failures. */
(function () {
  const S = window.SIM, T3 = window.THREE, clamp = S.clamp, $ = id => document.getElementById(id);
  const G = S.game = { heli: null, sys: null, model: null, spec: null, field: null, view: 'chase', paused: true, loading: false, nav: {}, t: 0, opts: null,
    svc: { fueling: false, target: 0 }, panelPref: { chase: true, cockpit: false, flyby: false }, randFail: false, sight: false, aim: new T3.Vector3(0, 0, -1), showPanel: true, frame: 0 };
  let renderer, near, far, camN, camF, last = 0, loadObj = null, cable = null, flyby = null, failT = 0;
  const tq = new T3.Quaternion(), tv = new T3.Vector3(), tv2 = new T3.Vector3(), eul = new T3.Euler(0, 0, 0, 'YXZ'), ctl = { coll: 0, lon: 0, lat: 0, ped: 0 };
  S.sysSay = m => G.sys && G.sys.say(m);

  function init() {
    const cv = $('gl');
    try { renderer = new T3.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); } catch (e) { $('menubox').innerHTML = '<h1>3D graphics unavailable</h1><p>This device or browser could not start WebGL, which the simulator needs.</p>'; return; }
    renderer.autoClear = false; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
    near = new T3.Scene(); far = new T3.Scene(); camN = new T3.PerspectiveCamera(65, 1, 0.3, 46000); camF = new T3.PerspectiveCamera(65, 1, 400, 420000);
    S.terrain.init(near, far); S.sky.init(near, far); S.fx.init(near); S.terrain.loadFields(); S.input.init(); S.ui.init();
    try { G.opts = JSON.parse(localStorage.getItem('rwfs-opts') || 'null'); } catch (e) {}
    S.ui.menu(); requestAnimationFrame(loop);
  }

  G.start = o => {
    G.opts = o; try { localStorage.setItem('rwfs-opts', JSON.stringify(o)); } catch (e) {}
    const f = S.terrain.findField(o.icao) || S.terrain.fields[0]; G.field = f;
    S.proj.set(f.lat, f.lon); S.terrain.reset(); S.terrain.quality = o.quality || 'med'; S.terrain.projectFields(); S.route.reproject(); S.mission.clear(); S.wpn.reset();
    if (G.model) near.remove(G.model.group); if (loadObj) { near.remove(loadObj); loadObj = null; } if (cable) { near.remove(cable); cable = null; }
    G.spec = S.AIRCRAFT[o.ac]; G.sys = new S.Systems(G.spec); G.heli = new S.Heli(G.spec, G.sys); G.model = S.buildAircraft(o.ac); near.add(G.model.group);
    G.loading = true; G.paused = false; G.svc.fueling = false; S.input.coll = 0; G.sight = false; flyby = null;
    S.terrain.ro.set(0, 0, 0); G.heli.pos.set(f.x, 0, f.z); $('crash').style.display = 'none'; S.ui.onStart();
  };
  function spawn() {
    const o = G.opts, f = G.field, g = S.terrain.layout(f), h = G.heli, p = g.pads[1], gy = S.terrain.height(p.x, p.z);
    h.place(p.x, gy - G.spec.gear[0][1] + 0.08, p.z, g.hdg);
    let top = -1e9; G.spec.gear.forEach(gp => { tv.set(gp[0], 0, gp[2]).applyQuaternion(h.q); top = Math.max(top, S.terrain.height(p.x + tv.x, p.z + tv.z) - gp[1]); }); h.pos.y = top + 0.06;
    if (o.state !== 'cold') G.sys.setReady();
    if (o.state === 'air') { h.pos.y += 300; tv.set(0, 0, -45).applyQuaternion(h.q); h.vel.copy(tv); S.input.coll = 0.42; h.eff.coll = 0.42; G.sys.sw.pbrake = 0; h.trimP = -0.05; }
    S.input.orbit = 0.5; S.input.orbitP = 0.2; G.loading = false; G.sys.say(o.state === 'cold' ? 'Cold and dark at ' + f.icao + '. Open CHECKLIST to start up.' : 'Ready at ' + f.icao);
  }
  G.reset = () => { const o = G.opts; G.sys = new S.Systems(G.spec); const old = G.heli; G.heli = new S.Heli(G.spec, G.sys); G.heli.pos.copy(old.pos); if (loadObj) { near.remove(loadObj); loadObj = null; } S.mission.clear(); G.loading = true; G.field = S.terrain.nearestField(old.pos.x, old.pos.z, 80000) || G.field; G.heli.pos.set(G.field.x, 0, G.field.z); $('crash').style.display = 'none'; G.opts = { ...o, state: o.state === 'air' ? 'ready' : o.state }; S.ui.onStart(); };

  function service(dt) { // refuelling on the ground at a fuel point
    const sv = G.svc, h = G.heli, sys = G.sys; if (!sv.fueling) return;
    const at = G.atFuel(); if (!at.ok) { sv.fueling = false; return sys.say('Refuelling stopped: ' + at.why); }
    const add = Math.min(G.spec.refuelRate * dt, sv.target - sys.fuelTotal()); if (add <= 0.001) { sv.fueling = false; return sys.say('Refuelling complete: ' + S.fmt(sys.fuelTotal() * S.LB) + ' lb'); }
    const cap = G.spec.fuelCap / 2; for (let i = 0; i < 2; i++) sys.fuel[i] = Math.min(cap, sys.fuel[i] + add / 2);
  }
  G.atFuel = () => { const h = G.heli, f = S.terrain.nearestField(h.pos.x, h.pos.z, 4000); if (!f || !f.geo) return { ok: false, why: 'not at an airfield' };
    const d = Math.hypot(h.pos.x - f.geo.fuel.x, h.pos.z - f.geo.fuel.z); if (!h.onGround || h.out.gs > 0.5) return { ok: false, why: 'aircraft must be stopped on the ground', f, d };
    if (d > 45) return { ok: false, why: 'taxi or hover to the fuel pad (' + Math.round(d) + ' m away, beside the white tanks)', f, d }; if (!G.sys.sw.pbrake) return { ok: false, why: 'set the parking brake', f, d }; return { ok: true, f, d }; };
  G.atRamp = () => { const h = G.heli, f = S.terrain.nearestField(h.pos.x, h.pos.z, 4000); if (!f || !f.geo) return null; return h.onGround && h.out.gs < 0.5 && Math.hypot(h.pos.x - f.geo.rx, h.pos.z - f.geo.rz) < 260 ? f : null; };

  function camera(dt) {
    const h = G.heli, I = S.input, ro = S.terrain.ro, spec = G.spec, inside = G.view === 'cockpit';
    G.model.cockpit.visible = inside && !G.sight;
    let fov = 66;
    if (inside) {
      eul.set(I.lookPitch, I.lookYaw, 0); tq.setFromEuler(eul);
      if (G.sight) { // gimballed sight: holds its line of sight in the world while the aircraft moves
        if (!G.sightQ) G.sightQ = h.q.clone().multiply(tq); eul.set(I.lookPitch - (G._lp || 0), I.lookYaw - (G._ly || 0), 0); G._lp = I.lookPitch; G._ly = I.lookYaw;
        const f = tv.set(0, 0, -1).applyQuaternion(G.sightQ), yaw = Math.atan2(-f.x, -f.z) + eul.y, pit = clamp(Math.asin(clamp(f.y, -1, 1)) + eul.x, -1.2, 0.5); eul.set(pit, yaw, 0); G.sightQ.setFromEuler(eul);
        camN.quaternion.copy(G.sightQ); tv.set(0, -0.8, -6.6).applyQuaternion(h.q); camN.position.copy(h.pos).add(tv).sub(ro); fov = G.sightNarrow ? 3.2 : 12;
      } else { G.sightQ = null; camN.quaternion.copy(h.q).multiply(tq); tv.fromArray(spec.eye).applyQuaternion(h.q); camN.position.copy(h.pos).add(tv).sub(ro); fov = 64 / clamp(I.zoom, 0.7, 3); }
      G.aim.set(0, 0, -1).applyQuaternion(camN.quaternion);
    } else if (G.view === 'flyby') {
      if (!flyby || flyby.distanceTo(h.pos) > 900) { flyby = h.pos.clone().addScaledVector(h.vel, 7).add(tv.set(40, 0, 25)); flyby.y = Math.max(S.terrain.height(flyby.x, flyby.z) + 6, h.pos.y - 15); }
      camN.position.copy(flyby).sub(ro); camN.lookAt(tv.copy(h.pos).sub(ro)); fov = clamp(1800 / Math.max(30, flyby.distanceTo(h.pos)), 6, 55); G.aim.set(0, 0, -1).applyQuaternion(h.q);
    } else {
      const a = h.out.hdg * S.D2R + Math.PI + I.orbit, d = (spec.rotors === 2 ? 38 : 26) * I.zoom, cp = Math.cos(I.orbitP);
      tv.set(Math.sin(a) * cp * d, Math.sin(I.orbitP) * d + 2, -Math.cos(a) * cp * d).add(h.pos);
      const gh = S.terrain.height(tv.x, tv.z) + 1.5; if (tv.y < gh) tv.y = gh;
      G.camPos = G.camPos || tv.clone(); G.camPos.lerp(tv, Math.min(1, dt * 7)); if (G.camPos.distanceTo(h.pos) > 300) G.camPos.copy(tv);
      camN.position.copy(G.camPos).sub(ro); camN.lookAt(tv2.copy(h.pos).sub(ro).add(tv.set(0, 1.5, 0))); G.aim.set(0, 0, -1).applyQuaternion(h.q);
    }
    const w = window.innerWidth, hh = window.innerHeight; if (camN.aspect !== w / hh || camN.fov !== fov) { camN.aspect = camF.aspect = w / hh; camN.fov = camF.fov = fov; }
    const off = G.showPanel ? Math.round(hh * 0.14) : 0; if (off !== G._off) { G._off = off; [camN, camF].forEach(c => off ? c.setViewOffset(w, hh, 0, off, w, hh) : c.clearViewOffset()); } else if (off && (camN.view.fullWidth !== w || camN.view.fullHeight !== hh)) [camN, camF].forEach(c => c.setViewOffset(w, hh, 0, off, w, hh));
    camN.near = inside ? 0.12 : 1; camN.updateProjectionMatrix(); camF.position.copy(camN.position); camF.quaternion.copy(camN.quaternion); camF.updateProjectionMatrix();
  }

  function loop(ts) {
    requestAnimationFrame(loop); if (!renderer) return;
    const dt = clamp((ts - last) / 1000, 0.001, 0.05); last = ts; G.frame++;
    const w = window.innerWidth, hh = window.innerHeight, cv = renderer.domElement; if (cv.width !== Math.floor(w * renderer.getPixelRatio()) || cv.height !== Math.floor(hh * renderer.getPixelRatio())) renderer.setSize(w, hh, false);
    const h = G.heli, sys = G.sys; if (!h) { renderer.clear(); return; }
    const Tn = S.terrain, env = S.env, ro = Tn.ro;
    ro.set(Math.round(h.pos.x / 2000) * 2000, 0, Math.round(h.pos.z / 2000) * 2000);
    Tn.update(h.pos.x, h.pos.z, dt); Tn.placeTrees();
    if (G.loading) { const ld = $('load'); ld.style.display = 'block'; ld.textContent = 'Loading terrain ' + Tn.loadedNear + '/' + Tn.wantNear + (Tn.offline ? ' (no connection: generated terrain)' : '');
      const g = Tn.layout(G.field); if (Tn.ready(g.pads[1].x, g.pads[1].z) && Tn.loadedNear >= Math.min(9, Tn.wantNear)) { spawn(); ld.style.display = 'none'; } }
    else if (!G.paused && !h.crashed) {
      G.t += dt; S.sky.tick(dt); S.input.update(dt); const I = S.input;
      ctl.coll = I.coll; ctl.lon = I.lon; ctl.lat = I.lat; ctl.ped = I.ped; h.brake = I.brake ? 1 : 0; if (I.gpTrim) h.setTrim();
      sys.step(dt, env, { alt: h.pos.y, onGround: h.onGround, inCloud: S.sky.inCloud, destroy: why => h.crash(why) });
      const n = Math.ceil(dt * 240), sdt = dt / n; for (let i = 0; i < n && !h.crashed; i++) h.step(sdt, ctl, env, Tn);
      if (h.load && !h.load.on) h.loadStep(dt, env, Tn, null, null, 0);
      S.route.nav(h, G.nav); h.navBrg = G.nav.brg; G.nav.lock = !!S.wpn.lock;
      if (G.spec.weapons) { if (I.fire) S.wpn.fire(h, sys, G.aim, dt); else S.wpn.cool -= dt; }
      S.wpn.update(dt, h, sys, G.aim, Tn, ro); S.mission.update(dt, h, sys, Tn, ro); service(dt);
      if (G.randFail) { failT += dt; if (failT > 45) { failT = 0; if (Math.random() < 0.22 && !h.onGround) { const opts = S.FAILURES.filter(f => !sys.fail[f[0]] && !(f[0] === 'tr' && G.spec.tandem)); const f = opts[Math.floor(Math.random() * opts.length)]; if (f) sys.fail[f[0]] = true; } } }
      if (h.crashed) { S.fx.explode(h.pos.clone(), true); S.audio.crash && S.audio.crash(); $('crashmsg').textContent = 'Crashed: ' + h.crashed; $('crash').style.display = 'flex'; }
      // rotor wash dust near the ground
      if (h.out.agl < 9 && sys.nr > 0.8 && h.eff.coll > 0.3 && Math.random() < dt * 14) { const a = Math.random() * 6.283, r = G.spec.R * (0.8 + Math.random() * 0.6); tv.set(h.pos.x + Math.cos(a) * r, 0, h.pos.z + Math.sin(a) * r); tv.y = Tn.height(tv.x, tv.z) + 0.5; S.fx.puff(tv, 0x8d8468, 4, 1.6, 1.5, 6); }
    }
    // ---- visuals ----
    const m = G.model; m.group.position.copy(h.pos).sub(ro); m.group.quaternion.copy(h.q); S.animateAircraft(m, G.paused ? 0 : dt, sys, h, S.sky.night > 0.5);
    if (m.gun) { tq.copy(h.q).invert(); tv.copy(G.aim).applyQuaternion(tq); m.gun.rotation.set(clamp(Math.asin(clamp(tv.y, -1, 1)), -1.0, 0.19), clamp(Math.atan2(-tv.x, -tv.z), -1.5, 1.5), 0, 'YXZ'); }
    if (G._reload && loadObj) { near.remove(loadObj); near.remove(cable); loadObj = null; cable = null; } G._reload = false;
    if (h.load) { if (!loadObj) { loadObj = S.buildLoad(h.load.m); near.add(loadObj); cable = S.buildCable(); near.add(cable); } loadObj.position.copy(h.load.pos).sub(ro); cable.visible = h.load.on;
      if (h.load.on) { const p = cable.geometry.attributes.position; tv.fromArray(G.spec.hook).applyQuaternion(h.q).add(h.pos).sub(ro); p.setXYZ(0, tv.x, tv.y, tv.z); p.setXYZ(1, loadObj.position.x, loadObj.position.y + loadObj.userData.top, loadObj.position.z); p.needsUpdate = true; } }
    else if (loadObj) { near.remove(loadObj); near.remove(cable); loadObj = null; cable = null; }
    Tn.activeFields.forEach(f => { if (f.sock) { f.sock.rotation.y = -(env.windDir + 180) * S.D2R + Math.PI; f.sock.rotation.x = clamp(0.9 - env.windKt / 18, 0, 0.9); } });
    camera(dt); S.sky.update(env, h.pos, ro, dt); S.fx.update(dt, ro);
    S.sky.dome.position.copy(camF.position); S.sky.stars.position.copy(camF.position); S.sky.sunMesh.position.add(camF.position); S.sky.glare.position.add(camF.position);
    S.sky.clouds.forEach((c, i) => c.position.set(h.pos.x - ro.x, (i ? Math.max(env.cloudBase + 150, env.cloudTop) : env.cloudBase) - ro.y, h.pos.z - ro.z));
    // goggles and sight image
    const nv = sys.sw.nvg && sys.dc, gl = $('gl'), flt = G.sight && G.view === 'cockpit' ? 'grayscale(1) contrast(1.35) brightness(1.15)' : nv ? 'grayscale(1) brightness(1.5) sepia(1) hue-rotate(62deg) saturate(3.2) contrast(1.15)' : '';
    if (gl.style.filter !== flt) gl.style.filter = flt; $('nvg').style.display = nv && !G.sight ? 'block' : 'none';
    const gain = (nv || (G.sight && G.view === 'cockpit')) && S.sky.night > 0.3 ? 1 + S.sky.night * 9 : 1; S.sky.lights.forEach(L => { L.h.intensity *= gain; L.d.intensity *= Math.sqrt(gain); });
    renderer.clear(); renderer.render(far, camF); renderer.clearDepth(); renderer.render(near, camN);
    if (G.showPanel && G.frame % 3 === 0) S.drawPanel($('panel'), h, sys, G.nav, env);
    if (G.view === 'cockpit' && !G.sight && G.frame % 4 === 1) { S.drawPanel(S.panelCanvas, h, sys, G.nav, env); S.panelTex.needsUpdate = true; }
    if (G.frame % 8 === 0) S.ui.tick();
    S.audio.update && S.audio.update(h, sys, G.view === 'cockpit');
  }
  G.setPanel = on => { G.showPanel = on; G.panelPref[G.view] = on; $('panel').className = on ? '' : 'hide'; $('b-inst').className = on ? 'on' : ''; };
  G.cycleView = () => { const v = ['chase', 'cockpit', 'flyby']; G.view = v[(v.indexOf(G.view) + 1) % v.length]; G.sight = false; S.input.lookYaw = 0; S.input.lookPitch = G.view === 'cockpit' ? -0.16 : 0; S.input.zoom = 1; flyby = null; G.showPanel = G.panelPref[G.view]; $('panel').className = G.showPanel ? '' : 'hide'; $('b-inst').className = G.showPanel ? 'on' : ''; return G.view; };
  window.addEventListener('load', init);
})();
