# 😐 포커페이스 챌린지 (웃음 참기 × 눈싸움)

웹캠 앞에서 **웃지도 말고, 눈도 깜빡이지 말고** 최대한 오래 버티는 게임입니다.
화면에서는 계속 웃긴 방해 요소가 나오고, 웃거나 눈을 깜빡이는 순간 탈락합니다.
버틴 시간이 점수가 되고, 친구들과 순위표로 겨룹니다.

얼굴 인식은 [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)로 **브라우저 안에서만** 처리하고, 영상은 어디에도 전송하거나 저장하지 않습니다.

---

## 1. 게임 규칙

| 항목 | 내용 |
|---|---|
| 목표 | 웃지 않고, 눈 깜빡이지 않고 오래 버티기 |
| 탈락 조건 ① | 웃음 감지 (입꼬리 올라감 + 볼 올라감이 0.3초 이상 지속) |
| 탈락 조건 ② | 눈 깜빡임 감지 (양쪽 눈이 감긴 상태가 0.1초 이상) |
| 탈락 조건 ③ | 얼굴이 화면에서 1초 이상 사라짐 (꼼수 방지) |
| 점수 | 버틴 시간(초, 소수점 1자리) |
| 방해 요소 | 시간이 지날수록 더 자주, 더 세게 나옴 |

### 게임 모드
- **혼합 모드 (기본)**: 웃음 + 깜빡임 둘 다 탈락
- **웃음 참기 모드**: 웃음만 판정 (눈은 깜빡여도 됨)
- **눈싸움 모드**: 깜빡임만 판정
- **친구 대결 모드 (로컬)**: 한 컴퓨터로 차례대로 플레이 → 같은 판의 순위 표시

### 난이도 단계 (방해 요소)
| 경과 시간 | 단계 | 방해 요소 예시 |
|---|---|---|
| 0–10초 | 1단계 | 웃긴 이모지가 화면에 둥둥 떠다님 |
| 10–20초 | 2단계 | 아재개그 문구 팝업, 화면 흔들림 |
| 20–30초 | 3단계 | 내 얼굴에 웃긴 필터(콧수염, 왕눈이) 씌우기 |
| 30초~ | 4단계 | 효과음 + 모든 방해 요소 랜덤 동시 등장 |

> 팁: 친구들이 직접 아재개그 문구를 추가할 수 있게 `src/data/jokes.js`로 분리해 두면 재밌어요.

---

## 2. 화면 구성

```
[시작 화면] → [닉네임 입력 + 모드 선택] → [카메라 켜기 + 보정 3초]
     → [카운트다운 3,2,1] → [게임 중] → [탈락 화면: 기록 + 탈락 순간 캡처]
     → [순위표]
```

- **게임 중 화면**: 웹캠 영상(좌우 반전), 큰 타이머, 웃음 게이지 / 눈 게이지(위험할수록 빨개짐), 방해 요소 레이어
- **탈락 화면**: "😂 웃음으로 탈락!" 또는 "😑 깜빡임으로 탈락!", 버틴 시간, 탈락 순간 스크린샷(웃긴 얼굴 공유용), 다시하기 버튼
- **순위표**: 모드별 TOP 10, 내 최고 기록 강조

---

## 3. 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 얼굴 인식 | `@mediapipe/tasks-vision` – `FaceLandmarker` (blendshapes 사용) |
| 프론트엔드 | HTML + CSS + JavaScript (프레임워크 없이 시작, 필요하면 Vite) |
| 순위표 (1단계) | `localStorage` – 한 컴퓨터에서 친구들끼리 |
| 순위표 (2단계) | Firebase Firestore 또는 Supabase – 친구들이 각자 폰/PC로 접속 |
| 배포 | GitHub Pages / Vercel / Netlify (카메라는 **HTTPS** 필요) |

---

## 4. 핵심 원리: 블렌드셰이프로 웃음·깜빡임 판정

Face Landmarker에 `outputFaceBlendshapes: true` 옵션을 주면 매 프레임마다 52개 표정 값(0~1)이 나옵니다. 이 중에 다음 값만 사용합니다.

| 판정 | 사용하는 블렌드셰이프 | 기준 (예시, 보정 후 조정) |
|---|---|---|
| 웃음 | `mouthSmileLeft`, `mouthSmileRight` | 평균 > 기준값 + 0.35 |
| 웃음 보조 | `cheekSquintLeft`, `cheekSquintRight` | 웃음 판정 정확도 향상용 |
| 깜빡임 | `eyeBlinkLeft`, `eyeBlinkRight` | 둘 다 > 0.5 |

