export function KiteTailLogo({ className = "w-8 h-8", showText = false }: { className?: string; showText?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Geometric Kite Body - Deep Blue Left Facet */}
        <path d="M50 8 L18 42 L50 68 Z" fill="#1D4ED8" />
        {/* Geometric Kite Body - Bright Sapphire Right Facet */}
        <path d="M50 8 L82 32 L50 68 Z" fill="#2563EB" />
        
        {/* Crisp White 'N' Logo inside Kite */}
        <path d="M35 50 L35 22 L42 22 L56 44 L56 22 L63 22 L63 50 L56 50 L42 28 L42 50 Z" fill="#FFFFFF" />
        
        {/* Swooping Tail Line with Ascending Arrow */}
        <path d="M48 68 C35 78 20 84 10 88 C25 84 40 78 52 71 C45 78 30 84 10 88 C32 82 46 74 48 68 Z" fill="#0284C7" />
        <path d="M46 70 Q60 80 82 72 L72 88 L70 78 Q55 86 46 70 Z" fill="#0369A1" />
        {/* Growth Arrow Tail tip */}
        <path d="M52 68 C65 74 76 70 88 56 L80 58 L86 44 L72 50 L76 56 C66 65 57 67 52 68 Z" fill="#38BDF8" />
      </svg>
      {showText && (
        <div className="flex flex-col text-left leading-none">
          <span className="text-slate-900 font-extrabold text-sm tracking-wider uppercase">KITE &amp; TAIL</span>
          <span className="text-blue-700 font-bold text-[10px] tracking-tight">BY NIKKI TECHNOLOGIES</span>
        </div>
      )}
    </div>
  );
}
