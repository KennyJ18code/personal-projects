/* Physical cockpit controls: toggles, levers, lit push-buttons, T-handles and guarded switches placed on the
   overhead panel, centre console, side consoles and instrument panel, where they sit in the real aircraft.
   Tapping a control in the 3D cockpit operates it. */
(function (root) {
  const S = root.SIM, T3 = root.THREE, clamp = S.clamp;
  const T = (id, u, v, label, o) => Object.assign({ id, u, v, label, kind: 'tog' }, o || {});
  const col6 = [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25], col4 = [-0.12, -0.04, 0.04, 0.12], col3 = [-0.065, 0, 0.065];

  // ---- where everything lives (metres on each panel; v is "up" on the panel as the pilot reads it) ----
  function layoutSideBySide(spec) {
    const oh = { key: 'overhead', name: 'Overhead', w: 0.62, h: 0.84, on: -1, hit: 0.094, items: [
      T('rbrake', -0.265, -0.33, 'ROTOR BRAKE', { kind: 'lever', opts: ['OFF', 'ON'], knob: 0xb23a2a }),
      T('fire1', -0.1, -0.36, 'ENG 1 EMER OFF', { kind: 'thandle' }), T('fire2', 0.1, -0.36, 'ENG 2 EMER OFF', { kind: 'thandle' }),
      T('fuelSel1', -0.2, -0.2, 'FUEL SYS 1', { kind: 'lever', opts: ['OFF', 'DIR', 'XFD'], knob: 0x222222 }), T('pcl1', -0.07, -0.2, 'ENG 1 POWER', { kind: 'lever', opts: ['OFF', 'IDLE', 'FLY'], knob: 0xc9a227, big: 1 }),
      T('pcl2', 0.07, -0.2, 'ENG 2 POWER', { kind: 'lever', opts: ['OFF', 'IDLE', 'FLY'], knob: 0xc9a227, big: 1 }), T('fuelSel2', 0.2, -0.2, 'FUEL SYS 2', { kind: 'lever', opts: ['OFF', 'DIR', 'XFD'], knob: 0x222222 }),
      T('start1', -0.07, -0.045, 'START 1', { kind: 'mom' }), T('start2', 0.07, -0.045, 'START 2', { kind: 'mom' }),
      T('batt', col6[0], 0.07, 'BATT'), T('gen1', col6[1], 0.07, 'GEN 1'), T('gen2', col6[2], 0.07, 'GEN 2'), T('apuGen', col6[3], 0.07, 'APU GEN'), T('apu', col6[4], 0.07, 'APU', { opts: ['OFF', 'RUN'] }), T('ign', col6[5], 0.07, 'IGNITION'),
      T('boost1', col6[0], 0.2, 'FUEL BOOST 1'), T('boost2', col6[1], 0.2, 'FUEL BOOST 2'), T('bkpPump', col6[2], 0.2, 'BACKUP PUMP', { opts: ['OFF', 'AUTO', 'ON'] }), T('boost', col6[3], 0.2, 'HYD BOOST'), T('pitot', col6[4], 0.2, 'PITOT HEAT'), T('panelLt', col6[5], 0.2, 'PANEL LTS'),
      T('antiice1', col6[0], 0.33, 'ENG 1 ANTI-ICE'), T('antiice2', col6[1], 0.33, 'ENG 2 ANTI-ICE'), T('pos', col6[2], 0.33, 'POSITION LTS'), T('acol', col6[3], 0.33, 'ANTI-COLL'), T('land', col6[4], 0.33, 'LANDING LT'), T('search', col6[5], 0.33, 'SEARCH LT')
    ], sections: [['ENGINE CONTROL', -0.3, -0.41, 0.3, 0.0], ['ELECTRICAL', -0.3, 0.01, 0.3, 0.135], ['FUEL / HYD / HEAT', -0.3, 0.14, 0.3, 0.265], ['ANTI-ICE / LIGHTS', -0.3, 0.27, 0.3, 0.405]] };
    const cn = { key: 'console', name: 'Console', w: 0.36, h: 0.9, on: 1, hit: 0.076, items: [
      T('sas1', col4[0], 0.34, 'SAS 1', { kind: 'btn' }), T('sas2', col4[1], 0.34, 'SAS 2', { kind: 'btn' }), T('trim', col4[2], 0.34, 'TRIM', { kind: 'btn' }), T('fps', col4[3], 0.34, 'FPS', { kind: 'btn' }),
      T('altHold', col4[0], 0.21, 'ALT', { kind: 'btn' }), T('iasHold', col4[1], 0.21, 'IAS', { kind: 'btn' }), T('hdgHold', col4[2], 0.21, 'HDG', { kind: 'btn' }), T('navMode', col4[3], 0.21, 'NAV', { kind: 'btn' }),
      T('hdgM', col4[0], 0.08, 'HDG -10', { kind: 'mom' }), T('hdgP', col4[1], 0.08, 'HDG +10', { kind: 'mom' }), T('hdgS', col4[2], 0.08, 'HDG SYNC', { kind: 'mom' }), T('nvg', col4[3], 0.08, 'NVG'),
      T('pbrake', 0.1, -0.2, 'PARKING BRAKE', { kind: 'lever', opts: ['OFF', 'SET'], knob: 0xb23a2a })
    ].concat(spec.hook ? [T('hookArm', col4[0], -0.08, 'CARGO HOOK', { opts: ['SAFE', 'ARM'] }), T('hookRel', col4[1], -0.08, 'HOOK REL', { kind: 'mom', guard: 1 })] : []),
      sections: [['FLIGHT CONTROL COMPUTER', -0.17, 0.275, 0.17, 0.42], ['FLIGHT DIRECTOR', -0.17, 0.02, 0.17, 0.27], ['MISC', -0.17, -0.33, 0.17, 0.0]] };
    const ip = { key: 'panel', name: 'Panel', w: 0.5, h: 0.11, on: 1, hit: 0.075, items: [T('ext', -0.19, -0.005, 'FIRE EXTGH', { kind: 'mom', guard: 1 }), T('baroM', -0.06, -0.005, 'BARO -', { kind: 'mom' }), T('baroP', 0.02, -0.005, 'BARO +', { kind: 'mom' }), T('baroS', 0.1, -0.005, 'BARO SET', { kind: 'mom' })], sections: [] };
    return [oh, cn, ip];
  }
  function layoutTandem() {
    const r = [0.33, 0.22, 0.11, 0.0, -0.11, -0.22, -0.33];
    const lc = { key: 'left', name: 'Left', w: 0.22, h: 0.84, on: 1, hit: 0.062, items: [
      T('start1', -0.045, 0.37, 'START 1', { kind: 'mom' }), T('start2', 0.045, 0.37, 'START 2', { kind: 'mom' }),
      T('pcl1', -0.045, 0.22, 'ENG 1 POWER', { kind: 'lever', opts: ['OFF', 'IDLE', 'FLY'], knob: 0xc9a227, big: 1 }), T('pcl2', 0.045, 0.22, 'ENG 2 POWER', { kind: 'lever', opts: ['OFF', 'IDLE', 'FLY'], knob: 0xc9a227, big: 1 }),
      T('fuelSel1', col3[0], 0.03, 'FUEL 1', { opts: ['OFF', 'DIR', 'XFD'] }), T('fuelSel2', col3[1], 0.03, 'FUEL 2', { opts: ['OFF', 'DIR', 'XFD'] }), T('ign', col3[2], 0.03, 'IGNITION'),
      T('batt', col3[0], -0.09, 'BATT'), T('apu', col3[1], -0.09, 'APU', { opts: ['OFF', 'RUN'] }), T('apuGen', col3[2], -0.09, 'APU GEN'),
      T('gen1', col3[0], -0.21, 'GEN 1'), T('gen2', col3[1], -0.21, 'GEN 2'), T('rbrake', col3[2], -0.21, 'RTR BRAKE'),
      T('boost1', col3[0], -0.33, 'BOOST 1'), T('boost2', col3[1], -0.33, 'BOOST 2'), T('bkpPump', col3[2], -0.33, 'BKUP PUMP', { opts: ['OFF', 'AUTO', 'ON'] })
    ], sections: [['POWER', -0.105, 0.1, 0.105, 0.415], ['FUEL / ELEC', -0.105, -0.41, 0.105, 0.095]] };
    const rc = { key: 'right', name: 'Right', w: 0.22, h: 0.84, on: 1, hit: 0.062, items: [
      T('sas1', col3[0], r[0], 'SAS 1', { kind: 'btn' }), T('sas2', col3[1], r[0], 'SAS 2', { kind: 'btn' }), T('trim', col3[2], r[0], 'TRIM', { kind: 'btn' }),
      T('fps', col3[0], r[1], 'FPS', { kind: 'btn' }), T('altHold', col3[1], r[1], 'ALT', { kind: 'btn' }), T('iasHold', col3[2], r[1], 'IAS', { kind: 'btn' }),
      T('hdgHold', col3[0], r[2], 'HDG', { kind: 'btn' }), T('navMode', col3[1], r[2], 'NAV', { kind: 'btn' }), T('hdgS', col3[2], r[2], 'HDG SYNC', { kind: 'mom' }),
      T('boost', col3[0], r[3], 'HYD BOOST'), T('pitot', col3[1], r[3], 'PITOT'), T('panelLt', col3[2], r[3], 'PANEL LT'),
      T('antiice1', col3[0], r[4], 'ANTI-ICE 1'), T('antiice2', col3[1], r[4], 'ANTI-ICE 2'), T('nvg', col3[2], r[4], 'NVG'),
      T('pos', col3[0], r[5], 'POSN LT'), T('acol', col3[1], r[5], 'ANTI-COL'), T('land', col3[2], r[5], 'LDG LT'),
      T('search', col3[0], r[6], 'SRCH LT'), T('pbrake', 0.05, r[6] - 0.02, 'PARK BRAKE', { kind: 'lever', opts: ['OFF', 'SET'], knob: 0xb23a2a })
    ], sections: [['FLIGHT CONTROL', -0.105, 0.055, 0.105, 0.415], ['SYSTEMS / LIGHTS', -0.105, -0.41, 0.105, 0.05]] };
    const ip = { key: 'panel', name: 'Panel', w: 0.6, h: 0.15, on: 1, hit: 0.066, items: [T('fire1', -0.27, -0.005, 'ENG 1 FIRE', { kind: 'thandle' }), T('fire2', -0.2, -0.005, 'ENG 2 FIRE', { kind: 'thandle' }), T('ext', -0.125, -0.005, 'EXTGH', { kind: 'mom', guard: 1 }),
      T('baroM', -0.05, -0.005, 'BARO -', { kind: 'mom' }), T('baroP', 0.01, -0.005, 'BARO +', { kind: 'mom' }), T('masterArm', 0.09, -0.005, 'MASTER ARM', { opts: ['SAFE', 'ARM'], guard: 1 }), T('laser', 0.165, -0.005, 'LASER'), T('wpn', 0.245, -0.005, 'WPN', { opts: ['GUN', 'RKT', 'MSL'] })], sections: [] };
    return [lc, rc, ip];
  }

  let PM = null;
  function pm() { if (PM) return PM; const lit = m => { m.emissive = m.color.clone(); m.emissiveIntensity = 0.4; return m; }; PM = { base: lit(new T3.MeshPhongMaterial({ color: 0x8b8f92, shininess: 80, specular: 0x999999 })), bat: lit(new T3.MeshPhongMaterial({ color: 0xd9dcde, shininess: 110, specular: 0xffffff })), arm: lit(new T3.MeshPhongMaterial({ color: 0x6a6f73, shininess: 50, specular: 0x777777 })),
    black: lit(new T3.MeshPhongMaterial({ color: 0x1a1c1e, shininess: 40, specular: 0x444444 })), knobs: [], hit: new T3.MeshBasicMaterial({ visible: false }), guard: new T3.MeshPhongMaterial({ color: 0xd22a1a, transparent: true, opacity: 0.72, shininess: 90, side: T3.DoubleSide }), ring: new T3.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95, side: T3.DoubleSide, depthTest: false }) }; return PM; }

  function panelTexture(def) {
    const s = 2048 / Math.max(def.w, def.h), W = Math.round(def.w * s), H = Math.round(def.h * s), c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const X = u => (u + def.w / 2) * s, Y = v => (def.h / 2 - v) * s;
    x.fillStyle = '#25282b'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { x.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '255,255,255' : '0,0,0') + ',0.035)'; x.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    x.strokeStyle = '#8f979c'; x.lineWidth = Math.max(2, 0.0012 * s); x.textAlign = 'center'; x.textBaseline = 'middle';
    (def.sections || []).forEach(([t, u0, v0, u1, v1]) => { x.strokeRect(X(u0), Y(v1), (u1 - u0) * s, (v1 - v0) * s); x.font = `700 ${0.01 * s}px Arial, sans-serif`; const tw = x.measureText(t).width + 0.01 * s; x.fillStyle = '#25282b'; x.fillRect(X((u0 + u1) / 2) - tw / 2, Y(v1) - 0.006 * s, tw, 0.012 * s); x.fillStyle = '#aeb6bb'; x.fillText(t, X((u0 + u1) / 2), Y(v1)); });
    def.items.forEach(it => {
      const lev = it.kind === 'lever', n = (it.opts || ['OFF', 'ON']).length, on = def.on, tr = lev ? (it.big ? 0.062 : 0.05) : 0.027;
      x.fillStyle = '#f2f4f5'; x.font = `700 ${(def.w < 0.3 ? 0.0092 : 0.0125) * s}px Arial, sans-serif`;
      const ly = it.kind === 'btn' || it.kind === 'mom' ? it.v + 0.03 : it.kind === 'thandle' ? it.v + 0.04 : it.v + tr + (lev ? 0.034 : 0.024) + (on > 0 ? 0.012 : 0.0) + (on < 0 ? 0.012 : 0);
      x.fillText(it.label, X(it.u), Y(Math.min(ly, def.h / 2 - 0.009)));
      if (it.kind === 'tog' || lev) { // position legends beside the travel
        x.font = `700 ${(def.w < 0.3 ? 0.0072 : 0.0088) * s}px Arial, sans-serif`; x.fillStyle = '#c9d0d4'; const o = it.opts || ['OFF', 'ON'];
        o.forEach((name, i) => { const f = n === 1 ? 0 : (i / (n - 1) * 2 - 1); if (lev) { x.textAlign = 'left'; x.fillText(name, X(it.u + 0.021), Y(it.v + f * tr * on)); x.textAlign = 'center'; x.fillRect(X(it.u + 0.012), Y(it.v + f * tr * on) - 1.5, 0.006 * s, 3); } else x.fillText(name, X(it.u), Y(it.v + f * (tr + 0.006) * on)); });
        if (lev) { x.fillStyle = '#0b0c0d'; x.fillRect(X(it.u) - 0.004 * s, Y(it.v + tr) , 0.008 * s, tr * 2 * s); }
      }
    });
    const t = new T3.CanvasTexture(c); t.anisotropy = 8; return t;
  }

  // Build one panel into parent. frame: {pos:[x,y,z], u:[..], v:[..]} gives where the panel plane sits.
  function buildPanel(def, frame, parent, cp) {
    pm(); const g = new T3.Group(), U = new T3.Vector3().fromArray(frame.u).normalize(), V = new T3.Vector3().fromArray(frame.v).normalize(), N = new T3.Vector3().crossVectors(U, V).normalize();
    g.matrix.makeBasis(U, V, N).setPosition(frame.pos[0], frame.pos[1], frame.pos[2]); g.matrixAutoUpdate = false; parent.add(g);
    const tex = panelTexture(def), mat = new T3.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }); cp.panelMats.push(mat);
    const face = new T3.Mesh(new T3.PlaneGeometry(def.w, def.h), mat); face.receiveShadow = true; g.add(face);
    const back = new T3.Mesh(new T3.BoxGeometry(def.w + 0.02, def.h + 0.02, 0.03), S.M.panel); back.position.z = -0.0155; g.add(back);
    const P = { def, group: g, center: new T3.Vector3().fromArray(frame.pos), parent }; cp.panels[def.key] = P;
    def.items.forEach(it => {
      const c = { it, def, val: 0, pos: 0, press: 0, open: 0 }, grp = new T3.Group(); grp.position.set(it.u, it.v, 0); g.add(grp); const n = (it.opts || ['OFF', 'ON']).length; c.n = n;
      const HW = def.hit || 0.07; let hw = HW, hh = 0.1;
      if (it.kind === 'tog') { grp.add(cyl(0.0095, 0.011, 0.007, PM.base, 0, 0, 0.0035)); const p = new T3.Group(); p.position.z = 0.005; const bat = cyl(0.0058, 0.0036, 0.032, PM.bat, 0, 0, 0.016); p.add(bat, sph(0.0058, PM.bat, 0, 0, 0.032)); grp.add(p); c.pivot = p; }
      else if (it.kind === 'lever') { const L = it.big ? 0.1 : 0.08; const p = new T3.Group(); p.position.z = -0.01; p.add(cyl(0.005, 0.005, L, PM.arm, 0, 0, L / 2), boxm(it.big ? 0.036 : 0.028, 0.03, 0.03, knob(it.knob || 0x2a2a2a), 0, 0, L + 0.01)); grp.add(p); c.pivot = p; c.L = L; hw = Math.min(HW, 0.075); hh = it.big ? 0.19 : 0.15; }
      else if (it.kind === 'btn') { c.mat = new T3.MeshBasicMaterial({ color: 0x15191b }); c.cap = boxm(0.03, 0.03, 0.012, c.mat, 0, 0, 0.006); grp.add(boxm(0.036, 0.036, 0.004, PM.black, 0, 0, 0.002), c.cap); hh = 0.085; }
      else if (it.kind === 'mom') { c.cap = cyl(0.012, 0.012, 0.012, PM.black, 0, 0, 0.006); grp.add(cyl(0.016, 0.016, 0.004, PM.base, 0, 0, 0.002), c.cap); hh = 0.085; }
      else if (it.kind === 'thandle') { const p = new T3.Group(); const stripe = knob(0xd9a400); p.add(cyl(0.005, 0.005, 0.03, PM.arm, 0, 0, 0.015), boxm(0.05, 0.014, 0.014, stripe, 0, 0, 0.034), boxm(0.012, 0.0145, 0.0145, PM.black, -0.013, 0, 0.034), boxm(0.012, 0.0145, 0.0145, PM.black, 0.013, 0, 0.034)); grp.add(p); c.pull = p; hh = 0.075; }
      if (it.guard) { const gd = new T3.Group(); gd.position.set(0, 0.024, 0.004); const cov = boxm(0.044, 0.05, 0.03, PM.guard, 0, -0.025, 0.015); gd.add(cov); grp.add(gd); c.guard = gd; }
      c.reach = Math.max(hw, hh) * 0.55; cp.hits.push(c);
      const ring = new T3.Mesh(new T3.RingGeometry(Math.max(hw, hh) * 0.5, Math.max(hw, hh) * 0.5 + 0.006, 28), PM.ring); ring.position.z = 0.002; ring.visible = false; ring.renderOrder = 30; grp.add(ring); c.ring = ring; c.grp = grp;
      cp.ctl[it.id] = c;
    });
    return P;
  }
  const knob = c => { const m = new T3.MeshPhongMaterial({ color: c, shininess: 40 }); m.emissive = m.color.clone(); m.emissiveIntensity = 0.4; PM.knobs.push(m); return m; };
  const cyl = (r1, r2, l, m, x, y, z) => { const g = new T3.CylinderGeometry(r2, r1, l, 14); g.rotateX(Math.PI / 2); const o = new T3.Mesh(g, m); o.position.set(x, y, z); return o; };
  const sph = (r, m, x, y, z) => { const o = new T3.Mesh(new T3.SphereGeometry(r, 12, 8), m); o.position.set(x, y, z); return o; };
  const boxm = (w, h, d, m, x, y, z) => { const o = new T3.Mesh(new T3.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

  // Called from the cockpit builder. P is the tilted instrument-panel group.
  S.buildPanels = (cp, spec, tandem, g, P) => {
    const [ex, ey, ez] = spec.eye; cp.ctl = {}; cp.hits = []; cp.panels = {}; cp.panelMats = []; cp.views = { front: { yaw: 0, pitch: -0.16, fov: 64 } };
    const defs = tandem ? layoutTandem() : layoutSideBySide(spec);
    if (!tandem) { const t = 0.13;
      buildPanel(defs[0], { pos: [0, ey + 0.655, ez - 0.3], u: [1, 0, 0], v: [0, Math.sin(t), Math.cos(t)] }, g, cp);
      buildPanel(defs[1], { pos: [0, ey - 0.803, ez - 0.05], u: [1, 0, 0], v: [0, 0, -1] }, g, cp);
      buildPanel(defs[2], { pos: [0, -0.19, 0.003], u: [1, 0, 0], v: [0, 1, 0] }, P, cp);
    } else {
      buildPanel(defs[0], { pos: [-0.43, ey - 0.595, ez - 0.02], u: [1, 0, 0], v: [0, 0, -1] }, g, cp);
      buildPanel(defs[1], { pos: [0.43, ey - 0.595, ez - 0.02], u: [1, 0, 0], v: [0, 0, -1] }, g, cp);
      buildPanel(defs[2], { pos: [0, -0.2, 0.003], u: [1, 0, 0], v: [0, 1, 0] }, P, cp);
    }
    // camera presets that look straight at each panel from the pilot's eye
    g.updateMatrixWorld(true); const eye = new T3.Vector3(ex, ey, ez), tmp = new T3.Vector3(), inv = new T3.Matrix4().copy(g.matrixWorld).invert();
    cp.order = ['front'];
    Object.values(cp.panels).forEach(p => { p.group.updateMatrixWorld(true); tmp.set(0, 0, 0).applyMatrix4(p.group.matrixWorld).applyMatrix4(inv); const d = tmp.clone().sub(eye), dist = d.length();
      p.U = new T3.Vector3(1, 0, 0).transformDirection(p.group.matrixWorld).transformDirection(inv); p.V = new T3.Vector3(0, 1, 0).transformDirection(p.group.matrixWorld).transformDirection(inv);
      cp.views[p.def.key] = { tgt: tmp.clone(), U: p.U, V: p.V, up: p.V, dist, fov: clamp(2 * Math.atan(Math.max(p.def.h * 0.42, p.def.w * 0.3) / dist) * S.R2D, 16, 46), name: p.def.name }; cp.order.push(p.def.key); });
    cp.views.front.name = 'Front'; cp.where = id => cp.ctl[id] ? cp.ctl[id].def.key : null;
    // a view aimed at one particular control, so it sits in the clear middle of the screen
    cp.viewFor = id => { const c = cp.ctl[id]; if (!c) return null; g.updateMatrixWorld(true); const gi = new T3.Matrix4().copy(g.matrixWorld).invert(), p = c.grp.localToWorld(new T3.Vector3(0, 0, 0)).applyMatrix4(gi), base = cp.views[c.def.key];
      return { tgt: p, U: base.U, V: base.V, up: base.V, dist: p.distanceTo(eye), fov: Math.min(base.fov, 27), name: base.name }; };
  };

  // Keep every control showing the aircraft's real state; animate movement, guards and highlight rings.
  S.updatePanels = (cp, sys, heli, dt, night) => {
    const sw = sys.sw, now = performance.now(), k = Math.min(1, dt * 16 + 0.02);
    const nt = S.sky ? S.sky.night : 0, lit = sys.dc && sw.panelLt, glow = S.lerp(0.62, lit ? 0.62 : 0.035, nt), kg = S.lerp(0.42, lit ? 0.3 : 0.02, nt); cp.panelMats.forEach(m => { m.emissiveIntensity = glow; });
    PM.base.emissiveIntensity = PM.bat.emissiveIntensity = PM.arm.emissiveIntensity = PM.black.emissiveIntensity = kg; PM.knobs.forEach(m => { m.emissiveIntensity = kg; });
    for (const id in cp.ctl) { const c = cp.ctl[id], it = c.it, on = c.def.on;
      let v = sw[id] != null ? sw[id] : 0; if (id === 'start1') v = sys.eng[0].starter ? 1 : 0; if (id === 'start2') v = sys.eng[1].starter ? 1 : 0;
      c.val = v; c.pos += (v - c.pos) * k;
      if (it.kind === 'tog') c.pivot.rotation.x = -(c.n === 2 ? (c.pos * 2 - 1) : (c.pos - 1)) * 0.5 * on;
      else if (it.kind === 'lever') c.pivot.rotation.x = -(c.n === 2 ? (c.pos * 2 - 1) : (c.pos - 1)) * (it.big ? 0.55 : 0.52) * on;
      else if (it.kind === 'btn') { c.mat.color.setHex(v && sys.dc ? 0x39e07a : 0x15191b); c.cap.position.z = v ? 0.004 : 0.006; }
      else if (it.kind === 'mom') { const dn = c.press > now || ((id === 'start1' || id === 'start2') && v); c.cap.position.z = dn ? 0.002 : 0.006; }
      else if (it.kind === 'thandle') c.pull.position.z = c.pos * 0.035;
      if (c.guard) c.guard.rotation.x += ((c.open > now ? -1.9 : 0) - c.guard.rotation.x) * k;
      if (c.ring.visible) c.ring.scale.setScalar(1 + 0.14 * Math.sin(now / 130));
    }
  };
  S.highlightControls = (cp, ids) => { for (const id in cp.ctl) cp.ctl[id].ring.visible = !!ids && ids.includes(id); };

  // A tap landed on a control. localY is where on the control it landed (panel v direction).
  S.operateControl = (c, localY, game) => {
    const it = c.it, id = it.id, sys = game.sys, h = game.heli, now = performance.now(), U = S.ui;
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } S.audio.click && S.audio.click();
    if (c.guard && !(c.open > now)) { c.open = now + 4500; return sys.say(it.label + ': guard up, tap again'); }
    if (it.kind === 'mom') { c.press = now + 180;
      if (id === 'hdgM' || id === 'hdgP') { h.hdgBug = S.wrap360(Math.round(h.hdgBug) + (id === 'hdgP' ? 10 : -10)); return sys.say('Heading bug ' + String(Math.round(h.hdgBug)).padStart(3, '0')); }
      if (id === 'hdgS') { h.hdgBug = Math.round(h.out.hdg); return sys.say('Heading bug synced ' + String(h.hdgBug).padStart(3, '0')); }
      if (id === 'baroM' || id === 'baroP') { S.baroSet += id === 'baroP' ? 1 : -1; return sys.say('Altimeter ' + S.baroSet + ' hPa'); }
      if (id === 'baroS') { S.baroSet = Math.round(S.env.qnh); return sys.say('Altimeter set ' + S.baroSet + ' hPa'); }
      return U.setSw(id, 1); }
    const cur = sys.sw[id] || 0; let v;
    if (c.n === 2) v = cur ? 0 : 1; else { const up = (localY * c.def.on) > 0; v = clamp(cur + (up ? 1 : -1), 0, c.n - 1); if (v === cur) v = clamp(cur + (up ? -1 : 1), 0, c.n - 1); }
    U.setSw(id, v); const o = it.opts || ['OFF', 'ON']; if (sys.sw[id] === v) sys.say(it.label + ': ' + o[v]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
