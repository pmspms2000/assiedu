// 'codex' 제공자: 이 컴퓨터에 로그인된 OpenAI Codex CLI로 처리.
// `codex login`으로 ChatGPT 계정 로그인 시 별도 API 키 없이 구독으로 사용 가능.
// 프롬프트는 stdin, 이미지는 `--image <file>` 로 첨부. Windows/macOS/Linux 공용.
// 주의: 이 환경엔 codex가 없어 미검증 — 설치 후 동작 확인 필요(플래그가 다르면 조정).
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";
let cliPath = null;

function candidates() {
  const home = os.homedir();
  if (isWin) {
    return [
      process.env.CODEX_CLI_PATH,
      path.join(home, ".local", "bin", "codex.exe"),
      path.join(home, "AppData", "Roaming", "npm", "codex.cmd"),
      path.join(home, "AppData", "Local", "Programs", "codex", "codex.exe"),
    ].filter(Boolean);
  }
  return [
    process.env.CODEX_CLI_PATH,
    path.join(home, ".local/bin/codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ].filter(Boolean);
}

function resolveCli() {
  if (cliPath) return cliPath;
  for (const c of candidates()) {
    try {
      if (fs.existsSync(c)) {
        cliPath = c;
        return c;
      }
    } catch (_) {}
  }
  cliPath = isWin ? "codex.cmd" : "codex";
  return cliPath;
}

function enrichedEnv() {
  const home = os.homedir();
  const extra = isWin
    ? [path.join(home, ".local", "bin"), path.join(home, "AppData", "Roaming", "npm")]
    : [path.join(home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  const PATH = [process.env.PATH || "", ...extra].filter(Boolean).join(path.delimiter);
  return { ...process.env, PATH };
}

function isAvailable() {
  return candidates().some((c) => {
    try {
      return fs.existsSync(c);
    } catch (_) {
      return false;
    }
  });
}

const FRAMES_DIR = path.join(os.tmpdir(), "assiedu-frames");
let seq = 0;
function writeFrames(frames) {
  if (!frames || !frames.length) return [];
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  return frames
    .map((d, i) => {
      const m = /^data:(image\/\w+);base64,(.+)$/s.exec(d || "");
      if (!m) return null;
      const ext = m[1] === "image/jpeg" ? "jpg" : m[1].split("/")[1];
      const f = path.join(FRAMES_DIR, `cx-${seq++}-${i}.${ext}`);
      fs.writeFileSync(f, Buffer.from(m[2], "base64"));
      return f;
    })
    .filter(Boolean);
}
function cleanup(paths) {
  for (const p of paths || []) {
    try {
      fs.unlinkSync(p);
    } catch (_) {}
  }
}

function spawnCodex(prompt, { model, imagePaths, timeout = 120000 }) {
  return new Promise((resolve, reject) => {
    // 최종 답변만 파일로 받음(stdout엔 세션 로그가 섞임).
    const outFile = path.join(os.tmpdir(), `assiedu-codex-${process.pid}-${seq++}.txt`);
    // 비대화형: read-only 샌드박스(승인 프롬프트 없음), git repo 밖에서도 실행, 세션 미저장.
    const args = [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
      "-o",
      outFile,
    ];
    for (const p of imagePaths || []) args.push("--image", p);
    if (model) args.push("--model", model);
    // 격리된 빈 작업폴더에서 실행(에이전트가 주변 파일을 뒤지지 않게)
    const cwd = path.join(os.tmpdir(), "assiedu-codex-cwd");
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch (_) {}
    let child;
    try {
      child = spawn(resolveCli(), args, { env: enrichedEnv(), shell: isWin, cwd });
    } catch (e) {
      return reject(e);
    }
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
      reject(new Error("응답이 너무 오래 걸려 중단했어요. 다시 시도해 주세요."));
    }, timeout);
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", () => {}); // drain
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new Error("이 컴퓨터에서 Codex(codex)를 찾지 못했어요. Codex CLI 설치·로그인이 필요합니다.")
          : e
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let text = "";
      try {
        text = fs.readFileSync(outFile, "utf8").trim();
      } catch (_) {}
      try {
        fs.unlinkSync(outFile);
      } catch (_) {}
      if (text) return resolve(text);
      reject(new Error((err || "").trim() || "codex 응답을 받지 못했어요 (종료 코드 " + code + ")"));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function run({ prompt, model }) {
  // 참고: codex 헤드리스 실행은 이미지(vision)가 안정적으로 전달되지 않아 텍스트만 사용.
  // 화면/판서를 보려면 Claude 로그인(cli) 또는 OpenAI/Claude API 키를 쓰세요.
  return spawnCodex(prompt, { model, imagePaths: [] });
}

module.exports = { run, isAvailable };
