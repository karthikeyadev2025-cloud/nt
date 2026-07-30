export function KiteTailLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tilted Diamond Kite Facet - Left Executive Blue */}
      <path d="M54 6 L18 36 L54 60 Z" fill="#1D4ED8" />
      {/* Tilted Diamond Kite Facet - Right Royal Blue */}
      <path d="M54 6 L86 28 L54 60 Z" fill="#2563EB" />
      
      {/* White Geometric 'N' Mark inside Kite */}
      <path d="M38 46 L38 20 L45 20 L58 40 L58 20 L65 20 L65 46 L58 46 L45 26 L45 46 Z" fill="#FFFFFF" />
      
      {/* Ascending Growth Arrow Tail swooping out of Kite */}
      <path d="M52 60 C35 72 20 80 8 84 C28 78 44 70 52 60 Z" fill="#0284C7" />
      <path d="M18 82 C38 76 60 70 82 48 L74 52 L88 34 L76 48 L82 48 C60 70 38 76 18 82 Z" fill="#0284C7" />
      <path d="M78 46 L88 34 L72 42 L77 47 L78 46 Z" fill="#38BDF8" />
    </svg>
  );
}
