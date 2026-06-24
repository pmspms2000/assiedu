// AI 제공자 라우팅: 사용자가 고른 provider로 번역·설명·질문·요약 처리.
//   free      : (여기서 처리 안 함 — 렌더러가 MyMemory 사용)
//   anthropic : Claude API 키
//   openai    : OpenAI(GPT) API 키
//   cli       : 이 컴퓨터의 Claude 로그인 (claude CLI)
//   codex     : 이 컴퓨터의 Codex 로그인 (codex CLI, ChatGPT 계정)
const settings = require("./settings");
const claudeCli = require("./assistant");
const codexCli = require("./codex");

const ANTH_TRANSLATE = "claude-haiku-4-5";
const ANTH_SMART = "claude-sonnet-4-6";
const OAI_TRANSLATE = "gpt-4o-mini";
const OAI_SMART = "gpt-4o";

function provider() {
  return settings.load().provider || "free";
}

function parseDataUrl(d) {
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(d || "");
  return m ? { mediaType: m[1], b64: m[2] } : null;
}

// --- Anthropic (Claude API) ---
async function anthropicCall({ system, text, frames, maxTokens, model }) {
  const key = settings.load().anthropicKey;
  if (!key) throw new Error("Claude(Anthropic) API 키가 없어요. ⚙️ 설정에서 입력하세요.");
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const content = [];
  for (const f of frames || []) {
    const p = parseDataUrl(f);
    if (p)
      content.push({
        type: "image",
        source: { type: "base64", media_type: p.mediaType, data: p.b64 },
      });
  }
  content.push({ type: "text", text });
  const msg = await client.messages.create({
    model: model || ANTH_SMART,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  const b = (msg.content || []).find((x) => x.type === "text");
  return b ? b.text.trim() : "";
}

// --- OpenAI (GPT API) ---
async function openaiCall({ system, text, frames, maxTokens, model }) {
  const key = settings.load().openaiKey;
  if (!key) throw new Error("OpenAI(GPT) API 키가 없어요. ⚙️ 설정에서 입력하세요.");
  const content = [{ type: "text", text }];
  for (const f of frames || []) if (f) content.push({ type: "image_url", image_url: { url: f } });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || OAI_SMART,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch (_) {}
    throw new Error("OpenAI 오류: " + (detail || res.status));
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

// 프롬프트 정의
const PROMPTS = {
  translateSystem:
    "You translate live English university-lecture speech into natural, fluent Korean. " +
    "Output ONLY the Korean translation — no preamble, no quotes, no explanation. " +
    "Keep technical terms accurate; proper nouns or standard jargon may keep English in parentheses.",
  explainSystem:
    "당신은 교환학생을 돕는 친절한 조교입니다. 강의에 나온 전문 용어나 어려운 개념을 한국어로 " +
    "학부생 눈높이에 맞게 간결·명확하게 3~5문장으로 설명하세요. 핵심 용어는 영어 원어를 병기하세요. " +
    "화면 이미지가 주어지면 슬라이드/판서 내용을 참고하세요. 머리말 없이 설명만 출력하세요.",
  askSystem:
    "당신은 교환학생의 강의 학습을 돕는 한국어 AI 조교입니다. 강의 자막 + 화면(판서) 이미지 + 이전 대화를 " +
    "근거로 학생의 질문에 한국어로 친절하고 정확하게 답하세요. 자료에 없는 내용은 지어내지 말고 모른다고 하세요.",
  summarizeSystem:
    "당신은 교환학생의 학습을 돕는 조교입니다. 아래 강의 음성 기록으로 한국어 복습 노트를 마크다운으로 작성하세요. " +
    "형식:\n1) 한 줄 요약\n2) 핵심 주제별 정리(불릿)\n3) 꼭 알아야 할 용어/개념 정의\n4) 강조점 / 시험에 나올 만한 부분",
};

function explainUser(text, context) {
  return (context ? `[최근 강의 자막]\n${context}\n\n` : "") + `[설명이 필요한 부분]\n${text}`;
}
function askUser(question, transcript, history) {
  let u = "";
  if (transcript) u += `[강의 자막(최근 내용)]\n${transcript}\n\n`;
  if (history && history.length)
    u +=
      "[이전 대화]\n" +
      history.map((h) => `${h.role === "user" ? "학생" : "조교"}: ${h.text}`).join("\n") +
      "\n\n";
  u += `[학생 질문]\n${question}`;
  return u;
}

// CLI 제공자(cli/codex)는 system+user를 한 프롬프트로 합쳐 전달
function cliRunner(p) {
  if (p === "cli") return claudeCli.run;
  if (p === "codex") return codexCli.run;
  return null;
}

// 공통 디스패치: API면 system/text 분리, CLI면 합쳐서
async function dispatch({ system, user, frames, maxTokens, anthModel, oaiModel }) {
  const p = provider();
  if (p === "anthropic")
    return anthropicCall({ system, text: user, frames, maxTokens, model: anthModel });
  if (p === "openai")
    return openaiCall({ system, text: user, frames, maxTokens, model: oaiModel });
  const run = cliRunner(p);
  if (run) {
    const model = settings.load().model || undefined;
    return run({ prompt: system + "\n\n" + user, frames, model });
  }
  throw new Error("AI 제공자가 설정되지 않았습니다. ⚙️ 설정에서 골라주세요.");
}

// ===== 공개 API =====
function translate({ text }) {
  return dispatch({
    system: PROMPTS.translateSystem,
    user: text,
    maxTokens: 1024,
    anthModel: ANTH_TRANSLATE,
    oaiModel: OAI_TRANSLATE,
  });
}

function explain({ text, context, frames }) {
  const model = settings.load().model || undefined;
  return dispatch({
    system: PROMPTS.explainSystem,
    user: explainUser(text, context),
    frames,
    maxTokens: 1024,
    anthModel: model || ANTH_SMART,
    oaiModel: model || OAI_SMART,
  });
}

function ask({ question, transcript, history, frames }) {
  const model = settings.load().model || undefined;
  return dispatch({
    system: PROMPTS.askSystem,
    user: askUser(question, transcript, history),
    frames,
    maxTokens: 2048,
    anthModel: model || ANTH_SMART,
    oaiModel: model || OAI_SMART,
  });
}

function summarize({ transcript }) {
  const model = settings.load().model || undefined;
  return dispatch({
    system: PROMPTS.summarizeSystem,
    user: "[강의 기록]\n" + transcript,
    maxTokens: 8000,
    anthModel: model || ANTH_SMART,
    oaiModel: model || OAI_SMART,
  });
}

function cliAvailable() {
  try {
    return claudeCli.isAvailable();
  } catch (_) {
    return false;
  }
}
function codexAvailable() {
  try {
    return codexCli.isAvailable();
  } catch (_) {
    return false;
  }
}

module.exports = { translate, explain, ask, summarize, provider, cliAvailable, codexAvailable };
