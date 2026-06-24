// ┌─────────────────────────────────────────────────────────────┐
// │  기본 설정 (음성인식·언어). AI 제공자/키는 앱의 ⚙️ 설정에서.  │
// └─────────────────────────────────────────────────────────────┘
window.CONFIG = {
  // 영어 강의용 Whisper 모델 (정확도↑ 위 → 속도↑ 아래):
  //   "Xenova/whisper-small.en"  ← 정확도 좋음 (기본, M칩 권장)
  //   "Xenova/whisper-base.en"   ← 중간
  //   "Xenova/whisper-tiny.en"   ← 가장 빠름 / 저사양
  whisperModel: "Xenova/whisper-small.en",

  // 한국어(다국어) 강의용 Whisper 모델 — .en 모델은 한국어를 못 알아들어서
  // 한국어 강의는 다국어 모델을 따로 씁니다. (처음 한 번 다운로드)
  whisperModelKo: "Xenova/whisper-small",

  // MyMemory(무료 번역) 한도를 늘리려면(하루 5천→5만 단어) 본인 이메일을 넣으세요.
  myMemoryEmail: "",

  // 기본 강의 언어 — 앱 안에서 바꿀 수 있어요.
  //   "en" : 영어 강의 → 한국어 번역 자막
  //   "ko" : 한국어 강의 → 그대로 받아쓰기
  lectureLang: "en",

  // 번역 언어
  sourceLang: "en", // 번역 출발어 (영어)
  targetLang: "ko", // 번역 도착어 (한국어)
};
