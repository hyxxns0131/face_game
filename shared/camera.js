// 웹캠 켜기 / 끄기
let stream = null;

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("이 브라우저는 카메라를 지원하지 않아요.");
    err.name = "Unsupported";
    throw err;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
  }
}

export function stopCamera(video) {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}
