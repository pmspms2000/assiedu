// 사용자 설정 저장(제공자 선택 + API 키). 키는 OS 키체인으로 암호화(safeStorage).
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

let cache = null;

function file() {
  return path.join(app.getPath("userData"), "settings.json");
}

function decrypt(b64) {
  if (!b64) return "";
  try {
    if (safeStorage.isEncryptionAvailable())
      return safeStorage.decryptString(Buffer.from(b64, "base64"));
  } catch (_) {}
  return "";
}

function encrypt(s) {
  if (!s) return "";
  try {
    if (safeStorage.isEncryptionAvailable())
      return safeStorage.encryptString(s).toString("base64");
  } catch (_) {}
  return ""; // 암호화 불가 환경에선 키를 평문 저장하지 않음
}

function load() {
  if (cache) return cache;
  cache = { provider: "free", model: "", anthropicKey: "", openaiKey: "" };
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8"));
    cache.provider = raw.provider || "free";
    cache.model = raw.model || "";
    cache.anthropicKey = decrypt(raw.anthropicKeyEnc);
    cache.openaiKey = decrypt(raw.openaiKeyEnc);
  } catch (_) {}
  return cache;
}

function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  cache = next;
  const out = {
    provider: next.provider || "free",
    model: next.model || "",
    anthropicKeyEnc: encrypt(next.anthropicKey),
    openaiKeyEnc: encrypt(next.openaiKey),
  };
  try {
    fs.writeFileSync(file(), JSON.stringify(out, null, 2), "utf8");
  } catch (_) {}
  return next;
}

// 렌더러에 노출해도 안전한 형태(실제 키 값은 제외)
function publicView() {
  const s = load();
  return {
    provider: s.provider,
    model: s.model || "",
    hasAnthropic: !!s.anthropicKey,
    hasOpenai: !!s.openaiKey,
    encryptionAvailable: (() => {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch (_) {
        return false;
      }
    })(),
  };
}

module.exports = { load, save, publicView };
