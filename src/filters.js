// 얼굴 필터: Face Landmarker의 478개 점 위에 웃긴 그림을 그립니다.
// (캔버스는 CSS로 좌우 반전되어 있어서, 원본 좌표 그대로 그리면 거울 화면과 맞습니다)

const pt = (lm, i, w, h) => ({ x: lm[i].x * w, y: lm[i].y * h });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 주요 얼굴 점 번호
const IDX = {
  leftEyeOuter: 33, leftEyeInner: 133,
  rightEyeInner: 362, rightEyeOuter: 263,
  noseTip: 1, underNose: 2, upperLip: 0,
  faceLeft: 234, faceRight: 454,
};

export function drawFilter(ctx, lm, name, w, h, t) {
  const p = (i) => pt(lm, i, w, h);
  const L = mid(p(IDX.leftEyeOuter), p(IDX.leftEyeInner));
  const R = mid(p(IDX.rightEyeInner), p(IDX.rightEyeOuter));
  const eyeW = dist(p(IDX.leftEyeOuter), p(IDX.leftEyeInner));
  const faceW = dist(p(IDX.faceLeft), p(IDX.faceRight));
  const angle = Math.atan2(R.y - L.y, R.x - L.x);
  const all = name === "all";

  if (name === "mustache" || all) mustache(ctx, mid(p(IDX.underNose), p(IDX.upperLip)), faceW * 0.5, angle);
  if (name === "googly" || all) {
    googly(ctx, L, eyeW * 0.9, t, 0);
    googly(ctx, R, eyeW * 0.9, t, 1.7);
  }
  if (name === "clown" || all) clownNose(ctx, p(IDX.noseTip), faceW * 0.1);
}

function googly(ctx, c, r, t, phase) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = "#111";
  ctx.stroke();
  // 데굴데굴 굴러가는 눈동자
  const px = c.x + Math.cos(t / 140 + phase) * r * 0.42;
  const py = c.y + Math.abs(Math.sin(t / 170 + phase)) * r * 0.42;
  ctx.beginPath();
  ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.restore();
}

function clownNose(ctx, c, r) {
  ctx.save();
  const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
  g.addColorStop(0, "#ff9a9a");
  g.addColorStop(0.4, "#ff2a2a");
  g.addColorStop(1, "#a30000");
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function mustache(ctx, c, width, angle) {
  const s = width / 2;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#2b1a0e";
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.05);
    ctx.bezierCurveTo(dir * s * 0.3, -s * 0.28, dir * s * 0.75, -s * 0.2, dir * s * 0.95, -s * 0.42);
    ctx.bezierCurveTo(dir * s * 1.05, -s * 0.2, dir * s * 0.85, s * 0.12, dir * s * 0.5, s * 0.14);
    ctx.bezierCurveTo(dir * s * 0.3, s * 0.15, dir * s * 0.1, s * 0.05, 0, s * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
