'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, CheckCircle2, AlertCircle, Clock, CalendarDays,
  Settings, BarChart3, Download, RefreshCw, MapPin, UserPlus,
  Trash2, FileText, Filter, ChevronDown, Camera, X, Plus, Pencil,
} from 'lucide-react';
import { useApp } from '@/app/providers';
import { getDb } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, deleteDoc, Timestamp,
} from 'firebase/firestore';
import AttendanceOverrideModal, { AttendanceStatus } from './AttendanceOverrideModal';
import GeofenceMapModal from './GeofenceMapModal';
import FaceScanModal from './FaceScanModal';

/* ─────────────────────────── Types ──────────────────────────── */

interface OfficeLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

interface AttendanceSettings {
  office_lat: number;
  office_lng: number;
  radius_meters: number;
  locations: OfficeLocation[];
  work_start_time: string;
  voice_message: string;
  voice_rate?: number;
  voice_pitch?: number;
  voice_name?: string;
  excluded_usernames: string[];
}

interface AttendanceRecord {
  id: string;
  username: string;
  name: string;
  date: string;
  check_in_time?: string;
  status: string;
  location_verified?: boolean;
  face_verified?: boolean;
  override_status?: string;
  override_province?: string;
  override_district?: string;
  override_by?: string;
  note?: string;
}

interface EmployeeInfo {
  username: string;
  name: string;
  role: string;
  status: string;
  face_registered?: boolean;
}

/* ─────────────────────────── Helpers ────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  on_time:        { label: 'ปกติ',        bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  late:           { label: 'สาย',          bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-500'     },
  absent:         { label: 'ขาดงาน',       bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-700'    },
  personal_leave: { label: 'ลากิจ',        bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  sick_leave:     { label: 'ลาป่วย',       bg: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
  onsite:         { label: 'ลงพื้นที่',    bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500'     },
  not_checked_in: { label: 'ยังไม่เข้า',  bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
  holiday:        { label: 'วันหยุด',     bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-200',  dot: 'bg-violet-400'  },
};

function getStatusKey(record?: AttendanceRecord | null): string {
  if (!record) return 'not_checked_in';
  return record.override_status || record.status;
}

function getHolidayName(dateStr: string, excludeSundays: boolean, holidays: { date: string; name: string }[]): string | null {
  const found = holidays.find(h => h.date === dateStr);
  if (found) return found.name;
  if (excludeSundays) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    if (day === 0) return 'วันอาทิตย์';
  }
  return null;
}

function isHoliday(dateStr: string, excludeSundays: boolean, holidays: { date: string; name: string }[]): boolean {
  return getHolidayName(dateStr, excludeSundays, holidays) !== null;
}

function getHolidaysInRange(from: string, to: string, excludeSundays: boolean, holidays: { date: string; name: string }[]): { date: string; name: string }[] {
  const result: { date: string; name: string }[] = [];
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const name = getHolidayName(ds, excludeSundays, holidays);
    if (name) result.push({ date: ds, name });
  }
  return result;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─────────────────── AdminView Component ─────────────────────── */

const shortName = (name: string) => name.split('-').pop()?.trim() ?? name;

