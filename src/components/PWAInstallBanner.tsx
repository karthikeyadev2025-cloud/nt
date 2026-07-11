import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const alreadyDismissed = localStorage.getItem('pwa_banner_dismissed');
    if (alreadyDismissed) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
    setInstalling(false);
  }

  function handleDismiss() {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem('pwa_banner_dismissed', '1');
  }

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[100] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 border border-sky-500/30 rounded-2xl shadow-2xl shadow-black/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-xl flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Install Nikki App</p>
            <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
              Add to your home screen for quick access — works offline too!
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-xs font-medium transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
          >
            {installing ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {installing ? 'Installing...' : 'Install App'}
          </button>
        </div>
      </div>
    </div>
  );
}
