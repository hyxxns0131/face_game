// 게임 흐름: 시작 → (카메라/모델 준비) → 보정 3초 → 카운트다운 → 게임 → 결과 → 순위표
import { initDetector, detect } from "./detector.js";
import { Calibrator, Judge, DIFFICULTY } from "./judge.js";
import { startCamera, stopCamera } from "./camera.js";
import { Distractions } from "./distractions.js";
import { drawFilter } from "./filters.js";
import { Sfx } from "./sfx.js";
import * as board from "./leaderboard.js";

const $ = (s) => document.querySelector(s);
const video = $("#video");
const overlay = $("#overlay");
const octx = overlay.getContext("2d");
const stageEl = $("#stage");
const centerMsg = $("#center-msg");
const timerEl = $("#timer");
const debugEl = $("#debug");
const gSmile = $("#g-smile");
const gBlink = $("#g-blink");

const MODE_LABEL = { mix: "😐 혼합", smile: "😂 웃음 참기", blink: "👁️ 눈싸움" };
const REASON = {
  smile: "😂 웃음으로 탈락!",
  blink: "😑 깜빡임으로 탈락!",
  lost: "🙈 얼굴이 사라져서 탈락!",
};
const CALIBRATE_MS = 3000;
const CALIBRATE_MIN_FRAMES = 30;

const settings = { mode: "mix", diff: "normal", sound: true, name: "" };
const sfx = new Sfx();
const distractions = new Distractions($("#distractions"), stageEl, sfx);

let state = "home"; // home | loading | calibrate | countdown | play | result | board
let cameraOn = false;
let detectorReady = false;
let looping = false;
let baseline = null;
let calibrator = null;
let judge = null;
let phaseStart = 0;
let lastCount = null;
let playStart = 0;
let fps = 0;
let lastFrame = 0;
let boardMode = "mix";

// ───────── 화면 전환 ─────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${name}`));
}

function msg(html, { dim = false } = {}) {
  centerMsg.innerHTML = html;
  centerMsg.classList.toggle("dim", dim);
}

// ───────── 시작 화면 ─────────
function segment(sel, key, onChange) {
  const el = $(sel);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset[key]);
  });
}
segment("#mode-seg", "mode", (v) => (settings.mode = v));
segment("#diff-seg", "diff", (v) => (settings.diff = v));
segment("#board-seg", "board", (v) => renderBoard(v));

try {
  $("#nickname").value = localStorage.getItem("pokerface.lastName") || "";
} catch {}

$("#nickname").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-start").click();
});

$("#btn-start").addEventListener("click", async () => {
  settings.name = $("#nickname").value.trim() || "익명";
  settings.sound = $("#sound").checked;
  sfx.enabled = settings.sound;
  sfx.unlock();
  try {
    localStorage.setItem("pokerface.lastName", settings.name);
  } catch {}

  showScreen("game");
  applyModeToHud();
  timerEl.textContent = "0.0";
  const ok = await ensureReady();
  if (ok) beginCalibration();
});

$("#btn-board").addEventListener("click", () => openBoard(settings.mode));

