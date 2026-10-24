// Kogasa Studio — the header's ink-wash landscape.
//
// Mountains are rendered pixel by pixel the way sumi-e washes behave: ink pools along
// the ridge and fades down into mist, broken up by brush texture. Pines are built from
// hundreds of short needle strokes.
//
// Each layer (far range, mist, middle range, mist, near hill) gets its own canvas, painted
// once per size. The parallax is a CSS scroll-driven animation on each layer (see
// styles.css), and the mist drifts by CSS animation, so nothing static is ever redrawn
// and no script runs while scrolling. Only the rain and the walker are drawn every frame.

(() => {
  const scene = document.querySelector(".landscape");
  if (!scene || !document.createElement("canvas").getContext) return;
  const hero = scene.closest(".hero");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const css = getComputedStyle(document.documentElement);
  const SEAL = css.getPropertyValue("--seal").trim() || "#B8322A";
  const INK = [27, 27, 26];
  const PAPER = [236, 235, 230];
  const SEED = 1729;

  const { mulberry32, smooth, noise1, fbm1, noise2, paperTile } = window.Ink;

  // ───────── scene description (fractions of width / height) ─────────

  const LAYERS = [
    { name: "far",  base: 0.50, amp: 0.30, freq: 2.6, octaves: 6, sharp: 1.5, strength: 0.30, falloff: 0.16, edge: 0.18, res: 0.9, blur: 1.1, parallax: 0.18, delay: 0.0 },
    { name: "mid",  base: 0.66, amp: 0.20, freq: 4.2, octaves: 6, sharp: 1.3, strength: 0.55, falloff: 0.11, edge: 0.45, res: 1.0, blur: 0.6, parallax: 0.10, delay: 0.35 },
    { name: "near", base: 0.83, amp: 0.07, freq: 1.8, octaves: 5, sharp: 1.0, strength: 0.86, falloff: 0.30, edge: 0.75, res: 1.0, blur: 0.3, parallax: 0.04, delay: 0.7 },
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

  // The two pines on the right, back to front. `sway` is how far (degrees) a gust bends each one.
  const PINES = [
    { u: 0.915, h: 230, lean: 0.22, seed: 9, tone: 0.6, blur: 0.5, density: 1.5, pad: 1.2, sway: 0.9 },
    { u: 0.84, h: 360, lean: -0.18, seed: 8, density: 1.5, pad: 1.2, trunk: 1.15, sway: 1.5 },
  ];

  // The stack, back to front. The mountain layers are stored at retina density (they are
  // painted once, so this costs memory, not frame time); the heavily blurred mist doesn't need it.
  const STACK = [
    { key: "far",  parallax: 0.18, dpr: 2,   delay: 0 },
    { key: "fog0", parallax: 0.14, dpr: 1,   delay: 0.2, fog: true },
    { key: "mid",  parallax: 0.10, dpr: 2,   delay: 0.35 },
    { key: "fog1", parallax: 0.07, dpr: 1,   delay: 0.5, fog: true },
    { key: "near", parallax: 0.04, dpr: 2,   delay: 0.7 },
  ];
  for (const item of STACK) {
    item.wrap = document.createElement("div");
    item.wrap.className = "landscape__layer" + (item.fog ? " landscape__layer--fog" : "");
    item.wrap.style.transitionDelay = `${item.delay}s`;
    item.wrap.style.setProperty("--p", item.parallax);
    item.canvas = document.createElement("canvas");
    item.wrap.appendChild(item.canvas);
    scene.appendChild(item.wrap);
  }
  const stack = Object.fromEntries(STACK.map((item) => [item.key, item]));

  const treesWrap = document.createElement("div");
  treesWrap.className = "landscape__layer";
  treesWrap.style.transitionDelay = "0.7s";
  treesWrap.style.setProperty("--p", near.parallax);
  for (const tree of PINES) {
    tree.canvas = document.createElement("canvas");
    tree.canvas.className = "landscape__tree";
    treesWrap.appendChild(tree.canvas);
  }
  scene.appendChild(treesWrap);

  // rain and walker ride on the near hill's layer, so the walker stays on its path while scrolling
  const liveWrap = document.createElement("div");
  liveWrap.className = "landscape__layer";
  liveWrap.style.transitionDelay = "1.1s";
  liveWrap.style.setProperty("--p", near.parallax);
  const live = document.createElement("canvas");
  live.className = "landscape__live";
  liveWrap.appendChild(live);
  scene.appendChild(liveWrap);
  const ctx = live.getContext("2d");
  let liveDpr = 1;

  // ───────── baking ─────────

  let W = 0, H = 0, DPR = 1;
  let calm = null;   // the area behind the header copy, where rain thins out

  function bakeWash(layer, target) {
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

    target.width = Math.ceil(W * DPR); target.height = Math.ceil(H * DPR);
    const o = target.getContext("2d");
    o.imageSmoothingQuality = "high";
    o.filter = `blur(${layer.blur * DPR}px)`;
    o.drawImage(small, 0, 0, target.width, target.height);
    o.filter = "none";
    o.setTransform(DPR, 0, 0, DPR, 0, 0);
    return o;
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

  function foliage(o, cx, cy, rx, ry, rand, scale, tone = 1, density = 1) {
    o.save();
    o.fillStyle = `rgba(${INK.join(",")},${(0.08 * tone).toFixed(3)})`;
    o.filter = `blur(${3 * DPR}px)`;
    o.beginPath(); o.ellipse(cx, cy + ry * 0.2, rx * 1.05, ry * 1.1, 0, 0, Math.PI * 2); o.fill();
    o.restore();

    o.lineCap = "round";
    const count = Math.round(rx * ry * 0.55 * density);
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2, r = Math.sqrt(rand());
      const px = cx + Math.cos(ang) * rx * r;
      const py = cy + Math.sin(ang) * ry * r - (1 - r) * ry * 0.35;
      const len = (3 + rand() * 6) * scale;
      const dir = (rand() - 0.5) * Math.PI * 0.85 + (rand() < 0.5 ? 0 : Math.PI) - 0.25;
      const under = py > cy ? 1.2 : 0.8;
      const a = (0.16 + 0.42 * (1 - r * 0.55)) * under;
      o.strokeStyle = `rgba(${INK.join(",")},${(Math.min(a, 0.85) * tone).toFixed(3)})`;
      o.lineWidth = (0.7 + rand() * 0.9) * scale;
      o.beginPath(); o.moveTo(px, py); o.lineTo(px + Math.cos(dir) * len, py + Math.sin(dir) * len * 0.55); o.stroke();
    }
  }

  // opts: tone (ink strength), density (needles), trunk (thickness), pad (pad size),
  // wind (0 = branches alternate sides, 1 = all reach to the left)
  function pine(o, x0, y0, height, lean, seed, opts = {}) {
    const { tone = 1, density = 1, trunk = 1, pad = 1, wind = 0 } = opts;
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
        const w = height * 0.05 * trunk * (1 - p.t * 0.78) * (pass === 0 ? 1 : 0.55);
        const a = (pass === 0 ? 0.55 : 0.35 + rand() * 0.3) * tone;
        const off = pass === 0 ? 0 : (rand() - 0.5) * w * 0.6;
        o.strokeStyle = `rgba(${INK.join(",")},${a.toFixed(3)})`;
        o.lineWidth = w;
        o.beginPath(); o.moveTo(p.x + off, p.y); o.lineTo(q.x + off, q.y); o.stroke();
      }
    }
    // bark
    for (let k = 0; k < 70; k++) {
      const p = pts[Math.floor(rand() * n * 0.85)];
      const w = height * 0.05 * trunk * (1 - p.t * 0.78);
      o.fillStyle = `rgba(${INK.join(",")},${((0.35 + rand() * 0.4) * tone).toFixed(3)})`;
      o.beginPath();
      o.ellipse(p.x + (rand() - 0.5) * w * 0.8, p.y + (rand() - 0.5) * 6 * scale, w * (0.15 + rand() * 0.2), 1.2 * scale, rand() - 0.5, 0, Math.PI * 2);
      o.fill();
    }

    // branches with needle pads
    const levels = [0.42, 0.55, 0.66, 0.77, 0.87];
    levels.forEach((lvl, i) => {
      const p = pts[Math.round(lvl * n)];
      const side = wind && rand() < wind ? -1 : (i % 2 === 0 ? 1 : -1);
      const len = height * (0.42 - lvl * 0.26) * (0.8 + rand() * 0.4) * (side < 0 ? 1 + wind * 0.45 : 1);
      const ex = p.x + side * len, ey = p.y - len * (0.05 + rand() * 0.1);
      const mx = p.x + side * len * 0.5, my = p.y + len * 0.08;
      o.strokeStyle = `rgba(${INK.join(",")},${(0.8 * tone).toFixed(3)})`;
      o.lineWidth = height * 0.018 * trunk * (1 - lvl * 0.5);
      o.beginPath(); o.moveTo(p.x, p.y); o.quadraticCurveTo(mx, my, ex, ey); o.stroke();
      foliage(o, ex - side * len * 0.2, ey - 4 * scale, len * 0.55 * pad, (len * 0.14 + 6 * scale) * pad, rand, scale, tone, density);
      if (len > height * 0.18) foliage(o, mx, my - 6 * scale, len * 0.3 * pad, (len * 0.1 + 4 * scale) * pad, rand, scale, tone, density);
    });
    const top = pts[n];
    foliage(o, top.x, top.y + 4 * scale, height * 0.14 * pad, height * 0.05 * pad, rand, scale, tone, density);
  }

  function bakeFog(center, thickness, seed, target) {
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
    target.width = Math.ceil(W * 1.4 * DPR); target.height = Math.ceil(H * DPR);
    const o = target.getContext("2d");
    o.filter = `blur(${10 * DPR}px)`;
    o.drawImage(small, 0, 0, target.width, target.height);
  }

  function bake() {
    const rect = scene.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    const screenDpr = window.devicePixelRatio || 1;
    const dprFor = (item) => Math.min(screenDpr, item.dpr);

    DPR = dprFor(stack.far);
    bakeWash(LAYERS[0], stack.far.canvas);

    DPR = dprFor(stack.mid);
    const mid = bakeWash(LAYERS[1], stack.mid.canvas);
    dryBrushRidge(mid, LAYERS[1], 2.2, 0.55, SEED + 3);
    ridgeTrees(mid, LAYERS[1], SEED + 4);

    DPR = dprFor(stack.near);
    const nr = bakeWash(near, stack.near.canvas);
    dryBrushRidge(nr, near, 3.4, 0.75, SEED + 6);
    const pineScale = Math.min(H / 780, W / 900);
    // each pine on its own small canvas, anchored at its base so the wind can bend it
    for (const tree of PINES) {
      const h = tree.h * pineScale;
      const baseX = W * tree.u, baseY = near.ridge(tree.u) * H + 6;
      const box = { left: baseX - h * 0.7, top: baseY - h * 1.12, width: h * 1.4, height: h * 1.12 + 14 };
      const el = tree.canvas;
      Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      el.width = Math.ceil(box.width * DPR); el.height = Math.ceil(box.height * DPR);
      const o = el.getContext("2d");
      o.setTransform(DPR, 0, 0, DPR, -box.left * DPR, -box.top * DPR);
      if (tree.blur) o.filter = `blur(${tree.blur * DPR}px)`;
      pine(o, baseX, baseY, h, tree.lean, SEED + tree.seed, tree);
    }

    DPR = dprFor(stack.fog0);
    bakeFog(0.62, 0.07, SEED + 12, stack.fog0.canvas);
    bakeFog(0.78, 0.06, SEED + 13, stack.fog1.canvas);

    liveDpr = Math.min(screenDpr, 2);
    live.width = Math.round(W * liveDpr);
    live.height = Math.round(H * liveDpr);

    const copy = document.querySelector(".hero__copy");
    const quiet = copy ? copy.getBoundingClientRect() : null;
    const pad = 70;
    calm = quiet ? {
      left: quiet.left - rect.left - pad, right: quiet.right - rect.left + pad,
      top: quiet.top - rect.top - pad, bottom: quiet.bottom - rect.top + pad,
    } : null;

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
  //
  // A small old creature in silhouette: hunched back with a little hump, head carried low and
  // forward, big white eyes. It shuffles along the hill leaning on a stick, under the red
  // umbrella, and now and then stops to look up at the rain or glance at whoever is watching.
  // Local units: origin on the ground between its feet, +x forward, -y up.

  const SILHOUETTE = "#141413";

  // its day: walking, with pauses to look up at the rain or out at the viewer (seconds)
  const ROUTE = [["walk", 24], ["up", 5], ["walk", 26], ["viewer", 4], ["walk", 22], ["up", 4.5], ["walk", 25]];
  const ROUTE_SECONDS = ROUTE.reduce((sum, [, d]) => sum + d, 0);
  const WALK_TOTAL = ROUTE.filter(([k]) => k === "walk").reduce((sum, [, d]) => sum + d, 0);

  function walkerState(t) {
    let rest = t % ROUTE_SECONDS, walked = 0;
    for (const [kind, duration] of ROUTE) {
      if (rest < duration) {
        if (kind === "walk") return { progress: (walked + rest) / WALK_TOTAL, walkTime: walked + rest, look: null, lookAmount: 0 };
        const amount = smooth(0, 0.6, rest) * (1 - smooth(duration - 0.6, duration, rest));
        return { progress: walked / WALK_TOTAL, walkTime: walked, look: kind, lookAmount: amount };
      }
      rest -= duration;
      if (kind === "walk") walked += duration;
    }
    return { progress: 1, walkTime: WALK_TOTAL, look: null, lookAmount: 0 };
  }

  // a fixed, per-point wobble so outlines look brushed rather than drawn with a ruler
  const wobble = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) - 0.5; };

  function brushedPath(segments, seed, amount = 0.32) {
    const path = new Path2D();
    let k = seed, first = true;
    for (const seg of segments) {
      const [p0, p1, p2, p3] = seg;
      const n = 8;
      for (let i = first ? 0 : 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
        const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
        const jx = wobble(k++) * amount, jy = wobble(k++) * amount;
        first ? path.moveTo(x + jx, y + jy) : path.lineTo(x + jx, y + jy);
        first = false;
      }
    }
    return path;
  }

  let canopy = null;   // where the umbrella is this frame, so rain can splash off it

  // Wind: a slow, uneven gust between 0 (calm) and 1 (strong), blowing from right to left.
  function gustAt(t) {
    const g = 0.5 + 0.32 * Math.sin(t * 0.31) + 0.12 * Math.sin(t * 0.83 + 1.3) + 0.06 * Math.sin(t * 2.1 + 0.4);
    return Math.min(Math.max(g, 0), 1);
  }

  function drawWalker(x, y, s, alpha, t, state, gust) {
    const walking = !state.look;
    const phase = state.walkTime * 2.2;                     // one step every ~1.4 s while walking
    const stride = walking ? Math.sin(phase) : 0;
    const breath = Math.sin(t * 1.7) * 0.25;
    const bob = walking ? -Math.abs(Math.sin(phase)) * 0.85 : breath;
    const headBob = walking ? -Math.abs(Math.sin(phase - 0.6)) * 0.9 : breath * 1.2;
    const lean = (walking ? Math.sin(phase) * 0.025 : 0) + gust * 0.03;   // leans into the wind
    const up = state.look === "up" ? state.lookAmount : 0;
    const viewer = state.look === "viewer" ? state.lookAmount : 0;
    const blink = (t % 4.3) < 0.13 ? 0.12 : 1;
    const umbrellaTilt = (walking ? Math.sin(phase - 1.0) * 0.05 : 0) - up * 0.2 - gust * 0.14 - Math.sin(t * 3.1) * gust * 0.03;   // pushed back by gusts

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(lean);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = SILHOUETTE;
    ctx.strokeStyle = SILHOUETTE;

    // walking stick, planted ahead; the body leans onto it with each step
    const caneTop = { x: 11.5, y: -9.5 + bob };
    const caneTip = { x: 15.5 + stride * 1.6, y: 0 };
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(caneTop.x, caneTop.y - 1.2); ctx.lineTo(caneTip.x, caneTip.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(caneTop.x - 2, caneTop.y - 1.6); ctx.quadraticCurveTo(caneTop.x, caneTop.y - 3, caneTop.x + 0.3, caneTop.y - 1); ctx.stroke();

    // legs: short shuffling steps
    const leg = (dir) => {
      const footX = dir * 2.6 + (dir > 0 ? stride : -stride) * 1.8;
      const lift = Math.max(0, dir > 0 ? stride : -stride) * 0.8;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(dir * 1.2, -5 + bob); ctx.lineTo(footX, -lift); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(footX + 0.9, -lift - 0.3, 2.1, 1, 0, 0, Math.PI * 2); ctx.fill();
    };
    leg(-1);

    // wet-ink softness around the silhouette
    ctx.shadowColor = "rgba(20,20,19,0.45)";
    ctx.shadowBlur = 1.6 * liveDpr;

    // body: hunched back with a little hump, leaning onto the stick with each step
    ctx.save();
    ctx.translate(0, bob);
    ctx.fill(brushedPath([
      [[-8.5, -4.5], [-11, -11], [-10.5, -18.5], [-6, -21.5]],    // back rising to the hump
      [[-6, -21.5], [-2.5, -24], [2.5, -22], [5, -18]],           // over the hump, shoulders falling forward
      [[5, -18], [6.5, -15.5], [7, -11], [5.5, -8]],              // chest
      [[5.5, -8], [4, -5], [0, -3.8], [-3, -3.8]],                // belly
      [[-3, -3.8], [-5, -3.8], [-7, -4], [-8.5, -4.5]],
    ], 11));
    ctx.shadowBlur = 0;
    // arm reaching forward to the stick, and the arm holding the umbrella
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(3, -13.5); ctx.quadraticCurveTo(8, -9.5, caneTop.x, caneTop.y - bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, -16); ctx.quadraticCurveTo(4, -21, 3.3, -24); ctx.stroke();
    ctx.restore();

    leg(1);

    // head: carried low and forward, bobbing just after the body, tipping back to look up
    ctx.save();
    ctx.translate(0, headBob);
    ctx.translate(5.5, -17.5);
    ctx.rotate(-up * 0.22 - viewer * 0.06);
    ctx.translate(-5.5, 17.5);
    ctx.shadowColor = "rgba(20,20,19,0.45)";
    ctx.shadowBlur = 1.6 * liveDpr;
    const k = 0.5523;
    const [hx0, hy0, hrx, hry] = [9, -14.8, 6.2, 5.6];
    ctx.fill(brushedPath([
      [[hx0 + hrx, hy0], [hx0 + hrx, hy0 + hry * k], [hx0 + hrx * k, hy0 + hry], [hx0, hy0 + hry]],
      [[hx0, hy0 + hry], [hx0 - hrx * k, hy0 + hry], [hx0 - hrx, hy0 + hry * k], [hx0 - hrx, hy0]],
      [[hx0 - hrx, hy0], [hx0 - hrx, hy0 - hry * k], [hx0 - hrx * k, hy0 - hry], [hx0, hy0 - hry]],
      [[hx0, hy0 - hry], [hx0 + hrx * k, hy0 - hry], [hx0 + hrx, hy0 - hry * k], [hx0 + hrx, hy0]],
    ], 61, 0.26));
    ctx.beginPath(); ctx.ellipse(5.2, -19.8, 1.6, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();   // ear
    ctx.shadowBlur = 0;
    // big white eyes; pupils look ahead, up at the rain, or out at you
    const look = { x: 0.35 * (1 - viewer) - 0.25 * viewer, y: 0.15 - up * 0.9 + viewer * 0.1 };
    const eye = (ex, ey, rx, ry) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * blink, 0, 0, Math.PI * 2); ctx.fill();
      if (blink === 1) {
        ctx.fillStyle = SILHOUETTE;
        ctx.beginPath(); ctx.arc(ex + rx * look.x, ey + ry * look.y, rx * 0.42, 0, Math.PI * 2); ctx.fill();
      }
    };
    eye(7.4 - viewer * 0.5, -15.6, 1.9, 2.5);   // far eye, a little smaller
    eye(11.1, -15.3, 2.3, 2.9);                 // near eye
    ctx.restore();

    // umbrella: swaying a beat behind the steps, tipped back when it looks up
    ctx.save();
    ctx.translate(0, bob);
    ctx.translate(3.3, -24);
    ctx.rotate(umbrellaTilt);
    ctx.translate(-3.3, 24);
    ctx.strokeStyle = SILHOUETTE;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(3.3, -23.5); ctx.lineTo(1.2, -40.5); ctx.stroke();
    ctx.translate(1, -31);
    ctx.fillStyle = SEAL;
    ctx.beginPath();
    ctx.moveTo(-18, -8); ctx.bezierCurveTo(-14, -22.5, 14, -22.5, 18, -8);
    ctx.bezierCurveTo(8.5, -11.5, -8.5, -11.5, -18, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,20,16,0.55)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-18, -8); ctx.bezierCurveTo(-8.5, -11.5, 8.5, -11.5, 18, -8); ctx.stroke();
    ctx.strokeStyle = "rgba(90,20,16,0.35)";
    for (const k of [-10, -3.5, 3.5, 10]) { ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(k, -10.6); ctx.stroke(); }
    ctx.fillStyle = SILHOUETTE;
    ctx.fillRect(-0.6, -21.5, 1.2, 2.6);
    ctx.restore();

    ctx.restore();

    // remember the canopy in screen space: its centre at the rim, its scale and its tilt
    const tilt = lean + umbrellaTilt;
    const hx = 3.3, hy = -24 + bob;
    const ox = 1 - 3.3, oy = -31 + 24;
    const rx = hx + ox * Math.cos(umbrellaTilt) - oy * Math.sin(umbrellaTilt);
    const ry = hy + ox * Math.sin(umbrellaTilt) + oy * Math.cos(umbrellaTilt);
    canopy = { x: x + rx * s, y: y + ry * s, s, tilt, alpha };
  }

  // Rain meeting the canopy: returns "hit", "under" (sheltered, not drawn) or null.
  function canopyContact(px, py) {
    if (!canopy || canopy.alpha < 0.3) return null;
    const dx = (px - canopy.x) / canopy.s, dy = (py - canopy.y) / canopy.s;
    const c = Math.cos(-canopy.tilt), sn = Math.sin(-canopy.tilt);
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
    if (Math.abs(lx) > 18) return null;
    const surface = -19 + 11 * (lx / 18) * (lx / 18);
    if (ly < surface - 0.5) return null;
    if (ly <= surface + 2.5) return "hit";
    return ly < 34 ? "under" : null;
  }

  let splashes = [];
  function splash(px, py) {
    if (splashes.length > 120) return;
    const side = px < canopy.x ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      splashes.push({
        x: px, y: py,
        vx: side * (18 + Math.random() * 38) + (Math.random() - 0.5) * 20,
        vy: -(26 + Math.random() * 40),
        life: 0.32 + Math.random() * 0.15,
      });
    }
  }

  function drawSplashes(dt) {
    if (!splashes.length) return;
    const path = new Path2D();
    for (const p of splashes) {
      p.vy += 320 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      path.moveTo(p.x + 0.8, p.y); path.arc(p.x, p.y, 0.8, 0, Math.PI * 2);
    }
    splashes = splashes.filter((p) => p.life > 0);
    ctx.fillStyle = `rgba(${INK.join(",")},0.32)`;
    ctx.fill(path);
  }

  // ───────── frame ─────────

  const start = performance.now();
  let last = start;
  let running = false;
  let raf = 0;

  function frame(now) {
    const t = (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const still = reduceMotion.matches;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, live.width, live.height);
    ctx.setTransform(liveDpr, 0, 0, liveDpr, 0, 0);

    const gust = still ? 0.35 : gustAt(t);

    // the pines bend with the gust, from their base
    if (!still) {
      PINES.forEach((tree, i) => {
        const bend = tree.sway * (0.25 + gust) + Math.sin(t * 1.6 + i * 1.7) * 0.12 * gust;
        tree.canvas.style.transform = `skewX(${bend.toFixed(3)}deg)`;
      });
    }

    // walker follows the near ridge
    const state = still ? { progress: 0.45, walkTime: 0, look: null, lookAmount: 0 } : walkerState(t);
    const p = state.progress;
    const u = 0.5 + 0.3 * p;
    const fade = still ? 1 : smooth(0, 0.05, p) * (1 - smooth(0.95, 1, p));
    const s = (H / 640) * 1.3;
    const wx = u * W;
    const wy = near.ridge(u) * H + 1;
    drawWalker(wx, wy, s, fade, still ? 0 : t, state, gust);

    // rain at several depths, batched into a few paths by thickness and strength
    ctx.lineCap = "round";
    const RAIN_WIDTHS = [0.7, 1.0, 1.3];
    const rainPaths = new Map();
    const slant = 0.1 + 0.32 * gust;   // rain leans harder in a gust
    for (const d of drops) {
      if (!still) {
        d.y += d.speed * dt;
        d.x -= d.speed * dt * slant;
        if (d.y - d.len > H) { d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + 80) - 40 + H * slant; }
      }
      const contact = canopyContact(d.x, d.y);
      if (contact === "hit" && !still) {
        splash(d.x, d.y);
        d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + 80) - 40 + H * slant;
        continue;
      }
      if (contact) continue;
      let rainAlpha = 0.04 + 0.11 * d.z;
      if (calm) {
        const inside = Math.min(d.x - calm.left, calm.right - d.x, d.y - calm.top, calm.bottom - d.y);
        rainAlpha *= 1 - 0.75 * smooth(0, 60, inside);
      }
      const level = Math.round(rainAlpha / 0.015);
      if (level === 0) continue;
      const key = (d.z < 0.5 ? 0 : d.z < 0.75 ? 1 : 2) * 100 + level;
      let path = rainPaths.get(key);
      if (!path) { path = new Path2D(); rainPaths.set(key, path); }
      path.moveTo(d.x, d.y); path.lineTo(d.x + d.len * slant, d.y - d.len);
    }
    for (const [key, path] of rainPaths) {
      ctx.lineWidth = RAIN_WIDTHS[Math.floor(key / 100)];
      ctx.strokeStyle = `rgba(${INK.join(",")},${((key % 100) * 0.015).toFixed(3)})`;
      ctx.stroke(path);
    }
    drawSplashes(still ? 0 : dt);

    if (running) raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduceMotion.matches) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() { running = false; cancelAnimationFrame(raf); }

  // washi grain sits over the painting as a static layer, so it is never redrawn
  const grain = hero.querySelector(".hero__grain");
  if (grain) grain.style.backgroundImage = `url(${paperTile(SEED + 5).toDataURL()})`;

  bake();
  frame(performance.now());
  scene.classList.add("is-ready");
  play();

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { bake(); frame(performance.now()); }, 120);
  }).observe(scene);

  new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : pause())).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  reduceMotion.addEventListener("change", () => { pause(); frame(performance.now()); play(); });
})();
