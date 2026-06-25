// 렌더러에 안전한 API만 노출
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // 설정(제공자/키)
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (payload) => ipcRenderer.invoke("set-settings", payload),
  openSettings: () => ipcRenderer.invoke("open-settings"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  // 이 창의 투명도 조절 (0~1)
  setOpacity: (v) => ipcRenderer.invoke("set-opacity", v),
  onSettingsChanged: (cb) =>
    ipcRenderer.on("settings-changed", (_e, view) => cb(view)),
  // payload: { text }
  translate: (payload) => ipcRenderer.invoke("translate", payload),
  // payload: { text, context, frames:[dataURL], model }
  explain: (payload) => ipcRenderer.invoke("explain", payload),
  // payload: { question, transcript, history, frames:[dataURL], model }
  ask: (payload) => ipcRenderer.invoke("ask", payload),
  // payload: { transcript, model }
  summarize: (payload) => ipcRenderer.invoke("summarize", payload),
  // 별도 질문 창 열기
  openChat: () => ipcRenderer.invoke("open-chat"),
  // 질문 창 재오픈 시 이전 대화 복원
  getChatHistory: () => ipcRenderer.invoke("get-chat-history"),
  // 전체 내보내기: 클립보드 복사 / 위치 선택 후 파일 저장
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  saveExport: (payload) => ipcRenderer.invoke("save-export", payload),
});
