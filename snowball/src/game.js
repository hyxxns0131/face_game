// ☃️ 눈덩이 대작전
// 받기(눈송이에 손 대기) → 굴리기(손을 원 모양으로) → 던지기(상대 쪽으로 휙) → 피하기(빨간 조준점에서 벗어나기)
import { initPose, detectPoses } from "./pose.js";
import { startCamera } from "../../shared/camera.js";
import { Sfx } from "../../shared/sfx.js";
import { loadProfile, charOf, asset, heartsHTML, recordMatch } from "../../shared/profile.js";

// ───────── 조정 가능한 값 (640px 화면 기준) ─────────
const CFG = {
  flakeRate: 34,      // 초당 내리는 눈송이 수
  flakeArea: 45,      // 눈송이 1개 받을 때 늘어나는 양
  rollArea: 320,      // 손을 한 바퀴 돌릴 때 늘어나는 양
  rollMinSpeed: 0.2,  // 이 속도(화면너비/초) 이상 움직여야 굴리기로 인정
  catchPad: 26,       // 손 주변 눈송이 받는 범위
  minR: 16,           // 던질 수 있는 최소 눈덩이 반지름
  maxR: 60,           // 최대 반지름
  throwSpeed: 1.0,    // 던지기 판정: 상대 쪽으로 이 속도(화면너비/초) 이상 휘두르기
  cooldown: 700,      // 던진 뒤 다음 던지기까지 (ms)
  hitSlack: 0.7,      // 머리 크기 중 이만큼 겹치면 명중
};

const $ = (s) => document.querySelector(s);
const video = $("#video");
const cv = $("#cv");
const ctx = cv.getContext("2d");
const centerMsg = $("#center-msg");
const debugEl = $("#debug");
const prof = loadProfile();
const sfx = new Sfx();
sfx.enabled = prof.sound;

let W = 640, H = 480, S = 1;
const settings = { mode: "duo", time: prof.snowTime };
let state = "intro"; // intro | loading | ready | countdown | play | result | error
let camOn = false, poseReady = false, looping = false;
let players = [];
let flakes = [], shots = [], texts = [], splats = [], puffs = [];
let flakeAcc = 0, lastNow = 0, phaseStart = 0, playStart = 0, readySince = null, lastCount = null;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// ───────── 플레이어 ─────────
class Player {
  constructor(name, color, side, char = null) {
    this.name = name;
    this.color = color;
    this.side = side; // "L" 왼쪽(오른쪽으로 던짐) | "R"
    this.char = char;
    if (char) {
      this.img = new Image();
      this.img.src = asset(char.img);
    }
    this.reset();
  }
  reset() {
    this.hearts = prof.hearts;
    this.score = 0; this.hits = 0; this.throws = 0; this.dodges = 0; this.taken = 0; this.maxR = 0;
    this.present = false; this.head = null; this.headR = 40 * S;
    this.hand = null; this.handIdx = null; this.hist = [];
    this.r = 0; this.prevAng = null; this.rollAcc = 0; this.lastAbs = 0; this.cool = 0;
  }
  missing() {
    this.present = false; this.hand = null; this.hist = []; this.prevAng = null;
  }
}

function grow(p, amount) {
  const r2 = p.r * p.r + amount * S * S;
  p.r = Math.min(CFG.maxR * S, Math.sqrt(r2));
}