### 보정(Calibration)이 중요한 이유
사람마다 무표정일 때 입꼬리 값이 다릅니다(원래 입꼬리가 올라간 사람도 있음).
그래서 게임 시작 전 **3초 동안 무표정 값을 평균 내서 기준값(baseline)** 으로 저장하고, 그 기준보다 얼마나 올라갔는지로 판정합니다.

### 오작동 방지
- 한 프레임만 튀는 값은 무시 → **연속 N프레임 이상**일 때만 탈락
- 값을 부드럽게: 지수이동평균 `smoothed = 0.6 * prev + 0.4 * current`

### 핵심 코드 스케치

```js
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: true,
});

// 블렌드셰이프 배열 → { 이름: 값 } 객체로 변환
function toScores(result) {
  const cats = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(cats.map((c) => [c.categoryName, c.score]));
}

let smileFrames = 0, blinkFrames = 0;
const SMILE_FRAMES_TO_FAIL = 9;  // 30fps 기준 약 0.3초
const BLINK_FRAMES_TO_FAIL = 3;  // 약 0.1초

function judge(s, baseline) {
  const smile = (s.mouthSmileLeft + s.mouthSmileRight) / 2 - baseline.smile;
  const blink = Math.min(s.eyeBlinkLeft, s.eyeBlinkRight);

  smileFrames = smile > 0.35 ? smileFrames + 1 : 0;
  blinkFrames = blink > 0.5 ? blinkFrames + 1 : 0;

  if (smileFrames >= SMILE_FRAMES_TO_FAIL) return "smile";
  if (blinkFrames >= BLINK_FRAMES_TO_FAIL) return "blink";
  return null;
}

function loop() {
  const result = faceLandmarker.detectForVideo(video, performance.now());
  if (result.faceBlendshapes?.length) {
    const reason = judge(toScores(result), baseline);
    if (reason) return gameOver(reason);
  }
  requestAnimationFrame(loop);
}
```

---

## 5. 폴더 구조

```
face_game/
├── README.md
├── start.bat             # ← 더블클릭으로 실행 (윈도우)
├── server.py             # 로컬 서버 (파일 형식 문제 방지용)
├── package.json          # Node로 실행할 때용 (npm start)
├── index.html            # 화면 4개: 시작 / 게임 / 결과 / 순위표
├── style.css
├── lib/mediapipe/        # MediaPipe tasks-vision 1.2.2 (설치 완료, 오프라인 동작)
│   ├── vision_bundle.mjs
│   └── wasm/vision_wasm_internal.{js,wasm}
├── models/
│   └── face_landmarker.task   # 얼굴 인식 모델 (설치 완료)
└── src/
    ├── main.js           # 게임 흐름, 화면 전환, 결과 캡처, 디버그 패널
    ├── detector.js       # MediaPipe 초기화 + 매 프레임 인식 (GPU 실패 시 CPU)
    ├── judge.js          # 보정(Calibrator) + 탈락 판정(Judge) + 난이도 값
    ├── camera.js         # 웹캠 켜기/끄기
    ├── distractions.js   # 단계별 방해 요소 (이모지, 문구, 흔들기, 필터, 효과음)
    ├── filters.js        # 얼굴 필터 그리기 (왕눈이, 피에로 코, 콧수염)
    ├── sfx.js            # 효과음 (Web Audio로 직접 합성, 파일 없음)
    ├── leaderboard.js    # 순위표 (localStorage)
    └── data/
        └── jokes.js      # 아재개그, 놀리는 문구, 이모지 모음 ← 마음껏 추가!
```

## 6. 개발 순서 (마일스톤)

- [x] **1단계 – 인식 확인**: 웹캠 + 인식 값 표시 (게임 중 `D` 키로 디버그 패널)
- [x] **2단계 – 판정**: 보정 3초 + 웃음/깜빡임/화면 이탈 탈락 판정 + 타이머
- [x] **3단계 – 게임 흐름**: 시작 → 카운트다운 → 게임 → 탈락 화면 → 다시하기
- [x] **4단계 – 방해 요소**: 이모지 → 문구 → 얼굴 필터 → 효과음
- [x] **5단계 – 순위표 (로컬)**: 모드별 TOP 10, 사람별 최고 기록, 친구 대결(다음 사람)
- [ ] **6단계 – 온라인 순위표**: Firebase/Supabase 연결 (`src/leaderboard.js`만 바꾸면 됨), 배포 후 링크 공유
- [x] **7단계 – 꾸미기**: 탈락 순간 캡처 저장, 칭호(웃음 자판기 ~ 강철 포커페이스)

