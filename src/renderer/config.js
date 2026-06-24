// ┌─────────────────────────────────────────────────────────────┐
// │  엔진 설정 — 여기만 바꾸면 무료 ↔ 유료(고품질) 전환됩니다.    │
// └─────────────────────────────────────────────────────────────┘
window.CONFIG = {
  // "free"  : Whisper(로컬) + MyMemory 무료 번역. 키·비용 없음.
  // "paid"  : Deepgram + Claude. 빠르고 품질 좋음. (.env 에 키 필요)
  mode: "free",

  // 화면(슬라이드/판서) 보기 + 챗봇 보조 기능을 어떤 방식으로 쓸지:
  //   "cli" : 내 컴퓨터의 Claude 로그인(계정)으로 사용 — 별도 API 키 불필요(권장)
  //   "api" : .env 의 ANTHROPIC_API_KEY 사용
  //   "off" : 보조 기능 끄기 (무료 자막만)
  assistant: "cli",
  // CLI 사용 시 모델 지정(비우면 Claude Code 기본 모델). 예: "sonnet", "opus"
  claudeModel: "",

  // 실시간 자막 번역을 무엇으로 할지:
  //   "account" : 내 Claude 계정(CLI) — 번역 품질↑ (자막이 2~5초 느려질 수 있음)
  //   "free"    : MyMemory 무료 번역 — 빠름, 품질 보통
  translateVia: "account",

  // --- 무료(free) 모드 설정 ---
  // 영어 강의용 Whisper 모델 (정확도↑ 위 → 속도↑ 아래):
  //   "Xenova/whisper-small.en"  ← 정확도 좋음 (기본, M칩 권장)
  //   "Xenova/whisper-base.en"   ← 중간
  //   "Xenova/whisper-tiny.en"   ← 가장 빠름 / 저사양
  whisperModel: "Xenova/whisper-small.en",

  // 한국어(다국어) 강의용 Whisper 모델 — .en 모델은 한국어를 못 알아들어서
  // 한국어 강의는 다국어 모델을 따로 씁니다. (처음 한 번 다운로드)
  whisperModelKo: "Xenova/whisper-small",

  // MyMemory 무료 한도를 늘리려면(하루 5천→5만 단어) 본인 이메일을 넣으세요.
  myMemoryEmail: "",

  // 기본 강의 언어 — 앱 안에서 바꿀 수 있어요.
  //   "en" : 영어 강의 → 한국어 번역 자막
  //   "ko" : 한국어 강의 → 그대로 받아쓰기 (플립러닝/집중 안 될 때 따라 읽기)
  lectureLang: "en",

  // 언어
  sourceLang: "en", // 번역 출발어 (영어)
  targetLang: "ko", // 번역 도착어 (한국어)
};