// 포즈 점 → 화면(거울) 좌표
function updateFromPose(p, lms, now) {
  const P = (i) => ({ x: (1 - lms[i].x) * W, y: lms[i].y * H, v: lms[i].visibility ?? 1 });
  const nose = P(0), ls = P(11), rs = P(12);
  p.present = true;
  p.head = p.head ? { x: lerp(p.head.x, nose.x, 0.6), y: lerp(p.head.y, nose.y, 0.6) } : { x: nose.x, y: nose.y };
  p.headR = Math.max(22 * S, dist(ls, rs) * 0.33);

  // 손: 15 = 왼손목, 16 = 오른손목. 더 높이 든 손으로 플레이 (눈덩이 들고 있으면 그 손 유지)
  const wr = [P(15), P(16)];
  const ok = wr.map((w) => w.v > 0.4 && w.y < H * 1.02);
  let idx = p.handIdx;
  const otherHigher = idx !== null && ok[1 - idx] && wr[1 - idx].y < wr[idx].y - 0.12 * H;
  if (idx === null || !ok[idx] || (p.r === 0 && otherHigher)) {
    idx = ok[0] && ok[1] ? (wr[0].y < wr[1].y ? 0 : 1) : ok[0] ? 0 : ok[1] ? 1 : null;
  }
  if (idx !== p.handIdx) { p.hist = []; p.prevAng = null; p.hand = null; }
  p.handIdx = idx;
  if (idx === null) { p.hand = null; return; }

  const w = wr[idx];
  p.hand = p.hand ? { x: lerp(p.hand.x, w.x, 0.6), y: lerp(p.hand.y, w.y, 0.6) } : { x: w.x, y: w.y };
  p.hist.push({ x: p.hand.x, y: p.hand.y, t: now });
  while (p.hist.length && now - p.hist[0].t > 160) p.hist.shift();
}

function assignPlayers(poses, now) {
  const [p1, p2] = players;
  if (settings.mode === "solo") {
    // 혼자 연습: 가장 왼쪽에 있는 사람이 P1
    const sorted = [...poses].sort((a, b) => (1 - a[0].x) - (1 - b[0].x));
    sorted[0] ? updateFromPose(p1, sorted[0], now) : p1.missing();
    return;
  }
  const items = poses.map((l) => ({ l, x: (1 - l[0].x) * W })).sort((a, b) => a.x - b.x);
  let L = null, R = null;
  if (items.length >= 2) { L = items[0]; R = items[items.length - 1]; }
  else if (items.length === 1) { if (items[0].x < W / 2) L = items[0]; else R = items[0]; }
  L ? updateFromPose(p1, L.l, now) : p1.missing();
  R ? updateFromPose(p2, R.l, now) : p2.missing();
}

// ───────── 받기 / 굴리기 / 던지기 ─────────
function stepPlayer(p, opp, dt, now) {
  p.cool -= dt * 1000;
  if (!p.hand) { p.prevAng = null; return; }

  // ❄️ 받기
  const reach = Math.max(p.r, 10 * S) + CFG.catchPad * S;
  for (const f of flakes) {
    if (!f.dead && dist(f, p.hand) < reach + f.r) {
      f.dead = true;
      grow(p, CFG.flakeArea);
      puffs.push({ x: f.x, y: f.y, t0: now, n: 4, size: 3 * S });
    }
  }

  // 🌀 굴리기: 손이 움직이는 방향이 한쪽으로 계속 돌아가면 원을 그린 것
  if (p.hist.length >= 2) {
    const a = p.hist[p.hist.length - 2], b = p.hist[p.hist.length - 1];
    const ddt = Math.max(0.001, (b.t - a.t) / 1000);
    const vx = (b.x - a.x) / ddt, vy = (b.y - a.y) / ddt;
    if (Math.hypot(vx, vy) > CFG.rollMinSpeed * W) {
      const ang = Math.atan2(vy, vx);
      if (p.prevAng !== null) {
        const d = Math.atan2(Math.sin(ang - p.prevAng), Math.cos(ang - p.prevAng));
        p.rollAcc += d;
      }
      p.prevAng = ang;
    } else p.prevAng = null;
  }
  p.rollAcc *= Math.pow(0.35, dt); // 가만히 있으면 서서히 0으로
  const abs = Math.abs(p.rollAcc);
  if (p.r > 0 && abs > p.lastAbs) grow(p, ((abs - p.lastAbs) / (2 * Math.PI)) * CFG.rollArea);
  p.lastAbs = abs;

  // 💨 던지기: 최근 0.16초 동안 상대 쪽으로 빠르게 휘둘렀는지
  if (p.r >= CFG.minR * S && p.cool <= 0 && p.hist.length >= 3) {
    const f = p.hist[0], l = p.hist[p.hist.length - 1];
    const ddt = (l.t - f.t) / 1000;
    if (ddt > 0.05) {
      const vx = (l.x - f.x) / ddt, vy = (l.y - f.y) / ddt;
      const dir = p.side === "L" ? 1 : -1;
      if (vx * dir > CFG.throwSpeed * W && Math.abs(vx) > Math.abs(vy) * 0.7) throwBall(p, opp, now);
    }
  }
}

