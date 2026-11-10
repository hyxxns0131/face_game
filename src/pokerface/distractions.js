// 방해 요소 — 방장(또는 AI전에서는 나)이 만들고, 같은 이벤트를 친구 화면에도 보내서 똑같이 보이게 함
//  1단계 (0~10초)  : 이모지가 둥둥
//  2단계 (10~20초) : + 아재개그 / 놀리는 문구, 화면 흔들림
//  3단계 (20~30초) : + 얼굴 필터
//  4단계 (30초~)   : + 효과음, 전부 더 자주
import { JOKES, TAUNTS, EMOJIS } from "./jokes.js";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const FILTERS = ["googly", "clown", "mustache"];
export const stageOf = (ms) => (ms < 10000 ? 1 : ms < 20000 ? 2 : ms < 30000 ? 3 : 4);

export class Distractions {
  /** emit: 이벤트를 친구에게 보내는 함수 (방장만), 없으면 받기만 함 */
  constructor(layer, shakeEl, sfx, emit = null) {
    this.layer = layer;
    this.shakeEl = shakeEl;
    this.sfx = sfx;
    this.emit = emit;
    this.filter = null;
    this.stage = 1;
    this.active = false;
    this.timers = new Set();
  }

  start() {
    this.stop();
    this.active = true;
    this.stage = 1;
    this.next = { emoji: 300, joke: 10000, shake: 12000, filter: 20000, sound: 30000 };
  }

  stop() {
    this.active = false;
    this.filter = null;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.layer.innerHTML = "";
    this.shakeEl.classList.remove("shake");
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  fire(ev) {
    this.apply(ev);
    this.emit?.(ev);
  }

  /** 방장만 호출: 시간에 따라 이벤트 생성 */
  update(ms) {
    if (!this.active || !this.emit) return;
    const st = stageOf(ms);
    if (st !== this.stage) this.fire({ k: "banner", text: `${st}단계!`, stage: st });
    const n = this.next;
    if (ms >= n.emoji) {
      this.fire({ k: "emoji", e: pick(EMOJIS), left: rand(3, 92), size: rand(36, 40 + st * 16), dur: rand(2.8, 4.8), drift: rand(-80, 80), spin: (Math.random() < 0.5 ? -1 : 1) * rand(90, 540) });
      n.emoji = ms + [0, 1300, 950, 700, 450][st] * rand(0.7, 1.3);
    }
    if (st >= 2 && ms >= n.joke) {
      const j = Math.random() < 0.7 ? pick(JOKES) : { q: pick(TAUNTS), a: "" };
      this.fire({ k: "joke", q: j.q, a: j.a || "", top: rand(14, 60), left: rand(4, 50), rot: rand(-6, 6) });
      n.joke = ms + (st >= 4 ? 2600 : 4000) * rand(0.8, 1.2);
    }
    if (st >= 2 && ms >= n.shake) {
      this.fire({ k: "shake" });
      n.shake = ms + (st >= 4 ? 3000 : 6000) * rand(0.8, 1.2);
    }
    if (st >= 3 && ms >= n.filter) {
      const others = FILTERS.filter((f) => f !== this.filter);
      this.fire({ k: "filter", name: st >= 4 && Math.random() < 0.35 ? "all" : pick(others) });
      n.filter = ms + (st >= 4 ? 3500 : 5000);
    }
    if (st >= 4 && ms >= n.sound) {
      this.fire({ k: "sound", which: Math.floor(Math.random() * 4) });
      n.sound = ms + 2400 * rand(0.7, 1.3);
    }
  }

  /** 이벤트를 화면에 표시 (방장·친구 공통) */
  apply(ev) {
    if (!this.active) return;
    switch (ev.k) {
      case "banner": {
        this.stage = ev.stage;
        const el = document.createElement("div");
        el.className = "banner";
        el.textContent = ev.text;
        el.addEventListener("animationend", () => el.remove());
        this.layer.appendChild(el);
        this.sfx.beep(true);
        break;
      }
      case "emoji": {
        const el = document.createElement("span");
        el.className = "float-emoji";
        el.textContent = ev.e;
        el.style.left = ev.left + "%";
        el.style.fontSize = ev.size + "px";
        el.style.animationDuration = ev.dur + "s";
        el.style.setProperty("--drift", ev.drift + "px");
        el.style.setProperty("--spin", ev.spin + "deg");
        el.addEventListener("animationend", () => el.remove());
        this.layer.appendChild(el);
        break;
      }
      case "joke": {
        const el = document.createElement("div");
        el.className = "joke";
        const q = document.createElement("b");
        q.textContent = ev.q;
        const a = document.createElement("span");
        a.className = "a";
        a.textContent = ev.a;
        el.append(q, a);
        el.style.top = ev.top + "%";
        el.style.left = ev.left + "%";
        el.style.transform = `rotate(${ev.rot}deg)`;
        this.layer.appendChild(el);
        this.sfx.pop();
        this.later(() => el.remove(), 3600);
        break;
      }
      case "shake":
        this.shakeEl.classList.remove("shake");
        void this.shakeEl.offsetWidth;
        this.shakeEl.classList.add("shake");
        this.later(() => this.shakeEl.classList.remove("shake"), 550);
        break;
      case "filter":
        this.filter = ev.name;
        break;
      case "sound":
        [() => this.sfx.boing(), () => this.sfx.honk(), () => this.sfx.slide(), () => this.sfx.squeak()][ev.which]?.();
        break;
    }
  }
}
