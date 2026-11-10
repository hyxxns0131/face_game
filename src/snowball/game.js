// ☃️ 크리스마스 눈싸움 — 온라인 1:1 / AI 공통 · 60초 점수제
// 눈덩이를 크게 굴려서 맞힐수록 점수가 커요 (1~10점). 60초 뒤 점수가 높은 사람이 승리!
// 내 패널: 내 카메라 + 내리는 눈 + 내 손의 눈덩이 (이 화면이 친구에게 영상으로 감)
// 던진 눈덩이는 두 패널 위 오버레이에 그려지고, 맞았는지는 "맞는 사람" 쪽에서 판정해요 (내 얼굴은 내가 제일 정확히 아니까).
import { initPose, detectPoses } from "./pose.js";
import { drawCameraCover, toPanel, drawTag, PW, PH } from "../panel.js";
import { charImg } from "../../shared/profile.js";

const CFG = {
  flakeRate: 30,      // 초당 내리는 눈송이
  flakeArea: 45,      // 눈송이 1개 받으면 늘어나는 양
  rollArea: 320,      // 손 한 바퀴 돌리면 늘어나는 양
  rollMinSpeed: 0.2,  // 이 속도(패널너비/초) 이상 움직여야 굴리기로 인정
  catchPad: 26,
  minR: 16,
  maxR: 60,
  throwSpeed: 1.0,    // 던지기: 상대 쪽으로 이 속도(패널너비/초) 이상 휘두르기
  cooldown: 700,
  hitSlack: 0.7,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
export const ROUND_SEC = 60;
// 눈덩이 크기 → 점수: 가장 작은 눈덩이(반지름 16) 1점 ~ 최대 크기(반지름 60) 10점
export const pointsFor = (r) => Math.max(1, Math.min(10, Math.round(((r - 16) / (60 - 16)) * 9) + 1));

export async function startSnowball(ctx) {
  const { link, iAmHost, settings, video, myCanvas, sfx, hud } = ctx;
  const g = myCanvas.getContext("2d");
  const ov = ctx.overlay;
  const og = ov.getContext("2d");
  const offs = [];
  let running = true;

  ctx.msg("🧠 몸 인식 준비 중…", true);
  await initPose();
  if (!running) return { stop() {} };

  // 내 패널이 왼쪽이면 오른쪽(+x)으로 던짐
  const dir = ctx.mySide === "left" ? 1 : -1;
  const me = {
    score: 0, hits: 0, throws: 0, dodges: 0, maxR: 0, bestHit: 0,
    present: false, head: null, headR: 40, hand: null, handIdx: null, hist: [],
    r: 0, prevAng: null, rollAcc: 0, lastAbs: 0, cool: 0,
  };
  const opp = { score: 0, head: { x: PW / 2, y: PH * 0.4 }, headR: 40, present: true };
  let flakes = [], shots = [], texts = [], puffs = [], splats = [];
  let flakeAcc = 0, lastNow = performance.now(), lastSend = 0, shotId = 0;
  let state = "ready"; // ready → countdown → play → over
  let readySince = null, sentReady = false, oppReady = false, phaseStart = 0, playStart = 0, lastCount = null;

  hud.hearts("me", null);
  hud.hearts("opp", null);
  hud.score("me", 0);
  hud.score("opp", 0);
  hud.clock(String(ROUND_SEC));

  // ───── 메시지 ─────
  offs.push(
    link.on("sb:ready", () => {
      oppReady = true;
      maybeGo();
    }),
    link.on("sb:go", () => !iAmHost && beginCountdown()),
    link.on("sb:state", (m) => {
      opp.present = m.present;
      if (m.head) opp.head = { x: m.head.x * PW, y: m.head.y * PH };
      opp.headR = m.headR * PW;
    }),
    link.on("sb:throw", (m) => {
      // 날아오는 눈덩이 (상대 패널 → 내 패널)
      shots.push({ id: m.id, mine: false, from: { x: m.from.x * PW, y: m.from.y * PH }, to: { x: m.to.x * PW, y: m.to.y * PH }, r: m.r * PW, t0: performance.now(), dur: m.dur, done: false });
      sfx.tone({ type: "triangle", from: 500, to: 200, dur: 0.2, vol: 0.1 });
    }),
    link.on("sb:result", (m) => {
      // 내가 던진 눈덩이 결과
      const s = shots.find((x) => x.id === m.id && x.mine);
      const at = s ? s.to : opp.head;
      if (m.hit) {
        me.score += m.pts;
        me.hits++;
        me.bestHit = Math.max(me.bestHit, m.pts);
        hud.score("me", me.score, true);
        const huge = m.pts >= 8;
        texts.push({ side: "opp", text: huge ? `💥 대형 명중! +${m.pts}` : `명중! +${m.pts}`, x: at.x, y: at.y - 40, color: huge ? "#ff6b6b" : "#ffd23f", t0: performance.now(), big: true, huge });
        if (huge) sfx.fanfare(true);
        splats.push({ side: "opp", at: { ...at }, r: (s?.r || 30) * 1.3, t0: performance.now(), blobs: blobs((s?.r || 30) * 1.3) });
        ctx.flash("opp", "");
        sfx.honk();
      } else {
        texts.push({ side: "opp", text: "피했다! 😎", x: at.x, y: at.y - 40, color: "#e0f2fe", t0: performance.now() });
        sfx.boing();
      }
      if (s) s.resolved = true;
    }),
    link.on("sb:end", (m) => !iAmHost && finish(m.winner === "guest" ? "win" : m.winner === "host" ? "lose" : "draw"))
  );

  function maybeGo() {
    if (!iAmHost || state !== "ready" || !sentReady || !oppReady) return;
    link.send("sb:go");
    beginCountdown();
  }
  function beginCountdown() {
    if (state !== "ready") return;
    state = "countdown";
    phaseStart = performance.now();
    lastCount = null;
  }
  function finish(result) {
    if (state === "over") return;
    state = "over";
    if (iAmHost) link.send("sb:end", { winner: result === "win" ? "host" : result === "lose" ? "guest" : null });
    ctx.msg(result === "win" ? "👑 WIN!" : result === "lose" ? "💀 K.O." : "🤝 DRAW");
    setTimeout(
      () =>
        ctx.onEnd({
          result,
          detail: `⭐${me.score}:${opp.score}`,
          myScore: me.score,
          oppScore: opp.score,
          lines: [`점수 ${me.score} : ${opp.score}`, `명중 ${me.hits}/${me.throws} · 피함 ${me.dodges} · 최고 한 방 ${me.bestHit ? "+" + me.bestHit : "-"}`, `최대 눈덩이 ${me.maxR ? Math.round(me.maxR * 2) + "cm (" + pointsFor(me.maxR) + "점짜리)" : "-"}`],
        }),
      1200
    );
  }

  // ───── 포즈 → 내 상태 ─────
  function updateMe(lms, map, now) {
    if (!lms) {
      me.present = false; me.hand = null; me.hist = []; me.prevAng = null;
      return;
    }
    const P = (i) => ({ ...toPanel(map, lms[i].x, lms[i].y), v: lms[i].visibility ?? 1 });
    const nose = P(0), ls = P(11), rs = P(12);
    me.present = true;
    me.head = me.head ? { x: lerp(me.head.x, nose.x, 0.6), y: lerp(me.head.y, nose.y, 0.6) } : { x: nose.x, y: nose.y };
    me.headR = Math.max(24, dist(ls, rs) * 0.33);
    const wr = [P(15), P(16)];
    const ok = wr.map((w) => w.v > 0.4 && w.y < PH * 1.02 && w.x > -20 && w.x < PW + 20);
    let idx = me.handIdx;
    const otherHigher = idx !== null && ok[1 - idx] && wr[1 - idx].y < wr[idx].y - 0.12 * PH;
    if (idx === null || !ok[idx] || (me.r === 0 && otherHigher)) idx = ok[0] && ok[1] ? (wr[0].y < wr[1].y ? 0 : 1) : ok[0] ? 0 : ok[1] ? 1 : null;
    if (idx !== me.handIdx) { me.hist = []; me.prevAng = null; me.hand = null; }
    me.handIdx = idx;
    if (idx === null) { me.hand = null; return; }
    const w = wr[idx];
    me.hand = me.hand ? { x: lerp(me.hand.x, w.x, 0.6), y: lerp(me.hand.y, w.y, 0.6) } : { x: w.x, y: w.y };
    me.hist.push({ x: me.hand.x, y: me.hand.y, t: now });
    while (me.hist.length && now - me.hist[0].t > 160) me.hist.shift();
  }

  function grow(amount) {
    me.r = Math.min(CFG.maxR, Math.sqrt(me.r * me.r + amount));
  }

  function stepMe(dt, now) {
    me.cool -= dt * 1000;
    if (!me.hand) { me.prevAng = null; return; }
    const reach = Math.max(me.r, 10) + CFG.catchPad;
    for (const f of flakes) {
      if (!f.dead && dist(f, me.hand) < reach + f.r) {
        f.dead = true;
        grow(CFG.flakeArea);
        puffs.push({ x: f.x, y: f.y, t0: now, n: 4, size: 3 });
      }
    }
    if (me.hist.length >= 2) {
      const a = me.hist[me.hist.length - 2], b = me.hist[me.hist.length - 1];
      const ddt = Math.max(0.001, (b.t - a.t) / 1000);
      const vx = (b.x - a.x) / ddt, vy = (b.y - a.y) / ddt;
      if (Math.hypot(vx, vy) > CFG.rollMinSpeed * PW) {
        const ang = Math.atan2(vy, vx);
        if (me.prevAng !== null) me.rollAcc += Math.atan2(Math.sin(ang - me.prevAng), Math.cos(ang - me.prevAng));
        me.prevAng = ang;
      } else me.prevAng = null;
    }
    me.rollAcc *= Math.pow(0.35, dt);
    const abs = Math.abs(me.rollAcc);
    if (me.r > 0 && abs > me.lastAbs) grow(((abs - me.lastAbs) / (2 * Math.PI)) * CFG.rollArea);
    me.lastAbs = abs;

    if (me.r >= CFG.minR && me.cool <= 0 && me.hist.length >= 3) {
      const f = me.hist[0], l = me.hist[me.hist.length - 1];
      const ddt = (l.t - f.t) / 1000;
      if (ddt > 0.05) {
        const vx = (l.x - f.x) / ddt, vy = (l.y - f.y) / ddt;
        if (vx * dir > CFG.throwSpeed * PW && Math.abs(vx) > Math.abs(vy) * 0.7) throwBall(now);
      }
    }
  }

  function throwBall(now) {
    const id = `${iAmHost ? "h" : "g"}${++shotId}`;
    const from = { ...me.hand };
    const to = { ...opp.head };
    const dur = (0.75 + me.r / 90) * 1000 + 150; // 클수록 느리게 (+ 네트워크 여유)
    shots.push({ id, mine: true, from, to, r: me.r, t0: now, dur, done: false });
    link.send("sb:throw", { id, from: { x: from.x / PW, y: from.y / PH }, to: { x: to.x / PW, y: to.y / PH }, r: me.r / PW, dur });
    me.throws++;
    me.maxR = Math.max(me.maxR, me.r);
    me.r = 0; me.rollAcc = 0; me.lastAbs = 0; me.prevAng = null; me.cool = CFG.cooldown;
    sfx.tone({ type: "triangle", from: 700, to: 180, dur: 0.25, vol: 0.15 });
  }

  // 날아온 눈덩이 판정 (내 얼굴 기준)
  function resolveIncoming(s, now) {
    const endR = s.r * 1.3;
    const hit = !me.present || !me.head || dist(me.head, s.to) < endR + me.headR * CFG.hitSlack;
    const pts = pointsFor(s.r);
    if (hit) {
      opp.score += pts;
      hud.score("opp", opp.score, true);
      splats.push({ side: "me", follow: true, r: endR, t0: now, blobs: blobs(endR) });
      texts.push({ side: "me", text: `으악! 상대 +${pts}`, x: s.to.x, y: s.to.y - 40, color: "#ff6b6b", t0: now, big: true });
      ctx.flash("me", "");
      sfx.honk();
    } else {
      me.dodges++;
      puffs.push({ x: s.to.x, y: s.to.y, t0: now, n: 14, size: 6 });
      texts.push({ side: "me", text: "회피! 😎", x: s.to.x, y: s.to.y - 40, color: "#e0f2fe", t0: now });
      sfx.boing();
    }
    link.send("sb:result", { id: s.id, hit, pts });
  }

  function blobs(r) {
    return Array.from({ length: 9 }, () => ({ dx: rand(-1, 1) * r * 0.9, dy: rand(-1, 1) * r * 0.9, r: rand(0.25, 0.6) * r }));
  }

  // ───── 루프 ─────
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    const map = drawCameraCover(g, video);
    g.fillStyle = "rgba(8, 12, 48, 0.3)";
    g.fillRect(0, 0, PW, PH);
    const poses = detectPoses(video);
    updateMe(poses[0] || null, map, now);

    // 눈송이
    flakeAcc += CFG.flakeRate * dt;
    while (flakeAcc >= 1) {
      flakeAcc--;
      flakes.push({ x: Math.random() * PW, y: -10, r: rand(2, 5), vy: rand(40, 95), sway: Math.random() * 6.28, dead: false });
    }
    for (const f of flakes) { f.y += f.vy * dt; f.x += Math.sin(now / 600 + f.sway) * 14 * dt; }
    flakes = flakes.filter((f) => !f.dead && f.y < PH + 10);

    if (now - lastSend > 70) {
      lastSend = now;
      link.send("sb:state", { present: me.present, head: me.head ? { x: me.head.x / PW, y: me.head.y / PH } : null, headR: me.headR / PW });
    }

    if (state === "ready") {
      if (me.present) {
        readySince ??= now;
        if (!sentReady && now - readySince > 800) {
          sentReady = true;
          link.send("sb:ready");
          maybeGo();
        }
      } else readySince = null;
      ctx.msg(
        !me.present
          ? `🙋 상체와 두 손이 보이게<small>카메라에서 2m쯤 떨어져 서 주세요</small>`
          : sentReady ? `⏳ ${ctx.opp.nick} 준비 기다리는 중…` : `👍 좋아요! 잠깐만요…`,
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
        ctx.msg(`<span class="count">${n}</span><small>손을 들고 눈을 받을 준비!</small>`);
      }
    } else if (state === "play") {
      stepMe(dt, now);
      for (const s of shots) {
        if (!s.done && now - s.t0 >= s.dur) {
          s.done = true;
          if (!s.mine) resolveIncoming(s, now);
        }
      }
      shots = shots.filter((s) => !s.done || (s.mine && !s.resolved && now - s.t0 < s.dur + 3000));
      const left = ROUND_SEC - (now - playStart) / 1000;
      hud.clock(String(Math.max(0, Math.ceil(left))), left <= 10);
      ctx.msg(me.present ? "" : "🙈 화면 밖으로 나가면 맞은 걸로 쳐요!");
      if (left <= 0 && iAmHost && state === "play") {
        const cmp = me.score - opp.score;
        finish(cmp > 0 ? "win" : cmp < 0 ? "lose" : "draw");
      }
    }

    drawMyPanel(now);
    drawOverlay(now);
  }
  requestAnimationFrame(loop);

  // ───── 그리기: 내 패널 (친구에게 전송됨) ─────
  function drawMyPanel(now) {
    g.fillStyle = "rgba(255,255,255,.9)";
    for (const f of flakes) {
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    }
    puffs = puffs.filter((p) => now - p.t0 < 500);
    for (const p of puffs) {
      const k = (now - p.t0) / 500;
      g.fillStyle = `rgba(255,255,255,${1 - k})`;
      for (let i = 0; i < p.n; i++) {
        const a = (i / p.n) * Math.PI * 2;
        g.beginPath();
        g.arc(p.x + Math.cos(a) * k * 30, p.y + Math.sin(a) * k * 30, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (me.hand) {
      const { x, y } = me.hand;
      if (me.r <= 0) {
        g.save();
        g.setLineDash([5, 6]);
        g.strokeStyle = ctx.me.color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, 10 + CFG.catchPad, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      } else {
        snowball(g, x, y, me.r);
        const ready = me.r >= CFG.minR;
        g.lineWidth = 4;
        g.strokeStyle = ready ? ctx.me.color : "rgba(255,255,255,.4)";
        g.beginPath();
        g.arc(x, y, me.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, me.r / CFG.maxR));
        g.stroke();
        if (state === "play") {
          g.font = `700 16px "Galmuri11", sans-serif`;
          g.textAlign = "center";
          const t = `⭐${pointsFor(me.r)}점 ${dir > 0 ? "휙! →" : "← 휙!"}`;
          g.lineWidth = 4;
          g.strokeStyle = "rgba(0,0,0,.6)";
          g.strokeText(ready ? t : `⭐${pointsFor(me.r)}점 · 더 키워요!`, x, y - me.r - 14);
          g.fillStyle = ready ? "#fff" : "rgba(255,255,255,.6)";
          g.fillText(ready ? t : `⭐${pointsFor(me.r)}점 · 더 키워요!`, x, y - me.r - 14);
          g.textAlign = "start";
        }
      }
    }
    // 맞은 자국 (내 얼굴 따라다님)
    for (const sp of splats) {
      if (sp.side !== "me" || !me.head) continue;
      const a = 1 - (now - sp.t0) / 1400;
      if (a <= 0) continue;
      g.fillStyle = `rgba(255,255,255,${0.95 * a})`;
      for (const b of sp.blobs) {
        g.beginPath();
        g.arc(me.head.x + b.dx, me.head.y + b.dy, b.r, 0, Math.PI * 2);
        g.fill();
      }
    }
    drawTag(g, ctx.me.nick, charImg(ctx.me.char), ctx.me.color);
  }

  // ───── 그리기: 두 패널 위 오버레이 (내 화면에서만) ─────
  function drawOverlay(now) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(ov.clientWidth * dpr), H = Math.round(ov.clientHeight * dpr);
    if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    og.clearRect(0, 0, W, H);
    const R = { me: ctx.panelRect("me"), opp: ctx.panelRect("opp") };
    const k = R.me.w / PW; // 패널 1px → 화면 px
    const P = (side, p) => ({ x: R[side].x + (p.x / PW) * R[side].w, y: R[side].y + (p.y / PH) * R[side].h });

    for (const s of shots) {
      const fromSide = s.mine ? "me" : "opp", toSide = s.mine ? "opp" : "me";
      const t = Math.min(1, (now - s.t0) / s.dur);
      const a = P(fromSide, s.from), b = P(toSide, s.to);
      const targetR = (s.r * 1.3 + (s.mine ? opp.headR : me.headR) * CFG.hitSlack) * k;
      if (t < 1) {
        og.save();
        og.strokeStyle = `rgba(255,70,70,${0.5 + t * 0.5})`;
        og.lineWidth = 3;
        const pr = targetR * (1 + Math.sin(now / 70) * 0.08);
        og.beginPath();
        og.arc(b.x, b.y, pr, 0, Math.PI * 2);
        og.stroke();
        og.beginPath();
        og.moveTo(b.x - pr * 0.4, b.y); og.lineTo(b.x + pr * 0.4, b.y);
        og.moveTo(b.x, b.y - pr * 0.4); og.lineTo(b.x, b.y + pr * 0.4);
        og.stroke();
        og.restore();
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t) - Math.sin(Math.PI * t) * R.me.h * 0.25;
        snowball(og, x, y, s.r * k * (0.9 + 0.4 * t));
      }
    }
    // 상대 패널 위 맞은 자국 (상대 화면 영상 위에 겹쳐 그림)
    splats = splats.filter((sp) => now - sp.t0 < 1400);
    for (const sp of splats) {
      if (sp.side !== "opp") continue;
      const a = 1 - (now - sp.t0) / 1400;
      const c = P("opp", opp.head || sp.at);
      og.fillStyle = `rgba(255,255,255,${0.95 * a})`;
      for (const b of sp.blobs) {
        og.beginPath();
        og.arc(c.x + b.dx * k, c.y + b.dy * k, b.r * k, 0, Math.PI * 2);
        og.fill();
      }
    }
    texts = texts.filter((t) => now - t.t0 < 1100);
    og.textAlign = "center";
    og.textBaseline = "middle";
    for (const t of texts) {
      const q = (now - t.t0) / 1100;
      const p = P(t.side, { x: t.x, y: t.y });
      og.globalAlpha = 1 - q;
      og.font = `700 ${t.huge ? 34 + 10 * Math.sin(q * Math.PI) : t.big ? 26 : 20}px "Galmuri11", sans-serif`;
      og.lineWidth = 5;
      og.strokeStyle = "rgba(0,0,0,.7)";
      og.strokeText(t.text, p.x, p.y - q * 30);
      og.fillStyle = t.color;
      og.fillText(t.text, p.x, p.y - q * 30);
    }
    og.globalAlpha = 1;
  }

  return {
    stop() {
      running = false;
      offs.forEach((off) => off());
      og.clearRect(0, 0, ov.width, ov.height);
    },
  };
}

export function snowball(c, x, y, r) {
  const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.7, "#e6f2ff");
  gr.addColorStop(1, "#9fbfe3");
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = gr;
  c.fill();
}
