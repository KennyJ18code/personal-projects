/* Pilot input: touch sticks, device tilt, gamepad and keyboard, plus synthesised sound. */
(function (root) {
  const S = root.SIM, clamp = S.clamp;
  const I = S.input = { coll: 0, lon: 0, lat: 0, ped: 0, mode: 'sticks', sens: 1, fire: false, brake: false, lookYaw: 0, lookPitch: 0, orbit: 0.4, orbitP: 0.22, zoom: 1, tiltOK: false, keys: {} };
  let tilt = { b: 0, g: 0, b0: null, g0: null }, padR = null, padL = null;
  const expo = v => v * (0.45 + 0.55 * Math.abs(v));
  I.init = () => {
    const L = document.getElementById('padL'), R = document.getElementById('padR'), knobL = document.getElementById('knobL'), knobR = document.getElementById('knobR'), view = document.getElementById('view');
    const bind = (el, on) => { const st = {}; el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); st.id = e.pointerId; st.x = e.clientX; st.y = e.clientY; on('down', e, st); e.preventDefault(); });
      el.addEventListener('pointermove', e => { if (st.id !== e.pointerId) return; on('move', e, st); st.x = e.clientX; st.y = e.clientY; });
      const up = e => { if (st.id !== e.pointerId) return; st.id = null; on('up', e, st); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
    // left pad: up/down moves the collective and it stays put; left/right is pedals and springs back
    bind(L, (k, e, st) => { const r = L.getBoundingClientRect(); if (k === 'move') { I.coll = clamp(I.coll - (e.clientY - st.y) / r.height * 1.25, 0, 1); padL = clamp(((e.clientX - r.left) / r.width - 0.5) * 2.4, -1, 1); } if (k === 'down') padL = clamp(((e.clientX - r.left) / r.width - 0.5) * 2.4, -1, 1); if (k === 'up') padL = null; });
    // right pad: cyclic, springs back to centre
    bind(R, (k, e) => { const r = R.getBoundingClientRect(); if (k === 'up') { padR = null; return; } padR = { x: clamp(((e.clientX - r.left) / r.width - 0.5) * 2.3, -1, 1), y: clamp(((e.clientY - r.top) / r.height - 0.5) * 2.3, -1, 1) }; });
    // anywhere else on the view: look around / orbit, pinch handled by wheel on desktop
    bind(view, (k, e, st) => { if (k !== 'move') return; const dx = e.clientX - st.x, dy = e.clientY - st.y; I.lookYaw = clamp(I.lookYaw - dx * 0.005, -2.3, 2.3); I.lookPitch = clamp(I.lookPitch - dy * 0.004, -1.2, 0.9); I.orbit -= dx * 0.006; I.orbitP = clamp(I.orbitP + dy * 0.004, -0.3, 1.3); });
    view.addEventListener('wheel', e => { I.zoom = clamp(I.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.4, 4); e.preventDefault(); }, { passive: false });
    I.knobs = () => { knobL.style.left = (50 + I.ped * 38) + '%'; knobL.style.top = (92 - I.coll * 84) + '%'; knobR.style.left = (50 + I.lat * 40) + '%'; knobR.style.top = (50 - I.lon * 40) + '%'; };
    addEventListener('keydown', e => { I.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); }); addEventListener('keyup', e => { I.keys[e.code] = false; });
    addEventListener('deviceorientation', e => { if (e.beta == null) return; I.tiltOK = true; const land = (screen.orientation ? screen.orientation.angle : root.orientation || 0); // map to screen axes in landscape
      if (land === 90) { tilt.b = -e.gamma; tilt.g = e.beta; } else if (land === 270 || land === -90) { tilt.b = e.gamma; tilt.g = -e.beta; } else { tilt.b = e.beta; tilt.g = e.gamma; } });
  };
  I.enableTilt = async () => { try { if (root.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false; } tilt.b0 = null; return true; } catch (e) { return false; } };
  I.centerTilt = () => { tilt.b0 = tilt.b; tilt.g0 = tilt.g; };
  I.update = dt => {
    const k = I.keys; let lon = 0, lat = 0, ped = 0, used = false;
    if (I.mode === 'tilt' && I.tiltOK) { if (tilt.b0 == null) I.centerTilt(); lon = clamp(-(tilt.b - tilt.b0) / 22, -1, 1); lat = clamp((tilt.g - tilt.g0) / 26, -1, 1); used = true; }
    if (padR) { lon = -padR.y; lat = padR.x; used = true; }
    if (padL != null) ped = Math.abs(padL) < 0.14 ? 0 : padL;
    if (k.ArrowUp) lon += 1; if (k.ArrowDown) lon -= 1; if (k.ArrowLeft) lat -= 1; if (k.ArrowRight) lat += 1; if (k.KeyA) ped -= 1; if (k.KeyD) ped += 1;
    if (k.KeyW) I.coll = clamp(I.coll + dt * 0.35, 0, 1); if (k.KeyS) I.coll = clamp(I.coll - dt * 0.35, 0, 1);
    let fire = I.fireBtn || !!k.Space, brake = I.brakeBtn || !!k.KeyB;
    const gp = navigator.getGamepads ? Array.from(navigator.getGamepads()).find(g => g) : null;
    if (gp) { const dz = v => Math.abs(v) < 0.08 ? 0 : v; if (Math.abs(gp.axes[2]) + Math.abs(gp.axes[3]) > 0.1) { lat = dz(gp.axes[2]); lon = -dz(gp.axes[3]); } ped += dz(gp.axes[0]); I.coll = clamp(I.coll - dz(gp.axes[1]) * dt * 0.6, 0, 1);
      if (gp.buttons[7] && gp.buttons[7].pressed) fire = true; if (gp.buttons[6] && gp.buttons[6].pressed) brake = true; I.gpTrim = gp.buttons[0] && gp.buttons[0].pressed; }
    const tl = Math.min(1, dt * 12); lon = clamp(expo(lon) * I.sens, -1, 1); lat = clamp(expo(lat) * I.sens, -1, 1);
    I.lon += (lon - I.lon) * tl; I.lat += (lat - I.lat) * tl; I.ped += (clamp(ped, -1, 1) - I.ped) * tl; I.fire = fire; I.brake = brake; I.knobs && I.knobs();
  };

  // ---------------- sound ----------------
  const A = S.audio = { on: false, vol: 0.7 };
  A.start = () => {
    if (A.ctx) { A.ctx.resume(); return; } const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return; const c = A.ctx = new AC();
    A.master = c.createGain(); A.master.gain.value = A.vol; A.master.connect(c.destination);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.noise = nb;
    const src = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    // rotor: filtered noise chopped at the blade-pass frequency
    A.rotF = c.createBiquadFilter(); A.rotF.type = 'lowpass'; A.rotF.frequency.value = 260; A.rotG = c.createGain(); A.rotG.gain.value = 0; A.chop = c.createGain(); A.chop.gain.value = 0.5;
    A.lfo = c.createOscillator(); A.lfo.type = 'sawtooth'; A.lfo.frequency.value = 1; A.lfoG = c.createGain(); A.lfoG.gain.value = 0.5; A.lfo.connect(A.lfoG); A.lfoG.connect(A.chop.gain); A.lfo.start();
    src().connect(A.rotF); A.rotF.connect(A.chop); A.chop.connect(A.rotG); A.rotG.connect(A.master);
    // turbines and APU: whine oscillators
    A.tur = [0, 1].map(() => { const o = c.createOscillator(); o.type = 'sawtooth'; const g = c.createGain(); g.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2; o.connect(f); f.connect(g); g.connect(A.master); o.start(); return { o, g, f }; });
    A.apu = (() => { const o = c.createOscillator(); o.type = 'triangle'; const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(A.master); o.start(); return { o, g }; })();
    A.hiss = c.createGain(); A.hiss.gain.value = 0; const hf = c.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 1800; src().connect(hf); hf.connect(A.hiss); A.hiss.connect(A.master);
    A.horn = (() => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 620; const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(A.master); o.start(); return { o, g }; })();
    A.on = true;
  };
  const burst = (dur, f0, gain, type) => { if (!A.on) return; const c = A.ctx, s = c.createBufferSource(); s.buffer = A.noise; const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = f0; const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); s.connect(f); f.connect(g); g.connect(A.master); s.start(c.currentTime, Math.random()); s.stop(c.currentTime + dur); };
  A.gun = () => burst(0.09, 900, 0.5); A.rocket = () => burst(0.9, 1600, 0.45, 'bandpass'); A.boom = big => burst(big ? 1.6 : 0.5, big ? 180 : 420, big ? 0.7 : 0.25); A.crash = () => burst(2.5, 140, 1);
  A.update = (heli, sys, inside) => {
    if (!A.on) return; const c = A.ctx, t = c.currentTime, s = heli.s, nr = sys.nr, k = inside ? 0.75 : 1;
    A.master.gain.setTargetAtTime(A.vol, t, 0.1);
    A.lfo.frequency.setTargetAtTime(Math.max(0.3, nr * s.omega / 6.283 * s.nb), t, 0.05);
    A.rotG.gain.setTargetAtTime(clamp(nr * nr * (0.35 + heli.eff.coll * 0.6 + (heli.out.shake || 0) * 0.5), 0, 1.2) * 0.8 * k, t, 0.1); A.rotF.frequency.setTargetAtTime(160 + nr * 240 + heli.eff.coll * 200, t, 0.1);
    sys.eng.forEach((e, i) => { const u = A.tur[i]; u.o.frequency.setTargetAtTime(180 + e.ng * 42 + i * 37, t, 0.1); u.f.frequency.setTargetAtTime(600 + e.ng * 40, t, 0.1); u.g.gain.setTargetAtTime(clamp(e.ng / 100, 0, 1) * 0.05 * k, t, 0.15); });
    A.apu.o.frequency.setTargetAtTime(300 + sys.apuN * 1900, t, 0.1); A.apu.g.gain.setTargetAtTime(sys.apuN * 0.035 * k, t, 0.1);
    A.hiss.gain.setTargetAtTime(clamp(heli.out.tas / 90, 0, 1) * 0.12 + clamp((sys.eng[0].ng + sys.eng[1].ng) / 200, 0, 1) * 0.05, t, 0.2);
    const low = sys.dc && sys.nr < 0.95 && !heli.onGround && !heli.crashed, fire = sys.dc && (sys.eng[0].fire || sys.eng[1].fire);
    A.horn.o.frequency.setTargetAtTime(fire ? 880 : 620, t, 0.01); A.horn.g.gain.setTargetAtTime((low || fire) && (performance.now() % 500 < 250) ? 0.07 : 0, t, 0.01);
  };
})(typeof window !== 'undefined' ? window : globalThis);
