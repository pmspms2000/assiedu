// Electron 메인 프로세스: 창 생성, 설정/키 관리, AI 제공자 라우팅
const path = require("path");
const fs = require("fs");
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
  desktopCapturer,
  shell,
  dialog,
  clipboard,
} = require("electron");
const settings = require("./settings");
const ai = require("./ai");

let win = null;

// 강의안(PDF) — 번역·설명·질문·요약의 참고자료. 앱 종료 시까지 메모리에 보관
let lecture = null; // { name, pages, text, glossary }
function lectureInfo() {
  return lecture
    ? {
        loaded: true,
        name: lecture.name,
        pages: lecture.pages,
        chars: lecture.text.length,
        hasGlossary: !!lecture.glossary,
      }
    : { loaded: false };
}
function broadcastLecture() {
  const info = lectureInfo();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("lecture-changed", info);
  }
}
// 번역용: 압축 용어집만(짧아서 지연 없음) / 질문·요약용: 용어집 + 본문 일부
function lectureRefShort() {
  return lecture ? lecture.glossary || "" : "";
}
function lectureRefLong() {
  if (!lecture) return "";
  const head = lecture.glossary ? lecture.glossary + "\n\n" : "";
  return head + "[강의안 본문(일부)]\n" + lecture.text.slice(0, 20000);
}

