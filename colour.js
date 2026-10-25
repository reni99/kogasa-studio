// Kogasa Studio — the colour painting behind the stamp book.
//
// The same ink-wash technique as the header, now with pigment: watercolour blooms that
// pool darker at their edges, a flowering plum branch, and flecks of gold leaf (箔).
// It is painted once per size, together with a grey copy underneath; main.js fades the
// colour copy in over the grey one on scroll (an opacity change only, so it stays smooth).

(() => {
  const canvas = document.querySelector(".colour__paint");
  const grey = document.querySelector(".colour__grey");
  if (!canvas || !canvas.getContext || !window.Ink) return;
  const { mulberry32, smooth, noise2, paperPattern } = window.Ink;
  const ctx = canvas.getContext("2d");
  const SEED = 2718;
  const PAPER = [236, 235, 230];

  // Pigments, placed around the edges so the pages and text stay calm.
  const BLOOMS = [
    { x: 0.94, y: 0.06, r: 0.30, c: [214, 92, 116], s: 0.42 },  // plum
    { x: 0.62, y: 0.02, r: 0.18, c: [236, 176, 70], s: 0.30 },  // gold ochre
    { x: 0.02, y: 0.30, r: 0.24, c: [226, 104, 74], s: 0.30 },  // vermilion
    { x: 0.04, y: 0.78, r: 0.30, c: [60, 96, 172], s: 0.38 },   // indigo
    { x: 0.36, y: 1.00, r: 0.26, c: [112, 152, 92], s: 0.34 },  // moss
    { x: 0.80, y: 0.92, r: 0.30, c: [152, 102, 176], s: 0.36 }, // wisteria
    { x: 0.98, y: 0.52, r: 0.20, c: [72, 160, 168], s: 0.30 },  // celadon
  ];

  let W = 0, H = 0, DPR = 1;

  function bloom(b, index) {
    const unit = Math.sqrt(W * H) * 0.9;
    const R = b.r * unit;
    const res = 0.25;
    const size = Math.ceil(R * 2.3 * res);
    const rand = mulberry32(SEED + index * 13);
    const shape = noise2(rand), wash = noise2(rand), grain = noise2(rand);
    const img = new ImageData(size, size);
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - c) / res, dy = (y - c) / res;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const rr = R * (0.68 + 0.5 * shape(Math.cos(ang) * 1.6 + index * 7, Math.sin(ang) * 1.6 + index * 7));
        const d = dist / rr;
        if (d > 1.06) continue;
        const body = (1 - smooth(0, 1, d)) * 0.55 + 0.2;
        const rim = 0.55 * Math.exp(-Math.pow((1 - d) / 0.05, 2));      // pigment pooling at the edge
        let a = b.s * (body + rim);
        a *= 0.6 + 0.7 * wash(dx / 48 + index * 3, dy / 48);
        a *= 0.82 + 0.36 * grain(dx / 3, dy / 3);                       // granulation
        a *= 1 - smooth(0.98, 1.06, d);
        a = Math.min(Math.max(a, 0), 1);
        const i = (y * size + x) * 4;
        img.data[i] = b.c[0]; img.data[i + 1] = b.c[1]; img.data[i + 2] = b.c[2]; img.data[i + 3] = a * 255;
      }
    }
    const small = document.createElement("canvas");
    small.width = size; small.height = size;
    small.getContext("2d").putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.filter = "blur(4px)";
    ctx.drawImage(small, b.x * W - R * 1.15, b.y * H - R * 1.15, R * 2.3, R * 2.3);
    ctx.restore();
  }

  function stroke(x0, y0, x1, y1, w0, w1, alpha, rand) {
    const steps = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    const bend = (rand() - 0.5) * 0.25;
    let px = x0, py = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * (y1 - y0) * bend;
      const ny = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * (x1 - x0) * bend;
      if (rand() > 0.08) {
        ctx.lineWidth = (w0 + (w1 - w0) * t) * (0.75 + rand() * 0.5);
        ctx.strokeStyle = `rgba(42,34,30,${(alpha * (0.7 + rand() * 0.3)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      }
      px = nx; py = ny;
    }
    return { x: px, y: py };
  }

  function blossom(x, y, r, rand, open = true) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const tint = rand() < 0.5 ? [222, 96, 120] : [236, 140, 156];
    if (!open) {
      ctx.fillStyle = `rgba(${tint.join(",")},0.8)`;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.4, r * 0.5, rand(), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const rot = rand() * Math.PI;
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * Math.PI * 2) / 5;
      const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
      ctx.fillStyle = `rgba(${tint.join(",")},${(0.42 + rand() * 0.2).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.52, r * 0.46, a, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${tint.map((v) => v * 0.7).join(",")},0.35)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(214,170,60,0.9)";
    ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(42,34,30,0.7)";
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 7; k++) {
      const a = rand() * Math.PI * 2, l = r * (0.35 + rand() * 0.25);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      ctx.fillStyle = "rgba(42,34,30,0.8)";
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * l, y + Math.sin(a) * l, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }

  function plumBranch(rand) {
    const s = Math.min(W / 1200, 1.1);
    ctx.lineCap = "round";
    const flowers = [];
    function grow(x, y, ang, len, width, depth) {
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      const end = stroke(x, y, ex, ey, width, width * 0.6, 0.88, rand);
      const twigs = depth > 0 ? 1 + Math.round(rand()) : 0;
      for (let i = 0; i < twigs; i++) {
        const t = 0.4 + rand() * 0.5;
        const bx = x + (end.x - x) * t, by = y + (end.y - y) * t;
        grow(bx, by, ang + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5), len * (0.45 + rand() * 0.25), width * 0.55, depth - 1);
      }
      // blossoms cling to the outer twigs
      const count = depth <= 1 ? 3 + Math.round(rand() * 3) : Math.round(rand() * 2);
      for (let i = 0; i < count; i++) {
        const t = 0.3 + rand() * 0.75;
        flowers.push({ x: x + (end.x - x) * t + (rand() - 0.5) * 8 * s, y: y + (end.y - y) * t + (rand() - 0.5) * 8 * s, open: rand() > 0.3 });
      }
      if (depth > 0) grow(end.x, end.y, ang + (rand() - 0.5) * 0.6, len * 0.7, width * 0.7, depth - 1);
    }
    grow(W + 10, H * 0.015, Math.PI * 0.86, 260 * s, 15 * s, 3);
    for (const f of flowers) blossom(f.x, f.y, (f.open ? 9 + rand() * 5 : 6) * s, rand, f.open);
  }

  function goldLeaf(rand) {
    for (let i = 0; i < 70; i++) {
      // gather the leaf toward the right half and the plum branch
      const x = W * (0.45 + Math.pow(rand(), 0.7) * 0.55) - rand() * W * 0.1;
      const y = H * Math.pow(rand(), 1.4);
      const r = 1.2 + Math.pow(rand(), 3) * 9;
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, "rgba(176,132,48,0.95)");
      g.addColorStop(0.5, "rgba(232,204,128,0.95)");
      g.addColorStop(1, "rgba(190,148,62,0.95)");
      ctx.fillStyle = g;
      ctx.beginPath();
      const verts = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < verts; k++) {
        const a = (k / verts) * Math.PI * 2 + rand() * 0.6;
        const rr = r * (0.55 + rand() * 0.6);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
  }

  function paint() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ctx.fillStyle = `rgb(${PAPER.join(",")})`;
    ctx.fillRect(0, 0, W, H);
    BLOOMS.forEach(bloom);

    const rand = mulberry32(SEED);
    plumBranch(rand);
    goldLeaf(rand);

    ctx.fillStyle = paperPattern(ctx, SEED + 1);
    ctx.fillRect(0, 0, W, H);

    // fade out at the top and bottom, painted in rather than a CSS mask, which the browser
    // would have to redraw on every frame of a resize
    const edge = Math.min(0.5, 140 / H);
    const fade = ctx.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(edge, "rgba(0,0,0,1)");
    fade.addColorStop(1 - edge, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    paintGrey();
    canvas.classList.add("is-ready");
  }

  // The same painting without colour: the rainy state the section fades in from.
  function paintGrey() {
    if (!grey) return;
    grey.width = canvas.width;
    grey.height = canvas.height;
    const g = grey.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      d[i] = d[i + 1] = d[i + 2] = lum;
    }
    g.putImageData(img, 0, 0);
    grey.classList.add("is-ready");
  }

  paint();
  let timer = 0;
  let lastWidth = W;
  new ResizeObserver(() => {
    const width = Math.round(canvas.getBoundingClientRect().width);
    const height = Math.round(canvas.getBoundingClientRect().height);
    if (width === lastWidth && Math.abs(height - H) < 40) return;
    lastWidth = width;
    clearTimeout(timer);
    timer = setTimeout(paint, 400);   // once the resize has settled
  }).observe(canvas);
})();
