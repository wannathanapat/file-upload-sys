'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Send, Users, Shield, Wrench, Bell, Clock, CheckCheck,
  Trash2, RefreshCw, ChevronRight, AlertTriangle, Info, PartyPopper, Settings2
} from 'lucide-react';
import Sidebar from '@/components/sidebar';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, getDocs,
  addDoc, doc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';

// ─── Constants ────────────────────────────────────────────────────────────────
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
  sent: boolean;
  sent_count: number;
  type: 'broadcast';
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

  // History state
  const [history, setHistory] = useState<BroadcastDoc[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHist, setSelectedHist] = useState<BroadcastDoc | null>(null);

  const cat = getCategoryInfo(category);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const db = getDb();
      const snap = await getDocs(query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(30)
      ));
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BroadcastDoc))
        .filter(d => d.type === 'broadcast');
      setHistory(docs);
    } catch (e) {
      console.error('Failed to load broadcast history', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!systemSettings.push_service_account) {
      alert('กรุณาตั้งค่า Service Account JSON ในหน้า Settings → Push Notification ก่อนครับ');
      return;
    }

    setSending(true);
    setPreview(false);
    try {
      const db = getDb();
      const catInfo = getCategoryInfo(category);
      const broadcastTitle = `${catInfo.emoji} ${title.trim()}`;

      // 1. Save to Firestore
      const notifRef = await addDoc(collection(db, 'notifications'), {
        title: broadcastTitle,
        body: body.trim(),
        type: 'broadcast',
        category,
        category_label: catInfo.label,
        target,
        created_by: currentUser?.username || currentUser?.name || 'admin',
        created_at: serverTimestamp(),
        sent: false,
        sent_count: 0,
      });

      // 2. Read tokens filtered by target
      const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
      const fcmTokens: string[] = tokensSnap.docs
        .map(d => d.data())
        .filter(d => {
          if (target === 'all') return true;
          if (target === 'admin_auditor') return d.role === 'admin' || d.role === 'auditor';
          if (target === 'staff') return d.role === 'staff';
          return true;
        })
        .map(d => d.token as string)
        .filter(Boolean);

      // 3. Send FCM
      if (fcmTokens.length > 0) {
        await fetch('/api/push-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: broadcastTitle,
            body: body.trim(),
            url: '/notifications',
            serviceAccountJson: systemSettings.push_service_account,
            tokens: fcmTokens,
            notifId: notifRef.id,
          }),
        });
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
                  <p className="text-sm font-semibold text-green-700">ส่งบรอดแคสต์เรียบร้อยแล้ว! 🎉</p>
                </motion.div>
              )}
            </AnimatePresence>

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
              <p className="text-right text-[10px] text-slate-400 mt-1">{body.length}/400</p>
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
                        onChange={() => setTarget(t.value)}
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
                disabled={!title.trim() || !body.trim() || sending}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-bold shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-200 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {sending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังส่ง...</>
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
                            {h.sent && (
                              <span className="text-[9px] text-green-600 font-bold flex items-center gap-0.5">
                                <CheckCheck size={9} /> {h.sent_count}
                              </span>
                            )}
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
                  <p className="text-white font-bold text-sm">{cat.emoji} {title || 'หัวข้อประกาศ'}</p>
                  <p className="text-white/80 text-xs mt-1 line-clamp-3">{body || 'ข้อความประกาศ...'}</p>
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
