// 😐 포커페이스 챌린지 (2인용)
// 카메라 1대 앞에 두 명이 나란히 → 왼쪽 얼굴 = P1 패널, 오른쪽 얼굴 = P2 패널
// 웃거나 깜빡이면 하트 -1, 먼저 하트를 다 잃으면 패배
import { initDetector, detectFaces } from "./detector.js";
import { Calibrator, Judge, DIFFICULTY } from "./judge.js";
import { Distractions } from "./distractions.js";
import { drawFilter } from "./filters.js";
import { startCamera } from "../../shared/camera.js";
import { Sfx } from "../../shared/sfx.js";
import { loadProfile, charOf, asset, heartsHTML, recordMatch } from "../../shared/profile.js";

const $ = (s) => document.querySelector(s);
const video = $("#video");
const arena = $("#arena");
const centerMsg = $("#center-msg");
const clockEl = $("#clock");
const debugEl = $("#debug");

const prof = loadProfile();
const DIFF = DIFFICULTY[prof.pfDiff] || DIFFICULTY.normal;
const MODE = prof.pfMode;
const MODE_LABEL = { mix: "😐 혼합", smile: "😂 웃음 참기", blink: "👁️ 눈싸움" };
const REASON = { smile: "😂 웃음!", blink: "😑 깜빡!", lost: "🙈 이탈!" };
const GRACE_MS = 1600;
const CALIB_MS = 3000;

const sfx = new Sfx();
sfx.enabled = prof.sound;
const distractions = new Distractions($("#distractions"), arena, sfx);

let VW = 640, VH = 480;
let state = "intro"; // intro | loading | ready | calibrate | countdown | play | result | error
let looping = false;
let phaseStart = 0, playStart = 0, readySince = null, lastCount = null, calibElapsed = 0, lastNow = 0;

// ───────── 플레이어 ─────────
function makePlayer(key, side, panelSel, plSel) {
  const c = charOf(prof[key]);
  const panel = $(panelSel);
  const canvas = panel.querySelector("canvas");
  return {
    key, side, char: c, name: c.name,
    panel, canvas, ctx: canvas.getContext("2d"),
    msgEl: panel.querySelector(".panel-msg"),
    gSmile: panel.querySelector(".gauge.smile"), gBlink: panel.querySelector(".gauge.blink"),
    plEl: $(plSel),
    hearts: prof.hearts, face: null, crop: null, view: null,
    calib: null, base: null, judge: null, graceUntil: 0, lastLevels: { smile: 0, blink: 0 },
    stats: { smile: 0, blink: 0, lost: 0 },
  };
}
const P = [makePlayer("p1", "L", "#panel1", "#pl1"), makePlayer("p2", "R", "#panel2", "#pl2")];

function renderTopbar(popIdx = -1) {
  P.forEach((p, i) => {
    p.plEl.querySelector(".ava").src = asset(p.char.img);
    p.plEl.querySelector(".name").textContent = p.name;
    const h = p.plEl.querySelector(".hearts");
    h.innerHTML = heartsHTML(p.hearts, prof.hearts);
    if (i === popIdx) h.querySelectorAll("img")[p.hearts]?.classList.add("pop");
  });
  $("#mode-chip").textContent = `${MODE_LABEL[MODE]} · ${DIFF.label}`;
  P[0].gBlink.classList.toggle("off", MODE === "smile");
  P[1].gBlink.classList.toggle("off", MODE === "smile");
  P[0].gSmile.classList.toggle("off", MODE === "blink");
  P[1].gSmile.classList.toggle("off", MODE === "blink");
}

// ───────── 시작 안내 ─────────
function charFig(c, cls = "") {
  return `<figure class="${cls}"><img class="char px ${cls === "small" ? "small" : ""}" src="${asset(c.img)}" alt=""><figcaption>${c.name}</figcaption></figure>`;
}
$("#intro-chars").innerHTML = charFig(P[0].char, "small") + `<span class="vs-mini">VS</span>` + charFig(P[1].char, "small");
$("#intro-info").innerHTML = `모드 <b>${MODE_LABEL[MODE]}</b> · 난이도 <b>${DIFF.label}</b> · 하트 <b>${prof.hearts}개</b>`;
renderTopbar();

