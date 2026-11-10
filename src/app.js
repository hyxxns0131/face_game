// 🎄 크리스마스 기념 눈싸움 하자! — 홈 · 로비 · 게임 흐름
import { CHARACTERS, GAMES, loadProfile, updateProfile, charOf, charImg, asset, heartsHTML, recordMatch, myStats } from "../shared/profile.js";
import { startCamera, stopCamera } from "../shared/camera.js";
import { Sfx } from "../shared/sfx.js";
import { OnlineLink, roomFromUrl, friendlyNetError } from "./net.js";
import { BotLink } from "./bots.js";
import { drawCameraCover, drawTag, drawNight, PW, PH } from "./panel.js";
import { startPokerface } from "./pokerface/game.js";
import { startSnowball } from "./snowball/game.js";

const $ = (s) => document.querySelector(s);
let profile = loadProfile();
const sfx = new Sfx();
sfx.enabled = profile.sound;
const invited = roomFromUrl();

// ═════════════════ 홈 ═════════════════
const idxOf = (id) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
const at = (i) => CHARACTERS[(i + CHARACTERS.length) % CHARACTERS.length];

function renderCarousel(animate = false) {
  const cur = idxOf(profile.char);
  const slots = { left: at(cur - 1), center: at(cur), right: at(cur + 1) };
  for (const [slot, c] of Object.entries(slots)) {
    const el = $(`.slot.${slot}`);
    el.querySelector(".char").src = charImg(c.id);
    el.querySelector(".char").alt = c.name;
    el.dataset.id = c.id;
  }
  $("#char-name").textContent = slots.center.name;
  $("#char-desc").textContent = slots.center.desc;
  if (animate) {
    const car = $("#carousel");
    car.classList.remove("swap");
    void car.offsetWidth;
    car.classList.add("swap");
  }
}
const choose = (id) => {
  profile = updateProfile({ char: id });
  renderCarousel(true);
};
const step = (d) => choose(at(idxOf(profile.char) + d).id);
$("#btn-prev").addEventListener("click", () => step(-1));
$("#btn-next").addEventListener("click", () => step(1));
document.querySelectorAll(".slot").forEach((el) => el.addEventListener("click", () => el.dataset.slot !== "center" && choose(el.dataset.id)));

function renderHomeHearts() {
  const el = $("#home-hearts");
  el.innerHTML = heartsHTML(profile.hearts, profile.hearts);
  el.classList.toggle("many", profile.hearts > 3);
  $("#coin-badge").textContent = profile.coins;
}

$("#nick").value = profile.nick;
$("#nick").addEventListener("keydown", (e) => e.key === "Enter" && $("#btn-start").click());
document.addEventListener("keydown", (e) => {
  if (!$("#home").classList.contains("active") || e.target.tagName === "INPUT" || document.querySelector(".modal-back.open")) return;
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
  if (e.key === "Enter") $("#btn-start").click();
});

if (invited) {
  $("#invite-banner").hidden = false;
  $(".phone").classList.add("invited");
  $("#invite-code").textContent = invited;
}

$("#btn-start").addEventListener("click", () => {
  const nick = $("#nick").value.trim();
  if (nick.length < 1) {
    const box = $(".nick-box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    $("#nick").focus();
    return;
  }
  profile = updateProfile({ nick });
  sfx.enabled = profile.sound;
  sfx.unlock();
  if (invited) enterRoom("guest");
  else openModal("#m-mode");
});
$("#btn-host").addEventListener("click", () => { closeModals(); enterRoom("host"); });
$("#btn-ai").addEventListener("click", () => { closeModals(); enterRoom("ai"); });

// 모달
function openModal(id) {
  closeModals();
  $(id).classList.add("open");
}
function closeModals() {
  document.querySelectorAll(".modal-back.open").forEach((m) => m.classList.remove("open"));
}
document.querySelectorAll(".modal-back").forEach((m) =>
  m.addEventListener("click", (e) => (e.target === m || e.target.closest("[data-close]")) && closeModals())
);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeModals());

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
    sfx.enabled = profile.sound;
    renderSettings();
    renderHomeHearts();
  })
);
let resetArmed = false;
$("#btn-reset").addEventListener("click", (e) => {
  if (!resetArmed) {
    resetArmed = true;
    e.target.textContent = "정말 지울까요? 한 번 더 누르기";
    return;
  }
  profile = updateProfile({ records: [], coins: 0 });
  resetArmed = false;
  e.target.textContent = "초기화 완료!";
  renderHomeHearts();
});
$("#btn-gear").addEventListener("click", () => {
  resetArmed = false;
  $("#btn-reset").textContent = "기록·코인 초기화";
  renderSettings();
  openModal("#m-settings");
});
$("#btn-hearts").addEventListener("click", () => $("#btn-gear").click());

