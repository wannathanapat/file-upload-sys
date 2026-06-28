'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, CheckCircle2, AlertCircle, Trash2, RefreshCw,
  ChevronRight, FileText, Video, Hash, User, StickyNote,
  CheckCheck, Megaphone, Send, Zap, X,
} from 'lucide-react';
import Sidebar from '@/components/sidebar';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, getDocs, deleteDoc,
  doc, getDoc, writeBatch, startAfter, QueryDocumentSnapshot,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifDoc {
  id: string;
  title: string;
  body: string;
  type: 'job_submit' | 'test' | 'broadcast' | string;
  user_id?: string;
  job_id?: string;
  order_no?: string;
  work_category?: string;
  technician?: string;
  note?: string;
  pdf_url?: string | null;
  video_url?: string | null;
  sent: boolean;
  sent_count?: number;
  sent_to?: string[];
  created_at?: any;
  category?: string;
  category_label?: string;
  target?: string;
  created_by?: string;
  has_placeholders?: boolean;
}

const PAGE_SIZE = 20;

function formatDate(ts: any): string {
  if (!ts) return '-';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const TYPE_CONFIG = {
  job_submit: {
    label: 'ส่งงาน',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    iconBg: 'bg-gradient-to-br from-indigo-500 to-purple-600',
    accentFrom: 'from-indigo-400',
    accentTo: 'to-purple-500',
    icon: <Send size={16} className="text-white" />,
    filterIcon: <Send size={12} />,
  },
  broadcast: {
    label: 'ประกาศ',
    badgeClass: 'bg-rose-100 text-rose-700',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-500',
    accentFrom: 'from-rose-400',
    accentTo: 'to-pink-500',
    icon: <Megaphone size={16} className="text-white" />,
    filterIcon: <Megaphone size={12} />,
  },
  test: {
    label: 'ทดสอบ',
    badgeClass: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-400',
    accentFrom: 'from-amber-400',
    accentTo: 'to-orange-400',
    icon: <Zap size={16} className="text-white" />,
    filterIcon: <Zap size={12} />,
  },
  default: {
    label: 'อื่นๆ',
    badgeClass: 'bg-slate-100 text-slate-600',
    iconBg: 'bg-gradient-to-br from-slate-400 to-slate-500',
    accentFrom: 'from-slate-300',
    accentTo: 'to-slate-400',
    icon: <Bell size={16} className="text-white" />,
    filterIcon: <Bell size={12} />,
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.default;
}

// ─── Inner Component ──────────────────────────────────────────────────────────
function NotificationsInner() {
  const { currentUser } = useApp();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('id');
  const isAdmin = currentUser?.role === 'admin';

  const [notifications, setNotifications] = useState<NotifDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'job_submit' | 'broadcast' | 'test'>('all');
  const [selected, setSelected] = useState<NotifDoc | null>(null);

  const fetchNotifications = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const db = getDb();
      let q = query(collection(db, 'notifications'), orderBy('created_at', 'desc'), limit(PAGE_SIZE));
      if (!reset && lastDoc) {
        q = query(collection(db, 'notifications'), orderBy('created_at', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      }
      const snap = await getDocs(q);
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifDoc));
      const isStaff = currentUser?.role === 'staff';
      const myUsername = currentUser?.username || currentUser?.name || '';
      const docs = isStaff
        ? allDocs.filter(n => (n.type === 'broadcast' && !n.has_placeholders && (!n.user_id || n.user_id === myUsername)) || n.user_id === myUsername)
        : allDocs.filter(n => !(n.type === 'broadcast' && (n.has_placeholders || (n.user_id && n.user_id !== myUsername))));
      const filtered = filter === 'all' ? docs : docs.filter(n => n.type === filter);
      setNotifications(prev => reset ? filtered : [...prev, ...filtered]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  }, [filter, lastDoc]);

  useEffect(() => {
    setLastDoc(null);
    fetchNotifications(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (!deepLinkId) return;
    const fetchSpecific = async () => {
      try {
        const db = getDb();
        const snap = await getDoc(doc(db, 'notifications', deepLinkId));
        if (snap.exists()) {
          const item = { id: snap.id, ...snap.data() } as NotifDoc;
          setSelected(item);
          setNotifications(prev => {
            if (prev.find(n => n.id === item.id)) return prev;
            return [item, ...prev];
          });
        }
      } catch (e) {
        console.warn('Could not fetch specific notification:', e);
      }
    };
    fetchSpecific();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  const handleDelete = async (id: string) => {
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'notifications', id));
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('ลบการแจ้งเตือนทั้งหมดเลยไหมครับ?')) return;
    try {
      const db = getDb();
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
      setNotifications([]);
      setSelected(null);
    } catch (e) {
      console.error('Delete all failed', e);
    }
  };

  const isAdminOrAuditor = currentUser?.role === 'admin' || currentUser?.role === 'auditor';

  const FILTERS = [
    { key: 'all', label: 'ทั้งหมด', icon: <Bell size={12} /> },
    { key: 'job_submit', label: 'ส่งงาน', icon: <Send size={12} /> },
    { key: 'broadcast', label: 'ประกาศ', icon: <Megaphone size={12} /> },
    { key: 'test', label: 'ทดสอบ', icon: <Zap size={12} /> },
  ] as const;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-8">

        {/* ── Header ── */}
        <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-200">
                <Bell size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">ประวัติการแจ้งเตือน</h1>
                <p className="text-slate-400 text-xs mt-0.5">Push Notification History</p>
              </div>
            </div>

            <button
              onClick={() => { setLastDoc(null); fetchNotifications(true); }}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:shadow-sm transition-all"
              title="รีเฟรช"
            >
              <RefreshCw size={16} />
            </button>
          </motion.div>
        </div>

        {/* ── Filter Bar ── */}
        <div className="px-4 sm:px-6 lg:px-8 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl shadow-sm shadow-slate-100 border border-slate-100 p-2 flex items-center gap-2 flex-wrap"
          >
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  filter === f.key
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}

            <div className="flex-1" />

            {isAdminOrAuditor && notifications.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-all"
              >
                <Trash2 size={13} /> ลบทั้งหมด
              </button>
            )}
          </motion.div>
        </div>

        {/* ── Content ── */}
        <div className="px-4 sm:px-6 lg:px-8">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">กำลังโหลด...</p>
            </div>
          ) : notifications.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-24 gap-4"
            >
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                <Bell size={40} className="text-indigo-300" />
              </div>
              <p className="text-slate-600 font-semibold text-lg">ยังไม่มีการแจ้งเตือน</p>
              <p className="text-slate-400 text-sm text-center max-w-xs">
                การแจ้งเตือนจะปรากฏที่นี่เมื่อมีงานส่งเข้ามา
              </p>
            </motion.div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5">

              {/* ── List ── */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <AnimatePresence mode="popLayout">
                  {notifications.map((n, i) => {
                    const cfg = getTypeConfig(n.type);
                    const isSelected = selected?.id === n.id;
                    return (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, scale: 0.95 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setSelected(isSelected ? null : n)}
                        className={`relative bg-white rounded-2xl border transition-all cursor-pointer overflow-hidden group
                          ${isSelected
                            ? 'border-indigo-300 shadow-xl shadow-indigo-100/60 ring-2 ring-indigo-100'
                            : 'border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/80'
                          }`}
                      >
                        {/* Gradient accent top bar */}
                        <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${cfg.accentFrom} ${cfg.accentTo} opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100' : ''} transition-opacity`} />

                        <div className="px-4 py-3.5 flex items-start gap-3.5">
                          {/* Type icon */}
                          <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0 shadow-md shadow-black/10`}>
                            {cfg.icon}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badgeClass}`}>
                                {cfg.filterIcon} {cfg.label}
                              </span>
                              {isAdmin && n.sent && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                  <CheckCheck size={10} />
                                  {n.sent_to && n.sent_to.length > 0
                                    ? `ส่งแล้ว: ${n.sent_to.slice(0, 3).join(', ')}${n.sent_to.length > 3 ? '...' : ''}`
                                    : `ส่งแล้ว ${n.sent_count} เครื่อง`}
                                </span>
                              )}
                            </div>

                            <p className="font-bold text-slate-800 text-sm leading-snug truncate">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{n.body}</p>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{formatDate(n.created_at)}</p>
                          </div>

                          <ChevronRight
                            size={16}
                            className={`text-slate-300 shrink-0 transition-all mt-1.5 group-hover:text-indigo-300 ${isSelected ? 'rotate-90 text-indigo-400' : ''}`}
                          />
                        </div>

                        {/* Mobile inline expand */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden lg:hidden"
                            >
                              <div className="mx-4 mb-4 mt-0 border-t border-slate-100 pt-3">
                                <DetailBody n={selected!} isAdmin={isAdmin} onDelete={isAdminOrAuditor ? handleDelete : undefined} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {hasMore && (
                  <button
                    onClick={() => fetchNotifications(false)}
                    disabled={loading}
                    className="w-full py-3.5 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm font-medium hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all"
                  >
                    {loading ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
                  </button>
                )}
              </div>

              {/* ── Detail Panel (desktop) ── */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, x: 24, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.98 }}
                    className="hidden lg:block lg:w-80 xl:w-96 shrink-0"
                  >
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-indigo-100/40 overflow-hidden sticky top-6">
                      <DetailHeader n={selected} onClose={() => setSelected(null)} />
                      <DetailBody n={selected} isAdmin={isAdmin} onDelete={isAdminOrAuditor ? handleDelete : undefined} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Detail Header ────────────────────────────────────────────────────────────
function DetailHeader({ n, onClose }: { n: NotifDoc; onClose: () => void }) {
  const cfg = getTypeConfig(n.type);
  return (
    <div className={`relative overflow-hidden p-5 bg-gradient-to-br ${cfg.accentFrom} ${cfg.accentTo}`}>
      <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
            {cfg.icon}
          </div>
          <div>
            <span className="text-white/70 text-xs font-semibold uppercase tracking-wide">{cfg.label}</span>
            <h2 className="text-white font-bold text-base leading-snug mt-0.5">{n.title}</h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/20 text-white/80 hover:text-white hover:bg-white/30 transition-all shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <p className="relative text-white/70 text-xs mt-3 font-medium">{formatDate(n.created_at)}</p>
    </div>
  );
}

// ─── Detail Body ──────────────────────────────────────────────────────────────
function DetailBody({ n, isAdmin, onDelete }: { n: NotifDoc; isAdmin: boolean; onDelete?: (id: string) => void }) {
  return (
    <div className="p-4 flex flex-col gap-3.5">
      {/* Message */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ข้อความแจ้งเตือน</p>
        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-3 break-words border border-slate-100">
          {n.body}
        </p>
      </div>

      {/* Job details */}
      {n.type === 'job_submit' && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">รายละเอียดงาน</p>
          <div className="flex flex-col gap-2">
            {[
              { icon: <Hash size={13} />, label: 'รหัสงาน', value: n.job_id },
              { icon: <Hash size={13} />, label: 'ออเดอร์', value: n.order_no },
              { icon: <CheckCircle2 size={13} />, label: 'ประเภทงาน', value: n.work_category },
              { icon: <User size={13} />, label: 'ช่างเทคนิค', value: n.technician },
              { icon: <StickyNote size={13} />, label: 'หมายเหตุ', value: n.note },
            ].filter(r => r.value && r.value !== '-').map(row => (
              <div key={row.label} className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-indigo-400 mt-0.5 shrink-0">{row.icon}</span>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium">{row.label}</span>
                  <p className="text-sm font-semibold text-slate-700">{row.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF / Video links */}
      {(n.pdf_url || n.video_url) && (
        <div className="flex flex-col gap-2">
          {n.pdf_url && (
            <a href={n.pdf_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors border border-indigo-100">
              <FileText size={14} /> ดูไฟล์ PDF
            </a>
          )}
          {n.video_url && (
            <a href={n.video_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors border border-purple-100">
              <Video size={14} /> ดูไฟล์วิดีโอ
            </a>
          )}
        </div>
      )}

      {/* Sent status */}
      {isAdmin && (
        <div className={`flex flex-col gap-1.5 px-3.5 py-2.5 rounded-xl text-xs border ${
          n.sent
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-slate-50 text-slate-500 border-slate-100'
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            <CheckCheck size={14} />
            {n.sent ? 'ส่งแจ้งเตือนสำเร็จ' : 'ยังไม่ได้ส่งแจ้งเตือน'}
          </div>
          {n.sent && n.sent_to && n.sent_to.length > 0 && (
            <div className="text-[11px] text-emerald-600/90 font-medium pl-6 leading-relaxed break-words">
              ผู้รับ: {n.sent_to.join(', ')}
            </div>
          )}
          {n.sent && (!n.sent_to || n.sent_to.length === 0) && (
            <div className="text-[11px] text-emerald-600/90 font-medium pl-6">
              จำนวน: {n.sent_count ?? 0} เครื่อง
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      {onDelete && (
        <button
          onClick={() => onDelete(n.id)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-semibold hover:bg-red-100 border border-red-100 transition-colors"
        >
          <Trash2 size={13} /> ลบการแจ้งเตือนนี้
        </button>
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <NotificationsInner />
    </Suspense>
  );
}
