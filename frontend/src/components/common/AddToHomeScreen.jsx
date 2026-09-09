import { useState, useEffect } from 'react';
import { Download, Share, Plus, X, Copy } from 'lucide-react';

const DISMISS_KEY = 'a2hsDismissed';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// iPadOS Safari reports as "Macintosh", so also treat touch-capable Macs as iOS.
const isIOS =
  /iphone|ipad|ipod/i.test(ua) ||
  (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);
const isMobile = isIOS || isAndroid;
// iOS Chrome/Firefox/Edge are all WebKit, but their share menus differ from
// Safari's and the "Add to Home Screen" item lives behind the ⋯ menu.
const isIOSChrome = isIOS && /CriOS|FxiOS|EdgiOS/i.test(ua);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

/**
 * Mobile-only "Add to Home Screen" prompt. Android gets a real one-tap install
 * via the captured beforeinstallprompt event; iOS (no such API) gets a short
 * instruction sheet. Hidden when not on mobile, already installed, or dismissed.
 */
const AddToHomeScreen = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(
    () => !isMobile || isStandalone() || localStorage.getItem(DISMISS_KEY) === 'true'
  );

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setHidden(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden) return null;
  // Android: only show once we actually have an install prompt to fire.
  if (isAndroid && !deferredPrompt) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setHidden(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can copy from the address bar */
    }
  };

  const install = async () => {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') setHidden(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:hidden">
        <div className="glass-card flex items-center gap-3 !py-3 !px-3 shadow-lg">
          <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text-primary leading-tight">Add to Home Screen</p>
            <p className="text-xs text-text-muted leading-tight">Open SuperDogs like an app</p>
          </div>
          <button onClick={install} className="btn-primary !px-3 !py-2 text-sm flex items-center gap-1.5 shrink-0">
            <Download className="h-4 w-4" /> Add
          </button>
          <button onClick={dismiss} aria-label="Dismiss" className="text-text-muted hover:text-text-secondary p-1 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showIOSHelp && (
        <div
          className="fixed inset-0 bg-dog-darknavy/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-4"
          onClick={() => setShowIOSHelp(false)}
        >
          <div className="glass-card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
              <h3 className="font-display text-2xl font-bold text-text-primary">Add to Home Screen</h3>
            </div>
            {isIOSChrome ? (
              <>
                <p className="text-text-secondary text-sm mb-4">
                  On iPhone, “Add to Home Screen” only works in <span className="font-semibold">Safari</span> —
                  Chrome doesn’t offer it. Copy this link, open <span className="font-semibold">Safari</span>,
                  and paste it in.
                </p>
                <ol className="space-y-3 text-text-secondary text-sm">
                  <li className="flex items-center gap-3">
                    <span className="font-bold text-dog-orange">1.</span>
                    <span>Copy the link below and open it in Safari</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="font-bold text-dog-orange">2.</span>
                    <span className="flex items-center gap-1.5">
                      Tap <Share className="h-4 w-4 inline text-dog-orange" /> Share, then
                      <Plus className="h-4 w-4 inline text-dog-orange" /> “Add to Home Screen”
                    </span>
                  </li>
                </ol>
                <p className="mt-5 px-3 py-2 rounded-lg bg-dog-navy/8 border border-dog-navy/20 text-xs font-mono-data text-dog-darknavy break-all select-all">
                  {typeof window !== 'undefined' ? window.location.href : ''}
                </p>
                <button onClick={copyLink} className="btn-outline w-full mt-3 flex items-center justify-center gap-2">
                  <Copy className="h-4 w-4" /> {copied ? 'Link copied!' : 'Copy link'}
                </button>
              </>
            ) : (
              <ol className="space-y-3 text-text-secondary text-sm">
                <li className="flex items-center gap-3">
                  <span className="font-bold text-dog-orange">1.</span>
                  <span className="flex items-center gap-1.5">
                    Tap the <Share className="h-4 w-4 inline text-dog-orange" /> Share button
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="font-bold text-dog-orange">2.</span>
                  <span className="flex items-center gap-1.5">
                    Choose <Plus className="h-4 w-4 inline text-dog-orange" /> “Add to Home Screen”
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="font-bold text-dog-orange">3.</span>
                  <span>Tap “Add” — the icon appears on your home screen.</span>
                </li>
              </ol>
            )}
            <button onClick={() => setShowIOSHelp(false)} className="btn-primary w-full mt-6">Got it</button>
          </div>
        </div>
      )}
    </>
  );
};

export default AddToHomeScreen;
