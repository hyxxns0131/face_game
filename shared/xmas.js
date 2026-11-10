// 🎄 뉴욕 크리스마스 배경: 밤하늘 · 픽셀 스카이라인 · 큰 트리 · 꼬마전구 · 내리는 눈
// 모든 페이지에서 import "../shared/xmas.js" 한 줄이면 적용됩니다.

const PX = 4; // 픽셀 크기 (화면 4px = 배경 1칸)

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function makeCanvas(z) {
  const c = document.createElement("canvas");
  Object.assign(c.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh",
    zIndex: z, pointerEvents: "none", imageRendering: "pixelated",
  });
  document.body.prepend(c);
  return c;
}

// ───────── 배경 (한 번 그리고 화면 크기 바뀔 때만 다시) ─────────
const bg = makeCanvas("-2");
function drawBackground() {
  const w = Math.ceil(innerWidth / PX), h = Math.ceil(innerHeight / PX);
  bg.width = w;
  bg.height = h;
  const g = bg.getContext("2d");
  const rnd = seeded(20251225);

  // 밤하늘
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#070b24");
  sky.addColorStop(0.55, "#16205a");
  sky.addColorStop(1, "#33306e");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // 별
  for (let i = 0; i < (w * h) / 220; i++) {
    g.fillStyle = rnd() < 0.15 ? "#fff6c2" : "rgba(255,255,255,.7)";
    g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.6), 1, 1);
  }
  // 달
  const mx = Math.floor(w * 0.82), my = Math.floor(h * 0.13), mr = Math.max(5, Math.floor(Math.min(w, h) * 0.05));
  g.fillStyle = "#fff4cf";
  for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) if (x * x + y * y <= mr * mr) g.fillRect(mx + x, my + y, 1, 1);
  g.fillStyle = "#e9dca8";
  g.fillRect(mx - 2, my - 1, 2, 2);
  g.fillRect(mx + 2, my + 2, 1, 1);

  // 먼 빌딩 (어두운 층)
  const base = h;
  const far = "#1d2457", near = "#0e1236";
  let x = 0;
  while (x < w) {
    const bw = 6 + Math.floor(rnd() * 10), bh = Math.floor(h * (0.18 + rnd() * 0.22));
    g.fillStyle = far;
    g.fillRect(x, base - bh, bw, bh);
    x += bw;
  }

  // 엠파이어 스테이트 빌딩 느낌의 계단식 타워
  const ex = Math.floor(w * 0.18), eh = Math.floor(h * 0.62);
  g.fillStyle = near;
  const steps = [[18, 0.0], [14, 0.35], [10, 0.6], [6, 0.78], [3, 0.88], [1, 0.97]];
  for (const [sw, sy] of steps) g.fillRect(ex - Math.floor(sw / 2), Math.floor(base - eh + eh * sy), sw, Math.ceil(eh - eh * sy));
  // 꼭대기 빨강·초록 조명 (크리스마스 시즌!)
  g.fillStyle = "#ff3b3b";
  g.fillRect(ex - 3, Math.floor(base - eh + eh * 0.78), 6, 2);
  g.fillStyle = "#2ecc71";
  g.fillRect(ex - 5, Math.floor(base - eh + eh * 0.6), 10, 2);

  // 가까운 빌딩 + 불 켜진 창문
  x = 0;
  while (x < w) {
    const bw = 8 + Math.floor(rnd() * 14), bh = Math.floor(h * (0.1 + rnd() * 0.2));
    if (Math.abs(x + bw / 2 - ex) > 14) {
      g.fillStyle = near;
      g.fillRect(x, base - bh, bw, bh);
      for (let wy = base - bh + 2; wy < base - 2; wy += 3) {
        for (let wx = x + 2; wx < x + bw - 2; wx += 3) {
          if (rnd() < 0.35) {
            g.fillStyle = rnd() < 0.85 ? "#ffd86b" : "#ff8a5c";
            g.fillRect(wx, wy, 1, 1);
          }
        }
      }
    }
    x += bw + (rnd() < 0.3 ? 1 : 0);
  }

  // 록펠러 센터 트리
  const tx = Math.floor(w * 0.86), th = Math.floor(h * 0.34), tb = base - Math.floor(h * 0.02);
  for (let i = 0; i < th; i++) {
    const half = Math.floor((i / th) * th * 0.32) + 1;
    g.fillStyle = i % 6 < 3 ? "#1f7a3f" : "#18662f";
    g.fillRect(tx - half, tb - th + i, half * 2 + 1, 1);
  }
  g.fillStyle = "#5a3418";
  g.fillRect(tx - 2, tb, 5, Math.floor(h * 0.02));
  // 별
  g.fillStyle = "#ffd23f";
  g.fillRect(tx - 1, tb - th - 3, 3, 3);
  g.fillRect(tx, tb - th - 5, 1, 7);
  g.fillRect(tx - 3, tb - th - 2, 7, 1);
  // 트리 전구 위치 저장 (반짝이게)
  treeLights = [];
  for (let i = 4; i < th; i += 3) {
    const half = Math.floor((i / th) * th * 0.32);
    for (let k = 0; k < 2; k++) treeLights.push({ x: tx - half + Math.floor(rnd() * (half * 2 + 1)), y: tb - th + i, c: ["#ff3b3b", "#ffd23f", "#4fc3ff", "#ff7af0"][Math.floor(rnd() * 4)] });
  }
  // 바닥 눈
  g.fillStyle = "#e8f1ff";
  g.fillRect(0, base - 2, w, 2);
}
let treeLights = [];

