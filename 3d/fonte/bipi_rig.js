// Rig do Bipi: IK dos braços (tudo no espaço local do Bipi), celular e expressões.
(function () {
  const SH = { L: [-.56, 1.16, 0], R: [.56, 1.16, 0] }, L1 = .55, L2 = .55, TIP = .215;
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]], mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
  function ik(side, wrist, pole) {
    const S = SH[side]; let v = sub(wrist, S), d = len(v); const mx = (L1 + L2) * .995; if (d > mx) { v = mul(v, mx / d); d = mx; }
    if (d < .12) { v = mul(nrm(v), .12); d = .12; }
    const u = nrm(v), a = (L1*L1 - L2*L2 + d*d) / (2*d), h = Math.sqrt(Math.max(0, L1*L1 - a*a));
    let p = pole || [side === "L" ? -.5 : .5, -1, -.35]; p = nrm(sub(p, mul(u, dot(p, u))));
    const E = add(add(S, mul(u, a)), mul(p, h)), W = add(S, v);
    return { S, E, W };
  }
  // alvo: ponta do dedo
  function ikTip(side, tip, pole) {
    let w = tip; let r;
    for (let i = 0; i < 3; i++) { r = ik(side, w, pole); const dir = nrm(sub(r.W, r.E)); w = sub(tip, mul(dir, TIP)); }
    return ik(side, w, pole);
  }
  function armPose(side, r, pose) {
    pose["braco" + side] = { aim: sub(r.E, r.S), tx: r.S[0], ty: r.S[1], tz: r.S[2] };
    pose["antebraco" + side] = { aim: sub(r.W, r.E), tx: r.E[0], ty: r.E[1], tz: r.E[2] };
  }
  // ponto local do celular -> espaço local do Bipi
  function phonePt(M, ph, p) {
    const m = M.trs(ph.t, ph.rx || 0, ph.ry || 0, ph.rz || 0, [1, 1, 1]);
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  }
  window.BipiRig = { ik, ikTip, armPose, phonePt, SH };
})();
