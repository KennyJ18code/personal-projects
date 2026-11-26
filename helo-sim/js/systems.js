/* Aircraft systems: electrics, APU, fuel, engines, rotor drive, hydraulics, flight-control computers, failures.
   Every cockpit switch lives in sw{} and is read here or in physics.js, so flipping one has a consequence. */
(function (root) {
  const S = root.SIM, clamp = S.clamp;

  // Switch catalogue used to build the cockpit pages. kind: 2 = two-position, 3 = three-position, m = momentary push.
  S.SWITCHES = [
    { id: 'batt', page: 'ELEC', label: 'BATTERY', kind: 2 }, { id: 'apu', page: 'ELEC', label: 'APU', kind: 2, opts: ['OFF', 'RUN'] },
    { id: 'apuGen', page: 'ELEC', label: 'APU GEN', kind: 2 }, { id: 'gen1', page: 'ELEC', label: 'GEN 1', kind: 2 }, { id: 'gen2', page: 'ELEC', label: 'GEN 2', kind: 2 },
    { id: 'bkpPump', page: 'ELEC', label: 'BACKUP HYD PUMP', kind: 3, opts: ['OFF', 'AUTO', 'ON'] }, { id: 'boost', page: 'ELEC', label: 'HYD BOOST', kind: 2 },
    { id: 'pitot', page: 'ELEC', label: 'PITOT HEAT', kind: 2 }, { id: 'antiice1', page: 'ELEC', label: 'ENG 1 ANTI-ICE', kind: 2 }, { id: 'antiice2', page: 'ELEC', label: 'ENG 2 ANTI-ICE', kind: 2 },
    { id: 'fuelSel1', page: 'ENG', label: 'FUEL SEL 1', kind: 3, opts: ['OFF', 'DIR', 'XFD'] }, { id: 'fuelSel2', page: 'ENG', label: 'FUEL SEL 2', kind: 3, opts: ['OFF', 'DIR', 'XFD'] },
    { id: 'boost1', page: 'ENG', label: 'FUEL BOOST 1', kind: 2 }, { id: 'boost2', page: 'ENG', label: 'FUEL BOOST 2', kind: 2 },
    { id: 'ign', page: 'ENG', label: 'ENG IGNITION', kind: 2 }, { id: 'rbrake', page: 'ENG', label: 'ROTOR BRAKE', kind: 2, opts: ['OFF', 'ON'] },
    { id: 'start1', page: 'ENG', label: 'STARTER 1', kind: 'm' }, { id: 'start2', page: 'ENG', label: 'STARTER 2', kind: 'm' },
    { id: 'pcl1', page: 'ENG', label: 'PWR LEVER 1', kind: 3, opts: ['OFF', 'IDLE', 'FLY'] }, { id: 'pcl2', page: 'ENG', label: 'PWR LEVER 2', kind: 3, opts: ['OFF', 'IDLE', 'FLY'] },
    { id: 'fire1', page: 'ENG', label: 'FIRE HANDLE 1', kind: 2, opts: ['IN', 'PULL'], guard: true }, { id: 'fire2', page: 'ENG', label: 'FIRE HANDLE 2', kind: 2, opts: ['IN', 'PULL'], guard: true },
    { id: 'ext', page: 'ENG', label: 'FIRE BOTTLE', kind: 'm', guard: true },
    { id: 'sas1', page: 'AFCS', label: 'SAS 1', kind: 2 }, { id: 'sas2', page: 'AFCS', label: 'SAS 2', kind: 2 }, { id: 'trim', page: 'AFCS', label: 'TRIM', kind: 2 }, { id: 'fps', page: 'AFCS', label: 'FPS', kind: 2 },
    { id: 'altHold', page: 'AFCS', label: 'ALT HOLD', kind: 2 }, { id: 'iasHold', page: 'AFCS', label: 'IAS HOLD', kind: 2 }, { id: 'hdgHold', page: 'AFCS', label: 'HDG SEL', kind: 2 }, { id: 'navMode', page: 'AFCS', label: 'NAV (ROUTE)', kind: 2 },
    { id: 'pos', page: 'LIGHTS', label: 'POSITION', kind: 2 }, { id: 'acol', page: 'LIGHTS', label: 'ANTI-COLLISION', kind: 2 }, { id: 'land', page: 'LIGHTS', label: 'LANDING LIGHT', kind: 2 },
    { id: 'search', page: 'LIGHTS', label: 'SEARCH LIGHT', kind: 2 }, { id: 'panelLt', page: 'LIGHTS', label: 'PANEL LIGHTS', kind: 2 }, { id: 'nvg', page: 'LIGHTS', label: 'NVG GOGGLES', kind: 2 },
    { id: 'pbrake', page: 'MISC', label: 'PARKING BRAKE', kind: 2, opts: ['OFF', 'SET'] }, { id: 'hookArm', page: 'MISC', label: 'CARGO HOOK', kind: 2, opts: ['SAFE', 'ARMED'] },
    { id: 'hookRel', page: 'MISC', label: 'HOOK RELEASE', kind: 'm', guard: true },
    { id: 'masterArm', page: 'WPN', label: 'MASTER ARM', kind: 2, opts: ['SAFE', 'ARM'], guard: true }, { id: 'laser', page: 'WPN', label: 'LASER', kind: 2 },
    { id: 'wpn', page: 'WPN', label: 'WEAPON', kind: 3, opts: ['GUN', 'RKT', 'MSL'] }
  ];
  S.FAILURES = [['eng1', 'Engine 1 failure'], ['eng2', 'Engine 2 failure'], ['fire1', 'Engine 1 fire'], ['fire2', 'Engine 2 fire'], ['tr', 'Tail rotor failure'],
    ['hyd1', 'Hydraulic pump 1'], ['hyd2', 'Hydraulic pump 2'], ['gen1', 'Generator 1'], ['gen2', 'Generator 2'], ['leak', 'Fuel leak, tank 1'], ['chip', 'Transmission chip'], ['sas', 'Flight computer']];

  const mkEng = () => ({ pmax: 0, ng: 0, tgt: 15, p: 0, lit: false, starter: false, hot: 0, dead: false, fire: false, fireT: 0, np: 0, oil: 0, tq: 0, ff: 0, cut: 0 });

  class Systems {
    constructor(spec) {
      this.s = spec; this.sw = {}; S.SWITCHES.forEach(d => { this.sw[d.id] = 0; });
      Object.assign(this.sw, { rbrake: 1, pbrake: 1, boost: 1, panelLt: 1 });
      this.eng = [mkEng(), mkEng()]; this.nr = 0; this.apuN = 0; this.batt = 1; this.fuel = [spec.fuelCap / 2, spec.fuelCap / 2];
      this.pEng = 0; this.fail = {}; this.cautions = []; this.ice = 0; this.otq = 0; this.bottles = 2; this.xmsnDead = false; this.chipT = 0;
      this.ac = false; this.dc = false; this.hydOK = false; this.sasOK = false; this.fpsOK = false; this.avionics = false; this.pitotIce = 0; this.ffTotal = 0; this.msgs = [];
    }
    say(m) { this.msgs.push(m); }
    setReady() {
      Object.assign(this.sw, { batt: 1, apu: 0, apuGen: 0, gen1: 1, gen2: 1, bkpPump: 1, boost: 1, pitot: 1, fuelSel1: 1, fuelSel2: 1, boost1: 1, boost2: 1, ign: 1, rbrake: 0, pcl1: 2, pcl2: 2,
        sas1: 1, sas2: 1, trim: 1, fps: 1, pos: 1, acol: 1, panelLt: 1 });
      this.eng.forEach(e => { e.ng = 90; e.lit = true; e.tgt = 600; e.np = 100; e.pmax = this.s.eng.P; }); this.nr = 1; this.pEng = this.s.eng.xmsn * 0.3;
    }
    press(id) { // momentary switches
      const sw = this.sw;
      if (id === 'start1' || id === 'start2') {
        const e = this.eng[id === 'start1' ? 0 : 1], o = this.eng[id === 'start1' ? 1 : 0];
        if (e.starter) { e.starter = false; return this.say('Starter ' + id.slice(-1) + ' aborted'); }
        if (!this.dc) return this.say('No DC power: turn on the battery');
        if (e.dead) return this.say('Engine ' + id.slice(-1) + ' is damaged and will not start');
        if (!(this.apuN > 0.95 || (o.lit && o.ng > 85))) return this.say('No start air: run the APU first');
        if (e.lit) return; e.starter = true;
      }
      if (id === 'ext') {
        if (this.bottles <= 0) return this.say('Fire bottles empty'); this.bottles--;
        let out = false; this.eng.forEach((e, i) => { if (e.fire && sw['fire' + (i + 1)]) { e.fire = false; this.fail['fire' + (i + 1)] = false; out = true; } });
        this.say(out ? 'Fire bottle discharged: fire out' : 'Fire bottle discharged');
      }
    }
    // Called every physics step with the power the rotor system is asking for. Returns shaft power delivered (W).
    rotorStep(dt, Preq) {
      const s = this.s, P1 = s.eng.P; let ref = 0, avail = 0; const cap = [0, 0];
      this.eng.forEach((e, i) => {
        if (!e.lit || e.ng < 58 || this.xmsnDead) return;
        const pcl = this.sw['pcl' + (i + 1)];
        if (pcl === 2) { cap[i] = e.pmax; ref = 1; } else if (pcl === 1) { cap[i] = 0.13 * P1; ref = Math.max(ref, 0.63); }
        avail += cap[i];
      });
      avail = Math.min(avail, s.eng.xmsn * 1.2 * Math.max(0.3, this.nr));
      const tgt = clamp(Preq + 7 * (ref - this.nr) * P1 * 2, 0, avail);
      this.pEng += (tgt - this.pEng) * Math.min(1, dt / 0.45);
      if (avail <= 0) this.pEng *= Math.max(0, 1 - dt * 4);
      let brake = 0; if (this.sw.rbrake) brake = 0.9e6 * this.nr + 60e3;
      const fric = 12e3 * this.nr + (this.nr < 0.05 ? 4e3 : 0), nrs = Math.max(this.nr, 0.05);
      let dn = (this.pEng - Preq - brake - fric) / (s.Irotor * s.omega * s.omega * nrs);
      this.nr = clamp(this.nr + dn * dt, 0, 1.3);
      if (this.sw.rbrake && this.nr < 0.03 && this.pEng < 0.3 * P1) this.nr = 0;
      const tot = cap[0] + cap[1];
      this.eng.forEach((e, i) => { e.p = tot > 0 ? this.pEng * cap[i] / tot : 0; e.tq = e.p / (s.eng.xmsn / 2 * Math.max(0.5, this.nr)) * 100; });
      return this.pEng;
    }
    step(dt, env, ctx) {
      const s = this.s, sw = this.sw, f = this.fail, P1 = s.eng.P, atm = S.atmo(ctx.alt, env), oat = atm.T;
      // ---- electrics ----
      const g1 = sw.gen1 && this.nr > 0.85 && !f.gen1, g2 = sw.gen2 && this.nr > 0.85 && !f.gen2, ga = sw.apuGen && this.apuN > 0.95;
      this.ac = !!(g1 || g2 || ga); this.dc = !!((sw.batt && this.batt > 0.02) || this.ac);
      if (this.ac) this.batt = Math.min(1, this.batt + dt / 1800); else if (sw.batt) this.batt = Math.max(0, this.batt - dt / (22 * 60) - (this.eng[0].starter || this.eng[1].starter ? dt / 240 : 0));
      this.avionics = this.dc; this.gens = [g1, g2, ga];
      // ---- APU ----
      const apuOK = sw.apu && this.dc && this.fuel[0] > 1 && !f.apu;
      if (apuOK && this.apuN < 0.01 && !this._apuSt) { this._apuSt = true; this.batt = Math.max(0, this.batt - 0.04); }
      if (!sw.apu) this._apuSt = false;
      this.apuN = clamp(this.apuN + (apuOK ? dt / 11 : -dt / 6), 0, 1);
      if (this.apuN > 0.3) this.fuel[0] = Math.max(0, this.fuel[0] - s.apuFF / 3600 * dt);
      // ---- hydraulics and flight computers ----
      const h1 = this.nr > 0.35 && !f.hyd1, h2 = this.nr > 0.35 && !f.hyd2, bk = this.ac && (sw.bkpPump === 2 || (sw.bkpPump === 1 && (!h1 || !h2)));
      this.hyd = [h1, h2, bk]; this.hydOK = !!((h1 || h2 || bk) && sw.boost);
      this.sasOK = !!(this.ac && this.hydOK && (sw.sas1 || sw.sas2) && !f.sas);
      this.fpsOK = !!(this.sasOK && sw.trim && sw.fps);
      if (!this.fpsOK) { sw.altHold && this.say('ALT HOLD dropped: FPS not available'); sw.altHold = sw.iasHold = sw.hdgHold = sw.navMode = 0; }
      // ---- icing ----
      const icing = ctx.inCloud && oat < 1 && oat > -22;
      this.ice = clamp(this.ice + (icing ? dt / 240 : -dt / 120), 0, 1);
      this.pitotIce = clamp(this.pitotIce + (icing && !(sw.pitot && this.ac) ? dt / 40 : -dt / 15), 0, 1);
      // ---- failures in progress ----
      if (f.leak) this.fuel[0] = Math.max(0, this.fuel[0] - 420 / 3600 * dt);
      if (f.chip) { this.chipT += dt * (this.pEng / s.eng.xmsn); if (this.chipT > 150 && !this.xmsnDead) { this.xmsnDead = true; this.say('TRANSMISSION FAILURE: drive to rotors lost'); } }
      // ---- engines ----
      const dens = Math.pow(atm.rho / S.RHO0, 0.85) * clamp(1 - 0.004 * (oat - (15 - 0.0065 * ctx.alt)), 0.8, 1.05);
      this.ffTotal = 0;
      this.eng.forEach((e, i) => {
        const n = i + 1, pcl = sw['pcl' + n], sel = sw['fuelSel' + n], tank = sel === 1 ? i : sel === 2 ? 1 - i : -1, o = this.eng[1 - i];
        if (f['eng' + n] && e.lit) { e.lit = false; e.dead = true; this.say('ENGINE ' + n + ' FAILED'); }
        if (f['fire' + n] && !e.fire) { e.fire = true; e.fireT = 0; this.say('FIRE: ENGINE ' + n); }
        const fuelOK = tank >= 0 && this.fuel[tank] > 0.5 && !sw['fire' + n];
        const air = this.apuN > 0.95 || (o.lit && o.ng > 85);
        if (e.starter && (!air || !this.dc || e.ng > 52)) e.starter = false;
        // light-off
        if (!e.lit && !e.dead && pcl >= 1 && fuelOK) {
          if (sw.ign && this.dc) {
            if (e.starter && e.ng >= 14) { e.lit = true; e.hot = 0; }
            else if (e.ng > 3 || e.starter) { e.lit = true; e.hot = 1; this.say('HOT START engine ' + n + ': power lever OFF now'); }
          }
        }
        if (e.lit && (!fuelOK || pcl === 0)) { e.cut += dt; if (e.cut > (pcl === 0 ? 0.3 : 1.5)) { e.lit = false; e.hot = 0; if (pcl !== 0) this.say('ENGINE ' + n + ' FLAMEOUT: no fuel'); } } else e.cut = 0;
        if (e.lit && this.ice > 0.6 && !(sw['antiice' + n] && this.ac) && Math.random() < dt / 50) { e.lit = false; this.say('ENGINE ' + n + ' FLAMEOUT: inlet ice'); }
        // gas generator speed
        let ngT = 0, rate = 5;
        if (e.lit) { const frac = clamp(e.p / P1, 0, 1.2); ngT = pcl === 2 ? 68 + 33 * Math.sqrt(frac) : 66; rate = e.ng < 60 ? 4.2 : 9; if (e.hot) { ngT = 40; rate = 3; } }
        else if (e.starter) { ngT = 24; rate = 3.2; }
        e.ng += clamp(ngT - e.ng, -rate * 1.6 * dt, rate * dt);
        // capability, temperature, fuel
        const iceLoss = (sw['antiice' + n] && this.ac) ? 0.97 : 1 - 0.25 * this.ice;
        e.pmax = e.lit && !e.hot && e.ng > 58 ? P1 * dens * iceLoss : 0;
        let tT = oat;
        if (e.lit) tT = e.hot ? 990 : oat + 430 + 400 * Math.pow(clamp(e.p / Math.max(1, P1 * dens), 0, 1.3), 0.9) + (e.ng < 60 ? 190 : 0);
        e.tgt += (tT - e.tgt) * Math.min(1, dt / (e.hot ? 1.2 : 2.5));
        if (e.hot && e.tgt > 900) { e.hot += dt; if (e.hot > 5) { e.lit = false; e.dead = true; e.hot = 0; this.say('ENGINE ' + n + ' DESTROYED by hot start'); } }
        if (e.fire) { e.fireT += dt; if (e.fireT > 45 && e.lit) { e.lit = false; e.dead = true; } if (e.fireT > 150) ctx.destroy && ctx.destroy('Engine fire spread to the airframe'); }
        e.ff = e.lit ? (s.eng.idleFF + s.eng.sfc * e.p / 1000) / 3600 : 0;
        if (tank >= 0) this.fuel[tank] = Math.max(0, this.fuel[tank] - e.ff * dt);
        this.ffTotal += e.ff;
        e.np = e.lit && pcl ? this.nr * 100 : Math.max(0, e.np - dt * 12);
        e.oil = clamp(e.ng * 0.9, 0, 75);
      });
      // rotor brake abuse and overtorque
      if (sw.rbrake && this.nr > 0.2 && (sw.pcl1 === 2 || sw.pcl2 === 2) && (this.eng[0].lit || this.eng[1].lit)) { this.otq += dt * 3; }
      const tq = this.eng[0].tq + this.eng[1].tq;
      const lit = (this.eng[0].lit ? 1 : 0) + (this.eng[1].lit ? 1 : 0), lim = lit === 1 ? 135 : 200;
      if (tq > lim * 1.02) this.otq += dt * (tq / lim - 1) * 1.2; else this.otq = Math.max(0, this.otq - dt * 0.02);
      if (this.otq > 10 && !this.xmsnDead) { this.xmsnDead = true; this.say('TRANSMISSION FAILURE from overtorque'); }
      // ---- caution panel ----
      const c = [], w = [];
      if (this.dc) {
        this.eng.forEach((e, i) => { if (e.fire) w.push('FIRE ENG ' + (i + 1)); });
        if (this.nr < 0.95 && !ctx.onGround) w.push('LOW ROTOR RPM');
        this.eng.forEach((e, i) => { if (!e.lit && (this.nr > 0.5 || !ctx.onGround)) w.push('ENG ' + (i + 1) + ' OUT'); });
        if (this.xmsnDead) w.push('XMSN FAIL');
        if (!g1) c.push('#1 GEN'); if (!g2) c.push('#2 GEN'); if (!h1) c.push('#1 HYD PUMP'); if (!h2) c.push('#2 HYD PUMP');
        if (!this.hydOK) c.push('BOOST SERVO OFF'); if (!this.sasOK) c.push('SAS OFF'); if (!this.fpsOK) c.push('TRIM/FPS OFF');
        if (this.fuel[0] < s.fuelCap * 0.07) c.push('#1 FUEL LOW'); if (this.fuel[1] < s.fuelCap * 0.07) c.push('#2 FUEL LOW');
        if ((!sw.boost1 && this.eng[0].lit) || (!sw.boost2 && this.eng[1].lit)) c.push('FUEL PRESS');
        if (f.chip) c.push('CHIP MAIN XMSN'); if (this.otq > 1) c.push('OVERTORQUE'); if (this.eng[0].tgt > 880 || this.eng[1].tgt > 880) c.push('TGT HIGH');
        if (this.ice > 0.15) c.push('ICE DETECTED'); if (this.pitotIce > 0.5) c.push('PITOT ICE'); if (this.batt < 0.25) c.push('BATT LOW');
        if (sw.rbrake) c.push('ROTOR BRAKE'); if (sw.pbrake) c.push('PARK BRAKE ON'); if (this.apuN > 0.9) c.push('APU ON'); if (sw.hookArm) c.push('HOOK ARMED');
        if (sw.masterArm) c.push('MASTER ARM'); if (f.tr) w.push('TAIL ROTOR');
      }
      this.cautions = c; this.warnings = w;
    }
    fuelTotal() { return this.fuel[0] + this.fuel[1]; }
  }
  S.Systems = Systems;
})(typeof window !== 'undefined' ? window : globalThis);
