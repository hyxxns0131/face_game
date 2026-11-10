// 패널(캔버스) 그리기 도우미 — 내 화면은 이 캔버스 그대로 친구에게 영상으로 전송됨
export const PW = 640;
export const PH = 480;

const imgCache = new Map();
export function img(src) {
  if (!imgCache.has(src)) {
    const im = new Image();
    im.src = src;
    imgCache.set(src, im);
  }
  return imgCache.get(src);
}

/** 카메라를 거울 모드로 꽉 차게 그리기 (가운데 기준 잘라내기) */
export function drawCameraCover(ctx, video, W = PW, H = PH) {
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const scale = Math.max(W / vw, H / vh);
  const sw = W / scale, sh = H / scale;
  const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  ctx.restore();
  return { sx, sy, sw, sh, vw, vh }; // 인식 좌표 → 패널 좌표 변환에 사용
}

/** 비디오 정규화 좌표(0~1, 원본) → 패널 픽셀 좌표 (거울) */
export function toPanel(map, lx, ly, W = PW, H = PH) {
  const px = lx * map.vw, py = ly * map.vh;
  return { x: W - ((px - map.sx) / map.sw) * W, y: ((py - map.sy) / map.sh) * H };
}

/** 밤하늘 배경 (AI 패널, 카메라 꺼짐 등) */
export function drawNight(ctx, t = 0, W = PW, H = PH) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1238");
  g.addColorStop(1, "#2a2f6e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  for (let i = 0; i < 60; i++) {
    const x = (i * 97.3) % W;
    const y = ((i * 53.7 + t * 0.03 * (1 + (i % 3))) % (H + 10)) - 5;
    ctx.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
  }
  ctx.fillStyle = "#e8f1ff";
  ctx.fillRect(0, H - 18, W, 18);
}

/** 패널 왼쪽 아래 이름표 (캐릭터 + 닉네임) */
export function drawTag(ctx, nick, charSrc, color = "#ff4a4a", W = PW, H = PH) {
  const ch = img(charSrc);
  ctx.save();
  ctx.font = `700 24px "Galmuri11", "Malgun Gothic", sans-serif`;
  const tw = ctx.measureText(nick).width;
  const x = 12, y = H - 52, h = 40;
  ctx.fillStyle = "rgba(10,14,40,.75)";
  ctx.fillRect(x, y, tw + 70, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 6, h);
  if (ch.complete && ch.naturalWidth) {
    const ih = 52, iw = (ih * ch.naturalWidth) / ch.naturalHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ch, x + 12, y + h - ih + 4, iw, ih);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(nick, x + 58, y + h / 2 + 1);
  ctx.restore();
}

/** 캐릭터 스프라이트를 (cx, 바닥 y)에 높이 h로 그리기 */
export function drawSprite(ctx, src, cx, bottom, h) {
  const im = img(src);
  if (!im.complete || !im.naturalWidth) return;
  const w = (h * im.naturalWidth) / im.naturalHeight;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, cx - w / 2, bottom - h, w, h);
  ctx.imageSmoothingEnabled = true;
}
