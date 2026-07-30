import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Code2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { KiteTailLogo } from './KiteTailLogo';

const SERVICE_STEPS = [
  { icon: Megaphone, title: 'Kite & Tail Digital Marketing', desc: 'Loading Meta & Google PPC performance funnels...' },
  { icon: Code2, title: 'Software Development Studio', desc: 'Initializing web app & mobile platform architecture...' },
  { icon: TrendingUp, title: 'SEO & Growth Engine', desc: 'Preparing search optimization & creative media assets...' },
  { icon: CheckCircle2, title: 'Nikki Technologies', desc: 'Readying enterprise digital experience...' },
];

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Step switcher timer
    const stepTimer = setInterval(() => {
      setStepIndex(prev => (prev < SERVICE_STEPS.length - 1 ? prev + 1 : prev));
    }, 450);

    // Smooth progress counter
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 4;
      });
    }, 40);

    const exitTimer = setTimeout(() => setExiting(true), 2100);
    const doneTimer = setTimeout(onLoadingComplete, 2500);

    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onLoadingComplete]);

  const currentStep = SERVICE_STEPS[stepIndex];
  const StepIcon = currentStep.icon;

  return (
    <div
      className={`fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100] transition-all duration-500 p-4 ${
        exiting ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Animated Floating Kites */}
      <motion.div
        animate={{ y: [0, -20, 0], rotate: [-4, 4, -4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-16 left-[15%] opacity-20 w-32 h-32 pointer-events-none"
      >
        <KiteTailLogo className="w-full h-full text-blue-600" />
      </motion.div>

      <motion.div
        animate={{ y: [0, -25, 0], rotate: [4, -4, 4] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute bottom-16 right-[15%] opacity-20 w-36 h-36 pointer-events-none"
      >
        <KiteTailLogo className="w-full h-full text-indigo-600" />
      </motion.div>

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-8 shadow-2xl shadow-slate-200/60 text-center relative overflow-hidden backdrop-blur-md">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-blue-50 rounded-full blur-2xl pointer-events-none" />

        {/* Brand Icon Mark */}
        <div className="relative inline-flex mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-xl shadow-blue-700/25 border border-blue-600/30">
            N
          </div>
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.9, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-2 rounded-3xl border-2 border-blue-600/30 pointer-events-none"
          />
        </div>

        {/* Brand Title */}
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
          Nikki Technologies
        </h1>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-6">
          Digital Marketing &amp; Custom Software
        </p>

        {/* Service Ticker Area */}
        <div className="min-h-[64px] bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-6 flex items-center gap-3 text-left shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <StepIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={stepIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-xs font-bold text-slate-900 truncate">{currentStep.title}</p>
                <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{currentStep.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-600 px-1">
            <span>Loading Experience</span>
            <span className="text-blue-700 font-mono">{Math.min(progress, 100)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-700 transition-all ease-out duration-100 rounded-full shadow-xs"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Core Service Pills at bottom */}
        <div className="flex justify-center gap-2 mt-6 pt-4 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
            <Megaphone className="w-3.5 h-3.5 text-blue-700" /> Kite &amp; Tail Digital
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <Code2 className="w-3.5 h-3.5 text-slate-600" /> Software Studio
          </span>
        </div>
      </div>
    </div>
  );
}