$("#btn-trophy").addEventListener("click", () => {
  const s = myStats();
  $("#my-stats").innerHTML = `<div><b>${s.win}</b>승</div><div><b>${s.lose}</b>패</div><div><b>${s.draw}</b>무</div>`;
  const recent = [...profile.records].reverse().slice(0, 12);
  $("#recent").innerHTML = recent.length
    ? recent
        .map((r) => {
          const g = GAMES[r.game] || { emoji: "🎮" };
          const d = new Date(r.at);
          const res = { win: "🏆 승", lose: "패", draw: "무" }[r.result];
          return `<li>${g.emoji} <img class="px" src="${charImg(r.opp?.char)}" alt=""> ${r.ai ? "🤖 " : ""}${escapeHtml(r.opp?.nick || "?")} — <b>${res}</b> <span class="small">${r.detail || ""} · ${d.getMonth() + 1}/${d.getDate()}</span></li>`;
        })
        .join("")
    : `<li><span class="empty">아직 경기 기록이 없어요</span></li>`;
  openModal("#m-trophy");
});
$("#btn-letter").addEventListener("click", () => openModal("#m-letter"));
$("#btn-wallet").addEventListener("click", () => {
  $("#wallet-big").textContent = `🪙 ${profile.coins}`;
  openModal("#m-wallet");
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

renderCarousel();
renderHomeHearts();

// ═════════════════ 방 (로비 + 게임) ═════════════════
const video = $("#video");
const myCanvas = document.createElement("canvas");
myCanvas.width = PW;
myCanvas.height = PH;
const myG = myCanvas.getContext("2d");

const room = {
  mode: null, // host | guest | ai
  link: null,
  me: null,
  opp: null,
  mySide: "left",
  game: null, // 진행 중인 게임 { stop() }
  gameName: null,
  settings: null,
  idle: false,
  camOn: false,
};
const sideOf = (who) => (who === "me" ? room.mySide : room.mySide === "left" ? "right" : "left");

function lobby(html) {
  const el = $("#lobby");
  el.hidden = !html;
  el.innerHTML = html || "";
}
function centerMsg(html, dim = false) {
  const el = $("#center-msg");
  el.innerHTML = html || "";
  el.classList.toggle("dim", dim);
}

function renderPlayers() {
  for (const who of ["me", "opp"]) {
    const p = room[who];
    const el = $(`#pl-${sideOf(who)}`);
    el.classList.toggle("empty", !p);
    el.querySelector(".ava").src = p ? charImg(p.char) : charImg("snowy");
    el.querySelector(".name").textContent = p ? `${p.ai ? "🤖 " : ""}${p.nick}${who === "me" ? " (나)" : ""}` : "기다리는 중…";
  }
}

const hud = {
  hearts(who, n, pop = false) {
    const h = $(`#pl-${sideOf(who)} .hearts`);
    h.innerHTML = heartsHTML(n, room.settings?.hearts ?? profile.hearts);
    if (pop) h.querySelectorAll("img")[n]?.classList.add("pop");
  },
  score(who, n) {
    $(`#pl-${sideOf(who)} .score`).textContent = n === null ? "" : `⭐ ${n}`;
  },
  clock(text, hurry = false) {
    $("#clock").textContent = text;
    $("#clock").classList.toggle("hurry", hurry);
  },
};
function clearHud() {
  for (const who of ["me", "opp"]) {
    $(`#pl-${sideOf(who)} .hearts`).innerHTML = "";
    hud.score(who, null);
  }
  hud.clock("");
  $("#mode-chip").textContent = "";
}

function panelEl(who) {
  return $(`#panel-${sideOf(who)}`);
}
function setMedia(who, el) {
  const slot = panelEl(who).querySelector(".slot-media");
  slot.innerHTML = "";
  if (el) slot.appendChild(el);
}

async function enterRoom(mode) {
  room.mode = mode;
  room.mySide = mode === "guest" ? "right" : "left";
  room.me = { nick: profile.nick, char: profile.char, color: room.mySide === "left" ? "#ff4a4a" : "#2ecc71" };
  room.opp = null;
  showScreen("room");
  clearHud();
  renderPlayers();
  $("#panel-left .slot-media").innerHTML = "";
  $("#panel-right .slot-media").innerHTML = "";
  setMedia("me", myCanvas);
  $("#foot-hint").textContent = "";
  lobby(`<h2>📷 카메라 켜는 중…</h2><p>브라우저에서 카메라 권한을 <b>허용</b>해 주세요</p>`);

  try {
    if (!room.camOn) {
      await startCamera(video);
      room.camOn = true;
    }
  } catch (err) {
    lobby(`<h2>⚠️ 카메라를 켤 수 없어요</h2><p>${err?.name === "NotAllowedError" ? "카메라 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 허용해 주세요." : err?.name === "NotReadableError" ? "다른 프로그램이 카메라를 쓰고 있어요." : "웹캠이 연결돼 있는지 확인해 주세요."}</p><button class="pixel-btn" data-act="home">홈으로</button>`);
    return;
  }
  startIdle();

  const stream = myCanvas.captureStream(24);
  if (mode === "ai") {
    const others = CHARACTERS.filter((c) => c.id !== profile.char);
    const c = others[Math.floor(Math.random() * others.length)];
    room.link = new BotLink({ nick: `AI ${c.name}`, char: c.id, diff: profile.pfDiff });
    setMedia("opp", room.link.canvas);
    wireLink();
    lobby(`<h2>🤖 AI 불러오는 중<span class="dots"></span></h2>`);
    return;
  }

  room.link = new OnlineLink();
  wireLink();
  if (mode === "host") {
    lobby(`<h2>🎁 방 만드는 중<span class="dots"></span></h2>`);
    try {
      const url = await room.link.host(stream);
      showInvite(url, room.link.code);
    } catch (err) {
      lobby(`<h2>⚠️ 방을 만들 수 없어요</h2><p>${friendlyNetError(err)}</p><button class="pixel-btn" data-act="home">홈으로</button>`);
    }
  } else {
    lobby(`<h2>🔗 방 <span class="code">${invited}</span> 들어가는 중<span class="dots"></span></h2>`);
    try {
      await room.link.join(invited, stream);
    } catch (err) {
      lobby(`<h2>⚠️ 들어갈 수 없어요</h2><p>${friendlyNetError(err)}</p><button class="pixel-btn" data-act="home">홈으로</button>`);
    }
  }
}

function showInvite(url, code) {
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  lobby(`
    <h2>🎁 친구 초대 링크</h2>
    <p>이 링크를 카톡 등으로 친구에게 보내 주세요!</p>
    <div class="link-row"><input id="invite-url" readonly value="${url}"><button class="pixel-btn small" data-act="copy">복사</button></div>
    <p>방 코드 <span class="code">${code}</span></p>
    ${local ? `<div class="warn">⚠️ 지금 주소가 <b>${location.host}</b>(내 컴퓨터)라서 다른 컴퓨터의 친구는 이 링크로 못 들어와요. 인터넷에 올린 주소(https)에서 방을 만들어 주세요. (같은 컴퓨터의 다른 창으로 테스트는 가능)</div>` : ""}
    <p class="dots">친구를 기다리는 중</p>
  `);
}

function wireLink() {
  const L = room.link;
  L.on("open", () => {
    L.send("hello", { nick: room.me.nick, char: room.me.char });
  });
  L.on("hello", (m) => {
    room.opp = { nick: String(m.nick || "친구").slice(0, 10), char: charOf(m.char).id, ai: L.isBot, color: room.mySide === "left" ? "#2ecc71" : "#ff4a4a" };
    renderPlayers();
    sfx.beep(true);
    if (room.mode !== "guest") showGamePicker();
    else lobby(`<h2>🎄 ${escapeHtml(room.opp.nick)}님 방에 들어왔어요!</h2><p class="dots">방장이 게임을 고르는 중</p>`);
  });
  L.on("stream", (s) => {
    const v = document.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.srcObject = s;
    v.play().catch(() => {});
    setMedia("opp", v);
  });
  L.on("game", (m) => room.mode === "guest" && startGame(m.game, m.settings));
  L.on("lobby", () => {
    if (room.mode !== "guest") return;
    stopGame();
    $("#result").classList.remove("open");
    lobby(`<h2>🎄 다음 게임 고르는 중</h2><p class="dots">방장이 게임을 고르는 중</p>`);
  });
  L.on("full", () => lobby(`<h2>😢 방이 꽉 찼어요</h2><p>이미 두 명이 게임 중이에요.</p><button class="pixel-btn" data-act="home">홈으로</button>`));
  const gone = () => {
    if (!room.link || room.link !== L) return;
    stopGame();
    $("#result").classList.remove("open");
    room.opp = null;
    renderPlayers();
    setMedia("opp", null);
    lobby(`<h2>👋 친구가 나갔어요</h2><p>연결이 끊겼어요.</p><button class="pixel-btn" data-act="home">홈으로</button>`);
  };
  L.on("bye", gone);
  L.on("close", gone);
}

function showGamePicker() {
  const s = settingsSnapshot();
  lobby(`
    <h2>🎄 무슨 게임 할까?</h2>
    <p>${escapeHtml(room.me.nick)} VS ${room.opp.ai ? "🤖 " : ""}${escapeHtml(room.opp.nick)}</p>
    <button class="game-card pixel-box" data-act="game" data-game="pokerface"><span class="g-emoji">🎅</span><span class="g-text"><b>산타 포커페이스</b><small>웃음·깜빡임 참기 · 하트 ${s.hearts}개 · ${{ mix: "혼합", smile: "웃음 참기", blink: "눈싸움" }[s.pfMode]} · ${{ easy: "쉬움", normal: "보통", hard: "어려움" }[s.pfDiff]}</small></span></button>
    <button class="game-card pixel-box" data-act="game" data-game="snowball"><span class="g-emoji">☃️</span><span class="g-text"><b>크리스마스 눈싸움</b><small>눈 굴려서 던지기 · 하트 ${s.hearts}개 · ${s.snowTime}초 · 2m쯤 떨어져 서기</small></span></button>
    <p class="small">설정은 홈 화면 톱니바퀴에서 바꿀 수 있어요.</p>
  `);
}

function settingsSnapshot() {
  return { hearts: profile.hearts, pfMode: profile.pfMode, pfDiff: profile.pfDiff, snowTime: profile.snowTime };
}

// 로비/결과 버튼들
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "copy") {
    const input = $("#invite-url");
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      b.textContent = "복사됨!";
    } catch {
      document.execCommand?.("copy");
      b.textContent = "복사됨!";
    }
  } else if (act === "game") {
    const s = settingsSnapshot();
    room.link.send("game", { game: b.dataset.game, settings: s });
    startGame(b.dataset.game, s);
  } else if (act === "again") {
    $("#result").classList.remove("open");
    room.link.send("game", { game: room.gameName, settings: room.settings });
    startGame(room.gameName, room.settings);
  } else if (act === "pick") {
    $("#result").classList.remove("open");
    stopGame();
    room.link.send("lobby");
    showGamePicker();
  } else if (act === "home") {
    leaveRoom();
  }
});
$("#btn-leave").addEventListener("click", leaveRoom);

