// 방해 요소: 시간이 지날수록 단계가 올라가며 점점 세집니다.
//  1단계 (0~10초)  : 이모지가 둥둥
//  2단계 (10~20초) : + 아재개그 / 놀리는 문구, 화면 흔들림
//  3단계 (20~30초) : + 내 얼굴에 웃긴 필터
//  4단계 (30초~)   : + 효과음, 전부 더 자주
import { JOKES, TAUNTS, EMOJIS } from "./data/jokes.js";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const FILTERS = ["googly", "clown", "mustache"];
export const stageOf = (ms) => (ms < 10000 ? 1 : ms < 20000 ? 2 : ms < 30000 ? 3 : 4);

export class Distractions {
  constructor(layer, stageEl, sfx) {
    this.layer = layer;
    this.stageEl = stageEl;
    this.sfx = sfx;
    this.filter = null; // 현재 얼굴 필터 이름 (main.js에서 그림)
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
    this.stageEl.classList.remove("shake");
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  update(ms) {
    if (!this.active) return;
    const st = stageOf(ms);
    if (st !== this.stage) {
      this.stage = st;
      this.banner(`${st}단계!`);
      this.sfx.beep(true);
    }

    const n = this.next;
    if (ms >= n.emoji) {
      this.emoji(st);
      n.emoji = ms + [0, 1400, 1000, 750, 450][st] * rand(0.7, 1.3);
    }
    if (st >= 2 && ms >= n.joke) {
      this.joke();
      n.joke = ms + (st >= 4 ? 2600 : 4000) * rand(0.8, 1.2);
    }
    if (st >= 2 && ms >= n.shake) {
      this.shake();
      n.shake = ms + (st >= 4 ? 3000 : 6000) * rand(0.8, 1.2);
    }
    if (st >= 3 && ms >= n.filter) {
      const others = FILTERS.filter((f) => f !== this.filter);
      this.filter = st >= 4 && Math.random() < 0.35 ? "all" : pick(others);
      n.filter = ms + (st >= 4 ? 3500 : 5000);
    }
    if (st >= 4 && ms >= n.sound) {
      this.sfx.random();
      n.sound = ms + 2400 * rand(0.7, 1.3);
    }
  }

  emoji(st) {
    const el = document.createElement("span");
    el.className = "float-emoji";
    el.textContent = pick(EMOJIS);
    el.style.left = rand(3, 90) + "%";
    el.style.fontSize = rand(36, 40 + st * 16) + "px";
    el.style.animationDuration = rand(2.8, 4.8) + "s";
    el.style.setProperty("--drift", rand(-80, 80) + "px");
    el.style.setProperty("--spin", (Math.random() < 0.5 ? -1 : 1) * rand(90, 540) + "deg");
    el.addEventListener("animationend", () => el.remove());
    this.layer.appendChild(el);
  }

  joke() {
    const el = document.createElement("div");
    el.className = "joke";
    const q = document.createElement("b");
    const a = document.createElement("span");
    a.className = "a";
    if (Math.random() < 0.7) {
      const j = pick(JOKES);
      q.textContent = j.q;
      a.textContent = j.a ?? "";
    } else {
      q.textContent = pick(TAUNTS);
    }
    el.append(q, a);
    el.style.top = rand(18, 62) + "%";
    el.style.left = rand(4, 42) + "%";
    el.style.transform = `rotate(${rand(-6, 6)}deg)`;
    this.layer.appendChild(el);
    this.sfx.pop();
    this.later(() => el.remove(), 3600);
  }

  shake() {
    this.stageEl.classList.remove("shake");
    void this.stageEl.offsetWidth; // 애니메이션 재시작
    this.stageEl.classList.add("shake");
    this.later(() => this.stageEl.classList.remove("shake"), 550);
  }

  banner(text) {
    const el = document.createElement("div");
    el.className = "banner";
    el.textContent = text;
    el.addEventListener("animationend", () => el.remove());
    this.layer.appendChild(el);
  }
}
