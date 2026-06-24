# AssiEdu 빌드 — 맥 & 윈도우 앱 만들기

음성 인식(Whisper)은 무료로 공용 작동하고, 번역·설명·요약·질문은 ⚙️ 설정에서
각자 고른 제공자(무료 / Claude 키 / GPT 키 / 내 PC의 Claude·Codex 로그인)로 동작합니다.
코드는 맥·윈도우 공용입니다. 설치파일만 각 OS에서 만들면 됩니다.

## 결과물

- **맥**: `dist-app/AssiEdu-<버전>-arm64.dmg` (드래그해서 설치)
- **윈도우**: `dist-app/AssiEdu Setup <버전>.exe` (더블클릭 설치, 시작메뉴/바탕화면 바로가기 생성)

---

## 방법 A — GitHub Actions로 맥·윈도우 동시 빌드 (윈도우 PC 없이도 가능, 권장)

1. 이 폴더를 GitHub 저장소로 올립니다(최초 1회):
   ```bash
   git init
   git add -A
   git commit -m "AssiEdu"
   gh repo create assiedu --private --source=. --push   # gh CLI 사용 시
   # 또는 GitHub에서 빈 저장소 만들고 git remote add origin ... && git push -u origin main
   ```
2. GitHub 저장소 → **Actions** 탭 → "Build apps (mac + windows)" → **Run workflow**.
3. 빌드가 끝나면 그 실행 페이지 하단 **Artifacts** 에서
   `AssiEdu-mac`(.dmg)과 `AssiEdu-windows`(.exe)를 내려받습니다.

> `.github/workflows/build.yml` 가 맥·윈도우 러너에서 각각 빌드합니다. 코드 서명은
> 하지 않으므로(개인용) 처음 실행 시 OS 보안 경고는 "열기/실행"으로 통과하면 됩니다.

---

## 방법 B — 각 OS에서 직접 빌드

공통: [Node.js 20+](https://nodejs.org) 설치 후 프로젝트 폴더에서 `npm install`.

### 맥
```bash
npm install
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac
```

### 윈도우 (윈도우 PC에서)
```powershell
npm install
npm run dist:win
```

---

## 첫 실행 시 (서명 안 한 앱)

- **맥**: 앱 우클릭 → 열기 → 열기. 마이크/화면 기록 권한 허용.
- **윈도우**: SmartScreen 경고 시 "추가 정보" → "실행". 마이크 권한 허용.

## "내 PC의 Claude/Codex" 옵션을 쓰려면

해당 CLI가 그 컴퓨터에 설치·로그인돼 있어야 설정에 옵션이 나타납니다.
- Claude: [Claude Code](https://claude.com/claude-code) 설치 후 로그인
- Codex: OpenAI Codex CLI 설치 후 `codex login`(ChatGPT 계정)

없는 사용자는 API 키를 입력하거나 무료 모드로 사용하면 됩니다.