function leaveRoom() {
  stopGame();
  room.link?.close();
  room.link = null;
  stopIdle();
  if (room.camOn) {
    stopCamera(video);
    room.camOn = false;
  }
  $("#result").classList.remove("open");
  lobby(null);
  centerMsg("");
  if (invited) {
    // 초대 링크로 들어왔던 경우, 홈으로 갈 때 주소에서 방 코드 지우기
    history.replaceState(null, "", location.pathname);
    location.reload();
    return;
  }
  profile = loadProfile();
  renderHomeHearts();
  showScreen("home");
}

// ───────── 게임 없을 때 내 패널: 카메라 미리보기 ─────────
let idleRaf = 0;
function startIdle() {
  room.idle = true;
  cancelAnimationFrame(idleRaf);
  const loop = (now) => {
    if (!room.idle) return;
    idleRaf = requestAnimationFrame(loop);
    if (room.camOn && video.readyState >= 2) drawCameraCover(myG, video);
    else drawNight(myG, now);
    drawTag(myG, room.me.nick, charImg(room.me.char), room.me.color);
  };
  idleRaf = requestAnimationFrame(loop);
}
function stopIdle() {
  room.idle = false;
  cancelAnimationFrame(idleRaf);
}

// ───────── 게임 시작 / 끝 ─────────
function stopGame() {
  room.game?.stop();
  room.game = null;
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.remove("danger", "hit");
    p.querySelector(".panel-msg").innerHTML = "";
  });
  $("#gauges").hidden = true;
  $("#distractions").innerHTML = "";
  centerMsg("");
  if (room.camOn && !room.idle) startIdle();
}

