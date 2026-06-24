// 유료 음성인식: Deepgram 실시간 스트리밍 (저지연, 고정확)
import { getAudioStream } from "./audio-source.js";

export function createDeepgramSTT({
  sourceLang,
  source,
  onInterim,
  onFinal,
  onStatus,
  onListening,
}) {
  let stream = null;
  let recorder = null;
  let socket = null;
  let active = false;

  async function start() {
    onStatus && onStatus("마이크 요청 중…");
    stream = await getAudioStream(source);
    const key = await window.api.getDeepgramKey();

    const params = new URLSearchParams({
      model: "nova-3",
      language: sourceLang || "en",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
    });
    // 브라우저는 헤더를 못 보내므로 token 서브프로토콜로 인증
    socket = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ["token", key]
    );

    socket.onopen = () => {
      onStatus && onStatus("듣는 중 🎙️");
      onListening && onListening();
      recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket.readyState === WebSocket.OPEN)
          socket.send(e.data);
      };
      recorder.start(250);
    };

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      const text = data.channel?.alternatives?.[0]?.transcript;
      if (!text) return;
      if (data.is_final) onFinal(text);
      else onInterim && onInterim(text);
    };

    socket.onerror = () => onStatus && onStatus("STT 오류");
    socket.onclose = () => {
      if (active) onStatus && onStatus("연결 종료됨");
    };

    active = true;
  }

  function stop() {
    active = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  }

  return { start, stop };
}
