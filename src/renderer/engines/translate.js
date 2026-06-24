// 번역 엔진 — 무료(MyMemory) / 유료(Claude) 선택

// 무료: MyMemory 공개 번역 API (키 불필요)
//  - 익명 하루 약 5,000 단어, 이메일 등록 시 약 50,000 단어
async function translateFree(text, { sourceLang, targetLang, email }) {
  const params = new URLSearchParams({
    q: text,
    langpair: `${sourceLang}|${targetLang}`,
  });
  if (email) params.set("de", email);
  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`);
  const data = await res.json();
  const out = data?.responseData?.translatedText;
  if (!out) throw new Error(data?.responseDetails || "번역 응답 없음");
  return out;
}

// 무료 번역 (MyMemory)
export function freeTranslate(text, cfg) {
  return translateFree(text, {
    sourceLang: cfg.sourceLang,
    targetLang: cfg.targetLang,
    email: cfg.myMemoryEmail,
  });
}

// 선택한 제공자(Claude/GPT/CLI) 경유 번역 — 메인 프로세스가 라우팅
export async function providerTranslate(text) {
  const r = await window.api.translate({ text });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}