## 7. 실행 방법

카메라는 `index.html`을 더블클릭(`file://`)으로 열면 동작하지 않습니다. **로컬 서버**로 열어야 합니다.

**가장 쉬운 방법:** 폴더 안의 **`start.bat` 더블클릭** → 브라우저가 자동으로 `http://localhost:8000`을 엽니다 → 카메라 권한 허용.
(Python이 필요합니다. 없으면 https://www.python.org/downloads/ 에서 설치할 때 **Add python.exe to PATH**를 체크하세요.)

직접 실행하려면:

```bash
python server.py        # 또는 py server.py
# Node가 있으면
npm start
```

끄려면 검은 창에서 `Ctrl + C`.

### 튜닝하기
- 게임 중 **`D` 키** → 실시간 웃음/눈 값과 기준값이 보입니다.
- 판정이 너무 빡빡하거나 느슨하면 `src/judge.js`의 `DIFFICULTY` 값을 조정하세요.
  - `smile`: 작을수록 살짝 웃어도 탈락
  - `smileMs` / `blinkMs`: 그 상태가 몇 ms 이어져야 탈락인지
- 방해 요소 타이밍은 `src/distractions.js`의 `update()`에서 바꿀 수 있습니다.

## 8. 주의할 점

- 안경 반사, 어두운 조명, 앞머리 때문에 깜빡임 인식이 흔들릴 수 있음 → 시작 전 "밝은 곳에서 정면을 봐주세요" 안내
- 기준값(0.35, 0.5)은 예시라서 친구들과 테스트하면서 조정 필요 → 개발 중엔 디버그 패널로 값 보면서 튜닝
- 순위표를 온라인으로 올릴 때는 **닉네임과 기록만** 저장하고, 얼굴 사진은 서버에 올리지 않기
- 탈락 캡처는 본인 화면에서만 보여주고, 공유는 본인이 직접 선택하게 하기

---

## 9. 나중에 추가해볼 아이디어

- 🎥 **방해 영상 모드**: 친구가 직접 웃긴 표정 영상을 녹화해서 상대에게 보내기
- 👥 **실시간 1:1 대결**: 두 명이 동시에 접속해서 먼저 웃는 사람이 패배
- 🏆 **주간 챔피언**: 일주일마다 순위표 초기화 + 지난주 챔피언 칭호
- 📊 **내 기록 대시보드**: 날짜별 기록 그래프, 웃음/깜빡임 탈락 비율

---

# ☃️ 게임 3: 눈덩이 대작전 (`snowball/`)

웹캠 하나 앞에 두 명이 나란히 서서 하는 눈싸움 게임입니다. (왼쪽 = P1, 오른쪽 = P2)
`start.bat` 실행 → 포커페이스 첫 화면 아래 **☃️ 게임 3** 링크, 또는 `http://localhost:8000/snowball/`

| 동작 | 방법 |
|---|---|
| ❄️ 받기 | 내리는 눈송이에 손을 대면 손에 눈이 뭉쳐짐 |
| 🌀 굴리기 | 손을 원 모양으로 빙글빙글 → 눈덩이가 커짐 |
| 💨 던지기 | 상대 쪽으로 팔을 빠르게 휙 → 상대 얼굴을 향해 날아감 |
| 😎 피하기 | 내 얼굴에 빨간 조준점이 뜨면 몸을 움직여 벗어나기 |

- 점수: 작은 눈덩이 1점 / 중간 2점 / 큰 눈덩이 3점 (클수록 느리게 날아가서 피하기 쉬움)
- 화면 밖으로 도망가면 맞은 걸로 처리
- **혼자 연습** 모드: 오른쪽에 눈사람 봇이 나와서 같이 던지고 피함 (혼자 테스트할 때)
- 인식: MediaPipe **Pose Landmarker** (`models/pose_landmarker_lite.task`, 최대 2명)
- 튜닝: 게임 중 `D` 키로 손 속도·회전 값 확인 → `snowball/src/game.js` 맨 위 `CFG` 값 조정
  - 던지기가 잘 안 되면 `throwSpeed`를 낮추고 (예: 0.8), 굴려도 안 커지면 `rollArea`를 올리기
