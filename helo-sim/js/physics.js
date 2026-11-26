/* Helicopter flight model. Six degrees of freedom, blade-element thrust with dynamic inflow, momentum-theory power,
   translational lift, ground effect, vortex ring state, retreating-blade limits, autorotation, tail rotor, tandem rotors,
   wheel contact on real terrain, sling load pendulum, and the SAS / FPS / hold-mode control laws. */
(function (root) {
  const S = root.SIM, T3 = root.THREE, clamp = S.clamp, G = S.G;
  const V = () => new T3.Vector3();
  const t1 = V(), t2 = V(), t3 = V(), t4 = V(), t5 = V(), qi = new T3.Quaternion(), dq = new T3.Quaternion();

  class Heli {
    constructor(spec, sys) {
      this.s = spec; this.sys = sys; this.pos = V(); this.vel = V(); this.q = new T3.Quaternion(); this.w = V();
      this.vi = 8; this.payload = 0; this.load = null; this.crashed = null; this.onGround = false; this.contact = [];
      this.trimP = 0; this.trimR = 0; this.iLon = 0; this.iLat = 0; this.iPed = 0; this.hdgRef = null; this.altRef = 0; this.iasRef = 0; this.hdgBug = 0; this.iColl = 0;
      this.eff = { lon: 0, lat: 0, ped: 0, coll: 0 }; this.out = { T: 0, Preq: 0, nz: 1, ias: 0, vs: 0, agl: 0, pitch: 0, roll: 0, hdg: 0, slip: 0, gs: 0, vrs: 0, stall: 0, tas: 0, maxG: 1, lastTouch: 0 };
      this._anc = []; this._ancOn = []; this.ammo = { gun: 1200, rkt: 38, msl: 8 }; this.damage = 0; this.brake = 0; this.navBrg = null;
    }
    mass() { return this.s.empty + this.s.crew + this.sys.fuelTotal() + this.payload; }
    attitude() {
      const f = t1.set(0, 0, -1).applyQuaternion(this.q), o = this.out;
      o.hdg = S.wrap360(Math.atan2(f.x, -f.z) * S.R2D); o.pitch = Math.asin(clamp(f.y, -1, 1));
      const r = t2.set(1, 0, 0).applyQuaternion(this.q), u = t3.set(0, 1, 0).applyQuaternion(this.q);
      o.roll = Math.atan2(-r.y, u.y); return o;
    }
    place(x, y, z, hdgDeg) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.w.set(0, 0, 0); this.q.setFromAxisAngle(t1.set(0, 1, 0), -hdgDeg * S.D2R); this.hdgRef = null; this.trimP = 0; this.trimR = 0; this.iLon = this.iLat = this.iPed = 0; this.crashed = null; this.damage = 0; this.grace = 2.5; this.contact.length = 0; this._ancOn.length = 0; }
    setTrim() { const o = this.attitude(); this.trimP = o.pitch; this.trimR = o.roll; }

    // ---- flight-control computers: turn pilot inputs into rotor commands ----
    afcs(dt, c) {
      const sys = this.sys, sw = sys.sw, o = this.attitude(), e = this.eff, w = this.w, air = !this.onGround;
      let lon = c.lon, lat = c.lat, ped = c.ped, coll = c.coll;
      const vb = t4.copy(this.vel).sub(this._wind || t5.set(0, 0, 0)).applyQuaternion(qi.copy(this.q).invert()), fwd = -vb.z;
      if (sys.fpsOK) {
        // attitude command / attitude hold about the trimmed attitude
        let pc = this.trimP - c.lon * 0.52, rc = this.trimR + c.lat * 0.85 - (air ? clamp((this._Ttr || 0) / (this.mass() * G), -0.08, 0.08) : 0); // mixing unit offsets tail-rotor drift
        if (sw.iasHold && air) { const de = o.ias - this.iasRef; pc = clamp(this.trimP + 0.02 * de, -0.35, 0.35) - c.lon * 0.3; this.trimP = clamp(this.trimP + clamp(de * 0.004, -0.02, 0.02) * dt, -0.3, 0.3); }
        let hb = null; if (sw.navMode && this.navBrg != null) hb = this.navBrg; else if (sw.hdgHold) hb = this.hdgBug;
        if (hb != null && air && fwd > 12) rc = clamp(S.wrap180(hb - o.hdg) * 0.035, -0.42, 0.42) + c.lat * 0.4;
        else if (air && fwd > 26) { // cruise heading hold with the stick centred, as the real FPS does
          if (Math.abs(c.lat) > 0.04 || this.crsRef == null || Math.abs(o.roll - this.trimR) > 0.09) this.crsRef = o.hdg;
          else rc += clamp(S.wrap180(this.crsRef - o.hdg) * 0.02, -0.1, 0.1);
        } else this.crsRef = null;
        const ep = o.pitch - pc, er = o.roll - rc;
        this.iLon = clamp(this.iLon + ep * 1.6 * dt, -0.9, 0.9); this.iLat = clamp(this.iLat + er * 1.2 * dt, -0.6, 0.6);
        if (!air) { this.iLon *= 1 - dt; this.iLat *= 1 - dt; }
        lon = clamp(4.2 * ep + 1.9 * w.x + this.iLon, -1, 1); lat = clamp(-(3.4 * er - 1.0 * w.z) - this.iLat, -1, 1);
        // yaw: heading hold / rate command at low speed, turn coordination in cruise
        const yr = -w.y;
        if (fwd < 26 || !air) {
          if (Math.abs(c.ped) > 0.04 || this.hdgRef == null || !air) this.hdgRef = o.hdg;
          const rcY = c.ped * 0.75, eh = S.wrap180(this.hdgRef - o.hdg) * S.D2R;
          this.iPed = clamp(this.iPed + (rcY - yr + eh * 1.2) * 1.3 * dt, -1, 1);
          ped = clamp(1.6 * (rcY - yr) + 2.2 * eh + this.iPed, -1, 1);
        } else {
          this.hdgRef = o.hdg; this.iPed = clamp(this.iPed + vb.x * 0.02 * dt, -1, 1);
          ped = clamp(c.ped * 0.6 + 0.05 * vb.x - 0.5 * yr + this.iPed, -1, 1);
        }
        if (sw.altHold && air) {
          const ev = clamp((this.altRef - this.pos.y) * 0.35, -5, 5) - this.vel.y;
          this.iColl = clamp(this.iColl + ev * 0.012 * dt, -0.5, 0.5); coll = clamp(this._collRef + 0.035 * ev + this.iColl, 0, 1);
          if (Math.abs(c.coll - this._collRef) > 0.12) { sw.altHold = 0; sys.say('ALT HOLD off: collective moved'); }
        }
      } else {
        this.hdgRef = null; this.iLon *= 1 - dt * 2; this.iLat *= 1 - dt * 2; this.iPed *= 1 - dt * 2;
        if (sys.sasOK) { lon = clamp(lon + 0.75 * w.x, -1, 1); lat = clamp(lat + 0.28 * w.z, -1, 1); ped = clamp(ped + 0.6 * w.y, -1, 1); }
      }
      if (!sw.altHold) { this._collRef = c.coll; this.altRef = this.pos.y; this.iColl = 0; }
      if (!sw.iasHold) this.iasRef = o.ias;
      // hydraulics: without boost the controls are heavy and slow
      const auth = sys.hydOK ? 1 : 0.3, rate = sys.hydOK ? 14 : 1.6, k = Math.min(1, dt * rate);
      e.lon += (lon * auth - e.lon) * k; e.lat += (lat * auth - e.lat) * k; e.ped += (ped * auth - e.ped) * k; e.coll += (coll - e.coll) * Math.min(1, dt * (sys.hydOK ? 10 : 2.5));
    }

    step(dt, c, env, terrain) {
      if (this.crashed) return; if (this.grace > 0) this.grace -= dt;
      const s = this.s, sys = this.sys, o = this.out, q = this.q, rhoA = S.atmo(this.pos.y, env), rho = rhoA.rho, m = this.mass();
      qi.copy(q).invert();
      const wind = this._wind || (this._wind = V()); env.windAt ? env.windAt(this.pos, wind, o.agl) : wind.set(0, 0, 0);
      this.afcs(dt, c);
      const e = this.eff, vb = t1.copy(this.vel).sub(wind).applyQuaternion(qi), w = this.w;
      const Om = Math.max(0.5, s.omega * sys.nr), vtip = Om * s.R, A = Math.PI * s.R * s.R * s.rotors, sig = s.nb * s.chord / (Math.PI * s.R), vref = s.omega * s.R;
      const speed = vb.length(), mux = -vb.z / vref, muy = vb.x / vref, mu = Math.hypot(vb.x, vb.z) / Math.max(vtip, 30);
      // ---- rotor disc tilt: cyclic, flap-back with speed, lag behind body rates ----
      const tand = s.tandem, cy = tand ? e.lat : 1;
      const tiltF = (tand ? e.lon * 0.35 : e.lon) * s.cyc - s.kb * mux + s.kd * w.x, tiltR = e.lat * s.cyc - s.kb * 0.6 * muy + s.kd * w.z;
      const n = t2.set(tiltR, 1, -tiltF).normalize();
      const Vc = vb.dot(n), Vin = Math.sqrt(Math.max(0, speed * speed - Vc * Vc));
      // ---- thrust: blade element with inflow, limited by blade stall ----
      const theta = s.th0 + e.coll * s.thR, lam = (Vc + this.vi) / Math.max(vtip, 20);
      let CT = sig * 5.73 / 2 * (theta / 3 * (1 + 1.5 * mu * mu) - lam / 2);
      const ctMax = sig * 0.165 * (1 - 0.5 * mu) * (1 - 0.3 * sys.ice); o.stall = CT > ctMax ? (CT - ctMax) / ctMax : 0; CT = clamp(CT, -0.3 * ctMax, ctMax);
      let T = CT * rho * A * vtip * vtip;
      const hub = this.pos.y + s.hubY - (this._gh || 0), ge = 1 + 0.16 * Math.pow(clamp(1 - hub / (2.4 * s.R), 0, 1), 2) * clamp(1 - Vin / 22, 0, 1);
      const vh = Math.sqrt(Math.max(T, m * G * 0.05) / (2 * rho * A));
      // vortex ring state: settling with power when descending into your own wash at low airspeed
      const dr = -Vc / vh, vrs = clamp((dr - 0.55) / 0.35, 0, 1) * clamp((1.7 - dr) / 0.4, 0, 1) * clamp(1 - Vin / (0.9 * vh), 0, 1) * (this.onGround ? 0 : 1);
      o.vrs = vrs; T *= ge * (1 - 0.45 * vrs);
      let v = this.vi; for (let i = 0; i < 3; i++) v = vh * vh / Math.sqrt(Vin * Vin + (Vc + v) * (Vc + v) + 0.02 * vh * vh);
      this.vi += (Math.min(v, 2.2 * vh) - this.vi) * Math.min(1, dt / 0.16);
      // ---- power ----
      const P0 = sig * 0.0105 / 8 * rho * A * vtip * vtip * vtip * (1 + 4.65 * mu * mu) * (1 + 1.2 * sys.ice + 0.5 * Math.min(o.stall, 1)), Pm = T * (Vc + 1.15 * this.vi) / ge + P0;
      let Ttr = 0, Ptr = 0; const tl = s.tail;
      if (tl) {
        const nr2 = sys.nr * sys.nr * rho / S.RHO0, vlat = vb.x + w.y * tl.l;
        Ttr = sys.fail.tr ? 0 : tl.Tmax * nr2 * (0.38 - 0.62 * e.ped) - 650 * vlat * sys.nr * rho;
        Ptr = Math.pow(Math.abs(Ttr), 1.5) / Math.sqrt(2 * rho * Math.PI * tl.R * tl.R) * 1.35 + 12e3 * sys.nr * sys.nr * sys.nr;
      }
      this._Ttr = Ttr; const Preq = (Pm + Ptr) / 0.97 + 45e3 * sys.nr * sys.nr * sys.nr;
      const Peng = sys.rotorStep(dt, Preq);
      o.T = T; o.Preq = Preq;
      // ---- forces and moments in body axes ----
      const F = (this._F || (this._F = V())).copy(n).multiplyScalar(T), M = (this._M || (this._M = V())).set(0, 0, 0), K = T * s.hubY + s.Kb * sys.nr * sys.nr;
      if (tand) {
        M.x += -T * e.lon * tand.dcp * tand.sep / 2 - K * tiltF * 0.4; M.z += -K * tiltR;
        M.y += -e.ped * T * tand.yaw * tand.sep / 2 - w.y * 90000 * sys.nr - vb.x * 0.5 * rho * Math.abs(vb.z) * 14;
        M.x += -w.x * 260000 * sys.nr + 0.5 * rho * Math.abs(vb.z) * vb.y * 40;
      } else { M.x += -K * tiltF; M.z += -K * tiltR; }
      // fuselage drag
      const hr = 0.5 * rho;
      F.x -= hr * s.f[0] * Math.abs(vb.x) * vb.x; F.y -= hr * s.f[1] * Math.abs(vb.y) * vb.y; F.z -= hr * s.f[2] * Math.abs(vb.z) * vb.z * (1 + (this.load && this.load.on ? 0.25 : 0));
      if (tl) {
        // stabilator, fin, tail rotor, main-rotor torque reaction
        const u = Math.abs(vb.z), wt = vb.y - w.x * tl.l, vt = vb.x + w.y * tl.l;
        const L = -hr * tl.Sh * tl.ah * u * clamp(wt, -0.22 * u, 0.22 * u), Y = -hr * tl.Sv * tl.av * u * clamp(vt, -0.3 * u, 0.3 * u);
        F.y += L; M.x += -tl.l * L; F.x += Y + Ttr; M.y += tl.l * (Y + Ttr); M.z += -Ttr * 1.2;
        M.y -= Peng / Om * 0.93;
      }
      // fuselage rate damping and vibration from stall / vortex ring / translational lift
      M.x -= w.x * s.I[0] * 0.35; M.y -= w.y * s.I[1] * 0.25; M.z -= w.z * s.I[2] * 0.5;
      const shake = (o.stall * 3 + vrs * 2.2 + (Vin > 6 && Vin < 12 && !this.onGround ? 0.12 : 0) + clamp((speed - s.vne) / 8, 0, 2)) * sys.nr;
      if (shake > 0.01) { M.x += (Math.random() - 0.5) * shake * s.I[0] * 1.6; M.z += (Math.random() - 0.5) * shake * s.I[2] * 2.2; F.y += (Math.random() - 0.5) * shake * m * 4; }
      o.shake = shake; if (speed > s.vne) M.x += (speed - s.vne) * s.I[0] * 0.02;
      const Fw = (this._Fw || (this._Fw = V())).copy(F).applyQuaternion(q); Fw.y -= m * G;
      const Mw = this._Mw || (this._Mw = V()); Mw.set(0, 0, 0);
      this.ground(dt, terrain, Fw, Mw, m);
      if (this.load && this.load.on) this.sling(dt, env, terrain, Fw, Mw, wind);
      // ---- integrate ----
      const ax = Fw.x / m, ay = Fw.y / m, az = Fw.z / m; o.nz = (ay + G) / G; if (!this.onGround) o.maxG = Math.max(o.maxG, o.nz);
      this.vel.x += ax * dt; this.vel.y += ay * dt; this.vel.z += az * dt; this.pos.addScaledVector(this.vel, dt);
      M.add(Mw.applyQuaternion(qi));
      const I = s.I, gx = (I[1] - I[2]) * w.y * w.z, gy = (I[2] - I[0]) * w.z * w.x, gz = (I[0] - I[1]) * w.x * w.y;
      w.x += (M.x + gx) / I[0] * dt; w.y += (M.y + gy) / I[1] * dt; w.z += (M.z + gz) / I[2] * dt;
      const wm = w.length(); if (wm > 1e-7) { dq.setFromAxisAngle(t1.copy(w).multiplyScalar(1 / wm), wm * dt); q.multiply(dq).normalize(); }
      // ---- outputs ----
      this.attitude(); const va = t1.copy(this.vel).sub(wind);
      o.tas = va.length(); o.vs = this.vel.y; o.gs = Math.hypot(this.vel.x, this.vel.z);
      const vbb = t2.copy(va).applyQuaternion(qi.copy(q).invert()), cas = Math.max(0, -vbb.z) * Math.sqrt(rho / S.RHO0);
      o.ias = cas * (1 - sys.pitotIce); o.fwd = -vbb.z; o.slip = vbb.x; o.trk = S.wrap360(Math.atan2(this.vel.x, -this.vel.z) * S.R2D);
      o.agl = this.pos.y - (this._gh || 0) + (s.gear[0][1]);
    }

    // ---- wheels and fuselage against the terrain ----
    ground(dt, terrain, Fw, Mw, m) {
      const s = this.s, q = this.q, pts = s.gear, nb = s.body.length; let any = false;
      const gh = terrain.height(this.pos.x, this.pos.z); this._gh = gh;
      if (this.pos.y - gh > 12) { this.onGround = false; this.contact.length = 0; this._ancOn.length = 0; return; }
      const k = m * G / (pts.length * 0.16), cd = 2 * Math.sqrt(k * m / pts.length) * 0.75;
      const fwd = t1.set(0, 0, -1).applyQuaternion(q), brk = this.sys.sw.pbrake || this.brake > 0.5;
      for (let i = 0; i < pts.length + nb + 4; i++) {
        let px, py, pz, kind = 0;
        if (i < pts.length) { px = pts[i][0]; py = pts[i][1]; pz = pts[i][2]; }
        else if (i < pts.length + nb) { const b = s.body[i - pts.length]; px = b[0]; py = b[1]; pz = b[2]; kind = 1; }
        else { const j = i - pts.length - nb, a = j * Math.PI / 2; px = Math.cos(a) * s.R * 0.97; pz = Math.sin(a) * s.R * 0.97 + (s.tandem ? (j % 2 ? 0 : 0) : 0); py = s.hubY - 0.2; kind = 2; }
        const r = t2.set(px, py, pz).applyQuaternion(q), wx = this.pos.x + r.x, wy = this.pos.y + r.y, wz = this.pos.z + r.z;
        const h = terrain.height(wx, wz), pen = h - wy;
        if (pen <= 0) { this.contact[i] = false; this._ancOn[i] = false; continue; }
        const vp = t3.copy(this.w).applyQuaternion(q).cross(r).add(this.vel);
        if (kind === 2) { if (this.sys.nr > 0.3) return this.crash('Rotor blades struck the ground'); continue; }
        const hx = terrain.height(wx + 1.5, wz) - h, hz = terrain.height(wx, wz + 1.5) - h, nrm = t4.set(-hx / 1.5, 1, -hz / 1.5).normalize();
        const vn = vp.dot(nrm);
        if (!this.contact[i] && this.grace > 0) this.contact[i] = true;
        if (!this.contact[i]) {
          this.contact[i] = true; this.out.lastTouch = -vn;
          const lim = kind === 1 ? 2.5 : 6.5;
          if (-vn > lim || (kind === 0 && Math.hypot(vp.x, vp.z) > 45)) return this.crash(kind === 1 ? 'Fuselage hit the ground' : 'Landed too hard: ' + Math.round(-vn * 196.85) + ' ft/min');
          if (kind === 0 && -vn > 3.6) { this.damage += 0.34; this.sys.say('HARD LANDING: ' + Math.round(-vn * 196.85) + ' ft/min, gear damaged'); if (this.damage >= 1) return this.crash('Landing gear collapsed'); }
        }
        any = true;
        const Fn = Math.min(Math.max(0, k * (kind ? 2 : 1) * pen - cd * vn), m * G * (this.grace > 0 ? 1.2 : 30));
        const tv = t5.copy(vp).addScaledVector(nrm, -vn);
        // split sliding velocity into rolling and sideways parts for wheels
        const fl = (this._f1 || (this._f1 = V())).copy(fwd).addScaledVector(nrm, -fwd.dot(nrm)).normalize();
        const vf = tv.dot(fl), side = (this._f2 || (this._f2 = V())).copy(tv).addScaledVector(fl, -vf), vs = side.length();
        // static friction: each contact keeps an anchor it is sprung to, and slips when the grip limit is passed.
        // An unbraked wheel lets its anchor roll freely along the wheel's direction.
        const an = this._anc[i] || (this._anc[i] = V()); if (!this._ancOn[i]) { an.set(wx, wy, wz); this._ancOn[i] = true; }
        const rolling = kind === 0 && !brk, muS = kind ? 0.6 : 0.85, kt = k * 1.6, ct = cd * 0.9;
        const dd = (this._f3 || (this._f3 = V())).set(wx - an.x, wy - an.y, wz - an.z); dd.addScaledVector(nrm, -dd.dot(nrm));
        if (rolling) { const al = dd.dot(fl); an.addScaledVector(fl, al); dd.addScaledVector(fl, -al); }
        let gxF = -kt * dd.x - ct * (rolling ? side.x : tv.x), gyF = -kt * dd.y - ct * (rolling ? side.y : tv.y), gzF = -kt * dd.z - ct * (rolling ? side.z : tv.z);
        const gm = Math.hypot(gxF, gyF, gzF), gl = muS * Fn;
        if (gm > gl) { const sc = gl / gm; gxF *= sc; gyF *= sc; gzF *= sc; an.set(wx, wy, wz).addScaledVector(dd, -sc * 0.98); }
        const Ff = rolling ? -clamp(vf * m * 2, -0.025 * Fn, 0.025 * Fn) : 0;
        const Fx = nrm.x * Fn + fl.x * Ff + gxF, Fy = nrm.y * Fn + fl.y * Ff + gyF, Fz = nrm.z * Fn + fl.z * Ff + gzF;
        Fw.x += Fx; Fw.y += Fy; Fw.z += Fz;
        Mw.x += r.y * Fz - r.z * Fy; Mw.y += r.z * Fx - r.x * Fz; Mw.z += r.x * Fy - r.y * Fx;
      }
      this.onGround = any;
      const up = t1.set(0, 1, 0).applyQuaternion(q); if (any && up.y < 0.45) this.crash('Rolled over');
    }

    // ---- external load on a cable ----
    attachLoad(massKg, x, y, z) { this.load = { m: massKg, pos: new T3.Vector3(x, y, z), vel: V(), L: 9, on: false, tension: 0 }; }
    hookUp() { const l = this.load; if (!l) return false; const h = t1.fromArray(this.s.hook).applyQuaternion(this.q).add(this.pos); l.L = Math.max(4, h.distanceTo(l.pos) + 0.3); l.on = true; return true; }
    release() { if (this.load) { this.load.on = false; } }
    sling(dt, env, terrain, Fw, Mw, wind) {
      const l = this.load, r = t1.fromArray(this.s.hook).applyQuaternion(this.q), hx = this.pos.x + r.x, hy = this.pos.y + r.y, hz = this.pos.z + r.z;
      const d = t2.set(l.pos.x - hx, l.pos.y - hy, l.pos.z - hz), dist = d.length(); d.multiplyScalar(1 / Math.max(dist, 1e-3));
      const hv = t3.copy(this.w).applyQuaternion(this.q).cross(r).add(this.vel), rel = t4.copy(l.vel).sub(hv).dot(d);
      const kR = l.m * G / 0.22, cR = 2 * Math.sqrt(kR * l.m) * 0.5; let ten = 0;
      if (dist > l.L) ten = Math.max(0, kR * (dist - l.L) + cR * rel);
      l.tension = ten; if (ten > l.m * G * 4.5) { l.on = false; this.sys.say('SLING BROKE: load lost'); }
      Fw.x += d.x * ten; Fw.y += d.y * ten; Fw.z += d.z * ten;
      Mw.x += r.y * d.z * ten - r.z * d.y * ten; Mw.y += r.z * d.x * ten - r.x * d.z * ten; Mw.z += r.x * d.y * ten - r.y * d.x * ten;
      this.loadStep(dt, env, terrain, wind, d, ten);
    }
    loadStep(dt, env, terrain, wind, d, ten) {
      const l = this.load; if (!l) return; const rho = S.atmo(l.pos.y, env).rho;
      const ax = t5.set(0, -G, 0); if (d) ax.addScaledVector(d, -ten / l.m);
      const va = t4.copy(l.vel).sub(wind || t3.set(0, 0, 0)), sp = va.length(); ax.addScaledVector(va, -0.5 * rho * 2.6 * sp / l.m);
      const h = terrain.height(l.pos.x, l.pos.z) + 0.6;
      if (l.pos.y <= h) { l.pos.y = h; if (l.vel.y < 0) l.vel.y = 0; if (ax.y < 0) ax.y = 0; l.vel.x *= 1 - Math.min(1, dt * 6); l.vel.z *= 1 - Math.min(1, dt * 6); l.grounded = true; } else l.grounded = false;
      l.vel.addScaledVector(ax, dt); l.pos.addScaledVector(l.vel, dt);
    }
    crash(why) { this.crashed = why; this.vel.set(0, 0, 0); this.w.set(0, 0, 0); this.sys.say('CRASH: ' + why); }
  }
  S.Heli = Heli;
})(typeof window !== 'undefined' ? window : globalThis);
