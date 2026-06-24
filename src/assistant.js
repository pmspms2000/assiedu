// 'cli' 제공자: 이 컴퓨터에 로그인된 Claude(Claude Code)로 처리. 별도 API 키 불필요.
// 프롬프트는 stdin으로 전달(따옴표/개행/한글 문제 회피), 이미지는 임시파일+Read로 봄.
// Windows/macOS/Linux 공용.
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
      process.env.CLAUDE_CLI_PATH,
      path.join(home, ".local", "bin", "claude.exe"),
      path.join(home, "AppData", "Roaming", "npm", "claude.cmd"),
      path.join(home, "AppData", "Local", "Programs", "claude", "claude.exe"),
    ].filter(Boolean);
  }
  return [
    process.env.CLAUDE_CLI_PATH,
    path.join(home, ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
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
  cliPath = isWin ? "claude.cmd" : "claude";
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

// 임시 프레임 파일 (claude가 Read로 읽음)
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
      const f = path.join(FRAMES_DIR, `f-${seq++}-${i}.${ext}`);
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

function spawnClaude(prompt, { model, addDir, timeout = 120000 }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "text",
      "--allowedTools",
      "Read",
      "--strict-mcp-config",
    ];
    if (addDir) args.push("--add-dir", addDir);
    if (model) args.push("--model", model);
    let child;
    try {
      child = spawn(resolveCli(), args, { env: enrichedEnv(), shell: isWin });
    } catch (e) {
      return reject(e);
    }
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
      reject(new Error("응답이 너무 오래 걸려 중단했어요. 다시 시도해 주세요."));
    }, timeout);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new Error("이 컴퓨터에서 Claude(claude)를 찾지 못했어요. Claude Code 설치·로그인이 필요합니다.")
          : e
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve((out || "").trim());
      else reject(new Error((err || "").trim() || "claude 종료 코드 " + code));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function imageInstr(paths) {
  return (
    "\n\n[학생이 보고 있는 강의 화면(슬라이드/판서) 이미지]\n" +
    "아래 파일들을 Read 도구로 열어 내용을 반드시 참고하세요:\n" +
    paths.map((p) => `- ${p}`).join("\n")
  );
}

// 범용 실행: 완성된 프롬프트 + (선택)이미지 → 텍스트
async function run({ prompt, frames, model }) {
  const imagePaths = writeFrames(frames);
  let p = prompt;
  if (imagePaths.length) p += imageInstr(imagePaths);
  try {
    return await spawnClaude(p, {
      model,
      addDir: imagePaths.length ? path.dirname(imagePaths[0]) : undefined,
    });
  } finally {
    cleanup(imagePaths);
  }
}

module.exports = { run, isAvailable };
