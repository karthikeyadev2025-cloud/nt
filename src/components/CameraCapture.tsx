import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Check, X } from 'lucide-react';
import { btnCls } from './portal/shared';

interface CameraCaptureProps {
  title: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function CameraCapture({ title, onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Couldn't access camera. Check browser permissions, or skip if unavailable."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // mirror, matches what the user sees
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL('image/jpeg', 0.85));
  }

  function retake() {
    setCaptured(null);
  }

  function confirm() {
    if (captured) onCapture(captured);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Camera className="w-4 h-4 text-sky-400" /> {title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {error ? (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button className="text-slate-400 text-sm underline" onClick={onCancel}>Continue without photo</button>
          </div>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden bg-slate-900 aspect-square mb-4">
              {captured ? (
                <img src={captured} alt="Captured selfie" className="w-full h-full object-cover" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {captured ? (
              <div className="flex gap-2">
                <button onClick={retake} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button onClick={confirm} className={btnCls + ' flex-1 flex items-center justify-center gap-1.5'}>
                  <Check className="w-4 h-4" /> Use Photo
                </button>
              </div>
            ) : (
              <button onClick={takePhoto} className={btnCls + ' w-full flex items-center justify-center gap-1.5'}>
                <Camera className="w-4 h-4" /> Take Photo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