export default function AdminView() {
  const { currentUser, showToast, systemSettings, updateSystemSettings } = useApp();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'reports'>('dashboard');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  // Data
  const DEFAULT_SETTINGS: AttendanceSettings = {
    office_lat: 19.9071,
    office_lng: 99.8314,
    radius_meters: 100,
    locations: [],
    work_start_time: '08:00',
    voice_message: 'เช็คอินสำเร็จ',
    voice_rate: 0.95,
    voice_pitch: 1.05,
    voice_name: '',
    excluded_usernames: [],
  };
  const [settings, setSettings] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [faceRegistered, setFaceRegistered] = useState<Record<string, boolean>>({});
  const [todayRecords, setTodayRecords] = useState<Record<string, AttendanceRecord>>({});
  const [reportRecords, setReportRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  // Settings local state
  const [localSettings, setLocalSettings] = useState<AttendanceSettings>(settings);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  // TTS Voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const v = window.speechSynthesis.getVoices();
        // Fallback to all voices if no Thai voices found, though we prefer Thai
        if (v.length > 0) {
          const th = v.filter(voice => voice.lang.startsWith('th'));
          setVoices(th.length > 0 ? th : v);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Report filters
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [reportDateTo, setReportDateTo] = useState(todayString);
  const [reportEmployee, setReportEmployee] = useState('');

  // Modals
  const [overrideModal, setOverrideModal] = useState<{ open: boolean; employee?: EmployeeInfo; date: string }>({ open: false, date: todayString() });
  const [geofenceModal, setGeofenceModal] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  const [faceRegModal, setFaceRegModal] = useState<{ open: boolean; employee?: EmployeeInfo }>({ open: false });
  const [selectedEmployee, setSelectedEmployee] = useState<{
    emp: EmployeeInfo;
    rec: AttendanceRecord | undefined;
    sk: string;
    cfg: typeof STATUS_CONFIG[string];
    checkTime: string | null;
  } | null>(null);

  /* ────── Load ────── */

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();

      // Settings
      const settingsSnap = await getDoc(doc(db, 'attendance_settings', 'config'));
      if (settingsSnap.exists()) {
        const s = { ...DEFAULT_SETTINGS, ...settingsSnap.data() } as AttendanceSettings;
        setSettings(s);
        setLocalSettings(s);
      }

      // Employees (staff only, excluding freelancers)
      const [usersSnap, faceSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'attendance_employees')),
      ]);
      const excludedList: string[] = (settingsSnap.exists() ? settingsSnap.data()?.excluded_usernames : []) || [];
      const emps: EmployeeInfo[] = usersSnap.docs
        .map(d => d.data() as EmployeeInfo)
        .filter(u => u.role === 'staff' && u.status === 'active' && !excludedList.includes(u.username));
      setEmployees(emps);

      // Build face registration map
      const faceMap: Record<string, boolean> = {};
      faceSnap.docs.forEach(d => {
        const data = d.data();
        if (data.face_descriptor?.length > 0) faceMap[d.id] = true;
      });
      setFaceRegistered(faceMap);

      // Today records
      const today = todayString();
      const todayQ = query(collection(db, 'attendance_records'), where('date', '==', today));
      const todaySnap = await getDocs(todayQ);
      const todayMap: Record<string, AttendanceRecord> = {};
      todaySnap.docs.forEach(d => {
        const rec = { id: d.id, ...d.data() } as AttendanceRecord;
        todayMap[rec.username] = rec;
      });
      setTodayRecords(todayMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ────── Reports ────── */

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const db = getDb();
      let q = query(
        collection(db, 'attendance_records'),
        where('date', '>=', reportDateFrom),
        where('date', '<=', reportDateTo)
      );
      const snap = await getDocs(q);
      let recs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as AttendanceRecord)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (reportEmployee) recs = recs.filter(r => r.username === reportEmployee);
      setReportRecords(recs);
    } catch (err) {
      console.error(err);
      showToast('โหลดรายงานไม่สำเร็จ', 'error');
    } finally {
      setReportLoading(false);
    }
  }, [reportDateFrom, reportDateTo, reportEmployee, showToast]);

  /* ────── Settings Save ────── */

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await setDoc(doc(getDb(), 'attendance_settings', 'config'), localSettings);
      setSettings(localSettings);
      showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
    } catch {
      showToast('บันทึกการตั้งค่าไม่สำเร็จ', 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  /* ────── Override ────── */

  const handleOverrideSave = async (
    status: AttendanceStatus, province?: string, district?: string, note?: string
  ) => {
    if (!overrideModal.employee || !currentUser) return;
    const emp = overrideModal.employee;
    const date = overrideModal.date;
    const id = `${emp.username}_${date}`;
    const db = getDb();
    const existing = await getDoc(doc(db, 'attendance_records', id));
    const base = existing.exists() ? existing.data() : {
      username: emp.username, name: emp.name, date,
      check_in_time: null, status: 'absent',
      location_verified: false, face_verified: false,
    };
    await setDoc(doc(db, 'attendance_records', id), {
      ...base,
      override_status: status,
      override_province: province || null,
      override_district: district || null,
      override_by: currentUser.username,
      note: note || '',
    });
    showToast(`อัปเดตสถานะ ${emp.name} สำเร็จ`, 'success');
    await loadData();
  };

  /* ────── Face Registration ────── */

  const handleRegisterFace = (emp: EmployeeInfo) => {
    setFaceRegModal({ open: true, employee: emp });
  };

  const handleFaceRegSuccess = async (descriptor?: number[]) => {
    const emp = faceRegModal.employee;
    if (!emp) return;
    if (!descriptor || descriptor.length === 0) {
      showToast('\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48', 'error');
      return;
    }
    try {
      await setDoc(doc(getDb(), 'attendance_employees', emp.username), {
        username: emp.username,
        name: emp.name,
        face_registered: true,
        face_descriptor: descriptor,
        registered_at: new Date().toISOString(),
      });
      showToast('\u2705 \u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32 ' + emp.name + ' \u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08', 'success');
    } catch {
      showToast('\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e1a\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08', 'error');
    }
    setFaceRegModal({ open: false });
    await loadData();
  };

  /* ────── Reset Today's Check-in ────── */

  const handleResetCheckin = async (emp: EmployeeInfo, rec: AttendanceRecord) => {
    if (!window.confirm(`รีเซ็ตการเช็คอินวันนี้ของ "${emp.name}"?\nข้อมูลการสแกนหน้าและพิกัดจะถูกลบออก`)) return;
    try {
      await deleteDoc(doc(getDb(), 'attendance_records', rec.id));
      setTodayRecords(prev => {
        const next = { ...prev };
        delete next[emp.username];
        return next;
      });
      showToast(`รีเซ็ตเช็คอินของ ${emp.name} แล้ว`, 'info');
    } catch {
      showToast('รีเซ็ตไม่สำเร็จ', 'error');
    }
    setSelectedEmployee(null);
  };

  /* ────── Exclude / Include Employee ────── */

  const handleExcludeEmployee = async (emp: EmployeeInfo) => {
    const ok = window.confirm('\u0e0b\u0e48\u0e2d\u0e19 "' + emp.name + '" \u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a\u0e40\u0e0a\u0e47\u0e04\u0e2d\u0e34\u0e19?\n(\u0e1f\u0e23\u0e35\u0e41\u0e25\u0e19\u0e0b\u0e4c\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e0a\u0e47\u0e04\u0e2d\u0e34\u0e19)');
    if (!ok) return;
    const newExcluded = [...(localSettings.excluded_usernames || []), emp.username];
    const newSettings = { ...localSettings, excluded_usernames: newExcluded };
    await setDoc(doc(getDb(), 'attendance_settings', 'config'), newSettings);
    setSettings(newSettings);
    setLocalSettings(newSettings);
    showToast('\u0e0b\u0e48\u0e2d\u0e19 ' + emp.name + ' \u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a\u0e40\u0e0a\u0e47\u0e04\u0e2d\u0e34\u0e19\u0e41\u0e25\u0e49\u0e27', 'info');
    await loadData();
  };

  const handleIncludeEmployee = async (username: string) => {
    const newExcluded = (localSettings.excluded_usernames || []).filter(u => u !== username);
    const newSettings = { ...localSettings, excluded_usernames: newExcluded };
    await setDoc(doc(getDb(), 'attendance_settings', 'config'), newSettings);
    setSettings(newSettings);
    setLocalSettings(newSettings);
    showToast('\u0e04\u0e37\u0e19\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19\u0e41\u0e25\u0e49\u0e27', 'success');
    await loadData();
  };

  /* ────── Clear attendance records ────── */

  const handleClearTodayRecords = async () => {
    const ok = window.confirm('\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e01\u0e32\u0e23\u0e25\u0e07\u0e40\u0e27\u0e25\u0e32\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14?\n(\u0e43\u0e0a\u0e49\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e17\u0e14\u0e2a\u0e2d\u0e1a\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19)');
    if (!ok) return;
    setClearingData(true);
    try {
      const db = getDb();
      const today = todayString();
      const q = query(collection(db, 'attendance_records'), where('date', '==', today));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      showToast('\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49 ' + snap.size + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e41\u0e25\u0e49\u0e27', 'success');
      await loadData();
    } catch { showToast('\u0e25\u0e1a\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08', 'error'); }
    finally { setClearingData(false); }
  };

  const handleClearAllRecords = async () => {
    const ok = window.confirm('\u26a0\ufe0f \u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e01\u0e32\u0e23\u0e25\u0e07\u0e40\u0e27\u0e25\u0e32\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14\u0e17\u0e38\u0e01\u0e27\u0e31\u0e19?\n\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e01\u0e39\u0e49\u0e04\u0e37\u0e19\u0e44\u0e14\u0e49!');
    if (!ok) return;
    setClearingData(true);
    try {
      const db = getDb();
      const snap = await getDocs(collection(db, 'attendance_records'));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      showToast('\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14 ' + snap.size + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e41\u0e25\u0e49\u0e27', 'success');
      await loadData();
    } catch { showToast('\u0e25\u0e1a\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08', 'error'); }
    finally { setClearingData(false); }
  };

  /* ────── Export CSV ────── */

  const exportCSV = () => {
    if (reportRecords.length === 0) { showToast('ไม่มีข้อมูลสำหรับ Export', 'info'); return; }
    const headers = ['วันที่', 'ชื่อ', 'เวลาเข้า', 'สถานะ', 'จังหวัด', 'อำเภอ', 'หมายเหตุ'];
    const recRows = reportRecords.map(r => {
      const sk = getStatusKey(r);
      const cfg = STATUS_CONFIG[sk];
      return {
        sortKey: r.date,
        cols: [
          fmtDate(r.date),
          r.name,
          r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
          cfg?.label || sk,
          r.override_province || '-',
          r.override_district || '-',
          r.note || '-',
        ],
      };
    });
    const holidaysList = getHolidaysInRange(reportDateFrom, reportDateTo, systemSettings.attendance_exclude_sundays, systemSettings.attendance_holidays ?? []);
    const holidayRows = holidaysList.map(h => ({ sortKey: h.date, cols: [fmtDate(h.date), '\u2014', '\u2014', `\u0E27\u0E31\u0E19\u0E2B\u0E22\u0E38\u0E14: ${h.name}`, '-', '-', '-'] }));
    const allRows = [...recRows, ...holidayRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey)).map(r => r.cols);
    const csv = '\uFEFF' + [headers, ...allRows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${reportDateFrom}_to_${reportDateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export CSV สำเร็จ', 'success');
  };

  /* ────── Export PDF (print) ────── */

  const exportPDF = () => {
    if (reportRecords.length === 0) { showToast('ไม่มีข้อมูลสำหรับ Export', 'info'); return; }
    const recRows = reportRecords.map(r => {
      const sk = getStatusKey(r);
      const cfg = STATUS_CONFIG[sk];
      const location = r.override_province ? `${r.override_province} › ${r.override_district}` : '-';
      return { date: r.date, html: `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${r.name}</td>
        <td>${r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${cfg?.label || sk}</td>
        <td>${location}</td>
        <td>${r.note || '-'}</td>
      </tr>` };
    });
    const pdfHolidays = getHolidaysInRange(reportDateFrom, reportDateTo, systemSettings.attendance_exclude_sundays, systemSettings.attendance_holidays ?? []);
    const holidayPdfRows = pdfHolidays.map(h => ({ date: h.date, html: `<tr style="background:#f5f3ff">
        <td>${fmtDate(h.date)}</td>
        <td colspan="4" style="color:#7c3aed;font-weight:bold">วันหยุด: ${h.name}</td>
        <td>-</td>
      </tr>` }));
    const rows = [...recRows, ...holidayPdfRows].sort((a, b) => b.date.localeCompare(a.date)).map(r => r.html).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>รายงานการลงเวลา</title>
      <style>
        body{font-family:'Noto Sans Thai',sans-serif;padding:24px;color:#1e293b}
        h1{font-size:18px;margin-bottom:4px}p{font-size:12px;color:#64748b;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#1d4ed8;color:#fff;padding:8px 10px;text-align:left}
        td{border-bottom:1px solid #e2e8f0;padding:7px 10px}
        tr:nth-child(even) td{background:#f8fafc}
        @media print{body{padding:10px}}
      </style></head><body>
      <h1>รายงานการลงเวลาช่าง</h1>
      <p>ช่วงวันที่ ${fmtDate(reportDateFrom)} ถึง ${fmtDate(reportDateTo)}${reportEmployee ? ` | ช่าง: ${employees.find(e => e.username === reportEmployee)?.name}` : ''}</p>
      <table><thead><tr><th>วันที่</th><th>ชื่อ</th><th>เวลาเข้า</th><th>สถานะ</th><th>พื้นที่</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  /* ────── Summary counts ────── */

  const todayIsHoliday = isHoliday(
    todayString(),
    systemSettings.attendance_exclude_sundays,
    systemSettings.attendance_holidays ?? []
  );
  const totalEmp = employees.length;
  const checkedIn = employees.filter(e => todayRecords[e.username]).length;
  const late = employees.filter(e => getStatusKey(todayRecords[e.username]) === 'late').length;
  const onLeave = employees.filter(e => ['personal_leave', 'sick_leave', 'absent', 'onsite'].includes(getStatusKey(todayRecords[e.username]))).length;
  const onHoliday = todayIsHoliday ? employees.filter(e => !todayRecords[e.username]).length : 0;
  const notIn = totalEmp - checkedIn - onLeave - onHoliday;

  /* ────── Render ────── */

  return (
    <div className="flex flex-col min-h-full bg-gradient-to-br from-blue-50 via-white to-sky-50">
      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-100 px-5 pt-3 flex gap-0 top-0 lg:top-0 z-10">
        {[
          { id: 'dashboard', label: 'วันนี้', icon: Users },
          { id: 'settings', label: 'ตั้งค่า', icon: Settings },
          { id: 'reports', label: 'รายงาน', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 pb-3 text-xs font-bold Prompt border-b-2 transition-colors ${isActive ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 px-4 py-5 pb-32 space-y-4">
        <AnimatePresence mode="wait">
          {/* ═══════════════ DASHBOARD TAB ═══════════════ */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'เข้างานแล้ว', value: checkedIn, icon: CheckCircle2, bg: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-300/40' },
                  { label: 'ยังไม่เข้า',  value: notIn < 0 ? 0 : notIn, icon: Clock,         bg: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-300/40' },
                  { label: 'มาสาย',       value: late,       icon: AlertCircle, bg: 'from-red-500 to-red-600',     shadow: 'shadow-red-300/40'     },
                  { label: 'ลา/ขาด',      value: onLeave,    icon: CalendarDays,bg: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-300/40'   },
                  ...(onHoliday > 0 ? [{ label: 'วันหยุด', value: onHoliday, icon: CalendarDays, bg: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-300/40' }] : []),
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className={`bg-gradient-to-br ${card.bg} rounded-3xl p-4 text-white shadow-xl ${card.shadow}`}>
                      <Icon className="w-5 h-5 mb-2 opacity-80" />
                      <div className="text-3xl font-black">{card.value}</div>
                      <div className="text-xs font-semibold opacity-80 Prompt mt-0.5">{card.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Refresh */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700 Prompt">รายชื่อช่าง ({totalEmp} คน)</h2>
                <button onClick={loadData} disabled={loading} className="p-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition disabled:opacity-40">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Employee Cards */}
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm Prompt">ยังไม่มีข้อมูลพนักงาน</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {employees.map((emp, i) => {
                    const rec = todayRecords[emp.username];
                    const holidayName = !rec ? getHolidayName(
                      todayString(),
                      systemSettings.attendance_exclude_sundays,
                      systemSettings.attendance_holidays ?? []
                    ) : null;
                    const sk = holidayName ? 'holiday' : getStatusKey(rec);
                    const cfg = STATUS_CONFIG[sk] ?? STATUS_CONFIG['not_checked_in'];
                    const checkTime = rec?.check_in_time
                      ? new Date(rec.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                      : null;
                    const stripColor: Record<string, string> = {
                      on_time: 'bg-emerald-500', late: 'bg-red-500',
                      absent: 'bg-rose-700', not_checked_in: 'bg-slate-200',
                      personal_leave: 'bg-amber-400', sick_leave: 'bg-orange-400', onsite: 'bg-sky-500',
                      holiday: 'bg-violet-300',
                    };
                    const avatarCls: Record<string, string> = {
                      on_time: 'bg-emerald-100 text-emerald-700', late: 'bg-red-100 text-red-600',
                      absent: 'bg-rose-100 text-rose-700', not_checked_in: 'bg-slate-100 text-slate-500',
                      personal_leave: 'bg-amber-100 text-amber-700', sick_leave: 'bg-orange-100 text-orange-600',
                      onsite: 'bg-sky-100 text-sky-700', holiday: 'bg-violet-100 text-violet-600',
                    };
                    return (
                      <motion.button
                        key={emp.username}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.035 }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => setSelectedEmployee({ emp, rec, sk, cfg, checkTime })}
                        className="w-full text-left bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex items-center hover:shadow-md hover:border-slate-200 transition-all duration-200"
                      >
                        {/* Left color strip */}
                        <div className={`w-1 self-stretch flex-shrink-0 ${stripColor[sk] || 'bg-slate-200'}`} />

                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ml-3 my-2.5 ${avatarCls[sk] || 'bg-slate-100 text-slate-500'}`}>
                          {emp.name.charAt(0)}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0 px-3 py-2.5">
                          <p className="text-xs font-bold text-slate-800 Prompt truncate">{shortName(emp.name)}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {holidayName ?? cfg.label}
                            </span>
                            {checkTime && <span className="text-[9px] text-slate-400 font-semibold">⏰ {checkTime} น.</span>}
                          </div>
                        </div>

                        {/* Chevron */}
                        <ChevronDown className="w-3.5 h-3.5 text-slate-300 -rotate-90 flex-shrink-0 mr-3" />
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* ── Employee Detail Centered Modal ── */}
              <AnimatePresence>
                {selectedEmployee && (() => {
                  const { emp, rec, sk, cfg, checkTime } = selectedEmployee;
                  const gradMap: Record<string, string> = {
                    on_time: 'from-emerald-400 to-emerald-600',
                    late: 'from-red-400 to-red-600',
                    absent: 'from-rose-500 to-rose-700',
                    not_checked_in: 'from-slate-400 to-slate-600',
                    personal_leave: 'from-amber-400 to-amber-500',
                    sick_leave: 'from-orange-400 to-orange-500',
                    onsite: 'from-sky-400 to-sky-600',
                  };
                  const grad = gradMap[sk] || 'from-slate-400 to-slate-600';
                  return (
                    <motion.div
                      key="emp-modal"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center px-5"
                      onClick={() => setSelectedEmployee(null)}
                    >
                      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />

                      <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 12 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                        onClick={e => e.stopPropagation()}
                        className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
                      >
                        {/* Gradient header */}
                        <div className={`bg-gradient-to-br ${grad} px-5 pt-5 pb-12`}>
                          <div className="flex justify-end mb-3">
                            <button
                              onClick={() => setSelectedEmployee(null)}
                              className="w-8 h-8 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center font-black text-white text-2xl shadow-lg">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-base font-black text-white Prompt leading-snug">{shortName(emp.name)}</p>
                              <p className="text-[11px] text-white/70 Prompt mt-0.5">{emp.username}</p>
                            </div>
                          </div>
                        </div>

                        {/* Status pill floating over header */}
                        <div className="px-5 -mt-4 mb-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-md border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="px-5 pb-5 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 rounded-2xl p-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide Prompt">เวลาเข้างาน</p>
                              <p className="text-sm font-black text-slate-700 mt-1">{checkTime ? `${checkTime} น.` : '—'}</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide Prompt">Face Scan</p>
                              <p className="text-sm font-black text-slate-700 mt-1">{rec?.face_verified ? '✅ ผ่าน' : '—'}</p>
                            </div>
                          </div>

                          {rec?.override_province && (
                            <div className="flex items-center gap-2 bg-sky-50 rounded-2xl px-3 py-2.5">
                              <MapPin className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                              <p className="text-xs font-bold text-sky-700 Prompt">{rec.override_province}{rec.override_district ? ` › ${rec.override_district}` : ''}</p>
                            </div>
                          )}
                          {rec?.note && (
                            <div className="bg-amber-50 rounded-2xl px-3 py-2.5 border border-amber-100">
                              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wide Prompt mb-0.5">หมายเหตุ</p>
                              <p className="text-xs text-amber-700 Prompt">{rec.note}</p>
                            </div>
                          )}

                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => { setSelectedEmployee(null); setOverrideModal({ open: true, employee: emp, date: todayString() }); }}
                              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl transition active:scale-95 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-1.5 Prompt"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              แก้ไขสถานะ
                            </button>
                            <button
                              onClick={() => { setSelectedEmployee(null); handleExcludeEmployee(emp); }}
                              className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-500 font-bold text-xs rounded-2xl border border-red-100 transition active:scale-95 flex items-center gap-1.5 Prompt"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              ซ่อน
                            </button>
                          </div>
                          {rec && (
                            <button
                              onClick={() => handleResetCheckin(emp, rec)}
                              className="w-full py-3 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold text-xs rounded-2xl border border-amber-200 transition active:scale-95 flex items-center justify-center gap-1.5 Prompt"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              รีเซ็ตการเช็คอินวันนี้
                            </button>
                          )}
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>

            </motion.div>
          )}

          {/* ═══════════════ SETTINGS TAB ═══════════════ */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Geofence Section */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-50 rounded-xl flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 Prompt">พิกัดออฟฟิศ (Geofencing)</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 Prompt">{localSettings.locations.length} พื้นที่</span>
                </div>

                {/* Location list */}
                {localSettings.locations.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3 Prompt">ยังไม่มีพื้นที่ กด "เพิ่มพื้นที่" เพื่อเริ่มต้น</p>
                )}
                <div className="space-y-2">
                  {localSettings.locations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-2 bg-slate-50 rounded-2xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 Prompt truncate">{loc.name}</p>
                        <p className="text-[10px] text-slate-400 Prompt">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · รัศมี {loc.radius_meters} ม.</p>
                      </div>
                      <button
                        onClick={() => setGeofenceModal({ open: true, editId: loc.id })}
                        className="w-7 h-7 flex items-center justify-center text-blue-500 hover:bg-blue-100 rounded-xl transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLocalSettings(prev => ({ ...prev, locations: prev.locations.filter(l => l.id !== loc.id) }))}
                        className="w-7 h-7 flex items-center justify-center text-rose-400 hover:bg-rose-50 rounded-xl transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setGeofenceModal({ open: true, editId: null })}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-2xl border border-blue-200 transition active:scale-95 Prompt"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มพื้นที่ใหม่
                </button>
              </div>

              {/* Work Time Section */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <Clock className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 Prompt">เวลาเข้างาน</h3>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 Prompt">
                    เวลาเริ่มงานมาตรฐาน (หากเข้าหลังนี้ = สาย)
                  </label>
                  <input
                    type="time"
                    value={localSettings.work_start_time}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, work_start_time: e.target.value }))}
                    className="w-full px-4 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-400 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Voice Message */}
              <div className="bg-white rounded-3xl border border-teal-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-teal-50 rounded-xl flex items-center justify-center text-sm">&#128266;</div>
                  <h3 className="text-sm font-bold text-slate-800 Prompt">เสียงแจ้งเมื่อเช็คอินสำเร็จ</h3>
                </div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 Prompt">
                  ข้อความ Text-to-Speech
                </label>
                <input
                  type="text"
                  value={localSettings.voice_message}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, voice_message: e.target.value }))}
                  placeholder="เช็คอินสำเร็จ ยินดีต้อนรับ"
                  className="w-full px-4 py-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-teal-400 focus:bg-white transition Prompt"
                />

                {/* Voice Selection */}
                {voices.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 mt-2 Prompt">
                      เลือกเสียง
                    </label>
                    <select
                      value={localSettings.voice_name || ''}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, voice_name: e.target.value }))}
                      className="w-full px-4 py-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-teal-400 focus:bg-white transition Prompt"
                    >
                      <option value="">ค่าเริ่มต้นของระบบ (System Default)</option>
                      {voices.map(v => (
                        <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Rate & Pitch */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide Prompt">ความเร็ว ({localSettings.voice_rate || 0.95}x)</label>
                    </div>
                    <input type="range" min="0.5" max="2" step="0.05"
                      value={localSettings.voice_rate || 0.95}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, voice_rate: parseFloat(e.target.value) }))}
                      className="w-full accent-teal-600"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide Prompt">ระดับเสียง ({localSettings.voice_pitch || 1.05})</label>
                    </div>
                    <input type="range" min="0.1" max="2" step="0.05"
                      value={localSettings.voice_pitch || 1.05}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, voice_pitch: parseFloat(e.target.value) }))}
                      className="w-full accent-teal-600"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const msg = new SpeechSynthesisUtterance(localSettings.voice_message || 'เช็คอินสำเร็จ');
                    msg.lang = 'th-TH'; 
                    msg.rate = localSettings.voice_rate ?? 0.95; 
                    msg.pitch = localSettings.voice_pitch ?? 1.05;
                    if (localSettings.voice_name) {
                      const selectedVoice = voices.find(v => v.voiceURI === localSettings.voice_name);
                      if (selectedVoice) msg.voice = selectedVoice;
                    }
                    speechSynthesis.cancel();
                    speechSynthesis.speak(msg);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs rounded-xl border border-teal-200 transition active:scale-95 Prompt"
                >
                  &#128266; ทดสอบเสียง
                </button>
              </div>

              {/* Holidays Section */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-violet-50 rounded-xl flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-violet-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 Prompt">วันหยุดการลงเวลา</h3>
                </div>
                <p className="text-xs text-slate-400">วันที่ตั้งค่าไว้จะไม่นับว่าช่างขาดงาน</p>

                {/* Sunday toggle */}
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-800 Prompt">หยุดวันอาทิตย์อัตโนมัติ</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">ทุกวันอาทิตย์จะไม่นับว่าขาดงาน</p>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !systemSettings.attendance_exclude_sundays;
                      await updateSystemSettings({ attendance_exclude_sundays: next });
                      showToast(next ? 'เปิดใช้งานหยุดวันอาทิตย์แล้ว' : 'ปิดการหยุดวันอาทิตย์แล้ว', 'success');
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      systemSettings.attendance_exclude_sundays ? 'bg-indigo-500' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      systemSettings.attendance_exclude_sundays ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Custom holidays */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-slate-700 Prompt">วันหยุดพิเศษ</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={e => setNewHolidayDate(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newHolidayName}
                        onChange={e => setNewHolidayName(e.target.value)}
                        placeholder="ชื่อวันหยุด เช่น วันสงกรานต์"
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all Prompt"
                      />
                      <button
                        onClick={async () => {
                          if (!newHolidayDate || !newHolidayName.trim()) {
                            showToast('กรุณาระบุวันที่และชื่อวันหยุด', 'info'); return;
                          }
                          const current = systemSettings.attendance_holidays ?? [];
                          if (current.some(h => h.date === newHolidayDate)) {
                            showToast('วันที่นี้มีอยู่แล้ว', 'info'); return;
                          }
                          const next = [...current, { date: newHolidayDate, name: newHolidayName.trim() }]
                            .sort((a, b) => a.date.localeCompare(b.date));
                          await updateSystemSettings({ attendance_holidays: next });
                          setNewHolidayDate('');
                          setNewHolidayName('');
                          showToast('เพิ่มวันหยุดแล้ว', 'success');
                        }}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={12} /> เพิ่ม
                      </button>
                    </div>
                  </div>

                  {/* List */}
                  {(systemSettings.attendance_holidays ?? []).length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center py-3">ยังไม่มีวันหยุดพิเศษ</p>
                  ) : (
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {[...(systemSettings.attendance_holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                        <li key={h.date} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-violet-700 Prompt truncate">{h.name}</p>
                            <p className="text-[10px] text-slate-500 Prompt mt-0.5">
                              {new Date(h.date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              const next = (systemSettings.attendance_holidays ?? []).filter(x => x.date !== h.date);
                              await updateSystemSettings({ attendance_holidays: next });
                              showToast('ลบวันหยุดแล้ว', 'success');
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Save Settings Button */}
              <button
                onClick={saveSettings}
                disabled={settingsSaving}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-2xl text-sm transition active:scale-95 Prompt shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
              >
                {settingsSaving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />กำลังบันทึก...</> : '💾 บันทึกการตั้งค่า'}
              </button>

              {/* Employee Management */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-violet-50 rounded-xl flex items-center justify-center">
                      <Users className="w-4 h-4 text-violet-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 Prompt">จัดการพนักงาน</h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full">{employees.length} คน</span>
                </div>
                <p className="text-[10px] text-slate-400 Prompt">&#128683; กด ลบ เพื่อซ่อนฟรีแลนซ์ที่ไม่ต้องเช็คอินออกจากรายชื่อ</p>

                {/* Active employees */}
                <div className="space-y-2">
                  {employees.map(emp => {
                    const hasFace = faceRegistered[emp.username] === true;
                    return (
                    <div key={emp.username} className={`flex items-center gap-3 py-2.5 px-3 rounded-2xl border transition-colors ${hasFace ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-transparent'}`}>
                      {/* Avatar with face-status ring */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${hasFace ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400' : 'bg-blue-100 text-blue-700'}`}>
                        {emp.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 Prompt truncate">{shortName(emp.name)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[9px] text-slate-400 Prompt">{emp.username}</p>
                          {hasFace && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                              ✓ ลงทะเบียนแล้ว
                            </span>
                          )}
                          {!hasFace && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">
                              ยังไม่ได้ลงทะเบียน
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRegisterFace(emp)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 font-bold text-[9px] rounded-xl border transition Prompt ${hasFace ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200'}`}
                        >
                          <Camera className="w-3 h-3" />
                          {hasFace ? 'อัปเดต' : 'สแกนใบหน้า'}
                        </button>
                        <button
                          onClick={() => handleExcludeEmployee(emp)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-xl border border-red-200 transition"
                          title="ซ่อนออก"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>

                {/* Excluded employees list */}
                {(localSettings.excluded_usernames || []).length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 Prompt mb-2">&#128683; ซ่อนอยู่ (ฟรีแลนซ์)</p>
                    {(localSettings.excluded_usernames || []).map(uname => (
                      <div key={uname} className="flex items-center gap-2 py-2 px-3 bg-red-50 rounded-xl mb-1.5">
                        <span className="flex-1 text-xs text-red-500 Prompt font-medium truncate">{uname}</span>
                        <button
                          onClick={() => handleIncludeEmployee(uname)}
                          className="text-[9px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition Prompt whitespace-nowrap"
                        >
                          คืนสถานะ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Clear Data Section */}
              <div className="bg-white rounded-3xl border border-red-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-red-50 rounded-xl flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-red-600 Prompt">เคลียข้อมูล</h3>
                    <p className="text-[9px] text-slate-400 Prompt">Dev / Testing — ไม่สามารถกู้คืนได้!</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleClearTodayRecords}
                    disabled={clearingData}
                    className="py-3 px-2 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs rounded-2xl border border-orange-200 transition active:scale-95 Prompt disabled:opacity-50"
                  >
                    {clearingData ? '...' : '🧹 ลบวันนี้'}
                  </button>
                  <button
                    onClick={handleClearAllRecords}
                    disabled={clearingData}
                    className="py-3 px-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-2xl border border-red-200 transition active:scale-95 Prompt disabled:opacity-50"
                  >
                    {clearingData ? '...' : '⚠️ ลบทั้งหมด'}
                  </button>
                </div>
              </div>

            </motion.div>
          )}


          {/* ═══════════════ REPORTS TAB ═══════════════ */}
          {activeTab === 'reports' && (
            <motion.div key="reports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Filter Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-800 Prompt">กรองข้อมูล</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 Prompt">จากวันที่</label>
                    <input type="date" value={reportDateFrom}
                      onChange={(e) => setReportDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 Prompt">ถึงวันที่</label>
                    <input type="date" value={reportDateTo}
                      onChange={(e) => setReportDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 Prompt">ช่าง (เว้นว่าง = ทั้งหมด)</label>
                  <div className="relative">
                    <select value={reportEmployee} onChange={(e) => setReportEmployee(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 pr-8 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 transition text-slate-700 font-semibold Prompt"
                    >
                      <option value="">ช่างทั้งหมด</option>
                      {employees.map(e => <option key={e.username} value={e.username}>{e.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <button
                  onClick={loadReport}
                  disabled={reportLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition active:scale-95 Prompt flex items-center justify-center gap-2"
                >
                  {reportLoading ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />กำลังโหลด...</> : '🔍 สร้างรายงาน'}
                </button>
              </div>

              {/* Export Buttons */}
              {reportRecords.length > 0 && (
                <div className="flex gap-3">
                  <button onClick={exportCSV} className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl transition active:scale-95 Prompt shadow-lg shadow-emerald-500/30">
                    <Download className="w-4 h-4" />
                    Export Excel (CSV)
                  </button>
                  <button onClick={exportPDF} className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl transition active:scale-95 Prompt shadow-lg shadow-rose-500/30">
                    <FileText className="w-4 h-4" />
                    Export PDF
                  </button>
                </div>
              )}

              {/* Report Table */}
              {reportRecords.length > 0 ? (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 Prompt">ผลลัพธ์ {reportRecords.length} รายการ</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50">
                        <tr>
                          {['วันที่', 'ชื่อ', 'เวลาเข้า', 'สถานะ', 'พื้นที่'].map(h => (
                            <th key={h} className="text-left px-3 py-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-wide Prompt whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const uiHolidays = getHolidaysInRange(reportDateFrom, reportDateTo, systemSettings.attendance_exclude_sundays, systemSettings.attendance_holidays ?? []);
                          const recItems = reportRecords.map(r => ({ type: 'rec' as const, date: r.date, data: r }));
                          const holItems = uiHolidays.map(h => ({ type: 'hol' as const, date: h.date, name: h.name }));
                          const combined = [...recItems, ...holItems].sort((a, b) => b.date.localeCompare(a.date));
                          return combined.map((item, idx) => {
                            if (item.type === 'hol') {
                              return (
                                <tr key={`h-${item.date}`} className="border-t border-violet-100 bg-violet-50/60">
                                  <td className="px-3 py-2 text-violet-600 Prompt whitespace-nowrap font-semibold">{fmtDate(item.date)}</td>
                                  <td colSpan={3} className="px-3 py-2">
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 Prompt">
                                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                                      วันหยุด: {item.name}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-violet-400 Prompt">-</td>
                                </tr>
                              );
                            }
                            const r = item.data;
                            const sk = getStatusKey(r);
                            const cfg = STATUS_CONFIG[sk] || STATUS_CONFIG['absent'];
                            return (
                              <tr key={r.id ?? idx} className="border-t border-slate-50 hover:bg-slate-50/50 transition">
                                <td className="px-3 py-2.5 text-slate-600 Prompt whitespace-nowrap">{fmtDate(r.date)}</td>
                                <td className="px-3 py-2.5 text-slate-700 font-semibold Prompt whitespace-nowrap">{r.name}</td>
                                <td className="px-3 py-2.5 text-slate-600 Prompt whitespace-nowrap">
                                  {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border Prompt ${cfg.bg} ${cfg.text} ${cfg.border} whitespace-nowrap`}>
                                    {cfg.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-500 Prompt whitespace-nowrap">
                                  {r.override_province ? `${r.override_province} › ${r.override_district}` : '-'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : reportLoading ? null : (
                <div className="text-center py-12 text-slate-400">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm Prompt">กดปุ่มสร้างรายงานเพื่อดูข้อมูล</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Override Modal */}
      <AttendanceOverrideModal
        isOpen={overrideModal.open}
        onClose={() => setOverrideModal(prev => ({ ...prev, open: false }))}
        onSave={handleOverrideSave}
        employeeName={overrideModal.employee?.name || ''}
        date={overrideModal.date}
      />

      {/* Geofence Modal */}
      {(() => {
        const editing = geofenceModal.editId
          ? localSettings.locations.find(l => l.id === geofenceModal.editId)
          : null;
        return (
          <GeofenceMapModal
            isOpen={geofenceModal.open}
            onClose={() => setGeofenceModal({ open: false, editId: null })}
            onSave={(lat, lng, radius, name) => {
              if (geofenceModal.editId) {
                setLocalSettings(prev => ({
                  ...prev,
                  locations: prev.locations.map(l =>
                    l.id === geofenceModal.editId ? { ...l, lat, lng, radius_meters: radius, name } : l
                  ),
                }));
              } else {
                const newLoc: OfficeLocation = { id: Date.now().toString(), name, lat, lng, radius_meters: radius };
                setLocalSettings(prev => ({ ...prev, locations: [...prev.locations, newLoc] }));
              }
              showToast('อัปเดตพิกัดแล้ว กด "บันทึกการตั้งค่า" เพื่อยืนยัน', 'info');
            }}
            initialLat={editing?.lat ?? localSettings.office_lat}
            initialLng={editing?.lng ?? localSettings.office_lng}
            initialRadius={editing?.radius_meters ?? localSettings.radius_meters}
            initialName={editing?.name ?? ''}
          />
        );
      })()}

      {/* Face Registration Modal */}
      <FaceScanModal
        isOpen={faceRegModal.open}
        onClose={() => setFaceRegModal({ open: false })}
        onSuccess={handleFaceRegSuccess}
        employeeName={faceRegModal.employee?.name || ''}
      />
    </div>
  );
}
