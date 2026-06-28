'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Send, Users, Shield, Wrench, Bell, Clock, CheckCheck,
  Trash2, RefreshCw, ChevronRight, AlertTriangle, Info, PartyPopper, Settings2,
  CalendarClock, Repeat2,
} from 'lucide-react';
import Sidebar from '@/components/sidebar';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, getDocs,
  addDoc, doc, getDoc, setDoc, deleteDoc, serverTimestamp, writeBatch, Timestamp, where,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getEnglishNameSuffix } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    name: '📋 แจ้งงานค้างส่งช่างรายบุคคล',
    title: 'แจ้งเตือนงานค้างส่งในระบบ',
    body: 'สวัสดีช่าง {ช่าง} ขณะนี้คุณมีงานค้างส่งในระบบทั้งหมด {งานค้าง} รายการ (ติดตั้ง {งานติดตั้ง} รายการ, บริการ {งานบริการ} รายการ) รบกวนเร่งดำเนินการและอัปโหลดไฟล์ใบงานด้วยครับ',
    category: 'announce',
    target: 'staff',
    description: 'ดึงข้อมูลค้างส่งปัจจุบันและคำนวณแยกตามรายช่างรายบุคคลให้อัตโนมัติ',
  },
  {
    name: '📢 ประกาศแจ้งเตือนทั่วไป',
    title: 'ประกาศขอความร่วมมือจากส่วนกลาง',
    body: 'เรียนช่างทุกท่าน รบกวนช่วยตรวจสอบข้อมูลและอัปโหลดเอกสารต่างๆ ให้เสร็จสิ้นเรียบร้อยเพื่อความสะดวกในการดำเนินงานและการตรวจสอบของทีมงาน ขอบคุณในความร่วมมือครับ',
    category: 'announce',
    target: 'staff',
    description: 'ประกาศเตือนทั่วไปเกี่ยวกับข้อตกลงหรือชี้แจงการทำงานทั่วไป',
  },
  {
    name: '⚠️ แจ้งปรับปรุงระบบชั่วคราว',
    title: 'แจ้งปิดปรับปรุงระบบชั่วคราว',
    body: 'ระบบจะทำการปิดปรับปรุงชั่วคราวในวัน [ระบุวัน] เวลา [ระบุเวลา] น. เพื่อปรับปรุงและเพิ่มประสิทธิภาพการใช้งานระบบ ขออภัยในความไม่สะดวกชั่วคราวครับ',
    category: 'warning',
    target: 'all',
    description: 'ประกาศชี้แจ้งกำหนดเวลาปรับปรุงเซิร์ฟเวอร์หรืออัปเดตระบบ',
  },
  {
    name: '🎉 ชื่นชมผลงาน/ขอบคุณช่าง',
    title: 'ยินดีกับยอดการทำงานอันยอดเยี่ยม!',
    body: 'ขอขอบคุณและแสดงความยินดีกับช่างทุกท่านที่ช่วยกันปิดงานและสแกนส่งใบงานได้อย่างยอดเยี่ยมในสัปดาห์นี้ รักษาระดับความเร็วและผลงานนี้ไว้ลุยกันต่อครับ! 🚀',
    category: 'celebrate',
    target: 'all',
    description: 'ส่งข้อความเพื่อเป็นกำลังใจและขอบคุณความทุ่มเทของช่างทุกคน',
  },
];

const CATEGORIES = [
  { emoji: '📢', label: 'ประกาศทั่วไป', value: 'announce', color: 'from-blue-500 to-indigo-600', ring: 'ring-blue-400' },
  { emoji: '⚠️', label: 'แจ้งเตือนสำคัญ', value: 'warning',  color: 'from-amber-500 to-orange-500', ring: 'ring-amber-400' },
  { emoji: '🎉', label: 'ยินดีด้วย', value: 'celebrate', color: 'from-pink-500 to-rose-500', ring: 'ring-pink-400' },
  { emoji: 'ℹ️', label: 'ข้อมูลทั่วไป', value: 'info',  color: 'from-cyan-500 to-sky-600', ring: 'ring-cyan-400' },
  { emoji: '🛠️', label: 'ระบบ', value: 'system', color: 'from-slate-500 to-slate-700', ring: 'ring-slate-400' },
];

