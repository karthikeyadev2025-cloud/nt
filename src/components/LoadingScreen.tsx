import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KiteTailLogo } from './KiteTailLogo';

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Smooth rapid progress counter 0% -> 100%
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 10;
      });
    }, 20);

    const exitTimer = setTimeout(() => setExiting(true), 500);
    const doneTimer = setTimeout(onLoadingComplete, 700);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onLoadingComplete]);

  return (
    <div
      className={`fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center z-[100] transition-opacity duration-700 select-none overflow-hidden p-6 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient Radial Soft Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[350px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Cinematic Flying Background Kites ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Soaring Kite 1 - Top Left */}
        <motion.div
          animate={{
            y: [20, -50, 20],
            x: [-10, 25, -10],
            rotate: [-8, 6, -8],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-12 left-[10%] opacity-30 w-28 h-28"
        >
          <KiteTailLogo className="w-full h-full drop-shadow-[0_0_15px_rgba(29,78,216,0.5)]" />
        </motion.div>

        {/* Soaring Kite 2 - Top Right */}
        <motion.div
          animate={{
            y: [30, -60, 30],
            x: [15, -20, 15],
            rotate: [6, -6, 6],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-20 right-[12%] opacity-25 w-36 h-36 hidden sm:block"
        >
          <KiteTailLogo className="w-full h-full drop-shadow-[0_0_20px_rgba(56,189,248,0.4)]" />
        </motion.div>

        {/* Soaring Kite 3 - Bottom Left */}
        <motion.div
          animate={{
            y: [-20, 45, -20],
            x: [10, -25, 10],
            rotate: [-5, 7, -5],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute bottom-16 left-[15%] opacity-20 w-32 h-32 hidden md:block"
        >
          <KiteTailLogo className="w-full h-full drop-shadow-[0_0_15px_rgba(37,99,235,0.4)]" />
        </motion.div>

        {/* Soaring Kite 4 - Bottom Right */}
        <motion.div
          animate={{
            y: [-30, 50, -30],
            x: [-15, 20, -15],
            rotate: [7, -7, 7],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          className="absolute bottom-24 right-[18%] opacity-30 w-24 h-24 hidden lg:block"
        >
          <KiteTailLogo className="w-full h-full drop-shadow-[0_0_18px_rgba(2,132,199,0.5)]" />
        </motion.div>
      </div>

      {/* ── Main Uncontained Hero Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="flex flex-col items-center text-center relative z-10 max-w-md w-full"
      >
        {/* Pure Uncontained Flying Hero Kite Logo */}
        <div className="relative mb-6">
          {/* Subtle Ambient Pulse Ring */}
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-32 h-32 rounded-full border border-sky-400/30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            className="w-36 h-36 rounded-full border border-dashed border-blue-500/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          />

          {/* Floating Hero Kite Logo Mark (NO BOX / NO CONTAINER) */}
          <motion.div
            animate={{
              y: [-8, 8, -8],
              rotate: [-3, 3, -3],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-24 h-24 relative z-10 drop-shadow-[0_0_25px_rgba(37,99,235,0.6)]"
          >
            <KiteTailLogo className="w-full h-full" />
          </motion.div>
        </div>

        {/* Company Title */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2 drop-shadow-lg">
          Nikki Technologies
        </h1>

        {/* Brand Subtitle */}
        <p className="text-xs font-extrabold uppercase tracking-widest text-sky-400 mb-8 drop-shadow-sm">
          Kite &amp; Tail Digital • Software Studio
        </p>

        {/* Cinematic Glowing Skyward Progress Line */}
        <div className="w-64 space-y-2">
          <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 px-1">
            <span className="uppercase tracking-widest text-[10px] text-slate-400">Launching Experience</span>
            <span className="text-sky-400 font-mono text-xs font-bold">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden p-0.5 shadow-inner">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-400 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.7)]"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
