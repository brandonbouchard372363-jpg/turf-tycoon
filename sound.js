// Tiny synthesized sound effects (no audio files needed).
(function () {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('tt_muted') === '1'; } catch (e) { /* storage blocked */ }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.18, delay = 0, slide = 0 } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, { vol = 0.2, delay = 0, freq = 1800, q = 0.8 } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay;
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }

  const S = {
    dice() { for (let k = 0; k < 6; k++) noise(0.05, { delay: k * 0.07 + Math.random() * 0.03, freq: 2200 + Math.random() * 1500, vol: 0.35 }); },
    step() { tone(520, 0.06, { type: 'triangle', vol: 0.08 }); },
    coin() { tone(988, 0.09, { vol: 0.14 }); tone(1319, 0.22, { vol: 0.14, delay: 0.08 }); },
    pay() { tone(660, 0.1, { type: 'triangle', vol: 0.12 }); tone(440, 0.18, { type: 'triangle', vol: 0.12, delay: 0.09 }); },
    card() { noise(0.18, { freq: 3500, q: 0.4, vol: 0.12 }); tone(880, 0.12, { vol: 0.06, delay: 0.12 }); },
    jail() { tone(140, 0.35, { type: 'square', vol: 0.07 }); tone(110, 0.4, { type: 'square', vol: 0.07, delay: 0.25 }); },
    build() { noise(0.06, { freq: 600, q: 2, vol: 0.5 }); noise(0.06, { freq: 700, q: 2, vol: 0.4, delay: 0.1 }); },
    buy() { [523, 659, 784].forEach((f, k) => tone(f, 0.14, { vol: 0.12, delay: k * 0.07 })); },
    bid() { tone(1200, 0.05, { type: 'square', vol: 0.05 }); },
    turn() { tone(784, 0.12, { vol: 0.12 }); tone(1046, 0.2, { vol: 0.12, delay: 0.1 }); },
    jackpot() { [523, 659, 784, 1046, 1319, 1568].forEach((f, k) => tone(f, 0.18, { vol: 0.12, delay: k * 0.06, type: 'triangle' })); },
    deal() { tone(587, 0.1, { vol: 0.12 }); tone(880, 0.18, { vol: 0.12, delay: 0.09 }); },
    bankrupt() { tone(392, 0.25, { type: 'sawtooth', vol: 0.06, slide: -200 }); tone(262, 0.5, { type: 'sawtooth', vol: 0.06, delay: 0.22, slide: -150 }); },
    win() { [523, 659, 784, 1046, 784, 1046].forEach((f, k) => tone(f, 0.22, { vol: 0.13, delay: k * 0.13, type: 'triangle' })); },
    error() { tone(220, 0.12, { type: 'square', vol: 0.05 }); },
    click() { tone(700, 0.03, { type: 'triangle', vol: 0.05 }); },
  };

  window.SFX = {
    play(name) { if (!muted && S[name]) { try { S[name](); } catch (e) { /* ignore */ } } },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('tt_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (!muted) ac();
      return muted;
    },
    unlock() { if (!muted) ac(); },
  };
})();