function throwBall(p, opp, now) {
  const from = { ...p.hand };
  const to = opp.present && opp.head ? { ...opp.head } : { x: p.side === "L" ? W * 0.75 : W * 0.25, y: H * 0.4 };
  const dur = (0.75 + p.r / (90 * S)) * 1000; // 클수록 느리게
  shots.push({ owner: p, target: opp, from, to, r: p.r, t0: now, dur, done: false });
  p.throws++;
  p.maxR = Math.max(p.maxR, p.r);
  p.r = 0; p.rollAcc = 0; p.lastAbs = 0; p.prevAng = null; p.cool = CFG.cooldown;
  sfx.tone({ type: "triangle", from: 700, to: 180, dur: 0.25, vol: 0.15 });
}

const pointsFor = (r) => (r < 30 * S ? 1 : r < 48 * S ? 2 : 3);

function resolveShot(s, now) {
  const d = s.target;
  const endR = s.r * 1.3;
  // 화면 밖으로 도망가면 맞은 걸로 처리
  const hit = !d.present || !d.head || dist(d.head, s.to) < endR + d.headR * CFG.hitSlack;
  if (hit) {
    const pts = pointsFor(s.r);
    s.owner.score += pts;
    s.owner.hits++;
    d.taken++;
    d.hearts = Math.max(0, d.hearts - 1);
    renderTopbar(d);
    splats.push({ who: d, t0: now, r: endR, blobs: makeBlobs(endR) });
    texts.push({ text: `명중! +${pts}`, x: s.to.x, y: s.to.y - endR, color: s.owner.color, t0: now, big: true });
    sfx.honk();
    sfx.pop();
  } else {
    d.dodges++;
    puffs.push({ x: s.to.x, y: s.to.y, t0: now, n: 14, size: 6 * S });
    texts.push({ text: "회피! 😎", x: s.to.x, y: s.to.y - endR, color: "#e0f2fe", t0: now });
    sfx.boing();
  }
  renderTopbar();
}

function makeBlobs(r) {
  return Array.from({ length: 9 }, () => ({ dx: rand(-1, 1) * r * 0.9, dy: rand(-1, 1) * r * 0.9, r: rand(0.25, 0.6) * r }));
}

// ───────── 연습용 눈사람 봇 ─────────
function makeBot() {
  const b = new Player("SNOWMAN", "#7dd3fc", "R");
  b.isBot = true;
  b.nextThrow = 0;
  return b;
}

function stepBot(b, opp, dt, now) {
  const t = now / 1000;
  let x = W * 0.76 + Math.sin(t * 0.8) * W * 0.1;
  const y = H * 0.36 + Math.sin(t * 1.4) * H * 0.07;
  // 날아오는 눈덩이를 가끔 피함
  const inc = shots.find((s) => s.target === b);
  if (inc) {
    const tt = (now - inc.t0) / inc.dur;
    inc.botDodge ??= Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    if (tt > 0.35) x += inc.botDodge * W * 0.13 * Math.min(1, (tt - 0.35) / 0.3);
  }
  b.present = true;
  b.head = { x, y };
  b.headR = 34 * S;
  b.hand = { x: x - 60 * S, y: y + 55 * S };
  if (state === "play" && now >= b.nextThrow) {
    b.r = rand(16, 44) * S;
    throwBall(b, opp, now);
    b.nextThrow = now + rand(2600, 4400);
  }
}

// ───────── 화면 / 시작 ─────────
function msg(html, dim = false) {
  centerMsg.innerHTML = html;
  centerMsg.classList.toggle("dim", dim);
}

const C1 = charOf(prof.p1), C2 = charOf(prof.p2);
function makePlayers() {
  players = [
    new Player(C1.name, "#ff3f78", "L", C1),
    settings.mode === "solo" ? makeBot() : new Player(C2.name, "#8b6cff", "R", C2),
  ];
}

