import React, { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, Check, RotateCcw } from "lucide-react";
import { C } from "../theme";
import { Btn } from "./ui";

/* Live in-app camera. Opens the device webcam via getUserMedia, shows a
   preview, captures a still to a JPEG File, and hands it back through
   onCapture(file). Works on desktop browsers (laptop/USB webcam) and
   phones. Requires a secure context: https:// or localhost. */
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(null);     // { url, file } once captured
  const [devices, setDevices] = useState([]);
  const [deviceIdx, setDeviceIdx] = useState(0);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const start = async (deviceId) => {
    setError(""); setReady(false);
    stop();
    try {
      const constraints = {
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
      // Enumerate cameras (labels only populate after permission granted).
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDevices(list);
    } catch (e) {
      setError(
        e?.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in the browser and try again."
          : e?.name === "NotFoundError"
          ? "No camera found on this device."
          : (e?.message || "Could not open the camera.")
      );
    }
  };

  useEffect(() => {
    start();
    return stop; // cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const next = (deviceIdx + 1) % devices.length;
    setDeviceIdx(next);
    start(devices[next].deviceId);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      setShot({ url: URL.createObjectURL(blob), file });
      stop(); // freeze on the captured frame
    }, "image/jpeg", 0.9);
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    start(devices[deviceIdx]?.deviceId);
  };

  const use = () => {
    if (shot) { onCapture(shot.file); }
    if (shot) URL.revokeObjectURL(shot.url);
    onClose();
  };

  return (
    <div className="wb-fade-in flex items-center justify-center"
      style={{ position: "fixed", inset: 0, background: "rgba(15,42,59,.6)", backdropFilter: "blur(4px)", zIndex: 70, padding: 16 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="wb-modal-in"
        style={{ background: "#0E2A3D", borderRadius: 18, width: 540, maxWidth: "100%", overflow: "hidden", boxShadow: "0 30px 80px -20px rgba(0,0,0,.6)" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px" }}>
          <span className="inline-flex items-center gap-2" style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
            <Camera size={16} color={C.tealMid} /> {shot ? "Review photo" : "Take a photo"}
          </span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "none", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ position: "relative", background: "#000", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {error ? (
            <div style={{ color: "#FCA5A8", fontSize: 13.5, textAlign: "center", padding: 28, lineHeight: 1.6 }}>{error}</div>
          ) : shot ? (
            <img src={shot.url} alt="captured" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {!ready && !shot && !error && (
            <div style={{ position: "absolute", color: "#9FB5C5", fontSize: 13 }}>Starting camera…</div>
          )}
        </div>

        <div className="flex items-center justify-between" style={{ padding: "14px 18px", gap: 10 }}>
          {error ? (
            <>
              <Btn variant="outline" small onClick={onClose}>Close</Btn>
              <Btn variant="primary" small icon={RefreshCw} onClick={() => start()}>Retry</Btn>
            </>
          ) : shot ? (
            <>
              <Btn variant="outline" small icon={RotateCcw} onClick={retake}>Retake</Btn>
              <Btn variant="success" small icon={Check} onClick={use}>Use this photo</Btn>
            </>
          ) : (
            <>
              <button onClick={switchCamera} disabled={devices.length < 2} title="Switch camera"
                style={{ background: "rgba(255,255,255,.1)", color: devices.length < 2 ? "#5F7B8C" : "#fff", border: "none", width: 40, height: 40, borderRadius: 10, cursor: devices.length < 2 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <RefreshCw size={16} />
              </button>
              <button onClick={capture} disabled={!ready} title="Capture"
                style={{ background: ready ? C.teal : "#3A5568", color: "#fff", border: "4px solid rgba(255,255,255,.25)", width: 58, height: 58, borderRadius: "50%", cursor: ready ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Camera size={22} />
              </button>
              <div style={{ width: 40 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
