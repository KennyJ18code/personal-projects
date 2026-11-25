/* Mission performance engine. Pure functions, no DOM. Units: lb, kt, nm, ft, deg C, hours. */
(function (root) {
  const R_NM = 3440.065, D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- geometry ----------
  function gcDist(a, b) {
    const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / D2R + 360) % 360;
  }
  function interp(a, b, f) {
    const d = gcDist(a, b) / R_NM;
    if (d < 1e-9) return { lat: a.lat, lon: a.lon };
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const p1 = a.lat * D2R, l1 = a.lon * D2R, p2 = b.lat * D2R, l2 = b.lon * D2R;
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: Math.atan2(y, x) / D2R };
  }
  function destPoint(a, brgDeg, distNm) {
    const d = distNm / R_NM, t = brgDeg * D2R, p1 = a.lat * D2R, l1 = a.lon * D2R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
    const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / D2R, lon: ((l2 / D2R + 540) % 360) - 180 };
  }

  // ---------- atmosphere ----------
  const isaTemp = pa => 15 - 1.98 * pa / 1000;
  const densityAlt = (pa, oat) => pa + 118.8 * (oat - isaTemp(pa));
  const sigma = da => Math.pow(Math.max(0.05, 1 - 6.8756e-6 * da), 4.2561);

  // ---------- airframe configuration ----------
  function config(af, mission) {
    const auxId = mission.aux && mission.aux[af.id];
    const aux = (af.aux || []).find(x => x.id === auxId) || null;
    return {
      aux,
      fuelCap: af.fuel + (aux ? aux.fuel : 0),
      ow: af.oew + af.crew + (aux ? aux.kit : 0),
      drag: 1 + (aux ? aux.drag : 0)
    };
  }
  // Max allowable gross weight at a density altitude.
  function weightLimit(af, da, o) {
    o = o || {};
    if (af.role === 'helo') {
      const base = o.sling ? (af.mgwExt || af.mgw) : af.mgw;
      if (o.air) return base;
      const oge = base * Math.min(1, sigma(da) / sigma(af.hogeDA));
      return (o.sling || o.oge) ? oge : Math.min(base, oge * 1.10); // ~10% in-ground-effect margin
    }
    if (o.air) return af.mgw;
    return af.mgw * clamp(1 - af.derate * Math.max(0, da - af.refDA) / 1000, 0.6, 1);
  }
  function burnRate(af, c, W, sling) {
    const burnAlt = af.burnAlt == null ? af.cruiseAlt : af.burnAlt;
    const alt = clamp(1 + af.altK * (burnAlt - af.cruiseAlt) / 1000, 0.7, 2);
    return af.burn * Math.pow(Math.max(0.3, W / af.burnRefW), af.burnExp) * alt * c.drag * (sling ? 1.08 : 1);
  }
  function reserveFuel(af, c, zfw, sling) {
    const t = af.reserveMin / 60;
    let r = burnRate(af, c, zfw, sling) * t;
    return burnRate(af, c, zfw + r, sling) * t;
  }
  // Ground fuel: engine start, run-up at idle, taxi out, plus a takeoff and climb allowance. Times can be set per waypoint.
  const mins = (v, d) => (v == null || v === '' || !isFinite(+v)) ? (d || 0) : Math.max(0, +v);
  function groundOut(af, wp) {
    const ru = mins(wp && wp.runup, af.runupMin), tx = mins(wp && wp.taxi, af.taxiOutMin);
    const o = { start: af.startFuel || 0, runup: (af.idleBurn || 0) * ru / 60, taxi: (af.taxiBurn || 0) * tx / 60, climb: af.climbFuel || 0, runupMin: ru, taxiMin: tx };
    o.ground = o.start + o.runup + o.taxi; o.total = o.ground + o.climb; return o;
  }
  function groundIn(af, wp) { return (af.taxiBurn || 0) * mins(wp && wp.taxiIn, af.taxiInMin) / 60; }
  function tas(af, sling) { return sling && af.slingSpeed ? Math.min(af.cruise, af.slingSpeed) : af.cruise; }
  function groundSpeed(v, course, wind) {
    if (!wind || !wind.spd) return v;
    const a = (wind.dir - course) * D2R, xw = wind.spd * Math.sin(a), hw = wind.spd * Math.cos(a);
    if (Math.abs(xw) >= v) return 0;
    return Math.sqrt(v * v - xw * xw) - hw;
  }

  // Fly a distance, burning fuel as weight comes off. Fuel may go negative so shortfalls can be measured.
  function flyLeg(af, c, zfw, fuel0, dist, gs, sling, d0, pts) {
    const time = dist / gs, n = Math.max(4, Math.ceil(time / 0.2)), dt = time / n;
    let fuel = fuel0;
    for (let s = 1; s <= n; s++) {
      fuel -= burnRate(af, c, zfw + Math.max(0, fuel), sling) * dt;
      if (pts) pts.push({ d: d0 + dist * s / n, fuel });
    }
    return { fuelEnd: fuel, burn: fuel0 - fuel, time };
  }

  const grounded = wp => wp.type !== 'turn' && wp.type !== 'aar';
  const isFuel = wp => wp.type === 'fuel' || wp.type === 'aar';

  // Resolve payload / sling carried on each leg (turn and AAR points inherit from the last landing).
  function legLoads(wps) {
    const out = []; let p = 0, s = false;
    for (let k = 0; k < wps.length - 1; k++) {
      if (k === 0 || grounded(wps[k])) { p = +wps[k].payload || 0; s = !!wps[k].sling; }
      out.push({ payload: p, sling: s });
    }
    return out;
  }

  function plan(af, mission, forcePolicy) {
    const wps = mission.wps, n = wps.length, c = config(af, mission);
    const policy = forcePolicy || mission.policy || 'full';
    const res = { af, cfg: c, legs: [], stops: [], warnings: [], profile: [], bingo: null, feasible: true,
      totals: { dist: 0, time: 0, burn: 0, uplift: 0, fuelStops: 0, phase: { start: 0, runup: 0, taxi: 0, climb: 0, cruise: 0, taxiIn: 0 } } };
    if (n < 2) { res.feasible = false; return res; }
    const loads = legLoads(wps);
    const geo = [];
    for (let k = 0; k < n - 1; k++) {
      const a = wps[k], b = wps[k + 1], dist = gcDist(a, b), mid = interp(a, b, 0.5);
      const crs = dist > 1 ? bearing(mid, b) : 0, v = tas(af, loads[k].sling), gs = groundSpeed(v, crs, mission.wind);
      geo.push({ dist, crs: dist > 1 ? bearing(a, b) : 0, tas: v, gs });
      if (gs < 20) { res.feasible = false; res.warnings.push({ lvl: 'warn', leg: k, msg: `Leg ${k + 1}: wind is too strong to make headway.` }); geo[k].gs = 20; }
    }
    const da = wps.map(w => densityAlt(+w.elev || 0, w.oat == null ? isaTemp(+w.elev || 0) : +w.oat));
    const zfw = k => c.ow + loads[k].payload;
    const limAt = (wi, k, air) => weightLimit(af, da[wi], { sling: loads[k].sling, oge: mission.requireOGE, air });

    // simulate wp i -> wp j starting with fuel F aboard (before start/taxi allowance)
    function sim(i, j, F, rec) {
      let fuel = F, d = rec ? rec.d0 : 0, td = F;
      for (let k = i; k < j; k++) {
        const dep = fuel; let go = null, tin = 0;
        if (grounded(wps[k])) { go = groundOut(af, wps[k]); fuel -= go.total; }
        if (rec) rec.pts.push({ d, fuel });
        const f0 = fuel, r = flyLeg(af, c, zfw(k), fuel, geo[k].dist, geo[k].gs, loads[k].sling, d, rec && rec.pts);
        fuel = td = r.fuelEnd; d += geo[k].dist;
        if (grounded(wps[k + 1])) { tin = groundIn(af, wps[k + 1]); fuel -= tin; if (rec && tin) rec.pts.push({ d, fuel }); }
        if (rec) rec.legs.push({ k, fuelDep: dep, fuelArr: td, fuelShut: fuel, burn: dep - fuel, cruise: f0 - td, go, tin, time: r.time });
      }
      return { end: fuel, td };
    }
    const resAt = j => reserveFuel(af, c, zfw(j - 1), loads[j - 1].sling);
    function required(i, j) {
      const need = resAt(j); let F = need + 1;
      for (let it = 0; it < 25; it++) {
        const short = need - sim(i, j, F).td;
        if (Math.abs(short) < 2) break;
        F += short * 1.02;
        if (F > 5e6) break;
      }
      return F;
    }

    // segments between fuel points
    let i = 0, arrFuel = 0, dCum = 0;
    while (i < n - 1) {
      let j = i + 1; while (j < n - 1 && !isFuel(wps[j])) j++;
      const wp = wps[i], air = wp.type === 'aar';
      if (air && !af.aar) res.warnings.push({ lvl: 'warn', wp: i, msg: `${wp.name}: ${af.name} is not set up as air-refuelable.` });
      const req = required(i, j), lim = limAt(i, i, air), gnd0 = grounded(wp) ? groundOut(af, wp).ground : 0, maxByWt = lim - zfw(i) + gnd0;
      let dep, short = false;
      if (req > c.fuelCap + 1) { dep = c.fuelCap; short = true; }
      else if (policy === 'min') dep = req;
      else dep = Math.max(req, Math.min(c.fuelCap, maxByWt));
      dep = Math.max(dep, Math.min(arrFuel, c.fuelCap));
      const trimmed = policy !== 'min' && !short && dep < c.fuelCap - 1 && dep >= arrFuel;
      const uplift = Math.max(0, dep - arrFuel);
      res.stops.push({ wp: i, type: i === 0 ? 'origin' : wp.type, arrFuel, depFuel: dep, uplift, required: Math.min(req, 9e6), short, trimmed });
      res.totals.uplift += uplift; if (i > 0) res.totals.fuelStops++;
      if (i > 0) res.profile.push({ d: dCum, fuel: arrFuel });
      const rec = { d0: dCum, pts: [], legs: [] };
      const end = sim(i, j, dep, rec);
      res.profile.push(...rec.pts);
      for (const L of rec.legs) {
        const k = L.k, g = geo[k];
        const depAir = !grounded(wps[k]), arrAir = !grounded(wps[k + 1]);
        const limDep = limAt(k, k, depAir), limArr = limAt(k + 1, k, arrAir);
        const gnd = L.go ? L.go.ground : 0, tow = zfw(k) + L.fuelDep - gnd, ldw = zfw(k) + Math.max(0, L.fuelArr);
        res.legs.push({ k, from: wps[k].name, to: wps[k + 1].name, dist: g.dist, crs: g.crs, tas: g.tas, gs: g.gs,
          time: L.time, fuelDep: L.fuelDep, fuelArr: L.fuelArr, burn: L.burn, payload: loads[k].payload, sling: loads[k].sling,
          tow, ldw, limDep, limArr, gnd, go: L.go, tin: L.tin, cruise: L.cruise, fuelShut: L.fuelShut, daDep: da[k], daArr: da[k + 1], reserve: resAt(k + 1), seg: i });
        res.totals.dist += g.dist; res.totals.time += L.time; res.totals.burn += L.burn;
        const P = res.totals.phase; P.cruise += L.cruise; P.taxiIn += L.tin; if (L.go) { P.start += L.go.start; P.runup += L.go.runup; P.taxi += L.go.taxi; P.climb += L.go.climb; }
      }
      if (short) {
        res.feasible = false;
        // find where fuel falls to the reserve level
        const need = resAt(j); let hit = null;
        for (let q = 1; q < rec.pts.length; q++) {
          const a = rec.pts[q - 1], b = rec.pts[q];
          if (a.fuel >= need && b.fuel < need && b.d > a.d) { hit = a.d + (b.d - a.d) * (a.fuel - need) / (a.fuel - b.fuel); break; }
        }
        if (hit == null) hit = dCum;
        let acc = dCum, k = i; while (k < j - 1 && acc + geo[k].dist < hit) { acc += geo[k].dist; k++; }
        const f = clamp((hit - acc) / Math.max(1, geo[k].dist), 0, 1), pos = interp(wps[k], wps[k + 1], f);
        const b = { leg: k, frac: f, d: hit, lat: pos.lat, lon: pos.lon, from: wp.name, short: req - c.fuelCap, distFromFuel: hit - dCum };
        if (!res.bingo) res.bingo = b;
        res.warnings.push({ lvl: 'warn', leg: k, msg: `Fuel required ${Math.round(hit - dCum)} nm after ${wp.name} (leg ${k + 1}). Tanks are ${Math.round(req - c.fuelCap).toLocaleString()} lb short of reaching ${wps[j].name} with reserve.` });
      }
      for (let k = i; k < j; k++) dCum += geo[k].dist;
      arrFuel = Math.max(0, end.end); res.landFuel = Math.max(0, end.td); res.shutFuel = arrFuel; i = j;
    }

    // weight checks
    for (const L of res.legs) {
      if (L.tow > L.limDep + 1) {
        res.feasible = false;
        res.warnings.push({ lvl: 'warn', leg: L.k, msg: `Leg ${L.k + 1}: ${Math.round(L.tow - L.limDep).toLocaleString()} lb over the weight limit leaving ${L.from}.` });
      }
      if (af.role === 'helo' && grounded(wps[L.k + 1]) && L.ldw > L.limArr + 1)
        res.warnings.push({ lvl: 'caution', leg: L.k, msg: `Leg ${L.k + 1}: arrival weight at ${L.to} is ${Math.round(L.ldw - L.limArr).toLocaleString()} lb over the hover limit there.` });
      const struct = L.sling ? af.hook : af.maxPayload;
      if (L.sling && !af.hook) res.warnings.push({ lvl: 'warn', leg: L.k, msg: `Leg ${L.k + 1}: ${af.name} has no cargo hook.` });
      else if (L.payload > struct + 1) res.warnings.push({ lvl: 'warn', leg: L.k, msg: `Leg ${L.k + 1}: payload is over the ${L.sling ? 'hook' : 'cabin'} limit of ${struct.toLocaleString()} lb.` });
    }
    return res;
  }

  // Full result: the plan as loaded plus payload headroom per leg based on minimum fuel.
  function analyze(af, mission) {
    const p = plan(af, mission), m = (mission.policy === 'min') ? p : plan(af, mission, 'min');
    p.legs.forEach((L, x) => {
      const M = m.legs[x], struct = L.sling ? af.hook : af.maxPayload;
      const ow = p.cfg.ow;
      const byDep = L.limDep - ow - (M.fuelDep - M.gnd);
      const byArr = af.role === 'helo' && grounded(mission.wps[L.k + 1]) ? L.limArr - ow - Math.max(0, M.fuelArr) : Infinity;
      L.minFuelDep = M.fuelDep;
      L.payMax = Math.max(0, Math.min(struct, byDep, byArr));
      L.payMaxLoaded = Math.max(0, Math.min(struct, L.limDep - ow - (L.fuelDep - L.gnd)));
      L.payLimiter = struct <= Math.min(byDep, byArr) ? (L.sling ? 'hook limit' : 'cabin limit') : (byArr < byDep ? 'hover limit at arrival' : 'weight limit at takeoff');
      L.excess = L.fuelDep - M.fuelDep;
    });
    p.minPayMargin = p.legs.length ? Math.min(...p.legs.map(L => L.payMax - L.payload)) : 0;
    return p;
  }

  // Still-air range from a field with a given payload, landing with reserve.
  function rangeAt(af, mission, o) {
    const c = config(af, mission), da = densityAlt(o.elev || 0, o.oat == null ? isaTemp(o.elev || 0) : o.oat);
    const lim = weightLimit(af, da, { sling: o.sling, oge: mission.requireOGE }), zfw = c.ow + o.payload;
    const go = groundOut(af, null), fuel0 = Math.min(c.fuelCap, lim - zfw + go.ground);
    const need = reserveFuel(af, c, zfw, o.sling);
    let fuel = fuel0 - go.total, t = 0; const dt = 0.05;
    if (fuel <= need) return { range: 0, fuel: Math.max(0, fuel0) };
    while (fuel > need && t < 40) {
      const b = burnRate(af, c, zfw + fuel, o.sling) * dt;
      if (fuel - b < need) { t += dt * (fuel - need) / b; break; }
      fuel -= b; t += dt;
    }
    return { range: t * tas(af, o.sling), fuel: fuel0, hours: t };
  }
  function payloadRange(af, mission, o, steps) {
    const max = o.sling ? af.hook : af.maxPayload, out = []; steps = steps || 12;
    for (let s = 0; s <= steps; s++) {
      const payload = max * s / steps, r = rangeAt(af, mission, { ...o, payload });
      out.push({ payload, range: r.range, fuel: r.fuel });
    }
    return out;
  }

  const out = { gcDist, bearing, interp, destPoint, isaTemp, densityAlt, sigma, config, weightLimit, burnRate, reserveFuel,
    groundOut, groundIn, plan, analyze, rangeAt, payloadRange, grounded, isFuel, legLoads };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.Engine = out;
})(typeof window !== 'undefined' ? window : globalThis);