$("#btn-start").addEventListener("click", async () => {
  sfx.unlock();
  $("#intro").classList.remove("open");
  if (await ensureReady()) beginReady();
});

$("#btn-again").addEventListener("click", () => {
  sfx.unlock();
  $("#result").classList.remove("open");
  beginReady();
});

function msg(html, dim = false) {
  centerMsg.innerHTML = html;
  centerMsg.classList.toggle("dim", dim);
}
function panelMsg(p, html) {
  if (p.msgEl.innerHTML !== html) p.msgEl.innerHTML = html;
}

async function ensureReady() {
  state = "loading";
  try {
    msg("📷 카메라 켜는 중…<small>브라우저에서 카메라 권한을 허용해 주세요</small>", true);
    await startCamera(video);
    VW = video.videoWidth;
    VH = video.videoHeight;
    msg("🧠 얼굴 인식 모델 불러오는 중…<small>처음 한 번만 몇 초 걸려요</small>", true);
    await initDetector();
  } catch (err) {
    console.error(err);
    state = "error";
    const t =
      err?.name === "NotAllowedError" ? "카메라 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 허용해 주세요." :
      err?.name === "NotFoundError" ? "카메라를 찾을 수 없어요." :
      err?.name === "NotReadableError" ? "다른 프로그램이 카메라를 쓰고 있어요." :
      "준비 중 문제가 생겼어요: " + (err?.message || err);
    msg(`⚠️ ${t}<small>왼쪽 위 화살표로 홈에 갔다가 다시 시도해 주세요</small>`, true);
    return false;
  }
  if (!looping) {
    looping = true;
    requestAnimationFrame(loop);
  }
  return true;
}

// ───────── 단계 ─────────
function beginReady() {
  distractions.stop();
  for (const p of P) {
    p.hearts = prof.hearts;
    p.calib = null; p.base = null; p.judge = null; p.graceUntil = 0;
    p.stats = { smile: 0, blink: 0, lost: 0 };
    p.panel.classList.remove("out", "danger", "hit");
  }
  renderTopbar();
  clockEl.textContent = "0.0";
  readySince = null;
  state = "ready";
}

function beginCalibrate(now) {
  state = "calibrate";
  for (const p of P) p.calib = new Calibrator();
  calibElapsed = 0;
  phaseStart = now;
}

function beginCountdown(now) {
  for (const p of P) {
    p.base = p.calib.result();
    p.judge = new Judge(MODE, DIFF, p.base);
  }
  state = "countdown";
  phaseStart = now;
  lastCount = null;
}

function beginPlay(now) {
  state = "play";
  playStart = now;
  msg("");
  P.forEach((p) => panelMsg(p, ""));
  distractions.start();
}

// ───────── 얼굴 배정 & 패널 그리기 ─────────
function assign(faces) {
  const items = faces.map((f) => ({ f, x: 1 - f.landmarks[1].x })).sort((a, b) => a.x - b.x);
  let L = null, R = null;
  if (items.length >= 2) { L = items[0]; R = items[items.length - 1]; }
  else if (items.length === 1) { if (items[0].x < 0.5) L = items[0]; else R = items[0]; }
  P[0].face = L ? L.f : null;
  P[1].face = R ? R.f : null;
}

function updateCrop(p) {
  const maxSize = Math.min(VW / 2 + VW * 0.1, VH);
  let target = { cx: p.side === "L" ? VW * 0.25 : VW * 0.75, cy: VH * 0.45, size: maxSize };
  if (p.face) {
    let minx = 1, maxx = 0, miny = 1, maxy = 0;
    for (const l of p.face.landmarks) {
      if (l.x < minx) minx = l.x; if (l.x > maxx) maxx = l.x;
      if (l.y < miny) miny = l.y; if (l.y > maxy) maxy = l.y;
    }
    const size = Math.max((maxx - minx) * VW, (maxy - miny) * VH) * 1.9;
    target = { cx: (1 - (minx + maxx) / 2) * VW, cy: ((miny + maxy) / 2) * VH, size: Math.max(140, Math.min(size, Math.min(VW, VH))) };
  }
  if (!p.crop) p.crop = target;
  else for (const k of ["cx", "cy", "size"]) p.crop[k] += (target[k] - p.crop[k]) * 0.2;
}

