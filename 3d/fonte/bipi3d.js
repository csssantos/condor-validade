// Renderizador WebGL mínimo do Bipi (sem bibliotecas). Carrega bipi.glb, desenha com luz suave,
// contato de sombra no chão e brilho (glow) nos LEDs/olhos/feixe. Uso:
//   const b = await Bipi3D.create(canvas, glbArrayBuffer);
//   b.render({ rotY, pose:{ bracoR:{rz:2.3}, ... }, cam:{...}, pos:[x,y,z], scale })
(function () {
  const M = {
    ident() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; },
    trs(t, rx, ry, rz, s) {
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      // R = Ry * Rx * Rz
      const Rz = [cz,sz,0, -sz,cz,0, 0,0,1], Rx = [1,0,0, 0,cx,sx, 0,-sx,cx], Ry = [cy,0,-sy, 0,1,0, sy,0,cy];
      const m3 = (A, B) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let q = 0; for (let k = 0; k < 3; k++) q += A[k*3+r] * B[c*3+k]; o[c*3+r] = q; } return o; };
      const R = m3(Ry, m3(Rx, Rz));
      return [R[0]*s[0],R[1]*s[0],R[2]*s[0],0, R[3]*s[1],R[4]*s[1],R[5]*s[1],0, R[6]*s[2],R[7]*s[2],R[8]*s[2],0, t[0],t[1],t[2],1];
    },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; },
    lookAt(e, c, u) {
      let z = [e[0]-c[0], e[1]-c[1], e[2]-c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
      let x = [u[1]*z[2]-u[2]*z[1], u[2]*z[0]-u[0]*z[2], u[0]*z[1]-u[1]*z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
      const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
      return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1];
    },
    normalMat(m) { // inversa transposta do 3x3
      const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      const A = e*i-f*h, B = f*g-d*i, C = d*h-e*g, det = a*A + b*B + c*C || 1;
      return [A/det, (c*h-b*i)/det, (b*f-c*e)/det, B/det, (a*i-c*g)/det, (c*d-a*f)/det, C/det, (b*g-a*h)/det, (a*e-b*d)/det];
    },
  };
  const lin = c => c.map(v => Math.pow(v, 2.2));

  function parseGLB(buf) {
    const dv = new DataView(buf);
    const jl = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
    const bin = buf.slice(20 + jl + 8);
    return { json, bin };
  }

  async function create(canvas, glb, opts = {}) {
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL indisponível");
    const { json, bin } = parseGLB(glb);
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const P = prog(`attribute vec3 aP; attribute vec3 aN; uniform mat4 uM, uVP; uniform mat3 uNM; varying vec3 vN, vW;
      void main(){ vec4 w = uM * vec4(aP,1.0); vW = w.xyz; vN = normalize(uNM * aN); gl_Position = uVP * w; }`,
    `precision mediump float; varying vec3 vN, vW; uniform vec3 uC, uE, uCam; uniform float uR, uFlash;
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(uCam - vW);
        vec3 L1 = normalize(vec3(0.55,0.85,0.7)), L2 = normalize(vec3(-0.8,0.25,0.35)), L3 = normalize(vec3(0.0,0.3,-1.0));
        float d1 = max(dot(n,L1),0.0), d2 = max(dot(n,L2),0.0);
        vec3 amb = mix(vec3(0.05,0.10,0.22), vec3(0.50,0.62,0.85), n.y*0.5+0.5);
        vec3 col = uC * (amb*0.95 + vec3(1.0,0.97,0.92)*d1*1.05 + vec3(0.45,0.6,1.0)*d2*0.45);
        float sh = mix(180.0, 14.0, uR); vec3 h = normalize(L1+v);
        col += vec3(1.0)*pow(max(dot(n,h),0.0), sh) * (1.0-uR) * 0.55;
        float fr = pow(1.0 - max(dot(n,v),0.0), 3.0);
        col += vec3(0.35,0.55,0.95) * fr * 0.30 * (0.4 + max(dot(n,L3),0.0));
        col += uE * (1.15 + uFlash);
        col = col / (1.0 + col*0.18);
        gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
      }`);
    const G = prog(`attribute vec2 aQ; uniform vec4 uRect; varying vec2 vQ; void main(){ vQ = aQ; gl_Position = vec4(uRect.xy + aQ*uRect.zw, 0.0, 1.0); }`,
      `precision mediump float; varying vec2 vQ; uniform vec4 uCol; uniform float uShape;
      void main(){ vec2 q = vQ; float d = uShape > 0.5 ? length(vec2(q.x*0.5, q.y*3.0)) : length(q);
        float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(uCol.rgb * a * uCol.a, a * uCol.a); }`);
    const T = prog(`attribute vec3 aP; attribute vec2 aT; uniform mat4 uM, uVP; varying vec2 vT; varying vec3 vW;
      void main(){ vec4 w = uM * vec4(aP,1.0); vW = w.xyz; vT = aT; gl_Position = uVP * w; }`,
    `precision mediump float; varying vec2 vT; varying vec3 vW; uniform sampler2D uTex; uniform float uAsp, uGlow; uniform vec3 uCam;
      void main(){
        vec2 q = (vT - 0.5) * vec2(uAsp, 1.0) * 2.0; vec2 hb = vec2(uAsp, 1.0) - 0.1;
        vec2 d = abs(q) - hb; float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.1;
        if (sd > 0.0) discard;
        vec3 c = texture2D(uTex, vT).rgb;
        c += vec3(0.55,0.75,1.0) * uGlow;
        float edge = smoothstep(0.0, -0.012, sd); c *= mix(0.55, 1.0, edge);
        gl_FragColor = vec4(c, 1.0);
      }`);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const anis = gl.getExtension("EXT_texture_filter_anisotropic");
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // malhas
    const bv = json.bufferViews, ac = json.accessors;
    const sl = i => { const v = bv[i]; return bin.slice(v.byteOffset, v.byteOffset + v.byteLength); };
    const meshes = json.meshes.map(m => {
      const p = m.primitives[0], a = ac[p.attributes.POSITION], n = ac[p.attributes.NORMAL], ix = ac[p.indices], tc = p.attributes.TEXCOORD_0 != null ? ac[p.attributes.TEXCOORD_0] : null;
      const mk = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
      return { pos: mk(gl.ARRAY_BUFFER, new Float32Array(sl(a.bufferView))), nor: mk(gl.ARRAY_BUFFER, new Float32Array(sl(n.bufferView))),
               idx: mk(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sl(ix.bufferView))), count: ix.count, mat: p.material,
               uv: tc ? mk(gl.ARRAY_BUFFER, new Float32Array(sl(tc.bufferView))) : null };
    });
    const mats = json.materials.map(m => ({ name: m.name, c: lin(m.pbrMetallicRoughness.baseColorFactor.slice(0, 3)), r: m.pbrMetallicRoughness.roughnessFactor, e: lin(m.emissiveFactor || [0, 0, 0]) }));
    const nodes = json.nodes;
    const byName = {}; nodes.forEach((n, i) => { byName[n.name] = i; });
    const parent = new Array(nodes.length).fill(-1);
    nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
    const rootIdx = json.scenes[0].nodes[0];
    const aLoc = { P: [gl.getAttribLocation(P, "aP"), gl.getAttribLocation(P, "aN")], G: gl.getAttribLocation(G, "aQ") };
    const U = n => gl.getUniformLocation(P, n), UG = n => gl.getUniformLocation(G, n), UT = n => gl.getUniformLocation(T, n);

    function world(pose, rootM, phoneM) {
      const W = new Array(nodes.length);
      const walk = (i, pm) => {
        const n = nodes[i], o = (pose && pose[n.name]) || {};
        const rest = (n.extras && n.extras.rest) || [0, 0, 0], t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
        let lm;
        if (o.aim) {
          let y = o.aim.map(v => -v); const l = Math.hypot(...y) || 1; y = y.map(v => v / l);
          let ref = Math.abs(y[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
          let x = [y[1]*ref[2]-y[2]*ref[1], y[2]*ref[0]-y[0]*ref[2], y[0]*ref[1]-y[1]*ref[0]]; const lx = Math.hypot(...x); x = x.map(v => v / lx);
          const z = [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
          lm = [x[0],x[1],x[2],0, y[0],y[1],y[2],0, z[0],z[1],z[2],0, o.tx ?? t[0], o.ty ?? t[1], o.tz ?? t[2], 1];
        } else lm = M.trs([o.tx ?? t[0], o.ty ?? t[1], o.tz ?? t[2]], o.rx ?? rest[0], o.ry ?? rest[1], o.rz ?? rest[2],
          o.s != null ? [o.s, o.s, o.s] : [o.sx ?? s[0], o.sy ?? s[1], o.sz ?? s[2]]);
        W[i] = M.mul((phoneM && n.name === "celular") ? phoneM : pm, lm);
        (n.children || []).forEach(c => walk(c, W[i]));
      };
      walk(rootIdx, rootM); return W;
    }

    function render(o = {}) {
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const cam = Object.assign({ eye: [0, 1.7, 7.6], at: [0, 1.45, 0], fov: 32 }, o.cam || {});
      const V = M.lookAt(cam.eye, cam.at, [0, 1, 0]), Pm = M.persp(cam.fov * Math.PI / 180, w / h, 0.1, 60), VP = M.mul(Pm, V);
      const sc = o.scale ?? 1, pos = o.pos || [0, 0, 0];
      const rootM = M.trs(pos, o.rotX || 0, o.rotY || 0, o.rotZ || 0, [sc, sc * (o.squash ?? 1), sc]);
      const phoneM = o.phone ? M.trs(o.phone.pos || [0,0,0], 0, o.phone.rotY || 0, 0, [o.phone.scale ?? 1, o.phone.scale ?? 1, o.phone.scale ?? 1]) : null;
      const W = world(o.pose, rootM, phoneM);
      // sombra de contato
      if (o.shadow !== false) {
        const cx = pos[0], cz = pos[2], gy = pos[1];
        const proj = (x, y, z) => { const p = [x, y, z, 1]; const r = [0,1,2,3].map(k => VP[k]*p[0] + VP[4+k]*p[1] + VP[8+k]*p[2] + VP[12+k]); return [r[0]/r[3], r[1]/r[3]]; };
        const c = proj(cx, gy + 0.01, cz), e = proj(cx + 1.15 * sc, gy + 0.01, cz);
        const rx = Math.abs(e[0] - c[0]);
        gl.useProgram(G); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(aLoc.G); gl.vertexAttribPointer(aLoc.G, 2, gl.FLOAT, false, 0, 0);
        const ry = rx * (w / h) * 0.22 * (o.shadowLen ?? 1);
        gl.uniform4f(UG("uRect"), c[0], c[1], rx * 1.15, ry); gl.uniform4f(UG("uCol"), 0, 0.02, 0.08, (o.shadowA ?? 0.85) * Math.max(0.25, 1 - (o.lift || 0) * 0.25)); gl.uniform1f(UG("uShape"), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(aLoc.G);
      }
      // malha
      gl.useProgram(P); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
      gl.uniformMatrix4fv(U("uVP"), false, VP); gl.uniform3f(U("uCam"), ...cam.eye);
      const screenDraws = [];
      nodes.forEach((n, i) => {
        if (n.mesh == null) return;
        const m = meshes[n.mesh], mt = mats[m.mat], Wm = W[i];
        if (mt.name === "tela") { screenDraws.push([m, Wm]); return; }
        gl.uniformMatrix4fv(U("uM"), false, Wm); gl.uniformMatrix3fv(U("uNM"), false, M.normalMat(Wm));
        const glowMul = (o.glow && o.glow[n.name]) ?? 1;
        gl.uniform3f(U("uC"), ...mt.c); gl.uniform3f(U("uE"), mt.e[0]*glowMul, mt.e[1]*glowMul, mt.e[2]*glowMul);
        gl.uniform1f(U("uR"), mt.r); gl.uniform1f(U("uFlash"), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(aLoc.P[0]); gl.vertexAttribPointer(aLoc.P[0], 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.nor); gl.enableVertexAttribArray(aLoc.P[1]); gl.vertexAttribPointer(aLoc.P[1], 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
      });
      if (screenDraws.length) {
        gl.useProgram(T); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        if (o.screen) {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, o.screen);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (anis) gl.texParameterf(gl.TEXTURE_2D, anis.TEXTURE_MAX_ANISOTROPY_EXT, 8);
        }
        gl.uniformMatrix4fv(UT("uVP"), false, VP); gl.uniform1i(UT("uTex"), 0); gl.uniform1f(UT("uAsp"), o.screenAsp || 0.4615); gl.uniform1f(UT("uGlow"), o.screenGlow || 0);
        const aP = gl.getAttribLocation(T, "aP"), aT = gl.getAttribLocation(T, "aT");
        screenDraws.forEach(([m, Wm]) => {
          gl.uniformMatrix4fv(UT("uM"), false, Wm);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
        });
        gl.disableVertexAttribArray(aT);
      }
      // brilho nos emissivos
      if (o.bloom !== false) {
        const headM = W[byName.cabeca];
        const fwd = [headM[8], headM[9], headM[10]], fl = Math.hypot(...fwd);
        const toCam = [cam.eye[0] - headM[12], cam.eye[1] - headM[13], cam.eye[2] - headM[14]], tl = Math.hypot(...toCam);
        const face = Math.max(0, Math.min(1, ((fwd[0]*toCam[0] + fwd[1]*toCam[1] + fwd[2]*toCam[2]) / (fl * tl) - 0.1) / 0.5));
        gl.useProgram(G); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(aLoc.G); gl.vertexAttribPointer(aLoc.G, 2, gl.FLOAT, false, 0, 0);
        const spr = (name, col, rad, k, shape, always) => {
          if (byName[name] == null) return; const m = W[byName[name]], p = [m[12], m[13], m[14], 1];
          const r = [0,1,2,3].map(q => VP[q]*p[0] + VP[4+q]*p[1] + VP[8+q]*p[2] + VP[12+q]);
          const gm = ((o.glow && o.glow[name]) ?? 1) * (always ? 1 : face) * k; if (gm < 0.01) return;
          const sx = (rad * sc / r[3]) * Pm[5] / (w / h), sy = (rad * sc / r[3]) * Pm[5];
          gl.uniform4f(UG("uRect"), r[0]/r[3], r[1]/r[3], sx * (shape ? 1.05 : 1), sy * (shape ? 1 : 1)); gl.uniform4f(UG("uCol"), col[0], col[1], col[2], gm * 0.9); gl.uniform1f(UG("uShape"), shape ? 1 : 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        spr("olhoL", [0.18, 0.95, 0.45], 0.42, 1, false); spr("olhoR", [0.18, 0.95, 0.45], 0.42, 1, false);
        spr("feixe", [1.0, 0.12, 0.12], 0.34, 0.7, true);
        spr("ledCabeca", [0.18, 0.95, 0.45], 0.30, 1, false); spr("ledPeito", [0.18, 0.95, 0.45], 0.26, 1, false);
        spr("antenaBola", [1.0, 0.2, 0.2], 0.34, 0.9, false, true);
        gl.disableVertexAttribArray(aLoc.G);
      }
      gl.disable(gl.BLEND);
      return { W, VP, byName };
    }
    return { render, gl, byName, nodes, M };
  }
  window.Bipi3D = { create };
})();
