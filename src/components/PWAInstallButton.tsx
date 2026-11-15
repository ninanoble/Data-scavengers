import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-[#1B4D3E] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#143A2E] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] px-3 py-1.5 text-xs font-medium text-[#1C2420] dark:text-[#EEF2EF] hover:bg-[#EFECE4] dark:hover:bg-[#1F2622] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 shadow-xl">
              <h3 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Install Data Detectives on iOS
              </h3>
              <ol className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300 list-decimal pl-5">
                <li>Tap the <strong>Share</strong> icon in Safari’s toolbar.</li>
                <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
                <li>Open Data Detectives from your home screen for offline clinic use.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#0F4C3A] py-2.5 text-sm font-medium text-white hover:bg-[#0B3A2C] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
