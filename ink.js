// Kogasa Studio — shared helpers for the painted canvases: seeded randomness and smooth noise.

window.Ink = (() => {
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const smooth = (e0, e1, x) => {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
  };

  function noise1(rand, size = 256) {
    const v = Float32Array.from({ length: size }, rand);
    return (x) => {
      const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
      const a = v[((i % size) + size) % size], b = v[(((i + 1) % size) + size) % size];
      return a + (b - a) * u;
    };
  }

  function fbm1(rand, octaves) {
    const layers = Array.from({ length: octaves }, () => noise1(rand));
    return (x) => {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (const n of layers) { sum += amp * n(x * freq); norm += amp; amp *= 0.5; freq *= 2.03; }
      return sum / norm;
    };
  }

  function noise2(rand, size = 128) {
    const g = Float32Array.from({ length: size * size }, rand);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const x0 = ((xi % size) + size) % size, y0 = ((yi % size) + size) % size;
      const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = g[y0 * size + x0], b = g[y0 * size + x1], c = g[y1 * size + x0], d = g[y1 * size + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // Washi grain: speckles and short fibres on a 384px tile.
  function paperTile(seed) {
    const size = 384;
    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    const o = out.getContext("2d");
    const rand = mulberry32(seed);
    for (let i = 0; i < 9000; i++) {
      const dark = rand() < 0.55;
      o.fillStyle = dark ? `rgba(27,27,26,${(rand() * 0.05).toFixed(3)})` : `rgba(255,255,250,${(rand() * 0.12).toFixed(3)})`;
      o.fillRect(rand() * size, rand() * size, 1, 1);
    }
    o.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const x = rand() * size, y = rand() * size, len = 6 + rand() * 22, ang = rand() * Math.PI;
      o.strokeStyle = rand() < 0.5 ? `rgba(27,27,26,${(0.02 + rand() * 0.03).toFixed(3)})` : `rgba(255,255,250,${(0.05 + rand() * 0.08).toFixed(3)})`;
      o.lineWidth = 0.6;
      o.beginPath(); o.moveTo(x, y);
      o.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (rand() - 0.5) * 4, y + Math.sin(ang) * len * 0.5 + (rand() - 0.5) * 4, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      o.stroke();
    }
    return out;
  }

  function paperPattern(ctx, seed) {
    return ctx.createPattern(paperTile(seed), "repeat");
  }

  return { mulberry32, smooth, noise1, fbm1, noise2, paperTile, paperPattern };
})();
