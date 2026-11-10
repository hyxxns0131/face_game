// MediaPipe Face Landmarker — 내 카메라의 얼굴 1개
import { FaceLandmarker, FilesetResolver } from "../../lib/mediapipe/vision_bundle.mjs";

const WASM_PATH = new URL("../../lib/mediapipe/wasm", import.meta.url).href;
const MODEL_PATH = new URL("../../models/face_landmarker.task", import.meta.url).href;

let landmarker = null;
let lastTs = 0;

const options = (delegate) => ({
  baseOptions: { modelAssetPath: MODEL_PATH, delegate },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: true,
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

/** @returns null | { scores, landmarks } */
export function detectFace(video) {
  if (!landmarker || video.readyState < 2) return null;
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const r = landmarker.detectForVideo(video, ts);
  const lm = r.faceLandmarks?.[0];
  const cats = r.faceBlendshapes?.[0]?.categories;
  if (!lm || !cats) return null;
  const scores = {};
  for (const c of cats) scores[c.categoryName] = c.score;
  return { scores, landmarks: lm };
}
