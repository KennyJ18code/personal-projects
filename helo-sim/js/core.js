/* Core helpers: units, atmosphere, noise, map projection. Shared by every other file. */
(function (root) {
  const S = root.SIM = root.SIM || {};
  S.G = 9.80665; S.KT = 1.943844; S.FT = 3.28084; S.LB = 2.204623; S.NM = 1852; S.D2R = Math.PI / 180; S.R2D = 180 / Math.PI;
  S.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  S.lerp = (a, b, t) => a + (b - a) * t;
  S.sstep = (a, b, x) => { const t = S.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  S.wrap180 = d => ((d + 540) % 360) - 180;
  S.wrap360 = d => ((d % 360) + 360) % 360;

  // Environment the whole sim reads. Edited from the weather page.
  S.env = { oatSL: 15, qnh: 1013.25, windDir: 270, windKt: 8, gustKt: 4, vis: 40000, cloudBase: 1800, cloudCover: 0.3, cloudTop: 2600, timeH: 10, rain: 0, turb: 0.3 };

  // ISA-shaped atmosphere using sea-level temperature and pressure from the weather settings.
  S.atmo = (alt, env) => {
    env = env || S.env; const h = Math.max(-300, alt);
    const T = env.oatSL - 0.0065 * h, p = env.qnh * 100 * Math.pow(Math.max(0.2, 1 - 2.25577e-5 * h), 5.25588);
    return { T, p, rho: p / (287.05 * (T + 273.15)) };
  };
  S.RHO0 = 1.225;

  // ---- deterministic noise ----
  const h2 = (x, z) => { let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  S.hash2 = h2;
  S.vnoise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  S.fbm = (x, z, oct) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * S.vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; };

  // ---- projection: Web Mercator scaled to true metres at the origin latitude ----
  const RE = 6378137;
  S.proj = {
    lat0: 0, lon0: 0, k: 1, mx0: 0, my0: 0,
    set(lat, lon) { this.lat0 = lat; this.lon0 = lon; this.k = Math.cos(lat * S.D2R); this.mx0 = RE * lon * S.D2R; this.my0 = RE * Math.log(Math.tan(Math.PI / 4 + lat * S.D2R / 2)); },
    toLocal(lat, lon) { const mx = RE * lon * S.D2R, my = RE * Math.log(Math.tan(Math.PI / 4 + lat * S.D2R / 2)); return { x: (mx - this.mx0) * this.k, z: -(my - this.my0) * this.k }; },
    toGeo(x, z) { const mx = x / this.k + this.mx0, my = -z / this.k + this.my0; return { lat: (2 * Math.atan(Math.exp(my / RE)) - Math.PI / 2) * S.R2D, lon: mx / RE * S.R2D }; },
    // tile <-> local metres
    tileSize(zm) { return 2 * Math.PI * RE / Math.pow(2, zm) * this.k; },
    tileOrigin(zm, tx, ty) { const w = 2 * Math.PI * RE, n = Math.pow(2, zm); const mx = tx / n * w - w / 2, my = w / 2 - ty / n * w; return { x: (mx - this.mx0) * this.k, z: -(my - this.my0) * this.k }; },
    tileAt(zm, x, z) { const w = 2 * Math.PI * RE, n = Math.pow(2, zm); const mx = x / this.k + this.mx0, my = -z / this.k + this.my0; return { tx: Math.floor((mx + w / 2) / w * n), ty: Math.floor((w / 2 - my) / w * n) }; }
  };
  S.gcDistNm = (a, b) => { const p1 = a.lat * S.D2R, p2 = b.lat * S.D2R, dl = (b.lon - a.lon) * S.D2R; const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h))); };
  S.bearing = (a, b) => { const p1 = a.lat * S.D2R, p2 = b.lat * S.D2R, dl = (b.lon - a.lon) * S.D2R; return S.wrap360(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * S.R2D); };
  S.fmt = n => Math.round(n).toLocaleString('en-US');

  // ---- aircraft definitions (SI units; approximate public figures) ----
  // Axes: +X right, +Y up, -Z forward. Positions are relative to the centre of gravity.
  S.AIRCRAFT = {
    uh60: { id: 'uh60', name: 'UH-60M Black Hawk', empty: 5675, crew: 380, mgw: 9979, mgwExt: 10660, fuelCap: 1110,
      R: 8.18, nb: 4, chord: 0.53, omega: 27.0, rotors: 1, Irotor: 9500, hubY: 1.85, I: [54000, 50000, 7600], f: [10, 22, 3.2],
      tail: { l: 9.9, Sh: 4.2, ah: 1.6, Sv: 3.0, av: 2.4, Tmax: 17000, R: 1.68 }, cyc: 0.12, Kb: 150000, kd: 0.075, kb: 0.10,
      th0: 0.02, thR: 0.25, eng: { P: 1490e3, xmsn: 2530e3, idleFF: 60, sfc: 0.26, name: 'T700-GE-701D' }, apuFF: 55, vne: 99,
      gear: [[-1.35, -1.9, -1.2, 1], [1.35, -1.9, -1.2, 1], [0, -1.55, 7.6, 1]], body: [[0, -1.25, -4.2], [0, -1.2, 2], [0, 0.4, 11.2], [0, -0.9, -1]],
      hook: [0, -1.45, 0], hookMax: 4082, cabinMax: 3600, seats: 11, eye: [0.55, 0.42, -3.35], weapons: false, refuelRate: 4.5 },
    ah64: { id: 'ah64', name: 'AH-64E Apache', empty: 5350, crew: 200, mgw: 10430, mgwExt: 10430, fuelCap: 1157,
      R: 7.32, nb: 4, chord: 0.53, omega: 30.3, rotors: 1, Irotor: 7500, hubY: 1.75, I: [40000, 37000, 6200], f: [9, 18, 3.7],
      tail: { l: 8.9, Sh: 3.2, ah: 1.6, Sv: 3.2, av: 2.4, Tmax: 16000, R: 1.4 }, cyc: 0.125, Kb: 190000, kd: 0.07, kb: 0.10,
      th0: 0.02, thR: 0.25, eng: { P: 1490e3, xmsn: 2530e3, idleFF: 60, sfc: 0.26, name: 'T700-GE-701D' }, apuFF: 50, vne: 101,
      gear: [[-1.02, -1.95, -1.6, 1], [1.02, -1.95, -1.6, 1], [0, -1.35, 8.9, 1]], body: [[0, -1.3, -4.6], [0, -1.1, 2], [0, 0.6, 10.2], [0, -1.0, -1]],
      hook: null, hookMax: 0, cabinMax: 0, seats: 0, eye: [0, 0.78, -1.75], weapons: true, refuelRate: 4.5 },
    ch47: { id: 'ch47', name: 'CH-47F Chinook', empty: 11150, crew: 450, mgw: 22680, mgwExt: 22680, fuelCap: 3189,
      R: 9.14, nb: 3, chord: 0.81, omega: 23.6, rotors: 2, Irotor: 32000, hubY: 2.7, I: [210000, 195000, 38000], f: [26, 55, 7.5],
      tandem: { sep: 11.9, dcp: 0.085, yaw: 0.07 }, tail: null, cyc: 0.10, Kb: 120000, kd: 0.08, kb: 0.04,
      th0: 0.02, thR: 0.25, eng: { P: 3529e3, xmsn: 5590e3, idleFF: 110, sfc: 0.25, name: 'T55-GA-714A' }, apuFF: 70, vne: 87.5,
      gear: [[-1.6, -2.25, -3.5, 1], [1.6, -2.25, -3.5, 1], [-1.7, -2.25, 3.4, 1], [1.7, -2.25, 3.4, 1]], body: [[0, -1.6, -7.2], [0, -1.6, 6.5], [0, -1.6, 0]],
      hook: [0, -1.7, 0], hookMax: 11793, cabinMax: 10900, seats: 33, eye: [0.62, 0.25, -6.55], weapons: false, refuelRate: 9 }
  };
})(typeof window !== 'undefined' ? window : globalThis);
