// 🪢 크리스마스 줄다리기 — 온라인 1:1 / AI 공통 · 30초
// 화면 가운데 줄이 있고, 내 손을 "상대 반대쪽"으로 당길 때마다 당긴 거리가 쌓여요.
// (왼쪽 사람은 왼쪽으로, 오른쪽 사람은 오른쪽으로 · 손을 번갈아 당기면 더 빨라요 · 아래로 당겨도 조금 인정)
// 30초 뒤 더 많이 당긴 사람이 승리! 차이가 너무 크게 벌어지면 그 자리에서 승부 끝.
import { initPose, detectPoses } from "../snowball/pose.js";
import { drawCameraCover, toPanel, drawTag, PW, PH } from "../panel.js";
import { charImg } from "../../shared/profile.js";

export const TUG_SEC = 30;
const CFG = {
  minSpeed: 0.25,  // 이 속도(패널너비/초)보다 빠르게 움직여야 당기기로 인정 (손 떨림 무시)
  downRatio: 0.5,  // 아래로 당기는 건 이 비율만큼 인정
  maxStep: 0.12,   // 한 프레임에 인정하는 최대 거리 (인식 튀는 것 방지)
  koGap: 6,        // 이만큼(패널너비 단위) 차이 나면 즉시 승부
  keyPull: 0.12,   // 키보드 F/J 번갈아 누르기 1번 = 이만큼
};
const M = 2; // 화면 표시용: 패널너비 1 = 2m

const lerp = (a, b, t) => a + (b - a) * t;

