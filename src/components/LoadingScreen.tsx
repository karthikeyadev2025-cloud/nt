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
    }, 30);

    const exitTimer = setTimeout(() => setExiting(true), 1300);
    const doneTimer = setTimeout(onLoadingComplete, 1700);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onLoadingComplete]);

  return (
    <div
      className={`fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 flex flex-col items-center justify-center z-[100] transition-opacity duration-700 select-none overflow-hidden ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient background glow ORB */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center text-center px-4 relative z-10"
      >
        {/* Glowing Pulsing Outer Halo & Kite Logo Badge */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.12, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ rotate: { repeat: Infinity, duration: 10, ease: 'linear' }, scale: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' } }}
            className="w-28 h-28 rounded-full border border-sky-400/30 absolute"
          />
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0.6, 0.2] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-32 h-32 rounded-full border border-blue-500/20 absolute"
          />
          
          {/* Central Royal Navy Glass Badge */}
          <div className="w-20 h-20 rounded-2xl bg-blue-700/90 backdrop-blur-md text-white flex items-center justify-center shadow-2xl shadow-blue-600/40 border border-blue-400/40 z-10 p-3.5">
            <KiteTailLogo className="w-full h-full" />
          </div>
        </div>

        {/* Company Title */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-1.5 drop-shadow-md">
          Nikki Technologies
        </h1>

        {/* Sub-headline / Division Badges */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-900/60 border border-blue-500/30 text-sky-300 text-xs font-extrabold uppercase tracking-widest mb-8 backdrop-blur-md shadow-inner">
          <span>Kite &amp; Tail Digital</span>
          <span className="w-1 h-1 rounded-full bg-sky-400" />
          <span>Software Studio</span>
        </div>

        {/* Minimalist Glowing Laser Progress Bar */}
        <div className="w-56 space-y-2">
          <div className="flex justify-between items-center text-[11px] font-extrabold text-slate-300 px-1">
            <span className="uppercase tracking-widest text-[10px] text-slate-400">Initializing</span>
            <span className="text-sky-400 font-mono font-bold">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full overflow-hidden p-0.5">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-400 rounded-full shadow-md shadow-sky-400/50"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
