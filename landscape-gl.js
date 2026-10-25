// Kogasa Studio — the header's ink washes and mist, painted on the GPU.
//
// The same maths as the canvas painting in landscape.js (value noise, ink pooling at the
// ridge, dry-brush edges, tiny trees on the ridge), as WebGL 2 shaders. Painting a layer
// takes a millisecond or two, so the header can be repainted on every frame of a resize.
// One hidden WebGL canvas does the work; each result is copied onto the layer's own 2D
// canvas, so the CSS parallax keeps moving finished layers exactly as before.
//
// Each wash is painted in two passes, like the canvas version: first at about 1 CSS px
// per pixel (where the noise lives), then softened by a small blur and drawn at screen
// resolution, with the sharp dry-brush edge and the ridge trees on top.

window.InkGL = (() => {
  const VERTEX = `#version 300 es
    in vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
    precision highp float;
    precision highp int;
    uniform vec2 uSize;     // pixels in this pass
    uniform vec2 uScale;    // pixels per CSS px (x, y)
    out vec4 outColor;

    // CSS px, top-left origin
    vec2 css() { return vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uScale; }

    // value noise on a 128 × 128 table, as Ink.noise2
    float n2(highp sampler2D t, vec2 p) {
      vec2 i = floor(p), f = p - i;
      vec2 u = f * f * (3.0 - 2.0 * f);
      ivec2 i0 = ivec2(mod(i, 128.0)), i1 = ivec2(mod(i + 1.0, 128.0));
      float a = texelFetch(t, ivec2(i0.x, i0.y), 0).r;
      float b = texelFetch(t, ivec2(i1.x, i0.y), 0).r;
      float c = texelFetch(t, ivec2(i0.x, i1.y), 0).r;
      float d = texelFetch(t, ivec2(i1.x, i1.y), 0).r;
      return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
    }

    // per-column data, one texel per CSS px, read with linear interpolation
    uniform highp sampler2D uColumns;
    uniform float uColumnCount;
    vec4 column(float x) {
      float fx = clamp(x, 0.0, uColumnCount - 1.0);
      int i = int(floor(fx));
      vec4 a = texelFetch(uColumns, ivec2(i, 0), 0);
      vec4 b = texelFetch(uColumns, ivec2(min(i + 1, int(uColumnCount) - 1), 0), 0);
      return mix(a, b, fx - float(i));
    }`;

  // pass 1: the wash's ink density. Columns: ridge (CSS px), dryness, dry-brush gap, thickness.
  const WASH = COMMON + `
    uniform highp sampler2D uWash, uWrinkle, uGrain;
    uniform float uStrength, uFalloff, uEdge;
    uniform vec2 uWorld;    // texture x = uWorld.x + css x * uWorld.y
    void main() {
      vec2 q = css();
      vec4 c = column(q.x);
      float ridge = c.r;
      if (q.y < ridge - 1.0) { outColor = vec4(0.0); return; }
      float X = uWorld.x + q.x * uWorld.y, Y = q.y;
      float below = q.y - ridge;
      float d = below / uFalloff;
      float a = uStrength * exp(-d * 2.1);
      a *= 0.55 + 0.75 * n2(uWash, vec2(X / 70.0, Y / 16.0));
      a += uStrength * 0.28 * (n2(uWrinkle, vec2(X / 6.0, Y / 34.0)) - 0.5) * exp(-d * 1.4);
      a += uEdge * exp(-max(below, 0.0) / 3.2) * c.g;
      a *= 0.82 + 0.36 * n2(uGrain, vec2(X / 2.2, Y / 2.2));
      if (q.y < ridge) a *= max(0.0, 1.0 - (ridge - q.y));
      outColor = vec4(clamp(a, 0.0, 1.0));
    }`;

  // pass 2: blur the wash up to screen resolution, add the dry-brush edge and the ridge trees
  const WASH_OUT = COMMON + `
    uniform sampler2D uDensity;
    uniform vec2 uDensitySize;   // texture size in pixels
    uniform float uDensityRes;   // density pixels per CSS px
    uniform float uDensityRows;  // rows used in the density texture
    uniform float uBlur;         // blur radius in density pixels
    uniform vec2 uBrush;         // dry brush: width (CSS px), alpha; alpha 0 = none
    uniform highp sampler2D uTrees;   // per column: x (CSS px), height, alpha
    uniform float uHasTrees;
    uniform vec3 uInk;

    float density(vec2 q) {
      vec2 px = vec2(q.x * uDensityRes, uDensityRows - q.y * uDensityRes);
      return texture(uDensity, px / uDensitySize).r;
    }
    float over(float top, float under) { return top + under * (1.0 - top); }

    void main() {
      vec2 q = css();
      vec4 c = column(q.x);
      if (q.y < c.r - (uHasTrees > 0.5 ? 18.0 : 3.0)) { outColor = vec4(0.0); return; }

      // a small gaussian (3 × 3 taps, bilinear), like the canvas version's blur filter
      float a = 0.0, total = 0.0;
      float s = max(uBlur, 0.001);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        float w = exp(-float(i * i + j * j) / (2.0 * s * s));
        a += w * density(q + vec2(float(i), float(j)) / uDensityRes);
        total += w;
      }
      a /= total;

      float pixel = 1.0 / min(uScale.x, uScale.y);   // one screen pixel, in CSS px
      if (uBrush.y > 0.0 && c.b >= 0.32 && abs(q.y - c.r) < 8.0) {
        float slope = (column(q.x + 1.0).r - column(q.x - 1.0).r) * 0.5;
        float dist = abs(q.y - (c.r + 0.6)) / sqrt(1.0 + slope * slope);
        float width = uBrush.x * (0.35 + 0.9 * c.a);
        float cover = clamp((width * 0.5 - dist) / pixel + 0.5, 0.0, 1.0);
        a = over(uBrush.y * (0.5 + 0.6 * c.b) * cover, a);
      }

      if (uHasTrees > 0.5 && q.y > c.r - 16.0 && q.y < c.r + 6.0) {
        float t = 0.0;
        int x0 = int(floor(q.x));
        for (int k = -6; k <= 6; k++) {
          int ci = x0 + k;
          if (ci < 0 || ci >= int(uColumnCount)) continue;
          vec4 tree = texelFetch(uTrees, ivec2(ci, 0), 0);
          if (tree.g <= 0.0) continue;
          float h = tree.g, base = column(tree.r).r + 1.5;
          float dx = q.x - tree.r;
          float trunk = clamp((0.45 - abs(dx)) / pixel + 0.5, 0.0, 1.0) * step(base - h, q.y) * step(q.y, base);
          t = over(tree.b * trunk, t);
          for (int e = 0; e < 3; e++) {
            float ey = base - h * (0.35 + float(e) * 0.25);
            float rx = h * (0.32 - float(e) * 0.07), ry = h * 0.09;
            float dd = length(vec2(dx / rx, (q.y - ey) / ry));
            float cover = clamp((1.0 - dd) * min(rx, ry) / pixel + 0.5, 0.0, 1.0);
            t = over(tree.b * cover, t);
          }
        }
        a = over(t, a);
      }
      outColor = vec4(uInk * a, a);
    }`;

  // mist: a soft band of paper-coloured cloud
  const FOG = COMMON + `
    uniform highp sampler2D uCloud, uDetail;
    uniform float uCenter, uThickness, uHeight;
    void main() {
      vec2 q = css();
      float band = exp(-pow((q.y / uHeight - uCenter) / uThickness, 2.0));
      if (band < 0.01) { outColor = vec4(0.0); return; }
      float a = band * (0.35 + 0.85 * n2(uCloud, vec2(q.x / 260.0, q.y / 60.0))) * (0.8 + 0.4 * n2(uDetail, vec2(q.x / 70.0, q.y / 30.0)));
      outColor = vec4(min(a, 1.0) * 235.0 / 255.0);
    }`;

  const FOG_OUT = COMMON + `
    uniform sampler2D uDensity;
    uniform vec2 uDensitySize;
    uniform float uDensityRes;
    uniform float uDensityRows;
    uniform vec3 uPaper;
    void main() {
      vec2 q = css();
      // a wide soft blur (5 × 5 taps, 8 CSS px apart), as the canvas version's blur(10px)
      float a = 0.0, total = 0.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        float w = exp(-float(i * i + j * j) / 3.125);
        vec2 o = q + vec2(float(i), float(j)) * 8.0;
        vec2 px = vec2(o.x * uDensityRes, uDensityRows - o.y * uDensityRes);
        a += w * texture(uDensity, px / uDensitySize).r;
        total += w;
      }
      a /= total;
      outColor = vec4(uPaper * a, a);
    }`;

  function create() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;

    function program(fragment) {
      const p = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "p");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const uniforms = {};
      const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(p, i).name;
        uniforms[name] = gl.getUniformLocation(p, name);
      }
      return { p, u: uniforms };
    }

    let programs;
    try {
      programs = { wash: program(WASH), washOut: program(WASH_OUT), fog: program(FOG), fogOut: program(FOG_OUT) };
    } catch (error) {
      console.warn("Ink washes fall back to the canvas:", error);
      return null;
    }

    // one triangle that covers the viewport
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);

    function floatTexture(width, height, data, channels) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      upload(t, width, height, data, channels);
      return t;
    }
    function upload(t, width, height, data, channels) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (channels === 1) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    }

    // a 128 × 128 noise table, as Ink.noise2 builds it
    const noiseTexture = (table) => floatTexture(128, 128, table, 1);
    const columns = floatTexture(1, 1, new Float32Array(4), 4);
    const trees = floatTexture(1, 1, new Float32Array(4), 4);
    const noTrees = floatTexture(1, 1, new Float32Array(4), 4);

    // the density pass renders into this; it only grows, so resizing allocates nothing
    const density = { texture: gl.createTexture(), fbo: gl.createFramebuffer(), width: 0, height: 0 };
    gl.bindTexture(gl.TEXTURE_2D, density.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    function densityTarget(width, height) {
      if (width > density.width || height > density.height) {
        density.width = Math.max(width, density.width);
        density.height = Math.max(height, density.height);
        gl.bindTexture(gl.TEXTURE_2D, density.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, density.width, density.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, density.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, density.texture, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, density.fbo);
      gl.viewport(0, 0, width, height);
    }

    // the drawing buffer only grows too
    function screenTarget(width, height) {
      if (width > canvas.width || height > canvas.height) {
        canvas.width = Math.max(width, canvas.width);
        canvas.height = Math.max(height, canvas.height);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }

    function bind(prog, textures) {
      gl.useProgram(prog.p);
      textures.forEach(([name, texture], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(prog.u[name], unit);
      });
    }
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

    // copy the finished pixels (bottom-left of the drawing buffer) onto a 2D canvas
    function copyTo(target, width, height) {
      const o = target.getContext("2d");
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = "copy";
      o.drawImage(canvas, 0, canvas.height - height, width, height, 0, 0, width, height);
      o.globalCompositeOperation = "source-over";
    }

    // Paints one mountain layer onto `target`, at the target's current bitmap size.
    // view: { width, height } in CSS px; layer: wash settings and noise textures;
    // columnData: 4 floats per CSS px column; treeData: the same, or null.
    function paintWash(target, view, layer, columnData, columnCount, treeData, brush) {
      const width = target.width, height = target.height;
      const scale = [width / view.width, height / view.height];
      upload(columns, columnCount, 1, columnData, 4);
      if (treeData) upload(trees, columnCount, 1, treeData, 4);

      const res = layer.res;
      const dw = Math.ceil(view.width * res), dh = Math.ceil(view.height * res);
      densityTarget(dw, dh);
      let prog = programs.wash;
      bind(prog, [["uWash", layer.wash], ["uWrinkle", layer.wrinkle], ["uGrain", layer.grain], ["uColumns", columns]]);
      gl.uniform2f(prog.u.uSize, dw, dh);
      gl.uniform2f(prog.u.uScale, res, res);
      gl.uniform1f(prog.u.uColumnCount, columnCount);
      gl.uniform1f(prog.u.uStrength, layer.strength);
      gl.uniform1f(prog.u.uFalloff, layer.falloff * view.height);
      gl.uniform1f(prog.u.uEdge, layer.edge);
      gl.uniform2f(prog.u.uWorld, view.worldStart, view.worldScale);
      draw();

      screenTarget(width, height);
      prog = programs.washOut;
      bind(prog, [["uDensity", density.texture], ["uColumns", columns], ["uTrees", treeData ? trees : noTrees]]);
      gl.uniform2f(prog.u.uSize, width, height);
      gl.uniform2f(prog.u.uScale, scale[0], scale[1]);
      gl.uniform1f(prog.u.uColumnCount, columnCount);
      gl.uniform2f(prog.u.uDensitySize, density.width, density.height);
      gl.uniform1f(prog.u.uDensityRes, res);
      gl.uniform1f(prog.u.uDensityRows, dh);
      gl.uniform1f(prog.u.uBlur, layer.blur * res);
      gl.uniform2f(prog.u.uBrush, brush ? brush.width : 0, brush ? brush.alpha : 0);
      gl.uniform1f(prog.u.uHasTrees, treeData ? 1 : 0);
      gl.uniform3f(prog.u.uInk, 27 / 255, 27 / 255, 26 / 255);
      draw();
      copyTo(target, width, height);
    }

    // Paints a band of mist onto `target` (which spans view.width CSS px).
    function paintFog(target, view, fog) {
      const width = target.width, height = target.height;
      const res = 0.25;
      const dw = Math.ceil(view.width * res), dh = Math.ceil(view.height * res);
      densityTarget(dw, dh);
      let prog = programs.fog;
      bind(prog, [["uCloud", fog.cloud], ["uDetail", fog.detail]]);
      gl.uniform2f(prog.u.uSize, dw, dh);
      gl.uniform2f(prog.u.uScale, res, res);
      gl.uniform1f(prog.u.uCenter, fog.center);
      gl.uniform1f(prog.u.uThickness, fog.thickness);
      gl.uniform1f(prog.u.uHeight, view.height);
      draw();

      screenTarget(width, height);
      prog = programs.fogOut;
      bind(prog, [["uDensity", density.texture]]);
      gl.uniform2f(prog.u.uSize, width, height);
      gl.uniform2f(prog.u.uScale, width / view.width, height / view.height);
      gl.uniform2f(prog.u.uDensitySize, density.width, density.height);
      gl.uniform1f(prog.u.uDensityRes, res);
      gl.uniform1f(prog.u.uDensityRows, dh);
      gl.uniform3f(prog.u.uPaper, 236 / 255, 235 / 255, 230 / 255);
      draw();
      copyTo(target, width, height);
    }

    return { canvas, noiseTexture, paintWash, paintFog, isLost: () => gl.isContextLost() };
  }

  return { create };
})();
