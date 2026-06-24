// 별도 질문 창: 메인(자막) 창의 자막 + 화면(판서)을 근거로 한국어 답변.
// 자막/화면 수집은 메인 프로세스가 자막 창에서 가져오고, 여기선 질문만 보냅니다.
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const statusEl = document.getElementById("status");

function addMsg(role, text, pending) {
  const el = document.createElement("div");
  el.className =
    "msg " + (role === "user" ? "user" : "bot") + (pending ? " pending" : "");
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

async function send() {
  const q = chatInput.value.trim();
  if (!q) return;
  chatInput.value = "";
  addMsg("user", q);

  const pendingEl = addMsg("bot", "생각 중…", true);
  statusEl.textContent = "답변 생성 중…";
  try {
    // 대화 기록은 메인 프로세스가 보관하므로 질문만 보냄
    const r = await window.api.ask({ question: q });
    pendingEl.classList.remove("pending");
    pendingEl.textContent = r.ok ? r.text : "답변 실패: " + r.error;
  } catch (e) {
    pendingEl.classList.remove("pending");
    pendingEl.textContent = "오류: " + (e.message || e);
  }
  statusEl.textContent = "자막·화면을 참고해 답해요";
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatSend.onclick = send;
chatInput.addEventListener("keydown", (e) => {
  // 한글 등 IME 조합 중의 Enter는 '글자 확정'이라 무시(중복 전송 방지)
  if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) send();
});

// 창을 다시 열면 메인 프로세스에 보관된 이전 대화를 복원
async function restore() {
  let msgs = [];
  try {
    msgs = (await window.api.getChatHistory()) || [];
  } catch (_) {}
  if (msgs.length) {
    msgs.forEach((m) => addMsg(m.role, m.text));
  } else {
    addMsg(
      "bot",
      "안녕하세요! 강의를 듣다가 궁금한 걸 물어보세요. 메인 창에서 🖥️ 화면 보기를 켜두면 슬라이드·판서까지 보고 답해드려요."
    );
  }
  chatInput.focus();
}
restore();
