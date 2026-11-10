// MediaPipe Face Landmarker — 최대 2명의 얼굴을 매 프레임 인식
import { FaceLandmarker, FilesetResolver } from "../../lib/mediapipe/vision_bundle.mjs";

const WASM_PATH = new URL("../../lib/mediapipe/wasm", import.meta.url).href;
const MODEL_PATH = new URL("../../models/face_landmarker.task", import.meta.url).href;

let landmarker = null;
let lastTs = 0;

const options = (delegate) => ({
  baseOptions: { modelAssetPath: MODEL_PATH, delegate },
  runningMode: "VIDEO",
  numFaces: 2,
  outputFaceBlendshapes: true, // 표정 값 52개 (웃음, 눈 감김 등)
});

export async function initDetector() {
  if (landmarker) return;
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, options("GPU"));
  } catch (err) {
    console.warn("GPU 초기화 실패 → CPU로 다시 시도합니다.", err);
    landmarker = await FaceLandmarker.createFromOptions(vision, options("CPU"));
  }
}

/** @returns 얼굴 배열 [{ scores: {eyeBlinkLeft: 0~1, ...}, landmarks: 478개 점 }] */
export function detectFaces(video) {
  if (!landmarker || video.readyState < 2) return [];
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const result = landmarker.detectForVideo(video, ts);
  const faces = [];
  (result.faceLandmarks || []).forEach((landmarks, i) => {
    const cats = result.faceBlendshapes?.[i]?.categories;
    if (!cats) return;
    const scores = {};
    for (const c of cats) scores[c.categoryName] = c.score;
    faces.push({ scores, landmarks });
  });
  return faces;
}