// ───────── 준비: 카메라 + 모델 ─────────
async function ensureReady() {
  state = "loading";
  try {
    if (!cameraOn) {
      msg("📷 카메라 켜는 중…<small>브라우저에서 카메라 권한을 <b>허용</b>해 주세요</small>", { dim: true });
      await startCamera(video);
      cameraOn = true;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    if (!detectorReady) {
      msg("🧠 얼굴 인식 모델 불러오는 중…<small>처음 한 번만 몇 초 걸려요</small>", { dim: true });
      await initDetector();
      detectorReady = true;
    }
  } catch (err) {
    console.error(err);
    state = "error";
    msg(`⚠️ ${errorText(err)}<small>아래 [처음으로]를 눌러 다시 시도해 주세요</small>`, { dim: true });
    return false;
  }
  if (!looping) {
    looping = true;
    requestAnimationFrame(loop);
  }
  return true;
}

function errorText(err) {
  if (err?.name === "NotAllowedError") return "카메라 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 카메라를 허용해 주세요.";
  if (err?.name === "NotFoundError") return "카메라를 찾을 수 없어요. 웹캠이 연결돼 있는지 확인해 주세요.";
  if (err?.name === "NotReadableError") return "다른 프로그램(줌, 디스코드 등)이 카메라를 쓰고 있어요.";
  if (err?.name === "Unsupported") return err.message;
  return "준비 중 문제가 생겼어요: " + (err?.message || err);
}

// ───────── 단계별 시작 ─────────
function beginCalibration() {
  state = "calibrate";
  calibrator = new Calibrator();
  phaseStart = performance.now();
}

function beginCountdown() {
  distractions.stop();
  judge = new Judge(settings.mode, DIFFICULTY[settings.diff], baseline);
  timerEl.textContent = "0.0";
  state = "countdown";
  phaseStart = performance.now();
  lastCount = null;
}

function beginPlay(now) {
  state = "play";
  playStart = now;
  msg("");
  distractions.start();
}

// ───────── 메인 루프 (매 프레임) ─────────
function loop(now) {
  if (!looping) return;
  requestAnimationFrame(loop);

  if (lastFrame) fps = 0.9 * fps + 0.1 * (1000 / Math.max(1, now - lastFrame));
  lastFrame = now;

  const active = state === "calibrate" || state === "countdown" || state === "play";
  if (!active || !cameraOn) return;

  const det = detect(video);
  drawOverlay(det, now);

  if (state === "calibrate") stepCalibrate(det, now);
  else if (state === "countdown") stepCountdown(det, now);
  else if (state === "play") stepPlay(det, now);
}

function stepCalibrate(det, now) {
  if (det?.face) calibrator.add(det.scores);
  const elapsed = now - phaseStart;
  const pct = Math.min(1, Math.min(elapsed / CALIBRATE_MS, calibrator.count / CALIBRATE_MIN_FRAMES));

  if (!det?.face) {
    msg("🙈 얼굴이 안 보여요<small>밝은 곳에서 카메라 정면을 봐주세요</small>", { dim: true });
    phaseStart += 16; // 얼굴이 안 보이는 동안은 시간이 흐르지 않게
    return;
  }
  msg(
    `😐 무표정으로 정면을 봐주세요<small>기준 표정 측정 중 (깜빡여도 괜찮아요)</small>` +
      `<div class="progress"><i style="width:${Math.round(pct * 100)}%"></i></div>`,
    { dim: true }
  );
  if (pct >= 1) {
    baseline = calibrator.result();
    beginCountdown();
  }
}

function stepCountdown(det, now) {
  const elapsed = now - phaseStart;
  const n = 3 - Math.floor(elapsed / 1000);
  if (det?.face) updateGauges(judge.levels(det.scores));
  if (n <= 0) {
    sfx.beep(true);
    beginPlay(now);
    return;
  }
  if (n !== lastCount) {
    lastCount = n;
    sfx.beep(false);
    msg(`<span class="count">${n}</span><small>표정 굳히세요…</small>`);
  }
}

function stepPlay(det, now) {
  const r = judge.update(det, now);
  const elapsed = now - playStart;
  timerEl.textContent = (elapsed / 1000).toFixed(1);
  updateGauges(r);
  distractions.update(elapsed);
  if (r.noFace && !r.fail) msg("🙈 얼굴을 화면 안으로!", {});
  else if (centerMsg.innerHTML) msg("");
  if (debugEl.hidden === false) renderDebug(r);
  if (r.fail) gameOver(r.fail, elapsed);
}

function updateGauges(r) {
  setGauge(gSmile, settings.mode === "blink" ? 0 : r.smile);
  setGauge(gBlink, settings.mode === "smile" ? 0 : r.blink);
  const danger = (settings.mode !== "blink" && r.smile > 0.75) || (settings.mode !== "smile" && r.blink > 0.75);
  stageEl.classList.toggle("danger", state === "play" && danger);
}

function setGauge(el, level) {
  const v = Math.max(0, Math.min(1, level || 0));
  el.querySelector("i").style.width = v * 100 + "%";
  el.classList.toggle("warn", v > 0.5 && v <= 0.75);
  el.classList.toggle("danger", v > 0.75);
}

function applyModeToHud() {
  gSmile.classList.toggle("off", settings.mode === "blink");
  gBlink.classList.toggle("off", settings.mode === "smile");
  setGauge(gSmile, 0);
  setGauge(gBlink, 0);
}

function drawOverlay(det, now) {
  if (overlay.width !== video.videoWidth) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (distractions.filter && det?.face) {
    drawFilter(octx, det.landmarks, distractions.filter, overlay.width, overlay.height, now);
  }
}

// ───────── 탈락 ─────────
function gameOver(reason, ms) {
  state = "result";
  const time = Math.round(ms / 100) / 10;
  sfx.fail();
  const shot = captureShot(reason, time); // 필터가 남아 있을 때 먼저 캡처
  distractions.stop();
  stageEl.classList.remove("danger");

  const info = board.addRecord({
    name: settings.name,
    mode: settings.mode,
    diff: settings.diff,
    time,
    reason,
    at: Date.now(),
  });

  $("#result-title").textContent = REASON[reason];
  $("#result-time").textContent = time.toFixed(1);
  $("#result-badge").textContent = titleFor(time);
  $("#result-rank").textContent =
    `${settings.name} · ${MODE_LABEL[settings.mode]} · ${DIFFICULTY[settings.diff].label} — ` +
    `${info.total}명 중 ${info.rank}위` +
    (info.isBest ? " · 🎉 내 최고 기록!" : ` · 내 최고 ${info.best.toFixed(1)}초`);
  $("#result-shot").src = shot;
  $("#btn-save-shot").href = shot;
  $("#btn-save-shot").download = `pokerface_${settings.name}_${time.toFixed(1)}s.jpg`;
  showScreen("result");
}

function titleFor(t) {
  if (t < 5) return "🎰 웃음 자판기";
  if (t < 15) return "🐣 새내기 포커페이스";
  if (t < 30) return "🗿 돌부처 지망생";
  if (t < 60) return "🗿 돌부처";
  return "🛡️ 강철 포커페이스";
}

function captureShot(reason, time) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1); // 화면과 똑같이 거울 모드로
  ctx.drawImage(video, 0, 0, w, h);
  ctx.drawImage(overlay, 0, 0, w, h);
  ctx.restore();

  const bar = Math.round(h * 0.16);
  ctx.fillStyle = "rgba(20,18,31,.82)";
  ctx.fillRect(0, h - bar, w, bar);
  ctx.fillStyle = "#ffcc33";
  ctx.font = `900 ${Math.round(bar * 0.42)}px "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`${REASON[reason]}  ${time.toFixed(1)}초`, w * 0.04, h - bar / 2);
  ctx.fillStyle = "#f4f1ff";
  ctx.font = `700 ${Math.round(bar * 0.26)}px "Malgun Gothic", sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(settings.name, w * 0.96, h - bar / 2);
  return c.toDataURL("image/jpeg", 0.85);
}