function renderIntro() {
  const fig = (img, name) => `<figure><img class="char px small" src="${img}" alt=""><figcaption>${name}</figcaption></figure>`;
  const right = settings.mode === "solo" ? `<figure><span style="font-size:80px;line-height:110px">☃️</span><figcaption>SNOWMAN</figcaption></figure>` : fig(asset(C2.img), C2.name);
  $("#intro-chars").innerHTML = fig(asset(C1.img), C1.name) + `<span class="vs-mini">VS</span>` + right;
  $("#intro-info").innerHTML = `하트 <b>${prof.hearts}개</b> · 라운드 <b>${settings.time}초</b> · 맞으면 하트 -1`;
}

$("#mode-pick").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  settings.mode = b.dataset.v;
  $("#mode-pick").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  makePlayers();
  renderIntro();
  renderTopbar();
});

$("#btn-start").addEventListener("click", async () => {
  sfx.unlock();
  $("#intro").classList.remove("open");
  makePlayers();
  if (await ensureReady()) beginReady();
});

async function ensureReady() {
  state = "loading";
  try {
    if (!camOn) {
      msg("📷 카메라 켜는 중…<small>브라우저에서 카메라 권한을 <b>허용</b>해 주세요</small>", true);
      await startCamera(video);
      camOn = true;
      W = cv.width = video.videoWidth;
      H = cv.height = video.videoHeight;
      S = W / 640;
      $("#stage").style.aspectRatio = `${W} / ${H}`;
      players.forEach((p) => p.reset());
    }
    if (!poseReady) {
      msg("🧠 몸 인식 모델 불러오는 중…<small>처음 한 번만 몇 초 걸려요</small>", true);
      await initPose();
      poseReady = true;
    }
  } catch (err) {
    console.error(err);
    state = "error";
    const name = err?.name;
    const text =
      name === "NotAllowedError" ? "카메라 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 허용해 주세요." :
      name === "NotFoundError" ? "카메라를 찾을 수 없어요." :
      name === "NotReadableError" ? "다른 프로그램이 카메라를 쓰고 있어요." :
      "준비 중 문제가 생겼어요: " + (err?.message || err);
    msg(`⚠️ ${text}<small>왼쪽 위 화살표로 홈에 갔다가 다시 시도해 주세요</small>`, true);
    return false;
  }
  if (!looping) {
    looping = true;
    lastNow = performance.now();
    requestAnimationFrame(loop);
  }
  return true;
}

function beginReady() {
  flakes = []; shots = []; texts = []; splats = []; puffs = [];
  players.forEach((p) => p.reset());
  renderTopbar();
  $("#clock").textContent = settings.time;
  $("#clock").classList.remove("hurry");
  readySince = null;
  state = "ready";
}

function beginCountdown(now) {
  state = "countdown";
  phaseStart = now;
  lastCount = null;
}

function beginPlay(now) {
  state = "play";
  playStart = now;
  msg("");
  if (players[1].isBot) players[1].nextThrow = now + 3000;
}

function renderTopbar(popPlayer = null) {
  const [a, b] = players;
  if (!a) return;
  [[a, "#pl1"], [b, "#pl2"]].forEach(([p, sel]) => {
    const el = $(sel);
    const ava = el.querySelector(".ava");
    if (p.char) { ava.src = asset(p.char.img); ava.hidden = false; } else ava.hidden = true;
    el.querySelector(".name").textContent = p.isBot ? "☃️ SNOWMAN" : p.name;
    const h = el.querySelector(".hearts");
    h.innerHTML = heartsHTML(p.hearts, prof.hearts);
    if (p === popPlayer) h.querySelectorAll("img")[p.hearts]?.classList.add("pop");
    el.querySelector(".score").textContent = `⭐ ${p.score}`;
  });
}