function drawPanel(p, now) {
  const { ctx, canvas } = p;
  const PW = canvas.width;
  const size = Math.min(p.crop.size, VW, VH);
  const x0 = Math.max(0, Math.min(VW - size, p.crop.cx - size / 2)); // 거울 좌표
  const y0 = Math.max(0, Math.min(VH - size, p.crop.cy - size / 2));
  ctx.save();
  ctx.translate(PW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, VW - (x0 + size), y0, size, size, 0, 0, PW, PW);
  ctx.restore();

  if (p.face && distractions.filter && now >= p.graceUntil) {
    const lm = p.face.landmarks.map((l) => ({ x: ((1 - l.x) * VW - x0) / size, y: (l.y * VH - y0) / size }));
    drawFilter(ctx, lm, distractions.filter, PW, PW, now);
  }
}

// ───────── 메인 루프 ─────────
function loop(now) {
  if (!looping) return;
  requestAnimationFrame(loop);
  const dt = now - (lastNow || now);
  lastNow = now;
  if (state === "intro" || state === "loading" || state === "error") return;

  const faces = detectFaces(video);
  assign(faces);
  for (const p of P) {
    updateCrop(p);
    drawPanel(p, now);
  }

  if (state === "ready") stepReady(now);
  else if (state === "calibrate") stepCalibrate(now, dt);
  else if (state === "countdown") stepCountdown(now);
  else if (state === "play") stepPlay(now);

  if (!debugEl.hidden) renderDebug(faces);
}

function stepReady(now) {
  const both = P.every((p) => p.face);
  P.forEach((p) => panelMsg(p, p.face ? `✅<small>${p.name} 준비 완료</small>` : `🙋<small>${p.side === "L" ? "왼쪽" : "오른쪽"}에 앉아 주세요</small>`));
  if (both) {
    readySince ??= now;
    msg("");
    if (now - readySince > 1000) beginCalibrate(now);
  } else {
    readySince = null;
    msg("");
  }
}

function stepCalibrate(now, dt) {
  const both = P.every((p) => p.face);
  if (both) {
    calibElapsed += dt;
    P.forEach((p) => p.calib.add(p.face.scores));
  }
  const pct = Math.min(1, calibElapsed / CALIB_MS);
  for (const p of P) {
    panelMsg(p, p.face ? "" : `🙈<small>얼굴이 안 보여요</small>`);
  }
  msg(
    `😐 둘 다 무표정!<small>기준 표정 측정 중 (깜빡여도 괜찮아요)</small><div class="progress"><i style="width:${Math.round(pct * 100)}%"></i></div>`,
    true
  );
  if (pct >= 1 && P.every((p) => p.calib.count >= 20)) beginCountdown(now);
}

function stepCountdown(now) {
  const n = 3 - Math.floor((now - phaseStart) / 1000);
  for (const p of P) if (p.face) setGauges(p, p.judge.levels(p.face.scores));
  if (n <= 0) {
    sfx.beep(true);
    return beginPlay(now);
  }
  if (n !== lastCount) {
    lastCount = n;
    sfx.beep(false);
    msg(`<span class="count">${n}</span><small>표정 굳히세요…</small>`);
  }
}

function stepPlay(now) {
  const elapsed = now - playStart;
  clockEl.textContent = (elapsed / 1000).toFixed(1);
  distractions.update(elapsed);

  let fallen = [];
  for (const p of P) {
    if (now < p.graceUntil) {
      const left = Math.ceil((p.graceUntil - now) / 1000);
      panelMsg(p, `<span class="big">${p.lastReason}</span><small>-1 ♥ · ${left}초 뒤 다시!</small>`);
      setGauges(p, { smile: 0, blink: 0 });
      p.panel.classList.remove("danger");
      continue;
    }
    const r = p.judge.update(p.face ? { face: true, scores: p.face.scores } : { face: false }, now);
    setGauges(p, r);
    panelMsg(p, r.noFace ? `🙈<small>얼굴을 화면 안으로!</small>` : "");
    const danger = (MODE !== "blink" && r.smile > 0.75) || (MODE !== "smile" && r.blink > 0.75);
    p.panel.classList.toggle("danger", danger);
    if (r.fail && loseHeart(p, r.fail, now)) fallen.push(p);
  }
  if (fallen.length) endGame(elapsed, fallen);
}

