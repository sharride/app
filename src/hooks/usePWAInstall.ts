import { useEffect, useState, useCallback } from 'react';

// The event type isn't in lib.dom.d.ts yet, so it's declared locally.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

const DISMISS_KEY = 'sr_pwa_install_dismissed_at';
// Don't re-show a dismissed prompt for two weeks — respectful, not naggy.
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's own flag for "launched from home screen"
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isAppleDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel" with touch support — catch that too.
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleDevice || isTouchMac;
}

function wasRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export type PWAInstallState =
  | { kind: 'none' }
  | { kind: 'android'; promptNow: () => Promise<'accepted' | 'dismissed' | 'unavailable'> }
  | { kind: 'ios' };

/**
 * Surfaces "install the app" opportunities without ever faking a native
 * prompt: on Chrome/Edge/Android it wraps the real `beforeinstallprompt`
 * event; on iOS (where that event doesn't exist) it just signals that
 * manual "Add to Home Screen" instructions can be shown. Already-installed
 * (standalone) sessions, and recently-dismissed ones, resolve to 'none'.
 */
export function usePWAInstall(): PWAInstallState & { dismiss: () => void } {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissedThisSession(true);
  }, []);

  const promptNow = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredEvent) return 'unavailable';
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    setDeferredEvent(null);
    if (outcome === 'dismissed') dismiss();
    return outcome;
  }, [deferredEvent, dismiss]);

  if (installed || dismissedThisSession || wasRecentlyDismissed()) {
    return { kind: 'none', dismiss };
  }
  if (deferredEvent) {
    return { kind: 'android', promptNow, dismiss };
  }
  if (isIOS()) {
    return { kind: 'ios', dismiss };
  }
  return { kind: 'none', dismiss };
}
