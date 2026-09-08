// 렌더러: 설정(제공자)에 따라 엔진을 골라 연결하고 UI를 그립니다.
import { createWhisperSTT } from "./engines/stt-whisper.js";
import { freeTranslate, providerTranslateBatch } from "./engines/translate.js";
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
const opacity = document.getElementById("opacity");
const opacityVal = document.getElementById("opacityVal");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");
const exportCopy = document.getElementById("exportCopy");
const exportSave = document.getElementById("exportSave");
const exportPrompt = document.getElementById("exportPrompt");
const lectureBtn = document.getElementById("lectureBtn");

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

// 무료 모드 번역: 문장마다 MyMemory (AI 모드는 아래 묶음 번역 큐 사용)
function translateFreeSeg(text) {
  return freeTranslate(text, {
    sourceLang: CONFIG.sourceLang,
    targetLang: CONFIG.targetLang,
    email: CONFIG.myMemoryEmail,
  });
}

// --- AI 번역 묶음 큐 ---
// Claude CLI는 호출 1회당 약 3초 고정비용 → 문장마다 부르면 강의를 못 따라감.
// 영어 자막은 즉시 띄우고, N문장 모이거나 일정 시간이 지나면 한 번에 번역.
const tq = { items: [], timer: null, running: false, drain: false };

function enqueueTranslate(seg, text) {
  tq.items.push({ seg, text });
  const size = CONFIG.translateBatchSize || 4;
  if (tq.items.length >= size) flushTranslateBatch();
  else if (!tq.timer)
    tq.timer = setTimeout(flushTranslateBatch, CONFIG.translateBatchWaitMs || 15000);
}

