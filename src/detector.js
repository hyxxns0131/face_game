// MediaPipe Face Landmarker 초기화 + 매 프레임 얼굴 인식
// 라이브러리(lib/mediapipe)와 모델(models/)은 이 폴더 안에 들어 있어서 인터넷 없이도 동작합니다.
import { FaceLandmarker, FilesetResolver } from "../lib/mediapipe/vision_bundle.mjs";

const WASM_PATH = new URL("../lib/mediapipe/wasm", import.meta.url).href;
const MODEL_PATH = new URL("../models/face_landmarker.task", import.meta.url).href;

let landmarker = null;
let lastTs = 0;

async function create(vision, delegate) {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true, // 표정 값 52개 (웃음, 눈 감김 등)
  });
}

export async function initDetector() {
  if (landmarker) return;
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  try {
    landmarker = await create(vision, "GPU");
  } catch (err) {
    console.warn("GPU 초기화 실패 → CPU로 다시 시도합니다.", err);
    landmarker = await create(vision, "CPU");
  }
}

/**
 * @returns null (아직 준비 안 됨) | { face:false } | { face:true, scores, landmarks }
 *  - scores: { eyeBlinkLeft: 0~1, mouthSmileLeft: 0~1, ... }
 *  - landmarks: 478개 얼굴 점 (x, y 는 0~1 비율)
 */
export function detect(video) {
  if (!landmarker || video.readyState < 2) return null;
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1; // 타임스탬프는 항상 증가해야 함
  lastTs = ts;

  const result = landmarker.detectForVideo(video, ts);
  const cats = result.faceBlendshapes?.[0]?.categories;
  if (!cats || !result.faceLandmarks?.length) return { face: false };

  const scores = {};
  for (const c of cats) scores[c.categoryName] = c.score;
  return { face: true, scores, landmarks: result.faceLandmarks[0] };
}
