// 효과음: 파일 없이 Web Audio로 직접 만듭니다.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // 브라우저 정책상 클릭 이벤트 안에서 한 번 호출해야 소리가 납니다.
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.ctx = null;
      }
    }
    this.ctx?.resume?.();
  }

  tone({ type = "sine", from = 440, to = from, dur = 0.3, vol = 0.2, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  boing() {
    this.tone({ from: 160, to: 640, dur: 0.3 });
    this.tone({ from: 640, to: 180, dur: 0.35, delay: 0.28 });
  }
  honk() {
    this.tone({ type: "square", from: 260, to: 240, dur: 0.18, vol: 0.1 });
    this.tone({ type: "square", from: 200, to: 185, dur: 0.28, vol: 0.1, delay: 0.22 });
  }
  slide() {
    this.tone({ type: "triangle", from: 280, to: 1400, dur: 0.55, vol: 0.15 });
    this.tone({ type: "triangle", from: 1400, to: 300, dur: 0.45, vol: 0.15, delay: 0.55 });
  }
  squeak() {
    [0, 0.12, 0.24].forEach((d, i) =>
      this.tone({ type: "sawtooth", from: 900 + i * 220, to: 1500 + i * 220, dur: 0.1, vol: 0.05, delay: d })
    );
  }
  pop() {
    this.tone({ from: 900, to: 200, dur: 0.08, vol: 0.15 });
  }
  random() {
    const list = [() => this.boing(), () => this.honk(), () => this.slide(), () => this.squeak()];
    list[Math.floor(Math.random() * list.length)]();
  }
  beep(high = false) {
    this.tone({ type: "square", from: high ? 880 : 440, dur: 0.15, vol: 0.08 });
  }
  /** 승리 팡파레 (short: 짧은 버전 — 대형 명중 때) */
  fanfare(short = false) {
    const notes = short ? [784, 1047] : [523, 659, 784, 1047, 784, 1047];
    const gaps = short ? [0, 0.1] : [0, 0.14, 0.28, 0.42, 0.62, 0.74];
    notes.forEach((f, i) => this.tone({ type: "square", from: f, dur: i === notes.length - 1 ? 0.5 : 0.13, vol: 0.09, delay: gaps[i] }));
    if (!short) [523, 659, 784].forEach((f) => this.tone({ type: "triangle", from: f, dur: 0.9, vol: 0.06, delay: 0.74 }));
  }
  sad() {
    [392, 370, 349, 330].forEach((f, i) => this.tone({ type: "triangle", from: f, to: f * 0.97, dur: 0.3, vol: 0.1, delay: i * 0.28 }));
  }
  fail() {
    this.tone({ type: "sawtooth", from: 420, to: 70, dur: 0.9, vol: 0.14 });
  }
}