// ───────── 메인 루프 ─────────
function loop(now) {
  if (!looping) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;

  const active = ["ready", "countdown", "play"].includes(state);
  if (!active || !camOn) return;

  const poses = detectPoses(video);
  assignPlayers(poses, now);
  const [p1, p2] = players;
  if (p2.isBot) stepBot(p2, p1, dt, now);

  stepFlakes(dt, now);

  if (state === "ready") stepReady(now);
  else if (state === "countdown") stepCountdown(now);
  else if (state === "play") {
    stepPlayer(p1, p2, dt, now);
    if (!p2.isBot) stepPlayer(p2, p1, dt, now);
    for (const s of shots) if (!s.done && now - s.t0 >= s.dur) { s.done = true; resolveShot(s, now); }
    shots = shots.filter((s) => !s.done);
    if (players.some((p) => p.hearts <= 0)) return endGame();

    const left = settings.time - (now - playStart) / 1000;
    $("#clock").textContent = Math.max(0, Math.ceil(left));
    $("#clock").classList.toggle("hurry", left <= 10);
    if (left <= 0) return endGame();
    const warn = [];
    if (!p1.present) warn.push(`${p1.name} 화면 밖!`);
    if (!p2.present) warn.push(`${p2.name} 화면 밖!`);
    msg(warn.length ? `🙈 ${warn.join(" · ")}` : "");
  }

  draw(now, poses);
  if (!debugEl.hidden) renderDebug(poses);
}

function stepFlakes(dt, now) {
  flakeAcc += CFG.flakeRate * dt;
  while (flakeAcc >= 1) {
    flakeAcc -= 1;
    flakes.push({ x: Math.random() * W, y: -10, r: rand(2, 5) * S, vy: rand(40, 95) * S, sway: Math.random() * 6.28, dead: false });
  }
  for (const f of flakes) {
    f.y += f.vy * dt;
    f.x += Math.sin(now / 600 + f.sway) * 14 * S * dt;
  }
  flakes = flakes.filter((f) => !f.dead && f.y < H + 10);
}

function stepReady(now) {
  const [p1, p2] = players;
  const need = settings.mode === "solo" ? [p1] : [p1, p2];
  if (need.every((p) => p.present)) {
    readySince ??= now;
    msg("👍 좋아요! 곧 시작해요…", true);
    if (now - readySince > 1500) beginCountdown(now);
  } else {
    readySince = null;
    if (settings.mode === "solo") {
      msg("🙋 화면 <b>왼쪽</b>에 서 주세요<small>상체와 두 손이 다 보이게 카메라에서 2m쯤 떨어져 주세요</small>", true);
    } else {
      msg(
        `🙋 두 명 모두 화면에 들어와 주세요` +
          `<small>왼쪽 ${p1.present ? "✅" : "⬜"} ${p1.name} &nbsp;·&nbsp; 오른쪽 ${p2.present ? "✅" : "⬜"} ${p2.name}<br>` +
          `상체와 두 손이 다 보이게 카메라에서 2~3m 떨어져 주세요</small>`,
        true
      );
    }
  }
}

function stepCountdown(now) {
  const n = 3 - Math.floor((now - phaseStart) / 1000);
  if (n <= 0) {
    sfx.beep(true);
    return beginPlay(now);
  }
  if (n !== lastCount) {
    lastCount = n;
    sfx.beep(false);
    msg(`<span class="count">${n}</span><small>손을 들고 눈을 받을 준비!</small>`);
  }
}

