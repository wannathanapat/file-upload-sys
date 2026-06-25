'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, CheckCircle2, AlertCircle, History, CalendarDays,
  Fingerprint, MapPin, ChevronRight, RefreshCw,
} from 'lucide-react';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import FaceScanModal from './FaceScanModal';

interface AttendanceSettings {
  office_lat: number;
  office_lng: number;
  radius_meters: number;
  work_start_time: string;
}

interface AttendanceRecord {
  id: string;
  username: string;
  name: string;
  date: string;
  check_in_time: string;
  status: 'on_time' | 'late' | 'absent' | 'personal_leave' | 'sick_leave' | 'onsite';
  location_verified: boolean;
  face_verified: boolean;
  override_status?: string;
  override_province?: string;
  override_district?: string;
  note?: string;
}

type CheckinPhase = 'idle' | 'checking-location' | 'location-failed' | 'location-ok' | 'face-scan' | 'done';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  on_time:       { label: 'เข้างานปกติ',    bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  late:          { label: 'มาสาย',           bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-500'     },
  absent:        { label: 'ขาดงาน',          bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-700'    },
  personal_leave:{ label: 'ลากิจ',           bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  sick_leave:    { label: 'ลาป่วย',          bg: 'bg-orange-50',   text: 'text-orange-600',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
  onsite:        { label: 'ลงพื้นที่',       bg: 'bg-sky-50',      text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500'     },
};

function getStatusKey(record: AttendanceRecord) {
  return record.override_status || record.status;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function TechnicianView() {
  const { currentUser, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'home' | 'history'>('home');
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [phase, setPhase] = useState<CheckinPhase>('idle');
  const [showFaceScan, setShowFaceScan] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [distance, setDistance] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getDb();

      // Load settings
      const settingsSnap = await getDoc(doc(db, 'attendance_settings', 'config'));
      const s = settingsSnap.exists() ? settingsSnap.data() as AttendanceSettings : {
        office_lat: 19.9071, office_lng: 99.8314, radius_meters: 100, work_start_time: '08:00',
      };
      setSettings(s);

      // Load today record
      const todayId = `${currentUser.username}_${todayString()}`;
      const todaySnap = await getDoc(doc(db, 'attendance_records', todayId));
      setTodayRecord(todaySnap.exists() ? { id: todayId, ...todaySnap.data() } as AttendanceRecord : null);

      // Load history (last 30 records) — sort client-side to avoid composite index
      const q = query(
        collection(db, 'attendance_records'),
        where('username', '==', currentUser.username)
      );
      const snap = await getDocs(q);
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as AttendanceRecord)
        .sort((a, b) => b.date.localeCompare(a.date));
      setHistory(sorted.slice(0, 30));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCheckin = async () => {
    if (!settings || !currentUser) return;
    setPhase('checking-location');
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, settings.office_lat, settings.office_lng);
        setDistance(Math.round(dist));

        if (dist > settings.radius_meters) {
          setPhase('location-failed');
          setLocationError(`คุณอยู่ห่างจากออฟฟิศ ${Math.round(dist)} เมตร (อนุญาต ${settings.radius_meters} เมตร)`);
        } else {
          setPhase('location-ok');
          setTimeout(() => setShowFaceScan(true), 600);
        }
      },
      () => {
        setPhase('location-failed');
        setLocationError('ไม่สามารถรับตำแหน่ง GPS ได้ กรุณาเปิดใช้งาน Location');
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  };

  const handleFaceScanSuccess = async () => {
    if (!currentUser || !settings) return;
    setShowFaceScan(false);
    setPhase('done');

    const now = new Date();
    const [h, m] = settings.work_start_time.split(':').map(Number);
    const workStart = new Date(now);
    workStart.setHours(h, m, 0, 0);
    const isLate = now > workStart;

    const todayId = `${currentUser.username}_${todayString()}`;
    const record: Omit<AttendanceRecord, 'id'> = {
      username: currentUser.username,
      name: currentUser.name,
      date: todayString(),
      check_in_time: now.toISOString(),
      status: isLate ? 'late' : 'on_time',
      location_verified: true,
      face_verified: true,
    };

    try {
      await setDoc(doc(getDb(), 'attendance_records', todayId), record);
      setTodayRecord({ id: todayId, ...record });
      showToast(isLate ? '⚠️ เช็คอินสำเร็จ — บันทึกว่ามาสาย' : '✅ เช็คอินเข้างานสำเร็จ!', isLate ? 'info' : 'success');
      await loadData();
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
  };

  const statusKey = todayRecord ? getStatusKey(todayRecord) : null;
  const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;

  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderWidth: 3 }} />
          <p className="text-sm text-slate-500 Prompt">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-gradient-to-br from-blue-50 via-white to-sky-50">
      {/* Tab Bar */}
      <div className="bg-white/80 backdrop-blur-md border-b border-blue-100 px-5 pt-3 flex gap-0 z-10">
        {[
          { id: 'home', label: 'เช็คอิน', icon: Fingerprint },
          { id: 'history', label: 'ประวัติ', icon: History },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 pb-3 text-xs font-bold Prompt border-b-2 transition-colors ${isActive ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
              {/* Clock Card */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-2xl shadow-blue-500/30">
                <div className="text-4xl font-black tracking-tight tabular-nums">{timeStr}</div>
                <div className="text-blue-200 text-xs mt-1 Prompt">{dateStr}</div>

                {/* Today status badge */}
                <div className="mt-4">
                  {todayRecord && statusCfg ? (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${statusCfg.bg} ${statusCfg.text} rounded-full text-xs font-bold Prompt border ${statusCfg.border}`}>
                      <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                      {statusCfg.label}
                      {todayRecord.check_in_time && ` — ${new Date(todayRecord.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white/90 rounded-full text-xs font-bold Prompt">
                      <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                      ยังไม่ได้เช็คอินวันนี้
                    </div>
                  )}
                </div>
              </div>

              {/* Phase Messages */}
              <AnimatePresence>
                {phase === 'checking-location' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-sm text-blue-700 font-semibold Prompt">กำลังตรวจสอบตำแหน่ง GPS...</p>
                  </motion.div>
                )}
                {phase === 'location-ok' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                    <MapPin className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm text-emerald-700 font-semibold Prompt">ตำแหน่งถูกต้อง ✓ กำลังเปิดกล้อง...</p>
                  </motion.div>
                )}
                {phase === 'location-failed' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-red-700 font-bold Prompt">ตำแหน่งไม่อยู่ในพื้นที่</p>
                        <p className="text-xs text-red-500 Prompt mt-0.5">{locationError}</p>
                      </div>
                    </div>
                    <button onClick={() => setPhase('idle')} className="mt-2 flex items-center gap-1 text-xs text-red-600 font-semibold Prompt ml-8">
                      <RefreshCw className="w-3 h-3" /> ลองอีกครั้ง
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Check-in Button */}
              {!todayRecord ? (
                <motion.button
                  onClick={handleCheckin}
                  disabled={phase === 'checking-location' || phase === 'location-ok'}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-500 disabled:from-slate-300 disabled:to-slate-300 text-white font-black text-lg rounded-3xl shadow-2xl shadow-blue-500/40 disabled:shadow-none transition-all active:scale-95 Prompt flex items-center justify-center gap-3"
                >
                  <Fingerprint className="w-7 h-7" />
                  {phase === 'checking-location' ? 'กำลังตรวจสอบ...' : 'เช็คอินเข้างาน'}
                </motion.button>
              ) : (
                <div className="w-full py-5 bg-slate-100 rounded-3xl flex items-center justify-center gap-3 text-slate-400">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  <span className="font-bold text-lg Prompt">เช็คอินแล้ววันนี้</span>
                </div>
              )}

              {/* Info card */}
              {settings && (
                <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide Prompt">ข้อมูลระบบ</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 Prompt">เวลาเข้างานมาตรฐาน</span>
                    <span className="text-xs font-bold text-blue-600">{settings.work_start_time} น.</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 Prompt">รัศมีเช็คอิน</span>
                    <span className="text-xs font-bold text-blue-600">{settings.radius_meters} เมตร</span>
                  </div>
                  {distance !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 Prompt">ระยะจากออฟฟิศ</span>
                      <span className={`text-xs font-bold ${distance <= settings.radius_meters ? 'text-emerald-600' : 'text-red-500'}`}>
                        {distance} เมตร
                      </span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700 Prompt flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  ประวัติการลงเวลา
                </h2>
                <button onClick={loadData} className="p-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm Prompt">ยังไม่มีประวัติการลงเวลา</p>
                </div>
              ) : (
                history.map((rec) => {
                  const sk = getStatusKey(rec);
                  const cfg = STATUS_CONFIG[sk] || STATUS_CONFIG['absent'];
                  return (
                    <div key={rec.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
                      <div className={`w-10 h-10 ${cfg.bg} ${cfg.text} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 Prompt">
                          {new Date(rec.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[11px] text-slate-500 Prompt mt-0.5">
                          {rec.check_in_time
                            ? `เข้า ${new Date(rec.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                            : 'ไม่มีข้อมูลเวลาเข้า'
                          }
                          {rec.override_province && ` • ${rec.override_province} › ${rec.override_district}`}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border} Prompt flex-shrink-0`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Face Scan Modal */}
      <FaceScanModal
        isOpen={showFaceScan}
        onClose={() => { setShowFaceScan(false); setPhase('idle'); }}
        onSuccess={handleFaceScanSuccess}
        employeeName={currentUser?.name || ''}
      />
    </div>
  );
}
