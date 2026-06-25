'use client';

import { useEffect } from 'react';

/**
 * PWAInstallPrompt — listens for the browser's beforeinstallprompt event and
 * saves it so the app can trigger the native install dialog programmatically.
 * Also registers the firebase service worker to satisfy PWA installability.
 */
export default function PWAInstallPrompt() {
  useEffect(() => {
    // Store the deferred prompt globally so other components can trigger it
    const handler = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      console.log('[PWA] beforeinstallprompt captured — app is installable');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return null; // no UI
}
