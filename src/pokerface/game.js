// 🎅 산타 포커페이스 — 온라인 1:1 / AI 공통
// 각자 자기 카메라로 자기 얼굴만 판정하고, 결과(하트)를 메시지로 주고받아요.
// 방장이 방해 요소를 만들어 친구에게도 똑같이 보냅니다.
import { initDetector, detectFace } from "./detector.js";
import { Calibrator, Judge, DIFFICULTY } from "./judge.js";
import { Distractions } from "./distractions.js";
import { drawFilter } from "./filters.js";
import { drawCameraCover, toPanel, drawTag, PW, PH } from "../panel.js";
import { charImg } from "../../shared/profile.js";

const REASON = { smile: "😂 웃음!", blink: "😑 깜빡!", lost: "🙈 이탈!" };
const GRACE_MS = 1600;
const CALIB_MS = 3000;

export async function startPokerface(ctx) {
  const { link, iAmHost, settings, video, myCanvas, sfx, hud } = ctx;
  const DIFF = DIFFICULTY[settings.pfDiff] || DIFFICULTY.normal;
  const MODE = settings.pfMode;
  const g = myCanvas.getContext("2d");
  const offs = [];
  let running = true;

  ctx.msg("🧠 얼굴 인식 준비 중…", true);
  await initDetector();
  if (!running) return { stop() {} };

  const me = { hearts: settings.hearts, calib: new Calibrator(), calibMs: 0, base: null, judge: null, graceUntil: 0, reason: "", stats: { smile: 0, blink: 0, lost: 0 }, crop: null };
  const opp = { hearts: settings.hearts, calibrated: false };
  let state = "calib"; // calib → wait → countdown → play → over
  let phaseStart = 0, playStart = 0, lastCount = null, lastNow = performance.now();

  const dx = new Distractions(ctx.dxLayer, ctx.arena, sfx, iAmHost ? (ev) => link.send("pf:dx", { ev }) : null);
  hud.hearts("me", me.hearts);
  hud.hearts("opp", opp.hearts);
  hud.clock("0.0");

  // ───── 메시지 ─────
  offs.push(
    link.on("pf:calibrated", () => {
      opp.calibrated = true;
      maybeGo();
    }),
    link.on("pf:go", () => !iAmHost && beginCountdown()),
    link.on("pf:dx", (m) => dx.apply(m.ev)),
    link.on("pf:heart", (m) => {
      opp.hearts = m.hearts;
      hud.hearts("opp", m.hearts, true);
      ctx.flash("opp", REASON[m.reason] || "");
      sfx.honk();
    }),
    link.on("pf:dead", () => iAmHost && finish("win")),
    link.on("pf:end", (m) => !iAmHost && finish(m.winner === "guest" ? "win" : m.winner === "host" ? "lose" : "draw"))
  );

  function maybeGo() {
    if (!iAmHost || state !== "wait" || !opp.calibrated) return;
    link.send("pf:go");
    beginCountdown();
  }

  function beginCountdown() {
    if (state === "countdown" || state === "play") return;
    me.base = me.calib.result();
    me.judge = new Judge(MODE, DIFF, me.base);
    state = "countdown";
    phaseStart = performance.now();
    lastCount = null;
  }

  function finish(result) {
    if (state === "over") return;
    state = "over";
    dx.stop();
    if (iAmHost) link.send("pf:end", { winner: result === "win" ? "host" : result === "lose" ? "guest" : null });
    ctx.panelMsg("me", result === "lose" ? `<span class="big">💀 K.O.</span>` : `<span class="big">👑 WIN</span>`);
    ctx.panelMsg("opp", result === "lose" ? `<span class="big">👑 WIN</span>` : `<span class="big">💀 K.O.</span>`);
    const time = ((performance.now() - playStart) / 1000).toFixed(1);
    setTimeout(() => ctx.onEnd({ result, detail: `${time}초`, lines: [`⏱ ${time}초 동안 대결`, `나: 웃음 ${me.stats.smile} · 깜빡 ${me.stats.blink} · 이탈 ${me.stats.lost}`] }), 1300);
  }

  // ───── 얼굴 → 패널 ─────
  function drawMe(face, now) {
    // 얼굴 쪽으로 살짝 확대해서 그리기
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    let target = { cx: vw / 2, cy: vh / 2, w: Math.min(vw, (vh * 4) / 3) };
    if (face) {
      let minx = 1, maxx = 0, miny = 1, maxy = 0;
      for (const l of face.landmarks) {
        if (l.x < minx) minx = l.x; if (l.x > maxx) maxx = l.x;
        if (l.y < miny) miny = l.y; if (l.y > maxy) maxy = l.y;
      }
      const fh = (maxy - miny) * vh;
      const w = Math.min(Math.max(fh * 2.6 * (4 / 3), 220), Math.min(vw, (vh * 4) / 3));
      target = { cx: ((minx + maxx) / 2) * vw, cy: ((miny + maxy) / 2) * vh, w };
    }
    me.crop = me.crop || target;
    for (const k of ["cx", "cy", "w"]) me.crop[k] += (target[k] - me.crop[k]) * 0.15;
    const w = me.crop.w, h = (w * 3) / 4;
    const sx = Math.max(0, Math.min(vw - w, me.crop.cx - w / 2));
    const sy = Math.max(0, Math.min(vh - h, me.crop.cy - h / 2));
    g.save();
    g.translate(PW, 0);
    g.scale(-1, 1);
    g.drawImage(video, sx, sy, w, h, 0, 0, PW, PH);
    g.restore();
    const map = { sx, sy, sw: w, sh: h, vw, vh };
    if (face && dx.filter && now >= me.graceUntil) {
      const lm = face.landmarks.map((l) => {
        const p = toPanel(map, l.x, l.y);
        return { x: p.x / PW, y: p.y / PH };
      });
      drawFilter(g, lm, dx.filter, PW, PH, now);
    }
    if (now < me.graceUntil) {
      g.fillStyle = "rgba(255,40,70,.25)";
      g.fillRect(0, 0, PW, PH);
    }
    drawTag(g, ctx.me.nick, charImg(ctx.me.char), ctx.me.color);
  }

  // ───── 루프 ─────
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = now - lastNow;
    lastNow = now;
    const face = detectFace(video);
    drawMe(face, now);

    if (state === "calib") {
      if (face) {
        me.calib.add(face.scores);
        me.calibMs += dt;
      }
      const pct = Math.min(1, me.calibMs / CALIB_MS);
      ctx.msg(
        face
          ? `😐 무표정으로 정면!<small>기준 표정 측정 중 (깜빡여도 괜찮아요)</small><div class="progress"><i style="width:${Math.round(pct * 100)}%"></i></div>`
          : `🙋 얼굴이 보이게 카메라 앞에 앉아 주세요`,
        true
      );
      if (pct >= 1 && me.calib.count >= 20) {
        state = "wait";
        link.send("pf:calibrated");
        ctx.msg(`⏳ ${ctx.opp.nick} 준비 기다리는 중…`, true);
        maybeGo();
      }
    } else if (state === "countdown") {
      if (face) setGauges(me.judge.levels(face.scores));
      const n = 3 - Math.floor((now - phaseStart) / 1000);
      if (n <= 0) {
        state = "play";
        playStart = now;
        ctx.msg("");
        sfx.beep(true);
        dx.start();
      } else if (n !== lastCount) {
        lastCount = n;
        sfx.beep(false);
        ctx.msg(`<span class="count">${n}</span><small>표정 굳히세요…</small>`);
      }
    } else if (state === "play") {
      const elapsed = now - playStart;
      hud.clock((elapsed / 1000).toFixed(1));
      dx.update(elapsed);
      if (now < me.graceUntil) {
        ctx.panelMsg("me", `<span class="big">${me.reason}</span><small>-1 ♥ · 잠깐 쉬었다가 다시!</small>`);
        setGauges({ smile: 0, blink: 0 });
        return;
      }
      const r = me.judge.update(face ? { face: true, scores: face.scores } : { face: false }, now);
      setGauges(r);
      ctx.panelMsg("me", r.noFace ? `🙈<small>얼굴을 화면 안으로!</small>` : "");
      ctx.danger("me", (MODE !== "blink" && r.smile > 0.75) || (MODE !== "smile" && r.blink > 0.75));
      if (r.fail) loseHeart(r.fail, now);
    }
  }
  requestAnimationFrame(loop);

  function loseHeart(reason, now) {
    me.hearts--;
    me.stats[reason]++;
    me.reason = REASON[reason];
    me.graceUntil = now + GRACE_MS;
    me.judge = new Judge(MODE, DIFF, me.base);
    hud.hearts("me", me.hearts, true);
    ctx.flash("me", "");
    ctx.danger("me", false);
    sfx.honk();
    link.send("pf:heart", { hearts: me.hearts, reason });
    if (me.hearts <= 0) {
      if (iAmHost) finish("lose");
      else link.send("pf:dead");
    }
  }

  function setGauges(r) {
    ctx.gauge("smile", MODE === "blink" ? 0 : r.smile);
    ctx.gauge("blink", MODE === "smile" ? 0 : r.blink);
  }

  return {
    stop() {
      running = false;
      dx.stop();
      offs.forEach((off) => off());
    },
  };
}
