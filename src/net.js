// 🔗 친구 연결 (PeerJS = WebRTC P2P)
// - 방장(host): 방 코드를 만들고 초대 링크를 공유
// - 친구(guest): 링크로 들어와서 접속
// - 서로 "내 화면(캔버스)" 영상을 주고받고, 게임 데이터는 메시지로 주고받음
// AI 상대(BotLink, bots.js)도 똑같은 모양(send / on)이라 게임 코드는 상대가 누군지 몰라도 됨.

const PREFIX = "xmas-snowfight-v1-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class Emitter {
  constructor() {
    this.handlers = {};
  }
  on(type, fn) {
    (this.handlers[type] ||= new Set()).add(fn);
    return () => this.handlers[type].delete(fn);
  }
  emit(type, msg) {
    this.handlers[type]?.forEach((fn) => fn(msg));
    this.handlers["*"]?.forEach((fn) => fn(msg));
  }
}

export function roomFromUrl() {
  const r = new URLSearchParams(location.search).get("room");
  return r && /^[A-Z0-9]{4,10}$/.test(r) ? r : null;
}

function peerOptions() {
  // 테스트용으로 window.__PEER_CONFIG 를 주면 그 서버를 사용 (기본: PeerJS 무료 공개 서버)
  return (
    window.__PEER_CONFIG || {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    }
  );
}

function randomCode(n = 6) {
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function waitOpen(peer) {
  return new Promise((resolve, reject) => {
    peer.once("open", resolve);
    peer.once("error", reject);
  });
}

export class OnlineLink extends Emitter {
  constructor() {
    super();
    this.isBot = false;
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.remoteStream = null;
  }

  /** 방 만들기 → 초대 링크 반환 */
  async host(localStream) {
    this.role = "host";
    this.localStream = localStream;
    for (let tries = 0; tries < 3; tries++) {
      this.code = randomCode();
      this.peer = new window.peerjs.Peer(PREFIX + this.code, peerOptions());
      try {
        await waitOpen(this.peer);
        break;
      } catch (err) {
        this.peer.destroy();
        if (err?.type !== "unavailable-id" || tries === 2) throw err;
      }
    }
    this.peer.on("connection", (conn) => {
      if (this.conn?.open) {
        conn.on("open", () => {
          conn.send({ t: "full" });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.attach(conn);
    });
    this.peer.on("call", (call) => {
      call.answer(this.localStream);
      this.attachCall(call);
    });
    this.peer.on("disconnected", () => this.peer.reconnect?.());
    return this.inviteUrl();
  }

  inviteUrl() {
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("room", this.code);
    return u.href;
  }

  /** 초대 링크로 들어가기 */
  async join(code, localStream) {
    this.role = "guest";
    this.code = code;
    this.localStream = localStream;
    this.peer = new window.peerjs.Peer(undefined, peerOptions());
    await waitOpen(this.peer);
    const conn = this.peer.connect(PREFIX + code, { reliable: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { type: "timeout" })), 12000);
      conn.on("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.peer.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    this.attach(conn, true);
    this.attachCall(this.peer.call(PREFIX + code, localStream));
  }

  attach(conn, alreadyOpen = false) {
    this.conn = conn;
    const onOpen = () => this.emit("open", {});
    if (alreadyOpen) setTimeout(onOpen, 0);
    else conn.on("open", onOpen);
    conn.on("data", (m) => m && m.t && this.emit(m.t, m));
    conn.on("close", () => this.emit("close", {}));
    conn.on("error", (e) => this.emit("error", e));
  }

  attachCall(call) {
    this.call = call;
    call.on("stream", (s) => {
      this.remoteStream = s;
      this.emit("stream", s);
    });
  }

  send(t, data = {}) {
    if (this.conn?.open) this.conn.send({ t, ...data });
  }

  close() {
    try {
      this.send("bye");
    } catch {}
    setTimeout(() => this.peer?.destroy(), 150);
  }
}

export function friendlyNetError(err) {
  const t = err?.type;
  if (t === "peer-unavailable") return "방을 찾을 수 없어요. 친구가 방을 닫았거나 링크가 잘못됐어요.";
  if (t === "timeout") return "연결이 너무 오래 걸려요. 친구 화면이 켜져 있는지 확인해 주세요.";
  if (t === "network" || t === "server-error" || t === "socket-error")
    return "연결 서버에 접속할 수 없어요. 인터넷 연결을 확인해 주세요.";
  if (t === "browser-incompatible") return "이 브라우저는 온라인 대결을 지원하지 않아요. 크롬을 써 주세요.";
  return "연결 중 문제가 생겼어요: " + (err?.message || t || err);
}
