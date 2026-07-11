import { useEffect, useState } from 'react';

const LETTERS = ['N', 'I', 'K', 'K', 'I'];

export default function LoadingScreen({ onLoadingComplete }: { onLoadingComplete: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showTagline, setShowTagline] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Reveal letters one by one
    const letterTimer = setInterval(() => {
      setVisibleCount(prev => {
        if (prev >= LETTERS.length) {
          clearInterval(letterTimer);
          return prev;
        }
        return prev + 1;
      });
    }, 220);

    const taglineTimer = setTimeout(() => setShowTagline(true), LETTERS.length * 220 + 200);
    const exitTimer = setTimeout(() => setExiting(true), LETTERS.length * 220 + 900);
    const doneTimer = setTimeout(onLoadingComplete, LETTERS.length * 220 + 1300);

    return () => {
      clearInterval(letterTimer);
      clearTimeout(taglineTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onLoadingComplete]);

  return (
    <div
      className={`fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 transition-opacity duration-500 ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex gap-1.5 sm:gap-3">
        {LETTERS.map((letter, i) => (
          <div
            key={i}
            className="text-5xl sm:text-7xl font-extrabold bg-gradient-to-br from-sky-400 to-cyan-300 bg-clip-text text-transparent transition-all duration-500 ease-out"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.7)',
            }}
          >
            {letter}
          </div>
        ))}
      </div>
      <p
        className="text-slate-400 text-xs sm:text-sm tracking-[0.3em] uppercase mt-4 transition-opacity duration-500"
        style={{ opacity: showTagline ? 1 : 0 }}
      >
        Technologies
      </p>
      <div className="w-40 h-0.5 bg-slate-800 rounded-full overflow-hidden mt-8">
        <div
          className="h-full bg-sky-500 transition-all ease-linear"
          style={{ width: `${Math.min((visibleCount / LETTERS.length) * 100, 100)}%`, transitionDuration: '220ms' }}
        />
      </div>
    </div>
  );
}
