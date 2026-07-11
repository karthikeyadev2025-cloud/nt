import { useEffect, useState } from 'react';

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onLoadingComplete, 300);
          return 100;
        }
        return prev + 5;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [onLoadingComplete]);

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950 text-2xl mb-6 animate-pulse">N</div>
      <p className="text-white font-bold text-xl mb-4">Nikki Technologies</p>
      <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-sky-500 transition-all duration-100" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
