// 🤖 AI 상대 — 친구 연결(OnlineLink)과 똑같은 모양이라 게임 코드는 그대로 씀
// AI는 자기 패널 캔버스를 직접 그리고, 메시지에 반응해요.
import { Emitter } from "./net.js";
import { drawNight, drawTag, drawSprite, PW, PH } from "./panel.js";
import { snowball, pointsFor } from "./snowball/game.js";
import { stageOf } from "./pokerface/distractions.js";
import { charImg } from "../shared/profile.js";

const rand = (a, b) => a + Math.random() * (b - a);

// 난이도 → AI 실력 (어려울수록 AI가 잘 참고, 잘 피하고, 잘 맞힘)
const SKILL = {
  easy: { laugh: 1.5, dodge: 0.25, aim: 0.35, throwGap: [3600, 5200] },
  normal: { laugh: 1.0, dodge: 0.45, aim: 0.6, throwGap: [2800, 4400] },
  hard: { laugh: 0.65, dodge: 0.65, aim: 0.85, throwGap: [2200, 3400] },
};

export class BotLink extends Emitter {
  constructor({ nick, char, diff }) {
    super();
    this.isBot = true;
    this.role = "host"; // 나는 항상 방장
    this.nick = nick;
    this.char = char;
    this.skill = SKILL[diff] || SKILL.normal;
    this.canvas = document.createElement("canvas");
    this.canvas.width = PW;
    this.canvas.height = PH;
    this.g = this.canvas.getContext("2d");
    this.bot = null;
    this.alive = true;
    const loop = (now) => {
      if (!this.alive) return;
      requestAnimationFrame(loop);
      if (this.bot) this.bot.draw(now);
      else this.idle(now);
    };
    requestAnimationFrame(loop);
    setTimeout(() => {
      this.emit("open", {});
      this.emit("hello", { t: "hello", nick, char });
    }, 400);
  }

  idle(now) {
    const g = this.g;
    drawNight(g, now);
    drawSprite(g, charImg(this.char), PW / 2, PH - 30 + Math.sin(now / 400) * 6, 300);
    drawTag(g, `🤖 ${this.nick}`, charImg(this.char), "#2ecc71");
  }

  /** 내가 보낸 메시지 → AI가 받음 */
  send(t, data = {}) {
    const m = { t, ...data };
    if (t === "game") {
      this.bot?.stop?.();
      this.bot = m.game === "pokerface" ? new PokerBot(this, m.settings) : new SnowBot(this, m.settings);
    }
    if (t === "lobby") {
      this.bot?.stop?.();
      this.bot = null;
    }
    this.bot?.receive(m);
  }

  /** AI → 나 (살짝 지연시켜서 진짜 친구처럼) */
  reply(t, data = {}) {
    setTimeout(() => this.alive && this.emit(t, { t, ...data }), rand(30, 80));
  }

  close() {
    this.alive = false;
    this.bot?.stop?.();
  }
}

// ───────── 🎅 포커페이스 AI ─────────
class PokerBot {
  constructor(link, settings) {
    this.link = link;
    this.hearts = settings.hearts;
    this.state = "calib";
    this.laughUntil = 0;
    this.wobble = 0;
    this.timer = null;
    setTimeout(() => link.reply("pf:calibrated"), rand(1500, 2500));
  }
  receive(m) {
    if (m.t === "pf:go") {
      this.state = "countdown";
      setTimeout(() => this.startPlay(), 3000);
    }
    if (m.t === "pf:dx" && m.ev.k === "joke") this.wobble = 1; // 개그 나오면 흔들림
    if (m.t === "pf:end" || m.t === "pf:dead") this.stop();
  }
  startPlay() {
    if (this.state !== "countdown") return;
    this.state = "play";
    this.t0 = performance.now();
    // 0.25초마다 "웃음 참기" 굴림. 시간이 지날수록(단계↑) 더 잘 웃음
    this.timer = setInterval(() => {
      const now = performance.now();
      if (now < this.laughUntil || this.state !== "play") return;
      const st = stageOf(now - this.t0);
      const perSec = [0, 0.01, 0.035, 0.07, 0.12][st] * this.link.skill.laugh * (1 + this.wobble);
      this.wobble *= 0.9;
      if (Math.random() < perSec / 4) {
        this.hearts--;
        this.laughUntil = now + 1600;
        this.link.reply("pf:heart", { hearts: this.hearts, reason: Math.random() < 0.7 ? "smile" : "blink" });
        if (this.hearts <= 0) {
          this.state = "over";
          this.link.reply("pf:dead");
          this.stop();
        }
      }
    }, 250);
  }
  draw(now) {
    const g = this.link.g;
    drawNight(g, now);
    const laughing = now < this.laughUntil || (this.state === "over" && this.hearts <= 0);
    const shake = laughing ? Math.sin(now / 30) * 6 : Math.sin(now / 90) * this.wobble * 4;
    drawSprite(g, charImg(this.link.char, laughing), PW / 2 + shake, PH - 20, 380);
    if (laughing) {
      g.fillStyle = "rgba(255,40,70,.18)";
      g.fillRect(0, 0, PW, PH);
    }
    drawTag(g, `🤖 ${this.link.nick}`, charImg(this.link.char), "#2ecc71");
  }
  stop() {
    clearInterval(this.timer);
  }
}