// ───────── 그리기 ─────────
function draw(now, poses) {
  // 배경: 거울 모드 카메라 + 겨울 톤
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = "rgba(10, 30, 60, 0.28)";
  ctx.fillRect(0, 0, W, H);

  if (settings.mode === "duo") {
    ctx.save();
    ctx.setLineDash([10 * S, 10 * S]);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();
  }

  // 눈송이
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (const f of flakes) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of players) {
    if (p.isBot) drawSnowman(p);
    drawPlayer(p, now);
  }

  // 조준점 + 날아가는 눈덩이
  for (const s of shots) {
    const t = Math.min(1, (now - s.t0) / s.dur);
    const ringR = s.r * 1.3 + s.target.headR * CFG.hitSlack;
    const pulse = 1 + Math.sin(now / 70) * 0.08;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 80, 80, ${0.5 + t * 0.5})`;
    ctx.lineWidth = 4 * S;
    ctx.beginPath();
    ctx.arc(s.to.x, s.to.y, ringR * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.to.x - ringR * 0.4, s.to.y); ctx.lineTo(s.to.x + ringR * 0.4, s.to.y);
    ctx.moveTo(s.to.x, s.to.y - ringR * 0.4); ctx.lineTo(s.to.x, s.to.y + ringR * 0.4);
    ctx.stroke();
    ctx.restore();

    const x = lerp(s.from.x, s.to.x, t);
    const y = lerp(s.from.y, s.to.y, t) - Math.sin(Math.PI * t) * H * 0.14;
    const r = s.r * (0.9 + 0.4 * t);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.4 + Math.sin(Math.PI * t) * H * 0.14, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSnowball(x, y, r);
  }

  // 맞은 자국 (얼굴 따라다님)
  splats = splats.filter((sp) => now - sp.t0 < 1400);
  for (const sp of splats) {
    const head = sp.who.head;
    if (!head) continue;
    const a = 1 - (now - sp.t0) / 1400;
    ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
    for (const b of sp.blobs) {
      ctx.beginPath();
      ctx.arc(head.x + b.dx, head.y + b.dy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 눈 가루
  puffs = puffs.filter((pf) => now - pf.t0 < 500);
  for (const pf of puffs) {
    const k = (now - pf.t0) / 500;
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
    for (let i = 0; i < pf.n; i++) {
      const ang = (i / pf.n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(pf.x + Math.cos(ang) * k * 30 * S, pf.y + Math.sin(ang) * k * 30 * S, pf.size * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 글자
  texts = texts.filter((t) => now - t.t0 < 1100);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of texts) {
    const k = (now - t.t0) / 1100;
    ctx.globalAlpha = 1 - k;
    ctx.font = `900 ${(t.big ? 34 : 26) * S}px "Galmuri11", "Malgun Gothic", sans-serif`;
    ctx.lineWidth = 6 * S;
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.strokeText(t.text, t.x, t.y - k * 40 * S);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y - k * 40 * S);
  }
  ctx.globalAlpha = 1;
}

function drawSnowball(x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.7, "#e6f2ff");
  g.addColorStop(1, "#9fbfe3");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawPlayer(p, now) {
  if (!p.present || !p.head) return;
  // 이름표
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${18 * S}px "Galmuri11", "Malgun Gothic", sans-serif`;
  const label = p.name;
  const tw = ctx.measureText(label).width + 16 * S;
  const ty = p.head.y - p.headR * 2.2;
  if (p.img?.complete && p.img.naturalWidth) {
    const ah = 46 * S, aw = (ah * p.img.naturalWidth) / p.img.naturalHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(p.img, p.head.x - tw / 2 - aw - 2 * S, ty - ah + 13 * S, aw, ah);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.roundRect(p.head.x - tw / 2, ty - 13 * S, tw, 26 * S, 13 * S);
  ctx.fill();
  ctx.fillStyle = "#0b1424";
  ctx.fillText(label, p.head.x, ty);
  ctx.restore();

  if (!p.hand || p.isBot) return;
  const { x, y } = p.hand;
  if (p.r <= 0) {
    // 빈손: 눈 받는 범위 표시
    ctx.save();
    ctx.setLineDash([5 * S, 6 * S]);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5 * S;
    ctx.beginPath();
    ctx.arc(x, y, 10 * S + CFG.catchPad * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawSnowball(x, y, p.r);
  // 던질 수 있으면 테두리 + 안내
  const ready = p.r >= CFG.minR * S;
  ctx.save();
  ctx.lineWidth = 4 * S;
  ctx.strokeStyle = ready ? p.color : "rgba(255,255,255,.4)";
  ctx.beginPath();
  ctx.arc(x, y, p.r + 4 * S, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.r / (CFG.maxR * S)));
  ctx.stroke();
  if (ready && state === "play") {
    ctx.textAlign = "center";
    ctx.font = `800 ${14 * S}px "Galmuri11", "Malgun Gothic", sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = 4 * S;
    const t = `${"⭐".repeat(pointsFor(p.r))} ${p.side === "L" ? "휙! →" : "← 휙!"}`;
    ctx.strokeText(t, x, y - p.r - 14 * S);
    ctx.fillText(t, x, y - p.r - 14 * S);
  }
  ctx.restore();
}

function drawSnowman(b) {
  const { x, y } = b.head; // 판정 위치 = 눈사람 머리
  const r = b.headR;
  drawSnowball(x, y + r * 3.9, r * 1.6);
  drawSnowball(x, y + r * 1.8, r * 1.2);
  drawSnowball(x, y, r);
  ctx.fillStyle = "#111";
  for (const dx of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y - r * 0.2, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ff8c1a";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.02);
  ctx.lineTo(x - r * 0.75, y + r * 0.1);
  ctx.lineTo(x, y + r * 0.2);
  ctx.fill();
}

// ───────── 결과 ─────────
function endGame() {
  state = "result";
  shots = [];
  msg("");
  sfx.fail();
  const [a, b] = players;
  // 승부: 하트가 많이 남은 쪽 → 같으면 점수(⭐) → 같으면 무승부
  const cmp = a.hearts - b.hearts || a.score - b.score;
  const w = cmp > 0 ? a : cmp < 0 ? b : null;
  const l = w ? (w === a ? b : a) : null;
  if (!a.isBot && !b.isBot) {
    recordMatch({ game: "snowball", winner: w ? (w === a ? "p1" : "p2") : null, p1: prof.p1, p2: prof.p2, detail: `⭐${a.score}:${b.score}` });
  }
  const fig = (p, cls = "") =>
    p.isBot
      ? `<figure class="${cls}"><span style="font-size:${cls ? 70 : 110}px;line-height:1">☃️</span><figcaption>SNOWMAN</figcaption></figure>`
      : `<figure class="${cls}">${cls ? "" : w ? '<span class="crown">👑</span>' : ""}<img class="char px" src="${asset(p.char.img)}" alt=""><figcaption>${escapeHtml(p.name)}</figcaption></figure>`;
  $("#r-title").textContent = w ? `${w.isBot ? "SNOWMAN" : w.name} WIN!` : "DRAW!";
  $("#r-chars").innerHTML = w ? fig(w) + fig(l, "lose") : fig(a) + fig(b);
  const line = (p) => `${p.isBot ? "SNOWMAN" : escapeHtml(p.name)}: ♥${p.hearts} · ⭐${p.score} · 명중 ${p.hits}/${p.throws} · 회피 ${p.dodges} · 최대 ${p.maxR ? Math.round((p.maxR / S) * 2) + "cm" : "-"}`;
  $("#r-stats").innerHTML = `${line(a)}<br>${line(b)}`;
  $("#r-coins").textContent = a.isBot || b.isBot ? "연습 모드는 코인이 쌓이지 않아요" : w ? `🪙 ${w.name} +12 · ${l.name} +2` : "🪙 둘 다 +2";
  setTimeout(() => $("#result").classList.add("open"), 600);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

$("#btn-again").addEventListener("click", () => {
  sfx.unlock();
  $("#result").classList.remove("open");
  beginReady();
});

// ───────── 디버그 (D 키) ─────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "d" || e.key === "D") debugEl.hidden = !debugEl.hidden;
});

function renderDebug(poses) {
  const line = (p) => {
    if (!p) return "";
    let sp = 0;
    if (p.hist.length >= 2) {
      const f = p.hist[0], l = p.hist[p.hist.length - 1];
      sp = Math.hypot(l.x - f.x, l.y - f.y) / Math.max(0.001, (l.t - f.t) / 1000) / W;
    }
    return `${p.name.padEnd(6)} ${p.present ? "O" : "X"}  손:${p.hand ? (p.handIdx ? "오른" : "왼") : "-"}  눈덩이 r=${(p.r / S).toFixed(0)}  회전=${(p.rollAcc / (2 * Math.PI)).toFixed(2)}바퀴  손속도=${sp.toFixed(2)} (던지기 ${CFG.throwSpeed})`;
  };
  debugEl.textContent = `인식된 사람: ${poses.length}명  화면 ${W}x${H}\n${line(players[0])}\n${players[1]?.isBot ? "" : line(players[1])}`;
}

makePlayers();
renderIntro();
renderTopbar();