async function startGame(name, settings) {
  stopGame();
  stopIdle();
  room.gameName = name;
  room.settings = settings;
  lobby(null);
  $("#result").classList.remove("open");
  $("#mode-chip").textContent = `${GAMES[name].emoji} ${GAMES[name].name}`;
  $("#foot-hint").textContent = name === "snowball" ? "💡 2m쯤 떨어져서 상체와 두 손이 보이게 · 내 화면 쪽에서 상대 쪽으로 팔을 휙!" : "💡 정면을 보고 표정을 꾹 참아요";
  const gauges = $("#gauges");
  gauges.hidden = name !== "pokerface";
  gauges.className = `gauges on-${room.mySide}`;
  gauges.hidden = name !== "pokerface";
  hud.score("me", null);
  hud.score("opp", null);

  const arena = $("#arena");
  const ctx = {
    link: room.link,
    iAmHost: room.mode !== "guest",
    mySide: room.mySide,
    me: room.me,
    opp: room.opp,
    settings,
    video,
    myCanvas,
    sfx,
    hud,
    arena,
    overlay: $("#overlay"),
    dxLayer: $("#distractions"),
    msg: centerMsg,
    panelMsg(who, html) {
      const el = panelEl(who).querySelector(".panel-msg");
      if (el.innerHTML !== html) el.innerHTML = html;
    },
    danger(who, on) {
      panelEl(who).classList.toggle("danger", on);
    },
    flash(who, text) {
      const p = panelEl(who);
      p.classList.remove("hit");
      void p.offsetWidth;
      p.classList.add("hit");
      setTimeout(() => p.classList.remove("hit"), 800);
      if (text && who === "opp") {
        ctx.panelMsg("opp", `<span class="big">${text}</span><small>-1 ♥</small>`);
        setTimeout(() => ctx.panelMsg("opp", ""), 1500);
      }
    },
    gauge(kind, v) {
      const el = $(`#gauges .gauge.${kind}`);
      v = Math.max(0, Math.min(1, v || 0));
      el.querySelector("i").style.width = v * 100 + "%";
      el.classList.toggle("warn", v > 0.5 && v <= 0.75);
      el.classList.toggle("danger", v > 0.75);
    },
    panelRect(who) {
      const a = arena.getBoundingClientRect();
      const r = panelEl(who).getBoundingClientRect();
      return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height };
    },
    onEnd: (res) => showResult(res),
  };
  const starter = name === "pokerface" ? startPokerface : startSnowball;
  const token = {};
  room.token = token;
  const game = await starter(ctx);
  if (room.token !== token) return game.stop(); // 그 사이 다른 게임/나가기
  room.game = game;
}

