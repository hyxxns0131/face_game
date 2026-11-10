// MediaPipe Pose Landmarker — 내 몸(코, 어깨, 손목 등 33개 점)을 인식
import { PoseLandmarker, FilesetResolver } from "../../lib/mediapipe/vision_bundle.mjs";

const WASM_PATH = new URL("../../lib/mediapipe/wasm", import.meta.url).href;
const MODEL_PATH = new URL("../../models/pose_landmarker_lite.task", import.meta.url).href;

let landmarker = null;
let lastTs = 0;

const options = (delegate) => ({
  baseOptions: { modelAssetPath: MODEL_PATH, delegate },
  runningMode: "VIDEO",
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

export async function initPose() {
  if (landmarker) return;
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch (err) {
    console.warn("GPU 초기화 실패 → CPU로 다시 시도합니다.", err);
    landmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
}

/** @returns 사람별 33개 점 배열의 배열 (x, y는 0~1, visibility 포함) */
export function detectPoses(video) {
  if (!landmarker || video.readyState < 2) return [];
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const result = landmarker.detectForVideo(video, ts);
  return result.landmarks || [];
}
