import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Code2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { KiteTailLogo } from './KiteTailLogo';

const STAGES = [
  { id: 1, icon: Megaphone, title: 'Kite & Tail Digital Media', desc: 'Initializing Meta & Google PPC performance funnels...' },
  { id: 2, icon: Code2, title: 'Software Development Studio', desc: 'Loading custom web & mobile app architecture...' },
  { id: 3, icon: TrendingUp, title: 'Growth & SEO Engine', desc: 'Indexing search funnels & creative media assets...' },
  { id: 4, icon: CheckCircle2, title: 'Nikki Technologies', desc: 'Readying enterprise digital experience...' },
];

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Stage switcher
    const stageInterval = setInterval(() => {
      setActiveStageIndex(prev => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 450);

    // Smooth counter to 100%
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 4;
      });
    }, 35);

    const exitTimeout = setTimeout(() => setExiting(true), 2100);
    const completeTimeout = setTimeout(onLoadingComplete, 2500);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
      clearTimeout(exitTimeout);
      clearTimeout(completeTimeout);
    };
  }, [onLoadingComplete]);

  const currentStage = STAGES[activeStageIndex];
  const StageIcon = currentStage.icon;

  return (
    <div
      className={`fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100] transition-all duration-700 p-4 select-none overflow-hidden ${
        exiting ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Dynamic Animated Soaring Kites background Canvas */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-100/40 rounded-full blur-3xl" />

        {/* Soaring Primary Kite 1 */}
        <motion.div
          animate={{
            y: [0, -35, 0],
            x: [0, 25, 0],
            rotate: [-6, 6, -6],
            scale: [1, 1.08, 1],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-16 left-[12%] opacity-35 w-32 h-32"
        >
          <KiteTailLogo className="w-full h-full text-blue-600 drop-shadow-md" />
        </motion.div>

        {/* Soaring Secondary Kite 2 */}
        <motion.div
          animate={{
            y: [0, -45, 0],
            x: [0, -30, 0],
            rotate: [5, -5, 5],
            scale: [0.95, 1.1, 0.95],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-20 right-[14%] opacity-25 w-40 h-40 hidden sm:block"
        >
          <KiteTailLogo className="w-full h-full text-indigo-600 drop-shadow-md" />
        </motion.div>
      </div>

      {/* Main Glassmorphic Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-lg bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-slate-200/80 text-center relative z-10 overflow-hidden"
      >
        {/* Top Animated Laser Gradient Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400" />

        {/* Pulsing Energy Orbit Ring + Kite Logo Icon */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ rotate: { repeat: Infinity, duration: 9, ease: 'linear' }, scale: { repeat: Infinity, duration: 3, ease: 'easeInOut' } }}
            className="w-24 h-24 rounded-full border-2 border-dashed border-blue-600/40 absolute"
          />
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            className="w-28 h-28 rounded-full border border-blue-500/30 absolute"
          />
          <div className="w-20 h-20 rounded-2xl bg-blue-700 text-white flex items-center justify-center shadow-xl shadow-blue-700/30 border border-blue-500/30 z-10 p-3.5">
            <KiteTailLogo className="w-full h-full" />
          </div>
        </div>

        {/* Brand Title */}
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
          Nikki Technologies
        </h1>
        <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700 mb-6">
          Digital Marketing &amp; Software Engineering
        </p>

        {/* Dynamic Stage Ticker Box with Slide Animation */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left shadow-xs min-h-[72px] flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-700/20">
            <StageIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStageIndex}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-extrabold text-slate-900 truncate">{currentStage.title}</p>
                <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{currentStage.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Stage Progress Indicators */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {STAGES.map((stg, i) => {
            const isDone = i < activeStageIndex;
            const isCurrent = i === activeStageIndex;
            return (
              <div
                key={stg.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isDone
                    ? 'bg-blue-700'
                    : isCurrent
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>

        {/* Glowing Progress Counter Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-extrabold text-slate-700 px-1">
            <span className="uppercase tracking-wider text-[10px] text-slate-500">System Initialization</span>
            <span className="text-blue-700 font-mono text-sm font-bold">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 border border-slate-200 rounded-full overflow-hidden p-0.5">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-500 rounded-full shadow-md shadow-blue-700/30"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