function showResult(res) {
  const { result } = res;
  const gain = recordMatch({ game: room.gameName, result, opp: { nick: room.opp?.nick, char: room.opp?.char }, ai: !!room.opp?.ai, detail: res.detail });
  profile = loadProfile();
  sfx[result === "win" ? "boing" : "fail"]();
  const me = room.me, opp = room.opp || { nick: "?", char: "snowy" };
  const fig = (p, cls) => `<figure class="${cls}">${cls === "win" ? '<span class="crown">👑</span>' : ""}<img class="char px" src="${charImg(p.char, cls === "lose")}" alt=""><figcaption>${escapeHtml(p.nick)}</figcaption></figure>`;
  $("#r-title").textContent = result === "win" ? "🎉 YOU WIN!" : result === "lose" ? `${opp.nick} WIN!` : "🤝 DRAW!";
  $("#r-chars").innerHTML =
    result === "win" ? fig(me, "win") + fig(opp, "lose") : result === "lose" ? fig(opp, "win") + fig(me, "lose") : fig(me, "") + `<span class="vs-mini">VS</span>` + fig(opp, "");
  $("#r-stats").innerHTML = (res.lines || []).map(escapeHtml).join("<br>");
  $("#r-coins").textContent = `🪙 +${gain} 코인 (지금 ${profile.coins})`;
  $("#r-btns").innerHTML =
    room.mode === "guest"
      ? `<p class="small dots">방장이 다음 게임을 고르는 중</p><button class="pixel-btn white" data-act="home">나가기</button>`
      : `<button class="pixel-btn" data-act="again">한 판 더!</button><button class="pixel-btn white" data-act="pick">다른 게임</button><button class="pixel-btn white" data-act="home">나가기</button>`;
  $("#result").classList.add("open");
}