// 설정 변경을 모든 창에 알림 → 렌더러가 제공자별 UI를 갱신
function broadcastSettings() {
  const view = settings.publicView();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("settings-changed", view);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 720,
    title: "AssiEdu",
    alwaysOnTop: true, // 수업 화면 위에 떠 있게
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 렌더러 콘솔/로드 오류를 메인 로그로 출력 (디버깅용)
  win.webContents.on("console-message", (_e, level, message, line, src) => {
    console.log(`[renderer:${level}] ${message} (${src}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.log(`[did-fail-load] ${code} ${desc}`);
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

let chatWin = null;
// 질문 창을 껐다 켜도 유지되도록 대화 기록을 메인 프로세스에 보관(앱 종료 시까지)
let chatMessages = []; // [{ role:"user"|"bot", text }]

// 질문 전용 별도 창 — 자막 창 옆에 떠서 나란히 볼 수 있게
function createChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }
  const b = win ? win.getBounds() : { x: 120, y: 120, width: 480, height: 720 };
  chatWin = new BrowserWindow({
    width: 420,
    height: 620,
    x: b.x + b.width + 16,
    y: b.y,
    title: "AssiEdu — 질문",
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  chatWin.loadFile(path.join(__dirname, "renderer", "chat.html"));
  chatWin.on("closed", () => {
    chatWin = null;
  });
}

let settingsWin = null;
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 580,
    title: "AssiEdu — 설정",
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

app.whenReady().then(async () => {
  // 마이크 권한: macOS OS 단 권한 요청 + Electron 내 media 권한 허용
  try {
    await systemPreferences.askForMediaAccess("microphone");
  } catch (_) {}
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media");
  });

  // 화면·시스템 오디오 캡처(녹화 강의 소리) — getDisplayMedia 요청 처리.
  // 시스템 피커를 거치지 않고 첫 화면 + 시스템 오디오(loopback)를 바로 가져옴.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => {
        callback({ video: sources[0], audio: "loopback" });
      })
      .catch(() => callback({}));
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- IPC 핸들러 ---

// --- 설정(제공자/키) ---
ipcMain.handle("open-settings", () => createSettingsWindow());
ipcMain.handle("open-external", (_e, url) => {
  if (/^https?:\/\//.test(url || "")) shell.openExternal(url);
});

// 요청한 창의 투명도 조절(강의 화면이 비쳐 보이게)
ipcMain.handle("set-opacity", (e, v) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setOpacity(Math.max(0.2, Math.min(1, Number(v) || 1)));
});
ipcMain.handle("get-settings", () => ({
  ...settings.publicView(),
  cliAvailable: ai.cliAvailable(),
  codexAvailable: ai.codexAvailable(),
}));
ipcMain.handle("set-settings", (_e, p) => {
  const patch = { provider: p.provider || "free", model: p.model || "" };
  // 키 입력란이 비어 있으면 기존 키 유지(=변경 안 함)
  if (typeof p.anthropicKey === "string" && p.anthropicKey.trim())
    patch.anthropicKey = p.anthropicKey.trim();
  if (typeof p.openaiKey === "string" && p.openaiKey.trim())
    patch.openaiKey = p.openaiKey.trim();
  // 키 비우기 요청
  if (p.clearAnthropic) patch.anthropicKey = "";
  if (p.clearOpenai) patch.openaiKey = "";
  settings.save(patch);
  broadcastSettings();
  return settings.publicView();
});

// 실시간 번역 — 사용자가 고른 제공자(Claude/GPT/CLI)
ipcMain.handle("translate", async (_e, { text }) => {
  try {
    return { ok: true, text: await ai.translate({ text }) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// 용어/개념 설명 — 현재 화면 이미지(슬라이드/판서)도 함께 참고
ipcMain.handle("explain", async (_e, { text, context, frames }) => {
  try {
    return {
      ok: true,
      text: await ai.explain({ text, context, frames, reference: lectureRefShort() }),
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// 별도 질문 창 토글 — 누르면 열리고, 떠 있으면 닫힘 (대화 기록은 메인에 유지됨)
ipcMain.handle("open-chat", () => {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.close();
    return;
  }
  createChatWindow();
});

// 질문 창이 다시 열릴 때 이전 대화를 복원할 수 있게 기록 제공
ipcMain.handle("get-chat-history", () => chatMessages);

// 챗봇 — 자막 창에서 현재 자막+화면(판서)을 가져와, 이전 대화와 함께 답변
ipcMain.handle("ask", async (_e, { question }) => {
  let transcript = "";
  let frames = [];
  try {
    if (win && !win.isDestroyed()) {
      const ctx = await win.webContents.executeJavaScript(
        "window.__assieduContext ? window.__assieduContext() : null"
      );
      if (ctx) {
        transcript = ctx.transcript || "";
        if (ctx.frame) frames = [ctx.frame];
      }
    }
  } catch (_) {}
  const history = chatMessages.slice(-6); // 현재 질문 직전까지의 대화
  try {
    const out = await ai.ask({
      question,
      transcript,
      history,
      frames,
      reference: lectureRefLong(),
    });
    // 성공한 대화만 기록에 추가(껐다 켜도 유지)
    chatMessages.push({ role: "user", text: question });
    chatMessages.push({ role: "bot", text: out });
    return { ok: true, text: out };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// 묶음 번역 — 영어 자막은 렌더러가 즉시 띄우고, 여러 문장을 모아 한 번에 번역(강의안 용어집 참고)
ipcMain.handle("translate-batch", async (_e, { texts }) => {
  try {
    const out = await ai.translateBatch({
      texts: texts || [],
      reference: lectureRefShort(),
    });
    return { ok: true, texts: out };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// --- 강의안 PDF ---
ipcMain.handle("get-lecture-info", () => lectureInfo());
ipcMain.handle("clear-lecture-pdf", () => {
  lecture = null;
  broadcastLecture();
  return lectureInfo();
});
ipcMain.handle("load-lecture-pdf", async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: "강의안 PDF 선택",
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  const file = filePaths[0];
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(fs.readFileSync(file));
    const text = String(data.text || "").replace(/[ \t]+\n/g, "\n").trim();
    if (!text) throw new Error("PDF에서 텍스트를 찾지 못했어요 (스캔 이미지 PDF일 수 있음)");
    lecture = { name: path.basename(file), pages: data.numpages || 0, text, glossary: "" };
    broadcastLecture();
    // 용어집은 AI가 있을 때만, 응답을 기다리지 않고 뒤에서 생성 → 완료되면 알림
    if (ai.provider() !== "free") {
      const mine = lecture;
      ai.buildGlossary({ text })
        .then((g) => {
          if (lecture === mine) {
            lecture.glossary = g || "";
            broadcastLecture();
          }
        })
        .catch(() => {});
    }
    return { ok: true, ...lectureInfo() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// 전체 번역/받아쓰기 내보내기 — 클립보드 복사 (웹 AI에 바로 붙여넣기용)
ipcMain.handle("copy-text", (_e, text) => {
  clipboard.writeText(String(text || ""));
  return { ok: true };
});

// 전체 내보내기 — 사용자가 원하는 위치에 파일로 저장
ipcMain.handle("save-export", async (e, { text, defaultName }) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(w, {
      title: "강의 기록 저장",
      // 마지막으로 저장한 폴더에서 시작 — 강의별 폴더에 모아두기 편하게
      defaultPath: path.join(
        settings.load().lastExportDir || app.getPath("documents"),
        defaultName || "강의기록.md"
      ),
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "텍스트", extensions: ["txt"] },
      ],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, String(text || ""), "utf8");
    settings.save({ lastExportDir: path.dirname(filePath) }); // 다음 저장은 이 폴더에서
    return { ok: true, file: filePath };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("summarize", async (_e, { transcript }) => {
  try {
    const summary = await ai.summarize({ transcript, reference: lectureRefLong() });
    // 요약본을 파일로도 저장
    const dir = path.join(app.getPath("documents"), "AssiEdu");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `summary-${stamp}.md`);
    fs.writeFileSync(file, summary, "utf8");
    return { ok: true, text: summary, file };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