export async function startTug(ctx) {
  const { link, iAmHost, video, myCanvas, sfx, hud } = ctx;
  const g = myCanvas.getContext("2d");
  const ov = ctx.overlay;
  const og = ov.getContext("2d");
  const offs = [];
  let running = true;

  ctx.msg("🧠 몸 인식 준비 중…", true);
  await initPose();
  if (!running) return { stop() {} };

  const away = ctx.mySide === "left" ? -1 : 1; // 내가 당겨야 하는 방향 (화면 x)
  const me = { total: 0, present: false, wr: [null, null], hold: null, recent: [], lastKey: null, flash: 0 };
  const opp = { total: 0, hist: [] };
  let state = "ready";
  let readySince = null, sentReady = false, oppReady = false, phaseStart = 0, playStart = 0, lastCount = null;
  let lastNow = performance.now(), lastSend = 0, lastLeader = null;

  hud.hearts("me", null);
  hud.hearts("opp", null);
  hud.score("me", "0.0m");
  hud.score("opp", "0.0m");
  hud.clock(String(TUG_SEC));

  offs.push(
    link.on("tw:ready", () => { oppReady = true; maybeGo(); }),
    link.on("tw:go", () => !iAmHost && beginCountdown()),
    link.on("tw:pull", (m) => {
      if (m.total > opp.total) opp.hist.push({ t: performance.now(), d: m.total - opp.total });
      opp.total = Math.max(opp.total, m.total);
      hud.score("opp", `${(opp.total * M).toFixed(1)}m`);
    }),
    link.on("tw:end", (m) => {
      if (iAmHost) return;
      opp.total = m.host;
      finish(m.winner === "guest" ? "win" : m.winner === "host" ? "lose" : "draw", m.ko);
    })
  );

  // 키보드로도 당기기 (F / J 번갈아 누르기) — 손이 잘 안 잡힐 때
  const onKey = (e) => {
    if (state !== "play") return;
    const k = e.code === "KeyF" ? "F" : e.code === "KeyJ" ? "J" : null;
    if (!k || k === me.lastKey) return;
    me.lastKey = k;
    addPull(CFG.keyPull, performance.now());
  };
  document.addEventListener("keydown", onKey);
  offs.push(() => document.removeEventListener("keydown", onKey));

  function maybeGo() {
    if (!iAmHost || state !== "ready" || !sentReady || !oppReady) return;
    link.send("tw:go");
    beginCountdown();
  }
  function beginCountdown() {
    if (state !== "ready") return;
    state = "countdown";
    phaseStart = performance.now();
    lastCount = null;
  }

  function finish(result, ko = false) {
    if (state === "over") return;
    state = "over";
    if (iAmHost) link.send("tw:end", { winner: result === "win" ? "host" : result === "lose" ? "guest" : null, host: me.total, guest: opp.total, ko });
    ctx.msg(ko ? (result === "win" ? "💪 압도적 승리!" : "😵 끌려갔다…") : result === "win" ? "👑 WIN!" : result === "lose" ? "💀 졌다…" : "🤝 DRAW");
    const mine = +(me.total * M).toFixed(1), theirs = +(opp.total * M).toFixed(1);
    setTimeout(
      () =>
        ctx.onEnd({
          result,
          detail: `${mine}m:${theirs}m`,
          myScore: `${mine}m`,
          oppScore: `${theirs}m`,
          lines: [`당긴 거리 ${mine}m : ${theirs}m`, ko ? "차이가 너무 벌어져서 조기 종료!" : `${TUG_SEC}초 끝!`, `최고 속도 ${me.best ? me.best.toFixed(1) : "0"}m/초`],
        }),
      1200
    );
  }

  function addPull(amount, now) {
    me.total += amount;
    me.recent.push({ t: now, d: amount });
    me.flash = now;
  }

  // ───── 포즈 → 손목 ─────
  function updateMe(lms, map, now, dt) {
    if (!lms) { me.present = false; me.wr = [null, null]; me.hold = null; return; }
    me.present = true;
    const pts = [15, 16].map((i) => ({ ...toPanel(map, lms[i].x, lms[i].y), v: lms[i].visibility ?? 1 }));
    pts.forEach((p, i) => {
      const ok = p.v > 0.4 && p.x > -30 && p.x < PW + 30 && p.y < PH + 30;
      const prev = me.wr[i];
      if (!ok) { me.wr[i] = null; return; }
      const cur = prev ? { x: lerp(prev.x, p.x, 0.65), y: lerp(prev.y, p.y, 0.65) } : { x: p.x, y: p.y };
      if (prev && state === "play" && dt > 0) {
        const dx = cur.x - prev.x, dy = cur.y - prev.y;
        if (Math.hypot(dx, dy) / dt > CFG.minSpeed * PW) {
          const gain = Math.min(CFG.maxStep * PW, Math.max(0, dx * away) + Math.max(0, dy) * CFG.downRatio) / PW;
          if (gain > 0) addPull(gain, now);
        }
      }
      me.wr[i] = cur;
    });
    const hs = me.wr.filter(Boolean);
    me.hold = hs.length ? { x: hs.reduce((a, b) => a + b.x, 0) / hs.length, y: hs.reduce((a, b) => a + b.y, 0) / hs.length } : null;
  }

  // 최근 1초 당긴 속도 (m/초)
  const speedOf = (list, now) => list.filter((r) => now - r.t < 1000).reduce((a, r) => a + r.d, 0) * M;

  // ───── 루프 ─────
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    const map = drawCameraCover(g, video);
    g.fillStyle = "rgba(8, 12, 48, 0.25)";
    g.fillRect(0, 0, PW, PH);
    const poses = detectPoses(video);
    updateMe(poses[0] || null, map, now, dt);
    me.recent = me.recent.filter((r) => now - r.t < 1500);
    opp.hist = opp.hist.filter((r) => now - r.t < 1500);

    if (now - lastSend > 100) {
      lastSend = now;
      link.send("tw:pull", { total: me.total });
      hud.score("me", `${(me.total * M).toFixed(1)}m`);
    }

    if (state === "ready") {
      if (me.present) {
        readySince ??= now;
        if (!sentReady && now - readySince > 800) {
          sentReady = true;
          link.send("tw:ready");
          maybeGo();
        }
      } else readySince = null;
      ctx.msg(
        !me.present ? `🙋 상체와 두 손이 보이게<small>카메라에서 1.5~2m쯤 떨어져 서 주세요</small>` : sentReady ? `⏳ ${ctx.opp.nick} 준비 기다리는 중…` : `👍 좋아요! 잠깐만요…`,
        true
      );
    } else if (state === "countdown") {
      const n = 3 - Math.floor((now - phaseStart) / 1000);
      if (n <= 0) {
        state = "play";
        playStart = now;
        ctx.msg("");
        sfx.beep(true);
      } else if (n !== lastCount) {
        lastCount = n;
        sfx.beep(false);
        ctx.msg(`<span class="count">${n}</span><small>줄을 꽉 잡고… ${away < 0 ? "← 왼쪽" : "오른쪽 →"}으로 당길 준비!</small>`);
      }
    } else if (state === "play") {
      const left = TUG_SEC - (now - playStart) / 1000;
      hud.clock(String(Math.max(0, Math.ceil(left))), left <= 10);
      const sp = speedOf(me.recent, now);
      me.best = Math.max(me.best || 0, sp);
      ctx.msg(me.present ? "" : "🙈 화면 안으로 들어와서 당겨요!");
      // 누가 이기고 있는지 바뀌면 효과음
      const lead = Math.abs(me.total - opp.total) < 0.15 ? null : me.total > opp.total ? "me" : "opp";
      if (lead && lead !== lastLeader) sfx.tone({ type: "square", from: lead === "me" ? 660 : 330, to: lead === "me" ? 990 : 220, dur: 0.15, vol: 0.06 });
      lastLeader = lead;
      if (iAmHost) {
        const diff = me.total - opp.total;
        if (Math.abs(diff) >= CFG.koGap) finish(diff > 0 ? "win" : "lose", true);
        else if (left <= 0) finish(diff > 0.05 ? "win" : diff < -0.05 ? "lose" : "draw");
      }
    }

    drawMyPanel(now);
    drawOverlay(now);
  }
  requestAnimationFrame(loop);

  // ───── 내 패널 (친구에게 전송됨): 내 손에서 상대 쪽으로 이어지는 줄 ─────
  function drawMyPanel(now) {
    const edgeX = away < 0 ? PW + 10 : -10; // 상대 쪽 가장자리
    const y = me.hold ? me.hold.y : PH * 0.6;
    const x = me.hold ? me.hold.x : PW / 2;
    rope(g, x + away * 60, y + 10, edgeX, PH * 0.62, 12);
    for (const w of me.wr) {
      if (!w) continue;
      const hot = now - me.flash < 120;
      g.fillStyle = hot ? "#ffd23f" : ctx.me.color;
      g.beginPath();
      g.arc(w.x, w.y, hot ? 22 : 16, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#1a1033";
      g.stroke();
    }
    if (state === "play") {
      g.font = `700 22px "Galmuri11", sans-serif`;
      g.textAlign = "center";
      g.lineWidth = 5;
      g.strokeStyle = "rgba(0,0,0,.6)";
      const t = away < 0 ? "⬅⬅ 당겨!" : "당겨! ➡➡";
      g.strokeText(t, PW / 2, 40);
      g.fillStyle = "#fff";
      g.fillText(t, PW / 2, 40);
      g.textAlign = "start";
    }
    drawTag(g, ctx.me.nick, charImg(ctx.me.char), ctx.me.color);
  }

  // ───── 가운데 줄 + 실시간 승부 상황 (내 화면에서만) ─────
  function drawOverlay(now) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(ov.clientWidth * dpr), H = Math.round(ov.clientHeight * dpr);
    if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    og.clearRect(0, 0, W, H);
    if (state === "ready") return;
    const L = ctx.panelRect("left"), R = ctx.panelRect("right");
    const cx = (L.x + L.w + R.x) / 2;
    const y = L.y + L.h * 0.62;
    const x0 = L.x + L.w * 0.75, x1 = R.x + R.w * 0.25;
    const half = (x1 - x0) / 2;
    // 왼쪽(=방장) 기준 차이 → 리본 위치 (왼쪽으로 갈수록 왼쪽 사람이 이기는 중)
    const leftTotal = ctx.mySide === "left" ? me.total : opp.total;
    const rightTotal = ctx.mySide === "left" ? opp.total : me.total;
    const pos = Math.max(-1, Math.min(1, (rightTotal - leftTotal) / CFG.koGap)); // -1(왼쪽 승) ~ 1(오른쪽 승)
    const wob = Math.sin(now / 60) * 3;

    // 승부선
    og.fillStyle = "rgba(255,255,255,.85)";
    og.fillRect(cx - 2, y - 70, 4, 140);
    for (const s of [-1, 1]) {
      og.fillStyle = s < 0 ? "rgba(255,74,74,.5)" : "rgba(46,204,113,.5)";
      og.fillRect(cx + s * half * 0.98 - 2, y - 50, 4, 100);
    }
    // 줄
    rope(og, x0, y + wob, x1, y - wob, 9);
    // 가운데 리본
    const rx = cx + pos * half * 0.98;
    og.fillStyle = "#ff3b3b";
    og.beginPath();
    og.moveTo(rx, y - 6);
    og.lineTo(rx - 14, y - 34);
    og.lineTo(rx + 14, y - 34);
    og.closePath();
    og.fill();
    og.beginPath();
    og.moveTo(rx, y + 6);
    og.lineTo(rx - 14, y + 34);
    og.lineTo(rx + 14, y + 34);
    og.closePath();
    og.fill();
    og.fillStyle = "#ffd23f";
    og.fillRect(rx - 6, y - 6, 12, 12);

    // 누가 이기고 있나
    const diffM = Math.abs(leftTotal - rightTotal) * M;
    const leftName = ctx.mySide === "left" ? ctx.me.nick : ctx.opp.nick;
    const rightName = ctx.mySide === "left" ? ctx.opp.nick : ctx.me.nick;
    let text, color;
    if (diffM < 0.3) { text = "⚖️ 접전!"; color = "#ffffff"; }
    else if (leftTotal > rightTotal) { text = `⬅ ${leftName} 우세! (+${diffM.toFixed(1)}m)`; color = "#ff6b6b"; }
    else { text = `${rightName} 우세! (+${diffM.toFixed(1)}m) ➡`; color = "#5ee07a"; }
    og.font = `700 ${diffM > 4 ? 30 : 24}px "Galmuri11", sans-serif`;
    og.textAlign = "center";
    og.textBaseline = "middle";
    og.lineWidth = 6;
    og.strokeStyle = "rgba(0,0,0,.75)";
    og.strokeText(text, cx, L.y + 26);
    og.fillStyle = color;
    og.fillText(text, cx, L.y + 26);

    // 속도 게이지 (최근 1초)
    const meSp = speedOf(me.recent, now), oppSp = speedOf(opp.hist, now);
    const sp = { [ctx.mySide]: meSp, [ctx.mySide === "left" ? "right" : "left"]: oppSp };
    for (const [side, rect] of [["left", L], ["right", R]]) {
      const v = Math.min(1, sp[side] / 3);
      const bx = rect.x + 16, by = rect.y + rect.h - 70, bw = rect.w * 0.45;
      og.fillStyle = "rgba(0,0,0,.5)";
      og.fillRect(bx, by, bw, 14);
      og.fillStyle = v > 0.66 ? "#ff3b3b" : v > 0.33 ? "#ffd23f" : "#5ee07a";
      og.fillRect(bx, by, bw * v, 14);
      og.font = `700 13px "Galmuri11", sans-serif`;
      og.textAlign = "left";
      og.fillStyle = "#fff";
      og.fillText(`💪 ${sp[side].toFixed(1)}m/초`, bx, by - 10);
    }
  }

  return {
    stop() {
      running = false;
      offs.forEach((off) => off());
      og.clearRect(0, 0, ov.width, ov.height);
    },
  };
}

/** 꼬인 밧줄 그리기 */
export function rope(c, x0, y0, x1, y1, w) {
  c.save();
  c.lineCap = "round";
  c.strokeStyle = "#5a3418";
  c.lineWidth = w + 4;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  c.strokeStyle = "#c8955a";
  c.lineWidth = w;
  c.stroke();
  // 꼬임 무늬
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 14);
  c.strokeStyle = "#8a5a2b";
  c.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    c.beginPath();
    c.moveTo(x - 3, y - w / 2);
    c.lineTo(x + 3, y + w / 2);
    c.stroke();
  }
  c.restore();
}
