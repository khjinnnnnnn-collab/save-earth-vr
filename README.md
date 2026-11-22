# 🌍 지구를 구하라 VR (save-earth-vr)

초등학생(1~6학년)을 위한 환경 보호 VR 체험. **Meta Quest 브라우저**에서 주소만 열면 바로 실행되는 WebXR 게임입니다. (플레이 시간 약 5분)

| 단계 | 내용 | 상태 |
|---|---|---|
| 인트로 | 아픈 지구 "지구별이"의 부탁 | ✅ |
| STAGE 1 땅 | 쓰레기 분리배출 던지기 (비우기·라벨 떼기·상자 접기 미션, 황금 캔) | ✅ |
| STAGE 2 바다 | 마스크 쓰고 잠수 → 거북이·물고기·물범 구조, 쓰레기는 망태기에 | ✅ |
| STAGE 3 하늘 | 스모그 몬스터 — 오염 원인 찾고 해결하기 | ⏳ |
| 엔딩 | 생명의 구슬 3개로 지구 정화, 지구 지킴이 인증 | ✅ |

## 실행
- Quest: 브라우저에서 GitHub Pages 주소 접속 → **VR로 시작하기**
- PC: 같은 주소 → **화면으로 체험하기** (마우스로 잡고 끌어서 놓으면 던지기, 더블클릭 = 두 손 동작, 오른쪽 드래그/방향키 = 시점)
- 로컬: `python3 -m http.server 8080` → http://localhost:8080
- 개발용 파라미터: `?stage=land|sea|sky|ending`, `?autostart`

## 구조
- `src/engine.js` 렌더러·XR·트윈 / `src/input.js` 컨트롤러·마우스 / `src/grab.js` 잡기·던지기·물리
- `src/stages/*` 스테이지별 로직 / `src/lines.js` 내레이션 대본 (TTS 생성에도 사용)
- `tools/gen_tts.mjs` Google Cloud TTS로 `assets/voice/*.mp3` 생성

## 크레딧
- 3D 모델·텍스처·HDRI: [Poly Haven](https://polyhaven.com) (CC0)
- 엔진: [three.js](https://threejs.org) (MIT, `vendor/three`)