// ───────── 결과 화면 버튼 ─────────
$("#btn-again").addEventListener("click", () => {
  sfx.unlock();
  showScreen("game");
  applyModeToHud();
  if (baseline) beginCountdown();
  else beginCalibration();
});

$("#btn-next").addEventListener("click", () => {
  baseline = null; // 다음 사람은 다시 보정
  state = "home";
  $("#nickname").value = "";
  showScreen("home");
  $("#nickname").focus();
});

$("#btn-result-board").addEventListener("click", () => openBoard(settings.mode));

$("#btn-quit").addEventListener("click", () => {
  distractions.stop();
  stageEl.classList.remove("danger");
  msg("");
  state = "home";
  baseline = null;
  if (cameraOn) {
    stopCamera(video);
    cameraOn = false;
  }
  showScreen("home");
});

// ───────── 순위표 ─────────
function openBoard(mode) {
  state = "board";
  $("#board-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.board === mode));
  renderBoard(mode);
  showScreen("board");
}

function renderBoard(mode) {
  boardMode = mode;
  clearArmed = false;
  $("#btn-board-clear").textContent = "기록 지우기";
  const list = $("#board-list");
  list.innerHTML = "";
  const rows = board.bestPerPlayer(mode).slice(0, 10);
  if (!rows.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty">아직 기록이 없어요. 첫 번째 도전자가 되어보세요!</span>`;
    li.style.display = "block";
    list.appendChild(li);
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    if (r.name === settings.name) li.classList.add("me");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = medals[i] || i + 1;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = r.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    const d = new Date(r.at);
    meta.textContent = `${DIFFICULTY[r.diff]?.label ?? ""} · ${REASON[r.reason]?.replace("!", "") ?? ""} · ${d.getMonth() + 1}/${d.getDate()}`;
    name.appendChild(meta);
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = r.time.toFixed(1) + "초";
    li.append(rank, name, time);
    list.appendChild(li);
  });
}

$("#btn-board-back").addEventListener("click", () => {
  state = "home";
  showScreen("home");
});

let clearArmed = false;
$("#btn-board-clear").addEventListener("click", (e) => {
  if (!clearArmed) {
    clearArmed = true;
    e.target.textContent = "정말 지울까요? 한 번 더 누르기";
    return;
  }
  board.clearRecords();
  renderBoard(boardMode);
});

// ───────── 디버그 (D 키) ─────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "d" || e.key === "D") debugEl.hidden = !debugEl.hidden;
});

function renderDebug(r) {
  const raw = r.raw || {};
  const f = (v) => (v ?? 0).toFixed(2);
  debugEl.textContent =
    `fps        ${fps.toFixed(0)}\n` +
    `smile raw  ${f(raw.smile)}  (기준 ${f(baseline?.smile)})\n` +
    `cheek raw  ${f(raw.cheek)}  (기준 ${f(baseline?.cheek)})\n` +
    `blink L/R  ${f(raw.blinkL)} / ${f(raw.blinkR)}  (기준 ${f(baseline?.blink)}, 판정 ${f(judge?.blinkTh)})\n` +
    `level      웃음 ${f(r.smile)}  눈 ${f(r.blink)}   (1.00 넘으면 위험)\n` +
    `단계       ${distractions.stage ?? "-"}  필터 ${distractions.filter ?? "-"}`;
}
