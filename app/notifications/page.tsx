'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, AlertCircle, Trash2, RefreshCw, ChevronRight, FileText, Video, Hash, User, StickyNote, Filter, CheckCheck } from 'lucide-react';
import Sidebar from '@/components/sidebar';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifDoc {
  id: string;
  title: string;
  body: string;
  type: 'job_submit' | 'test' | string;
  job_id?: string;
  order_no?: string;
  work_category?: string;
  technician?: string;
  note?: string;
  pdf_url?: string | null;
  video_url?: string | null;
  sent: boolean;
  sent_count?: number;
  created_at?: any;
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

function typeLabel(type: string) {
  if (type === 'job_submit') return { label: 'ส่งงาน', color: 'bg-indigo-100 text-indigo-700', icon: <CheckCircle2 size={11} /> };
  if (type === 'test') return { label: 'ทดสอบ', color: 'bg-amber-100 text-amber-700', icon: <AlertCircle size={11} /> };
  return { label: type, color: 'bg-slate-100 text-slate-600', icon: <Bell size={11} /> };
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { currentUser } = useApp();
  const [notifications, setNotifications] = useState<NotifDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'job_submit' | 'test'>('all');
  const [selected, setSelected] = useState<NotifDoc | null>(null);

  const fetchNotifications = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const db = getDb();
      let q = query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(PAGE_SIZE)
      );
      if (!reset && lastDoc) {
        q = query(
          collection(db, 'notifications'),
          orderBy('created_at', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifDoc));
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

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8 overflow-y-auto">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Bell size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">ประวัติการแจ้งเตือน</h1>
              <p className="text-xs text-slate-500">Push Notification History</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter tabs */}
            {(['all', 'job_submit', 'test'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === f
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                }`}
              >
                {f === 'all' ? 'ทั้งหมด' : f === 'job_submit' ? 'ส่งงาน' : 'ทดสอบ'}
              </button>
            ))}

            <button
              onClick={() => { setLastDoc(null); fetchNotifications(true); }}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-all"
              title="รีเฟรช"
            >
              <RefreshCw size={14} />
            </button>

            {isAdminOrAuditor && notifications.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all flex items-center gap-1"
              >
                <Trash2 size={12} /> ลบทั้งหมด
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Content ── */}
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">กำลังโหลด...</p>
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
              <Bell size={36} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">ยังไม่มีการแจ้งเตือน</p>
            <p className="text-slate-400 text-sm text-center">การแจ้งเตือนจะปรากฏที่นี่เมื่อมีงานส่งเข้ามา</p>
          </motion.div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5">

            {/* ── Notification List ── */}
            <div className="flex-1 flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {notifications.map((n, i) => {
                  const tag = typeLabel(n.type);
                  const isSelected = selected?.id === n.id;
                  return (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -30, scale: 0.95 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelected(isSelected ? null : n)}
                      className={`relative bg-white rounded-2xl border transition-all cursor-pointer overflow-hidden
                        ${isSelected
                          ? 'border-indigo-400 shadow-lg shadow-indigo-100 ring-2 ring-indigo-100'
                          : 'border-slate-200 hover:border-indigo-200 hover:shadow-md hover:shadow-slate-100'
                        }`}
                    >
                      {/* Left accent bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${
                        n.type === 'job_submit' ? 'bg-gradient-to-b from-indigo-400 to-purple-500'
                        : n.type === 'test' ? 'bg-gradient-to-b from-amber-400 to-orange-400'
                        : 'bg-slate-300'
                      }`} />

                      <div className="pl-4 pr-4 py-3 flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          n.type === 'job_submit' ? 'bg-indigo-50 text-indigo-600'
                          : n.type === 'test' ? 'bg-amber-50 text-amber-600'
                          : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Bell size={16} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tag.color}`}>
                              {tag.icon} {tag.label}
                            </span>
                            {n.sent && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                <CheckCheck size={10} /> ส่งแล้ว {n.sent_count} เครื่อง
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-slate-800 text-sm leading-snug truncate">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                        </div>

                        <ChevronRight size={16} className={`text-slate-300 shrink-0 transition-transform mt-1 ${isSelected ? 'rotate-90 text-indigo-400' : ''}`} />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {hasMore && (
                <button
                  onClick={() => fetchNotifications(false)}
                  disabled={loading}
                  className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 hover:border-indigo-200 transition-all"
                >
                  {loading ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
                </button>
              )}
            </div>

            {/* ── Detail Panel ── */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="lg:w-80 xl:w-96 shrink-0"
                >
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-100 overflow-hidden sticky top-6">
                    {/* Detail header */}
                    <div className={`p-5 ${
                      selected.type === 'job_submit'
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                        : 'bg-gradient-to-br from-amber-400 to-orange-500'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-white/70 text-xs font-medium">{typeLabel(selected.type).label}</span>
                          <h2 className="text-white font-bold text-base leading-snug mt-0.5">{selected.title}</h2>
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          className="text-white/70 hover:text-white transition-colors shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-white/80 text-xs mt-2">{formatDate(selected.created_at)}</p>
                    </div>

                    {/* Detail body */}
                    <div className="p-5 flex flex-col gap-4">
                      {/* Full message */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ข้อความแจ้งเตือน</p>
                        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-3">{selected.body}</p>
                      </div>

                      {/* Job details (only for job_submit) */}
                      {selected.type === 'job_submit' && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">รายละเอียดงาน</p>

                          {[
                            { icon: <Hash size={13} />, label: 'รหัสงาน', value: selected.job_id },
                            { icon: <Hash size={13} />, label: 'ออเดอร์', value: selected.order_no },
                            { icon: <CheckCircle2 size={13} />, label: 'ประเภทงาน', value: selected.work_category },
                            { icon: <User size={13} />, label: 'ช่างเทคนิค', value: selected.technician },
                            { icon: <StickyNote size={13} />, label: 'หมายเหตุ', value: selected.note },
                          ].filter(r => r.value && r.value !== '-').map(row => (
                            <div key={row.label} className="flex items-start gap-2">
                              <span className="text-indigo-400 mt-0.5 shrink-0">{row.icon}</span>
                              <div>
                                <span className="text-[10px] text-slate-400">{row.label}</span>
                                <p className="text-sm font-medium text-slate-700">{row.value}</p>
                              </div>
                            </div>
                          ))}

                          {/* PDF link */}
                          {selected.pdf_url && (
                            <a
                              href={selected.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                            >
                              <FileText size={13} /> ดูไฟล์ PDF
                            </a>
                          )}

                          {/* Video link */}
                          {selected.video_url && (
                            <a
                              href={selected.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors"
                            >
                              <Video size={13} /> ดูไฟล์วิดีโอ
                            </a>
                          )}
                        </div>
                      )}

                      {/* Sent status */}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                        selected.sent ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-500'
                      }`}>
                        <CheckCheck size={14} />
                        {selected.sent
                          ? `ส่งแจ้งเตือนสำเร็จ ${selected.sent_count ?? 0} เครื่อง`
                          : 'ยังไม่ได้ส่งแจ้งเตือน'}
                      </div>

                      {/* Delete button */}
                      {isAdminOrAuditor && (
                        <button
                          onClick={() => handleDelete(selected.id)}
                          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 border border-red-100 transition-colors"
                        >
                          <Trash2 size={13} /> ลบการแจ้งเตือนนี้
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}
      </main>
    </div>
  );
}
