(() => {
  if (window.__bgKaleido) return;
  window.__bgKaleido = true;

  const canvas = document.createElement('canvas');
  canvas.id = 'bg-kaleido';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  document.documentElement.classList.add('bg-live');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (gl) initGL(gl); else init2D();

  function initGL(gl) {
    const VS = `
      attribute vec2 a;
      void main(){ gl_Position = vec4(a, 0.0, 1.0); }
    `;
    const FS = `
      precision mediump float;
      uniform vec2 uRes;
      uniform float uTime;

      float hash(vec2 p){
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < 4; i++){
          v += a * vnoise(p);
          p = p * 2.07 + vec2(3.1, 5.7);
          a *= 0.55;
        }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p = uv - vec2(0.35, 0.42);
        p.x *= uRes.x / uRes.y;
        p *= 2.2;

        float t = uTime;
        float r = length(p);
        float ang = atan(p.y, p.x) + t * 0.04;
        float sec = 6.2831853 / 8.0;
        float m = mod(ang, sec);
        float f = m < sec * 0.5 ? m : sec - m;
        float rr = r * (1.0 + 0.05 * sin(t * 0.13));
        vec2 q = vec2(cos(f), sin(f)) * rr;

        float n = 0.62 * fbm(q * 3.2 + vec2(t * 0.07, -t * 0.05))
                + 0.38 * fbm(q * 7.3 + vec2(-t * 0.05, t * 0.08) + 9.0);
        n += 0.06 * sin(rr * 16.0 - t * 1.1);
        n = clamp(n, 0.0, 1.0);

        float bands = floor(n * 7.0) / 7.0;
        float line = smoothstep(0.42, 0.5, abs(fract(n * 7.0) - 0.5));

        vec3 c1 = vec3(0.16, 0.52, 0.62);
        vec3 c2 = vec3(0.35, 0.28, 0.78);
        vec3 c3 = vec3(0.88, 0.54, 0.28);
        vec3 c4 = vec3(0.28, 0.8, 0.52);
        float w = 0.5 + 0.5 * sin(f * 2.7 + rr * 3.5 + t * 0.18);
        vec3 col = mix(c1, c2, smoothstep(0.12, 0.88, bands));
        col = mix(col, c3, 0.5 * pow(w, 2.0));
        col = mix(col, c4, 0.35 * smoothstep(0.55, 0.95, n));
        col = floor(col * 12.0) / 12.0;
        col = mix(col, vec3(0.92), line * 0.18);

        float alpha = smoothstep(0.06, 0.55, n) * 0.95;
        alpha *= smoothstep(1.6, 0.5, r);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * 0.66);
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }

    resize();
    gl.uniform1f(uTime, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reduce) {
      let raf = 0, last = 0;
      const start = performance.now();
      const frame = now => {
        raf = requestAnimationFrame(frame);
        if (now - last < 40) return;
        last = now;
        gl.uniform1f(uTime, (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else { last = 0; raf = requestAnimationFrame(frame); }
      });
    }

    let t = 0;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(resize, 180);
    }, { passive: true });
  }

  function init2D() {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const SECTORS = 8;
    const SECTOR = Math.PI * 2 / SECTORS;
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
      const h = Math.round(w * Math.min(1.4, Math.max(0.5, innerHeight / innerWidth)));
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
      const pulse = 1 + 0.07 * Math.sin(t * 0.11);
      const t1 = t * 0.06, t2 = t * 0.045;
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) / R;
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / R;
          const r = Math.hypot(dx, dy);
          const i = (y * W + x) * 4;
          if (r > 1.45) { data[i + 3] = 0; continue; }
          let a = Math.atan2(dy, dx) + t * 0.03;
          let m = a % SECTOR;
          if (m < 0) m += SECTOR;
          const f = m < SECTOR / 2 ? m : SECTOR - m;
          const rr = r * pulse;
          const fx = rr * Math.cos(f), fy = rr * Math.sin(f);
          let v = 0.68 * noise(fx * 5.2 + t1, fy * 5.2 - t2)
                + 0.32 * noise(fx * 10.7 - t1 * 0.7 + 11, fy * 10.7 + t2 * 0.8 + 7);
          v += 0.07 * Math.sin(rr * 15 - t * 1.3);
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const w = 0.5 + 0.5 * Math.sin(fx * 3.1 + fy * 2.3 + t * 0.17);
          const edge = r > 1.14 ? Math.max(0, (1.34 - r) / 0.2) : 1;
          data[i] = 70 + 60 * w + 30 * v;
          data[i + 1] = 120 + 45 * (1 - w) + 25 * v;
          data[i + 2] = 150 + 35 * w + 20 * v;
          data[i + 3] = Math.pow(v, 2.1) * 118 * edge;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    let raf = 0, last = 0;
    const start = performance.now();
    const loop = now => {
      raf = requestAnimationFrame(loop);
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
      else { last = 0; raf = requestAnimationFrame(loop); }
    });
  }
})();
