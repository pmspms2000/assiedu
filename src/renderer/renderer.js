// 렌더러: 설정(제공자)에 따라 엔진을 골라 연결하고 UI를 그립니다.
import { createWhisperSTT } from "./engines/stt-whisper.js";
import { freeTranslate, providerTranslate } from "./engines/translate.js";
import { createScreenVision } from "./engines/vision-capture.js";

const CONFIG = window.CONFIG;

const toggleBtn = document.getElementById("toggleBtn");
const summaryBtn = document.getElementById("summaryBtn");
const settingsBtn = document.getElementById("settingsBtn");
const statusEl = document.getElementById("status");
const captionsEl = document.getElementById("captions");
const interimEl = document.getElementById("interim");
const summaryPanel = document.getElementById("summaryPanel");
const summaryBody = document.getElementById("summaryBody");
const closeSummary = document.getElementById("closeSummary");
const modeBadge = document.getElementById("modeBadge");
const deviceSelect = document.getElementById("deviceSelect");
const refreshBtn = document.getElementById("refreshDevices");
const langSelect = document.getElementById("langSelect");
const visionBtn = document.getElementById("visionBtn");
const chatBtn = document.getElementById("chatBtn");

// 현재 AI 제공자 상태(설정에서 옴): "free" | "anthropic" | "openai" | "cli"
const state = { provider: "free" };
const aiOn = () => state.provider !== "free";

const PROVIDER_LABEL = {
  free: "무료 모드",
  anthropic: "Claude (내 키)",
  openai: "GPT (내 키)",
  cli: "내 Claude 계정",
  codex: "내 Codex 계정",
};

function applyProvider() {
  const on = aiOn();
  visionBtn.style.display = on ? "" : "none";
  chatBtn.style.display = on ? "" : "none";
  modeBadge.textContent = PROVIDER_LABEL[state.provider] || state.provider;
  modeBadge.title =
    "음성인식: 무료(Whisper)\n" +
    (on
      ? "번역·설명·요약·질문: " + PROVIDER_LABEL[state.provider]
      : "번역: 무료(MyMemory) · 설명/요약/질문: 꺼짐 (⚙️ 설정에서 켜기)");
}

async function loadProvider() {
  try {
    const s = await window.api.getSettings();
    state.provider = s.provider || "free";
  } catch (_) {
    state.provider = "free";
  }
  applyProvider();
}
window.api.onSettingsChanged((s) => {
  state.provider = (s && s.provider) || "free";
  applyProvider();
});

langSelect.value = CONFIG.lectureLang || "en";

const vision = createScreenVision();

let running = false;
let stt = null;
let activeLectureLang = langSelect.value; // 이번 세션에 적용된 강의 언어

// 현재 화면 프레임을 (화면보기 켜져 있으면) 한 장 캡처
function currentFrames() {
  if (!vision.active) return [];
  const f = vision.grab();
  return f ? [f] : [];
}

// 별도 질문 창이 메인 프로세스를 통해 현재 자막+화면을 가져갈 수 있게 노출
window.__assieduContext = () => ({
  transcript: fullTranscript.slice(-40).join(" "),
  frame: vision.active ? vision.grab() : null,
});
const fullTranscript = []; // 요약용 원문 누적

// 제공자에 맞춰 번역: 무료면 MyMemory, 아니면 선택한 AI
async function translate(text) {
  if (!aiOn())
    return freeTranslate(text, {
      sourceLang: CONFIG.sourceLang,
      targetLang: CONFIG.targetLang,
      email: CONFIG.myMemoryEmail,
    });
  return providerTranslate(text);
}

function setStatus(t) {
  statusEl.textContent = t;
}

// 입력 장치 목록 조회 → 드롭다운 채우기
async function refreshDevices() {
  try {
    let inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audioinput"
    );
    // 라벨이 비어 있으면(권한 전) 임시로 권한을 얻어 이름을 채움
    if (inputs.length && inputs.every((d) => !d.label)) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((t) => t.stop());
        inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput"
        );
      } catch (_) {}
    }
    const prev = deviceSelect.value;
    deviceSelect.innerHTML = '<option value="">기본 입력 장치</option>';
    const disp = document.createElement("option");
    disp.value = "__display__";
    disp.textContent = "🎬 화면·영상 소리 (녹화 강의)";
    deviceSelect.appendChild(disp);
    inputs.forEach((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `입력 장치 ${i + 1}`;
      deviceSelect.appendChild(o);
    });
    if (prev) deviceSelect.value = prev;
    if (inputs.length === 0)
      setStatus("입력 장치 없음 — 마이크/이어폰 연결 후 🔄");
  } catch (e) {
    setStatus("장치 목록 오류: " + (e.message || e));
  }
}

function friendlyError(err) {
  const n = err && err.name;
  if (n === "NotFoundError" || n === "OverconstrainedError")
    return "입력 장치를 찾을 수 없어요. 마이크/이어폰을 연결하고 🔄로 새로고침한 뒤 위 목록에서 장치를 고르세요. (녹화 강의 소리는 BlackHole 설치 후 선택)";
  if (n === "NotAllowedError")
    return "마이크 권한이 거부됐어요. 시스템 설정 → 개인정보 보호 및 보안 → 마이크 에서 AssiEdu(Electron)를 허용해주세요.";
  return err.message || String(err);
}

