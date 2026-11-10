// 닉네임 · 캐릭터 · 설정 · 기록 · 코인 (이 브라우저의 localStorage에 저장)

export const CHARACTERS = [
  { id: "coco", name: "코코", desc: "산타모자 곰" },
  { id: "bell", name: "벨", desc: "방울 순록" },
  { id: "snowy", name: "스노위", desc: "눈사람" },
  { id: "ginger", name: "진저", desc: "진저브레드" },
  { id: "popo", name: "포포", desc: "귀마개 펭귄" },
];

export const GAMES = {
  snowball: { name: "크리스마스 눈싸움", emoji: "☃️" },
};

const KEY = "xmas.profile.v1";
const DEFAULTS = {
  nick: "",
  char: "coco",
  sound: true,
  pfDiff: "normal",  // easy | normal | hard (AI 실력)
  coins: 0,
  records: [],
};

let cache = null;

export function loadProfile() {
  if (cache) return cache;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  cache = { ...DEFAULTS, ...saved, records: saved.records || [] };
  return cache;
}

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
}

export function updateProfile(patch) {
  Object.assign(loadProfile(), patch);
  saveProfile();
  return cache;
}

export const charOf = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const asset = (name) => new URL(`./assets/${name}`, import.meta.url).href;
export const charImg = (id, laugh = false) => asset(`chars/${charOf(id).id}${laugh ? "_laugh" : ""}.png`);

/** 경기 결과 저장. result: "win" | "lose" | "draw" — 이기면 +12, 지거나 비기면 +2 코인 */
export function recordMatch({ game, result, opp, ai = false, detail = "" }) {
  const p = loadProfile();
  const gain = result === "win" ? 12 : 2;
  p.coins += gain;
  p.records = [...p.records, { game, result, opp, ai, detail, at: Date.now() }].slice(-200);
  saveProfile();
  return gain;
}

export function myStats() {
  const s = { win: 0, lose: 0, draw: 0 };
  for (const r of loadProfile().records) s[r.result] = (s[r.result] || 0) + 1;
  return s;
}

export function heartsHTML(left, total) {
  let h = "";
  for (let i = 0; i < total; i++) {
    h += `<img class="px heart" src="${asset(i < left ? "heart.png" : "heart_empty.png")}" alt="${i < left ? "♥" : "♡"}">`;
  }
  return h;
}