// ───────── 눈 + 반짝이는 트리 전구 ─────────
const fx = makeCanvas("-1");
let flakes = [];
function resizeFx() {
  fx.width = Math.ceil(innerWidth / 2);
  fx.height = Math.ceil(innerHeight / 2);
  const n = Math.floor((fx.width * fx.height) / 2600);
  flakes = Array.from({ length: n }, () => newFlake(true));
}
function newFlake(anywhere) {
  return {
    x: Math.random() * fx.width,
    y: anywhere ? Math.random() * fx.height : -4,
    s: Math.random() < 0.2 ? 2 : 1,
    v: 12 + Math.random() * 22,
    p: Math.random() * 6.28,
  };
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const g = fx.getContext("2d");
  g.clearRect(0, 0, fx.width, fx.height);

  // 트리 전구 반짝 (배경 해상도 → fx 해상도 변환)
  const k = PX / 2;
  treeLights.forEach((l, i) => {
    if (Math.sin(now / 300 + i * 1.7) > 0) {
      g.fillStyle = l.c;
      g.fillRect(l.x * k, l.y * k, k, k);
    }
  });

  g.fillStyle = "rgba(255,255,255,.9)";
  for (const f of flakes) {
    f.y += f.v * dt;
    f.x += Math.sin(now / 900 + f.p) * 8 * dt;
    if (f.y > fx.height) Object.assign(f, newFlake(false));
    g.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
  }
  requestAnimationFrame(tick);
}

// ───────── 꼬마전구 줄 ─────────
function addLights() {
  const strip = document.createElement("div");
  strip.className = "xmas-lights";
  const n = Math.ceil(innerWidth / 44);
  const colors = ["#ff3b3b", "#ffd23f", "#2ecc71", "#4fc3ff", "#ff7af0"];
  strip.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--c:${colors[i % colors.length]};--d:${(i % 3) * 0.4}s"></i>`).join("");
  document.body.appendChild(strip);
}

function init() {
  drawBackground();
  resizeFx();
  addLights();
  requestAnimationFrame(tick);
  let t;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      drawBackground();
      resizeFx();
      document.querySelector(".xmas-lights")?.remove();
      addLights();
    }, 150);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
