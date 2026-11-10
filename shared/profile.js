// 홈 화면에서 고른 캐릭터·설정·기록·코인을 두 게임이 같이 씁니다 (localStorage).

export const CHARACTERS = [
  // item: 머리 위에 떠 있는 아이템, itemW: 원본 이미지 기준 아이템 너비(화면 너비 대비 %)
  { id: "rose", name: "ROSE", img: "rose.png", item: "cap.png", itemW: 14.4, color: "#8b6cff" },
  { id: "lily", name: "LILY", img: "lily.png", item: "palette.png", itemW: 11, color: "#ff3f78" },
  { id: "daisy", name: "DAISY", img: "daisy.png", item: "camera.png", itemW: 9.6, color: "#ffae00" },
];

export const GAMES = {
  pokerface: { name: "포커페이스", emoji: "😐" },
  snowball: { name: "눈덩이 대작전", emoji: "☃️" },
};

const KEY = "ffg.profile.v1";
const DEFAULTS = {
  p1: "lily",
  p2: "rose",
  hearts: 3,
  sound: true,
  pfMode: "mix", // mix | smile | blink
  pfDiff: "normal", // easy | normal | hard
  snowTime: 60,
  coins: {},
  records: [],
};

let cache = null;

export function loadProfile() {
  if (cache) return cache;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  cache = { ...DEFAULTS, ...saved, coins: { ...(saved.coins || {}) }, records: saved.records || [] };
  return cache;
}

export function saveProfile(p = cache) {
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function updateProfile(patch) {
  const p = loadProfile();
  Object.assign(p, patch);
  saveProfile(p);
  return p;
}

export const charOf = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const asset = (name) => new URL(`./assets/${name}`, import.meta.url).href;

/**
 * 경기 결과 저장. winner: "p1" | "p2" | null(무승부)
 * 승자 +10 코인, 참가자 모두 +2 코인
 */
export function recordMatch({ game, winner, p1, p2, detail = "" }) {
  const p = loadProfile();
  const add = (id, n) => (p.coins[id] = (p.coins[id] || 0) + n);
  add(p1, 2);
  add(p2, 2);
  if (winner) add(winner === "p1" ? p1 : p2, 10);
  p.records = [...p.records, { game, winner, p1, p2, detail, at: Date.now() }].slice(-200);
  saveProfile(p);
  return p;
}

/** 캐릭터별 전적 */
export function standings() {
  const p = loadProfile();
  const s = Object.fromEntries(CHARACTERS.map((c) => [c.id, { win: 0, lose: 0, draw: 0 }]));
  for (const r of p.records) {
    if (!s[r.p1] || !s[r.p2]) continue;
    if (!r.winner) { s[r.p1].draw++; s[r.p2].draw++; }
    else {
      const w = r.winner === "p1" ? r.p1 : r.p2, l = r.winner === "p1" ? r.p2 : r.p1;
      s[w].win++; s[l].lose++;
    }
  }
  return s;
}

/** 하트 줄 HTML (남은 개수 / 전체) */
export function heartsHTML(left, total) {
  let h = "";
  for (let i = 0; i < total; i++) {
    h += `<img class="px heart ${i < left ? "" : "lost"}" src="${asset(i < left ? "heart.png" : "heart_empty.png")}" alt="${i < left ? "♥" : "♡"}">`;
  }
  return h;
}
