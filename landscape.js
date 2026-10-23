// Kogasa Studio — the header's ink-wash landscape, painted on a canvas.
//
// Mountains are rendered pixel by pixel the way sumi-e washes behave: ink pools along
// the ridge and fades down into mist, broken up by brush texture. Pines are built from
// hundreds of short needle strokes. Layers are baked once per size, then composited
// every frame with scroll parallax, drifting mist, rain, and the walker under the red umbrella.

(() => {
  const canvas = document.querySelector(".landscape");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const hero = canvas.closest(".hero");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const css = getComputedStyle(document.documentElement);
  const SEAL = css.getPropertyValue("--seal").trim() || "#B8322A";
  const INK = [27, 27, 26];
  const PAPER = [236, 235, 230];
  const SEED = 1729;

  const { mulberry32, smooth, noise1, fbm1, noise2, paperPattern } = window.Ink;

  // ───────── scene description (fractions of width / height) ─────────

  const LAYERS = [
    { name: "far",  base: 0.50, amp: 0.30, freq: 2.6, octaves: 6, sharp: 1.5, strength: 0.30, falloff: 0.16, edge: 0.18, res: 0.35, blur: 2.4, parallax: 0.18, delay: 0.0 },
    { name: "mid",  base: 0.66, amp: 0.20, freq: 4.2, octaves: 6, sharp: 1.3, strength: 0.55, falloff: 0.11, edge: 0.45, res: 0.5,  blur: 1.0, parallax: 0.10, delay: 0.35 },
    { name: "near", base: 0.83, amp: 0.07, freq: 1.8, octaves: 5, sharp: 1.0, strength: 0.86, falloff: 0.30, edge: 0.75, res: 0.75, blur: 0.4, parallax: 0.04, delay: 0.7 },
  ];

  function makeRidge(layer, seedOffset) {
    const rand = mulberry32(SEED + seedOffset);
    const f = fbm1(rand, layer.octaves);
    return (u) => {
      let n = (f(u * layer.freq + seedOffset) - 0.22) / 0.56;
      n = Math.pow(Math.min(Math.max(n, 0), 1), layer.sharp);
      // keep the left side, behind the headline, quieter: empty space is part of the painting
      const weight = 0.4 + 0.6 * smooth(0.12, 0.78, u);
      return layer.base - layer.amp * n * weight;
    };
  }

  LAYERS.forEach((layer, i) => { layer.ridge = makeRidge(layer, i * 97 + 11); });
  const near = LAYERS[2];

  // ───────── baking ─────────

  let W = 0, H = 0, DPR = 1;
  let baked = null;

  function bakeWash(layer) {
    const res = layer.res;
    const w = Math.max(1, Math.ceil(W * res)), h = Math.max(1, Math.ceil(H * res));
    const rand = mulberry32(SEED + layer.name.length * 31);
    const wash = noise2(rand), wrinkle = noise2(rand), grain = noise2(rand), broken = noise1(rand);
    const img = new ImageData(w, h);
    const data = img.data;
    const falloffPx = layer.falloff * H;

    for (let x = 0; x < w; x++) {
      const ridge = layer.ridge(x / w) * h;
      const X = x / res;
      const dry = 0.35 + 0.9 * broken(X / 26);
      for (let y = Math.max(0, Math.floor(ridge) - 1); y < h; y++) {
        const Y = y / res;
        const below = (y - ridge) / res;                      // CSS px below the ridge
        const d = below / falloffPx;
        let a = layer.strength * Math.exp(-d * 2.1);
        a *= 0.55 + 0.75 * wash(X / 70, Y / 16);              // broad, horizontal wash variation
        a += layer.strength * 0.28 * (wrinkle(X / 6, Y / 34) - 0.5) * Math.exp(-d * 1.4); // texture strokes
        a += layer.edge * Math.exp(-Math.max(below, 0) / 3.2) * dry;                       // ink pooling at the ridge
        a *= 0.82 + 0.36 * grain(X / 2.2, Y / 2.2);
        if (y < ridge) a *= Math.max(0, 1 - (ridge - y));
        a = Math.min(Math.max(a, 0), 1);
        const i = (y * w + x) * 4;
        data[i] = INK[0]; data[i + 1] = INK[1]; data[i + 2] = INK[2]; data[i + 3] = a * 255;
      }
    }

    const small = document.createElement("canvas");
    small.width = w; small.height = h;
    small.getContext("2d").putImageData(img, 0, 0);

    const out = document.createElement("canvas");
    out.width = Math.ceil(W * DPR); out.height = Math.ceil(H * DPR);
    const o = out.getContext("2d");
    o.imageSmoothingQuality = "high";
    o.filter = `blur(${layer.blur * DPR}px)`;
    o.drawImage(small, 0, 0, out.width, out.height);
    o.filter = "none";
    o.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { canvas: out, ctx: o };
  }

  function dryBrushRidge(o, layer, width, alpha, seed) {
    const rand = mulberry32(seed);
    const gaps = noise1(rand), thick = noise1(rand);
    o.lineCap = "round";
    const step = 3;
    for (let x = 0; x < W; x += step) {
      const g = gaps(x / 40);
      if (g < 0.32) continue;
      const y0 = layer.ridge(x / W) * H, y1 = layer.ridge((x + step) / W) * H;
      o.lineWidth = width * (0.35 + 0.9 * thick(x / 18));
      o.strokeStyle = `rgba(${INK.join(",")},${(alpha * (0.5 + 0.6 * g)).toFixed(3)})`;
      o.beginPath(); o.moveTo(x, y0 + 0.6); o.lineTo(x + step + 0.5, y1 + 0.6); o.stroke();
    }
  }

  function ridgeTrees(o, layer, seed) {
    const rand = mulberry32(seed);
    const forest = noise1(rand);
    o.save();
    o.filter = `blur(${0.5 * DPR}px)`;
    for (let x = 0; x < W; x += 3 + rand() * 4) {
      const u = x / W;
      if (forest(u * 14) < 0.55 || u < 0.18) continue;
      const y = layer.ridge(u) * H + 1.5;
      const h = (3 + rand() * 7) * (H / 700);
      const a = 0.32 + rand() * 0.3;
      o.strokeStyle = `rgba(${INK.join(",")},${a.toFixed(3)})`;
      o.fillStyle = o.strokeStyle;
      o.lineWidth = 0.9;
      o.beginPath(); o.moveTo(x, y); o.lineTo(x, y - h); o.stroke();
      for (let k = 0; k < 3; k++) {
        const ty = y - h * (0.35 + k * 0.25);
        o.beginPath(); o.ellipse(x, ty, h * (0.32 - k * 0.07), h * 0.09, 0, 0, Math.PI * 2); o.fill();
      }
    }
    o.restore();
  }

  function foliage(o, cx, cy, rx, ry, rand, scale) {
    o.save();
    o.fillStyle = `rgba(${INK.join(",")},0.08)`;
    o.filter = `blur(${3 * DPR}px)`;
    o.beginPath(); o.ellipse(cx, cy + ry * 0.2, rx * 1.05, ry * 1.1, 0, 0, Math.PI * 2); o.fill();
    o.restore();

    o.lineCap = "round";
    const count = Math.round(rx * ry * 0.55);
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2, r = Math.sqrt(rand());
      const px = cx + Math.cos(ang) * rx * r;
      const py = cy + Math.sin(ang) * ry * r - (1 - r) * ry * 0.35;
      const len = (3 + rand() * 6) * scale;
      const dir = (rand() - 0.5) * Math.PI * 0.85 + (rand() < 0.5 ? 0 : Math.PI) - 0.25;
      const under = py > cy ? 1.2 : 0.8;
      const a = (0.16 + 0.42 * (1 - r * 0.55)) * under;
      o.strokeStyle = `rgba(${INK.join(",")},${Math.min(a, 0.85).toFixed(3)})`;
      o.lineWidth = (0.7 + rand() * 0.9) * scale;
      o.beginPath(); o.moveTo(px, py); o.lineTo(px + Math.cos(dir) * len, py + Math.sin(dir) * len * 0.55); o.stroke();
    }
  }

  function pine(o, x0, y0, height, lean, seed) {
    const rand = mulberry32(seed);
    const scale = height / 260;
    const n = 30, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({
        x: x0 + lean * height * t * t + Math.sin(t * 4.2 + seed) * height * 0.025,
        y: y0 - height * t,
        t,
      });
    }

    // trunk: layered strokes, thick and wet at the base, drier toward the top
    o.lineCap = "round"; o.lineJoin = "round";
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[i + 1];
        const w = height * 0.05 * (1 - p.t * 0.78) * (pass === 0 ? 1 : 0.55);
        const a = pass === 0 ? 0.55 : 0.35 + rand() * 0.3;
        const off = pass === 0 ? 0 : (rand() - 0.5) * w * 0.6;
        o.strokeStyle = `rgba(${INK.join(",")},${a.toFixed(3)})`;
        o.lineWidth = w;
        o.beginPath(); o.moveTo(p.x + off, p.y); o.lineTo(q.x + off, q.y); o.stroke();
      }
    }
    // bark
    for (let k = 0; k < 70; k++) {
      const p = pts[Math.floor(rand() * n * 0.85)];
      const w = height * 0.05 * (1 - p.t * 0.78);
      o.fillStyle = `rgba(${INK.join(",")},${(0.35 + rand() * 0.4).toFixed(3)})`;
      o.beginPath();
      o.ellipse(p.x + (rand() - 0.5) * w * 0.8, p.y + (rand() - 0.5) * 6 * scale, w * (0.15 + rand() * 0.2), 1.2 * scale, rand() - 0.5, 0, Math.PI * 2);
      o.fill();
    }

    // branches with needle pads
    const levels = [0.42, 0.55, 0.66, 0.77, 0.87];
    levels.forEach((lvl, i) => {
      const p = pts[Math.round(lvl * n)];
      const side = i % 2 === 0 ? 1 : -1;
      const len = height * (0.42 - lvl * 0.26) * (0.8 + rand() * 0.4);
      const ex = p.x + side * len, ey = p.y - len * (0.05 + rand() * 0.1);
      const mx = p.x + side * len * 0.5, my = p.y + len * 0.08;
      o.strokeStyle = `rgba(${INK.join(",")},0.8)`;
      o.lineWidth = height * 0.018 * (1 - lvl * 0.5);
      o.beginPath(); o.moveTo(p.x, p.y); o.quadraticCurveTo(mx, my, ex, ey); o.stroke();
      foliage(o, ex - side * len * 0.2, ey - 4 * scale, len * 0.55, len * 0.14 + 6 * scale, rand, scale);
      if (len > height * 0.18) foliage(o, mx, my - 6 * scale, len * 0.3, len * 0.1 + 4 * scale, rand, scale);
    });
    const top = pts[n];
    foliage(o, top.x, top.y + 4 * scale, height * 0.14, height * 0.05, rand, scale);
  }

  function bakeFog(center, thickness, seed) {
    const res = 0.25;
    const fw = Math.ceil(W * 1.4 * res), fh = Math.ceil(H * res);
    const rand = mulberry32(seed);
    const cloud = noise2(rand), detail = noise2(rand);
    const img = new ImageData(fw, fh);
    for (let y = 0; y < fh; y++) {
      const Y = y / res;
      const band = Math.exp(-Math.pow((Y / H - center) / thickness, 2));
      if (band < 0.01) continue;
      for (let x = 0; x < fw; x++) {
        const X = x / res;
        let a = band * (0.35 + 0.85 * cloud(X / 260, Y / 60)) * (0.8 + 0.4 * detail(X / 70, Y / 30));
        a = Math.min(a, 1);
        const i = (y * fw + x) * 4;
        img.data[i] = PAPER[0]; img.data[i + 1] = PAPER[1]; img.data[i + 2] = PAPER[2]; img.data[i + 3] = a * 235;
      }
    }
    const small = document.createElement("canvas");
    small.width = fw; small.height = fh;
    small.getContext("2d").putImageData(img, 0, 0);
    const out = document.createElement("canvas");
    out.width = Math.ceil(W * 1.4 * DPR); out.height = Math.ceil(H * DPR);
    const o = out.getContext("2d");
    o.filter = `blur(${10 * DPR}px)`;
    o.drawImage(small, 0, 0, out.width, out.height);
    return out;
  }

  function bake() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);

    const layers = LAYERS.map((layer) => ({ layer, ...bakeWash(layer) }));
    const [, mid, nr] = layers;
    dryBrushRidge(mid.ctx, LAYERS[1], 2.2, 0.55, SEED + 3);
    ridgeTrees(mid.ctx, LAYERS[1], SEED + 4);
    dryBrushRidge(nr.ctx, near, 3.4, 0.75, SEED + 6);

    const pineScale = Math.min(H / 780, W / 900);
    const u1 = 0.84, u2 = 0.915;
    pine(nr.ctx, W * u1, near.ridge(u1) * H + 6, 300 * pineScale, -0.18, SEED + 8);
    pine(nr.ctx, W * u2, near.ridge(u2) * H + 6, 190 * pineScale, 0.22, SEED + 9);

    baked = {
      layers,
      fogs: [bakeFog(0.62, 0.07, SEED + 12), bakeFog(0.78, 0.06, SEED + 13)],
      paper: paperPattern(ctx, SEED + 5),
    };
    makeRain();
  }

  // ───────── rain ─────────

  let drops = [];
  function makeRain() {
    const rand = mulberry32(SEED + 21);
    const count = Math.round((W * H) / 5200);
    drops = Array.from({ length: count }, () => {
      const z = 0.25 + rand() * 0.75;
      return { x: rand() * (W + 80) - 40, y: rand() * H, z, len: 7 + z * 20, speed: 260 + z * 520, seed: rand() };
    });
  }

  // ───────── walker ─────────

  function drawWalker(x, y, s, alpha, bob) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + bob);
    ctx.scale(s, s);
    // robe
    ctx.fillStyle = `rgba(${INK.join(",")},0.85)`;
    ctx.beginPath();
    ctx.moveTo(-3, -5); ctx.bezierCurveTo(-5, 3, -6.5, 11, -6.5, 17);
    ctx.lineTo(5.5, 17); ctx.bezierCurveTo(5, 11, 4, 3, 2.5, -5); ctx.closePath(); ctx.fill();
    // legs, a hint of stride
    ctx.strokeStyle = `rgba(${INK.join(",")},0.7)`; ctx.lineWidth = 1.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-2, 17); ctx.lineTo(-2.5 - bob * 0.8, 20); ctx.moveTo(2, 17); ctx.lineTo(2.5 + bob * 0.8, 20); ctx.stroke();
    // shaft
    ctx.strokeStyle = `rgba(${INK.join(",")},0.9)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0.6, 3); ctx.stroke();
    // canopy: red wash with a darker rim, like a seal-colour brush stroke
    ctx.fillStyle = SEAL;
    ctx.beginPath();
    ctx.moveTo(-17, -8); ctx.bezierCurveTo(-13, -22, 13, -22, 17, -8);
    ctx.bezierCurveTo(8, -11.5, -8, -11.5, -17, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,20,16,0.55)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-17, -8); ctx.bezierCurveTo(-8, -11.5, 8, -11.5, 17, -8); ctx.stroke();
    ctx.strokeStyle = "rgba(90,20,16,0.35)";
    for (const k of [-9, -3, 3, 9]) { ctx.beginPath(); ctx.moveTo(0, -18.5); ctx.lineTo(k, -10.4); ctx.stroke(); }
    ctx.restore();
  }

  // ───────── frame ─────────

  const WALK_SECONDS = 90;
  const start = performance.now();
  let last = start;
  let running = false;
  let raf = 0;

  function scrollOffset() {
    return Math.min(Math.max(window.scrollY, 0), hero.offsetHeight);
  }

  function frame(now) {
    const t = (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const still = reduceMotion.matches;
    const scroll = still ? 0 : scrollOffset();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${PAPER.join(",")})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const appear = (delay) => (still ? 1 : smooth(0, 1, (t - delay) / 1.6));
    const drift = (speed, phase) => (still ? 0 : Math.sin(t * speed + phase) * W * 0.12);

    const [far, mid, nr] = baked.layers;
    const draw = (img, offsetY, alpha, offsetX = 0) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, offsetX * DPR, offsetY * DPR);
      ctx.globalAlpha = 1;
    };

    draw(far.canvas, scroll * far.layer.parallax, appear(far.layer.delay));
    draw(baked.fogs[0], scroll * 0.14, appear(0.2), -W * 0.2 + drift(0.035, 0));
    draw(mid.canvas, scroll * mid.layer.parallax, appear(mid.layer.delay));
    draw(baked.fogs[1], scroll * 0.07, appear(0.5), -W * 0.2 + drift(0.05, 2));
    draw(nr.canvas, scroll * nr.layer.parallax, appear(nr.layer.delay));

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // walker follows the near ridge
    const p = still ? 0.45 : (t % WALK_SECONDS) / WALK_SECONDS;
    const u = 0.5 + 0.3 * p;
    const fade = still ? 1 : smooth(0, 0.05, p) * (1 - smooth(0.95, 1, p));
    const s = (H / 640) * 1.15;
    const wx = u * W;
    const wy = near.ridge(u) * H + scroll * near.parallax - 19 * s;
    const bob = still ? 0 : Math.abs(Math.sin(t * 2.6)) * -1.1 * s;
    drawWalker(wx, wy, s, fade * appear(1.1), bob);

    // rain at several depths
    ctx.lineCap = "round";
    for (const d of drops) {
      if (!still) {
        d.y += d.speed * dt;
        d.x -= d.speed * dt * 0.2;
        if (d.y - d.len > H) { d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + 80) - 40 + H * 0.2; }
      }
      ctx.strokeStyle = `rgba(${INK.join(",")},${(0.04 + 0.11 * d.z).toFixed(3)})`;
      ctx.lineWidth = 0.5 + 0.7 * d.z;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.2, d.y - d.len); ctx.stroke();
    }

    // washi grain over everything
    ctx.fillStyle = baked.paper;
    ctx.fillRect(0, 0, W, H);

    if (running) raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduceMotion.matches) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() { running = false; cancelAnimationFrame(raf); }

  bake();
  frame(performance.now());
  canvas.classList.add("is-ready");
  play();

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { bake(); frame(performance.now()); }, 120);
  }).observe(canvas);

  new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : pause())).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  reduceMotion.addEventListener("change", () => { pause(); frame(performance.now()); play(); });
})();
