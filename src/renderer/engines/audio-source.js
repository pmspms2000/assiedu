// 입력 소스에서 오디오 MediaStream 얻기
//  - { kind: "device", deviceId }  : 마이크/이어폰/외장/BlackHole 등 입력 장치
//  - { kind: "display" }           : 화면·영상의 시스템 오디오 (녹화 강의 등)
export async function getAudioStream(source) {
  if (source && source.kind === "display") {
    const full = await navigator.mediaDevices.getDisplayMedia({
      video: true, // 오디오 캡처를 위해 화면 선택이 필요
      audio: true,
    });
    full.getVideoTracks().forEach((t) => t.stop()); // 영상은 버리고 소리만 사용
    const audioTracks = full.getAudioTracks();
    if (audioTracks.length === 0) {
      full.getTracks().forEach((t) => t.stop());
      throw new Error(
        "선택한 화면/창에 소리가 없어요. 소리가 나는 창(영상 재생 중)을 고르거나, 공유 시 '시스템 오디오'를 켜세요."
      );
    }
    return new MediaStream(audioTracks);
  }
  const audio =
    source && source.deviceId ? { deviceId: { exact: source.deviceId } } : true;
  return navigator.mediaDevices.getUserMedia({ audio });
}