// ───────── ☃️ 눈싸움 AI ─────────
class SnowBot {
  constructor(link, settings) {
    this.link = link;
    this.hearts = settings.hearts;
    this.state = "ready";
    this.head = { x: PW / 2, y: PH * 0.42 };
    this.headR = 46;
    this.offset = 0;
    this.ball = 0;
    this.nextThrow = Infinity;
    this.incoming = [];
    this.oppHead = { x: PW / 2, y: PH * 0.4 };
    this.oppHeadR = 40;
    this.flakes = [];
    this.lastNow = performance.now();
    this.lastSend = 0;
    this.id = 0;
    setTimeout(() => link.reply("sb:ready"), 1200);
  }
  receive(m) {
    if (m.t === "sb:go") {
      this.state = "countdown";
      setTimeout(() => {
        if (this.state !== "countdown") return;
        this.state = "play";
        this.nextThrow = performance.now() + rand(...this.link.skill.throwGap);
      }, 3000);
    }
    if (m.t === "sb:state" && m.head) {
      this.oppHead = { x: m.head.x * PW, y: m.head.y * PH };
      this.oppHeadR = m.headR * PW;
    }
    if (m.t === "sb:throw") {
      const s = { ...m, to: { x: m.to.x * PW, y: m.to.y * PH }, r: m.r * PW, t0: performance.now() };
      // 피할지 결정 → 반쯤 날아왔을 때 옆으로 이동
      s.dodgeDir = Math.random() < this.link.skill.dodge ? (Math.random() < 0.5 ? -1 : 1) : 0;
      this.incoming.push(s);
    }
    if (m.t === "sb:end" || m.t === "sb:dead") this.state = "over";
  }
  draw(now) {
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const L = this.link, g = L.g;
    // 움직임: 좌우로 어슬렁 + 피하기
    let target = PW / 2 + Math.sin(now / 1300) * PW * 0.18;
    for (const s of this.incoming) {
      const t = (now - s.t0) / s.dur;
      if (s.dodgeDir && t > 0.3) target = s.to.x + s.dodgeDir * PW * 0.32;
      if (t >= 1 && !s.done) {
        s.done = true;
        const hit = Math.hypot(this.head.x - s.to.x, this.head.y - s.to.y) < s.r * 1.3 + this.headR * 0.7;
        L.reply("sb:result", { id: s.id, hit, pts: pointsFor(s.r) });
        if (hit) this.hitUntil = now + 900;
      }
    }
    this.incoming = this.incoming.filter((s) => !s.done);
    target = Math.max(90, Math.min(PW - 90, target));
    this.head.x += (target - this.head.x) * Math.min(1, dt * 6);

    // 던지기
    if (this.state === "play") {
      // AI도 눈을 굴려서 키움 (실력이 좋을수록 더 크게 키워서 던짐)
      this.ball = Math.min(this.targetBall ||= rand(22, 34 + L.skill.aim * 26), this.ball + dt * 16);
      if (now >= this.nextThrow && this.ball >= 16) {
        this.targetBall = 0;
        const aimErr = (1 - L.skill.aim) * 140;
        const to = { x: this.oppHead.x + rand(-aimErr, aimErr), y: this.oppHead.y + rand(-aimErr, aimErr) * 0.6 };
        const r = this.ball;
        L.reply("sb:throw", {
          id: `b${++this.id}`,
          from: { x: (this.head.x + 70) / PW, y: (this.head.y + 60) / PH },
          to: { x: to.x / PW, y: to.y / PH },
          r: r / PW,
          dur: (0.75 + r / 90) * 1000 + 150,
        });
        this.ball = 0;
        this.nextThrow = now + rand(...L.skill.throwGap);
      }
    }
    if (now - this.lastSend > 70) {
      this.lastSend = now;
      L.reply("sb:state", { present: true, head: { x: this.head.x / PW, y: this.head.y / PH }, headR: this.headR / PW });
    }

    // 그리기
    drawNight(g, now);
    if (this.flakes.length < 60 && Math.random() < 0.5) this.flakes.push({ x: Math.random() * PW, y: -5, v: rand(40, 90) });
    g.fillStyle = "#fff";
    for (const f of this.flakes) {
      f.y += f.v * dt;
      g.fillRect(f.x, f.y, 3, 3);
    }
    this.flakes = this.flakes.filter((f) => f.y < PH);
    const hurt = now < (this.hitUntil || 0);
    // 스프라이트의 얼굴이 head 위치에 오도록 (스프라이트 위쪽 40% 지점이 얼굴)
    const h = 260;
    drawSprite(g, charImg(L.char, hurt), this.head.x, this.head.y + h * 0.62, h);
    if (this.ball > 0) snowball(g, this.head.x + 70, this.head.y + 60, this.ball);
    if (hurt) {
      g.fillStyle = "rgba(255,255,255,.8)";
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc(this.head.x + Math.cos(i * 1.7) * 30, this.head.y + Math.sin(i * 2.3) * 26, 16, 0, Math.PI * 2);
        g.fill();
      }
    }
    drawTag(g, `🤖 ${L.nick}`, charImg(L.char), "#2ecc71");
  }
  stop() {
    this.state = "over";
  }
}
