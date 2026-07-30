import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), 1200);
    const completeTimer = setTimeout(onLoadingComplete, 1600);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onLoadingComplete]);

  return (
    <div
      className={`fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100] transition-opacity duration-700 select-none ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center text-center px-4"
      >
        {/* Clean Corporate Brand Shield Badge */}
        <div className="w-16 h-16 rounded-2xl bg-blue-700 text-white font-extrabold text-3xl flex items-center justify-center shadow-xl shadow-blue-700/20 mb-4 border border-blue-600/30">
          N
        </div>

        {/* Crisp Brand Name */}
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Nikki Technologies
        </h1>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1.5">
          Digital Media Marketing • Custom Software Engineering
        </p>

        {/* Minimalist Glowing Accent Line */}
        <div className="w-28 h-1 bg-slate-200 rounded-full mt-6 overflow-hidden">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="w-full h-full bg-blue-700 rounded-full"
          />
        </div>
      </motion.div>
    </div>
  );
}
