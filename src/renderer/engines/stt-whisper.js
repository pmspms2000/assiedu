// 무료 음성인식: 노트북에서 직접 도는 Whisper (transformers.js)
// 키·비용 없음. 첫 실행 때 모델을 한 번 내려받아 캐시합니다.
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";
import { getAudioStream } from "./audio-source.js";

// 모델 캐시는 브라우저(Electron) 저장소 사용
env.allowLocalModels = false;

const SR = 16000; // Whisper 입력 샘플레이트
const FRAME = 4096; // ScriptProcessor 프레임 크기 (~256ms)
const SILENCE_RMS = 0.01; // 이 값 이하이면 '무음'으로 간주
const SILENCE_HANG_MS = 800; // 말이 이만큼 멈추면 (그리고 충분히 모였으면) 한 블록 확정
const MIN_SPEECH_SAMPLES = SR * 0.8; // 최소 0.8초 이상 말해야 처리
const MIN_BLOCK_SAMPLES = SR * 5; // 침묵으로 끊으려면 최소 5초는 모여야 함(여러 문장 묶기)
const MAX_CHUNK_SAMPLES = SR * 18; // 18초 넘으면 강제로 끊음

export function createWhisperSTT({ model, lang, source, onFinal, onStatus, onListening }) {
  let transcriber = null;
  let audioCtx = null;
  let srcNode = null;
  let processor = null;
  let stream = null;

  let chunk = []; // Float32Array 프레임들
  let chunkSamples = 0;
  let hasSpeech = false;
  let silentMs = 0;
  let busy = false;
  let active = false;

  function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  function concatChunk() {
    const out = new Float32Array(chunkSamples);
    let off = 0;
    for (const f of chunk) {
      out.set(f, off);
      off += f.length;
    }
    return out;
  }

  async function flush() {
    if (busy || chunkSamples < MIN_SPEECH_SAMPLES) {
      resetChunk();
      return;
    }
    busy = true;
    const audio = concatChunk();
    resetChunk();
    onStatus && onStatus("인식 중…");
    try {
      // 다국어 모델(한국어 등)은 언어를 고정해줘야 자동감지로 흔들리지 않음.
      // .en(영어전용) 모델은 옵션 없이 그대로.
      const opts =
        lang && lang !== "en" ? { language: lang, task: "transcribe" } : {};
      const result = await transcriber(audio, opts);
      const text = (result?.text || "").trim();
      // Whisper가 무음에서 흔히 뱉는 허깨비 출력 제거 (언어별)
      const junkEn = /^(you|thank you\.?|thanks for watching\.?|\.)$/i;
      const junkKo =
        /^(시청해\s*주셔서\s*감사합니다\.?|구독과?\s*좋아요\s*부탁드립니다\.?|다음\s*영상에서\s*(봐요|만나요|뵙겠습니다)\.?|\.)$/;
      const junk = lang === "ko" ? junkKo : junkEn;
      if (text && !junk.test(text)) onFinal(text);
    } catch (e) {
      onStatus && onStatus("인식 오류: " + (e.message || e));
    } finally {
      busy = false;
      if (active) onStatus && onStatus("듣는 중 🎙️");
    }
  }

  function resetChunk() {
    chunk = [];
    chunkSamples = 0;
    hasSpeech = false;
    silentMs = 0;
  }

  async function start() {
    onStatus && onStatus("모델 준비 중… (첫 실행은 다운로드로 시간 걸려요)");
    if (!transcriber) {
      try {
        transcriber = await pipeline(
          "automatic-speech-recognition",
          model,
          { device: "webgpu" }
        );
      } catch (e) {
        // WebGPU 불가 시 WASM(CPU)로 대체
        transcriber = await pipeline("automatic-speech-recognition", model);
      }
    }

    stream = await getAudioStream(source);
    audioCtx = new AudioContext({ sampleRate: SR });
    srcNode = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(FRAME, 1, 1);

    const frameMs = (FRAME / SR) * 1000;

    processor.onaudioprocess = (e) => {
      if (!active) return;
      const input = e.inputBuffer.getChannelData(0);
      const frame = new Float32Array(input); // 복사
      const level = rms(frame);

      chunk.push(frame);
      chunkSamples += frame.length;

      if (level > SILENCE_RMS) {
        hasSpeech = true;
        silentMs = 0;
      } else if (hasSpeech) {
        silentMs += frameMs;
      } else {
        // 아직 말 시작 전: 버퍼가 너무 커지지 않게 앞부분 버림(1초 프리롤만 유지)
        while (chunkSamples > SR) {
          chunkSamples -= chunk[0].length;
          chunk.shift();
        }
      }

      const should =
        hasSpeech &&
        ((silentMs >= SILENCE_HANG_MS && chunkSamples >= MIN_BLOCK_SAMPLES) ||
          chunkSamples >= MAX_CHUNK_SAMPLES);
      if (should && !busy) flush();
    };

    // 그래프 유지를 위해 destination 연결 (gain 0으로 자기 목소리 안 들리게)
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    srcNode.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);

    active = true;
    onListening && onListening();
    onStatus && onStatus("듣는 중 🎙️");
  }

  function stop() {
    active = false;
    if (processor) processor.onaudioprocess = null;
    if (srcNode) srcNode.disconnect();
    if (processor) processor.disconnect();
    if (audioCtx) audioCtx.close();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    resetChunk();
  }

  return { start, stop };
}