function loseHeart(p, reason, now) {
  p.hearts--;
  p.stats[reason]++;
  p.lastReason = REASON[reason];
  p.graceUntil = now + GRACE_MS;
  p.judge = new Judge(MODE, DIFF, p.base); // 판정 초기화 (기준값은 유지)
  p.panel.classList.remove("hit", "danger");
  void p.panel.offsetWidth;
  p.panel.classList.add("hit");
  setTimeout(() => p.panel.classList.remove("hit"), 800);
  renderTopbar(P.indexOf(p));
  sfx.honk();
  return p.hearts <= 0;
}

function setGauges(p, r) {
  const set = (el, v) => {
    v = Math.max(0, Math.min(1, v || 0));
    el.querySelector("i").style.width = v * 100 + "%";
    el.classList.toggle("warn", v > 0.5 && v <= 0.75);
    el.classList.toggle("danger", v > 0.75);
  };
  set(p.gSmile, MODE === "blink" ? 0 : r.smile);
  set(p.gBlink, MODE === "smile" ? 0 : r.blink);
}

// ───────── 결과 ─────────
function endGame(elapsedMs, fallen) {
  state = "result";
  distractions.stop();
  sfx.fail();
  const time = (elapsedMs / 1000).toFixed(1);
  let winnerKey = null;
  if (fallen.length === 1) winnerKey = fallen[0] === P[0] ? "p2" : "p1";
  for (const p of P) {
    p.panel.classList.remove("danger");
    if (p.hearts <= 0) p.panel.classList.add("out");
    panelMsg(p, p.hearts <= 0 ? `<span class="big">💀 K.O.</span>` : `<span class="big">👑 WIN</span>`);
  }
  recordMatch({ game: "pokerface", winner: winnerKey, p1: prof.p1, p2: prof.p2, detail: `${time}초` });

  setTimeout(() => {
    const w = winnerKey === "p1" ? P[0] : winnerKey === "p2" ? P[1] : null;
    const l = w ? P.find((p) => p !== w) : null;
    $("#r-title").textContent = w ? `${w.name} WIN!` : "DRAW!";
    $("#r-chars").innerHTML = w
      ? `<figure><span class="crown">👑</span><img class="char px" src="${asset(w.char.img)}" alt=""><figcaption>${w.name}</figcaption></figure>` +
        `<figure class="lose"><img class="char px" src="${asset(l.char.img)}" alt=""><figcaption>${l.name}</figcaption></figure>`
      : charFig(P[0].char) + charFig(P[1].char);
    const line = (p) => `${p.name}: 웃음 ${p.stats.smile} · 깜빡 ${p.stats.blink} · 이탈 ${p.stats.lost}`;
    $("#r-stats").innerHTML = `⏱ ${time}초 버텼어요<br>${line(P[0])}<br>${line(P[1])}`;
    $("#r-coins").textContent = w ? `🪙 ${w.name} +12 · ${l.name} +2` : "🪙 둘 다 +2";
    $("#result").classList.add("open");
  }, 1400);
}

// ───────── 디버그 (D 키) ─────────
document.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") debugEl.hidden = !debugEl.hidden;
});
function renderDebug(faces) {
  const f = (v) => (v ?? 0).toFixed(2);
  const line = (p) => {
    if (!p.face) return `${p.name}: 얼굴 없음`;
    const s = p.face.scores;
    return `${p.name}: 웃음 ${f((s.mouthSmileLeft + s.mouthSmileRight) / 2)} (기준 ${f(p.base?.smile)})  눈 ${f(s.eyeBlinkLeft)}/${f(s.eyeBlinkRight)} (기준 ${f(p.base?.blink)})`;
  };
  debugEl.textContent = `인식된 얼굴 ${faces.length}개 · 상태 ${state} · 단계 ${distractions.stage ?? "-"} 필터 ${distractions.filter ?? "-"}\n${line(P[0])}\n${line(P[1])}`;
}