function buildSTT() {
  const v = deviceSelect.value;
  const source =
    v === "__display__"
      ? { kind: "display" }
      : { kind: "device", deviceId: v || undefined };
  activeLectureLang = langSelect.value; // 시작 시점의 강의 언어로 고정
  const ko = activeLectureLang === "ko";
  // 음성 인식은 항상 무료 로컬 Whisper (Claude/GPT는 오디오를 못 들음)
  return createWhisperSTT({
    model: ko ? CONFIG.whisperModelKo : CONFIG.whisperModel,
    lang: ko ? "ko" : "en",
    source,
    onStatus: setStatus,
    onListening: () => {},
    onFinal: addSegment,
    onInterim: (t) => (interimEl.textContent = t),
  });
}

async function start() {
  try {
    stt = buildSTT();
    await stt.start();
    running = true;
    toggleBtn.textContent = "■ 정지";
    toggleBtn.classList.add("running");
  } catch (err) {
    setStatus("오류: " + friendlyError(err));
    running = false;
    toggleBtn.textContent = "▶ 시작";
    toggleBtn.classList.remove("running");
  }
}

function stop() {
  running = false;
  toggleBtn.textContent = "▶ 시작";
  toggleBtn.classList.remove("running");
  if (stt) stt.stop();
  interimEl.textContent = "";
  setStatus("정지됨");
}

// 확정된 발화 한 토막을 추가
async function addSegment(text) {
  fullTranscript.push(text);
  interimEl.textContent = "";

  const seg = document.createElement("div");
  seg.className = "segment";

  // 한국어 강의: 번역 없이 받아쓰기만 (따라 읽기용)
  if (activeLectureLang === "ko") {
    seg.innerHTML = `
      <div class="ko"></div>
      <button class="explain-btn">💡 설명</button>
      <div class="explanation hidden"></div>
    `;
    seg.querySelector(".ko").textContent = text;
    captionsEl.appendChild(seg);
    captionsEl.scrollTop = captionsEl.scrollHeight;
    seg.querySelector(".explain-btn").onclick = () => explainSegment(seg, text);
    return;
  }

  // 영어 강의: 영어 원문 + 한국어 번역
  seg.innerHTML = `
    <div class="en"></div>
    <div class="ko pending">번역 중…</div>
    <button class="explain-btn">💡 설명</button>
    <div class="explanation hidden"></div>
  `;
  seg.querySelector(".en").textContent = text;
  captionsEl.appendChild(seg);
  captionsEl.scrollTop = captionsEl.scrollHeight;

  const koEl = seg.querySelector(".ko");
  try {
    const ko = await translate(text);
    koEl.textContent = ko;
  } catch (e) {
    koEl.textContent = "번역 실패: " + (e.message || e);
  }
  koEl.classList.remove("pending");
  captionsEl.scrollTop = captionsEl.scrollHeight;

  seg.querySelector(".explain-btn").onclick = () => explainSegment(seg, text);
}

async function explainSegment(seg, enText) {
  const el = seg.querySelector(".explanation");
  el.classList.remove("hidden");
  if (!aiOn()) {
    el.textContent =
      "💡 설명은 ⚙️ 설정에서 AI(Claude/GPT API 키 또는 내 Claude 계정)를 켜면 사용할 수 있어요.";
    return;
  }
  el.textContent = vision.active
    ? "설명 생성 중… (화면도 참고)"
    : "설명 생성 중…";
  const context = fullTranscript.slice(-6).join(" ");
  const r = await window.api.explain({
    text: enText,
    context,
    frames: currentFrames(),
  });
  el.textContent = r.ok ? r.text : "설명 실패: " + r.error;
  captionsEl.scrollTop = captionsEl.scrollHeight;
}

async function showSummary() {
  if (fullTranscript.length === 0) {
    alert("아직 기록된 내용이 없습니다.");
    return;
  }
  summaryPanel.classList.remove("hidden");
  if (!aiOn()) {
    summaryBody.textContent =
      "📝 요약은 ⚙️ 설정에서 AI(Claude/GPT API 키 또는 내 Claude 계정)를 켜면 사용할 수 있어요.";
    return;
  }
  summaryBody.textContent = "요약 생성 중…";
  const res = await window.api.summarize({
    transcript: fullTranscript.join(" "),
  });
  summaryBody.textContent = res.ok
    ? res.text + `\n\n(저장됨: ${res.file})`
    : "요약 실패: " + res.error;
}

// --- 화면 보기(영상/판서) ---
async function toggleVision() {
  if (vision.active) {
    vision.stop();
    visionBtn.classList.remove("active");
    visionBtn.textContent = "🖥️ 화면 보기";
    return;
  }
  try {
    await vision.start();
    vision.setOnEnded(() => {
      visionBtn.classList.remove("active");
      visionBtn.textContent = "🖥️ 화면 보기";
    });
    visionBtn.classList.add("active");
    visionBtn.textContent = "🖥️ 화면 보는 중";
    setStatus("화면 보기 켜짐 — 설명·질문에 슬라이드/판서를 참고해요");
  } catch (e) {
    setStatus("화면 보기 실패: " + friendlyError(e));
  }
}


toggleBtn.onclick = () => (running ? stop() : start());
summaryBtn.onclick = showSummary;
closeSummary.onclick = () => summaryPanel.classList.add("hidden");
refreshBtn.onclick = refreshDevices;
visionBtn.onclick = toggleVision;
chatBtn.onclick = () => window.api.openChat(); // 질문은 별도 창에서
settingsBtn.onclick = () => window.api.openSettings();
navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

setStatus("대기 중");
loadProvider(); // 제공자 상태 읽어 버튼/뱃지 반영
refreshDevices();
