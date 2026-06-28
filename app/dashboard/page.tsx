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

interface TechPos {
  username: string;
  name: string;
  displayName: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  isWalking: boolean;
  angle: number;
  status: string;
  pendingCount: number;
  hasRecentSub: boolean;
  checkInTime: string;
  province: string;
  chatBubble: string;
  chatTimer: number;
  idleTimer: number;
}

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

    // List of potential statuses
    const statuses = ['working', 'onsite', 'leave', 'offline'];
    const provinces = ['กรุงเทพฯ', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'ชลบุรี'];
    const leaveTypes = ['sick_leave', 'personal_leave'];

    // Initial setup
    const initialDemo = technicians.map((u, idx) => {
      const name = u.name || '';
      const username = u.username || '';
      
      const randomStatus = statuses[idx % statuses.length];
      const pendingCount = Math.floor(Math.random() * 4); // 0 to 3
      const hasRecentSub = Math.random() > 0.7; // 30% chance

      // random check-in time
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

    // Periodically update the simulator to show live movement!
    const interval = setInterval(() => {
      setDemoTechs(prev => {
        return prev.map(t => {
          // 25% chance to update each technician's status
          if (Math.random() > 0.75) {
            const nextStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const newPending = Math.floor(Math.random() * 4);
            const subChance = Math.random() > 0.7;
            
            let statusVal = 'offline';
            if (nextStatus === 'working') {
              statusVal = 'normal';
            } else if (nextStatus === 'leave') {
              statusVal = Math.random() > 0.5 ? 'sick_leave' : 'personal_leave';
            } else if (nextStatus === 'onsite') {
              statusVal = 'onsite';
            }

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
    }, 10000); // Check for status changes every 10 seconds

    return () => clearInterval(interval);
  }, [demoMode, users]);

  // Map incoming tech data
  const sourceTechs = demoMode ? demoTechs : technicians.map(u => {
    const username = u.username || '';
    const name = u.name || '';
    const attRecord = todayAttendance[username] || todayAttendance[name];
    
    const pendingJobs = assignedJobs.filter(j => 
      j.status !== 'submitted' && 
      (j.technician?.trim().toLowerCase() === name.trim().toLowerCase() ||
       j.technician?.trim().toLowerCase() === username.trim().toLowerCase())
    );

    const hasRecentSub = submissions.some(s => {
      if (s.name?.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
      const subTime = new Date(s.submission_date).getTime();
      return (Date.now() - subTime) < 2 * 60 * 60 * 1000;
    });

    return {
      username,
      name,
      displayName: name.split('-').pop()?.trim() || name,
      pendingCount: pendingJobs.length,
      hasRecentSub,
      checkInTime: attRecord?.check_in_time ? new Date(attRecord.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '',
      status: attRecord?.status || 'offline',
      province: attRecord?.province || '',
      district: attRecord?.district || ''
    };
  });

  // Keep tracking local simulation state of positions
  const [techPositions, setTechPositions] = useState<TechPos[]>([]);

  // Spawn Door Point
  const DOOR_X = 18;
  const DOOR_Y = 75;

  // Desk spots, relaxation spots, lounge spots coordinates on the uploaded picture
  const DESK_SPOTS = [
    { x: 49, y: 61 }, // Sitting on desk chair
    { x: 35, y: 55 }, // Window view / Left bench
    { x: 58, y: 58 }, // Right desk near cupboard
    { x: 43, y: 44 }  // Back whiteboard desk
  ];

  const LOUNGE_SPOTS = [
    { x: 74, y: 70 },
    { x: 82, y: 78 },
    { x: 68, y: 74 }
  ];

  useEffect(() => {
    setTechPositions(prev => {
      const updated = [...prev];
      
      sourceTechs.forEach((st, idx) => {
        const existing = updated.find(t => t.username === st.username);
        
        // Target coordinates based on status
        let tx = DOOR_X;
        let ty = DOOR_Y;
        
        if (st.status === 'normal' || st.status === 'late') {
          const spot = DESK_SPOTS[idx % DESK_SPOTS.length];
          tx = spot.x;
          ty = spot.y;
        } else if (st.status === 'sick_leave' || st.status === 'personal_leave') {
          const spot = LOUNGE_SPOTS[idx % LOUNGE_SPOTS.length];
          tx = spot.x;
          ty = spot.y;
        } else {
          // Onsite or Offline walk to the door
          tx = DOOR_X;
          ty = DOOR_Y;
        }

        if (existing) {
          // Update properties but preserve walking position
          existing.status = st.status;
          existing.pendingCount = st.pendingCount;
          existing.hasRecentSub = st.hasRecentSub;
          existing.checkInTime = st.checkInTime;
          existing.province = st.province;
          existing.tx = tx;
          existing.ty = ty;
        } else {
          // Spawn at the door if they are active/not offline
          if (st.status !== 'offline' && st.status !== 'onsite') {
            updated.push({
              username: st.username,
              name: st.name,
              displayName: st.displayName,
              x: DOOR_X,
              y: DOOR_Y,
              tx,
              ty,
              isWalking: true,
              angle: 0,
              status: st.status,
              pendingCount: st.pendingCount,
              hasRecentSub: st.hasRecentSub,
              checkInTime: st.checkInTime,
              province: st.province,
              chatBubble: 'เข้าออฟฟิศแล้วครับ! 👋',
              chatTimer: 35,
              idleTimer: Math.floor(Math.random() * 100) + 100
            });
          }
        }
      });

      // Handle technicians who went offline or onsite
      sourceTechs.forEach(st => {
        if (st.status === 'offline' || st.status === 'onsite') {
          const existing = updated.find(t => t.username === st.username);
          if (existing) {
            existing.status = st.status;
            existing.tx = DOOR_X;
            existing.ty = DOOR_Y;
          }
        }
      });

      return updated;
    });
  }, [sourceTechs]);

  // Core Animation Loop (Tick every 60ms)
  useEffect(() => {
    const timer = setInterval(() => {
      setTechPositions(prev => {
        const speed = 1.5; // percentage distance per tick
        
        return prev.map(t => {
          const dx = t.tx - t.x;
          const dy = t.ty - t.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          let nx = t.x;
          let ny = t.y;
          let isWalk = t.isWalking;
          let nAngle = t.angle;
          let bubble = t.chatBubble;
          let bubbleTime = t.chatTimer;
          let idleTime = t.idleTimer;
          let targetX = t.tx;
          let targetY = t.ty;

          // Handle Movement
          if (dist > speed) {
            nx += (dx / dist) * speed;
            ny += (dy / dist) * speed;
            isWalk = true;
            nAngle = (t.angle + 0.3) % (Math.PI * 2);
          } else {
            nx = t.tx;
            ny = t.ty;
            isWalk = false;
            nAngle = 0;
          }

          // Handle chat bubble expiration
          if (bubbleTime > 0) {
            bubbleTime -= 1;
            if (bubbleTime === 0) {
              bubble = '';
            }
          }

          // Handle Idle Behavior (Random walks and messages)
          if (!isWalk && (t.status === 'normal' || t.status === 'late')) {
            if (idleTime > 0) {
              idleTime -= 1;
            } else {
              // Time to decide next move
              if (Math.random() > 0.8) {
                // Decide to walk somewhere random in office
                const walkChoice = Math.random();
                if (walkChoice < 0.3) {
                  // Walk to file cabinet
                  targetX = 63;
                  targetY = 50;
                } else if (walkChoice < 0.6) {
                  // Walk to window
                  targetX = 35;
                  targetY = 55;
                } else {
                  // Back to their main desk chair
                  const idx = sourceTechs.findIndex(st => st.username === t.username);
                  const spot = DESK_SPOTS[idx >= 0 ? idx % DESK_SPOTS.length : 0];
                  targetX = spot.x;
                  targetY = spot.y;
                }
              }
              
              // Reset idle timer
              idleTime = Math.floor(Math.random() * 150) + 150;
            }

            // Small chance of idle chat bubble
            if (Math.random() > 0.992 && !bubble) {
              const quotes = [
                "วันนี้เคสติดตั้งเยอะเลยครับ 💻",
                "ขอสแตนด์บายรอรับออเดอร์ใหม่ครับ 🙋‍♂️",
                "ลูกค้าบ้านนี้น่ารักมากครับ ให้ทิปด้วย 😊",
                "เน็ตหน้างานหมุนติ้วๆ อัปโหลดช้าจัง 📶",
                "กำลังเคลียร์เอกสารเข้าระบบครับ 🚗",
                "แอดมินช่วยตรวจงานเลขออเดอร์นี้หน่อยครับ 🙏",
                "แมวบนตู้เอกสารนอนทั้งวันเลย 🐱",
                "กาแฟที่ออฟฟิศหมดแล้วเหรอครับ ☕",
                "งานซ่อมเสร็จแล้ว รูปครบชัดเจนครับ 📸",
                "วันนี้แดดแรงมาก ร้อนสุดๆ ☀️",
                "ใบงานของลูกค้ารายนี้เรียบร้อยครับ 📄",
                "เย้! วันนี้เคลียร์คิวงานหมดแล้ว 🎉"
              ];
              bubble = quotes[Math.floor(Math.random() * quotes.length)];
              bubbleTime = 45; // show for ~2.7s
            }
          }

          return {
            ...t,
            x: nx,
            y: ny,
            tx: targetX,
            ty: targetY,
            isWalking: isWalk,
            angle: nAngle,
            chatBubble: bubble,
            chatTimer: bubbleTime,
            idleTimer: idleTime
          };
        }).filter(t => {
          // Keep character if they haven't reached the door to exit yet
          const arrivedAtDoor = Math.abs(t.x - DOOR_X) < 1.0 && Math.abs(t.y - DOOR_Y) < 1.0;
          const isLeaving = t.status === 'offline' || t.status === 'onsite';
          
          if (isLeaving && arrivedAtDoor && !t.isWalking) {
            return false;
          }
          return true;
        });
      });
    }, 60);

    return () => clearInterval(timer);
  }, [sourceTechs]);

  // Derived arrays to count states for header indicators
  const workingCount = sourceTechs.filter(t => t.status === 'normal' || t.status === 'late').length;
  const onsiteCount = sourceTechs.filter(t => t.status === 'onsite').length;
  const leaveCount = sourceTechs.filter(t => t.status === 'sick_leave' || t.status === 'personal_leave').length;
  const offlineCount = sourceTechs.filter(t => t.status === 'offline').length;

  return (
    <div className="glass-card p-5 mb-6 overflow-hidden relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pixel-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pixel-typing {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-2px) scaleY(0.95); }
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
        .animate-bounce-pixel {
          animation: pixel-bounce 1.5s infinite ease-in-out;
        }
        .animate-typing-pixel {
          animation: pixel-typing 0.4s infinite linear;
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
      `}} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            🏢 Live Tech Pixel Office (สถานะปฏิบัติงานช่างเทคนิคเรียลไทม์)
          </h3>
          {demoMode && (
            <span className="bg-rose-500 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full shadow-sm animate-pulse Prompt tracking-wider">
              🎮 DEMO ACTIVE
            </span>
          )}
        </div>
        
        {/* Toggle Demo Switch & Count details */}
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
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-sm shadow-emerald-200" />
              ในออฟฟิศ: {workingCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block shadow-sm shadow-indigo-200" />
              ลงพื้นที่: {onsiteCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shadow-sm shadow-amber-200" />
              ลางาน: {leaveCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-350 inline-block" />
              ออฟไลน์: {offlineCount}
            </span>
          </div>
        </div>
      </div>

      {/* Unified Isometric Office Sandbox Map */}
      <div className="relative w-full max-w-3xl mx-auto h-[480px] rounded-2xl overflow-hidden border border-slate-200/80 shadow-md bg-slate-100">
        {/* Generated Isometric Office Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-500"
          style={{ backgroundImage: "url('/isometric_tech_office.png')" }}
        />
        {/* Soft shadow overlay */}
        <div className="absolute inset-0 bg-slate-900/5 pointer-events-none" />

        {/* Dynamic coordinate placement of technicians */}
        {techPositions.map((tech) => {
          // Dynamic scaling based on Y coordinate to simulate 3D Depth
          const depthScale = 0.8 + (tech.y / 100) * 0.45;
          const isWalkingNow = tech.isWalking;
          const walkingAngle = tech.angle;
          const faceRight = tech.tx > tech.x;

          return (
            <div 
              key={tech.username} 
              className="absolute -translate-x-1/2 -translate-y-[85%] flex flex-col items-center z-10 transition-all duration-100 ease-linear cursor-pointer group"
              style={{ 
                top: `${tech.y}%`, 
                left: `${tech.x}%`,
                zIndex: Math.floor(tech.y * 10)
              }}
            >
              {/* Interactive Speech Bubbles (RPG/Habbo Style) */}
              {tech.chatBubble && (
                <div className="absolute bottom-[110%] mb-1 flex flex-col items-center transition-all duration-300 animate-bounce z-40">
                  <div className="bg-white text-slate-800 text-[9px] font-extrabold px-3 py-1.5 rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.15)] border border-slate-100 max-w-[130px] text-center Prompt leading-relaxed break-words">
                    {tech.chatBubble}
                  </div>
                  {/* Speech bubble pointer */}
                  <div className="w-2.5 h-2.5 bg-white border-r border-b border-slate-100 rotate-45 -mt-1.5" />
                </div>
              )}

              {/* Status / Task Info Badge on Hover */}
              <div className="absolute bottom-[105%] hidden group-hover:flex flex-col items-center z-30 transition-all duration-200">
                <div className="bg-slate-900/95 text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap Prompt leading-snug">
                  <p>{tech.name}</p>
                  <p className="text-slate-300 font-semibold text-[8px] mt-0.5">
                    สถานะ: {
                      tech.status === 'onsite' ? `🚗 ลงพื้นที่ (${tech.province || 'ตจว.'})` :
                      tech.status === 'sick_leave' ? '🤒 ลาป่วย' :
                      tech.status === 'personal_leave' ? '🚗 ลากิจ' :
                      tech.status === 'normal' || tech.status === 'late' ? `💻 ในออฟฟิศ (เข้า ${tech.checkInTime || '—'})` :
                      '🏠 ออฟไลน์'
                    }
                  </p>
                </div>
                <div className="w-1.5 h-1.5 bg-slate-900/95 rotate-45 -mt-1" />
              </div>

              {/* Character sprite visual wrapper with depth scaling and walking sway */}
              <div 
                className="relative transition-transform duration-100"
                style={{ 
                  transform: `
                    scale(${depthScale}) 
                    rotate(${isWalkingNow ? Math.sin(walkingAngle) * 8 : 0}deg) 
                    translateY(${isWalkingNow ? Math.abs(Math.sin(walkingAngle)) * -3 : 0}px)
                    scaleX(${faceRight ? 1 : -1})
                  ` 
                }}
              >
                {/* 1. Working Office State sprite */}
                {(tech.status === 'normal' || tech.status === 'late') && (
                  <div className="relative">
                    {/* Active work/task badge */}
                    {tech.hasRecentSub && (
                      <span className="absolute -top-3.5 -right-2 bg-pink-500 text-white font-extrabold text-[7px] px-1 py-0.25 rounded-md shadow-md animate-bounce z-20">
                        🎉 ส่งงาน
                      </span>
                    )}
                    {tech.pendingCount > 0 && !tech.hasRecentSub && (
                      <span className="absolute -top-3.5 -right-2 bg-indigo-600 text-white font-extrabold text-[7px] w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">
                        {tech.pendingCount}
                      </span>
                    )}
                    
                    {/* Retro 2D Character sprite sitting/typing */}
                    <svg className="w-11 h-11 drop-shadow-md" viewBox="0 0 40 40" fill="none">
                      {/* Character body */}
                      <path d="M12 22 C12 18, 28 18, 28 22 L28 32 L12 32 Z" fill="#6366f1" />
                      {/* Head */}
                      <circle cx="20" cy="14" r="5" fill="#fed7aa" />
                      {/* Hair */}
                      <path d="M15 14 C15 10, 25 10, 25 14 C25 12, 15 12, 15 14" fill="#78350f" stroke="#78350f" strokeWidth="2" />
                      {/* Eyes */}
                      <circle cx="18" cy="14" r="0.8" fill="#1e293b" />
                      <circle cx="22" cy="14" r="0.8" fill="#1e293b" />
                      {/* Typing hands (animates if standing/sitting idle) */}
                      {!isWalkingNow && (
                        <>
                          <circle cx="16" cy="24" r="1.2" fill="#fed7aa" className="animate-ping" />
                          <circle cx="24" cy="24" r="1.2" fill="#fed7aa" className="animate-ping" />
                        </>
                      )}
                    </svg>
                  </div>
                )}

                {/* 2. Onsite sprite (Shows a tiny walking courier or tools carrier) */}
                {tech.status === 'onsite' && (
                  <div className="relative animate-bounce-pixel">
                    <svg className="w-10 h-10 drop-shadow-md" viewBox="0 0 40 40" fill="none">
                      {/* Red coat / onsite uniform */}
                      <path d="M12 22 C12 18, 28 18, 28 22 L28 32 L12 32 Z" fill="#ef4444" />
                      {/* Head */}
                      <circle cx="20" cy="14" r="5" fill="#fed7aa" />
                      {/* Cap/Hat */}
                      <path d="M14 11 L26 11 L28 13 L12 13 Z" fill="#b91c1c" />
                      <rect x="14" y="9" width="12" height="3" rx="0.5" fill="#b91c1c" />
                      {/* Toolbox carried */}
                      <rect x="22" y="24" width="8" height="6" fill="#475569" />
                      <rect x="24" y="22" width="4" height="2" fill="#94a3b8" />
                    </svg>
                  </div>
                )}

                {/* 3. Leave Sprite (Beach Lounger relaxation) */}
                {(tech.status === 'sick_leave' || tech.status === 'personal_leave') && (
                  <div className="relative">
                    <svg className="w-10 h-10 drop-shadow-sm" viewBox="0 0 40 40" fill="none">
                      {/* Beach chair */}
                      <line x1="8" y1="30" x2="26" y2="16" stroke="#fbbf24" strokeWidth="2.5" />
                      {/* Resting Body */}
                      <circle cx="21" cy="17" r="4.5" fill="#fed7aa" />
                      <path d="M12 26 C12 24, 22 24, 22 26" stroke="#10b981" strokeWidth="3" />
                    </svg>
                  </div>
                )}

                {/* 4. Offline (Walks to exit and sleeps if needed) */}
                {tech.status === 'offline' && (
                  <div className="relative">
                    <span className="absolute -top-3.5 left-1 text-[8px] font-black text-slate-400/80 animate-zzz-1">Z</span>
                    <span className="absolute -top-2.5 left-3 text-[10px] font-black text-slate-400/80 animate-zzz-2">Z</span>
                    
                    <svg className="w-10 h-10 drop-shadow-sm" viewBox="0 0 40 40" fill="none">
                      <circle cx="20" cy="15" r="5" fill="#fed7aa" />
                      <path d="M15 15 C15 11, 25 11, 25 15" fill="#475569" stroke="#475569" strokeWidth="1.5" />
                      <path d="M12 23 C12 19, 28 19, 28 23 L28 32 L12 32 Z" fill="#94a3b8" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Badge text showing technician displayName */}
              <span className="text-[7.5px] font-black text-slate-700 bg-white/95 px-1.5 py-0.5 rounded-md shadow-md border border-slate-200/50 mt-1 max-w-[65px] truncate Prompt text-center z-10 scale-[0.9]">
                {tech.displayName}
              </span>
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

