import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KiteTailLogo } from './KiteTailLogo';

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Smooth 0% -> 100% progress counter
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 5;
      });
    }, 25);

    const exitTimer = setTimeout(() => setExiting(true), 1100);
    const doneTimer = setTimeout(onLoadingComplete, 1400);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onLoadingComplete]);

  return (
    <div
      className={`fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100] transition-all duration-500 select-none overflow-hidden p-4 ${
        exiting ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-100/60 rounded-full blur-3xl pointer-events-none" />

      {/* Minimal Creative Glass Container */}
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-8 shadow-xl shadow-slate-200/60 text-center relative z-10 overflow-hidden"
      >
        {/* Top Accent Gradient Bar */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-400" />

        {/* Floating Creative Kite Logo Icon */}
        <div className="relative inline-flex items-center justify-center mb-5 mt-2">
          <motion.div
            animate={{ y: [-4, 4, -4], rotate: [-2, 2, -2] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 rounded-2xl bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-700/25 p-3 border border-blue-500/30"
          >
            <KiteTailLogo className="w-full h-full" />
          </motion.div>
        </div>

        {/* Brand Title */}
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
          Nikki Technologies
        </h1>

        {/* Minimal Sub-headline */}
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-blue-700 mb-6">
          Kite &amp; Tail Digital • Software Studio
        </p>

        {/* Minimal Progress Counter & Line */}
        <div className="space-y-1.5 px-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
            <span className="uppercase tracking-wider">Loading Experience</span>
            <span className="text-blue-700 font-mono text-xs">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 border border-slate-200/80 rounded-full overflow-hidden p-0.5">
            <motion.div
              className="h-full bg-blue-700 rounded-full shadow-xs"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
