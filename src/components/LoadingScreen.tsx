import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Code2, TrendingUp, CheckCircle2, ShieldCheck } from 'lucide-react';
import { KiteTailLogo } from './KiteTailLogo';

const STAGES = [
  { id: 1, icon: Megaphone, title: 'Kite & Tail Media', desc: 'Initializing Meta & Google PPC performance funnels' },
  { id: 2, icon: Code2, title: 'Software Studio', desc: 'Loading custom web & mobile app architecture' },
  { id: 3, icon: TrendingUp, title: 'Growth & SEO Engine', desc: 'Indexing search funnels & creative media assets' },
  { id: 4, icon: ShieldCheck, title: 'Nikki Technologies', desc: 'Readying enterprise digital experience' },
];

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Stage switcher
    const stageInterval = setInterval(() => {
      setActiveStageIndex(prev => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 500);

    // Smooth counter to 100%
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 3;
      });
    }, 35);

    const exitTimeout = setTimeout(() => setExiting(true), 2150);
    const completeTimeout = setTimeout(onLoadingComplete, 2550);

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
      className={`fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100] transition-all duration-700 p-4 select-none ${
        exiting ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Dynamic Background Mesh & Animated Floating Kites */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-100/40 rounded-full blur-3xl" />

        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 15, 0], rotate: [-4, 5, -4] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-12 left-[12%] opacity-20 w-36 h-36"
        >
          <KiteTailLogo className="w-full h-full text-blue-600 drop-shadow-sm" />
        </motion.div>

        <motion.div
          animate={{ y: [0, -40, 0], x: [0, -20, 0], rotate: [5, -5, 5] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-16 right-[12%] opacity-15 w-44 h-44 hidden sm:block"
        >
          <KiteTailLogo className="w-full h-full text-indigo-600 drop-shadow-sm" />
        </motion.div>
      </div>

      {/* Main Loading Glass Container */}
      <div className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-slate-200/80 text-center relative z-10 overflow-hidden">
        {/* Top Glowing Laser Accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400" />

        {/* Dual-Ring Rotating Badge */}
        <div className="relative inline-flex items-center justify-center mb-7">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
            className="w-24 h-24 rounded-full border-2 border-dashed border-blue-600/40 absolute"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            className="w-28 h-28 rounded-full border border-blue-400/20 absolute"
          />
          <div className="w-18 h-18 w-20 h-20 rounded-2xl bg-blue-700 text-white font-extrabold text-3xl flex items-center justify-center shadow-xl shadow-blue-700/30 border border-blue-500/30 z-10">
            <KiteTailLogo className="w-11 h-11" />
          </div>
        </div>

        {/* Company Title & Brand Tagline */}
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
          Nikki Technologies
        </h1>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-extrabold uppercase tracking-widest mb-7 shadow-xs">
          <span>Kite &amp; Tail Digital</span>
          <span className="w-1 h-1 rounded-full bg-blue-700" />
          <span>Software Studio</span>
        </div>

        {/* Dynamic Stage Ticker Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left shadow-xs min-h-[72px] flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-700/20">
            <StageIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStageIndex}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-extrabold text-slate-900 truncate">{currentStage.title}</p>
                <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{currentStage.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Completed Stage Dots Indicator */}
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

        {/* Progress Bar & Percentage */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-extrabold text-slate-700 px-1">
            <span className="uppercase tracking-wider text-[10px] text-slate-500">Initializing Experience</span>
            <span className="text-blue-700 font-mono text-sm font-bold">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 border border-slate-200 rounded-full overflow-hidden p-0.5">
            <motion.div
              className="h-full bg-blue-700 rounded-full shadow-md shadow-blue-700/30"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Footer Brand Pillars */}
        <div className="flex items-center justify-center gap-4 mt-7 pt-4 border-t border-slate-100 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-blue-700" /> Digital Marketing
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-blue-700" /> Software Engineering
          </span>
        </div>
      </div>
    </div>
  );
}
