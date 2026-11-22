(() => {
  if (window.__bgKaleido) return;
  window.__bgKaleido = true;

  // name, hex, rarity (1 = обычный вес, 0.12 = редкий)
  const COLORS = [
    ['Белый', '#edece4', 0.1],
    ['Серно-жёлтый', '#d8cc1e'],
    ['Жёлтый', '#e3b81b'],
    ['Оливковый светлый', '#a3a34c'],
    ['Оливковый тёмный', '#6c7030'],
    ['Тёмно-оранжевый', '#a94e14'],
    ['Оранжевый', '#d06a1f'],
    ['Красный', '#c22a22'],
    ['Тёмно-красный', '#6e1515'],
    ['Бордовый', '#721b2d'],
    ['Малиновый', '#b01e3c'],
    ['Фиолетовый', '#6a369b'],
    ['Светло-фиолетовый', '#b49ad8'],
    ['Сливовый', '#5e2a4f'],
    ['Лавандовый', '#a08ccb'],
    ['Маджента', '#c0267a'],
    ['Розовый', '#d97ea4'],
    ['Индиго', '#3a3c8c'],
    ['Синий', '#2b56b0'],
    ['Дорожный синий', '#1f4a82'],
    ['Лазурный', '#2c82c4'],
    ['Небесно-голубой', '#5fa6d6'],
    ['Бирюзово-синий', '#207a8c'],
    ['Мятный', '#6fbf9f'],
    ['Тёмно-зелёный', '#1e5636'],
    ['Травянистый', '#4c8c3a'],
    ['Светло-зелёный', '#83be57'],
    ['Лайм', '#9bcb34'],
    ['Коричневый', '#6a4426'],
    ['Ореховый', '#8a5a2c'],
    ['Светло-коричневый', '#b1855c'],
    ['Бежевый', '#c9b48c'],
    ['Золотой', '#c9a227', 0.1],
    ['Серебряный', '#b9bdc6', 0.1]
  ];
  const LIST = COLORS.map(([, hex]) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    if (lum > 0.7) {
      const k = 0.7 / lum;
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    return c;
  });
  const WEIGHTS = COLORS.map(c => c[2] || 1);

  const canvas = document.createElement('canvas');
  canvas.id = 'bg-kaleido';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100vh',
    display: 'block', zIndex: '-1', pointerEvents: 'none', opacity: '.55'
  });
  document.body.insertBefore(canvas, document.body.firstChild);
  document.documentElement.classList.add('bg-live');

  const state = {
    picks: pickThree(),
    colors: null,
    from: null,
    to: null,
    morph: 1,
    slot: 0,
    wait: 45 + Math.random() * 30
  };
  state.colors = state.picks.map(i => LIST[i].slice());
  state.from = state.colors.map(c => c.slice());
  state.to = state.colors.map(c => c.slice());

  const seed = [Math.random() * 60, Math.random() * 60];
  const sectors = 7 + Math.floor(Math.random() * 8);
  const rot = Math.random() * Math.PI * 2;
  const zoom = 0.75 + Math.random() * 0.6;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (gl) initGL(gl); else init2D();

  function pickWeighted(skip) {
    let total = 0;
    for (let i = 0; i < LIST.length; i++) {
      if (!skip || skip.indexOf(i) < 0) total += WEIGHTS[i];
    }
    let r = Math.random() * total;
    for (let i = 0; i < LIST.length; i++) {
      if (skip && skip.indexOf(i) >= 0) continue;
      r -= WEIGHTS[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  function pickThree() {
    const idx = [];
    while (idx.length < 3) {
      const i = pickWeighted(idx);
      if (idx.indexOf(i) < 0) idx.push(i);
    }
    return idx;
  }

  function stepColors(dt) {
    if (state.morph < 1) {
      state.morph = Math.min(1, state.morph + dt / 13);
      const k = state.morph * state.morph * (3 - 2 * state.morph);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          state.colors[i][j] = state.from[i][j] + (state.to[i][j] - state.from[i][j]) * k;
        }
      }
      return;
    }
    state.wait -= dt;
    if (state.wait > 0) return;
    state.from = state.colors.map(c => c.slice());
    state.to = state.colors.map(c => c.slice());
    state.slot = (state.slot + 1) % 3;
    const j = pickWeighted(state.picks);
    state.picks[state.slot] = j;
    state.to[state.slot] = LIST[j];
    state.morph = 0;
    state.wait = 30 + Math.random() * 24;
  }

  function initGL(gl) {
    const VS = `
      attribute vec2 a;
      void main(){ gl_Position = vec4(a, 0.0, 1.0); }
    `;
    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 uRes;
      uniform float uTime;
      uniform vec3 uC1;
      uniform vec3 uC2;
      uniform vec3 uC3;
      uniform vec2 uSeed;
      uniform float uSectors;
      uniform float uRot;
      uniform float uZoom;

      float h21(vec2 p){
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }
      float vn(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = h21(i);
        float b = h21(i + vec2(1.0, 0.0));
        float c = h21(i + vec2(0.0, 1.0));
        float d = h21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0;
        float a = 0.55;
        for (int k = 0; k < 3; k++){
          v += a * vn(p);
          p = p * 2.07 + vec2(3.1, 5.3);
          a *= 0.55;
        }
        return v;
      }

      void main(){
        float side = min(uRes.x, uRes.y);
        vec2 base = (gl_FragCoord.xy - vec2(uRes.x * 0.35, uRes.y * 0.42)) / side;

        float t = uTime;
        float r = length(base);
        float ang = atan(base.y, base.x) + uRot + t * 0.011;
        float sec = 6.2831853 / uSectors;
        float m = mod(ang, sec);
        float f = m < sec * 0.5 ? m : sec - m;
        float rr = r * (1.0 + 0.05 * sin(t * 0.03));
        vec2 q = vec2(cos(f), abs(sin(f))) * rr * 5.0 * uZoom + uSeed;

        float n = 0.68 * fbm(q * 1.55 + vec2(t * 0.018, -t * 0.014))
                + 0.32 * fbm(q * 3.4 + vec2(-t * 0.014, t * 0.02) + 9.0);
        n += 0.05 * sin(rr * 22.0 - t * 0.35);
        n = clamp(n, 0.0, 1.0);

        vec3 col = mix(uC1 * 0.6, uC1, smoothstep(0.0, 0.42, n));
        col = mix(col, uC2, smoothstep(0.12, 0.72, n));
        col = mix(col, uC3, smoothstep(0.42, 1.0, n));
        col *= 0.95 + 0.06 * sin(n * 5.0 + rr * 1.5);

        float alpha = smoothstep(0.1, 0.72, n) * 0.75;
        alpha *= smoothstep(1.4, 0.5, r);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * 0.5);
      }
    `;

    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    const vs = shader(gl.VERTEX_SHADER, VS);
    const fs = shader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { init2D(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      init2D();
      return;
    }
    gl.useProgram(prog);

    const uC = [1, 2, 3].map(i => gl.getUniformLocation(prog, 'uC' + i));
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    gl.uniform2f(gl.getUniformLocation(prog, 'uSeed'), seed[0], seed[1]);
    gl.uniform1f(gl.getUniformLocation(prog, 'uSectors'), sectors);
    gl.uniform1f(gl.getUniformLocation(prog, 'uRot'), rot);
    gl.uniform1f(gl.getUniformLocation(prog, 'uZoom'), zoom);

    function pushColors() {
      for (let i = 0; i < 3; i++) {
        const c = state.colors[i];
        gl.uniform3f(uC[i], c[0], c[1], c[2]);
      }
    }
    pushColors();

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    let lastTime = 0;
    function paint(t) {
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let lastW = 0, lastH = 0;
    function resize(force) {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!force && Math.abs(cw - lastW) < 2 && Math.abs(ch - lastH) < 140) return;
      lastW = cw; lastH = ch;
      const budget = 1.4e6;
      const dpr = Math.max(1, Math.min(devicePixelRatio || 1, 2.5, Math.sqrt(budget / (cw * ch))));
      const w = Math.max(1, Math.round(cw * dpr));
      const h = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      paint(lastTime);
    }

    resize();
    paint(0);

    if (!reduce) {
      let raf = 0, last = 0, prev = performance.now();
      const start = performance.now();
      const frame = now => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.2, (now - prev) / 1000);
        prev = now;
        stepColors(dt);
        pushColors();
        if (now - last < 40) return;
        last = now;
        resize(false);
        paint((now - start) / 1000);
      };
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else { last = 0; prev = performance.now(); raf = requestAnimationFrame(frame); }
      });
    }

    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resize(false), 120);
    };
    const onFlip = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resize(true), 120);
    };
    addEventListener('resize', onResize, { passive: true });
    addEventListener('orientationchange', onFlip, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);
  }

  function init2D() {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const SECTOR = Math.PI * 2 / sectors;
    const L = 48;
    const lat = new Float32Array(L * L);
    for (let i = 0; i < lat.length; i++) lat[i] = Math.random();

    const noise = (x, y) => {
      x -= Math.floor(x / L) * L;
      y -= Math.floor(y / L) * L;
      const x0 = x | 0, y0 = y | 0;
      const fx = x - x0, fy = y - y0;
      const x1 = (x0 + 1) % L, y1 = (y0 + 1) % L;
      const i0 = y0 * L, i1 = y1 * L;
      const a = lat[i0 + x0], b = lat[i0 + x1], c = lat[i1 + x0], d = lat[i1 + x1];
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };

    let W = 0, H = 0, img = null, data = null, cx = 0, cy = 0, R = 1;

    function size() {
      const w = Math.min(420, Math.max(200, Math.round(innerWidth * 0.3)));
      const h = Math.round(w * Math.min(1.6, Math.max(0.5, innerHeight / innerWidth)));
      W = w; H = h;
      canvas.width = W;
      canvas.height = H;
      img = ctx.createImageData(W, H);
      data = img.data;
      cx = W * 0.35;
      cy = H * 0.42;
      R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) || 1;
    }

    function render(t) {
      const c0 = state.colors[0], c1 = state.colors[1], c2 = state.colors[2];
      const grad = [
        c0.map(v => v * 0.5),
        c0,
        c1,
        c2
      ];
      const at = n => {
        const stops = [0.0, 0.28, 0.58, 0.94];
        let i = 0;
        while (i < 2 && n > stops[i + 1]) i++;
        const k = Math.max(0, Math.min(1, (n - stops[i]) / (stops[i + 1] - stops[i])));
        const a = grad[i], b = grad[i + 1];
        return [
          (a[0] + (b[0] - a[0]) * k) * 255,
          (a[1] + (b[1] - a[1]) * k) * 255,
          (a[2] + (b[2] - a[2]) * k) * 255
        ];
      };

      const pulse = 1 + 0.05 * Math.sin(t * 0.03);
      const t1 = t * 0.018, t2 = t * 0.014;
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) / R;
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / R;
          const r = Math.hypot(dx, dy);
          const i = (y * W + x) * 4;
          if (r > 1.4) { data[i + 3] = 0; continue; }
          let a = Math.atan2(dy, dx) + rot + t * 0.011;
          let m = a % SECTOR;
          if (m < 0) m += SECTOR;
          const f = m < SECTOR / 2 ? m : SECTOR - m;
          const rr = r * pulse;
          const fx = rr * Math.cos(f) * zoom + seed[0], fy = Math.abs(rr * Math.sin(f)) * zoom + seed[1];
          let v = 0.68 * noise(fx * 8 + t1, fy * 8 - t2)
                + 0.32 * noise(fx * 18 - t1 * 0.7 + 11, fy * 18 + t2 * 0.8 + 7);
          v += 0.05 * Math.sin(rr * 22 - t * 0.35);
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const c = at(v);
          data[i] = c[0];
          data[i + 1] = c[1];
          data[i + 2] = c[2];
          data[i + 3] = (v > 0.28 ? 0.85 : 0) * Math.max(0, Math.min(1, (1.4 - r) / 0.85)) * 153;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    let raf = 0, last = 0, prev = performance.now();
    const start = performance.now();
    const loop = now => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (now - prev) / 1000);
      prev = now;
      stepColors(dt);
      if (now - last < 90) return;
      last = now;
      render((now - start) / 1000);
    };

    size();
    render(0);
    if (!reduce) raf = requestAnimationFrame(loop);

    let rt = 0;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        size();
        render((performance.now() - start) / 1000);
      }, 180);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (reduce) return;
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = 0; prev = performance.now(); raf = requestAnimationFrame(loop); }
    });
  }
})();
