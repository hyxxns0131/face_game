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

## 5. 폴더 구조 (계획)

```
face_game/
├── README.md
├── index.html            # 화면 뼈대
├── style.css
└── src/
    ├── main.js           # 화면 전환, 게임 흐름
    ├── camera.js         # 웹캠 켜기/끄기
    ├── detector.js       # MediaPipe 초기화 + 판정(judge)
    ├── calibration.js    # 3초 무표정 기준값 측정
    ├── distractions.js   # 방해 요소 (이모지, 문구, 필터, 효과음)
    ├── leaderboard.js    # 순위표 저장/불러오기
    └── data/
        └── jokes.js      # 아재개그, 방해 문구 모음
```

---

## 6. 개발 순서 (마일스톤)

- [ ] **1단계 – 인식 확인**: 웹캠 켜고, 웃음 값/깜빡임 값을 화면에 숫자와 막대로 표시
- [ ] **2단계 – 판정**: 보정 3초 + 웃음/깜빡임 탈락 판정 + 타이머
- [ ] **3단계 – 게임 흐름**: 시작 → 카운트다운 → 게임 → 탈락 화면 → 다시하기
- [ ] **4단계 – 방해 요소**: 이모지 → 문구 → 얼굴 필터 → 효과음 순서로 추가
- [ ] **5단계 – 순위표 (로컬)**: `localStorage`에 닉네임 + 기록 저장, 친구 대결 모드
- [ ] **6단계 – 온라인 순위표**: Firebase/Supabase 연결, 배포 후 친구들한테 링크 공유
- [ ] **7단계 – 꾸미기**: 탈락 순간 캡처 공유, 칭호(예: "강철 포커페이스", "웃음 자판기")

---

## 7. 실행 방법

카메라는 `file://`로 열면 동작하지 않습니다. **로컬 서버**로 열어야 합니다.

```bash
# 방법 1: Node가 있으면
npx serve .

# 방법 2: Python이 있으면
python -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000` 접속 → 카메라 권한 허용.
(VS Code를 쓴다면 **Live Server** 확장으로 `index.html` 열기도 OK)

---

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
