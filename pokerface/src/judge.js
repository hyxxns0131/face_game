// 보정(무표정 기준값 측정)과 탈락 판정

// 난이도별 기준
//  smile   : 기준값보다 이만큼 웃음 값이 올라가면 "웃는 중"
//  smileMs : 웃는 상태가 이 시간(ms) 이상 이어지면 탈락
//  blinkMs : 눈 감긴 상태가 이 시간(ms) 이상 이어지면 탈락
export const DIFFICULTY = {
  easy: { label: "쉬움", smile: 0.42, smileMs: 450, blinkMs: 120 },
  normal: { label: "보통", smile: 0.32, smileMs: 300, blinkMs: 60 },
  hard: { label: "어려움", smile: 0.22, smileMs: 180, blinkMs: 30 },
};

const avg = (a, b) => (a + b) / 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const smileOf = (s) => avg(s.mouthSmileLeft ?? 0, s.mouthSmileRight ?? 0);
const cheekOf = (s) => avg(s.cheekSquintLeft ?? 0, s.cheekSquintRight ?? 0);
const blinkOf = (s) => Math.min(s.eyeBlinkLeft ?? 0, s.eyeBlinkRight ?? 0); // 두 눈 모두 감겨야 깜빡임

/** 무표정 3초 동안 값을 모아서 사람마다 다른 기준값을 만듭니다. */
export class Calibrator {
  constructor() {
    this.smile = [];
    this.cheek = [];
    this.blink = [];
  }
  get count() {
    return this.smile.length;
  }
  add(s) {
    this.smile.push(smileOf(s));
    this.cheek.push(cheekOf(s));
    this.blink.push(blinkOf(s));
  }
  result() {
    // 중앙값을 써서 측정 중에 한두 번 깜빡여도 기준이 흔들리지 않게 함
    return { smile: median(this.smile), cheek: median(this.cheek), blink: median(this.blink) };
  }
}

export class Judge {
  constructor(mode, cfg, base) {
    this.mode = mode; // "mix" | "smile" | "blink"
    this.cfg = cfg;
    this.base = base;
    this.smooth = base.smile;
    // 안경 등으로 평소 눈 값이 높은 사람도 공평하게
    this.blinkTh = clamp(base.blink + 0.3, 0.45, 0.85);
    this.smileSince = null;
    this.blinkSince = null;
    this.lostSince = null;
    this.last = { smile: 0, blink: 0, raw: {} };
  }

  /** 1.0 이상이면 판정선을 넘은 것 */
  levels(s) {
    this.smooth = 0.6 * this.smooth + 0.4 * smileOf(s); // 튀는 값 완화
    const smileDelta =
      Math.max(0, this.smooth - this.base.smile) + 0.5 * Math.max(0, cheekOf(s) - this.base.cheek);
    const blink = blinkOf(s);
    return {
      smile: smileDelta / this.cfg.smile,
      blink: blink / this.blinkTh,
      raw: { smile: smileOf(s), cheek: cheekOf(s), blinkL: s.eyeBlinkLeft, blinkR: s.eyeBlinkRight },
    };
  }

  /** @returns {{smile:number, blink:number, fail:null|"smile"|"blink"|"lost", noFace?:boolean}} */
  update(det, now) {
    if (!det || !det.face) {
      this.lostSince ??= now;
      this.smileSince = this.blinkSince = null;
      return { ...this.last, noFace: true, fail: now - this.lostSince > 1000 ? "lost" : null };
    }
    this.lostSince = null;

    const lv = this.levels(det.scores);
    this.last = lv;
    const checkSmile = this.mode !== "blink";
    const checkBlink = this.mode !== "smile";

    if (checkSmile && lv.smile >= 1) this.smileSince ??= now;
    else this.smileSince = null;
    if (checkBlink && lv.blink >= 1) this.blinkSince ??= now;
    else this.blinkSince = null;

    let fail = null;
    if (this.smileSince !== null && now - this.smileSince >= this.cfg.smileMs) fail = "smile";
    else if (this.blinkSince !== null && now - this.blinkSince >= this.cfg.blinkMs) fail = "blink";
    return { ...lv, fail };
  }
}
