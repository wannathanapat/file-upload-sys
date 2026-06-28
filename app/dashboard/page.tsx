'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import * as XLSX from 'xlsx';
import Sidebar from '@/components/sidebar';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '../providers';
import { getDb } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  writeBatch,
  onSnapshot,
  where
} from 'firebase/firestore';
import type { SubmissionData, JobRow, UserData } from '@/lib/utils';
import { formatThaiDate, getFileIdFromUrl, getEnglishNameSuffix } from '@/lib/utils';
import CustomPdfViewer from '@/components/CustomPdfViewer';
import { 
  Search, 
  Filter, 
  Calendar, 
  FileSpreadsheet, 
  Clock, 
  CheckCircle, 
  CheckCircle2,
  XCircle, 
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  AlertTriangle,
  Edit3,
  ExternalLink,
  ChevronDown,
  BarChart3,
  AlertCircle,
  History,
  Zap,
  RefreshCw,
  Users,
  X,
  Info,
  Home,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { deleteTargetUploadFolder, getValidAccessToken } from '@/lib/gdrive';

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

function CustomSelect({ value, onChange, options, placeholder }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 transition flex items-center justify-between Prompt cursor-pointer font-bold"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder || ''}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute left-0 right-0 mt-1.5 z-50 max-h-60 overflow-y-auto bg-white border border-slate-100 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] p-1.5 space-y-0.5"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition duration-150 Prompt cursor-pointer ${
                  value === opt.value
                    ? 'bg-indigo-500 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const formatDisplayName = (fullName: string): string => {
  if (!fullName) return '';
  const parts = fullName.split('-');
  return parts[parts.length - 1].trim();
};

const formatSpeed = (hours: number | null): string => {
  if (hours === null) return '—';
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} นาที`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} ชม.`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)} วัน`;
};

interface TechnicianPixelOfficeProps {
  users: any[];
  todayAttendance: Record<string, any>;
  assignedJobs: any[];
  submissions: any[];
}

// ── Retro Pixel Art Furniture Assets ──
const BookcaseSVG = () => (
  <svg viewBox="0 0 32 36" className="w-12 h-14" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="30" height="34" fill="#854d0e" rx="1" />
    <rect x="3" y="10" width="26" height="2" fill="#451a03" />
    <rect x="3" y="20" width="26" height="2" fill="#451a03" />
    <rect x="3" y="30" width="26" height="2" fill="#451a03" />
    {/* Books */}
    <rect x="5" y="4" width="3" height="6" fill="#ef4444" />
    <rect x="8" y="3" width="2" height="7" fill="#3b82f6" />
    <rect x="11" y="5" width="3" height="5" fill="#22c55e" />
    <rect x="18" y="13" width="3" height="7" fill="#eab308" />
    <rect x="21" y="14" width="2" height="6" fill="#a855f7" />
    <rect x="6" y="24" width="3" height="6" fill="#38bdf8" />
    <rect x="10" y="24" width="3" height="6" fill="#ec4899" />
    <rect x="22" y="23" width="2" height="7" fill="#ef4444" />
  </svg>
);

const PlantSVG = () => (
  <svg viewBox="0 0 16 20" className="w-6 h-8" style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="13" width="8" height="7" fill="#c2410c" rx="1" /> {/* Pot */}
    {/* Green Leafs */}
    <circle cx="8" cy="7" r="5" fill="#15803d" />
    <circle cx="5" cy="9" r="4.5" fill="#166534" />
    <circle cx="11" cy="8" r="4" fill="#22c55e" />
  </svg>
);

const VendingMachineSVG = () => (
  <svg viewBox="0 0 20 36" className="w-8 h-14" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="18" height="34" fill="#ef4444" rx="1.5" />
    <rect x="3" y="3" width="14" height="15" fill="#1e293b" /> {/* Glass */}
    {/* Cans */}
    <rect x="5" y="5" width="2" height="4" fill="#38bdf8" />
    <rect x="9" y="5" width="2" height="4" fill="#22c55e" />
    <rect x="13" y="5" width="2" height="4" fill="#eab308" />
    <rect x="5" y="12" width="2" height="4" fill="#ea580c" />
    <rect x="9" y="12" width="2" height="4" fill="#a855f7" />
    <rect x="13" y="12" width="2" height="4" fill="#ec4899" />
    {/* Coin panel */}
    <rect x="4" y="22" width="4" height="4" fill="#cbd5e1" />
    <rect x="5" y="23" width="1" height="2" fill="#1e293b" />
    <rect x="4" y="28" width="12" height="5" fill="#334155" />
  </svg>
);

const WaterCoolerSVG = () => (
  <svg viewBox="0 0 16 32" className="w-6 h-12" style={{ imageRendering: 'pixelated' }}>
    <rect x="3" y="2" width="10" height="12" rx="2" fill="#38bdf8" /> {/* Jug */}
    <rect x="5" y="4" width="2" height="8" fill="#e0f2fe" opacity="0.6" />
    <rect x="2" y="14" width="12" height="16" fill="#cbd5e1" rx="1" /> {/* Dispenser */}
    <rect x="2" y="14" width="12" height="2" fill="#94a3b8" />
    <rect x="5" y="18" width="6" height="4" fill="#64748b" />
    <rect x="7" y="19" width="2" height="2" fill="#ef4444" /> {/* Tap */}
  </svg>
);

const FridgeSVG = () => (
  <svg viewBox="0 0 20 36" className="w-8 h-14" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="18" height="34" fill="#94a3b8" rx="1.5" />
    <rect x="1" y="1" width="18" height="16" fill="#cbd5e1" />
    {/* Handles */}
    <rect x="2" y="12" width="1.5" height="4" fill="#334155" />
    <rect x="2" y="18" width="1.5" height="5" fill="#334155" />
    <rect x="1" y="17" width="18" height="1" fill="#475569" />
  </svg>
);

const DeskSVG = () => (
  <svg viewBox="0 0 36 28" className="w-14 h-11" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="14" width="34" height="10" fill="#854d0e" rx="1" /> {/* Wood Table */}
    <rect x="1" y="12" width="34" height="2" fill="#a16207" />
    {/* Legs */}
    <rect x="2" y="24" width="3" height="4" fill="#451a03" />
    <rect x="31" y="24" width="3" height="4" fill="#451a03" />
    {/* Computer Monitor */}
    <rect x="11" y="2" width="14" height="9" rx="1" fill="#475569" />
    <rect x="12.5" y="3.5" width="11" height="6" fill="#1e293b" />
    <rect x="16" y="11" width="4" height="3" fill="#64748b" />
    <rect x="14" y="13" width="8" height="1" fill="#475569" />
    {/* Keyboard & Mouse */}
    <rect x="13" y="15" width="10" height="2" fill="#cbd5e1" />
    <rect x="25" y="16" width="2" height="1.5" fill="#cbd5e1" />
    {/* Coffee Mug */}
    <rect x="6" y="15" width="3" height="3" fill="#eab308" />
  </svg>
);

const LoungeTableSVG = () => (
  <svg viewBox="0 0 32 24" className="w-12 h-9" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="10" width="30" height="8" fill="#d97706" rx="1" />
    <rect x="2" y="18" width="2" height="6" fill="#78350f" />
    <rect x="28" y="18" width="2" height="6" fill="#78350f" />
    {/* Laptop */}
    <rect x="10" y="4" width="12" height="7" fill="#cbd5e1" />
    <rect x="11" y="5" width="10" height="5" fill="#38bdf8" />
    <rect x="9" y="11" width="14" height="1" fill="#94a3b8" />
  </svg>
);

const CouchSVG = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 16 28" className="w-6 h-11" style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="14" height="26" rx="2" fill="#ec4899" />
    {dir === 'left' ? (
      <>
        <rect x="1" y="1" width="4" height="26" fill="#db2777" />
        <rect x="12" y="1" width="3" height="26" fill="#be185d" />
      </>
    ) : (
      <>
        <rect x="1" y="1" width="3" height="26" fill="#be185d" />
        <rect x="11" y="1" width="4" height="26" fill="#db2777" />
      </>
    )}
  </svg>
);

// ── Pixel Art Character Sprite Component ──
interface CharacterSVGProps {
  hairStyle: number;
  shirtColor: string;
  isWalking: boolean;
  isTyping: boolean;
  dir: 'left' | 'right' | 'front' | 'back';
}

const CharacterSVG = ({ hairStyle, shirtColor, isWalking, isTyping, dir }: CharacterSVGProps) => {
  const hairColors = ['#78350f', '#eab308', '#475569', '#1e293b'];
  const hairColor = hairColors[hairStyle % hairColors.length];

  return (
    <svg viewBox="0 0 16 24" className="w-8 h-12" style={{ imageRendering: 'pixelated' }}>
      {/* Legs Animation */}
      {isWalking ? (
        <>
          <rect x="4" y="18" width="3" height="6" fill="#1e293b" className="animate-bounce" />
          <rect x="9" y="18" width="3" height="6" fill="#1e293b" />
        </>
      ) : (
        <>
          <rect x="4" y="19" width="3" height="5" fill="#1e293b" />
          <rect x="9" y="19" width="3" height="5" fill="#1e293b" />
        </>
      )}

      {/* Body / Shirt */}
      <rect x="3" y="11" width="10" height="8" rx="1.5" fill={shirtColor} />

      {/* Typing Hands */}
      {isTyping && (
        <>
          <rect x="1" y="13" width="3" height="2" fill="#fed7aa" className="animate-bounce" />
          <rect x="12" y="13" width="3" height="2" fill="#fed7aa" className="animate-bounce" />
        </>
      )}

      {/* Head */}
      <rect x="4" y="3" width="8" height="8" rx="1" fill="#fed7aa" />

      {/* Face & Hair rendering based on orientation direction */}
      {dir === 'front' && (
        <>
          <rect x="5" y="6" width="1.5" height="1.5" fill="#1e293b" />
          <rect x="9.5" y="6" width="1.5" height="1.5" fill="#1e293b" />
          <rect x="7" y="8" width="2" height="1" fill="#f43f5e" /> {/* mouth */}
          {/* Hair */}
          {hairStyle === 0 && <path d="M4 3 h8 v2 h-8 z M3 4 h1 v2 h-1 z M12 4 h1 v2 h-1 z" fill={hairColor} />}
          {hairStyle === 1 && <path d="M4 2 h8 v3 h-8 z M2 3 h2 v3 h-2 z M12 3 h2 v3 h-2 z" fill={hairColor} />}
          {hairStyle === 2 && <rect x="3" y="1" width="10" height="4" fill={hairColor} rx="1.5" />}
          {hairStyle === 3 && <rect x="3" y="2" width="10" height="3" fill="#ef4444" />}
        </>
      )}

      {dir === 'back' && (
        <>
          <rect x="4" y="3" width="8" height="7" fill={hairColor} />
          {hairStyle === 1 && <rect x="3" y="8" width="10" height="4" fill={hairColor} />}
        </>
      )}

      {dir === 'left' && (
        <>
          <rect x="5" y="6" width="1.5" height="1.5" fill="#1e293b" />
          <rect x="4" y="3" width="7" height="7" fill={hairColor} />
        </>
      )}

      {dir === 'right' && (
        <>
          <rect x="9.5" y="6" width="1.5" height="1.5" fill="#1e293b" />
          <rect x="5" y="3" width="7" height="7" fill={hairColor} />
        </>
      )}
    </svg>
  );
};

function TechnicianPixelOffice({ users, todayAttendance, assignedJobs, submissions }: TechnicianPixelOfficeProps) {
  // Get all technicians (role === 'staff')
  const technicians = users.filter(u => u.role === 'staff');
  
  const [demoMode, setDemoMode] = useState(false);
  const [demoTechs, setDemoTechs] = useState<any[]>([]);

  // Initialize and run the simulation when demoMode is true
  useEffect(() => {
    if (!demoMode) {
      setDemoTechs([]);
      return;
    }

    const statuses = ['working', 'onsite', 'leave', 'offline'];
    const provinces = ['กรุงเทพฯ', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'ชลบุรี'];
    const leaveTypes = ['sick_leave', 'personal_leave'];

    const initialDemo = technicians.map((u, idx) => {
      const name = u.name || '';
      const username = u.username || '';
      
      const randomStatus = statuses[idx % statuses.length];
      const pendingCount = Math.floor(Math.random() * 4);
      // ONLY allow submission bubble for working or onsite techs
      const isWorkingOrOnsite = randomStatus === 'working' || randomStatus === 'onsite';
      const hasRecentSub = isWorkingOrOnsite && Math.random() > 0.6;

      const randHour = 7 + Math.floor(Math.random() * 3);
      const randMin = Math.floor(Math.random() * 60);
      const checkInTime = `${randHour.toString().padStart(2, '0')}:${randMin.toString().padStart(2, '0')}`;

      return {
        username,
        name,
        displayName: name.split('-').pop()?.trim() || name,
        pendingCount,
        hasRecentSub,
        checkInTime,
        status: randomStatus === 'working' ? 'normal' : randomStatus === 'leave' ? leaveTypes[idx % 2] : randomStatus,
        province: provinces[idx % provinces.length],
      };
    });

    setDemoTechs(initialDemo);

    const interval = setInterval(() => {
      setDemoTechs(prev => {
        return prev.map(t => {
          // 15% chance to update status per tick so characters move occasionally and with purpose
          if (Math.random() > 0.85) {
            const nextStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const newPending = Math.floor(Math.random() * 4);
            
            let statusVal = 'offline';
            if (nextStatus === 'working') {
              statusVal = 'normal';
            } else if (nextStatus === 'leave') {
              statusVal = Math.random() > 0.5 ? 'sick_leave' : 'personal_leave';
            } else if (nextStatus === 'onsite') {
              statusVal = 'onsite';
            }

            // ONLY allow submission bubble for working or onsite techs
            const isWorkingOrOnsiteVal = statusVal === 'normal' || statusVal === 'late' || statusVal === 'onsite';
            const subChance = isWorkingOrOnsiteVal && Math.random() > 0.6;

            return {
              ...t,
              status: statusVal,
              pendingCount: newPending,
              hasRecentSub: subChance,
            };
          }
          return t;
        });
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [demoMode, users]);

  // Categorize technicians into states
  const workingTechs: any[] = [];
  const onsiteTechs: any[] = [];
  const leaveTechs: any[] = [];
  const offlineTechs: any[] = [];

  const sourceTechs = demoMode ? demoTechs : technicians.map(u => {
    const username = u.username || '';
    const name = u.name || '';
    const attRecord = todayAttendance[username] || todayAttendance[name];
    
    // Check if submitted any job today
    const submittedToday = submissions.some(s => {
      if (s.name?.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
      const subDate = s.submission_date?.split('T')[0];
      const today = new Date().toLocaleDateString('en-CA');
      return subDate === today;
    });

    const pendingJobs = assignedJobs.filter(j => 
      j.status !== 'submitted' && 
      (j.technician?.trim().toLowerCase() === name.trim().toLowerCase() ||
       j.technician?.trim().toLowerCase() === username.trim().toLowerCase())
    );
    const pendingCount = pendingJobs.length;

    // Option B lifecycle: Determine status automatically
    let status = 'offline';
    if (attRecord) {
      // Check if user is on leave
      if (attRecord.status === 'sick_leave' || attRecord.status === 'personal_leave') {
        status = attRecord.status;
      } else if (pendingCount > 0) {
        status = 'onsite'; // Has active queue -> driving/on-site!
      } else if (submittedToday) {
        status = 'offline'; // Completed all assigned jobs today -> offline/home!
      } else {
        status = 'normal'; // Checked in but 0 jobs assigned -> waiting at desk!
      }
    }

    const isWorkingOrOnsiteLive = status === 'normal' || status === 'late' || status === 'onsite';
    
    // ONLY check recent submissions if they are active/onsite
    const hasRecentSub = isWorkingOrOnsiteLive && submissions.some(s => {
      if (s.name?.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
      const subTime = new Date(s.submission_date).getTime();
      return (Date.now() - subTime) < 2 * 60 * 60 * 1000;
    });

    const activeJob = pendingJobs[0];
    const provinceVal = activeJob?.province || attRecord?.province || 'เดินทาง';

    return {
      username,
      name,
      displayName: name.split('-').pop()?.trim() || name,
      pendingCount,
      hasRecentSub,
      checkInTime: attRecord?.check_in_time ? new Date(attRecord.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '',
      status,
      province: provinceVal,
      district: attRecord?.district || ''
    };
  });

  sourceTechs.forEach(t => {
    if (t.status === 'onsite') {
      onsiteTechs.push(t);
    } else if (t.status === 'sick_leave' || t.status === 'personal_leave') {
      leaveTechs.push(t);
    } else if (t.status === 'normal' || t.status === 'late') {
      workingTechs.push(t);
    } else {
      offlineTechs.push(t);
    }
  });

  const getTargetCoords = (t: any) => {
    if (t.status === 'onsite') {
      const idx = onsiteTechs.findIndex(o => o.username === t.username);
      return { x: 12 + (idx >= 0 ? idx : 0) * 18, y: 91, dir: 'right' as const };
    } else if (t.status === 'sick_leave' || t.status === 'personal_leave') {
      const idx = leaveTechs.findIndex(l => l.username === t.username);
      if (idx === 0) return { x: 61.3, y: 59, dir: 'right' as const };
      if (idx === 1) return { x: 89.0, y: 59, dir: 'left' as const };
      return { x: 75, y: 70, dir: 'front' as const };
    } else if (t.status === 'normal' || t.status === 'late') {
      const idx = workingTechs.findIndex(w => w.username === t.username);
      if (idx === 0) return { x: 8.8, y: 26, dir: 'back' as const };
      if (idx === 1) return { x: 36.3, y: 26, dir: 'back' as const };
      if (idx === 2) return { x: 8.8, y: 55, dir: 'back' as const };
      if (idx === 3) return { x: 36.3, y: 55, dir: 'back' as const };
      return { x: 25, y: 40, dir: 'front' as const };
    } else {
      const idx = offlineTechs.findIndex(of => of.username === t.username);
      if (idx === 0) return { x: 68, y: 22, dir: 'front' as const };
      if (idx === 1) return { x: 94.6, y: 22, dir: 'front' as const };
      if (idx === 2) return { x: 73, y: 22, dir: 'front' as const };
      return { x: 80, y: 25, dir: 'front' as const };
    }
  };

  const [techPositions, setTechPositions] = useState<Record<string, { x: number; y: number; dir: 'left' | 'right' | 'front' | 'back'; isWalking: boolean }>>({});

  // Trigger smooth coordinates transition and set walking animation state
  useEffect(() => {
    const newPositions = { ...techPositions };
    let changed = false;

    sourceTechs.forEach(t => {
      const target = getTargetCoords(t);
      const prev = techPositions[t.username];

      if (!prev || prev.x !== target.x || prev.y !== target.y) {
        newPositions[t.username] = {
          x: target.x,
          y: target.y,
          dir: target.dir,
          isWalking: prev ? true : false
        };
        changed = true;

        if (prev) {
          setTimeout(() => {
            setTechPositions(curr => {
              if (curr[t.username]) {
                return {
                  ...curr,
                  [t.username]: { ...curr[t.username], isWalking: false }
                };
              }
              return curr;
            });
          }, 3000);
        }
      }
    });

    if (changed) {
      setTechPositions(newPositions);
    }
  }, [sourceTechs]);

  // Generate color styles for hair and shirts based on technician name index to keep them consistent
  const getTechColorPreset = (name: string) => {
    const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const presets = [
      { shirt: '#3b82f6', hair: 0 }, // blue, short
      { shirt: '#e11d48', hair: 1 }, // red, long/spiky
      { shirt: '#10b981', hair: 2 }, // green, curly
      { shirt: '#a855f7', hair: 3 }, // purple, cap
      { shirt: '#f59e0b', hair: 0 }, // yellow, short
      { shirt: '#6366f1', hair: 1 }, // indigo, long/spiky
    ];
    return presets[sum % presets.length];
  };

  return (
    <div className="glass-card p-5 mb-6 overflow-hidden relative">
      <style dangerouslySetInnerHTML={{ __html: `
        .pixel-wood-floor {
          background-color: #cb9b6d;
          background-image: 
            linear-gradient(90deg, #b08154 2px, transparent 2px),
            linear-gradient(0deg, #b08154 2px, transparent 2px);
          background-size: 24px 24px;
        }
        .pixel-kitchen-tiles {
          background-color: #f1f5f9;
          background-image: 
            linear-gradient(90deg, #cbd5e1 1px, transparent 1px),
            linear-gradient(0deg, #cbd5e1 1px, transparent 1px);
          background-size: 16px 16px;
        }
        .pixel-lounge-carpet {
          background-color: #1e293b;
          background-image: radial-gradient(#334155 15%, transparent 16%);
          background-size: 8px 8px;
        }
        @keyframes wheel-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes zzz-float {
          0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: translate(6px, -20px) scale(1.1); }
        }
        .animate-wheel {
          animation: wheel-spin 1s infinite linear;
        }
        .animate-zzz-1 {
          animation: zzz-float 2.5s infinite ease-out;
        }
        .animate-zzz-2 {
          animation: zzz-float 2.5s infinite ease-out 0.8s;
        }
        .animate-zzz-3 {
          animation: zzz-float 2.5s infinite ease-out 1.6s;
        }
        .tech-character-transition {
          transition: left 3s ease-in-out, top 3s ease-in-out;
        }
      `}} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            🎮 Live Tech Pixel Office (สถานะปฏิบัติงานช่างเทคนิคเรียลไทม์)
          </h3>
          {demoMode && (
            <span className="bg-rose-500 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full shadow-sm animate-pulse Prompt tracking-wider">
              🎮 DEMO ACTIVE
            </span>
          )}
        </div>
        
        {/* Toggle Demo Switch */}
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[10px] font-bold text-slate-500 Prompt">🎮 จำลองข้อมูล (Demo)</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-8 h-4 bg-slate-200 rounded-full transition-colors duration-200 ${demoMode ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow-md transition-transform duration-200 ${demoMode ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </label>

          <div className="flex gap-3 text-[10px] font-bold Prompt text-slate-500 border-l border-slate-200 pl-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              ทำงานสะสมวันนี้: {submissions.filter(s => {
                const subDate = s.submission_date?.split('T')[0];
                const today = new Date().toLocaleDateString('en-CA');
                return subDate === today;
              }).length} งาน
            </span>
          </div>
        </div>
      </div>

      {/* 2D Orthogonal Pixel Office Map Viewer Container - Expanded height to 420px */}
      <div className="w-full h-[420px] border-4 border-slate-700 bg-slate-900 rounded-2xl relative overflow-hidden select-none">
        
        {/* ROOM 1: MAIN WORKSPACE (Left Side 55% Width) */}
        <div className="absolute left-0 top-0 w-[55%] h-[82%] pixel-wood-floor">
          {/* Wall Shelves spread out at the top */}
          <div className="absolute left-[8%] top-[2%]"><BookcaseSVG /></div>
          <div className="absolute left-[64%] top-[2%]"><BookcaseSVG /></div>
          {/* Plant Pots & Cardboard boxes */}
          <div className="absolute left-[3%] top-[12%]"><PlantSVG /></div>
          <div className="absolute left-[24%] top-[2%] flex gap-1 bg-amber-800/10 p-1 rounded">
            <div className="w-3.5 h-3.5 bg-amber-700/80 rounded border border-amber-900/60 shadow-xs" />
            <div className="w-3.5 h-3.5 bg-amber-700/80 rounded border border-amber-900/60 shadow-xs" />
          </div>

          {/* DESKS spaced out properly across the main workspace */}
          {/* Desk 1 (top-left) */}
          <div className="absolute left-[10%] top-[20%]"><DeskSVG /></div>
          <div className="absolute left-[16%] top-[32%] w-3 h-3 bg-amber-800/60 rounded-full border border-amber-950" /> {/* Stool */}
          {/* Desk 2 (top-right) */}
          <div className="absolute left-[60%] top-[20%]"><DeskSVG /></div>
          <div className="absolute left-[66%] top-[32%] w-3 h-3 bg-amber-800/60 rounded-full border border-amber-950" /> {/* Stool */}
          {/* Desk 3 (bottom-left) */}
          <div className="absolute left-[10%] top-[55%]"><DeskSVG /></div>
          <div className="absolute left-[16%] top-[67%] w-3 h-3 bg-amber-800/60 rounded-full border border-amber-950" /> {/* Stool */}
          {/* Desk 4 (bottom-right) */}
          <div className="absolute left-[60%] top-[55%]"><DeskSVG /></div>
          <div className="absolute left-[66%] top-[67%] w-3 h-3 bg-amber-800/60 rounded-full border border-amber-950" /> {/* Stool */}
        </div>

        {/* ROOM 2: KITCHEN BREAKROOM (Right Top 45% Width, 40% Height) */}
        <div className="absolute right-0 top-0 w-[45%] h-[40%] pixel-kitchen-tiles">
          {/* Vending machine */}
          <div className="absolute left-[12%] top-[4%]"><VendingMachineSVG /></div>
          {/* Water dispenser */}
          <div className="absolute left-[40%] top-[4%]"><WaterCoolerSVG /></div>
          {/* Sink Counter Cabinet */}
          <div className="absolute right-[24%] top-[4%] flex items-end">
            <div className="w-8 h-10 bg-slate-300 border-t-2 border-slate-400 border-x border-b border-slate-500 rounded-xs flex flex-col justify-between p-0.5">
              <div className="w-4 h-2 bg-slate-500 rounded-full mx-auto" /> {/* Sink Basin */}
              <div className="w-7 h-1 bg-slate-600 rounded-full" />
            </div>
          </div>
          {/* Refrigerator */}
          <div className="absolute right-[4%] top-[4%]"><FridgeSVG /></div>
          {/* Wall Clock */}
          <div className="absolute left-[62%] top-[6%] w-4 h-4 bg-white border border-slate-400 rounded-full flex items-center justify-center">
            <div className="w-2.5 h-0.5 bg-slate-800 absolute transform rotate-45 origin-center" />
          </div>
        </div>

        {/* ROOM 3: LOUNGE AREA (Right Bottom 45% Width, 42% Height) */}
        <div className="absolute right-0 top-[40%] w-[45%] h-[42%] pixel-lounge-carpet">
          {/* Couple of couches facing each other */}
          <div className="absolute left-[14%] top-[45%]"><CouchSVG dir="left" /></div>
          <div className="absolute right-[14%] top-[45%]"><CouchSVG dir="right" /></div>
          {/* Coffee table with open laptop */}
          <div className="absolute left-[34%] top-[48%]"><LoungeTableSVG /></div>
          {/* Shelves and Plant pots on the sides */}
          <div className="absolute left-[4%] top-[10%]"><PlantSVG /></div>
          <div className="absolute right-[4%] top-[10%]"><PlantSVG /></div>
          {/* Painting on the wall */}
          <div className="absolute left-[38%] top-[4%] w-14 h-8 bg-sky-200 border-2 border-amber-800 rounded-sm shadow-sm flex items-center justify-center overflow-hidden">
            <div className="w-full h-3 bg-emerald-500 mt-5 transform rotate-6 scale-110" />
            <div className="w-4 h-4 bg-yellow-100 rounded-full absolute top-1 right-2" />
          </div>
        </div>

        {/* Thick, 3D Pixel Art Wall Boundaries for clear room separation */}
        {/* Vertical divider wall (Workspace vs Kitchen/Lounge) */}
        <div className="absolute left-[54.2%] top-0 bottom-[18%] w-3 bg-[#1e293b] z-15 border-l-2 border-r-2 border-slate-950 shadow-lg flex flex-col justify-around">
          <div className="h-4 w-1 bg-slate-800 opacity-40 mx-auto rounded-full" />
          <div className="h-4 w-1 bg-slate-800 opacity-40 mx-auto rounded-full" />
          <div className="h-4 w-1 bg-slate-800 opacity-40 mx-auto rounded-full" />
        </div>
        
        {/* Horizontal divider wall (Kitchen vs Lounge) */}
        <div className="absolute left-[54.2%] top-[39%] right-0 h-3 bg-[#1e293b] z-15 border-t-2 border-b-2 border-slate-950 shadow-md" />

        {/* SIDEWALK & ON-SITE ROAD (Bottom 18% Width, for On-site live vehicle drive animation) */}
        <div className="absolute left-0 right-0 bottom-0 h-[18%] bg-[#475569] border-t-4 border-slate-950 flex items-center justify-center overflow-hidden">
          {/* Road center line */}
          <div className="w-full h-0.5 border-t border-dashed border-white/60" />
          
          {/* Sidewalk border curb */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#cbd5e1] border-b-2 border-[#94a3b8]" />
        </div>

        {/* ── RENDERING THE ANIMATED LIVE CHARACTERS ───────────────────────── */}
        {sourceTechs.map((tech) => {
          const pos = techPositions[tech.username] || { x: 74, y: 30, dir: 'front', isWalking: false };
          const isTyping = tech.status === 'normal' || tech.status === 'late';
          const preset = getTechColorPreset(tech.name || tech.username);

          return (
            <div
              key={tech.username}
              className="absolute tech-character-transition z-20 flex flex-col items-center cursor-pointer group"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: Math.floor(pos.y * 10) + 100 // Dynamic 2.5D z-sorting!
              }}
            >
              {/* Submission bubble / Task notifications */}
              {tech.hasRecentSub && (
                <div className="absolute -top-6 bg-pink-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded-md shadow-md animate-bounce z-40 whitespace-nowrap">
                  🎉 ส่งงานแล้ว!
                </div>
              )}
              {tech.pendingCount > 0 && !tech.hasRecentSub && (
                <div className="absolute -top-6 bg-indigo-600 text-white font-extrabold text-[8px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md z-40">
                  {tech.pendingCount}
                </div>
              )}

              {/* Zzz floating sleep bubbles for offline techs */}
              {tech.status === 'offline' && (
                <div className="absolute -top-5 left-1 z-30">
                  <span className="absolute text-[8px] font-black text-indigo-400 animate-zzz-1">Z</span>
                  <span className="absolute text-[10px] font-black text-indigo-400 animate-zzz-2" style={{ left: '4px', top: '-4px' }}>Z</span>
                  <span className="absolute text-[11px] font-black text-indigo-400 animate-zzz-3" style={{ left: '8px', top: '-8px' }}>Z</span>
                </div>
              )}

              {/* Check if technician is driving on-site */}
              {tech.status === 'onsite' ? (
                // Little driving truck!
                <div className="flex items-center gap-1 drop-shadow-md">
                  <svg className="w-12 h-6" viewBox="0 0 48 24" fill="none">
                    <rect x="2" y="8" width="28" height="10" rx="1" fill="#3b82f6" />
                    <rect x="28" y="10" width="12" height="8" rx="1" fill="#3b82f6" />
                    <path d="M40 18 L44 18 L42 12 L38 12 Z" fill="#3b82f6" />
                    <path d="M36 11.5 L40 11.5 L38.5 13 L36 13 Z" fill="#e2e8f0" />
                    {/* ladder */}
                    <line x1="4" y1="5" x2="26" y2="5" stroke="#94a3b8" strokeWidth="2" />
                    <line x1="8" y1="5" x2="8" y2="8" stroke="#94a3b8" strokeWidth="1" />
                    <line x1="16" y1="5" x2="16" y2="8" stroke="#94a3b8" strokeWidth="1" />
                    {/* wheels */}
                    <circle cx="10" cy="18" r="4" fill="#1e293b" />
                    <circle cx="10" cy="18" r="2" fill="#ffffff" className="animate-wheel" />
                    <circle cx="32" cy="18" r="4" fill="#1e293b" />
                    <circle cx="32" cy="18" r="2" fill="#ffffff" className="animate-wheel" />
                  </svg>
                  <div className="bg-white/95 px-1.5 py-0.5 rounded border border-indigo-200 text-[8px] font-black text-indigo-700 Prompt whitespace-nowrap shadow-sm">
                    ช่าง {tech.displayName} ({tech.province || 'เดินทาง'})
                  </div>
                </div>
              ) : (
                // Human sprite walking/sitting
                <div className="flex flex-col items-center">
                  <CharacterSVG
                    hairStyle={preset.hair}
                    shirtColor={preset.shirt}
                    isWalking={pos.isWalking}
                    isTyping={isTyping && !pos.isWalking}
                    dir={pos.dir}
                  />
                  {/* Name tag with dynamic status indicator */}
                  <div className="flex flex-col items-center bg-white/95 px-1.5 py-0.5 rounded border border-slate-200 shadow-xs mt-0.5 z-30 max-w-[70px]">
                    <span className="text-[8px] font-black text-slate-800 truncate Prompt text-center" title={tech.name}>
                      {tech.displayName}
                    </span>
                    <span className={`text-[7px] font-bold Prompt whitespace-nowrap leading-none mt-0.5 ${
                      tech.status === 'normal' || tech.status === 'late' ? 'text-emerald-600' :
                      tech.status === 'sick_leave' ? 'text-rose-500' :
                      tech.status === 'personal_leave' ? 'text-amber-500' : 'text-slate-400'
                    }`}>
                      {tech.status === 'normal' || tech.status === 'late' ? 'เข้างาน' :
                       tech.status === 'sick_leave' ? 'ลาป่วย' :
                       tech.status === 'personal_leave' ? 'ลากิจ' : 'ออฟไลน์'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>
    </div>
  );
}

function DashboardContent() {
  const { currentUser, showToast, showConfirm, systemSettings, gdrivePrefs } = useApp();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'auditor';
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewMode = searchParams.get('view') || 'overview';
  
  // No more activeTab state, we derive what to show based on viewMode
  const activeTab = viewMode === 'history' ? 'submissions' : 'queue';
  const [leaderboardTab, setLeaderboardTab] = useState<'total' | 'speed'>('total');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  
  // Data lists
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<JobRow[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, any>>({});
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [techFilter, setTechFilter] = useState(searchParams.get('tech') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentQueuePage, setCurrentQueuePage] = useState(1);
  const [queueTechFilter, setQueueTechFilter] = useState(searchParams.get('tech') || '');
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, techFilter, statusFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentQueuePage(1);
  }, [searchQuery, queueTechFilter]);

  // Detail Modal State
  const [selectedSub, setSelectedSub] = useState<SubmissionData | null>(null);
  const [selectedSubIndex, setSelectedSubIndex] = useState<number>(-1);
  const [isEditingSub, setIsEditingSub] = useState(false);
  const [editStatus, setEditStatus] = useState('รอตรวจ');
  const [editType, setEditType] = useState('งานติดตั้ง (INS)');
  const [editNote, setEditNote] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [editJobId, setEditJobId] = useState('');
  const [editName, setEditName] = useState('');
  const [editOrderNo, setEditOrderNo] = useState('');
  const [editSubWorkType, setEditSubWorkType] = useState('');
  const [editFileUrl, setEditFileUrl] = useState('');
  const [editVideoName, setEditVideoName] = useState('');
  const [editVideoUrl, setEditVideoUrl] = useState('');
  const [editFailDetail, setEditFailDetail] = useState('');
  const [editRejectReason, setEditRejectReason] = useState('');
  const [previewFile, setPreviewFile] = useState<{ type: 'pdf' | 'video', url: string, name: string } | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0
  });

  // ── Excel Export Function ──
  const handleExportExcel = () => {
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      let dataToExport: any[] = [];
      let filename = '';

      if (viewMode === 'queue') {
        filename = `queue_report_${todayStr}.xlsx`;
        dataToExport = filteredQueue.map(item => ({
          'รหัสงาน': item.job_id || '-',
          'เลขออเดอร์': item.order_no || '-',
          'ชื่อลูกค้า': item.customer_name || '-',
          'ประเภทงาน': item.job_type || '-',
          'ช่างผู้รับผิดชอบ': formatDisplayName(item.assigned_to) || '-',
          'วันที่จ่ายงาน': item.timestamp ? new Date(item.timestamp).toLocaleString('th-TH') : '-',
          'สถานะ': item.status === 'pending' ? 'ค้างส่ง' : item.status
        }));
      } else if (viewMode === 'history') {
        filename = `history_report_${todayStr}.xlsx`;
        dataToExport = filteredSubmissions.map(item => ({
          'วันที่ส่งงาน': item.submission_date ? new Date(item.submission_date).toLocaleString('th-TH') : '-',
          'รหัสงาน': item.job_id || '-',
          'เลขออเดอร์': item.order_no || '-',
          'ประเภทงาน': item.work_type || '-',
          'ผู้ส่งงาน (ช่าง)': formatDisplayName(item.name) || '-',
          'สถานะการตรวจ': item.status || 'รอตรวจ',
          'พฤติกรรมเข้าหน้างาน (งานเฟล)': item.work_type === 'งานเฟล (Fail)'
            ? (item.fail_detail === 'entered' ? 'เข้าหน้างานแล้ว' : 'ยังไม่เข้าหน้างาน')
            : '-',
          'หมายเหตุ / อาการเสีย': item.description || '-',
          'ชื่อไฟล์ใบงาน': item.file_name || '-',
          'ลิงก์ไฟล์ PDF': item.file_url || '-',
          'ลิงก์วิดีโอประกอบ': item.video_url || '-'
        }));
      }

      if (dataToExport.length === 0) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
        return;
      }

      // 1. Generate standard worksheet
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      // 2. Post-process to add Excel Hyperlinks for cells starting with http
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellAddress];
          if (cell && cell.t === 's' && cell.v && cell.v.toString().startsWith('http')) {
            const url = cell.v.toString();
            const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
            const headerCell = ws[headerAddress];
            const headerVal = headerCell ? headerCell.v?.toString() || '' : '';

            let label = '🔗 เปิดลิงก์';
            if (headerVal.includes('PDF')) {
              label = '📄 เปิดไฟล์ PDF';
            } else if (headerVal.includes('วิดีโอ') || headerVal.includes('Video')) {
              label = '🎥 เปิดวิดีโอประกอบ';
            }

            ws[cellAddress] = {
              t: 's',
              v: label,
              f: `HYPERLINK("${url}", "${label}")`
            };
          }
        }
      }

      // 3. Set column widths automatically (Auto-fit)
      const cols: { wch: number }[] = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLen = 12; // default min width
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellAddress];
          if (cell && cell.v) {
            maxLen = Math.max(maxLen, cell.v.toString().length);
          }
        }
        // Limit maximum width to 45 to prevent extremely wide columns
        cols.push({ wch: Math.min(maxLen + 3, 45) });
      }
      ws['!cols'] = cols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report Data");
      XLSX.writeFile(wb, filename);
      showToast('ดาวน์โหลดรายงาน Excel เรียบร้อยแล้ว', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(`ไม่สามารถดาวน์โหลด Excel ได้: ${err.message}`, 'error');
    }
  };

  // A ref to keep track of active subscriptions to avoid duplicating listeners
  const unsubscribersRef = useRef<{ 
    unsubSubmissions?: () => void; 
    unsubJobs?: () => void; 
    unsubUsers?: () => void;
    unsubAttendance?: () => void;
  }>({});

  const startRealtimeListeners = React.useCallback(() => {
    const db = getDb();
    
    // Unsubscribe existing if any
    if (unsubscribersRef.current.unsubSubmissions) unsubscribersRef.current.unsubSubmissions();
    if (unsubscribersRef.current.unsubJobs) unsubscribersRef.current.unsubJobs();
    if (unsubscribersRef.current.unsubUsers) unsubscribersRef.current.unsubUsers();
    if (unsubscribersRef.current.unsubAttendance) unsubscribersRef.current.unsubAttendance();

    // 1. Listen to Submissions
    unsubscribersRef.current.unsubSubmissions = onSnapshot(
      query(collection(db, 'submissions')),
      (subSnap) => {
        const subList: SubmissionData[] = [];
        subSnap.forEach(docSnap => {
          subList.push(docSnap.data() as SubmissionData);
        });
        subList.sort((a, b) => new Date(b.submission_date).getTime() - new Date(a.submission_date).getTime());
        setSubmissions(subList);
        localStorage.setItem('cachedHistoryData', JSON.stringify(subList));

        // Calculate Stats
        const total = subList.length;
        const approved = subList.filter(s => s.status === 'ตรวจแล้ว').length;
        const pending = subList.filter(s => s.status === 'รอตรวจ' || !s.status).length;
        const rejected = subList.filter(s => s.status === 'แก้ไข').length;
        setStats({ total, approved, pending, rejected });
        setLoading(false);
      },
      (err) => {
        console.error("Submissions listener failed:", err);
        showToast("ดึงข้อมูลประวัติขัดข้อง ⚠️", "error");
        // Load cache fallback if needed
        const cached = localStorage.getItem('cachedHistoryData');
        if (cached) {
          const cachedList = JSON.parse(cached) as SubmissionData[];
          setSubmissions(cachedList);
          const total = cachedList.length;
          const approved = cachedList.filter(s => s.status === 'ตรวจแล้ว').length;
          const pending = cachedList.filter(s => s.status === 'รอตรวจ' || !s.status).length;
          const rejected = cachedList.filter(s => s.status === 'แก้ไข').length;
          setStats({ total, approved, pending, rejected });
        }
        setLoading(false);
      }
    );

    // 2. Listen to Assigned Jobs
    unsubscribersRef.current.unsubJobs = onSnapshot(
      query(collection(db, 'assigned_jobs'), orderBy('timestamp', 'desc')),
      (jobsSnap) => {
        const jobsList: JobRow[] = [];
        jobsSnap.forEach(docSnap => {
          jobsList.push(docSnap.data() as JobRow);
        });
        setAssignedJobs(jobsList);
      },
      (err) => {
        console.error("Jobs listener failed:", err);
      }
    );

    // 3. Listen to Users
    unsubscribersRef.current.unsubUsers = onSnapshot(
      query(collection(db, 'users')),
      (usersSnap) => {
        const usersList: UserData[] = [];
        usersSnap.forEach(docSnap => {
          usersList.push(docSnap.data() as UserData);
        });
        setUsers(usersList);
      },
      (err) => {
        console.error("Users listener failed:", err);
      }
    );

    // 4. Listen to Attendance Records for Today
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const todayQ = query(collection(db, 'attendance_records'), where('date', '==', today));
    unsubscribersRef.current.unsubAttendance = onSnapshot(
      todayQ,
      (snap) => {
        const attMap: Record<string, any> = {};
        snap.forEach(d => {
          const data = d.data();
          attMap[data.username || data.name] = data;
        });
        setTodayAttendance(attMap);
      },
      (err) => {
        console.error("Attendance listener failed:", err);
      }
    );
  }, []);

  const fetchData = async () => {
    // Legacy support, doesn't need to do anything since listeners are running
  };

  useEffect(() => {
    startRealtimeListeners();
    return () => {
      if (unsubscribersRef.current.unsubSubmissions) unsubscribersRef.current.unsubSubmissions();
      if (unsubscribersRef.current.unsubJobs) unsubscribersRef.current.unsubJobs();
      if (unsubscribersRef.current.unsubUsers) unsubscribersRef.current.unsubUsers();
      if (unsubscribersRef.current.unsubAttendance) unsubscribersRef.current.unsubAttendance();
    };
  }, [startRealtimeListeners]);

  useEffect(() => {
    const tech = searchParams.get('tech') || '';
    setTechFilter(tech);
    setQueueTechFilter(tech);
  }, [searchParams]);

  useEffect(() => {
    setSelectedQueueIds(new Set());
  }, [viewMode]);

  const handleToggleQueueSelect = (jobId: string) => {
    const next = new Set(selectedQueueIds);
    if (next.has(jobId)) {
      next.delete(jobId);
    } else {
      next.add(jobId);
    }
    setSelectedQueueIds(next);
  };

  const handleToggleSelectAllQueue = () => {
    if (selectedQueueIds.size === filteredQueue.length) {
      setSelectedQueueIds(new Set());
    } else {
      const next = new Set<string>();
      filteredQueue.forEach(j => next.add(j.job_id));
      setSelectedQueueIds(next);
    }
  };

  const handleDeleteSelectedQueue = async () => {
    if (selectedQueueIds.size === 0) return;

    const confirm = await showConfirm(
      "ยืนยันการลบรายการงานจ่ายที่เลือก",
      `คุณแน่ใจว่าต้องการลบรายการคิวงานจ่ายจำนวน ${selectedQueueIds.size} รายการที่เลือกออกจากระบบหรือไม่? การลบนี้จะล้างงานที่ยังไม่ได้ส่งของช่าง และประวัติเดิมจะไม่ถูกกระทบ`,
      { danger: true, okText: "ยืนยันการลบ", cancelText: "ยกเลิก" }
    );
    if (!confirm) return;

    setLoading(true);
    try {
      const db = getDb();
      const batch = writeBatch(db);
      
      selectedQueueIds.forEach(jobId => {
        const docRef = doc(db, 'assigned_jobs', jobId);
        batch.delete(docRef);
      });

      await batch.commit();
      showToast(`ลบงานจ่ายจำนวน ${selectedQueueIds.size} รายการ เรียบร้อยแล้วครับ`, "success");
      setSelectedQueueIds(new Set());
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast("ลบคิวงานล้มเหลว: " + err.message, "error");
      setLoading(false);
    }
  };

  const handleDeleteAllQueue = async () => {
    const pendingJobs = assignedJobs.filter(j => j.status === 'pending');
    if (pendingJobs.length === 0) return;

    const confirm = await showConfirm(
      "ลบคิวงานจ่ายช่างทั้งหมด",
      `⚠️ คำเตือน: คุณต้องการล้างรายการคิวงานจ่ายทั้งหมดในระบบจำนวน ${pendingJobs.length} รายการออกทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนคืนได้ และจะทำให้ตารางงานของช่างทุกคนว่างเปล่า!`,
      { danger: true, okText: "ลบทั้งหมด", cancelText: "ยกเลิก" }
    );
    if (!confirm) return;

    setLoading(true);
    try {
      const db = getDb();
      const batch = writeBatch(db);
      
      pendingJobs.forEach(job => {
        const docRef = doc(db, 'assigned_jobs', job.job_id);
        batch.delete(docRef);
      });

      await batch.commit();
      showToast("ล้างประวัติคิวงานวันนี้สำเร็จเรียบร้อยครับ", "success");
      setSelectedQueueIds(new Set());
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast("ล้างคิวงานล้มเหลว: " + err.message, "error");
      setLoading(false);
    }
  };



  // Filter Logic for Submissions
  const filteredSubmissions = submissions.filter(item => {
    const q = searchQuery.toLowerCase();
    const matchSearch = 
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.work_type && item.work_type.toLowerCase().includes(q)) ||
      (item.file_name && item.file_name.toLowerCase().includes(q)) ||
      (item.job_id && item.job_id.toLowerCase().includes(q)) ||
      (item.order_no && item.order_no.toLowerCase().includes(q)) ||
      (item.name && item.name.toLowerCase().includes(q));

    const matchTech = !techFilter || 
      item.name === techFilter ||
      (getEnglishNameSuffix(item.name) && getEnglishNameSuffix(item.name) === getEnglishNameSuffix(techFilter));
    const matchCat = !typeFilter || item.work_type === typeFilter;
    const itemStatus = item.status || 'รอตรวจ';
    const matchStatus = !statusFilter || itemStatus === statusFilter;

    let matchDate = true;
    if (dateFrom || dateTo) {
      try {
        const itemDateStr = new Date(item.submission_date).toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (dateFrom && itemDateStr < dateFrom) matchDate = false;
        if (dateTo && itemDateStr > dateTo) matchDate = false;
      } catch (_) {
        matchDate = false;
      }
    }

    return matchSearch && matchTech && matchCat && matchStatus && matchDate;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredSubmissions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const displayedSubmissions = filteredSubmissions.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      if (start > 2) {
        pages.push('...');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    return pages;
  };

  // Filter Logic for Queue
  const filteredQueue = assignedJobs.filter(job => {
    // Only show unsubmitted (pending) jobs
    if (job.status !== 'pending') return false;

    const q = searchQuery.toLowerCase();
    const matchSearch = 
      (job.job_id && job.job_id.toLowerCase().includes(q)) ||
      (job.customer_name && job.customer_name.toLowerCase().includes(q)) ||
      (job.assigned_to && job.assigned_to.toLowerCase().includes(q)) ||
      (job.order_no && job.order_no.toLowerCase().includes(q));

    const matchTech = !queueTechFilter ||
      job.assigned_to === queueTechFilter ||
      getEnglishNameSuffix(job.assigned_to) === getEnglishNameSuffix(queueTechFilter);
    return matchSearch && matchTech;
  });

  // Queue Pagination calculations
  const totalQueuePages = Math.ceil(filteredQueue.length / ITEMS_PER_PAGE);
  const startQueueIndex = (currentQueuePage - 1) * ITEMS_PER_PAGE;
  const endQueueIndex = startQueueIndex + ITEMS_PER_PAGE;
  const displayedQueue = filteredQueue.slice(startQueueIndex, endQueueIndex);

  const getQueuePageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalQueuePages <= maxVisiblePages) {
      for (let i = 1; i <= totalQueuePages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      const start = Math.max(2, currentQueuePage - 1);
      const end = Math.min(totalQueuePages - 1, currentQueuePage + 1);
      
      if (start > 2) {
        pages.push('...');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalQueuePages - 1) {
        pages.push('...');
      }
      
      pages.push(totalQueuePages);
    }
    return pages;
  };

  // Open detail modal
  const openSubDetail = (sub: SubmissionData, index: number) => {
    setSelectedSub(sub);
    setSelectedSubIndex(index);
    setEditStatus(sub.status || 'รอตรวจ');
    setEditType(sub.work_type);
    setEditNote(sub.description || '');
    setEditFileName(sub.file_name || '');
    setEditJobId(sub.job_id || '');
    setEditName(sub.name || '');
    setEditOrderNo(sub.order_no || '');
    setEditSubWorkType(sub.sub_work_type || '');
    setEditFileUrl(sub.file_url || '');
    setEditVideoName(sub.video_name || '');
    setEditVideoUrl(sub.video_url || '');
    setEditFailDetail(sub.fail_detail || '');
    setEditRejectReason(sub.reject_reason || '');
    setIsEditingSub(false);
  };

  // Close modal
  const closeSubDetail = () => {
    setSelectedSub(null);
    setSelectedSubIndex(-1);
    setIsEditingSub(false);
  };

  // Save changes to submission in Firestore
  const handleSaveSubEdits = async () => {
    if (!selectedSub) return;
    setModalLoading(true);

    try {
      const db = getDb();
      const subRef = doc(db, 'submissions', selectedSub.submission_date);
      
      const updatedData: Record<string, string> = {
        work_type: editType,
        status: editStatus,
        description: editNote,
        file_name: editFileName,
        name: editName,
        order_no: editOrderNo,
        sub_work_type: editSubWorkType,
        file_url: editFileUrl,
        video_name: editVideoName,
        video_url: editVideoUrl,
        fail_detail: editFailDetail,
        reject_reason: editRejectReason,
      };

      // อัปเดต job_id ถ้ามีการเปลี่ยนแปลง
      if (editJobId.trim() !== (selectedSub.job_id || '')) {
        updatedData.job_id = editJobId.trim();
        if (selectedSub.job_id) {
          const oldJobRef = doc(db, 'assigned_jobs', selectedSub.job_id);
          await updateDoc(oldJobRef, { job_id: editJobId.trim() }).catch(() => {});
        }
      }

      await updateDoc(subRef, updatedData);

      // Local state update
      const updatedList = [...submissions];
      const matchIndex = updatedList.findIndex(s => s.submission_date === selectedSub.submission_date);
      if (matchIndex !== -1) {
        updatedList[matchIndex] = { ...selectedSub, ...updatedData };
        setSubmissions(updatedList);
        
        // Recalculate stats
        const total = updatedList.length;
        const approved = updatedList.filter(s => s.status === 'ตรวจแล้ว').length;
        const pending = updatedList.filter(s => s.status === 'รอตรวจ' || !s.status).length;
        const rejected = updatedList.filter(s => s.status === 'แก้ไข').length;
        setStats({ total, approved, pending, rejected });
      }

      showToast("อัปเดตข้อมูลและสถานะใบงานเรียบร้อยแล้ว ✨", "success");
      setIsEditingSub(false);
      setSelectedSub(prev => prev ? { ...prev, ...updatedData } : null);
    } catch (err: any) {
      console.error(err);
      showToast("บันทึกข้อมูลไม่สำเร็จ: " + err.message, "error");
    } finally {
      setModalLoading(false);
    }
  };

  const getPreviewUrl = (url: string) => {
    if (!url || url === '-') return '';
    if (url.includes('drive.google.com')) {
      if (url.includes('id=')) {
        const match = url.match(/id=([^&]+)/);
        if (match && match[1]) {
          return `/api/gdrive/proxy?fileId=${match[1]}`;
        }
      }
      if (url.includes('/file/d/')) {
        const match = url.match(/\/file\/d\/([^/]+)/);
        if (match && match[1]) {
          return `/api/gdrive/proxy?fileId=${match[1]}`;
        }
      }
    }
    return url;
  };

  const getDirectStreamUrl = (url: string) => {
    if (!url || url === '-') return '';
    if (url.includes('drive.google.com')) {
      if (url.includes('id=')) {
        const match = url.match(/id=([^&]+)/);
        if (match && match[1]) {
          return `/api/gdrive/proxy?fileId=${match[1]}`;
        }
      }
      if (url.includes('/file/d/')) {
        const match = url.match(/\/file\/d\/([^/]+)/);
        if (match && match[1]) {
          return `/api/gdrive/proxy?fileId=${match[1]}`;
        }
      }
    }
    return url;
  };

  const isNativeVideo = (url: string, name: string) => {
    if (!name && !url) return false;
    const filename = name || url;
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext || '');
  };

  const handleUpdateStatusDirect = async (newStatus: string) => {
    if (!selectedSub) return;
    
    if (newStatus === 'แก้ไข') {
      setRejectReasonInput('');
      setIsRejectModalOpen(true);
      return; // Stop here, the modal will handle the actual update via proceedWithUpdateStatus
    }

    await proceedWithUpdateStatus(newStatus, '');
  };

  const proceedWithUpdateStatus = async (newStatus: string, rejectReason: string) => {
    if (!selectedSub) return;
    setModalLoading(true);

    try {
      const db = getDb();
      const subRef = doc(db, 'submissions', selectedSub.submission_date);
      
      const updatedData: any = {
        status: newStatus
      };
      
      if (newStatus === 'แก้ไข') {
        updatedData.reject_reason = rejectReason;
      } else {
        // Clear it if approved or pending
        updatedData.reject_reason = '';
      }

      await updateDoc(subRef, updatedData);

      // ถ้าแอดมินสั่งแก้ไข → ลบไฟล์ใน GDrive + reset assigned_job กลับเป็น pending
      if (newStatus === 'แก้ไข') {
        if (gdrivePrefs?.connected && selectedSub.file_name) {
          const accessToken = await getValidAccessToken();
          if (accessToken) {
            await deleteTargetUploadFolder(
              accessToken,
              selectedSub.work_type,
              selectedSub.file_name,
              selectedSub.sub_work_type || ""
            );
          }
        }
        if (selectedSub.job_id) {
          const jobRef = doc(db, 'assigned_jobs', selectedSub.job_id);
          await updateDoc(jobRef, { status: 'pending' });
        }
      }

      const updatedList = [...submissions];
      const matchIndex = updatedList.findIndex(s => s.submission_date === selectedSub.submission_date);
      if (matchIndex !== -1) {
        updatedList[matchIndex] = { ...selectedSub, ...updatedData };
        setSubmissions(updatedList);
        
        const total = updatedList.length;
        const approved = updatedList.filter(s => s.status === 'ตรวจแล้ว').length;
        const pending = updatedList.filter(s => s.status === 'รอตรวจ' || !s.status).length;
        const rejected = updatedList.filter(s => s.status === 'แก้ไข').length;
        setStats({ total, approved, pending, rejected });
      }

      showToast(`อัปเดตสถานะเป็น "${newStatus}" เรียบร้อยแล้ว ✨`, "success");
      setSelectedSub(prev => prev ? { ...prev, ...updatedData } : null);
      setEditStatus(newStatus);
      setIsRejectModalOpen(false);
    } catch (err: any) {
      console.error(err);
      showToast("บันทึกข้อมูลไม่สำเร็จ: " + err.message, "error");
    } finally {
      setModalLoading(false);
    }
  };

  // Delete submission (and its assigned_job doc) from Firestore — ไม่ revert กลับ pending
  const handleDeleteSub = async () => {
    if (!selectedSub) return;
    
    const confirm = await showConfirm(
      "ยืนยันการลบประวัติงานส่งนี้",
      `คุณต้องการลบข้อมูลชิ้นงานนี้ออกจากระบบใช่หรือไม่? ไฟล์บน Google Drive จะถูกลบออกด้วย`,
      { danger: true, okText: "ยืนยันการลบ", cancelText: "ยกเลิก" }
    );
    if (!confirm) return;

    setModalLoading(true);
    try {
      const db = getDb();
      
      // 1. Delete folder from Google Drive if connected
      if (gdrivePrefs && gdrivePrefs.connected) {
        const accessToken = await getValidAccessToken();
        if (accessToken) {
          await deleteTargetUploadFolder(
            accessToken, 
            selectedSub.work_type, 
            selectedSub.file_name, 
            selectedSub.sub_work_type || ""
          );
        } else {
          showToast("สิทธิ์ Google Drive หมดอายุชั่วคราว ไม่สามารถลบไฟล์โดยตรงได้", "info");
        }
      }

      // 2. ลบ submission + ลบ assigned_job ออกเลย (ไม่ revert กลับ pending)
      const batch = writeBatch(db);
      
      const subRef = doc(db, 'submissions', selectedSub.submission_date);
      batch.delete(subRef);

      if (selectedSub.job_id) {
        const jobRef = doc(db, 'assigned_jobs', selectedSub.job_id);
        batch.delete(jobRef);
      }

      await batch.commit();

      // Update local state — ลบออกจาก submissions list
      const updatedList = submissions.filter(s => s.submission_date !== selectedSub.submission_date);
      setSubmissions(updatedList);
      
      // ลบออกจาก assignedJobs local state ด้วย
      if (selectedSub.job_id) {
        setAssignedJobs(prev => prev.filter(job => job.job_id !== selectedSub.job_id));
      }

      // Recalculate stats
      const total = updatedList.length;
      const approved = updatedList.filter(s => s.status === 'ตรวจแล้ว').length;
      const pending = updatedList.filter(s => s.status === 'รอตรวจ' || !s.status).length;
      const rejected = updatedList.filter(s => s.status === 'แก้ไข').length;
      setStats({ total, approved, pending, rejected });

      showToast("ลบข้อมูลงานออกจากระบบเรียบร้อยครับ", "success");
      closeSubDetail();
    } catch (err: any) {
      console.error(err);
      showToast("การลบล้มเหลว: " + err.message, "error");
    } finally {
      setModalLoading(false);
    }
  };

  // Get technician names
  const technicians = users.filter(u => u.role === 'staff').map(u => u.name);

  // ── Analytics Computations ──────────────────────────────────────────────────
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const todayCount = submissions.filter(s => {
    try { return new Date(s.submission_date).toLocaleDateString('en-CA') === todayStr; } catch { return false; }
  }).length;

  // Per-technician stats for leaderboard
  const techStats = technicians.map(name => {
    const techSuffix = getEnglishNameSuffix(name);
    const techSubs = submissions.filter(s => 
      s.name === name ||
      (techSuffix && getEnglishNameSuffix(s.name) === techSuffix)
    );
    const approved = techSubs.filter(s => s.status === 'ตรวจแล้ว').length;
    const rate = techSubs.length > 0 ? Math.round((approved / techSubs.length) * 100) : 0;
    const pendingJobs = assignedJobs.filter(j => 
      j.status === 'pending' && (
        j.assigned_to === name ||
        (techSuffix && getEnglishNameSuffix(j.assigned_to) === techSuffix)
      )
    ).length;

    // Calculate submission speed (last 7 days)
    const techSubmittedJobs = assignedJobs.filter(j => {
      const isTech = j.assigned_to === name || 
                     (techSuffix && getEnglishNameSuffix(j.assigned_to) === techSuffix);
      if (!isTech || !j.submission_date || !j.timestamp) return false;
      
      try {
        const subTime = new Date(j.submission_date).getTime();
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        return subTime >= oneWeekAgo;
      } catch (_) {
        return false;
      }
    });

    const durations = techSubmittedJobs.map(j => {
      try {
        const start = new Date(j.timestamp).getTime();
        const end = new Date(j.submission_date).getTime();
        const diff = (end - start) / (1000 * 60 * 60); // hours
        return diff >= 0 ? diff : null;
      } catch (_) {
        return null;
      }
    }).filter((d): d is number => d !== null);

    const avgSpeedHours = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : null;

    return { 
      name, 
      total: techSubs.length, 
      approved, 
      rate, 
      pendingJobs,
      avgSpeedHours,
      weeklyCount: durations.length
    };
  });

  const techStatsSubmitted = [...techStats].sort((a, b) => b.total - a.total);
  const techStatsPending = [...techStats].sort((a, b) => b.pendingJobs - a.pendingJobs);

  // Speed Leaderboard: techs with weekly submissions sorted ascending, then techs with no weekly submissions
  const techStatsSpeed = [...techStats]
    .filter(t => t.avgSpeedHours !== null)
    .sort((a, b) => (a.avgSpeedHours || 0) - (b.avgSpeedHours || 0));
  const techStatsNoSpeed = [...techStats]
    .filter(t => t.avgSpeedHours === null);
  const techStatsSpeedSorted = [...techStatsSpeed, ...techStatsNoSpeed];

  // ── Failed Jobs Analytics Calculations ──
  const failedSubmissions = submissions.filter(s => s.work_type === 'งานเฟล (Fail)');
  const totalFailedCount = failedSubmissions.length;
  const overallFailRate = submissions.length > 0 ? Math.round((totalFailedCount / submissions.length) * 100) : 0;
  const failedEnteredCount = failedSubmissions.filter(s => s.fail_detail === 'entered').length;
  const failedNotEnteredCount = failedSubmissions.filter(s => s.fail_detail === 'not_entered').length;

  const techFailedStats = technicians.map(name => {
    const techSuffix = getEnglishNameSuffix(name);
    const techSubs = submissions.filter(s => 
      s.name === name ||
      (techSuffix && getEnglishNameSuffix(s.name) === techSuffix)
    );
    const techFailed = techSubs.filter(s => s.work_type === 'งานเฟล (Fail)');
    const techFailedCount = techFailed.length;
    const techFailRate = techSubs.length > 0 ? Math.round((techFailedCount / techSubs.length) * 100) : 0;
    const entered = techFailed.filter(s => s.fail_detail === 'entered').length;
    const notEntered = techFailed.filter(s => s.fail_detail === 'not_entered').length;

    return {
      name,
      total: techSubs.length,
      failedCount: techFailedCount,
      failRate: techFailRate,
      entered,
      notEntered
    };
  }).sort((a, b) => b.failedCount - a.failedCount);

  const top5Techs = techStatsSubmitted.slice(0, 5);
  const maxTechTotal = top5Techs[0]?.total || 1;

  // Donut chart data
  const donutTotal = stats.total || 1;
  const donutApproved = Math.round((stats.approved / donutTotal) * 100);
  const donutPending = Math.round((stats.pending / donutTotal) * 100);
  const donutRejected = 100 - donutApproved - donutPending;

  // SVG Donut helpers
  const RADIUS = 38;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const donutSegments = [
    { value: stats.approved, color: '#10b981', label: 'ตรวจแล้ว' },
    { value: stats.pending, color: '#f59e0b', label: 'รอตรวจ' },
    { value: stats.rejected, color: '#f43f5e', label: 'แจ้งแก้ไข' },
  ];
  let donutOffset = 0;
  const donutPaths = donutSegments.map(seg => {
    const fraction = seg.value / donutTotal;
    const dashLen = fraction * CIRCUMFERENCE;
    const path = { ...seg, dashLen, offset: -donutOffset * CIRCUMFERENCE / donutTotal + CIRCUMFERENCE * 0.25 };
    donutOffset += seg.value;
    return path;
  });

  // Recent Activity Feed (last 10 submissions)
  const recentActivity = [...submissions].slice(0, 10);

  const getRelativeTime = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'เมื่อกี้';
      if (mins < 60) return `${mins} นาทีที่แล้ว`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
      return `${Math.floor(hrs / 24)} วันที่แล้ว`;
    } catch { return '-'; }
  };

  const queuePendingCount = assignedJobs.filter(j => j.status === 'pending').length;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50/50 font-sans">
      <Sidebar />

      <main className="flex-1 pt-24 pb-6 px-4 lg:p-6 overflow-y-auto">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        {viewMode === 'overview' && (
          <header className="mb-4 flex flex-row justify-end items-center gap-4">
            <button
              onClick={fetchData}
              className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 group"
              title="รีเฟรชข้อมูลล่าสุด"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            </button>
          </header>
        )}

        {viewMode === 'overview' && (
          <>
            {/* ── KPI Cards Strip ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'ส่งงานรวม', value: stats.total, unit: 'งาน', icon: <BarChart3 className="w-4 h-4" />, bg: 'bg-indigo-500', accent: 'from-indigo-500 to-indigo-600', sub: `คิว: ${queuePendingCount} ค้าง` },
            { label: 'ตรวจแล้ว', value: stats.approved, unit: 'งาน', icon: <CheckCircle2 className="w-4 h-4" />, bg: 'bg-emerald-500', accent: 'from-emerald-500 to-emerald-600', sub: `${donutApproved}% อนุมัติ` },
            { label: 'รอตรวจสอบ', value: stats.pending, unit: 'รายการ', icon: <Clock className="w-4 h-4" />, bg: 'bg-amber-500', accent: 'from-amber-400 to-amber-500', sub: stats.pending > 5 ? '⚠️ ต้องรีบตรวจ' : 'ปกติ' },
            { label: 'แจ้งแก้ไข', value: stats.rejected, unit: 'รายการ', icon: <AlertCircle className="w-4 h-4" />, bg: 'bg-rose-500', accent: 'from-rose-500 to-rose-600', sub: 'ต้องติดตามช่าง' },
            { label: 'ส่งวันนี้', value: todayCount, unit: 'งาน', icon: <Zap className="w-4 h-4" />, bg: 'bg-violet-500', accent: 'from-violet-500 to-violet-600', sub: todayStr },
            { label: 'ช่างในระบบ', value: technicians.length, unit: 'คน', icon: <Users className="w-4 h-4" />, bg: 'bg-sky-500', accent: 'from-sky-500 to-sky-600', sub: 'Active ในระบบ' },
          ].map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative bg-white rounded-2xl border border-slate-100/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Icon + Label row */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 ${kpi.bg} text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                    {kpi.icon}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 leading-snug">{kpi.label}</p>
                </div>

                {/* Big number */}
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-black text-slate-800 leading-none tabular-nums">
                    {loading ? '—' : kpi.value.toLocaleString()}
                  </p>
                  <span className="text-[11px] font-semibold text-slate-400">{kpi.unit}</span>
                </div>

                {/* Sub text */}
                <p className="text-[10px] text-slate-400 font-medium leading-none">{kpi.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Analytics Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Donut Chart */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block" />
              สัดส่วนสถานะงานทั้งหมด
            </h3>
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth="14" />
                  {donutPaths.map((seg, i) => (
                    <circle
                      key={i}
                      cx="50" cy="50" r={RADIUS}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="14"
                      strokeDasharray={`${seg.dashLen} ${CIRCUMFERENCE - seg.dashLen}`}
                      strokeDashoffset={seg.offset}
                      strokeLinecap="butt"
                      style={{ transition: 'stroke-dasharray 0.8s ease' }}
                    />
                  ))}
                  <text x="50" y="46" textAnchor="middle" className="text-xs font-black" style={{ fontSize: '14px', fontWeight: 800, fill: '#1e293b' }}>
                    {stats.total}
                  </text>
                  <text x="50" y="59" textAnchor="middle" style={{ fontSize: '7px', fill: '#94a3b8', fontWeight: 600 }}>
                    งานรวม
                  </text>
                </svg>
              </div>
              <div className="flex flex-col gap-2.5 flex-1">
                {donutSegments.map((seg, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-[10px] text-slate-600 font-semibold Prompt">{seg.label}</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">{seg.value}</span>
                  </div>
                ))}
                <div className="mt-1 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 Prompt">อัตราอนุมัติ</span>
                    <span className="text-xs font-black text-emerald-600">{donutApproved}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div className="h-1.5 bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${donutApproved}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top 5 Technician Bar Chart */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
              <span className="w-1.5 h-4 bg-violet-500 rounded-full inline-block" />
              Top 5 ช่างส่งงานมากสุด
            </h3>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : top5Techs.length === 0 ? (
              <p className="text-xs text-slate-400 Prompt text-center mt-4">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="flex flex-col gap-3">
                {top5Techs.map((tech, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 w-4 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-700 Prompt truncate">{formatDisplayName(tech.name)}</span>
                        <span className="text-[10px] font-black text-slate-500 ml-1 flex-shrink-0">{tech.total}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(tech.total / maxTechTotal) * 100}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className={`h-2 rounded-full ${i === 0 ? 'bg-indigo-500' : i === 1 ? 'bg-violet-400' : i === 2 ? 'bg-sky-400' : 'bg-slate-300'}`}
                        />
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-emerald-600 w-8 text-right flex-shrink-0">{tech.rate}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="glass-card p-6 flex flex-col gap-3 overflow-hidden">
            <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
              <span className="w-1.5 h-4 bg-amber-500 rounded-full inline-block" />
              กิจกรรมล่าสุด
            </h3>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-xs text-slate-400 Prompt text-center mt-4">ยังไม่มีการส่งงาน</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto max-h-52">
                {recentActivity.map((item, i) => {
                  const statusVal = item.status || 'รอตรวจ';
                  return (
                    <div key={i} className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black mt-0.5 ${
                        statusVal === 'ตรวจแล้ว' ? 'bg-emerald-500 text-white icon-glow-emerald' :
                        statusVal === 'แก้ไข' ? 'bg-rose-500 text-white icon-glow-rose' :
                        'bg-amber-500 text-white icon-glow-amber'
                      }`}>
                        {item.name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-700 Prompt truncate">{formatDisplayName(item.name)}</p>
                        <p className="text-[9px] text-slate-400 truncate">{item.work_type}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          statusVal === 'ตรวจแล้ว' ? 'bg-emerald-500/20 text-emerald-700' :
                          statusVal === 'แก้ไข' ? 'bg-rose-500/20 text-rose-700' :
                          'bg-amber-500/20 text-amber-700'
                        }`}>{statusVal}</span>
                        <p className="text-[8px] text-slate-300 mt-0.5">{getRelativeTime(item.submission_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Live Technician Pixel Office ────────────────────────────────────── */}
        {!loading && viewMode === 'overview' && (
          <TechnicianPixelOffice 
            users={users}
            todayAttendance={todayAttendance}
            assignedJobs={assignedJobs}
            submissions={submissions}
          />
        )}

        {/* ── Leaderboard Strip (Submitted & Speed) ────────────────────────────────────────────── */}
        {!loading && techStatsSubmitted.length > 0 && (
          <div className="glass-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                🏆 Leaderboard จัดอันดับช่างเทคนิค
              </h3>
              <div className="bg-slate-100/80 p-0.5 rounded-xl flex gap-0.5 text-[10px] font-bold Prompt w-fit">
                <button
                  onClick={() => setLeaderboardTab('total')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'total' 
                      ? 'bg-white text-indigo-600 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  🥇 ส่งงานสะสมสูงสุด
                </button>
                <button
                  onClick={() => setLeaderboardTab('speed')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'speed' 
                      ? 'bg-white text-amber-600 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ⚡ ส่งงานไวเฉลี่ยสะสม (7 วันล่าสุด)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {(leaderboardTab === 'total' ? techStatsSubmitted : techStatsSpeedSorted).slice(0, 10).map((tech, i) => {
                const isSpeedTab = leaderboardTab === 'speed';
                const hasSpeedData = tech.avgSpeedHours !== null;
                
                return (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/dashboard?view=history&tech=${encodeURIComponent(tech.name)}`)}
                    className={`flex-1 min-w-[120px] max-w-[200px] flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 cursor-pointer text-center group ${
                      isSpeedTab
                        ? hasSpeedData
                          ? 'border-slate-200/50 bg-white/40 hover:border-amber-200 hover:bg-amber-50/30'
                          : 'border-slate-100 bg-slate-50/20 opacity-60 hover:opacity-100'
                        : 'border-slate-200/50 bg-white/40 hover:border-indigo-200 hover:bg-indigo-50/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black ${
                      !isSpeedTab || hasSpeedData
                        ? i === 0 ? 'bg-amber-100 text-amber-600' :
                          i === 1 ? 'bg-slate-100 text-slate-650' :
                          i === 2 ? 'bg-orange-100 text-orange-600' :
                          'bg-slate-50 text-slate-400'
                        : 'bg-slate-100 text-slate-300'
                    }`}>
                      {!isSpeedTab || hasSpeedData 
                        ? i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
                        : '😴'
                      }
                    </div>
                    <div className="w-full truncate">
                      <p className={`text-[10px] font-bold text-slate-700 Prompt leading-tight transition truncate ${
                        isSpeedTab ? 'group-hover:text-amber-700' : 'group-hover:text-indigo-700'
                      }`} title={formatDisplayName(tech.name)}>
                        {formatDisplayName(tech.name)}
                      </p>
                      
                      {isSpeedTab ? (
                        <>
                          <p className="text-sm font-black text-slate-800 mt-1">
                            {formatSpeed(tech.avgSpeedHours)}
                          </p>
                          <p className="text-[9px] text-amber-600 font-bold mt-0.5">
                            {tech.weeklyCount > 0 ? `ส่ง ${tech.weeklyCount} งานใน 7 วัน` : 'ไม่มีงานใน 7 วัน'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-black text-slate-800 mt-1">
                            {tech.total} <span className="text-[8px] font-semibold text-slate-400">งาน</span>
                          </p>
                          <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                            {tech.rate}% ผ่าน
                          </p>
                        </>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Pending Works Box (สรุปงานค้างส่งช่างเทคนิค) ────────────────────────────────────────────── */}
        {!loading && techStatsPending.length > 0 && (
          <div className="glass-card p-5 mb-6">
            <h3 className="text-xs font-bold text-slate-700 Prompt mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-amber-500 rounded-full inline-block shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              ⏳ สรุปงานค้างส่งช่างเทคนิค
            </h3>
            <div className="flex flex-wrap gap-3">
              {techStatsPending.slice(0, 10).map((tech, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => router.push(`/dashboard?view=queue&tech=${encodeURIComponent(tech.name)}`)}
                  className="flex-1 min-w-[120px] max-w-[200px] flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-200/50 bg-white/40 hover:border-amber-200 hover:bg-amber-50/30 transition-all duration-200 cursor-pointer text-center group"
                >
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                    tech.pendingJobs > 5
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.25)] animate-pulse'
                      : tech.pendingJobs > 0
                      ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                  }`}>
                    {tech.pendingJobs > 5 ? (
                      <AlertCircle className="w-5 h-5 drop-shadow-[0_0_4px_rgba(244,63,94,0.5)]" />
                    ) : tech.pendingJobs > 0 ? (
                      <Clock className="w-5 h-5 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 drop-shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                    )}
                  </div>
                  <div className="w-full truncate">
                    <p className="text-[10px] font-bold text-slate-700 Prompt leading-tight group-hover:text-amber-700 transition truncate" title={formatDisplayName(tech.name)}>
                      {formatDisplayName(tech.name)}
                    </p>
                    <p className={`text-sm font-black mt-1 ${tech.pendingJobs > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {tech.pendingJobs} <span className="text-[8px] font-semibold text-slate-400">งานค้าง</span>
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}
          </>
        )}

        {/* ── Failed Job Analytics View ─────────────────────────────────────────── */}
        {viewMode === 'fail_analytics' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
              <div>
                <h1 className="text-base font-bold text-slate-800 Prompt flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                  <span>แดชบอร์ดวิเคราะห์ยอดงานเฟล (Failed Job Analytics)</span>
                </h1>
                <p className="text-xs text-slate-400 Sarabun mt-0.5">วิเคราะห์ข้อมูลความขัดข้องและพฤติกรรมหน้างานของช่างเทคนิคสะสม</p>
              </div>
              <button
                onClick={fetchData}
                className="p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 group"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              </button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'งานเฟลทั้งหมด', value: totalFailedCount, unit: 'งาน', icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-rose-500', color: 'text-rose-650', sub: 'งานไม่สำเร็จสะสม' },
                { label: 'อัตราส่วนงานเฟล', value: overallFailRate, unit: '%', icon: <BarChart3 className="w-4 h-4" />, bg: 'bg-amber-500', color: 'text-amber-650', sub: 'จากงานส่งทั้งหมด' },
                { label: 'เข้าหน้างานแล้ว (Entered)', value: failedEnteredCount, unit: 'งาน', icon: <Home className="w-4 h-4" />, bg: 'bg-indigo-500', color: 'text-indigo-650', sub: `${totalFailedCount > 0 ? Math.round((failedEnteredCount / totalFailedCount) * 100) : 0}% ของงานเฟล` },
                { label: 'ยังไม่เข้าหน้างาน (Not Entered)', value: failedNotEnteredCount, unit: 'งาน', icon: <Navigation className="w-4 h-4" />, bg: 'bg-slate-600', color: 'text-slate-600', sub: `${totalFailedCount > 0 ? Math.round((failedNotEnteredCount / totalFailedCount) * 100) : 0}% ของงานเฟล` }
              ].map((kpi, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${kpi.bg} text-white flex items-center justify-center shadow-2xs`}>
                      {kpi.icon}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 Prompt uppercase tracking-wider">{kpi.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{kpi.unit}</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-medium">{kpi.sub}</span>
                </div>
              ))}
            </div>

            {/* Proportion Bar Card */}
            {totalFailedCount > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-xs font-bold text-slate-700 Prompt mb-3">📊 สัดส่วนพฤติกรรมการเข้าหน้างานเมื่อส่งงานเฟล</h3>
                <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden flex">
                  {failedEnteredCount > 0 && (
                    <div 
                      style={{ width: `${(failedEnteredCount / totalFailedCount) * 100}%` }}
                      className="bg-indigo-500 h-full flex items-center justify-center text-[9px] text-white font-bold"
                      title={`เข้าหน้างานแล้ว: ${failedEnteredCount} งาน`}
                    >
                      {Math.round((failedEnteredCount / totalFailedCount) * 100)}%
                    </div>
                  )}
                  {failedNotEnteredCount > 0 && (
                    <div 
                      style={{ width: `${(failedNotEnteredCount / totalFailedCount) * 100}%` }}
                      className="bg-slate-400 h-full flex items-center justify-center text-[9px] text-white font-bold"
                      title={`ยังไม่เข้าหน้างาน: ${failedNotEnteredCount} งาน`}
                    >
                      {Math.round((failedNotEnteredCount / totalFailedCount) * 100)}%
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3.5 text-[10px] font-semibold text-slate-500 Prompt">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded bg-indigo-500" />
                    <span>เข้าหน้างานแล้ว (🏠 {failedEnteredCount} งาน)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded bg-slate-400" />
                    <span>ยังไม่เข้าหน้างาน (🚗 {failedNotEnteredCount} งาน)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Split layout: Tech Ranking & Recent Fail Table */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Tech Failure Ranking (Left 1/3) */}
              <div className="glass-card p-5 xl:col-span-1">
                <h3 className="text-xs font-bold text-slate-700 Prompt mb-4 flex items-center gap-1.5">
                  <div className="w-1.5 h-4 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                  จัดอันดับงานเฟลของช่างเทคนิค
                </h3>
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {techFailedStats.map((tech, idx) => {
                    const hasFail = tech.failedCount > 0;
                    return (
                      <div 
                        key={idx} 
                        className={`p-3.5 rounded-xl border border-slate-100/80 flex justify-between items-center gap-4 ${
                          hasFail ? 'bg-white/40' : 'bg-slate-50/20 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-slate-800 Prompt truncate" title={formatDisplayName(tech.name)}>
                            {formatDisplayName(tech.name)}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-semibold">
                            <span>งานรวม: {tech.total}</span>
                            <span>·</span>
                            <span className="text-indigo-650">เข้างาน: {tech.entered}</span>
                            <span>·</span>
                            <span className="text-slate-500">ไม่เข้า: {tech.notEntered}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-black ${hasFail ? 'text-rose-600' : 'text-slate-400'}`}>
                            {tech.failedCount} งาน
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                            คิดเป็น {tech.failRate}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Failed Jobs Table (Right 2/3) */}
              <div className="glass-card p-5 xl:col-span-2">
                <h3 className="text-xs font-bold text-slate-700 Prompt mb-4 flex items-center gap-1.5">
                  <div className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                  รายการงานเฟลล่าสุด (10 รายการล่าสุด)
                </h3>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full border-collapse text-left text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider Prompt">
                        <th className="p-4 pl-6">วันที่</th>
                        <th className="p-4">ช่างผู้ส่ง</th>
                        <th className="p-4">รหัสงาน / ออเดอร์</th>
                        <th className="p-4 text-center">พฤติกรรมหน้างาน</th>
                        <th className="p-4 pr-6 text-center">ตรวจสอบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 Sarabun font-semibold">
                      {failedSubmissions.slice(0, 10).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-450">
                            <CheckCircle2 className="w-7 h-7 text-emerald-450 mx-auto mb-2 animate-bounce" />
                            <p className="Prompt text-xs text-slate-500">เยี่ยมมาก! ไม่มีงานที่ส่งเฟลในระบบเลย</p>
                          </td>
                        </tr>
                      ) : (
                        failedSubmissions.slice(0, 10).map((sub, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition">
                            <td className="p-4 pl-6 whitespace-nowrap text-slate-500 font-medium">
                              {formatThaiDate(sub.submission_date)}
                            </td>
                            <td className="p-4 font-bold text-slate-800 Prompt">
                              {formatDisplayName(sub.name)}
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <span className="font-bold text-slate-800">{sub.job_id}</span>
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">ออเดอร์: {sub.order_no || '-'}</p>
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] Prompt ${
                                sub.fail_detail === 'entered'
                                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-600'
                                  : 'bg-slate-100 border border-slate-200 text-slate-600'
                              }`}>
                                {sub.fail_detail === 'entered' ? '🏠 เข้าหน้างานแล้ว' : '🚗 ยังไม่เข้าหน้างาน'}
                              </span>
                            </td>
                            <td className="p-4 pr-6 text-center whitespace-nowrap">
                              <button
                                onClick={() => openSubDetail(sub, idx)}
                                className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-extrabold transition cursor-pointer Prompt"
                              >
                                ดูใบงาน
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Table Section: Tabs + Filters + Tables ───────────────────────── */}
        {(viewMode === 'queue' || viewMode === 'history') && (
          <div className="glass-card">

          {/* Tab + Filter Header */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between gap-3 w-full">
              {/* Tab Buttons */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-100/70 p-1 rounded-2xl flex gap-1 w-fit border border-slate-200/20">
                  {viewMode === 'queue' ? (
                    <div className="px-4 py-2 rounded-xl font-bold text-xs Prompt flex items-center gap-2 bg-white text-amber-600 shadow-xs border border-slate-200/20">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      คิวงานค้างส่ง
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {filteredQueue.length}
                      </span>
                    </div>
                  ) : (
                    <div className="px-4 py-2 rounded-xl font-bold text-xs Prompt flex items-center gap-2 bg-white text-indigo-600 shadow-xs border border-slate-200/20">
                      <History className="w-3.5 h-3.5" />
                      ประวัติส่งงาน
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        {filteredSubmissions.length}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Search & Filter Buttons */}
              <div className="flex items-center gap-2 relative">
                {/* Search Button (Expanding) */}
                <div 
                  onMouseEnter={() => setIsSearchExpanded(true)}
                  onMouseLeave={() => {
                    if (!searchQuery && document.activeElement !== searchInputRef.current) {
                      setIsSearchExpanded(false);
                    }
                  }}
                  className="relative flex items-center bg-white border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-300"
                >
                  <button 
                    onClick={() => {
                      setIsSearchExpanded(!isSearchExpanded);
                      if (!isSearchExpanded) {
                        setTimeout(() => searchInputRef.current?.focus(), 100);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-indigo-600 rounded-full transition-all cursor-pointer flex items-center justify-center"
                    title="ค้นหา"
                  >
                    <Search className="w-4 h-4 text-blue-500" />
                  </button>
                  <motion.input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchExpanded(true)}
                    onBlur={() => {
                      if (!searchQuery) setIsSearchExpanded(false);
                    }}
                    initial={false}
                    animate={{ width: isSearchExpanded ? '150px' : '0px', opacity: isSearchExpanded ? 1 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    placeholder="ค้นหาใบงาน..."
                    className="bg-transparent border-0 text-slate-800 text-xs focus:outline-none focus:ring-0 placeholder-slate-400 font-medium overflow-hidden h-8"
                    style={{ paddingLeft: isSearchExpanded ? '4px' : '0px', paddingRight: isSearchExpanded ? '8px' : '0px' }}
                  />
                </div>

                {/* Filter Icon Button */}
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 text-xs font-bold Prompt"
                  title="ตัวกรอง"
                >
                  <Filter className="w-4 h-4 text-blue-500" />
                </button>

                {/* Export Excel Button */}
                <button
                  onClick={handleExportExcel}
                  className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-emerald-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 text-xs font-bold Prompt"
                  title="ดาวน์โหลดรายงาน Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                </button>

                {/* Dropdown Filter Panel */}
                <AnimatePresence>
                  {showFilterPanel && (
                    <>
                      {/* Backdrop overlay to close when clicking outside */}
                      <div 
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={() => setShowFilterPanel(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute right-0 top-11 z-30 w-72 bg-white border border-slate-100 rounded-3xl p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] flex flex-col gap-4 text-xs font-semibold"
                      >
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold Prompt">
                            <Filter className="w-3.5 h-3.5 text-blue-500" />
                            <span>ตัวเลือกตัวกรอง & ค้นหา</span>
                          </div>
                          <button 
                            onClick={() => setShowFilterPanel(false)}
                            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          {activeTab === 'submissions' ? (
                            <>
                              {/* Tech Filter */}
                              <div>
                                <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">ช่างผู้รับผิดชอบ / CT Name</label>
                                <CustomSelect
                                  value={techFilter}
                                  onChange={(val) => setTechFilter(val)}
                                  options={[
                                    { value: '', label: 'ช่างทุกคน' },
                                    ...technicians.map(t => ({ value: t, label: formatDisplayName(t) }))
                                  ]}
                                />
                              </div>

                              {/* Status Filter */}
                              <div>
                                <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">สถานะการตรวจสอบ</label>
                                <CustomSelect
                                  value={statusFilter}
                                  onChange={(val) => setStatusFilter(val)}
                                  options={[
                                    { value: '', label: 'สถานะทั้งหมด' },
                                    { value: 'รอตรวจ', label: 'รอตรวจ' },
                                    { value: 'ตรวจแล้ว', label: 'ตรวจแล้ว' },
                                    { value: 'แก้ไข', label: 'แก้ไข' }
                                  ]}
                                />
                              </div>

                              {/* Work Type Filter */}
                              <div>
                                <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">ประเภทงาน (Type)</label>
                                <CustomSelect
                                  value={typeFilter}
                                  onChange={(val) => setTypeFilter(val)}
                                  options={[
                                    { value: '', label: 'ประเภทงานทั้งหมด' },
                                    { value: 'งานติดตั้ง (INS)', label: 'งานติดตั้ง (INS)' },
                                    { value: 'งานซ่อม (AS)', label: 'งานซ่อม (AS)' },
                                    { value: 'งานถอดติดตั้ง (AS)', label: 'งานถอดติดตั้ง (AS)' },
                                    { value: 'งานเฟล (Fail)', label: 'งานเฟล (Fail)' },
                                    { value: 'งานคืน (Return)', label: 'งานคืน (Return)' }
                                  ]}
                                />
                              </div>

                              {/* Date Filter */}
                              <div>
                                <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">วันที่ส่งใบงาน (Date)</label>
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 text-[10px] w-6 shrink-0 Prompt font-extrabold text-right">จาก</span>
                                    <input 
                                      type="date" 
                                      value={dateFrom} 
                                      onChange={(e) => setDateFrom(e.target.value)} 
                                      className="w-full h-[38px] bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-0 text-xs focus:outline-none focus:border-indigo-500 Prompt cursor-pointer font-bold date-filter-input" 
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 text-[10px] w-6 shrink-0 Prompt font-extrabold text-right">ถึง</span>
                                    <input 
                                      type="date" 
                                      value={dateTo} 
                                      onChange={(e) => setDateTo(e.target.value)} 
                                      className="w-full h-[38px] bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-0 text-xs focus:outline-none focus:border-indigo-500 Prompt cursor-pointer font-bold date-filter-input" 
                                    />
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            /* Queue View Filter */
                            <div>
                              <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">ช่างผู้รับผิดชอบ / CT Name</label>
                              <CustomSelect
                                value={queueTechFilter}
                                onChange={(val) => setQueueTechFilter(val)}
                                options={[
                                  { value: '', label: 'ช่างทุกคน' },
                                  ...technicians.map(t => ({ value: t, label: formatDisplayName(t) }))
                                ]}
                              />
                            </div>
                          )}
                          {/* Queue Action Buttons inside Filter Dropdown (only for Admins/Auditors in queue view) */}
                          {viewMode === 'queue' && isAdmin && (
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-2">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider Prompt">การจัดการคิวงาน</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowFilterPanel(false);
                                    handleDeleteSelectedQueue();
                                  }}
                                  disabled={selectedQueueIds.size === 0}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:hover:bg-rose-50 text-rose-600 rounded-xl transition duration-150 cursor-pointer flex items-center justify-center border border-rose-100/50"
                                  title={`ลบงานจ่ายที่เลือก (${selectedQueueIds.size} รายการ)`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {selectedQueueIds.size > 0 && (
                                    <span className="ml-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white leading-none">
                                      {selectedQueueIds.size}
                                    </span>
                                  )}
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowFilterPanel(false);
                                    handleDeleteAllQueue();
                                  }}
                                  disabled={filteredQueue.length === 0}
                                  className="p-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-600/50 text-white rounded-xl transition duration-150 shadow-md shadow-rose-200 cursor-pointer flex items-center justify-center"
                                  title="ล้างคิวงานวันนี้ทั้งหมด"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-slate-500 Prompt">กำลังโหลดข้อมูล...</p>
            </div>
          ) : activeTab === 'submissions' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold tracking-wider uppercase Prompt">
                      <th className="p-4 pl-6">วันที่</th>
                      <th className="p-4">ช่างผู้ส่ง</th>
                      <th className="p-4">ประเภทงาน</th>
                      <th className="p-4">ชื่อไฟล์ใบงาน</th>
                      <th className="p-4 pr-6">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 Sarabun">
                    {displayedSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-400">
                          <Search className="w-8 h-8 mx-auto mb-2 text-slate-300 animate-pulse" />
                          <p className="font-semibold text-xs text-slate-500 Prompt">ไม่พบข้อมูลที่ตรงกับตัวกรอง</p>
                        </td>
                      </tr>
                    ) : (
                      displayedSubmissions.map((sub, idx) => {
                        const statusVal = sub.status || 'รอตรวจ';
                        return (
                          <tr 
                            key={idx} 
                            onClick={() => openSubDetail(sub, idx)}
                            className="hover:bg-slate-50/75 cursor-pointer transition-colors duration-150"
                          >
                            <td className="p-4 pl-6 font-medium whitespace-nowrap text-slate-500">{formatThaiDate(sub.submission_date)}</td>
                            <td className="p-4 font-bold text-slate-800 Prompt">{formatDisplayName(sub.name)}</td>
                            <td className="p-4">
                              <span className={`font-bold ${
                                sub.work_type.includes('ติดตั้ง') ? 'text-indigo-600' :
                                sub.work_type.includes('ซ่อม') ? 'text-emerald-600' :
                                sub.work_type.includes('เฟล') ? 'text-rose-600' :
                                'text-blue-600'
                              }`}>
                                {sub.work_type}{sub.sub_work_type ? ` (${sub.sub_work_type})` : ''}
                              </span>
                            </td>
                            <td className="p-4 font-medium max-w-[200px] truncate text-slate-600" title={sub.file_name}>{sub.file_name || '-'}</td>
                            <td className="p-4 pr-6">
                              <span className={`font-bold text-xs Prompt ${
                                statusVal === 'ตรวจแล้ว' ? 'text-emerald-600' :
                                statusVal === 'แก้ไข' ? 'text-rose-600' : 'text-amber-600'
                              }`}>
                                {statusVal}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/20">
                  <span className="text-xs text-slate-500 font-medium Sarabun">
                    แสดง {filteredSubmissions.length === 0 ? 0 : startIndex + 1} - {Math.min(endIndex, filteredSubmissions.length)} จาก {filteredSubmissions.length} รายการ
                  </span>
                  
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Prev Button */}
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-xl transition duration-150 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                      title="หน้าก่อนหน้า"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Page Numbers */}
                    {getPageNumbers().map((p, idx) => {
                      if (p === '...') {
                        return (
                          <span key={idx} className="px-3 py-1.5 text-slate-400 text-xs font-semibold Sarabun select-none">
                            ...
                          </span>
                        );
                      }
                      return (
                        <button
                          key={idx}
                          onClick={() => setCurrentPage(Number(p))}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition duration-150 cursor-pointer ${
                            currentPage === p
                              ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}

                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-xl transition duration-150 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                      title="หน้าถัดไป"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold tracking-wider uppercase Prompt">
                    {isAdmin && (
                      <th className="p-4 pl-6 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedQueueIds.size === filteredQueue.length && filteredQueue.length > 0}
                          onChange={handleToggleSelectAllQueue}
                          className="w-4.5 h-4.5 border border-slate-300 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className={`p-4 ${isAdmin ? '' : 'pl-6'}`}>รหัสงาน</th>
                    <th className="p-4">เลขออเดอร์</th>
                    <th className="p-4">ชื่อลูกค้า</th>
                    <th className="p-4">ประเภทงาน</th>
                    <th className="p-4">ช่างผู้รับผิดชอบ</th>
                    <th className="p-4 text-center pr-6">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 Sarabun">
                  {filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="p-12 text-center text-slate-400">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                        <p className="font-semibold text-xs text-slate-500 Prompt">ไม่มีงานค้างในคิว</p>
                      </td>
                    </tr>
                  ) : (
                    displayedQueue.map((job, idx) => {
                      let typeColorClass = 'text-indigo-600';
                      if (job.job_type.includes('ถอด')) typeColorClass = 'text-purple-600';
                      else if (job.job_type.includes('ซ่อม')) typeColorClass = 'text-emerald-600';
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition">
                          {isAdmin && (
                            <td className="p-4 pl-6 text-center">
                              <input
                                type="checkbox"
                                checked={selectedQueueIds.has(job.job_id)}
                                onChange={() => handleToggleQueueSelect(job.job_id)}
                                className="w-4.5 h-4.5 border border-slate-300 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className={`p-4 font-bold text-slate-800 ${isAdmin ? '' : 'pl-6'}`}>{job.job_id}</td>
                          <td className="p-4 font-medium text-slate-500 Prompt">{job.order_no || '-'}</td>
                          <td className="p-4 font-bold text-slate-700 Prompt">{job.customer_name}</td>
                          <td className="p-4 font-bold"><span className={typeColorClass}>{job.job_type}{job.sub_work_type ? ` (${job.sub_work_type})` : ''}</span></td>
                          <td className="p-4 font-bold text-slate-800 Prompt">{formatDisplayName(job.assigned_to)}</td>
                          <td className="p-4 text-center pr-6 font-extrabold text-[11px] Prompt">
                            <span className={job.status === 'pending' ? 'text-amber-600' : 'text-emerald-600'}>
                              {job.status === 'pending' ? 'ค้างส่ง' : 'ส่งแล้ว'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalQueuePages > 1 && (
              <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/20">
                <span className="text-xs text-slate-500 font-medium Sarabun">
                  แสดง {filteredQueue.length === 0 ? 0 : startQueueIndex + 1} - {Math.min(endQueueIndex, filteredQueue.length)} จาก {filteredQueue.length} รายการ
                </span>
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Prev Button */}
                  <button
                    onClick={() => setCurrentQueuePage(prev => Math.max(1, prev - 1))}
                    disabled={currentQueuePage === 1}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-xl transition duration-150 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                    title="หน้าก่อนหน้า"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page Numbers */}
                  {getQueuePageNumbers().map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={idx} className="px-3 py-1.5 text-slate-400 text-xs font-semibold Sarabun select-none">
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentQueuePage(Number(p))}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition duration-150 cursor-pointer ${
                          currentQueuePage === p
                            ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                  {/* Next Button */}
                  <button
                    onClick={() => setCurrentQueuePage(prev => Math.min(totalQueuePages, prev + 1))}
                    disabled={currentQueuePage === totalQueuePages}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-xl transition duration-150 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                    title="หน้าถัดไป"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
        )}
      </main>

      {/* ── Detail & Edit Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedSub && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={closeSubDetail}
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative bg-white/80 backdrop-blur-lg rounded-[2rem] p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] max-w-lg w-full border border-white/60 max-h-[90vh] overflow-y-auto flex flex-col gap-5 z-10"
            >
              {modalLoading && (
                <div className="absolute inset-0 z-30 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center rounded-3xl">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-semibold text-slate-650 Prompt">กำลังอัปเดตข้อมูลบนคลาวด์...</p>
                </div>
              )}

              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 Prompt flex items-center gap-2">
                    {isEditingSub ? (
                      <><Edit3 className="w-5 h-5 text-amber-500" /><span>แก้ไขข้อมูลใบส่งงาน</span></>
                    ) : (
                      <><FileSpreadsheet className="w-5 h-5 text-indigo-500" /><span>รายละเอียดการส่งงาน</span></>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 Prompt mt-0.5">รหัสงาน: {selectedSub.job_id || '-'}</p>
                </div>
                <button onClick={closeSubDetail} className="text-slate-400 hover:text-slate-600 text-lg p-1.5 hover:bg-slate-100/50 rounded-full transition cursor-pointer">✕</button>
              </div>

              {/* Glassmorphic Row: Date and 3-Pill Status Selector */}
              <div className="bg-white/50 backdrop-blur-xs p-4.5 rounded-2xl border border-white/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase Prompt">วันเวลาที่ส่งงาน</span>
                  <p className="text-xs font-bold text-slate-700 Sarabun leading-relaxed mt-0.5">{formatThaiDate(selectedSub.submission_date)}</p>
                </div>
                
                <div className="flex flex-col gap-1 sm:w-auto w-full">
                  <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase Prompt mb-0.5">สถานะการตรวจสอบ</span>
                  <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-1 rounded-2xl w-full sm:w-[240px]">
                    <button
                      onClick={() => isEditingSub ? setEditStatus('รอตรวจ') : handleUpdateStatusDirect('รอตรวจ')}
                      className={`py-1.5 px-2 rounded-xl text-[10px] font-extrabold transition cursor-pointer Prompt text-center ${
                        (isEditingSub ? editStatus : (selectedSub.status || 'รอตรวจ')) === 'รอตรวจ'
                          ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                          : 'bg-white/60 hover:bg-white text-amber-600'
                      }`}
                    >
                      รอตรวจ
                    </button>
                    <button
                      onClick={() => isEditingSub ? setEditStatus('ตรวจแล้ว') : handleUpdateStatusDirect('ตรวจแล้ว')}
                      className={`py-1.5 px-2 rounded-xl text-[10px] font-extrabold transition cursor-pointer Prompt text-center ${
                        (isEditingSub ? editStatus : selectedSub.status) === 'ตรวจแล้ว'
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                          : 'bg-white/60 hover:bg-white text-emerald-600'
                      }`}
                    >
                      ตรวจแล้ว
                    </button>
                    <button
                      onClick={() => isEditingSub ? setEditStatus('แก้ไข') : handleUpdateStatusDirect('แก้ไข')}
                      className={`py-1.5 px-2 rounded-xl text-[10px] font-extrabold transition cursor-pointer Prompt text-center ${
                        (isEditingSub ? editStatus : selectedSub.status) === 'แก้ไข'
                          ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                          : 'bg-white/60 hover:bg-white text-rose-600'
                      }`}
                    >
                      แก้ไข
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-xs font-semibold Sarabun">
                <div className="grid grid-cols-2 gap-4 bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ประเภทงาน</span>
                    {isEditingSub ? (
                      <select value={editType} onChange={(e) => setEditType(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition cursor-pointer">
                        <option value="งานติดตั้ง (INS)">งานติดตั้ง (INS)</option>
                        <option value="งานซ่อม (AS)">งานซ่อม (AS)</option>
                        <option value="งานถอดติดตั้ง (AS)">งานถอดติดตั้ง (AS)</option>
                        <option value="งานเฟล (Fail)">งานเฟล (Fail)</option>
                        <option value="งานคืน (Return)">งานคืน (Return)</option>
                      </select>
                    ) : (
                      <p className="text-xs font-bold text-slate-800 mt-1">{selectedSub.work_type}</p>
                    )}
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ผู้ส่งงาน (ช่าง)</span>
                    {isEditingSub ? (
                      <select value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition cursor-pointer">
                        {technicians.map(t => <option key={t} value={t}>{formatDisplayName(t)}</option>)}
                        {editName && !technicians.includes(editName) && <option value={editName}>{formatDisplayName(editName)}</option>}
                      </select>
                    ) : (
                      <p className="text-xs font-bold text-slate-800 mt-1">{formatDisplayName(selectedSub.name)}</p>
                    )}
                  </div>
                </div>

                {(isEditingSub || (selectedSub.fail_detail && selectedSub.fail_detail !== '-')) && (
                  <div className="bg-rose-500/10 backdrop-blur-xs p-4 rounded-2xl border border-rose-200/50 shadow-2xs">
                    <span className="block text-[10px] text-rose-500 font-bold uppercase Prompt">รายละเอียดการเฟล</span>
                    {isEditingSub ? (
                      <select value={editFailDetail} onChange={(e) => setEditFailDetail(e.target.value)} className="w-full bg-white border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-rose-400 transition cursor-pointer">
                        <option value="">— ไม่ใช่งานเฟล —</option>
                        <option value="entered">🏠 เข้าหน้างานแล้ว</option>
                        <option value="not_entered">🚗 ยังไม่เข้าหน้างาน</option>
                      </select>
                    ) : (
                      <p className="text-xs font-bold text-rose-700 mt-1">
                        {selectedSub.fail_detail === 'entered' ? '🏠 เข้าหน้างานแล้ว' : '🚗 ยังไม่เข้าหน้างาน'}
                      </p>
                    )}
                  </div>
                )}

                {(isEditingSub || (selectedSub.status === 'แก้ไข' && selectedSub.reject_reason)) && (
                  <div className="bg-amber-500/10 backdrop-blur-xs p-4 rounded-2xl border border-amber-200/50 shadow-2xs">
                    <span className="block text-[10px] text-amber-600 font-bold uppercase Prompt flex items-center gap-1">
                      <Info className="w-3 h-3" /> สาเหตุที่ให้แก้ไข
                    </span>
                    {isEditingSub ? (
                      <textarea value={editRejectReason} onChange={(e) => setEditRejectReason(e.target.value)} placeholder="ระบุสาเหตุที่ให้แก้ไข..." className="w-full bg-white border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-amber-400 transition min-h-[56px] Prompt" />
                    ) : (
                      <p className="text-xs font-bold text-amber-700 mt-1 Sarabun leading-relaxed">{selectedSub.reject_reason}</p>
                    )}
                  </div>
                )}

                {/* กล่อง เลขออเดอร์ + รหัสงาน */}
                <div className="grid grid-cols-2 gap-4 bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">เลขออเดอร์</span>
                    {isEditingSub ? (
                      <input type="text" value={editOrderNo} onChange={(e) => setEditOrderNo(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition" />
                    ) : (
                      <p className="text-xs font-bold text-slate-800 mt-1">{selectedSub.order_no || '-'}</p>
                    )}
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">รหัสงาน</span>
                    {isEditingSub ? (
                      <input
                        type="text"
                        value={editJobId}
                        onChange={(e) => setEditJobId(e.target.value)}
                        placeholder="INS... หรือ AS..."
                        className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition"
                      />
                    ) : (
                      <p className="text-xs font-bold text-slate-800 mt-1">{selectedSub.job_id || '-'}</p>
                    )}
                  </div>
                </div>

                <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ชื่อเอกสารใบงาน</span>
                  {isEditingSub ? (
                    <input type="text" value={editFileName} onChange={(e) => setEditFileName(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition Prompt" />
                  ) : (
                    <p className="text-xs font-bold text-slate-800 mt-1 break-all">{selectedSub.file_name || '-'}</p>
                  )}
                </div>

                <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">หมายเหตุ / อาการเสีย</span>
                  {isEditingSub ? (
                    <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition min-h-[60px] Prompt" />
                  ) : (
                    <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{selectedSub.description || '-'}</p>
                  )}
                </div>

                {isEditingSub ? (
                  <>
                    {/* ประเภทงานย่อย */}
                    <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                      <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ประเภทงานย่อย (sub_work_type)</span>
                      <input type="text" value={editSubWorkType} onChange={(e) => setEditSubWorkType(e.target.value)} placeholder="เช่น เครื่องทำน้ำ / อุปกรณ์" className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition Prompt" />
                    </div>
                    {/* URL ไฟล์ PDF */}
                    <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                      <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">URL ไฟล์ PDF</span>
                      <input type="text" value={editFileUrl} onChange={(e) => setEditFileUrl(e.target.value)} placeholder="https://drive.google.com/..." className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition font-mono" />
                    </div>
                    {/* วิดีโอ */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ชื่อวิดีโอ</span>
                        <input type="text" value={editVideoName} onChange={(e) => setEditVideoName(e.target.value)} placeholder="ชื่อไฟล์วิดีโอ" className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition" />
                      </div>
                      <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">URL วิดีโอ</span>
                        <input type="text" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)} placeholder="https://drive.google.com/..." className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs mt-1 focus:outline-none focus:border-indigo-500 transition font-mono" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs flex flex-col justify-between gap-3">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">เอกสาร PDF ใบงาน</span>
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">{selectedSub.file_name}</p>
                      </div>
                      {selectedSub.file_url && selectedSub.file_url !== '-' ? (
                        <button onClick={() => setPreviewFile({ type: 'pdf', url: selectedSub.file_url, name: selectedSub.file_name || 'เอกสารใบงาน' })} className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition Prompt cursor-pointer">
                          <Eye className="w-3.5 h-3.5" /><span>ดูไฟล์ PDF</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 py-2.5 text-center bg-slate-100 rounded-xl">ไม่มีเอกสาร</span>
                      )}
                    </div>
                    <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs flex flex-col justify-between gap-3">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">วิดีโอประกอบ</span>
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">{selectedSub.video_name || '-'}</p>
                      </div>
                      {selectedSub.video_url && selectedSub.video_url !== '-' ? (
                        <button onClick={() => setPreviewFile({ type: 'video', url: selectedSub.video_url, name: selectedSub.video_name || 'วิดีโอประกอบ' })} className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition Prompt cursor-pointer">
                          <Eye className="w-3.5 h-3.5" /><span>เปิดดูวิดีโอ</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 py-2.5 text-center bg-slate-100 rounded-xl">ไม่มีวิดีโอ</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100 mt-2">
                {isEditingSub ? (
                  <>
                    <button onClick={() => setIsEditingSub(false)} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition Prompt cursor-pointer">ยกเลิก</button>
                    <button onClick={handleSaveSubEdits} className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-100 Prompt cursor-pointer">💾 บันทึกการแก้ไข</button>
                  </>
                ) : (
                  <>
                    {isAdmin && (
                      <button onClick={handleDeleteSub} className="py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={isAdmin ? () => setIsEditingSub(true) : closeSubDetail} className={`flex-1 py-3 px-4 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 Prompt cursor-pointer ${
                      isAdmin
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-100'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}>
                      {isAdmin ? <><Edit3 className="w-4 h-4" /><span>แก้ไขรายละเอียดใบงาน</span></> : <span>ปิดหน้าต่าง</span>}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── File Preview Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
            {/* Click backdrop to close */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 cursor-default bg-transparent"
              onClick={() => setPreviewFile(null)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white/90 backdrop-blur-lg rounded-[2rem] border border-white/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden z-10"
            >
              {(() => {
                const previewFileId = getFileIdFromUrl(previewFile.url);
                const gdriveViewUrl = previewFileId ? `https://drive.google.com/file/d/${previewFileId}/view?usp=drivesdk` : previewFile.url;
                return (
                  <>
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/40 backdrop-blur-xs">
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 Prompt truncate max-w-[60vw]">
                          พรีวิว: {previewFile.name}
                        </h3>
                        <p className="text-[10px] text-slate-400 Prompt">ตรวจสอบความถูกต้องของชิ้นงานส่งช่าง</p>
                      </div>
                      <button 
                        onClick={() => setPreviewFile(null)}
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition cursor-pointer text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className={`flex-grow min-h-0 bg-slate-950 relative flex flex-col ${previewFile.type === 'video' ? 'p-4 items-center justify-center' : ''}`}>
                      {previewFile.type === 'video' ? (
                        isNativeVideo(previewFile.url, previewFile.name) ? (
                          <video 
                            src={`/api/gdrive/proxy?fileId=${previewFileId}`} 
                            controls 
                            className="w-full h-full object-contain rounded-2xl shadow-2xl border border-white/10" 
                            playsInline
                          />
                        ) : (
                          <iframe 
                            src={`/api/gdrive/proxy?fileId=${previewFileId}`} 
                            className="w-full h-full border-0" 
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                          />
                        )
                      ) : (
                        <CustomPdfViewer url={`/api/gdrive/proxy?fileId=${previewFileId}`} />
                      )}
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 flex gap-3 justify-end bg-white/40 backdrop-blur-xs">
                      <button 
                        onClick={() => setPreviewFile(null)}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition Prompt cursor-pointer"
                      >
                        ปิดพรีวิว
                      </button>
                      <a 
                        href={gdriveViewUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl transition shadow-md shadow-indigo-100 flex items-center gap-1.5 Prompt cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>เปิดในหน้าต่างใหม่</span>
                      </a>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Reject Reason Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {isRejectModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md cursor-default"
              onClick={() => setIsRejectModalOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] rounded-[2rem] p-6 max-w-sm w-full flex flex-col z-10"
            >
              <div className="flex flex-col items-center mb-5 text-center">
                <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center mb-3 shadow-inner">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 Prompt">ระบุสาเหตุที่ต้องแก้ไข</h3>
                <p className="text-xs text-slate-500 mt-1 Sarabun">ข้อความนี้จะถูกส่งไปแจ้งให้ช่างทราบ เพื่อใช้ในการแก้ไขงาน</p>
              </div>

              <textarea
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="เช่น รูปภาพไม่ชัดเจน, ขาดรูปป้ายทะเบียน, เลขเครื่องไม่ตรง..."
                className="w-full bg-white/50 border border-slate-200 text-slate-700 rounded-2xl p-4 text-xs min-h-[100px] focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all Prompt resize-none shadow-inner"
                autoFocus
              />

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition Prompt cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    if (!rejectReasonInput.trim()) {
                      showToast('กรุณาระบุสาเหตุที่ต้องแก้ไข', 'error');
                      return;
                    }
                    proceedWithUpdateStatus('แก้ไข', rejectReasonInput.trim());
                  }}
                  className="flex-[2] py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition shadow-md shadow-rose-200 flex items-center justify-center gap-2 Prompt cursor-pointer"
                >
                  <span>ยืนยันให้แก้ไข</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

