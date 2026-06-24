'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/sidebar';
import { useApp, parseToHex, parseToHex6 } from '../providers';
import { getDb } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import type { UserData } from '@/lib/utils';
import { 
  Settings as SettingsIcon, 
  Key, 
  Send, 
  ShieldAlert, 
  Sliders, 
  Users, 
  UserPlus, 
  Save, 
  Trash2, 
  Edit2, 
  Database,
  ChevronDown,
  Bell
} from 'lucide-react';
import Script from 'next/script';
import { motion, AnimatePresence } from 'framer-motion';
import { sendTelegramDirect } from '@/lib/telegram';

// Native SHA-256 helper
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function SettingsPage() {
  const { 
    systemSettings, 
    updateSystemSettings, 
    gdrivePrefs, 
    updateGDrivePrefs, 
    showToast, 
    showConfirm,
    setLoading,
    setLoadingText
  } = useApp();

  // Active Settings Tab state matching requested design layout
  const [activeSettingTab, setActiveSettingTab] = useState<'theme' | 'gdrive' | 'apis' | 'filesize' | 'users' | 'normalizer'>('theme');

  // Settings State Form
  const [telegramStatus, setTelegramStatus] = useState<'enabled' | 'disabled'>('disabled');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [pushStatus, setPushStatus] = useState<'enabled' | 'disabled'>('disabled');
  const [pushVapidKey, setPushVapidKey] = useState('');
  const [pushServiceAccount, setPushServiceAccount] = useState('');
  const [maxSizePdf, setMaxSizePdf] = useState(20);
  const [maxSizeVideo, setMaxSizeVideo] = useState(50);
  const [appName, setAppName] = useState('');
  const [appSubtitle, setAppSubtitle] = useState('');
  const [appTheme, setAppTheme] = useState('theme-indigo');

  // Sidebar dynamic colors states
  const [sidebarBg, setSidebarBg] = useState('#1e293b');
  const [sidebarText, setSidebarText] = useState('#94a3b8');
  const [sidebarActiveBg, setSidebarActiveBg] = useState('#4f46e5');
  const [sidebarActiveText, setSidebarActiveText] = useState('#ffffff');
  const [sidebarHoverBg, setSidebarHoverBg] = useState('#334155');

  // Dynamic branding images (Base64 data URLs)
  const [appLogo, setAppLogo] = useState('');
  const [appFavicon, setAppFavicon] = useState('');
  const [pwaIcon, setPwaIcon] = useState('');

  // PWA fields states
  const [pwaName, setPwaName] = useState('');
  const [pwaShort, setPwaShort] = useState('');
  const [pwaDesc, setPwaDesc] = useState('');

  // Sidebar customized labels
  const [menuDashboard, setMenuDashboard] = useState('');
  const [menuImport, setMenuImport] = useState('');
  const [menuSettings, setMenuSettings] = useState('');
  const [menuSubmit, setMenuSubmit] = useState('');

  // GDrive state
  const [gdriveClientIdInput, setGdriveClientIdInput] = useState('');
  const [gdriveClientSecretInput, setGdriveClientSecretInput] = useState('');

  // User Management State
  const [users, setUsers] = useState<UserData[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<string | null>(null);
  
  // User Form fields
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('staff');
  const [formStatus, setFormStatus] = useState('active');

  // Load configuration from context into form states
  useEffect(() => {
    if (systemSettings) {
      setTelegramStatus(systemSettings.telegram_status || 'disabled');
      setTelegramToken(systemSettings.telegram_bot_token || '');
      setTelegramChatId(systemSettings.telegram_chat_id || '');
      setPushStatus(systemSettings.push_status || 'disabled');
      setPushVapidKey(systemSettings.push_vapid_key || '');
      setPushServiceAccount(systemSettings.push_service_account || '');
      setMaxSizePdf(systemSettings.max_size_pdf || 20);
      setMaxSizeVideo(systemSettings.max_size_video || 50);
      setAppName(systemSettings.app_name || '');
      setAppSubtitle(systemSettings.app_subtitle || '');
      setAppTheme(systemSettings.app_theme || 'theme-indigo');

      // Set colors
      setSidebarBg(parseToHex(systemSettings.sidebar_bg, '#1e293b'));
      setSidebarText(parseToHex(systemSettings.sidebar_text, '#94a3b8'));
      setSidebarActiveBg(parseToHex(systemSettings.sidebar_active_bg, '#4f46e5'));
      setSidebarActiveText(parseToHex(systemSettings.sidebar_active_text, '#ffffff'));
      setSidebarHoverBg(parseToHex(systemSettings.sidebar_hover_bg, '#334155'));

      // Set branding
      setAppLogo(systemSettings.app_logo || '');
      setAppFavicon(systemSettings.app_favicon || '');
      setPwaIcon(systemSettings.pwa_icon || '');

      // Set PWA details
      setPwaName(systemSettings.pwa_name || '');
      setPwaShort(systemSettings.pwa_short || '');
      setPwaDesc(systemSettings.pwa_desc || '');

      // Set menus
      setMenuDashboard(systemSettings.menu_dashboard || '');
      setMenuImport(systemSettings.menu_import || '');
      setMenuSettings(systemSettings.menu_settings || '');
      setMenuSubmit(systemSettings.menu_submit || '');
    }
    if (gdrivePrefs) {
      setGdriveClientIdInput(gdrivePrefs.clientId || '');
      // clientSecret is stored server-side, just show placeholder if already configured
      if ((gdrivePrefs as any).clientSecret) {
        setGdriveClientSecretInput('••••••••••••••••');
      }
    }
  }, [systemSettings, gdrivePrefs]);

  const loadUsers = async () => {
    setUserLoading(true);
    try {
      const db = getDb();
      const snap = await getDocs(collection(db, 'users'));
      const list: UserData[] = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data() as UserData);
      });
      setUsers(list);
    } catch (err: any) {
      console.error(err);
      showToast("โหลดผู้ใช้ไม่สำเร็จ: " + err.message, "error");
    } finally {
      setUserLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Save general parameters and custom styling / branding
  const handleSaveParameters = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoadingText("กำลังบันทึกตั้งค่าระบบ...");
    try {
      await updateSystemSettings({
        telegram_status: telegramStatus,
        telegram_bot_token: telegramToken,
        telegram_chat_id: telegramChatId,
        push_status: pushStatus,
        push_vapid_key: pushVapidKey,
        push_service_account: pushServiceAccount,
        max_size_pdf: Number(maxSizePdf),
        max_size_video: Number(maxSizeVideo),
        app_name: appName,
        app_subtitle: appSubtitle,
        app_theme: appTheme,

        // Save dynamic colors
        sidebar_bg: sidebarBg,
        sidebar_text: sidebarText,
        sidebar_active_bg: sidebarActiveBg,
        sidebar_active_text: sidebarActiveText,
        sidebar_hover_bg: sidebarHoverBg,

        // Save images
        app_logo: appLogo,
        app_favicon: appFavicon,
        pwa_icon: pwaIcon,

        // Save PWA details
        pwa_name: pwaName,
        pwa_short: pwaShort,
        pwa_desc: pwaDesc,

        // Save menus
        menu_dashboard: menuDashboard,
        menu_import: menuImport,
        menu_settings: menuSettings,
        menu_submit: menuSubmit
      });
      showToast("บันทึกการตั้งค่าพารามิเตอร์ระบบและธีมสำเร็จ 😊", "success");
    } catch (err: any) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramToken.trim() || !telegramChatId.trim()) {
      showToast("กรุณากรอก Telegram Token และ Chat ID ก่อนทดสอบนะครับ ⚠️", "error");
      return;
    }

    setLoading(true);
    setLoadingText("กำลังทดสอบส่งข้อความ...");
    try {
      await sendTelegramDirect(
        telegramToken.trim(),
        telegramChatId.trim(),
        `🔔 <b>ทดสอบการเชื่อมต่อ Telegram</b>\n` +
        `──────────────────\n` +
        `การเชื่อมต่อระหว่างระบบอัปโหลดใบงาน COWAY และห้องแชทของคุณ ทำงานสำเร็จเสร็จสมบูรณ์เรียบร้อยแล้วครับ! 🚀✨\n` +
        `──────────────────`
      );
      showToast("ส่งข้อความทดสอบสำเร็จแล้ว! กรุณาเช็กในกลุ่มแชทนะครับ 🎉", "success");
    } catch (err: any) {
      console.error(err);
      showToast("ทดสอบส่งล้มเหลว: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestPushNotification = async () => {
    if (!pushVapidKey.trim() || !pushServiceAccount.trim()) {
      showToast("กรุณากรอก VAPID Key และ Service Account JSON ก่อนทดสอบนะครับ ⚠️", "error");
      return;
    }

    setLoading(true);
    setLoadingText("กำลังส่งแจ้งเตือนทดสอบ...");
    try {
      const response = await fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔 ทดสอบการแจ้งเตือน Push Notification',
          body: `ระบบส่งแจ้งเตือนทำงานได้เป็นปกติแล้วครับ! ทดสอบเมื่อเวลา ${new Date().toLocaleTimeString('th-TH')}`,
          url: '/dashboard',
          serviceAccountJson: pushServiceAccount.trim(),
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.message || 'ส่งแจ้งเตือนไม่สำเร็จ');
      }
      
      showToast(`ทดสอบส่งสำเร็จแล้ว! ส่งไปยัง ${result.successCount || 0} อุปกรณ์ 🎉`, "success");
    } catch (err: any) {
      console.error(err);
      showToast("ทดสอบส่งแจ้งเตือนล้มเหลว: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };


  // Google Drive connection using Authorization Code Flow (gets refresh_token via backend)
  const handleConnectGDrive = () => {
    const clientId = gdriveClientIdInput.trim();
    const clientSecret = gdriveClientSecretInput.trim();

    if (!clientId) {
      showToast('กรุณากรอก Google Client ID ให้ถูกต้องก่อนทำการเชื่อมต่อ 🔑', 'error');
      return;
    }
    if (!clientSecret || clientSecret === '••••••••••••••••') {
      showToast('กรุณากรอก Google Client Secret ด้วยนะครับ (ได้จาก Google Cloud Console) 🔐', 'error');
      return;
    }
    if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      showToast('กำลังเตรียมไฟล์เชื่อมต่อ Google API... กรุณาลองอีกครั้งในอึดใจเดียว', 'error');
      return;
    }

    try {
      // Use Code Client (Authorization Code flow) instead of Token Client
      // This allows us to get a refresh_token via backend
      const codeClient = (window as any).google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        ux_mode: 'popup',
        callback: async (codeResponse: any) => {
          if (codeResponse.error) {
            showToast('เชื่อมต่อบัญชีล้มเหลว: ' + codeResponse.error, 'error');
            return;
          }

          setLoading(true);
          setLoadingText('กำลังแลก Authorization Code เป็น Refresh Token ถาวร...');

          try {
            const res = await fetch('/api/gdrive/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: codeResponse.code,
                clientId,
                clientSecret,
                redirectUri: 'postmessage',
              }),
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Exchange failed');
            }

            const data = await res.json();
            await updateGDrivePrefs({
              connected: true,
              email: data.email || 'Connected Account',
              clientId,
              accessToken: data.accessToken,
              tokenExpiresAt: data.tokenExpiresAt,
            });

            showToast('เชื่อมต่อ Google Drive แบบ Refresh Token สำเร็จแล้ว! ระบบจะต่ออายุอัตโนมัติตลอดกาล 🎉', 'success');
          } catch (err: any) {
            showToast('แลก Token ล้มเหลว: ' + err.message, 'error');
          } finally {
            setLoading(false);
          }
        },
      });

      codeClient.requestCode();
    } catch (err: any) {
      showToast('เรียกเชื่อมต่อล้มเหลว: ' + err.message, 'error');
    }
  };

  const handleReauthorizeGDrive = async () => {
    // With refresh token system, just call the backend refresh endpoint directly
    setLoading(true);
    setLoadingText('กำลังต่ออายุ Access Token อัตโนมัติ...');
    try {
      const res = await fetch('/api/gdrive/refresh', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Refresh failed');
      }
      const data = await res.json();
      await updateGDrivePrefs({
        accessToken: data.accessToken,
        tokenExpiresAt: data.tokenExpiresAt,
      });
      showToast('ต่ออายุ Token สำเร็จแล้วครับ! ระบบพร้อมใช้งานแล้ว 🚀', 'success');
    } catch (err: any) {
      showToast('ต่ออายุ Token ล้มเหลว: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectGDrive = async () => {
    const confirm = await showConfirm(
      "ยืนยันการตัดเชื่อมต่อ Google Drive",
      "คุณต้องการยกเลิกการจัดเก็บไฟล์และกูเกิลไดรฟ์ร่วมในแอปพลิเคชันหรือไม่? ช่างเทคนิคจะไม่สามารถอัปโหลดใบงานส่งงานใหม่ได้จนกว่าจะมีการเชื่อมต่อสิทธิ์อีกครั้ง",
      { danger: true, okText: "ตัดการเชื่อมต่อ", cancelText: "ยกเลิก" }
    );
    if (!confirm) return;

    setLoading(true);
    setLoadingText("กำลังตัดเชื่อมต่อ...");
    try {
      await updateGDrivePrefs({
        connected: false,
        email: '',
        accessToken: '',
        tokenExpiresAt: 0
      });
      showToast("ตัดการเชื่อมต่อ Google Drive สำเร็จแล้วครับ", "success");
    } catch (err: any) {
      showToast("ตัดเชื่อมต่อไม่สำเร็จ: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // User Management Forms Actions
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || (!editUserTarget && !formPassword.trim()) || !formName.trim()) {
      showToast("กรุณากรอกรหัสพนักงาน รหัสผ่าน และชื่อผู้ใช้ให้ครบถ้วนนะคร้าบ ⚠️", "error");
      return;
    }

    setLoading(true);
    setLoadingText("กำลังจัดเก็บข้อมูลพนักงาน...");

    try {
      const db = getDb();
      let passwordToSave = formPassword;

      const isAlreadyHashed = /^[0-9a-f]{64}$/i.test(passwordToSave);
      if (!isAlreadyHashed && passwordToSave) {
        passwordToSave = await sha256(passwordToSave);
      }

      const userData: Partial<UserData & { password?: string }> = {
        username: formUsername.trim(),
        name: formName.trim(),
        role: formRole,
        status: formStatus
      };

      if (passwordToSave) {
        userData.password = passwordToSave;
      }

      // Check if we are editing and username has changed
      if (editUserTarget && editUserTarget !== formUsername.trim()) {
        if (editUserTarget === 'admin') {
          showToast("ไม่สามารถเปลี่ยนรหัสพนักงานของบัญชีแอดมินระบบหลัก (admin) ได้นะครับ ❌", "error");
          setLoading(false);
          return;
        }

        const oldDocRef = doc(db, 'users', editUserTarget);
        const oldDocSnap = await getDoc(oldDocRef);
        let finalUserData = { ...userData };
        if (oldDocSnap.exists()) {
          const oldData = oldDocSnap.data();
          if (!passwordToSave && oldData.password) {
            finalUserData.password = oldData.password;
          }
        }

        // Write the new document and delete the old one
        await setDoc(doc(db, 'users', formUsername.trim()), finalUserData);
        await deleteDoc(oldDocRef);
      } else {
        // Just standard save (new user, or editing user with same username)
        await setDoc(doc(db, 'users', formUsername.trim()), userData, { merge: true });
      }

      showToast("บันทึกข้อมูลพนักงานจัดการงานเรียบร้อยแล้วครับ ✨", "success");
      
      // Reset form
      setFormUsername('');
      setFormPassword('');
      setFormName('');
      setFormRole('staff');
      setFormStatus('active');
      setEditUserTarget(null);
      
      loadUsers();
    } catch (err: any) {
      console.error(err);
      showToast("บันทึกผู้ใช้ไม่สำเร็จ: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user: UserData) => {
    setEditUserTarget(user.username);
    setFormUsername(user.username);
    setFormName(user.name);
    setFormRole(user.role);
    setFormStatus(user.status);
    setFormPassword(''); // Let password be empty to not overwrite
  };

  const handleDeleteUser = async (username: string) => {
    if (username === 'admin') {
      showToast("ไม่สามารถลบบัญชีแอดมินระบบหลัก (Bypass) ได้นะครับ ❌", "error");
      return;
    }

    const confirm = await showConfirm(
      "ยืนยันการลบผู้ใช้",
      `คุณต้องการนำพนักงานบัญชี "${username}" ออกจากระบบคิวงานใช่หรือไม่? บัญชีนี้จะไม่สามารถเข้าถึงหน้าต่างส่งงานหรือจัดการใดๆ ได้อีกถาวร`,
      { danger: true, okText: "ยืนยันการลบ", cancelText: "ยกเลิก" }
    );
    if (!confirm) return;

    setLoading(true);
    setLoadingText("กำลังนำบัญชีออก...");
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'users', username));
      showToast("ลบบัญชีผู้ใช้งานสำเร็จเรียบร้อยครับ", "success");
      loadUsers();
    } catch (err: any) {
      console.error(err);
      showToast("ลบผู้ใช้ไม่สำเร็จ: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUserEdit = () => {
    setEditUserTarget(null);
    setFormUsername('');
    setFormName('');
    setFormPassword('');
    setFormRole('staff');
    setFormStatus('active');
  };

  // Run Technician Name Standardizing Migration tool
  const triggerTechNameMigration = async () => {
    const confirm = await showConfirm(
      "ยืนยันปรับแก้ชื่อช่างในระบบประวัติคิวงาน",
      "ระบบจะทำการแสกนข้อมูลประวัติการส่งงานเก่าทั้งหมด และเชื่อมโยงงานเก่าเข้ากับชื่อรูปแบบทางการของช่างชิ้นใหม่ (CTxxxxxxx) โดยอัตโนมัติ ต้องการดำเนินการใช่หรือไม่?",
      { icon: "🔄" }
    );
    if (!confirm) return;

    setLoading(true);
    setLoadingText("กำลังปรับแต่งและย้ายประวัติข้อมูลช่างในระบบ...");

    const nameMap: Record<string, string> = {
      'CT-CHAYAPHON W.': 'CT8711017 - [DSC] CT-CHR-CHAYAPHON W.',
      'CT-SATHAPHON T.': 'CT8710995 - [DSC] CT-CHR-SATHAPHON T.',
      'CT-NATTHAWAT S.': 'CT8711048 - [DSC] CT-CHR-NATTHAWAT S.',
      'CT-SIRIKORN P.': 'CT8711067 - [DSC] CT-CHR-SIRIKORN P.',
      'CT-NATTHAWAT W.': 'CT8711038 - [DSC] CT-CHR-NATTHAWAT W.',
      'CT-NARUEPON K.': 'CT8700288 - [DSC] CT-CHR-NARUEPON K.',
      'ACI-PHOLSAK T.': 'CT8711046 - [DSC] ACI-CHR-PHOLSAK T.',
      'CT-CHIANGRAI': 'CT8700872 - [DSC] CT-CHR-CHIANGRAI'
    };

    try {
      const db = getDb();
      
      // 1. Fetch and migrate submissions (history)
      const subSnapshot = await getDocs(collection(db, 'submissions'));
      let subCount = 0;
      let batch = writeBatch(db);
      let opCount = 0;

      subSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const oldName = data.name ? String(data.name).trim() : "";
        const oldAssignedTo = data.assigned_to ? String(data.assigned_to).trim() : "";
        
        let needsUpdate = false;
        const updatePayload: Record<string, any> = {};
        
        if (nameMap[oldName]) {
          updatePayload.name = nameMap[oldName];
          needsUpdate = true;
        }
        if (nameMap[oldAssignedTo]) {
          updatePayload.assigned_to = nameMap[oldAssignedTo];
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          batch.update(docSnap.ref, updatePayload);
          subCount++;
          opCount++;
          
          if (opCount === 400) {
            batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      });

      // 2. Fetch and migrate assigned_jobs (queue)
      const jobsSnapshot = await getDocs(collection(db, 'assigned_jobs'));
      let jobsCount = 0;

      jobsSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const oldAssignedTo = data.assigned_to ? String(data.assigned_to).trim() : "";
        
        if (nameMap[oldAssignedTo]) {
          batch.update(docSnap.ref, { assigned_to: nameMap[oldAssignedTo] });
          jobsCount++;
          opCount++;
          
          if (opCount === 400) {
            batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      });

      if (opCount > 0) {
        await batch.commit();
      }
      
      showToast(`🎉 อัปเดตประวัติสำเร็จ ${subCount} รายการ และคิวงาน ${jobsCount} รายการเรียบร้อยครับ!`, "success");
    } catch (err: any) {
      console.error("Migration failed:", err);
      showToast("ไม่สามารถย้ายข้อมูลได้: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      showToast("ขนาดไฟล์รูปภาพห้ามเกิน 800KB นะครับ เพื่อป้องกันระบบฐานข้อมูลช้า ⚠️", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setter(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50/50 font-sans">
      <Sidebar />
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />

      <main className="flex-1 pt-24 pb-6 px-4 lg:p-8 overflow-y-auto">

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Left Column: Settings Tab Navigation Menu */}
          <div className="w-full lg:w-72 shrink-0">
            <div className="glass-card p-5">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 pl-2 Prompt">
                เมนูการตั้งค่า
              </h3>
              <div className="space-y-1">
                {[
                  { id: 'theme', label: 'ปรับแต่งธีมและระบบ', icon: Sliders },
                  { id: 'gdrive', label: 'เชื่อมต่อ Google Drive', icon: Key },
                  { id: 'apis', label: 'การแจ้งเตือน Telegram', icon: Send },
                  { id: 'filesize', label: 'ขนาดไฟล์สูงสุด', icon: Sliders },
                  { id: 'users', label: 'จัดการบัญชีผู้ใช้งาน', icon: Users },
                  { id: 'normalizer', label: 'เครื่องมือชื่อช่าง (Normalizer)', icon: Database }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeSettingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSettingTab(tab.id as any)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all duration-200 Prompt text-left cursor-pointer ${
                        isActive
                          ? 'bg-[var(--primary-light,#f5f3ff)] text-[var(--primary-color,#6366f1)] font-bold shadow-xs'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[var(--primary-color,#6366f1)]' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Settings Tab Panel */}
          <div className="flex-grow w-full min-w-0">
            <AnimatePresence mode="wait">
              {activeSettingTab === 'theme' && (
                <motion.section
                  key="theme"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="glass-card p-6 space-y-6"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      🎨
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">ปรับแต่งธีมและระบบ (Theme & System Customizer)</h2>
                      <p className="text-xs text-slate-400 Sarabun">ปรับแต่งชื่อระบบ รูปโลโก้ สีสันธีม Sidebar การติดตั้ง PWA และข้อความของเมนูระบบ</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveParameters} className="space-y-6 text-xs font-semibold">
                    {/* Section 1: System Info & Title */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-800 Prompt">📢 ข้อมูลและชื่อของระบบ (System Info & Title)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อระบบแสดงผลหลัก (App Name)
                          </label>
                          <input
                            type="text"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ข้อความย่อยใต้แอป (App Subtitle)
                          </label>
                          <input
                            type="text"
                            value={appSubtitle}
                            onChange={(e) => setAppSubtitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          ธีมสีเริ่มต้นประจำโครงการ (Base Accent Color)
                        </label>
                        <div className="relative">
                          <select
                            value={appTheme}
                            onChange={(e) => setAppTheme(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 transition appearance-none Prompt cursor-pointer"
                          >
                            <option value="theme-indigo">🔵 Indigo (สีน้ำเงินม่วงเข้ม)</option>
                            <option value="theme-blue">🔹 Ocean Blue (สีฟ้าโควิดเดิม)</option>
                            <option value="theme-emerald">🟢 Emerald Green (สีเขียวเสถียร)</option>
                            <option value="theme-violet">🟣 Royal Violet (สีม่วงอัญชัน)</option>
                            <option value="theme-rose">🔴 Rose Gold (สีแดงกุหลาบ)</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Sidebar Colors & Mockup Preview */}
                    <div className="border-t border-slate-100 pt-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-slate-800 Prompt">🎨 ตั้งค่าโทนสีแถบข้างและตัวอย่างจำลอง (Sidebar Theme & Preview)</h3>
                        <button
                          type="button"
                          onClick={async () => {
                            setSidebarBg('#1e293b');
                            setSidebarText('#94a3b8');
                            setSidebarActiveBg('#4f46e5');
                            setSidebarActiveText('#ffffff');
                            setSidebarHoverBg('#334155');
                            try {
                              await updateSystemSettings({
                                sidebar_bg: '#1e293b',
                                sidebar_text: '#94a3b8',
                                sidebar_active_bg: '#4f46e5',
                                sidebar_active_text: '#ffffff',
                                sidebar_hover_bg: '#334155'
                              });
                              showToast("รีเซ็ตสีเริ่มต้นและอัปเดตระบบเรียบร้อยครับ 🎨", "success");
                            } catch (err) {
                              showToast("รีเซ็ตสีบนหน้าจอชั่วคราวแล้วครับ (ไม่สามารถบันทึกลงฐานข้อมูลได้เนื่องจากติด Quota)", "info");
                            }
                          }}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-600 rounded-lg transition Prompt cursor-pointer"
                        >
                          รีเซ็ตเป็นค่าเริ่มต้น
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        {/* Color inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">สีพื้นหลัง Sidebar</label>
                            <div className="flex gap-2 items-center">
                              <input type="color" value={parseToHex6(sidebarBg, '#1e293b')} onChange={(e) => setSidebarBg(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200" />
                              <input type="text" value={sidebarBg} onChange={(e) => setSidebarBg(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none" />
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">สีข้อความ/ไอคอนปกติ</label>
                            <div className="flex gap-2 items-center">
                              <input type="color" value={parseToHex6(sidebarText, '#94a3b8')} onChange={(e) => setSidebarText(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200" />
                              <input type="text" value={sidebarText} onChange={(e) => setSidebarText(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none" />
                            </div>
                          </div>
 
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">สีพื้นหลังเมื่อเลือก (Active)</label>
                            <div className="flex gap-2 items-center">
                              <input type="color" value={parseToHex6(sidebarActiveBg, '#4f46e5')} onChange={(e) => setSidebarActiveBg(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200" />
                              <input type="text" value={sidebarActiveBg} onChange={(e) => setSidebarActiveBg(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none" />
                            </div>
                          </div>
 
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">สีข้อความเมื่อเลือก (Active)</label>
                            <div className="flex gap-2 items-center">
                              <input type="color" value={parseToHex6(sidebarActiveText, '#ffffff')} onChange={(e) => setSidebarActiveText(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200" />
                              <input type="text" value={sidebarActiveText} onChange={(e) => setSidebarActiveText(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none" />
                            </div>
                          </div>
 
                          <div className="space-y-1 sm:col-span-2">
                            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">สีพื้นหลังเมื่อชี้ (Hover)</label>
                            <div className="flex gap-2 items-center">
                              <input type="color" value={parseToHex6(sidebarHoverBg, '#334155')} onChange={(e) => setSidebarHoverBg(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200" />
                              <input type="text" value={sidebarHoverBg} onChange={(e) => setSidebarHoverBg(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none" />
                            </div>
                          </div>
                        </div>

                        {/* Mockup Preview */}
                        <div className="border border-slate-100 rounded-2xl p-4 flex flex-col justify-center items-center bg-slate-50 relative overflow-hidden min-h-[220px]">
                          <span className="absolute top-2 right-3 text-[9px] text-slate-400 font-bold tracking-widest uppercase Prompt">ตัวอย่างหน้าจริง (Mockup Preview)</span>
                          
                          <div 
                            className="w-full max-w-[260px] rounded-2xl shadow-md overflow-hidden flex flex-col border border-white/10"
                            style={{ backgroundColor: sidebarBg }}
                          >
                            {/* Branding mockup */}
                            <div className="p-4 border-b border-white/5 flex flex-col items-center">
                              <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center p-1.5 mb-2">
                                {appLogo ? (
                                  <img src={appLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                ) : (
                                  <span className="text-[10px] font-black text-white">CW</span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-white leading-none Prompt text-center">{appName || 'Coway Stock'}</span>
                              <span className="text-[7px] text-slate-400 font-semibold tracking-wider uppercase mt-1 leading-none Prompt text-center">{appSubtitle || 'Upfile System'}</span>
                            </div>

                            {/* Menu items mockup */}
                            <div className="p-3 space-y-1 text-[10px]">
                              <div 
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-semibold transition"
                                style={{ backgroundColor: sidebarActiveBg, color: sidebarActiveText }}
                              >
                                <span>📊</span>
                                <span>{menuDashboard || 'ตารางงานคิว/ประวัติ'}</span>
                              </div>
                              <div 
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-semibold transition"
                                style={{ color: sidebarText }}
                              >
                                <span>📤</span>
                                <span>{menuImport || 'นำเข้างาน/จ่ายงาน'}</span>
                              </div>
                              <div 
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer"
                                style={{ color: sidebarText }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = sidebarHoverBg;
                                  e.currentTarget.style.color = sidebarActiveText;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.color = sidebarText;
                                }}
                              >
                                <span>⚙️</span>
                                <span>{menuSettings || 'ตั้งค่าระบบ'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Branding Images Upload */}
                    <div className="border-t border-slate-100 pt-5 space-y-4">
                      <h3 className="text-xs font-bold text-slate-800 Prompt">🖼️ รูปภาพสัญลักษณ์แบรนด์ระบบ (Branding Assets)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Logo Upload */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 flex flex-col items-center justify-between text-center space-y-3">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">โลโก้ระบบหลัก (System Logo)</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">ขนาดแนะนำ 200x200px ไฟล์ .png/.jpeg ไม่เกิน 800KB</span>
                          </div>
                          <div className="w-16 h-16 bg-white rounded-xl border border-slate-200/50 flex items-center justify-center p-2 relative">
                            {appLogo ? (
                              <>
                                <img src={appLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                <button type="button" onClick={() => setAppLogo('')} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold">X</button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300">ไม่มีรูปภาพ</span>
                            )}
                          </div>
                          <label className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-bold cursor-pointer transition Prompt">
                            เลือกรูปโลโก้
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setAppLogo)} />
                          </label>
                        </div>

                        {/* Favicon Upload */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 flex flex-col items-center justify-between text-center space-y-3">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">รูป Favicon (Tab Icon)</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">ไอคอนบนแถบแท็บเว็บเบราว์เซอร์ ไม่เกิน 800KB</span>
                          </div>
                          <div className="w-16 h-16 bg-white rounded-xl border border-slate-200/50 flex items-center justify-center p-2 relative">
                            {appFavicon ? (
                              <>
                                <img src={appFavicon} alt="Favicon" className="max-w-full max-h-full object-contain" />
                                <button type="button" onClick={() => setAppFavicon('')} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold">X</button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300">ไม่มีรูปภาพ</span>
                            )}
                          </div>
                          <label className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-bold cursor-pointer transition Prompt">
                            เลือกรูป Favicon
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setAppFavicon)} />
                          </label>
                        </div>

                        {/* PWA Icon Upload */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 flex flex-col items-center justify-between text-center space-y-3">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">ไอคอน PWA (Launcher Icon)</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">ไอคอนสำหรับแอปพลิเคชันบนจอมือถือ ไม่เกิน 800KB</span>
                          </div>
                          <div className="w-16 h-16 bg-white rounded-xl border border-slate-200/50 flex items-center justify-center p-2 relative">
                            {pwaIcon ? (
                              <>
                                <img src={pwaIcon} alt="PWA Icon" className="max-w-full max-h-full object-contain" />
                                <button type="button" onClick={() => setPwaIcon('')} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold">X</button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300">ไม่มีรูปภาพ</span>
                            )}
                          </div>
                          <label className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-bold cursor-pointer transition Prompt">
                            เลือกรูป PWA
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setPwaIcon)} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Section 4: PWA Installer Metadata */}
                    <div className="border-t border-slate-100 pt-5 space-y-4">
                      <h3 className="text-xs font-bold text-slate-800 Prompt">📱 ข้อมูลสำหรับเว็บแอปพลิเคชันติดตั้ง PWA (PWA Metadata Setup)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อแอปพลิเคชันบนหน้าจอ PWA (PWA App Name)
                          </label>
                          <input
                            type="text"
                            placeholder="ชื่อเต็มของแอปพลิเคชันในโหมดติดตั้ง"
                            value={pwaName}
                            onChange={(e) => setPwaName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อแอป PWA แบบสั้น (PWA Short Name)
                          </label>
                          <input
                            type="text"
                            placeholder="ชื่อสั้นที่จะแสดงผลใต้ไอคอนบนโฮมสกรีน"
                            value={pwaShort}
                            onChange={(e) => setPwaShort(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            คำอธิบายเว็บแอป PWA (PWA Description)
                          </label>
                          <textarea
                            rows={2}
                            placeholder="รายละเอียดวัตถุประสงค์ของเว็บแอปพลิเคชัน PWA"
                            value={pwaDesc}
                            onChange={(e) => setPwaDesc(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt resize-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 5: Sidebar Menu Labels */}
                    <div className="border-t border-slate-100 pt-5 space-y-4">
                      <h3 className="text-xs font-bold text-slate-800 Prompt">📝 แก้ไขข้อความป้ายเมนูบนแผงควบคุม Sidebar</h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อเมนู: แดชบอร์ดตารางงาน/ประวัติ
                          </label>
                          <input
                            type="text"
                            placeholder="ตารางงานคิว/ประวัติ"
                            value={menuDashboard}
                            onChange={(e) => setMenuDashboard(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อเมนู: นำเข้างานและจ่ายงาน
                          </label>
                          <input
                            type="text"
                            placeholder="นำเข้างาน/จ่ายงาน"
                            value={menuImport}
                            onChange={(e) => setMenuImport(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อเมนู: หน้าต่างส่งงานของช่าง
                          </label>
                          <input
                            type="text"
                            placeholder="งานค้างส่งของฉัน"
                            value={menuSubmit}
                            onChange={(e) => setMenuSubmit(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            ชื่อเมนู: หน้าตั้งค่าพารามิเตอร์ระบบ
                          </label>
                          <input
                            type="text"
                            placeholder="ตั้งค่าระบบ"
                            value={menuSettings}
                            onChange={(e) => setMenuSettings(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>บันทึกตั้งค่าธีมและชื่อระบบ</span>
                    </button>
                  </form>
                </motion.section>
              )}

              {activeSettingTab === 'gdrive' && (
                <motion.section
                  key="gdrive"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="glass-card p-6 space-y-6"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      ☁️
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">เชื่อมต่อ Google Drive (GDrive Cloud Connection)</h2>
                      <p className="text-xs text-slate-400 Sarabun">กู้คืนสิทธิ์ หรือลงทะเบียนการจัดส่งใบงานพนักงานตรงไปยังคลาวด์บริษัท</p>
                    </div>
                  </div>

                  {gdrivePrefs && gdrivePrefs.connected ? (
                    <div className="space-y-4 font-semibold Sarabun text-xs">
                      <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl">
                        <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider block Prompt">สถานะการเชื่อมต่อ</span>
                        <p className="text-sm font-bold mt-1">🟢 เชื่อมต่อกับบัญชี Google Drive สำเร็จแล้ว</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider Prompt">บัญชีที่ลงทะเบียน</span>
                          <p className="text-xs font-bold text-slate-700 mt-1 break-all">{gdrivePrefs.email || 'Connected Account'}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider Prompt">โฟลเดอร์สำรองข้อมูลเริ่มต้น</span>
                          <p className="text-xs font-bold text-slate-700 mt-1 break-all">{gdrivePrefs.folderName || 'Upfile Data Center'}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleReauthorizeGDrive}
                          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex-1"
                        >
                          ต่ออายุสิทธิ์เชื่อมต่อ (Refresh Token)
                        </button>
                        <button
                          onClick={handleDisconnectGDrive}
                          className="px-5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl transition Prompt cursor-pointer text-center"
                        >
                          ตัดการเชื่อมต่อคลาวด์
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-2xl flex items-start gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                        <div className="text-[10px] Sarabun font-semibold leading-relaxed space-y-1">
                          <p>🔐 <b>ระบบ Refresh Token (ถาวร):</b> หลังเชื่อมต่อสำเร็จ ระบบจะต่ออายุ Token ให้อัตโนมัติทุกครั้ง ไม่ต้องกดต่ออายุเองอีกเลย!</p>
                          <p>📋 <b>ต้องเตรียม:</b> Client ID และ Client Secret จาก Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client IDs</p>
                          <p>⚠️ ต้องเพิ่ม <code className="bg-indigo-100 px-1 rounded">http://localhost:3000</code> และโดเมนจริงของคุณใน <b>Authorized JavaScript Origins</b> ด้วยนะครับ</p>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs font-semibold">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          Google Client ID
                        </label>
                        <input
                          type="text"
                          placeholder="xxxxxxxxx-xxxxxxxxx.apps.googleusercontent.com"
                          value={gdriveClientIdInput}
                          onChange={(e) => setGdriveClientIdInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                      </div>

                      <div className="space-y-1 text-xs font-semibold">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          Google Client Secret
                        </label>
                        <input
                          type="password"
                          placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                          value={gdriveClientSecretInput}
                          onChange={(e) => setGdriveClientSecretInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                        <p className="text-[9px] text-slate-400 Sarabun">รหัสลับนี้จะถูกส่งไปเก็บบนเซิร์ฟเวอร์ (Firestore) เท่านั้น ไม่มีการแสดงในหน้าเว็บอีก</p>
                      </div>

                      <button
                        onClick={handleConnectGDrive}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <span>🔑</span>
                        <span>เชื่อมต่อด้วย Refresh Token (เชื่อมต่อถาวร)</span>
                      </button>
                    </div>
                  )}
                </motion.section>
              )}

              {activeSettingTab === 'apis' && (
                <motion.section
                  key="apis"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="glass-card p-6 space-y-6"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      📢
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">การแจ้งเตือน Telegram (Telegram Integration)</h2>
                      <p className="text-xs text-slate-400 Sarabun">ส่งรายงานการแจ้งเตือนงานช่างไปยังกลุ่มแชทกลุ่มงานของช่างเทคนิคโดยตรง</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveParameters} className="space-y-5 text-xs font-semibold">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 Prompt">การส่งสัญญาณแจ้งเตือน</h4>
                        <p className="text-[10px] text-slate-400 Sarabun mt-0.5">เปิดหรือปิดระบบยิงข้อความรายละเอียดงานส่งช่างอัตโนมัติ</p>
                      </div>
                      <div className="relative">
                        <select
                          value={telegramStatus}
                          onChange={(e) => setTelegramStatus(e.target.value as any)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none focus:border-indigo-500 transition appearance-none cursor-pointer"
                        >
                          <option value="enabled">เปิดใช้งาน</option>
                          <option value="disabled">ปิดการเตือน</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {telegramStatus === 'enabled' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            Telegram Token บอท
                          </label>
                          <input
                            type="password"
                            value={telegramToken}
                            onChange={(e) => setTelegramToken(e.target.value)}
                            placeholder="บอท API token"
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            รหัสแชทกลุ่ม (Telegram Chat ID)
                          </label>
                          <input
                            type="text"
                            value={telegramChatId}
                            onChange={(e) => setTelegramChatId(e.target.value)}
                            placeholder="รหัสกลุ่มแชทปลายทาง (เช่น -100xxxxxxxx)"
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition font-mono"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        className="flex-1 py-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5 border border-emerald-200"
                      >
                        <Send className="w-4 h-4" />
                        <span>ทดสอบส่งข้อความ</span>
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        <span>บันทึกการตั้งค่า Telegram</span>
                      </button>
                    </div>
                  </form>

                  {/* Push Notification Section */}
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 pt-4">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      🔔
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">การแจ้งเตือน Push Notification (Web Push)</h2>
                      <p className="text-xs text-slate-400 Sarabun">ส่งแจ้งเตือนเด้งขึ้นหน้าจอ PC/มือถือ โดยตรงผ่าน Firebase Cloud Messaging (FCM)</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveParameters} className="space-y-5 text-xs font-semibold">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 Prompt">การส่งสัญญาณ Push Notification</h4>
                        <p className="text-[10px] text-slate-400 Sarabun mt-0.5">เปิดหรือปิดระบบส่งข้อความแจ้งเตือนหน้าจออุปกรณ์ภายนอก</p>
                      </div>
                      <div className="relative">
                        <select
                          value={pushStatus}
                          onChange={(e) => setPushStatus(e.target.value as any)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none focus:border-indigo-500 transition appearance-none cursor-pointer"
                        >
                          <option value="enabled">เปิดใช้งาน</option>
                          <option value="disabled">ปิดการเตือน</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Collapsible Setup Guide */}
                    <details className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 cursor-pointer">
                      <summary className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider Prompt select-none">
                        📖 ดูคู่มือขั้นตอนดาวน์โหลดคีย์ Firebase และตั้งค่าระบบ (คลิกเพื่อแสดง)
                      </summary>
                      <div className="mt-3 text-[11px] text-slate-600 Sarabun leading-relaxed space-y-3 cursor-default border-t border-slate-200/60 pt-3">
                        <div>
                          <p className="font-bold text-slate-800">🔑 1. การสร้าง Web Push Public Key (VAPID Key):</p>
                          <ol className="list-decimal pl-4 mt-1 space-y-1">
                            <li>เปิด <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Firebase Console</a> เลือกโปรเจกต์ของคุณ</li>
                            <li>คลิกที่ไอคอน ฟันเฟือง ⚙️ ด้านซ้ายบนติดกับ Project Overview แล้วเลือก <b>Project settings</b></li>
                            <li>คลิกเลือกแท็บ <b>Cloud Messaging</b></li>
                            <li>เลื่อนลงไปที่ล่างสุดแถว <b>Web configuration</b> &gt; คลิกปุ่ม <b>Generate key pair</b></li>
                            <li>คัดลอกรหัสข้อความยาวๆ ที่ขึ้นมาทั้งหมด นำมาวางที่ช่อง VAPID Key ด้านล่าง</li>
                          </ol>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">📄 2. การรับคีย์ลับ Firebase Service Account JSON:</p>
                          <ol className="list-decimal pl-4 mt-1 space-y-1">
                            <li>ในหน้า Project settings เดิม ให้สลับไปที่แท็บ <b>Service accounts</b> ด้านบน</li>
                            <li>เลื่อนลงมาด้านล่างสุด แล้วคลิกปุ่มสีน้ำเงิน <b>Generate new private key</b> และกดยืนยัน</li>
                            <li>จะมีไฟล์ JSON ดาวน์โหลดลงคอมพิวเตอร์ของคุณ ให้เปิดไฟล์นั้นด้วยโปรแกรมพิมพ์ข้อความ เช่น Notepad</li>
                            <li>คัดลอกข้อความ JSON ทั้งหมดในไฟล์ (รวมเครื่องหมายวงเล็บปีกกา) มาวางในช่อง Service Account JSON</li>
                          </ol>
                        </div>
                      </div>
                    </details>

                    {pushStatus === 'enabled' && (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            Web Push VAPID Public Key
                          </label>
                          <input
                            type="text"
                            value={pushVapidKey}
                            onChange={(e) => setPushVapidKey(e.target.value)}
                            placeholder="คีย์สาธารณะ VAPID Public Key ที่ได้จาก Firebase Console"
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            Firebase Service Account Key JSON
                          </label>
                          <textarea
                            value={pushServiceAccount}
                            onChange={(e) => setPushServiceAccount(e.target.value)}
                            placeholder="วางข้อความ JSON คีย์หลักบริการ เช่น { 'type': 'service_account', ... }"
                            rows={6}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition font-mono leading-normal"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleTestPushNotification}
                        disabled={pushStatus !== 'enabled'}
                        className={`flex-1 py-3.5 font-bold rounded-xl transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5 border ${
                          pushStatus === 'enabled'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        }`}
                      >
                        <Bell className="w-4 h-4" />
                        <span>ทดสอบส่งแจ้งเตือน</span>
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        <span>บันทึกการตั้งค่า Push Noti</span>
                      </button>
                    </div>
                  </form>
                </motion.section>
              )}

              {activeSettingTab === 'filesize' && (
                <motion.section
                  key="filesize"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="glass-card p-6 space-y-6"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      💾
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">พารามิเตอร์ขีดจำกัดขนาดไฟล์ (Upload Limits)</h2>
                      <p className="text-xs text-slate-400 Sarabun">กําหนดขนาดสูงสุดของไฟล์ PDF ใบงาน และไฟล์วิดีโอเพื่อควบคุมปริมาณพื้นที่เก็บคลาวด์</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveParameters} className="space-y-5 text-xs font-semibold">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          ขนาด PDF สูงสุด (MB)
                        </label>
                        <input
                          type="number"
                          value={maxSizePdf}
                          onChange={(e) => setMaxSizePdf(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          ขนาดวิดีโอสูงสุด (MB)
                        </label>
                        <input
                          type="number"
                          value={maxSizeVideo}
                          onChange={(e) => setMaxSizeVideo(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer text-center flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>บันทึกขีดจำกัดขนาดไฟล์</span>
                    </button>
                  </form>
                </motion.section>
              )}

              {activeSettingTab === 'users' && (
                <motion.div
                  key="users"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-8"
                >
                  {/* User Form Box */}
                  <section className="glass-card p-6 space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
                        👤
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-800 Prompt">
                          {editUserTarget ? 'แก้ไขบัญชีผู้ใช้' : 'เพิ่มผู้ใช้งานระบบใหม่'}
                        </h2>
                        <p className="text-xs text-slate-400 Sarabun">กําหนดบทบาทพนักงาน คัดกรองเข้าหน้าต่างระบบ</p>
                      </div>
                    </div>

                    <form onSubmit={handleSaveUser} className="space-y-4 text-xs font-semibold">
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          รหัสพนักงาน (Username)
                        </label>
                        <input
                          type="text"
                          value={formUsername}
                          onChange={(e) => setFormUsername(e.target.value)}
                          disabled={editUserTarget === 'admin'}
                          placeholder="รหัสพนักงาน (เช่น CT8711017)"
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition Prompt"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          {editUserTarget ? 'รหัสผ่านใหม่ (ปล่อยว่างเพื่อใช้รหัสเดิม)' : 'รหัสผ่าน (Password)'}
                        </label>
                        <input
                          type="password"
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                          placeholder={editUserTarget ? 'กรอกรหัสผ่านใหม่ที่นี่' : 'กรอกรหัสผ่านสำหรับเข้าสู่ระบบ'}
                          className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                          ชื่อ-นามสกุล ช่างในระบบ
                        </label>
                        <input
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="ชื่อผู้แสดงผลช่าง (เช่น CT-CHAYAPHON W.)"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            บทบาทผู้ใช้
                          </label>
                          <div className="relative">
                            <select
                              value={formRole}
                              onChange={(e) => setFormRole(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 transition appearance-none Prompt cursor-pointer"
                            >
                              <option value="staff">ช่างเทคนิค (Staff)</option>
                              <option value="admin">แอดมิน (Admin)</option>
                              <option value="auditor">ผู้ตรวจ (Auditor)</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                            สถานะบัญชี
                          </label>
                          <div className="relative">
                            <select
                              value={formStatus}
                              onChange={(e) => setFormStatus(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 transition appearance-none Prompt cursor-pointer"
                            >
                              <option value="active">ปกติ (Active)</option>
                              <option value="inactive">ระงับ (Inactive)</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {editUserTarget && (
                          <button
                            type="button"
                            onClick={handleCancelUserEdit}
                            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition Prompt cursor-pointer flex-1"
                          >
                            ยกเลิก
                          </button>
                        )}
                        <button
                          type="submit"
                          className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 Prompt cursor-pointer flex-1"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>{editUserTarget ? 'บันทึกแก้ไข' : 'เพิ่มผู้ใช้งาน'}</span>
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Users List Box */}
                  <section className="glass-card p-6 flex flex-col">
                    <h3 className="text-xs font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3 Prompt">
                      👥 รายการพนักงานในระบบ ({users.length})
                    </h3>
                    
                    {userLoading ? (
                      <div className="w-full text-center py-8 text-xs text-slate-400">กำลังโหลด...</div>
                    ) : (
                      <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1 flex-grow">
                        {users.map((u) => (
                          <div key={u.username} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/50 transition">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate Prompt leading-none">{u.name}</p>
                              <span className="text-[9px] text-slate-400 font-bold font-mono tracking-tight block mt-1 uppercase">
                                {u.username} | {u.role === 'admin' ? 'Admin' : u.role === 'auditor' ? 'Auditor' : 'Staff'} | {u.status}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0 ml-3">
                              <button
                                onClick={() => handleEditUser(u)}
                                className="p-1.5 hover:bg-slate-200/50 text-indigo-600 rounded-lg transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.username)}
                                className="p-1.5 hover:bg-slate-200/50 text-rose-500 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </motion.div>
              )}

              {activeSettingTab === 'normalizer' && (
                <motion.section
                  key="normalizer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="glass-card p-6 space-y-6"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-lg font-bold">
                      🔄
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 Prompt">เครื่องมือปรับแต่งชื่อช่าง (CT Name Normalizer)</h2>
                      <p className="text-xs text-slate-400 Sarabun">เรียกปรับข้อมูลประวัติ และตารางคิวงานเดิมเชื่อมโยงเข้ากับรหัสช่างรูปแบบใหม่ CTxxxxxxx อัตโนมัติ</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <p className="text-xs text-slate-500 leading-relaxed Sarabun flex-grow">
                      เครื่องมือจะใช้ฐานข้อมูล map ชื่อเก่าช่างเทคนิคที่ตรวจเจอใน Excel เข้ากับโครงสร้าง CT ใหม่ และเขียนทับข้อมูลประวัติใบงานทั้งหมดโดยไม่มีการลบข้อมูลสำรอง เพื่อป้องกันปัญหาช่างไม่เห็นคิวงานจ่ายของตัวเองเมื่อนำข้อมูลเข้าจาก Excel
                    </p>
                    <button
                      onClick={triggerTechNameMigration}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-100 transition Prompt cursor-pointer shrink-0"
                    >
                      เริ่มปรับระบบชื่อช่าง
                    </button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
