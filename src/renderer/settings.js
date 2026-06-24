// 설정 창: 제공자 선택 + API 키 입력. 키는 메인 프로세스에서 암호화 저장.
const anthropicKey = document.getElementById("anthropicKey");
const openaiKey = document.getElementById("openaiKey");
const cliOpt = document.getElementById("cliOpt");
const codexOpt = document.getElementById("codexOpt");
const encWarn = document.getElementById("encWarn");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

function setProvider(p) {
  const el = document.querySelector(`input[name="provider"][value="${p}"]`);
  if (el) el.checked = true;
}
function getProvider() {
  const el = document.querySelector('input[name="provider"]:checked');
  return el ? el.value : "free";
}

async function init() {
  let s = {};
  try {
    s = await window.api.getSettings();
  } catch (_) {}
  // CLI 옵션은 해당 도구가 설치돼 있을 때만 노출
  if (s.cliAvailable) cliOpt.style.display = "";
  if (s.codexAvailable) codexOpt.style.display = "";
  setProvider(s.provider || "free");
  if (s.hasAnthropic) anthropicKey.placeholder = "●●●●●●  저장됨 (바꾸려면 새로 입력)";
  if (s.hasOpenai) openaiKey.placeholder = "●●●●●●  저장됨 (바꾸려면 새로 입력)";
  if (s.encryptionAvailable === false) encWarn.classList.remove("hidden");
}

async function save() {
  const provider = getProvider();
  saveStatus.textContent = "저장 중…";
  try {
    await window.api.setSettings({
      provider,
      anthropicKey: anthropicKey.value, // 비어 있으면 기존 키 유지
      openaiKey: openaiKey.value,
    });
    anthropicKey.value = "";
    openaiKey.value = "";
    saveStatus.textContent = "저장됨 ✓ — 자막 창에 적용되었습니다.";
    init(); // 저장됨 표시 갱신
  } catch (e) {
    saveStatus.textContent = "저장 실패: " + (e.message || e);
  }
}

saveBtn.onclick = save;

// "키 발급" 링크는 기본 브라우저로 열기
document.querySelectorAll(".link[data-url]").forEach((b) => {
  b.onclick = () => window.api.openExternal(b.dataset.url);
});

init();