// force=true(정지 시): 남은 문장을 전부 이어서 번역
async function flushTranslateBatch(force) {
  clearTimeout(tq.timer);
  tq.timer = null;
  if (force === true) tq.drain = true;
  if (tq.items.length === 0) {
    tq.drain = false;
    return;
  }
  if (tq.running) return; // 진행 중이면 끝난 뒤 finally에서 이어서 처리
  const batch = tq.items.splice(0, 8); // 한 번에 최대 8문장
  tq.running = true;
  const koOf = (b) => b.seg.querySelector(".ko");
  batch.forEach((b) => {
    const k = koOf(b);
    if (k) k.textContent = "번역 중…";
  });
  try {
    const kos = await providerTranslateBatch(batch.map((b) => b.text));
    batch.forEach((b, i) => {
      const k = koOf(b);
      if (!k) return;
      k.textContent = kos[i] || "(번역 없음)";
      k.classList.remove("pending");
    });
  } catch (e) {
    batch.forEach((b) => {
      const k = koOf(b);
      if (!k) return;
      k.textContent = "번역 실패: " + (e.message || e);
      k.classList.remove("pending");
    });
  } finally {
    tq.running = false;
    captionsEl.scrollTop = captionsEl.scrollHeight;
    // 번역하는 동안 쌓인 문장: 정지 중이거나 충분히 모였으면 바로, 아니면 타이머로
    const size = CONFIG.translateBatchSize || 4;
    if (tq.items.length === 0) tq.drain = false;
    else if (tq.drain || tq.items.length >= size) flushTranslateBatch();
    else if (!tq.timer)
      tq.timer = setTimeout(flushTranslateBatch, CONFIG.translateBatchWaitMs || 15000);
  }
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
  flushTranslateBatch(true); // 아직 번역 안 된 문장은 지금 바로
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

  seg.querySelector(".explain-btn").onclick = () => explainSegment(seg, text);

  const koEl = seg.querySelector(".ko");
  if (aiOn()) {
    // AI 모드: 영어는 이미 떴고, 번역은 모아서 한 번에
    koEl.textContent = "번역 대기 중…";
    enqueueTranslate(seg, text);
    return;
  }
  // 무료 모드: 문장마다 MyMemory
  try {
    koEl.textContent = await translateFreeSeg(text);
  } catch (e) {
    koEl.textContent = "번역 실패: " + (e.message || e);
  }
  koEl.classList.remove("pending");
  captionsEl.scrollTop = captionsEl.scrollHeight;
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

// --- 전체 내보내기 (무료 모드 사용자가 웹 AI에 통째로 붙여넣기 좋게) ---
const pad2 = (n) => String(n).padStart(2, "0");
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function exportFileName() {
  const d = new Date();
  return `강의기록-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
    d.getDate()
  )}-${pad2(d.getHours())}${pad2(d.getMinutes())}.md`;
}

// 화면의 자막을 마크다운으로 직조 (렌더된 번역/설명을 그대로 사용)
function buildExport(withPrompt) {
  const segs = [...captionsEl.querySelectorAll(".segment")];
  if (segs.length === 0) return null;
  const ko = activeLectureLang === "ko";
  const lines = [
    "# AssiEdu 강의 기록",
    `날짜: ${nowStamp()}`,
    `강의: ${ko ? "한국어(받아쓰기)" : "영어 → 한국어 번역"}`,
    "",
    "## 강의 내용",
    "",
  ];
  segs.forEach((s, i) => {
    const en = s.querySelector(".en");
    const koEl = s.querySelector(".ko");
    const exp = s.querySelector(".explanation");
    if (ko) {
      lines.push(`${i + 1}. ${koEl ? koEl.textContent.trim() : ""}`);
    } else {
      lines.push(`${i + 1}. ${en ? en.textContent.trim() : ""}`);
      const t = koEl ? koEl.textContent.trim() : "";
      if (t && !koEl.classList.contains("pending")) lines.push(`   → ${t}`);
    }
    if (exp && !exp.classList.contains("hidden") && exp.textContent.trim())
      lines.push(`   💡 ${exp.textContent.trim()}`);
  });
  if (withPrompt) {
    lines.push(
      "",
      "---",
      "",
      "위 강의 내용을 바탕으로 한국어로 정리해줘:",
      "1. 핵심 내용 요약 (불릿으로)",
      "2. 어려운 용어·개념 쉬운 설명",
      "3. 시험에 나올 만한 포인트"
    );
  }
  return lines.join("\n");
}

async function doExportCopy() {
  const text = buildExport(exportPrompt.checked);
  exportMenu.classList.add("hidden");
  if (!text) {
    setStatus("내보낼 자막이 없어요");
    return;
  }
  await window.api.copyText(text);
  setStatus("📋 전체 복사됨 — 웹 AI 창에 붙여넣기 하세요");
}

async function doExportSave() {
  const text = buildExport(exportPrompt.checked);
  exportMenu.classList.add("hidden");
  if (!text) {
    setStatus("내보낼 자막이 없어요");
    return;
  }
  const r = await window.api.saveExport({
    text,
    defaultName: exportFileName(),
  });
  if (r.ok) setStatus("💾 저장됨: " + r.file);
  else if (!r.canceled) setStatus("저장 실패: " + (r.error || ""));
}

// --- 강의안 PDF (번역·설명·질문·요약의 참고자료) ---
function applyLecture(info) {
  if (info && info.loaded) {
    const short = info.name.length > 14 ? info.name.slice(0, 12) + "…" : info.name;
    lectureBtn.textContent = "📎 " + short;
    lectureBtn.classList.add("active");
    lectureBtn.title =
      "강의안: " + info.name + " (" + info.pages + "쪽)" +
      (info.hasGlossary
        ? " · 용어집 준비됨"
        : aiOn()
          ? " · 용어집 생성 중…"
          : " · 텍스트만(무료 모드)") +
      "\n다시 누르면 해제";
  } else {
    lectureBtn.textContent = "📎 강의안";
    lectureBtn.classList.remove("active");
    lectureBtn.title = "강의안 PDF를 넣으면 번역·설명·질문·요약에 참고합니다";
  }
}

async function toggleLecture() {
  const cur = await window.api.getLectureInfo();
  if (cur && cur.loaded) {
    await window.api.clearLecturePdf();
    setStatus("강의안 해제됨");
    return;
  }
  const r = await window.api.loadLecturePdf();
  if (r.ok)
    setStatus(
      "강의안 로드됨: " + r.name + " (" + r.pages + "쪽)" +
        (aiOn() ? " — 용어집 생성 중…" : "")
    );
  else if (!r.canceled) setStatus("강의안 로드 실패: " + r.error);
}

window.api.onLectureChanged((info) => {
  applyLecture(info);
  if (info && info.loaded && info.hasGlossary)
    setStatus("강의안 용어집 준비됨 — 번역·설명에 참고해요");
});

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
lectureBtn.onclick = toggleLecture;
exportBtn.onclick = (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle("hidden");
};
exportMenu.addEventListener("click", (e) => e.stopPropagation()); // 메뉴 내부 클릭은 닫지 않음
document.addEventListener("click", () => exportMenu.classList.add("hidden"));
exportCopy.onclick = doExportCopy;
exportSave.onclick = doExportSave;
opacity.addEventListener("input", () => {
  const pct = Number(opacity.value);
  opacityVal.textContent = pct + "%";
  window.api.setOpacity(pct / 100);
});
navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

setStatus("대기 중");
loadProvider(); // 제공자 상태 읽어 버튼/뱃지 반영
window.api.getLectureInfo().then(applyLecture); // 강의안 로드 여부 버튼에 반영
refreshDevices();
