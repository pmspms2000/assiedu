// 화면 보기: 학생이 보는 강의 화면(영상/슬라이드/판서)을 캡처해 두고,
// 필요할 때(설명·질문) 현재 프레임 한 장을 JPEG(base64)로 뽑아 줍니다.
export function createScreenVision() {
  let stream = null;
  let video = null;
  let canvas = null;
  let active = false;
  let onEnded = null;

  async function start() {
    // 메인 프로세스의 setDisplayMediaRequestHandler 가 첫 화면을 자동 선택합니다.
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
    // 혹시 오디오 트랙이 딸려오면 버림(여긴 화면만 필요)
    stream.getAudioTracks().forEach((t) => t.stop());

    video = document.createElement("video");
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video.muted = true;
    await video.play();

    canvas = document.createElement("canvas");
    active = true;

    const track = stream.getVideoTracks()[0];
    if (track)
      track.addEventListener("ended", () => {
        active = false;
        onEnded && onEnded();
      });
  }

  // 현재 화면 프레임 1장 → JPEG dataURL (없으면 null)
  function grab(maxW = 1280, quality = 0.7) {
    if (!active || !video || !video.videoWidth) return null;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  function stop() {
    active = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
  }

  return {
    start,
    stop,
    grab,
    setOnEnded: (fn) => (onEnded = fn),
    get active() {
      return active;
    },
  };
}
