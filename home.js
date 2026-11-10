// 메인 홈: 캐릭터 선택(P1/P2) · 설정 · 기록 · 게임 방법 · 코인 · 게임 선택
import { CHARACTERS, GAMES, loadProfile, updateProfile, saveProfile, charOf, asset, standings, heartsHTML } from "./shared/profile.js";

const $ = (s) => document.querySelector(s);
let profile = loadProfile();
let editing = "p1"; // 지금 캐릭터를 고르는 플레이어

// ───────── 캐릭터 캐러셀 ─────────
const idxOf = (id) => CHARACTERS.findIndex((c) => c.id === id);
const at = (i) => CHARACTERS[(i + CHARACTERS.length) % CHARACTERS.length];

function renderCarousel(animate = false) {
  const cur = idxOf(profile[editing]);
  const slots = { left: at(cur - 1), center: at(cur), right: at(cur + 1) };
  for (const [slot, c] of Object.entries(slots)) {
    const el = document.querySelector(`.slot.${slot}`);
    el.querySelector(".char").src = asset(c.img);
    el.querySelector(".char").alt = c.name;
    const item = el.querySelector(".item");
    item.src = asset(c.item);
    const slotW = { left: 20.5, center: 30.4, right: 19.1 }[slot];
    const w = (c.itemW * (slot === "center" ? 1 : 0.9)) / slotW * 100; // 슬롯 너비 대비 %
    item.style.width = w + "%";
    item.style.left = (100 - w) / 2 + "%";
    el.dataset.id = c.id;
  }
  $("#char-name").textContent = slots.center.name;
  if (animate) {
    const car = $("#carousel");
    car.classList.remove("swap");
    void car.offsetWidth;
    car.classList.add("swap");
  }
  renderPlayers();
}

function renderPlayers() {
  document.querySelectorAll(".ptab").forEach((b) => {
    b.classList.toggle("on", b.dataset.p === editing);
    b.querySelector(".nm").textContent = charOf(profile[b.dataset.p]).name;
  });
}

function choose(id) {
  const other = editing === "p1" ? "p2" : "p1";
  // 같은 캐릭터를 고르면 서로 바꿈
  if (profile[other] === id) profile[other] = profile[editing];
  profile[editing] = id;
  saveProfile(profile);
  renderCarousel(true);
}

const step = (d) => choose(at(idxOf(profile[editing]) + d).id);
$("#btn-prev").addEventListener("click", () => step(-1));
$("#btn-next").addEventListener("click", () => step(1));
document.querySelectorAll(".slot").forEach((el) =>
  el.addEventListener("click", () => {
    if (el.dataset.slot !== "center") choose(el.dataset.id);
  })
);
document.querySelectorAll(".ptab").forEach((b) =>
  b.addEventListener("click", () => {
    editing = b.dataset.p;
    renderCarousel(true);
  })
);
document.addEventListener("keydown", (e) => {
  if (document.querySelector(".modal-back.open")) {
    if (e.key === "Escape") closeAll();
    return;
  }
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
  if (e.key === "Tab") { e.preventDefault(); editing = editing === "p1" ? "p2" : "p1"; renderCarousel(true); }
  if (e.key === "Enter") openGames();
});

// ───────── 하트 / 코인 ─────────
function renderHearts() {
  const n = profile.hearts;
  const el = $("#home-hearts");
  el.innerHTML = heartsHTML(n, n);
  el.classList.toggle("many", n > 3);
}
function renderCoins() {
  const total = Object.values(profile.coins).reduce((a, b) => a + b, 0);
  $("#coin-badge").textContent = total;
}

// ───────── 모달 ─────────
function open(id) {
  closeAll();
  $(id).classList.add("open");
}
function closeAll() {
  document.querySelectorAll(".modal-back.open").forEach((m) => m.classList.remove("open"));
}
document.querySelectorAll(".modal-back").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-close]")) closeAll();
  })
);

function openGames() {
  const a = charOf(profile.p1), b = charOf(profile.p2);
  $("#matchup").innerHTML = `<span class="p1">P1 ${a.name}</span> VS <span class="p2">P2 ${b.name}</span>`;
  open("#m-games");
}
$("#btn-start").addEventListener("click", openGames);

// 설정
function renderSettings() {
  document.querySelectorAll("#m-settings .pick").forEach((pick) => {
    const v = String(profile[pick.dataset.key]);
    pick.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  });
}
document.querySelectorAll("#m-settings .pick").forEach((pick) =>
  pick.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const key = pick.dataset.key;
    let v = b.dataset.v;
    if (key === "hearts" || key === "snowTime") v = Number(v);
    if (key === "sound") v = v === "true";
    profile = updateProfile({ [key]: v });
    renderSettings();
    renderHearts();
  })
);
let resetArmed = false;
$("#btn-reset").addEventListener("click", (e) => {
  if (!resetArmed) {
    resetArmed = true;
    e.target.textContent = "정말 지울까요? 한 번 더 누르기";
    return;
  }
  profile = updateProfile({ records: [], coins: {} });
  resetArmed = false;
  e.target.textContent = "초기화 완료!";
  renderCoins();
});
$("#btn-gear").addEventListener("click", () => {
  resetArmed = false;
  $("#btn-reset").textContent = "기록·코인 초기화";
  renderSettings();
  open("#m-settings");
});
$("#btn-hearts").addEventListener("click", () => $("#btn-gear").click());

// 기록
$("#btn-trophy").addEventListener("click", () => {
  const st = standings();
  const rows = CHARACTERS.map((c) => ({ c, ...st[c.id] })).sort((a, b) => b.win - a.win || a.lose - b.lose);
  const medals = ["🥇", "🥈", "🥉"];
  $("#rank-list").innerHTML = rows
    .map(
      (r, i) => `<li><span class="rk">${medals[i]}</span><img class="px" src="${asset(r.c.img)}" alt=""><span><b>${r.c.name}</b><br><span class="wl">${r.win}승 ${r.lose}패 ${r.draw}무</span></span><span class="w">${r.win}승</span></li>`
    )
    .join("");
  const recent = [...profile.records].reverse().slice(0, 10);
  $("#recent").innerHTML = recent.length
    ? recent
        .map((r) => {
          const g = GAMES[r.game] || { emoji: "🎮", name: r.game };
          const a = charOf(r.p1).name, b = charOf(r.p2).name;
          const res = !r.winner ? "무승부" : `${r.winner === "p1" ? a : b} 승`;
          const d = new Date(r.at);
          return `<li>${g.emoji} ${a} vs ${b} — <b>${res}</b> <span class="small">${r.detail || ""} · ${d.getMonth() + 1}/${d.getDate()}</span></li>`;
        })
        .join("")
    : `<li><span class="empty">아직 경기 기록이 없어요</span></li>`;
  open("#m-trophy");
});

// 게임 방법 / 지갑
$("#btn-letter").addEventListener("click", () => open("#m-letter"));
$("#btn-wallet").addEventListener("click", () => {
  $("#coin-list").innerHTML = CHARACTERS.map(
    (c) => `<li><img class="px" src="${asset(c.img)}" alt=""><b>${c.name}</b><span class="c">🪙 ${profile.coins[c.id] || 0}</span></li>`
  ).join("");
  open("#m-wallet");
});

renderCarousel();
renderHearts();
renderCoins();
