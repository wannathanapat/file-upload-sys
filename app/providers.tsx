'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getDb, initFirebase } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { UserData } from '@/lib/utils';

export function parseToHex(color: string, fallback: string = '#000000'): string {
  if (!color) return fallback;
  color = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  // Try to parse rgb/rgba
  const rgbMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;
    
    const hex = [r, g, b].map(x => {
      const h = x.toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');

    if (a < 1) {
      const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
      return '#' + hex + alphaHex;
    }
    return '#' + hex;
  }
  return fallback;
}

export function parseToHex6(color: string, fallback: string = '#000000'): string {
  const hex = parseToHex(color, fallback);
  if (hex.length === 9) {
    return hex.slice(0, 7);
  }
  return hex;
}

export interface SystemSettings {
  telegram_status: 'enabled' | 'disabled';
  telegram_bot_token: string;
  telegram_chat_id: string;
  push_status: 'enabled' | 'disabled';
  push_vapid_key: string;
  push_service_account: string;
  max_size_pdf: number;
  max_size_video: number;
  company_name: string;
  company_desc: string;
  app_theme: string;
  app_name: string;
  app_subtitle: string;
  app_logo: string;
  app_favicon: string;
  pwa_name: string;
  pwa_short: string;
  pwa_desc: string;
  pwa_icon: string;
  sidebar_bg: string;
  sidebar_text: string;
  sidebar_active_text: string;
  sidebar_active_bg: string;
  sidebar_hover_bg: string;
  menu_dashboard: string;
  menu_import: string;
  menu_settings: string;
  menu_submit: string;
  attendance_exclude_sundays: boolean;
  attendance_holidays: { date: string; name: string }[];
  [key: string]: any;
}

export interface GDrivePrefs {
  connected: boolean;
  email: string;
  clientId: string;
  accessToken: string;
  tokenExpiresAt: number;
  folderName: string;
}

const defaultSettings: SystemSettings = {
  telegram_status: 'disabled',
  telegram_bot_token: '',
  telegram_chat_id: '',
  push_status: 'disabled',
  push_vapid_key: '',
  push_service_account: '',
  max_size_pdf: 20,
  max_size_video: 50,
  company_name: 'Coway INS System',
  company_desc: 'ระบบส่งงานติดตั้งและส่งซ่อม',
  app_theme: 'theme-indigo',
  app_name: 'ระบบส่งงาน AS INS',
  app_subtitle: 'COWAY AS & INSTALLATION SYSTEM',
  app_logo: '/coway-logo-new.png',
  app_favicon: '/coway-logo-new.png',
  pwa_name: 'ระบบส่งงาน AS INS',
  pwa_short: 'AS-INS-Upload',
  pwa_desc: 'ระบบส่งเอกสารใบงานและวิดีโอ',
  pwa_icon: '/coway-logo-new.png',
  sidebar_bg: '#1e293b',
  sidebar_text: '#94a3b8',
  sidebar_active_text: '#ffffff',
  sidebar_active_bg: '#4f46e5',
  sidebar_hover_bg: '#334155',
  menu_dashboard: 'ตารางงานคิว/ประวัติ',
  menu_import: 'นำเข้างาน/จ่ายงาน',
  menu_settings: 'ตั้งค่าระบบ',
  menu_submit: 'งานค้างส่งของฉัน',
  attendance_exclude_sundays: true,
  attendance_holidays: [],
};

const defaultGDrivePrefs: GDrivePrefs = {
  connected: false,
  email: '',
  clientId: '',
  accessToken: '',
  tokenExpiresAt: 0,
  folderName: 'Coway_Stock_Backups'
};

interface ToastState {
  isOpen: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmOptions {
  danger?: boolean;
  icon?: string;
  okText?: string;
  cancelText?: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}

interface AppContextType {
  currentUser: UserData | null;
  setCurrentUser: (user: UserData | null) => void;
  systemSettings: SystemSettings;
  gdrivePrefs: GDrivePrefs;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  loadingText: string;
  setLoadingText: (text: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  showConfirm: (title: string, message: string, options?: ConfirmOptions) => Promise<boolean>;
  updateSystemSettings: (updates: Partial<SystemSettings>) => Promise<void>;
  updateGDrivePrefs: (updates: Partial<GDrivePrefs>) => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);


export function Providers({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<UserData | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSettings);
  const [gdrivePrefs, setGDrivePrefs] = useState<GDrivePrefs>(defaultGDrivePrefs);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingText, setLoadingText] = useState<string>('กำลังเริ่มต้นระบบ...');
  const router = useRouter();
  const pathname = usePathname();

  // Toast & Confirm states
  const [toast, setToast] = useState<ToastState>({ isOpen: false, message: '', type: 'success' });
  const [confirm, setConfirm] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    options: {},
    resolve: null
  });
  
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ isOpen: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, 4000);
  };

  const showConfirm = (title: string, message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirm({
        isOpen: true,
        title,
        message,
        options: {
          danger: options.danger ?? false,
          icon: options.icon ?? '❓',
          okText: options.okText ?? 'ตกลง',
          cancelText: options.cancelText ?? 'ยกเลิก'
        },
        resolve
      });
    });
  };

  // Set user state and sync with local storage
  const setCurrentUser = (user: UserData | null) => {
    setCurrentUserState(user);
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('appUserSession', JSON.stringify(user));
      } else {
        localStorage.removeItem('appUserSession');
      }
    }
  };

  const logout = () => {
    setCurrentUser(null);
    router.push('/');
  };

  // Migrate attendance_holidays from legacy string[] to {date, name}[]
  const normalizeHolidays = (settings: Partial<SystemSettings>): Partial<SystemSettings> => {
    if (!settings.attendance_holidays) return settings;
    const normalized = (settings.attendance_holidays as unknown[]).map(h =>
      typeof h === 'string' ? { date: h, name: 'วันหยุด' } : h
    );
    return { ...settings, attendance_holidays: normalized as { date: string; name: string }[] };
  };

  // 1. Initialize Firebase & Cache Settings
  useEffect(() => {
    initFirebase();

    // Load caches immediately for initial UI responsiveness
    if (typeof window !== 'undefined') {
      const cachedSettings = localStorage.getItem('cfg_system_settings_cache');
      if (cachedSettings) {
        try {
          setSystemSettings(prev => ({ ...prev, ...normalizeHolidays(JSON.parse(cachedSettings)) }));
        } catch (_) {}
      }
      
      const cachedGDrive = localStorage.getItem('cfg_gdrive_prefs_cache');
      if (cachedGDrive) {
        try {
          setGDrivePrefs(prev => ({ ...prev, ...JSON.parse(cachedGDrive) }));
        } catch (_) {}
      }

      const cachedUser = localStorage.getItem('appUserSession');
      if (cachedUser) {
        try {
          setCurrentUserState(JSON.parse(cachedUser));
        } catch (_) {}
      }
    }

    setLoading(false);
  }, []);

  // 2. Fetch config from Firestore in background
  useEffect(() => {
    const fetchRemoteConfig = async () => {
      try {
        const db = getDb();
        
        // System Settings
        const settingsRef = doc(db, 'app_config', 'system_settings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const remoteData = normalizeHolidays(settingsSnap.data() as Partial<SystemSettings>);
          const merged = { ...defaultSettings, ...remoteData };
          setSystemSettings(merged);
          localStorage.setItem('cfg_system_settings_cache', JSON.stringify(merged));
        }

        // GDrive Preferences
        const gdriveRef = doc(db, 'app_config', 'gdrive_preferences');
        const gdriveSnap = await getDoc(gdriveRef);
        if (gdriveSnap.exists()) {
          const remoteData = gdriveSnap.data() as Partial<GDrivePrefs>;
          const merged = { ...defaultGDrivePrefs, ...remoteData };
          setGDrivePrefs(merged);
          localStorage.setItem('cfg_gdrive_prefs_cache', JSON.stringify(merged));
        }
      } catch (err) {
        console.warn("Could not retrieve remote configs, using local caches instead:", err);
      }
    };

    fetchRemoteConfig();
  }, []);

  // 3. Background-refresh user data from Firestore on app load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sessionUser = localStorage.getItem('appUserSession');
    if (!sessionUser) return;

    void (async () => {
      try {
        const parsed = JSON.parse(sessionUser) as UserData;
        if (!parsed.username) return;
        const db = getDb();
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), where('username', '==', parsed.username));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const refreshed = { ...snap.docs[0].data(), _docId: snap.docs[0].id } as UserData;
          if (refreshed.status === 'active') setCurrentUser(refreshed);
        }
      } catch (_) {}
    })();
  }, []);


  // Route protection inside frontend
  useEffect(() => {
    if (loading) return;
    
    if (!currentUser) {
      if (pathname !== '/') {
        router.push('/');
      }
    } else {
      if (pathname === '/') {
        if (currentUser.role === 'admin' || currentUser.role === 'auditor') {
          router.push('/dashboard');
        } else {
          router.push('/submit');
        }
      } else {
        // Prevent staff from accessing admin-only routes
        const adminOnlyRoutes = ['/dashboard', '/import-jobs', '/settings', '/broadcast'];
        if (currentUser.role === 'staff' && adminOnlyRoutes.includes(pathname)) {
          router.push('/submit');
        }
      }
    }
  }, [currentUser, pathname, loading, router]);

  // Apply application theme class to document body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const body = document.body;
      body.className = body.className.split(' ').filter(c => !c.startsWith('theme-')).join(' ');
      body.classList.add(systemSettings.app_theme || 'theme-indigo');
    }
  }, [systemSettings.app_theme]);

  // Update browser tab favicon dynamically based on theme settings
  useEffect(() => {
    if (typeof document !== 'undefined') {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = systemSettings.app_favicon || '/coway-logo-new.png';
      console.log('SET FAVICON HASH/PATH:', link.href);
    }
  }, [systemSettings.app_favicon]);

  // 5. Register FCM token when any logged-in user loads and push is enabled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) return;
    if (systemSettings.push_status !== 'enabled') return;
    if (!systemSettings.push_vapid_key) return;

    const registerFcmToken = async () => {
      try {
        // Request notification permission
        if (typeof Notification === 'undefined') return;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[FCM] Notification permission denied');
          return;
        }

        // Register service worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Import Firebase Messaging dynamically (client-only)
        const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
        const { app } = initFirebase();
        if (!app) return;

        const messaging = getMessaging(app);

        // Get FCM registration token
        const token = await getToken(messaging, {
          vapidKey: systemSettings.push_vapid_key,
          serviceWorkerRegistration: swReg,
        });

        if (!token) {
          console.warn('[FCM] No registration token received');
          return;
        }

        // Save token to Firestore under notification_tokens collection
        const db = getDb();
        const {
          doc: firestoreDoc,
          setDoc: firestoreSetDoc,
          deleteDoc: firestoreDeleteDoc,
          getDocs: firestoreGetDocs,
          collection: firestoreCollection,
          query: firestoreQuery,
          where: firestoreWhere,
          serverTimestamp,
        } = await import('firebase/firestore');

        const username = currentUser.username || currentUser.name || 'unknown';
        const device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'pc';

        // Remove stale tokens for same user + device type to prevent duplicate pushes.
        // Multi-device is preserved: mobile and pc tokens are kept independently.
        try {
          const staleSnap = await firestoreGetDocs(
            firestoreQuery(
              firestoreCollection(db, 'notification_tokens'),
              firestoreWhere('username', '==', username),
              firestoreWhere('device', '==', device),
            )
          );
          await Promise.all(
            staleSnap.docs
              .filter(d => d.id !== token)
              .map(d => firestoreDeleteDoc(d.ref))
          );
        } catch (e) {
          console.warn('[FCM] Could not clean up stale tokens:', e);
        }

        const tokenDocRef = firestoreDoc(db, 'notification_tokens', token);
        await firestoreSetDoc(tokenDocRef, {
          token,
          username,
          name: currentUser.name || '',
          role: currentUser.role,
          device,
          updated_at: serverTimestamp(),
        }, { merge: true });

        console.log('[FCM] Token registered successfully');

        // Handle foreground messages (when app tab is open)
        // NOTE: Do NOT create new Notification() here — that would double-up with the service worker.
        // Instead, just log for debugging. The service worker handles background notifications,
        // and foreground messages are handled by the app UI.
        onMessage(messaging, (payload) => {
          console.log('[FCM] Foreground message received (app is open):', payload);
          // Foreground: the user already has the app open, so no popup needed.
          // The notification was already saved to Firestore — they can see it in /notifications.
        });
      } catch (err) {
        console.error('[FCM] Token registration failed:', err);
      }
    };

    registerFcmToken();
  }, [currentUser, systemSettings.push_status, systemSettings.push_vapid_key]);

  const updateSystemSettings = async (updates: Partial<SystemSettings>) => {
    const db = getDb();
    const merged = { ...systemSettings, ...updates };
    setSystemSettings(merged);
    localStorage.setItem('cfg_system_settings_cache', JSON.stringify(merged));
    
    try {
      const docRef = doc(db, 'app_config', 'system_settings');
      await setDoc(docRef, updates, { merge: true });
    } catch (err) {
      console.error("Failed to persist system settings:", err);
      throw err;
    }
  };

  const updateGDrivePrefs = async (updates: Partial<GDrivePrefs>) => {
    const db = getDb();
    const merged = { ...gdrivePrefs, ...updates };
    setGDrivePrefs(merged);
    localStorage.setItem('cfg_gdrive_prefs_cache', JSON.stringify(merged));
    
    try {
      const docRef = doc(db, 'app_config', 'gdrive_preferences');
      await setDoc(docRef, updates, { merge: true });
    } catch (err) {
      console.error("Failed to persist GDrive settings:", err);
      throw err;
    }
  };

  const handleConfirmClose = (result: boolean) => {
    if (confirm.resolve) confirm.resolve(result);
    setConfirm(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      systemSettings,
      gdrivePrefs,
      loading,
      setLoading,
      loadingText,
      setLoadingText,
      showToast,
      showConfirm,
      updateSystemSettings,
      updateGDrivePrefs,
      logout,
    }}>
      <div 
        style={{
          '--sidebar-bg': parseToHex(systemSettings.sidebar_bg, '#1e293b'),
          '--sidebar-text': parseToHex(systemSettings.sidebar_text, '#94a3b8'),
          '--sidebar-active-text': parseToHex(systemSettings.sidebar_active_text, '#ffffff'),
          '--sidebar-active-bg': parseToHex(systemSettings.sidebar_active_bg, '#4f46e5'),
          '--sidebar-hover-bg': parseToHex(systemSettings.sidebar_hover_bg, '#334155'),
        } as React.CSSProperties} 
        className="contents"
      >
        {children}
      </div>

      {/* Global Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center p-8 bg-white/95 rounded-3xl shadow-xl max-w-xs text-center border border-slate-100">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="font-semibold text-slate-800 Prompt">{loadingText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Toast Notification */}
      <AnimatePresence>
        {toast.isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-lg border text-white ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' :
              toast.type === 'error' ? 'bg-rose-600 border-rose-500' :
              'bg-blue-600 border-blue-500'
            }`}>
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5 flex-shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
              <span className="text-sm font-semibold Sarabun leading-relaxed">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Confirm Dialog */}
      <AnimatePresence>
        {confirm.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/55 backdrop-blur-xs"
              onClick={() => handleConfirmClose(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 text-center"
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 ${
                confirm.options.danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {confirm.options.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-800 Prompt mb-2">{confirm.options.icon} {confirm.title}</h3>
              <p className="text-sm text-slate-600 Sarabun leading-relaxed mb-6">{confirm.message}</p>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleConfirmClose(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition duration-150 Prompt"
                >
                  {confirm.options.cancelText}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmClose(true)}
                  className={`flex-1 py-3 px-4 text-white font-semibold text-sm rounded-xl transition duration-150 Prompt shadow-md ${
                    confirm.options.danger 
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {confirm.options.okText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
