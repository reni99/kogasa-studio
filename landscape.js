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

  // The stack, back to front. Soft washes and mist don't need retina resolution;
  // the near hill with the pines does.
  const STACK = [
    { key: "far",  parallax: 0.18, dpr: 1,   delay: 0 },
    { key: "fog0", parallax: 0.14, dpr: 1,   delay: 0.2, fog: true },
    { key: "mid",  parallax: 0.10, dpr: 1.5, delay: 0.35 },
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
    const u1 = 0.84, u2 = 0.915;
    pine(nr, W * u1, near.ridge(u1) * H + 6, 300 * pineScale, -0.18, SEED + 8);
    pine(nr, W * u2, near.ridge(u2) * H + 6, 190 * pineScale, 0.22, SEED + 9);

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
  // A small creature in silhouette, facing the way it walks: hunched back with a little
  // hump, head carried low and forward, big white eyes. It shuffles like an old person,
  // short alternating steps with a walking stick, under the red umbrella.
  // Local units, origin on the ground between its feet, +x is forward, -y is up.

  const SILHOUETTE = "#141413";

  function drawWalker(x, y, s, alpha, t) {
    const phase = t * 2.2;                       // one step every ~1.4 s
    const stride = Math.sin(phase);              // -1 … 1
    const bob = -Math.abs(Math.sin(phase)) * 0.7;
    const sway = Math.sin(phase) * 0.025;
    const blink = t > 0 && (t % 4.3) < 0.13 ? 0.12 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(sway);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = SILHOUETTE;
    ctx.strokeStyle = SILHOUETTE;

    // walking stick, planted ahead, swinging with the steps
    const caneTop = { x: 11.5, y: -9.5 + bob };
    const caneTip = { x: 15.5 + stride * 1.6, y: 0 };
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(caneTop.x, caneTop.y - 1.2); ctx.lineTo(caneTip.x, caneTip.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(caneTop.x - 2, caneTop.y - 1.6); ctx.quadraticCurveTo(caneTop.x, caneTop.y - 3, caneTop.x + 0.3, caneTop.y - 1); ctx.stroke();

    // legs: short shuffling steps
    const leg = (dir, width) => {
      const footX = dir * 2.6 + (dir > 0 ? stride : -stride) * 1.8;
      const lift = Math.max(0, dir > 0 ? stride : -stride) * 0.8;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(dir * 1.2, -5 + bob); ctx.lineTo(footX, -lift); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(footX + 0.9, -lift - 0.3, 2.1, 1, 0, 0, Math.PI * 2); ctx.fill();
    };
    leg(-1, 2.6);

    // body and head: one hunched silhouette
    ctx.save();
    ctx.translate(0, bob);
    ctx.beginPath();
    ctx.moveTo(-8.5, -4.5);
    ctx.bezierCurveTo(-11, -11, -10.5, -18.5, -6, -21.5);    // back rising to the hump
    ctx.bezierCurveTo(-2.5, -24, 2.5, -22, 5, -18);          // over the hump, shoulders falling forward
    ctx.bezierCurveTo(6.5, -15.5, 7, -11, 5.5, -8);           // chest
    ctx.bezierCurveTo(4, -5, 0, -3.8, -3, -3.8);              // belly
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, -14.8, 6.2, 5.6, -0.15, 0, Math.PI * 2); ctx.fill();   // head, low and forward
    ctx.beginPath(); ctx.ellipse(5.2, -19.8, 1.6, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();  // ear
    // arm reaching forward to the stick
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(3, -13.5); ctx.quadraticCurveTo(8, -9.5, caneTop.x, caneTop.y - bob); ctx.stroke();
    // arm holding the umbrella
    ctx.beginPath(); ctx.moveTo(1, -16); ctx.quadraticCurveTo(4, -21, 3.2, -24); ctx.stroke();

    // big white eyes, looking ahead
    const eye = (ex, ey, rx, ry) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * blink, 0, 0, Math.PI * 2); ctx.fill();
      if (blink === 1) {
        ctx.fillStyle = SILHOUETTE;
        ctx.beginPath(); ctx.arc(ex + rx * 0.35, ey + ry * 0.15, rx * 0.42, 0, Math.PI * 2); ctx.fill();
      }
    };
    eye(7.4, -15.6, 1.9, 2.5);   // far eye, a little smaller
    eye(11.1, -15.3, 2.3, 2.9);  // near eye
    ctx.restore();

    leg(1, 2.6);

    // umbrella: shaft from the raised hand, red canopy above the hump
    ctx.save();
    ctx.translate(0, bob);
    ctx.strokeStyle = SILHOUETTE;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(3.2, -23.5); ctx.lineTo(1.2, -40.5); ctx.stroke();
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
  }

  // ───────── frame ─────────

  const WALK_SECONDS = 90;
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

    // walker follows the near ridge
    const p = still ? 0.45 : (t % WALK_SECONDS) / WALK_SECONDS;
    const u = 0.5 + 0.3 * p;
    const fade = still ? 1 : smooth(0, 0.05, p) * (1 - smooth(0.95, 1, p));
    const s = (H / 640) * 1.3;
    const wx = u * W;
    const wy = near.ridge(u) * H + 1;
    drawWalker(wx, wy, s, fade, still ? 0 : t);

    // rain at several depths, batched into a few paths by thickness and strength
    ctx.lineCap = "round";
    const RAIN_WIDTHS = [0.7, 1.0, 1.3];
    const rainPaths = new Map();
    for (const d of drops) {
      if (!still) {
        d.y += d.speed * dt;
        d.x -= d.speed * dt * 0.2;
        if (d.y - d.len > H) { d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + 80) - 40 + H * 0.2; }
      }
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
      path.moveTo(d.x, d.y); path.lineTo(d.x + d.len * 0.2, d.y - d.len);
    }
    for (const [key, path] of rainPaths) {
      ctx.lineWidth = RAIN_WIDTHS[Math.floor(key / 100)];
      ctx.strokeStyle = `rgba(${INK.join(",")},${((key % 100) * 0.015).toFixed(3)})`;
      ctx.stroke(path);
    }

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
