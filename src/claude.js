// Claude API 연동: 실시간 번역, 용어 설명, 수업 요약
const Anthropic = require("@anthropic-ai/sdk");

// 모델 선택
//  - 실시간 번역: 자막은 지연이 가장 중요하므로 빠르고 저렴한 Haiku 사용.
//    더 높은 번역 품질을 원하면 "claude-opus-4-8" 로 바꾸면 됩니다(지연 증가).
//  - 설명·요약: 품질이 중요하므로 최신 Opus 사용.
const TRANSLATE_MODEL = "claude-haiku-4-5";
const EXPLAIN_MODEL = "claude-opus-4-8";
const SUMMARY_MODEL = "claude-opus-4-8";

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY 가 .env 에 설정되지 않았습니다.");
    }
    client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 자동 사용
  }
  return client;
}

function firstText(message) {
  const block = message.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}

// 영어 강의 발화 한 토막을 자연스러운 한국어로 번역
async function translate(text) {
  if (!text || !text.trim()) return "";
  const message = await getClient().messages.create({
    model: TRANSLATE_MODEL,
    max_tokens: 1024,
    system:
      "You translate live English university-lecture speech into natural, fluent Korean. " +
      "Output ONLY the Korean translation — no preamble, no quotes, no explanation. " +
      "Keep technical terms accurate; if a term is a proper noun or standard jargon, you may keep it in English with Korean in parentheses.",
    messages: [{ role: "user", content: text }],
  });
  return firstText(message);
}

// 어려운 용어/개념을 맥락과 함께 한국어로 풀어서 설명
async function explain(text, context) {
  if (!text || !text.trim()) return "";
  const userContent = context
    ? `수업 맥락:\n${context}\n\n설명이 필요한 부분:\n${text}`
    : text;
  const message = await getClient().messages.create({
    model: EXPLAIN_MODEL,
    max_tokens: 1024,
    system:
      "당신은 교환학생을 돕는 친절한 조교입니다. 영어 강의에서 나온 전문 용어나 어려운 개념을, " +
      "한국어로 학부생이 이해할 수 있게 간결하고 명확하게 설명하세요. " +
      "필요하면 핵심 용어는 영어 원어를 병기하세요. 3~5문장 이내로 핵심만 전달하세요.",
    messages: [{ role: "user", content: userContent }],
  });
  return firstText(message);
}

// 수업 전체 트랜스크립트를 한국어 필기/요약본으로 정리
async function summarize(transcript) {
  if (!transcript || !transcript.trim()) return "";
  const message = await getClient().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 16000,
    system:
      "당신은 교환학생의 학습을 돕는 조교입니다. 아래는 영어 강의의 전체 음성 기록입니다. " +
      "이를 바탕으로 한국어 복습 노트를 작성하세요. 형식:\n" +
      "1) 한 줄 요약\n2) 핵심 주제별 정리(불릿)\n3) 꼭 알아야 할 용어/개념 정의\n4) 교수님이 강조한 점 / 시험에 나올 만한 부분\n" +
      "마크다운으로 작성하세요.",
    messages: [{ role: "user", content: transcript }],
  });
  return firstText(message);
}

module.exports = { translate, explain, summarize };