const TARGETS = [
  { value: 'all',           label: 'ทุกคน',           sublabel: 'แอดมิน ออดิท และช่างทุกคน', icon: Users,  color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { value: 'admin_auditor', label: 'แอดมิน / ออดิท',  sublabel: 'เฉพาะผู้ดูแลระบบ',           icon: Shield, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { value: 'staff',         label: 'ช่างเทคนิค',       sublabel: 'เฉพาะผู้ใช้ระดับช่าง',       icon: Wrench, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
];

interface BroadcastDoc {
  id: string;
  title: string;
  body: string;
  category: string;
  category_label: string;
  target: string;
  created_by: string;
  created_at: any;
  scheduled_at?: any;
  sent: boolean;
  sent_count: number;
  sent_to?: string[];
  type: 'broadcast';
  user_id?: string;
}

function formatDate(ts: any): string {
  if (!ts) return '-';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getCategoryInfo(val: string) {
  return CATEGORIES.find(c => c.value === val) ?? CATEGORIES[0];
}

function getTargetInfo(val: string) {
  return TARGETS.find(t => t.value === val) ?? TARGETS[0];
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BroadcastPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" /></div>}>
      <BroadcastInner />
    </Suspense>
  );
}

function simulatePlaceholders(text: string): string {
  if (!text) return '';
  return text
    .replaceAll('{ช่าง}', 'สมศักดิ์-chonburi (ตัวอย่าง)')
    .replaceAll('{name}', 'สมศักดิ์-chonburi (ตัวอย่าง)')
    .replaceAll('{งานค้าง}', '5')
    .replaceAll('{tasks}', '5')
    .replaceAll('{งานติดตั้ง}', '2')
    .replaceAll('{ins_tasks}', '2')
    .replaceAll('{งานบริการ}', '3')
    .replaceAll('{as_tasks}', '3');
}

function BroadcastInner() {
  const { currentUser, systemSettings } = useApp();
  const router = useRouter();

  // Guard: admin/auditor only
  useEffect(() => {
    if (currentUser && currentUser.role === 'staff') {
      router.replace('/submit');
    }
  }, [currentUser, router]);

  // Form state
  const [category, setCategory] = useState('announce');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sent, setSent] = useState(false);

  // Schedule state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // Daily reminder state
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailySendHour, setDailySendHour] = useState(8);
  const [dailyCustomBody, setDailyCustomBody] = useState('');
  const [savingDailyConfig, setSavingDailyConfig] = useState(false);

  // History state
  const [history, setHistory] = useState<BroadcastDoc[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHist, setSelectedHist] = useState<BroadcastDoc | null>(null);

  // Staff listing and selection state
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  const cat = getCategoryInfo(category);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const db = getDb();
      const snap = await getDocs(query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(50)
      ));
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BroadcastDoc))
        .filter(d => d.type === 'broadcast' && !d.user_id);
      setHistory(docs);
    } catch (e) {
      console.error('Failed to load broadcast history', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const db = getDb();
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'staff')));
        const list = snap.docs.map(d => ({
          username: d.data().username || '',
          name: d.data().name || d.data().username || ''
        }));
        setStaffList(list);
        setSelectedStaff(list.map(s => s.username));
      } catch (e) {
        console.error('Failed to load staff list', e);
      }
    };
    fetchStaff();
  }, []);

  useEffect(() => {
    const loadDailyConfig = async () => {
      try {
        const db = getDb();
        const snap = await getDoc(doc(db, 'app_config', 'daily_reminder_settings'));
        if (snap.exists()) {
          const d = snap.data();
          setDailyReminderEnabled(d?.enabled ?? false);
          setDailySendHour(d?.send_hour_th ?? 8);
          setDailyCustomBody(d?.custom_body ?? '');
        }
      } catch (e) {
        console.error('Failed to load daily reminder config', e);
      }
    };
    loadDailyConfig();
  }, []);

  const saveDailyConfig = async (patch: Record<string, unknown>) => {
    setSavingDailyConfig(true);
    try {
      const db = getDb();
      await setDoc(doc(db, 'app_config', 'daily_reminder_settings'), patch, { merge: true });
    } catch (e) {
      console.error('Failed to save daily reminder config', e);
      throw e;
    } finally {
      setSavingDailyConfig(false);
    }
  };

  const handleToggleDailyReminder = async (enabled: boolean) => {
    setDailyReminderEnabled(enabled);
    try {
      await saveDailyConfig({ enabled });
    } catch {
      setDailyReminderEnabled(!enabled);
    }
  };

  const handleSaveDailySettings = async () => {
    await saveDailyConfig({
      send_hour_th: dailySendHour,
      custom_body: dailyCustomBody.trim(),
    });
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!systemSettings.push_service_account) {
      alert('กรุณาตั้งค่า Service Account JSON ในหน้า Settings → Push Notification ก่อนครับ');
      return;
    }
    if (isScheduled && !scheduledAt) {
      alert('กรุณาเลือกวันและเวลาที่ต้องการส่งครับ');
      return;
    }
    if (target === 'staff' && selectedStaff.length === 0) {
      alert('กรุณาเลือกช่างเทคนิคอย่างน้อย 1 คนครับ');
      return;
    }

    setSending(true);
    setPreview(false);
    try {
      const db = getDb();
      const catInfo = getCategoryInfo(category);
      const broadcastTitle = `${catInfo.emoji} ${title.trim()}`;
      const msgBody = body.trim();

      const hasPlaceholders =
        title.includes('{ช่าง}') || title.includes('{name}') ||
        title.includes('{งานค้าง}') || title.includes('{tasks}') ||
        title.includes('{งานติดตั้ง}') || title.includes('{ins_tasks}') ||
        title.includes('{งานบริการ}') || title.includes('{as_tasks}') ||
        msgBody.includes('{ช่าง}') || msgBody.includes('{name}') ||
        msgBody.includes('{งานค้าง}') || msgBody.includes('{tasks}') ||
        msgBody.includes('{งานติดตั้ง}') || msgBody.includes('{ins_tasks}') ||
        msgBody.includes('{งานบริการ}') || msgBody.includes('{as_tasks}');

      // 1. Save to Firestore (with optional scheduled_at)
      const payload: Record<string, any> = {
        title: broadcastTitle,
        body: msgBody,
        type: 'broadcast',
        category,
        category_label: catInfo.label,
        target,
        created_by: currentUser?.username || currentUser?.name || 'admin',
        created_at: serverTimestamp(),
        sent: false,
        sent_count: 0,
      };
      if (target === 'staff' && selectedStaff.length > 0) {
        payload.selected_staff = selectedStaff;
      }
      if (hasPlaceholders) {
        payload.has_placeholders = true;
      }
      if (isScheduled && scheduledAt) {
        payload.scheduled_at = Timestamp.fromDate(new Date(scheduledAt));
      }

      const notifRef = await addDoc(collection(db, 'notifications'), payload);

      // 2. If scheduled → done; cron will send it later
      if (isScheduled && scheduledAt) {
        setSent(true);
        setTitle('');
        setBody('');
        setCategory('announce');
        setTarget('all');
        setIsScheduled(false);
        setScheduledAt('');
        fetchHistory();
        setTimeout(() => setSent(false), 4000);
        return;
      }

      // 3. Immediate send — read tokens & call push-notify
      const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
      const fcmTokens = tokensSnap.docs
        .map(d => d.data())
        .filter(d => {
          if (target === 'all') return true;
          if (target === 'admin_auditor') return d.role === 'admin' || d.role === 'auditor';
          if (target === 'staff') {
            if (selectedStaff.length > 0) {
              return d.role === 'staff' && selectedStaff.includes(d.username);
            }
            return d.role === 'staff';
          }
          return true;
        })
        .map(d => ({
          token: d.token as string,
          username: d.username as string,
          name: d.name as string || d.username as string || 'unknown'
        }))
        .filter(t => t.token);

      if (fcmTokens.length > 0) {
        let totalSuccessCount = 0;
        const sentToNames: string[] = [];

        if (hasPlaceholders) {
          // A. Fetch pending jobs
          const jobsSnap = await getDocs(
            query(collection(db, 'assigned_jobs'), where('status', '==', 'pending'))
          );
          const jobsByTech = new Map<string, any[]>();
          jobsSnap.forEach(snap => {
            const job = snap.data();
            const techName = (job.assigned_to as string)?.trim() || '';
            if (!techName) return;
            if (!jobsByTech.has(techName)) jobsByTech.set(techName, []);
            jobsByTech.get(techName)!.push(job);
          });

          // B. Fetch users to map user tokens
          const usersSnap = await getDocs(collection(db, 'users'));
          const allUsers = usersSnap.docs.map(d => d.data());

          // Group tokens by username
          const tokensByUser = new Map<string, typeof fcmTokens>();
          fcmTokens.forEach(t => {
            if (!tokensByUser.has(t.username)) {
              tokensByUser.set(t.username, []);
            }
            tokensByUser.get(t.username)!.push(t);
          });

          const sendPromises = Array.from(tokensByUser.entries()).map(async ([username, userTokens]) => {
            if (userTokens.length === 0) return;

            const user = allUsers.find(u => u.username === username);
            const techName = user?.name || userTokens[0].name || username;

            // Resolve pending jobs for this technician
            const userSuffix = getEnglishNameSuffix(techName);
            const jobs: any[] = [];
            jobsByTech.forEach((jobList, techKey) => {
              if (techKey === techName || techKey === username) {
                jobs.push(...jobList);
                return;
              }
              const techSuffix = getEnglishNameSuffix(techKey);
              if (userSuffix && techSuffix && userSuffix === techSuffix) {
                jobs.push(...jobList);
              }
            });

            const totalJobs = jobs.length;

            // Skip sending if the message has task placeholders and this tech has 0 tasks
            const hasTaskPlaceholders =
              title.includes('{งานค้าง}') || title.includes('{tasks}') ||
              title.includes('{งานติดตั้ง}') || title.includes('{ins_tasks}') ||
              title.includes('{งานบริการ}') || title.includes('{as_tasks}') ||
              msgBody.includes('{งานค้าง}') || msgBody.includes('{tasks}') ||
              msgBody.includes('{งานติดตั้ง}') || msgBody.includes('{ins_tasks}') ||
              msgBody.includes('{งานบริการ}') || msgBody.includes('{as_tasks}');

            if (hasTaskPlaceholders && totalJobs === 0) {
              return;
            }

            const insJobs = jobs.filter(j => j.job_type?.includes('INS') || j.job_type === 'งานติดตั้ง (INS)').length;
            const asJobs = jobs.filter(j => !(j.job_type?.includes('INS') || j.job_type === 'งานติดตั้ง (INS)')).length;

            const resolvedTitle = broadcastTitle
              .replaceAll('{ช่าง}', techName)
              .replaceAll('{name}', techName)
              .replaceAll('{งานค้าง}', String(totalJobs))
              .replaceAll('{tasks}', String(totalJobs))
              .replaceAll('{งานติดตั้ง}', String(insJobs))
              .replaceAll('{ins_tasks}', String(insJobs))
              .replaceAll('{งานบริการ}', String(asJobs))
              .replaceAll('{as_tasks}', String(asJobs));

            const resolvedBody = msgBody
              .replaceAll('{ช่าง}', techName)
              .replaceAll('{name}', techName)
              .replaceAll('{งานค้าง}', String(totalJobs))
              .replaceAll('{tasks}', String(totalJobs))
              .replaceAll('{งานติดตั้ง}', String(insJobs))
              .replaceAll('{ins_tasks}', String(insJobs))
              .replaceAll('{งานบริการ}', String(asJobs))
              .replaceAll('{as_tasks}', String(asJobs));

            // Save individual personal notification doc in Firestore
            const personalNotifRef = await addDoc(collection(db, 'notifications'), {
              title: resolvedTitle,
              body: resolvedBody,
              type: 'broadcast',
              category,
              category_label: catInfo.label,
              target,
              user_id: username,
              created_by: currentUser?.username || currentUser?.name || 'admin',
              created_at: serverTimestamp(),
              sent: false,
              sent_count: 0,
            });

            // Call push-notify
            const pushRes = await fetch('/api/push-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: resolvedTitle,
                body: resolvedBody,
                url: '/notifications',
                serviceAccountJson: systemSettings.push_service_account,
                tokens: userTokens,
                notifId: personalNotifRef.id,
              }),
            });

            if (pushRes.ok) {
              const pushData = await pushRes.json();
              totalSuccessCount += pushData.successCount || 0;
              if (pushData.successCount > 0) {
                sentToNames.push(techName);
              }
            }
          });

          await Promise.all(sendPromises);

          // Update the master broadcast document
          await setDoc(doc(db, 'notifications', notifRef.id), {
            sent: true,
            sent_count: totalSuccessCount,
            sent_to: sentToNames,
          }, { merge: true });

        } else {
          // Standard multicast
          const pushRes = await fetch('/api/push-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: broadcastTitle,
              body: msgBody,
              url: '/notifications',
              serviceAccountJson: systemSettings.push_service_account,
              tokens: fcmTokens,
              notifId: notifRef.id,
            }),
          });
          if (pushRes.ok) {
            const pushData = await pushRes.json();
            totalSuccessCount = pushData.successCount || 0;
          }

          // Update the master broadcast document
          await setDoc(doc(db, 'notifications', notifRef.id), {
            sent: true,
            sent_count: totalSuccessCount,
          }, { merge: true });
        }
      }

      setSent(true);
      setTitle('');
      setBody('');
      setCategory('announce');
      setTarget('all');
      fetchHistory();
      setTimeout(() => setSent(false), 4000);
    } catch (e: any) {
      console.error('Broadcast failed', e);
      alert('ส่งบรอดแคสต์ล้มเหลว: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    if (!window.confirm('ลบประกาศนี้ออกจากทุกคนเลยไหมครับ?')) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'notifications', id));
      setHistory(prev => prev.filter(h => h.id !== id));
      if (selectedHist?.id === id) setSelectedHist(null);
    } catch (e) { console.error(e); }
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50" style={{ touchAction: 'pan-y' }}>
      <Sidebar />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8 overflow-y-auto overflow-x-hidden">

        {/* ── Page Header ── */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-200">
              <Megaphone size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">บรอดแคสต์</h1>
              <p className="text-xs text-slate-500">ส่งประกาศ ข่าวสาร และข้อความแจ้งเตือนถึงผู้ใช้งาน</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* ── Left: Composer ── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="xl:col-span-3 flex flex-col gap-5"
          >
            {/* Success banner */}
            <AnimatePresence>
              {sent && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3"
                >
                  <CheckCheck size={18} className="text-green-600 shrink-0" />
                  <p className="text-sm font-semibold text-green-700">
                    {isScheduled ? 'บันทึกตั้งเวลาส่งเรียบร้อยแล้ว! ⏰' : 'ส่งบรอดแคสต์เรียบร้อยแล้ว! 🎉'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Template selector */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📋 เลือกจากเทมเพลตด่วน</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TEMPLATES.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTitle(t.title);
                      setBody(t.body);
                      setCategory(t.category);
                      setTarget(t.target);
                    }}
                    className="flex flex-col text-left p-3.5 rounded-2xl border-2 border-slate-100 hover:border-rose-400 hover:bg-rose-50/10 transition-all group"
                  >
                    <span className="text-xs font-bold text-slate-700 group-hover:text-rose-600 transition-colors">{t.name}</span>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-2">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Category selector */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">หมวดหมู่ประกาศ</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                      category === c.value
                        ? `bg-gradient-to-r ${c.color} text-white border-transparent shadow-md`
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-base leading-none">{c.emoji}</span>
                    <span className="text-xs">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                หัวข้อประกาศ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 80))}
                placeholder="ระบุหัวข้อข้อความที่ต้องการแจ้งเตือน..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
              <p className="text-right text-[10px] text-slate-400 mt-1">{title.length}/80</p>
            </div>

            {/* Body */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                ข้อความ <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value.slice(0, 400))}
                rows={5}
                placeholder="พิมพ์ข้อความประกาศ ข่าวสาร หรือข้อมูลที่ต้องการแจ้งให้ทราบ..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
              />
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-start mt-2.5 gap-2">
                <div className="flex-1 text-[10px] text-rose-500 bg-rose-50/50 rounded-xl p-2.5 border border-rose-100">
                  <p className="font-bold mb-1">💡 ตัวแปรระบบช่างและงานค้าง (ระบบจะตรวจจับและแทนที่ตามจริงของช่างแต่ละคน):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 font-medium text-slate-600">
                    <div>• <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{ช่าง}`}</code> หรือ <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{name}`}</code> : ชื่อช่าง</div>
                    <div>• <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{งานค้าง}`}</code> หรือ <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{tasks}`}</code> : งานค้างทั้งหมด</div>
                    <div>• <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{งานติดตั้ง}`}</code> หรือ <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{ins_tasks}`}</code> : งานติดตั้งค้าง (INS)</div>
                    <div>• <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{งานบริการ}`}</code> หรือ <code className="bg-white px-1 py-0.5 rounded text-rose-600 font-bold font-mono">{`{as_tasks}`}</code> : งานบริการค้าง (AS)</div>
                  </div>
                </div>
                <p className="text-right text-[10px] text-slate-400 self-end whitespace-nowrap">{body.length}/400</p>
              </div>
            </div>

            {/* Target */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">ส่งถึง</p>
              <div className="flex flex-col gap-2">
                {TARGETS.map(t => {
                  const Icon = t.icon;
                  return (
                    <label
                      key={t.value}
                      className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                        target === t.value ? t.color + ' border-current/30' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="target"
                        value={t.value}
                        checked={target === t.value}
                        onChange={() => {
                          setTarget(t.value);
                          if (t.value !== 'staff') {
                            setSelectedStaff([]);
                          } else {
                            setSelectedStaff(staffList.map(s => s.username));
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        target === t.value ? 'bg-current/10' : 'bg-slate-100'
                      }`}>
                        <Icon size={16} className={target === t.value ? 'inherit' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.label}</p>
                        <p className="text-[11px] text-slate-500">{t.sublabel}</p>
                      </div>
                      <div className="ml-auto">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                          target === t.value ? 'border-current bg-current' : 'border-slate-300'
                        }`}>
                          {target === t.value && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {target === 'staff' && staffList.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">เลือกช่างที่จะส่งถึง ({selectedStaff.length} คน)</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStaff(staffList.map(s => s.username))}
                        className="text-[10px] text-indigo-500 hover:underline font-bold"
                      >
                        เลือกทั้งหมด
                      </button>
                      <span className="text-[10px] text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedStaff([])}
                        className="text-[10px] text-rose-500 hover:underline font-bold"
                      >
                        ล้างทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {staffList.map(s => {
                      const isChecked = selectedStaff.includes(s.username);
                      return (
                        <button
                          key={s.username}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setSelectedStaff(prev => prev.filter(u => u !== s.username));
                            } else {
                              setSelectedStaff(prev => [...prev, s.username]);
                            }
                          }}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold text-left transition-all ${
                            isChecked
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isChecked && <CheckCheck size={10} />}
                          </div>
                          <span className="truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule send */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <CalendarClock size={17} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">ตั้งเวลาส่ง</p>
                    <p className="text-[11px] text-slate-400">ส่งทันทีหรือเลือกวัน-เวลาล่วงหน้า</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsScheduled(v => !v); setScheduledAt(''); }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${isScheduled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${isScheduled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {isScheduled && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">วัน-เวลาที่ต้องการส่ง</p>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  />
                  {scheduledAt && (
                    <p className="text-[11px] text-indigo-500 flex items-center gap-1">
                      <Clock size={11} />
                      จะส่งวันที่ {new Date(scheduledAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Daily auto-reminder toggle */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${dailyReminderEnabled ? 'bg-indigo-500' : 'bg-slate-100'}`}>
                    <Repeat2 size={17} className={dailyReminderEnabled ? 'text-white' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">แจ้งเตือนรายวันอัตโนมัติ</p>
                    <p className="text-[11px] text-slate-400">
                      {String(dailySendHour).padStart(2, '0')}:00 น. ทุกวัน — แจ้งช่างเรื่องงานค้างส่งของแต่ละคน
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleDailyReminder(!dailyReminderEnabled)}
                  disabled={savingDailyConfig}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-60 ${dailyReminderEnabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${dailyReminderEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Editable settings — always visible so admin can adjust even when disabled */}
              <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                {/* Time picker */}
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">เวลาส่ง (ทุกวัน)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[6, 7, 8, 9, 10, 12, 14, 16, 18].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setDailySendHour(h)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          dailySendHour === h
                            ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {String(h).padStart(2, '0')}:00
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom body message */}
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ข้อความเตือน</p>
                  <textarea
                    value={dailyCustomBody}
                    onChange={e => setDailyCustomBody(e.target.value.slice(0, 300))}
                    rows={3}
                    placeholder="กรุณาเข้าระบบตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานให้ครบถ้วนด้วยครับ"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
                  />
                  <p className="text-right text-[10px] text-slate-400 mt-0.5">{dailyCustomBody.length}/300</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">ข้อความนี้จะต่อท้ายหลังจำนวนงานค้างส่งของช่างแต่ละคน</p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveDailySettings}
                  disabled={savingDailyConfig}
                  className="w-full py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold transition disabled:opacity-50"
                >
                  {savingDailyConfig ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setPreview(true)}
                disabled={!title.trim() || !body.trim()}
                className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                👁️ ตัวอย่าง
              </button>
              <button
                onClick={handleSend}
                disabled={!title.trim() || !body.trim() || sending || (isScheduled && !scheduledAt)}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-bold shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-200 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {sending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</>
                ) : isScheduled ? (
                  <><CalendarClock size={16} /> ตั้งเวลาส่ง</>
                ) : (
                  <><Send size={16} /> ส่งบรอดแคสต์</>
                )}
              </button>
            </div>
          </motion.div>

          {/* ── Right: History ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="xl:col-span-2 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">ประวัติการส่ง</p>
              <button onClick={fetchHistory} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
                  <Megaphone size={28} className="text-slate-300" />
                </div>
                <p className="text-slate-400 text-sm">ยังไม่มีประวัติการส่ง</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {history.map((h, i) => {
                  const c = getCategoryInfo(h.category);
                  const isSelected = selectedHist?.id === h.id;
                  return (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`bg-white rounded-2xl border cursor-pointer transition-all overflow-hidden ${
                        isSelected ? 'border-rose-300 ring-2 ring-rose-100 shadow-md' : 'border-slate-200 hover:border-rose-200 hover:shadow-sm'
                      }`}
                      onClick={() => setSelectedHist(isSelected ? null : h)}
                    >
                      <div className="p-3 flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center text-base shrink-0`}>
                          {c.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{h.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{h.body}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-400">{formatDate(h.created_at)}</span>
                            {h.sent ? (
                              <span className="text-[9px] text-green-600 font-bold flex items-center gap-0.5">
                                <CheckCheck size={9} /> {h.sent_count}
                              </span>
                            ) : h.scheduled_at ? (
                              <span className="text-[9px] text-amber-600 font-bold flex items-center gap-0.5">
                                <Clock size={9} /> {formatDate(h.scheduled_at)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <ChevronRight size={14} className={`text-slate-300 transition-transform ${isSelected ? 'rotate-90 text-rose-400' : ''}`} />
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 flex flex-col gap-2 border-t border-slate-100 pt-2">
                              <p className="text-xs text-slate-700 leading-relaxed">{h.body}</p>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                                    {getTargetInfo(h.target).label}
                                  </span>
                                  <span className="text-[10px] text-slate-400">โดย {h.created_by}</span>
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteBroadcast(h.id); }}
                                  className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                                >
                                  <Trash2 size={11} /> ลบ
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {/* ── Preview Modal ── */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Phone notification mockup */}
              <div className={`p-6 bg-gradient-to-br ${cat.color} text-white`}>
                <div className="flex items-center gap-2 mb-4 opacity-70 text-xs font-medium">
                  <Bell size={12} /> ตัวอย่างการแจ้งเตือน
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <img src="/coway-logo-new.png" alt="" className="w-6 h-6 rounded-lg" onError={e => (e.currentTarget.style.display='none')} />
                    <span className="text-white text-xs font-bold">{systemSettings.app_name || 'ระบบส่งงาน'}</span>
                    <span className="text-white/60 text-xs ml-auto">ตอนนี้</span>
                  </div>
                  <p className="text-white font-bold text-sm">{cat.emoji} {simulatePlaceholders(title) || 'หัวข้อประกาศ'}</p>
                  <p className="text-white/80 text-xs mt-1 line-clamp-6 whitespace-pre-wrap">{simulatePlaceholders(body) || 'ข้อความประกาศ...'}</p>
                </div>
              </div>

              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="bg-slate-100 rounded-lg px-2 py-1">{cat.emoji} {cat.label}</span>
                  <span className="bg-slate-100 rounded-lg px-2 py-1">→ {getTargetInfo(target).label}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPreview(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                    แก้ไข
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-bold shadow-lg shadow-rose-200"
                  >
                    <Send size={14} /> ยืนยันส่ง
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
