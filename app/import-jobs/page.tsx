'use client';

import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/sidebar';
import { useApp } from '../providers';
import { getDb } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  writeBatch,
  deleteDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import type { JobRow, SubmissionData, UserData, DuplicateAnalysis } from '@/lib/utils';
import { analyzeJobDuplicate, findMatchingTechnician } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertTriangle,
  Info,
  Trash2,
  Search,
  CheckCircle2,
  X,
  ChevronDown,
  Filter,
  Link2,
  FileText,
  Video,
  ExternalLink,
  ShieldAlert,
  ScanSearch,
  ArrowRight,
  Bell,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedJob extends Partial<JobRow> {
  assigned_to_excel?: string;
  is_matched?: boolean;
  duplicateAnalysis?: {
    duplicate: boolean;
    warning?: boolean;
    status: 'duplicate' | 'pending_active' | 'history_active' | 'new';
    message: string;
    matchedItem?: any;
  };
}

/** One row parsed from the legacy Google Sheet export */
interface LegacySheetRow {
  rowIndex: number;
  submissionDate: string;   // วันที่ส่ง
  senderName: string;       // ชื่อผู้ส่ง
  workType: string;         // ประเภทงาน
  fileName: string;         // ชื่อไฟล์
  fileLink: string;         // ลิงก์ไฟล์
  videoLink: string;        // ลิงก์วิดีโอ (if any)
  note: string;             // หมายเหตุ
  status: string;           // สถานะ
  /** order number tokens extracted from fileName (e.g. "8000550269") */
  orderTokens: string[];
}

/** Match result between a legacy sheet row and an active Firebase job */
interface LegacyMatch {
  sheetRow: LegacySheetRow;
  firebaseJob: JobRow;      // the matched assigned_jobs document
  matchReason: string;      // e.g. "order_no ตรงกัน" / "job_id ตรงกัน"
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract numeric tokens (≥7 digits) from a filename — these are order numbers.
 * Uses regex match so it correctly handles filenames like "8000552489นาย ประยงค์ คำก้อน.pdf"
 * where the number and Thai text are concatenated without a separator.
 */
function extractOrderTokens(fileName: string): string[] {
  if (!fileName) return [];
  // Match any sequence of 7+ consecutive digits anywhere in the string
  const matches = fileName.match(/\d{7,}/g);
  return matches ? [...new Set(matches)] : [];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportJobsPage() {
  const { currentUser, showToast, showConfirm, setLoading, setLoadingText, systemSettings } = useApp();
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'import' | 'dedup'>('import');

  // ── Shared data caches ──
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([]);
  const [historyData, setHistoryData] = useState<SubmissionData[]>([]);
  const [dbUsers, setDbUsers] = useState<UserData[]>([]);
  
  // ── Tab 1: Import File States ──
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Notify-staff banner (shown after successful import) ──
  const [lastImportedJobs, setLastImportedJobs] = useState<ParsedJob[]>([]);
  const [lastImportedInsCount, setLastImportedInsCount] = useState(0);
  const [lastImportedAsCount, setLastImportedAsCount] = useState(0);
  const [notifyBannerVisible, setNotifyBannerVisible] = useState(false);
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifySent, setNotifySent] = useState(false);

  // ── Tab 2: Legacy Sheet Dedup States ──
  const [sheetUrl, setSheetUrl] = useState('');
  const [isDedupDragOver, setIsDedupDragOver] = useState(false);
  const [legacyMatches, setLegacyMatches] = useState<LegacyMatch[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set()); // job_id in Firebase
  const [dedupScanned, setDedupScanned] = useState(false);
  const dedupFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch ───────────────────────────────────────────────────────────────

  const fetchCacheData = async () => {
    try {
      const db = getDb();
      
      const jobsSnap = await getDocs(query(collection(db, 'assigned_jobs'), orderBy('timestamp', 'desc')));
      const jobsList: JobRow[] = [];
      jobsSnap.forEach(docSnap => { jobsList.push(docSnap.data() as JobRow); });
      setActiveJobs(jobsList);

      const subSnap = await getDocs(collection(db, 'submissions'));
      const subList: SubmissionData[] = [];
      subSnap.forEach(docSnap => { subList.push(docSnap.data() as SubmissionData); });
      setHistoryData(subList);

      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserData[] = [];
      usersSnap.forEach(docSnap => { usersList.push(docSnap.data() as UserData); });
      setDbUsers(usersList);

    } catch (err: any) {
      console.error(err);
      showToast("ดึงคิวงานขัดข้อง กรุณาลองรีเฟรชข้อมูลคลาวด์ครับ ⚠️", "error");
    }
  };

  useEffect(() => { fetchCacheData(); }, []);

  // ─── Tab 1: Import helpers ────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) processExcelFile(files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processExcelFile(files[0]);
  };

  const processExcelFile = (file: File) => {
    setLoading(true);
    setLoadingText("กำลังอ่านโครงสร้างไฟล์ Excel...");
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setTimeout(() => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (rows.length === 0) {
            showToast("ไม่พบข้อมูลในไฟล์ Excel ที่เลือก ❌", "error");
            setLoading(false);
            return;
          }

          // Build index maps once for fast O(1) lookup
          const activeJobsById = new Map<string, any>();
          const activeJobsByOrderNo = new Map<string, any>();
          const historyById = new Map<string, any>();
          const historyByOrderNoOrFile = new Map<string, any>();

          // Index ALL active jobs (including submitted ones)
          activeJobs.forEach(j => {
            if (j.job_id) activeJobsById.set(j.job_id.trim().toLowerCase(), j);
            if (j.order_no && j.order_no !== '-') activeJobsByOrderNo.set(j.order_no.trim().toLowerCase(), j);
          });

          historyData.forEach(h => {
            if (h.job_id) historyById.set(h.job_id.trim().toLowerCase(), h);
            if (h.order_no && h.order_no !== '-') historyByOrderNoOrFile.set(h.order_no.trim().toLowerCase(), h);
            if (h.file_name) {
              // ใช้ regex ดึงเลข 7+ หลักจากชื่อไฟล์ รองรับกรณีตัวเลขติดกับภาษาไทยโดยไม่มี space
              // เช่น "8000552489นาย ประยงค์ คำก้อน.pdf" → ["8000552489"]
              const numTokens = h.file_name.match(/\d{7,}/g) || [];
              for (const token of numTokens) {
                historyByOrderNoOrFile.set(token.toLowerCase(), h);
              }
            }
          });

          const checkDuplicateFast = (job_id: string, order_no: string, isIns: boolean): DuplicateAnalysis => {
            const jId = job_id.trim().toLowerCase();
            const ordNo = order_no.trim().toLowerCase();

            const activeJobIdMatch = jId ? activeJobsById.get(jId) : null;
            const activeOrderNoMatch = ordNo ? activeJobsByOrderNo.get(ordNo) : null;
            const historyJobIdMatch = jId ? historyById.get(jId) : null;
            const historyOrderNoMatch = ordNo ? historyByOrderNoOrFile.get(ordNo) : null;

            if (isIns) {
              if (activeJobIdMatch || historyJobIdMatch) {
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำรหัสงานติดตั้งเดิม (ข้าม)', matchedItem: activeJobIdMatch || historyJobIdMatch };
              }
              // ถ้า order_no ตรงกับ active queue
              if (activeOrderNoMatch) {
                if (activeOrderNoMatch.status === 'pending') {
                  // งานยังอยู่ในคิว pending → block
                  return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำเลขออเดอร์ติดตั้งเดิม (ข้าม)', matchedItem: activeOrderNoMatch };
                }
                // งาน submitted แล้ว → ดูจาก submissions ว่าเป็น Fail ไหม
                const submittedJobId = activeOrderNoMatch.job_id?.trim().toLowerCase();
                const submittedHistory = submittedJobId ? historyById.get(submittedJobId) : null;
                const submittedWorkType: string = submittedHistory?.work_type || submittedHistory?.job_type || '';
                const isSubmittedFail = submittedWorkType.includes('เฟล') || submittedWorkType.toLowerCase().includes('fail');
                if (isSubmittedFail) {
                  return { duplicate: false, warning: true, status: 'pending_active', message: '⚠️ งานเฟลเดิม — นำเข้าใหม่ได้', matchedItem: activeOrderNoMatch };
                }
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำเลขออเดอร์ติดตั้งเดิม (ข้าม)', matchedItem: activeOrderNoMatch };
              }
              // ถ้า order_no ตรงกับ submissions เดิม (ไม่มีใน assigned_jobs แล้ว)
              if (historyOrderNoMatch) {
                // ใช้ work_type (field จริงใน submissions) รองรับ job_type ด้วยกัน
                const prevWorkType: string = historyOrderNoMatch.work_type || historyOrderNoMatch.job_type || '';
                const isFail = prevWorkType.includes('เฟล') || prevWorkType.toLowerCase().includes('fail');
                if (isFail) {
                  return { duplicate: false, warning: true, status: 'pending_active', message: '⚠️ งานเฟลเดิม — นำเข้าใหม่ได้', matchedItem: historyOrderNoMatch };
                }
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำเลขออเดอร์ติดตั้งเดิม (ข้าม)', matchedItem: historyOrderNoMatch };
              }
              return { duplicate: false, status: 'new', message: '✨ งานติดตั้งใหม่' };
            } else {
              // ─── AS jobs: duplicate check ตาม AS No. เท่านั้น ───────────────────
              // 1 ออเดอร์สามารถเปิด AS หลายครั้งได้ (service call หลายรอบ)
              // → บล็อกเฉพาะ AS No. (job_id) ซ้ำ ไม่บล็อกตาม order_no

              if (activeJobIdMatch || historyJobIdMatch) {
                // AS No. ซ้ำกับที่มีในระบบแล้ว → block
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำรหัสงานบริการเดิม (ข้าม)', matchedItem: activeJobIdMatch || historyJobIdMatch };
              }
              if (activeOrderNoMatch && activeOrderNoMatch.status === 'pending') {
                // AS No. ใหม่ แต่ order เดิมมีงานค้างอยู่ → เตือนแต่ผ่านได้
                return {
                  duplicate: false,
                  warning: true,
                  status: 'pending_active',
                  message: `⚠️ ออเดอร์นี้มีงานค้างในคิวช่าง (${activeOrderNoMatch.assigned_to})`,
                  matchedItem: activeOrderNoMatch,
                };
              }
              if (activeOrderNoMatch || historyOrderNoMatch) {
                // AS No. ใหม่ แต่ order_no เดิมเคยส่งงานแล้ว → service call ใหม่ อนุญาต
                return {
                  duplicate: false,
                  warning: true,
                  status: 'pending_active',
                  message: '⚠️ ออเดอร์นี้เคยส่งงานแล้ว — AS No. ใหม่ นำเข้าได้',
                  matchedItem: activeOrderNoMatch || historyOrderNoMatch,
                };
              }
              return { duplicate: false, status: 'new', message: '✨ งานบริการใหม่' };
            }
          };

          const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
          let fileType: 'INS' | 'AS' | null = null;
          
          const hasInstallNo = headers.some(h => h.includes("install no"));
          const hasAsNo = headers.some(h => h.includes("as no") || h.includes("result no"));

          if (hasInstallNo) {
            fileType = 'INS';
          } else if (hasAsNo) {
            fileType = 'AS';
          } else {
            if (file.name.toLowerCase().includes("install")) {
              fileType = 'INS';
            } else if (file.name.toLowerCase().includes("as")) {
              fileType = 'AS';
            } else {
              showToast("ไม่สามารถตรวจประเภทงานได้ กรุณาใช้ไฟล์ตารางที่มีหัวคอลัมน์ Install No หรือ AS No", "error");
              setLoading(false);
              return;
            }
          }

          const tempParsed: ParsedJob[] = [];
          
          if (fileType === 'INS') {
            const installNoIdx = headers.findIndex(h => h.includes("install no"));
            const orderNoIdx = headers.findIndex(h => h.includes("order no"));
            const custNameIdx = headers.findIndex(h => h.includes("customer name"));
            const ctNameIdx = headers.findIndex(h => h.includes("ct name"));

            if (installNoIdx === -1 || ctNameIdx === -1) {
              showToast("ไม่พบคอลัมน์หลักในตารางตาราง INS (ต้องการอย่างน้อย Install No และ CT Name)", "error");
              setLoading(false);
              return;
            }

            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;
              
              const installNo = String(row[installNoIdx] || "").trim();
              if (!installNo) continue;

              const orderNo = orderNoIdx !== -1 ? String(row[orderNoIdx] || "").trim() : "";
              const custName = custNameIdx !== -1 ? String(row[custNameIdx] || "").trim() : "ลูกค้าทั่วไป";
              const ctExcelName = String(row[ctNameIdx] || "").trim();

              const matchedTechName = findMatchingTechnician(ctExcelName, dbUsers);
              
              const jobRow: Partial<JobRow> = {
                job_id: installNo,
                order_no: orderNo,
                customer_name: custName,
                job_type: "งานติดตั้ง (INS)",
                sub_work_type: "",
                assigned_to: matchedTechName || ctExcelName,
                assigned_to_excel: ctExcelName,
                is_matched: !!matchedTechName,
                status: "pending",
                timestamp: new Date().toISOString(),
                submission_date: "-",
                file_url: "-",
                video_url: "-",
                note: "-"
              };

              const dupAnalysis = checkDuplicateFast(installNo, orderNo, true);
              tempParsed.push({ ...jobRow, duplicateAnalysis: dupAnalysis });
            }
          } else {
            const asNoIdx = headers.findIndex(h => h.includes("as no"));
            const resultNoIdx = headers.findIndex(h => h.includes("result no"));
            const custNameIdx = headers.findIndex(h => h.includes("customer name"));
            const ctNameIdx = headers.findIndex(h => h.includes("ct name"));
            const errCodeIdx = headers.findIndex(h => h.includes("error code"));
            const errDescIdx = headers.findIndex(h => h.includes("error description") || h.includes("error desc") || h.includes("อาการเสีย"));
            const salesOrderIdx = headers.findIndex(h => h.includes("sales order"));
            
            const keyIdx = asNoIdx !== -1 ? asNoIdx : (resultNoIdx !== -1 ? resultNoIdx : -1);
            if (keyIdx === -1 || ctNameIdx === -1) {
              showToast("ไม่พบคอลัมน์หลักในตาราง AS (ต้องการอย่างน้อย AS No/Result No และ CT Name)", "error");
              setLoading(false);
              return;
            }

            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;

              const jobKey = String(row[keyIdx] || "").trim();
              if (!jobKey) continue;

              const salesOrder = salesOrderIdx !== -1 ? String(row[salesOrderIdx] || "").trim() : "";
              const orderNo = (salesOrder === "-" || salesOrder === "") ? "" : salesOrder;
              const custName = custNameIdx !== -1 ? String(row[custNameIdx] || "").trim() : "ลูกค้าทั่วไป";
              const ctExcelName = String(row[ctNameIdx] || "").trim();

              const errCode = errCodeIdx !== -1 ? String(row[errCodeIdx] || "").trim() : "";
              const errDesc = errDescIdx !== -1 ? String(row[errDescIdx] || "").trim() : "";

              const fullErrorText = `${errCode} | ${errDesc}`.toLowerCase();
              const isDismantle = 
                fullErrorText.includes("ถอด") || 
                fullErrorText.includes("ติดตั้ง") || 
                fullErrorText.includes("ย้าย") || 
                fullErrorText.includes("install") || 
                fullErrorText.includes("dismantle") || 
                fullErrorText.includes("reloc");
              const jobType = isDismantle ? "งานถอดติดตั้ง (AS)" : "งานซ่อม (AS)";

              const matchedTechName = findMatchingTechnician(ctExcelName, dbUsers);

              const jobRow: Partial<JobRow> = {
                job_id: jobKey,
                order_no: orderNo,
                customer_name: custName,
                job_type: jobType,
                sub_work_type: "",
                assigned_to: matchedTechName || ctExcelName,
                assigned_to_excel: ctExcelName,
                is_matched: !!matchedTechName,
                status: "pending",
                timestamp: new Date().toISOString(),
                submission_date: "-",
                file_url: "-",
                video_url: "-",
                note: "-"
              };

              const dupAnalysis = checkDuplicateFast(jobKey, orderNo, false);
              tempParsed.push({ ...jobRow, duplicateAnalysis: dupAnalysis });
            }
          }

          setParsedJobs(tempParsed);

          const initialSelected = new Set<string>();
          tempParsed.forEach(job => {
            if (job.job_id && job.duplicateAnalysis?.status !== 'duplicate') {
              initialSelected.add(job.job_id);
            }
          });
          setSelectedImportIds(initialSelected);

          showToast(`วิเคราะห์ไฟล์เสร็จสิ้น ตรวจพบงานนำเข้า ${tempParsed.length} รายการ`, "info");
        } catch (err: any) {
          console.error(err);
          showToast("ไม่สามารถประมวลผลไฟล์ Excel ได้: " + err.message, "error");
        } finally {
          setLoading(false);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleToggleImportSelect = (jobId: string) => {
    const next = new Set(selectedImportIds);
    if (next.has(jobId)) { next.delete(jobId); } else { next.add(jobId); }
    setSelectedImportIds(next);
  };

  const handleToggleSelectAllImport = () => {
    const importable = parsedJobs.filter(j => j.duplicateAnalysis?.status !== 'duplicate');
    const allSelected = importable.every(j => j.job_id && selectedImportIds.has(j.job_id));
    if (allSelected) {
      setSelectedImportIds(new Set());
    } else {
      const next = new Set<string>();
      importable.forEach(j => { if (j.job_id) next.add(j.job_id); });
      setSelectedImportIds(next);
    }
  };

  const handleSendStaffNotify = async () => {
    if (!systemSettings.push_service_account) {
      showToast("ยังไม่ได้ตั้งค่า Service Account JSON — กรุณาตั้งค่าในหน้า Settings → Push Notification ก่อนครับ", "error");
      return;
    }

    setSendingNotify(true);
    try {
      const db = getDb();

      // 1. Group imported jobs by assigned_to (tech name)
      const byTech = new Map<string, ParsedJob[]>();
      for (const job of lastImportedJobs) {
        const techName = job.assigned_to?.trim() || '';
        if (!techName) continue;
        if (!byTech.has(techName)) byTech.set(techName, []);
        byTech.get(techName)!.push(job);
      }

      // 2. Load all staff tokens once
      const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
      const allTokenDocs = tokensSnap.docs.map(d => d.data());

      // 3. Send personalized notification to each tech
      let totalDevicesSent = 0;
      let techsNotified = 0;

      for (const [techName, jobs] of byTech) {
        // Match token by name or username (token.username = currentUser.username || currentUser.name)
        const user = dbUsers.find(u => u.name === techName);
        const matchKeys = new Set<string>([techName, user?.username].filter(Boolean) as string[]);

        const techTokens = allTokenDocs
          .filter(d => d.role === 'staff' && matchKeys.has(d.username))
          .map(d => ({
            token: d.token as string,
            username: d.username as string,
            name: d.name as string || d.username as string || 'unknown'
          }))
          .filter(t => t.token);

        if (techTokens.length === 0) continue;

        // Build personalized title & body for this tech
        const ins = jobs.filter(j => j.job_type === 'งานติดตั้ง (INS)').length;
        const as  = jobs.filter(j => j.job_type !== 'งานติดตั้ง (INS)').length;

        let title: string;
        let body: string;
        if (ins > 0 && as === 0) {
          title = `📦 งานติดตั้ง (INS) ของคุณเข้าระบบ ${ins} รายการ`;
          body  = `มีงานติดตั้ง (INS) จำนวน ${ins} รายการถูกจ่ายให้คุณแล้ว กรุณาตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานด้วยครับ`;
        } else if (as > 0 && ins === 0) {
          title = `🔧 งานบริการ (AS) ของคุณเข้าระบบ ${as} รายการ`;
          body  = `มีงานบริการ (AS) จำนวน ${as} รายการถูกจ่ายให้คุณแล้ว กรุณาตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานด้วยครับ`;
        } else {
          title = `📋 งานของคุณเข้าระบบ ${ins + as} รายการ`;
          body  = `INS ${ins} รายการ · AS ${as} รายการถูกจ่ายให้คุณแล้ว กรุณาตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานด้วยครับ`;
        }

        // Save notification to Firestore (per tech)
        const notifRef = await addDoc(collection(db, 'notifications'), {
          title,
          body,
          type: 'broadcast',
          category: 'announce',
          category_label: 'ประกาศทั่วไป',
          target: 'staff',
          created_by: currentUser?.username || currentUser?.name || 'admin',
          created_at: serverTimestamp(),
          sent: false,
          sent_count: 0,
        });

        await fetch('/api/push-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            url: '/notifications',
            serviceAccountJson: systemSettings.push_service_account,
            tokens: techTokens,
            notifId: notifRef.id,
          }),
        });

        totalDevicesSent += techTokens.length;
        techsNotified++;
      }

      if (techsNotified > 0) {
        showToast(`ส่งการแจ้งเตือนถึงช่าง ${techsNotified} คน (${totalDevicesSent} อุปกรณ์) สำเร็จ! 🔔`, "success");
      } else {
        showToast("ยังไม่มีช่างเทคนิคที่ลงทะเบียนรับการแจ้งเตือนครับ", "error");
      }

      setNotifySent(true);
    } catch (e: any) {
      console.error('[notify-staff]', e);
      showToast("ส่งการแจ้งเตือนล้มเหลว: " + e.message, "error");
    } finally {
      setSendingNotify(false);
    }
  };

  const triggerImportCommit = async () => {
    if (selectedImportIds.size === 0) return;
    
    const confirm = await showConfirm(
      "ยืนยันการนำเข้าข้อมูลคิวงานจ่าย",
      `คุณต้องการนำเข้ารายการงานติดตั้ง/งานบริการที่เลือกจำนวน ${selectedImportIds.size} รายการ ไปยังคิวงานจ่ายช่างเทคนิคหรือไม่?`
    );
    if (!confirm) return;

    setLoading(true);
    setLoadingText("กำลังบันทึกคิวงานจ่ายของช่างลงคลาวด์...");

    try {
      const db = getDb();
      const batch = writeBatch(db);
      
      const selectedJobs = parsedJobs.filter(j => j.job_id && selectedImportIds.has(j.job_id));

      selectedJobs.forEach(job => {
        const jobRef = doc(db, 'assigned_jobs', job.job_id!);
        batch.set(jobRef, {
          job_id: job.job_id,
          order_no: job.order_no || '-',
          customer_name: job.customer_name || 'ลูกค้าทั่วไป',
          job_type: job.job_type,
          sub_work_type: job.sub_work_type || '',
          assigned_to: job.assigned_to || '',
          status: 'pending',
          timestamp: new Date().toISOString(),
          submission_date: '-',
          file_url: '-',
          video_url: '-',
          note: '-'
        });
      });

      await batch.commit();
      showToast(`นำเข้างานจ่ายช่างจำนวน ${selectedJobs.length} รายการสำเร็จเรียบร้อย! 🚀`, "success");
      const insJobs = selectedJobs.filter(j => j.job_type === 'งานติดตั้ง (INS)');
      const asJobs  = selectedJobs.filter(j => j.job_type !== 'งานติดตั้ง (INS)');
      setLastImportedJobs(selectedJobs);
      setLastImportedInsCount(insJobs.length);
      setLastImportedAsCount(asJobs.length);
      setNotifyBannerVisible(true);
      setNotifySent(false);
      setParsedJobs([]);
      setSelectedImportIds(new Set());
      fetchCacheData();
    } catch (err: any) {
      console.error(err);
      showToast("นำเข้างานล้มเหลว: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ─── Tab 2: Legacy Sheet Dedup helpers ───────────────────────────────────

  /** Parse any row array + headers into LegacySheetRow objects */
  const parseLegacyRows = (rows: any[][]): LegacySheetRow[] => {
    if (rows.length < 2) return [];

    // Normalize headers (Thai, case-insensitive, trim whitespace)
    const rawHeaders = rows[0].map(h => String(h || "").trim());
    
    // Column finder — looks for substring match (Thai header)
    const findCol = (...keywords: string[]) => {
      const idx = rawHeaders.findIndex(h => {
        const lower = h.toLowerCase();
        return keywords.some(k => lower.includes(k.toLowerCase()));
      });
      return idx;
    };

    const dateIdx      = findCol('วันที่ส่ง', 'วันที่');
    const senderIdx    = findCol('ชื่อผู้ส่ง', 'ชื่อช่าง', 'ผู้ส่ง');
    const workTypeIdx  = findCol('ประเภทงาน', 'ประเภท');
    const fileNameIdx  = findCol('ชื่อไฟล์', 'ชื่อ ไฟล์');
    const fileLinkIdx  = findCol('ลิงก์ไฟล์', 'ลิงค์ไฟล์', 'link ไฟล์', 'ลิ้งไฟล์', 'ลิ้งค์ไฟล์');
    const videoLinkIdx = findCol('ลิงก์วิดีโอ', 'ลิ้งวิดีโอ', 'วิดีโอ', 'video');
    const noteIdx      = findCol('หมายเหตุ', 'note');
    const statusIdx    = findCol('สถานะ', 'status');

    const getCell = (row: any[], idx: number) =>
      idx !== -1 && row[idx] != null ? String(row[idx]).trim() : '';

    const result: LegacySheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c == null || String(c).trim() === '')) continue;

      const fileName = getCell(row, fileNameIdx);
      const fileLink = getCell(row, fileLinkIdx);

      result.push({
        rowIndex: i + 1,
        submissionDate: getCell(row, dateIdx),
        senderName:     getCell(row, senderIdx),
        workType:       getCell(row, workTypeIdx),
        fileName,
        fileLink,
        videoLink:      getCell(row, videoLinkIdx),
        note:           getCell(row, noteIdx),
        status:         getCell(row, statusIdx),
        orderTokens:    extractOrderTokens(fileName),
      });
    }
    return result;
  };

  /** Core matching: compare legacyRows against activeJobs (pending/any) */
  const matchLegacyAgainstFirebase = (legacyRows: LegacySheetRow[]): LegacyMatch[] => {
    // Build lookup maps from Firebase
    const jobByOrderNo = new Map<string, JobRow>(); // order_no → job
    const jobByJobId   = new Map<string, JobRow>(); // job_id  → job

    activeJobs.forEach(j => {
      if (j.status !== 'pending') return; // only check pending jobs
      if (j.job_id) jobByJobId.set(j.job_id.trim().toLowerCase(), j);
      if (j.order_no && j.order_no !== '-') jobByOrderNo.set(j.order_no.trim().toLowerCase(), j);
    });

    const matches: LegacyMatch[] = [];
    const seenFirebaseJobIds = new Set<string>();

    for (const row of legacyRows) {
      let matchedJob: JobRow | null = null;
      let matchReason = '';

      // 1. Try each numeric token from the filename
      for (const token of row.orderTokens) {
        const key = token.toLowerCase();
        if (jobByOrderNo.has(key)) {
          matchedJob = jobByOrderNo.get(key)!;
          matchReason = `order_no "${token}" ตรงกับเลขในชื่อไฟล์`;
          break;
        }
        if (jobByJobId.has(key)) {
          matchedJob = jobByJobId.get(key)!;
          matchReason = `job_id "${token}" ตรงกับเลขในชื่อไฟล์`;
          break;
        }
      }

      if (matchedJob && !seenFirebaseJobIds.has(matchedJob.job_id)) {
        seenFirebaseJobIds.add(matchedJob.job_id);
        matches.push({ sheetRow: row, firebaseJob: matchedJob, matchReason });
      }
    }

    return matches;
  };

  /** Process a File object for the dedup tab */
  const processDedupFile = (file: File) => {
    setLoading(true);
    setLoadingText("กำลังอ่านไฟล์ Google Sheet เก่า...");

    const reader = new FileReader();
    reader.onload = (ev) => {
      setTimeout(() => {
        try {
          let rows: any[][] = [];

          if (file.name.toLowerCase().endsWith('.csv')) {
            // Parse CSV
            const text = new TextDecoder('utf-8').decode(ev.target?.result as ArrayBuffer);
            rows = XLSX.utils.sheet_to_json(
              XLSX.read(text, { type: 'string' }).Sheets[XLSX.read(text, { type: 'string' }).SheetNames[0]],
              { header: 1 }
            ) as any[][];
          } else {
            // Parse Excel
            const data = new Uint8Array(ev.target?.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          }

          const legacyRows = parseLegacyRows(rows);
          if (legacyRows.length === 0) {
            showToast("ไม่พบข้อมูลในไฟล์ ตรวจสอบว่ามีหัวคอลัมน์ภาษาไทย (วันที่ส่ง, ชื่อไฟล์, ลิงก์ไฟล์) ❌", "error");
            setLoading(false);
            return;
          }

          const matches = matchLegacyAgainstFirebase(legacyRows);
          setLegacyMatches(matches);
          setDedupScanned(true);

          // Pre-select all matches for deletion
          const preSelected = new Set<string>(matches.map(m => m.firebaseJob.job_id));
          setSelectedDeleteIds(preSelected);

          showToast(
            matches.length > 0
              ? `ตรวจพบงานซ้ำ ${matches.length} รายการ จาก ${legacyRows.length} แถวในไฟล์`
              : `ไม่พบงานซ้ำ — ข้อมูลสะอาด! (สแกน ${legacyRows.length} แถว)`,
            matches.length > 0 ? "info" : "success"
          );
        } catch (err: any) {
          console.error(err);
          showToast("ไม่สามารถอ่านไฟล์ได้: " + err.message, "error");
        } finally {
          setLoading(false);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  };

  /** Fetch Google Sheet via published CSV export URL */
  const fetchSheetFromUrl = async () => {
    if (!sheetUrl.trim()) {
      showToast("กรุณากรอก URL ของ Google Sheet ก่อน", "error");
      return;
    }

    // Convert share URL to CSV export URL
    let csvUrl = sheetUrl.trim();
    const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      csvUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
    }

    setLoading(true);
    setLoadingText("กำลังดึงข้อมูลจาก Google Sheet...");

    try {
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} — Sheet ต้องตั้งเป็น "เผยแพร่สาธารณะ"`);
      const csvText = await res.text();
      const wb = XLSX.read(csvText, { type: 'string' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const legacyRows = parseLegacyRows(rows);
      if (legacyRows.length === 0) {
        showToast("ไม่พบข้อมูลในชีท ตรวจสอบว่ามีหัวคอลัมน์ภาษาไทย ❌", "error");
        setLoading(false);
        return;
      }

      const matches = matchLegacyAgainstFirebase(legacyRows);
      setLegacyMatches(matches);
      setDedupScanned(true);

      const preSelected = new Set<string>(matches.map(m => m.firebaseJob.job_id));
      setSelectedDeleteIds(preSelected);

      showToast(
        matches.length > 0
          ? `ตรวจพบงานซ้ำ ${matches.length} รายการ จาก ${legacyRows.length} แถว`
          : `ไม่พบงานซ้ำ — ข้อมูลสะอาด! (สแกน ${legacyRows.length} แถว)`,
        matches.length > 0 ? "info" : "success"
      );
    } catch (err: any) {
      console.error(err);
      showToast("ดึง Sheet ไม่ได้: " + err.message + " — ลองอัปโหลดไฟล์แทน", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleDeleteSelect = (jobId: string) => {
    const next = new Set(selectedDeleteIds);
    if (next.has(jobId)) { next.delete(jobId); } else { next.add(jobId); }
    setSelectedDeleteIds(next);
  };

  const toggleSelectAllDelete = () => {
    if (selectedDeleteIds.size === legacyMatches.length) {
      setSelectedDeleteIds(new Set());
    } else {
      setSelectedDeleteIds(new Set(legacyMatches.map(m => m.firebaseJob.job_id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedDeleteIds.size === 0) return;

    const confirmed = await showConfirm(
      "ยืนยันการลบงานที่ซ้ำ",
      `ต้องการลบงาน ${selectedDeleteIds.size} รายการออกจากคิวงานค้างส่งหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmed) return;

    setLoading(true);
    setLoadingText(`กำลังลบงานซ้ำ ${selectedDeleteIds.size} รายการ...`);

    try {
      const db = getDb();
      const idsToDelete = Array.from(selectedDeleteIds);
      const batchSize = 400;

      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const chunk = idsToDelete.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(jobId => {
          batch.delete(doc(db, 'assigned_jobs', jobId));
        });
        await batch.commit();
      }

      showToast(`ลบงานซ้ำ ${selectedDeleteIds.size} รายการสำเร็จ ✅`, "success");

      // Remove deleted items from UI
      const remaining = legacyMatches.filter(m => !selectedDeleteIds.has(m.firebaseJob.job_id));
      setLegacyMatches(remaining);
      setSelectedDeleteIds(new Set());
      fetchCacheData();
    } catch (err: any) {
      console.error(err);
      showToast("เกิดข้อผิดพลาดในการลบ: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8 overflow-y-auto pb-28 lg:pb-8">

        {/* ── Tab Switcher ── */}
        <div className="flex gap-1.5 mb-6 bg-slate-100/80 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 Prompt cursor-pointer ${
              activeTab === 'import'
                ? 'bg-white text-indigo-600 shadow-sm shadow-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            นำเข้างานใหม่
          </button>
          <button
            onClick={() => setActiveTab('dedup')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 Prompt cursor-pointer ${
              activeTab === 'dedup'
                ? 'bg-white text-rose-600 shadow-sm shadow-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ScanSearch className="w-3.5 h-3.5" />
            ตรวจงานซ้ำ (Sheet เก่า)
          </button>
        </div>

        {/* ════════════════════════════════════════
            TAB 1: Import New Jobs
        ════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {activeTab === 'import' && (
            <motion.div
              key="import"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* ── Notify-staff banner (shown after successful import) ── */}
              <AnimatePresence>
                {notifyBannerVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="mb-5 overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
                          <Bell className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-indigo-800 Prompt">
                            นำเข้างานสำเร็จ {lastImportedInsCount + lastImportedAsCount} รายการ
                            {lastImportedInsCount > 0 && lastImportedAsCount > 0 && (
                              <span className="ml-2 text-xs font-normal text-indigo-500">
                                (INS {lastImportedInsCount} · AS {lastImportedAsCount})
                              </span>
                            )}
                            {lastImportedInsCount > 0 && lastImportedAsCount === 0 && (
                              <span className="ml-2 text-xs font-normal text-indigo-500">📦 INS ทั้งหมด</span>
                            )}
                            {lastImportedAsCount > 0 && lastImportedInsCount === 0 && (
                              <span className="ml-2 text-xs font-normal text-indigo-500">🔧 AS ทั้งหมด</span>
                            )}
                          </p>
                          <p className="text-xs text-indigo-600 Sarabun mt-0.5">
                            ต้องการแจ้งเตือนช่างเทคนิคให้ตรวจสอบและอัปโหลดงานไหมครับ?
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {notifySent ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-100 border border-green-200 px-4 py-2 rounded-xl">
                            <CheckCircle2 className="w-4 h-4" />
                            ส่งแจ้งเตือนแล้ว
                          </span>
                        ) : (
                          <button
                            onClick={handleSendStaffNotify}
                            disabled={sendingNotify}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer Prompt"
                          >
                            {sendingNotify ? (
                              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังส่ง...</>
                            ) : (
                              <><Send className="w-3.5 h-3.5" /> แจ้งเตือนช่างทันที</>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setNotifyBannerVisible(false)}
                          className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Drag and Drop Zone */}
              <div className="relative group mb-8">
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border border-dashed rounded-[20px] p-16 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[320px] gap-2.5 ${
                    isDragOver 
                      ? 'border-[#007fff] bg-blue-50/20' 
                      : 'border-[#cedbe9] bg-white hover:border-[#a0b8d0]'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect}
                    accept=".xlsx, .xls"
                    className="hidden" 
                  />
                  <div className="relative flex items-center justify-center w-24 h-24 text-[#b9cde3] transition-transform duration-300 group-hover:scale-105">
                    <svg className="w-20 h-20 fill-current" viewBox="0 0 24 24">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                    </svg>
                  </div>
                  
                  <h3 className="text-base font-semibold text-slate-800 Prompt">ลากไฟล์มาที่นี่</h3>
                  <span className="text-slate-400 text-xs font-semibold Prompt">หรือ</span>
                  
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="bg-[#007fff] hover:bg-[#006bd6] text-white text-xs font-bold px-10 py-2.5 rounded-full transition-all duration-200 cursor-pointer active:scale-95 shadow-sm shadow-blue-100 Prompt"
                  >
                    เพิ่มไฟล์
                  </button>

                  <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider Prompt opacity-60">
                      รองรับหัวคอลัมน์มาตรฐาน: Install No / AS No และ CT Name
                    </span>
                  </div>
                </div>
              </div>

              {/* Parsed Jobs Preview Table */}
              <AnimatePresence>
                {parsedJobs.length > 0 && (
                  <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm mb-8"
                  >
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-5 bg-indigo-500 rounded-full" />
                        <div>
                          <h2 className="text-sm font-bold text-slate-800 Prompt">แสดงพรีวิวรายการประเมินผลไฟล์</h2>
                          <p className="text-xs text-slate-400 Sarabun">พบรายการงานทั้งหมด {parsedJobs.length} รายการ ตรวจคัดแยกรายการซ้ำซ้อนเรียบร้อยแล้ว</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleToggleSelectAllImport}
                          className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition Prompt cursor-pointer"
                        >
                          {parsedJobs.filter(j => j.duplicateAnalysis?.status !== 'duplicate').every(j => j.job_id && selectedImportIds.has(j.job_id))
                            ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกนำเข้าทั้งหมด'}
                        </button>

                        <button
                          onClick={triggerImportCommit}
                          disabled={selectedImportIds.size === 0}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition Prompt cursor-pointer"
                        >
                          📥 ยืนยันนำเข้าคิวจ่าย ({selectedImportIds.size} รายการ)
                        </button>
                        
                        <button
                          onClick={() => setParsedJobs([])}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[400px] border border-slate-100 rounded-2xl">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider Prompt sticky top-0 z-10">
                            <th className="p-4 pl-6 text-center w-12 bg-slate-50">เลือก</th>
                            <th className="p-4 bg-slate-50">รหัสงาน</th>
                            <th className="p-4 bg-slate-50">ประเภทงาน</th>
                            <th className="p-4 bg-slate-50">ชื่อลูกค้า</th>
                            <th className="p-4 bg-slate-50">ช่างผู้รับผิดชอบ</th>
                            <th className="p-4 bg-slate-50">ผลการวิเคราะห์สิทธิ์</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 Sarabun">
                          {parsedJobs.map((job) => {
                            const isDup = job.duplicateAnalysis?.status === 'duplicate';
                            const isWarn = job.duplicateAnalysis?.status === 'pending_active' || job.duplicateAnalysis?.status === 'history_active';
                            const hasBadTech = !job.is_matched;

                            return (
                              <tr key={job.job_id} className={`hover:bg-slate-50/50 transition ${isDup ? 'bg-rose-50/10' : ''}`}>
                                <td className="p-4 pl-6 text-center">
                                  <input
                                    type="checkbox"
                                    checked={!!job.job_id && selectedImportIds.has(job.job_id)}
                                    onChange={() => job.job_id && handleToggleImportSelect(job.job_id)}
                                    disabled={isDup}
                                    className="w-4.5 h-4.5 border border-slate-300 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="p-4 font-bold text-slate-800">{job.job_id}</td>
                                <td className="p-4 font-bold">
                                  <span className={
                                    job.job_type?.includes('ติดตั้ง') ? 'text-indigo-600' :
                                    job.job_type?.includes('ซ่อม') ? 'text-emerald-600' :
                                    'text-purple-600'
                                  }>
                                    {job.job_type}
                                  </span>
                                </td>
                                <td className="p-4 font-bold text-slate-700">{job.customer_name}</td>
                                <td className="p-4">
                                  <div>
                                    <p className="font-bold text-slate-800 Prompt">{job.assigned_to}</p>
                                    {hasBadTech && (
                                      <span className="text-[9px] text-rose-500 font-bold flex items-center gap-1 mt-0.5 leading-none">
                                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                                        <span>ไม่ตรงกับชื่อช่างในระบบ</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4 whitespace-nowrap">
                                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] Prompt ${
                                    isDup ? 'bg-rose-50 border border-rose-200 text-rose-600' :
                                    isWarn ? 'bg-amber-50 border border-amber-200 text-amber-600' :
                                    'bg-emerald-50 border border-emerald-200 text-emerald-600'
                                  }`}>
                                    {job.duplicateAnalysis?.message}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              TAB 2: Legacy Sheet Dedup
          ════════════════════════════════════════ */}
          {activeTab === 'dedup' && (
            <motion.div
              key="dedup"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6">
                <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-700 Prompt">วิธีใช้เครื่องมือนี้</p>
                  <p className="text-[11px] text-amber-600 Sarabun mt-0.5 leading-relaxed">
                    อัปโหลดไฟล์ Excel/CSV ที่ Export จาก Google Sheet เก่า หรือวาง URL ของ Sheet ที่เปิดสาธารณะ
                    ระบบจะดึงเลขออเดอร์จากชื่อไฟล์ (เช่น <span className="font-bold">8000550269</span>กรกนก จันเบี้ยวล.pdf) 
                    แล้วจับคู่กับงาน pending ในระบบเพื่อเลือกลบ
                  </p>
                </div>
              </div>

              {/* Input section: File upload OR URL */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                
                {/* Left: File upload */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDedupDragOver(true); }}
                  onDragLeave={() => setIsDedupDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setIsDedupDragOver(false);
                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) processDedupFile(files[0]);
                  }}
                  onClick={() => dedupFileInputRef.current?.click()}
                  className={`relative border border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 min-h-[180px] ${
                    isDedupDragOver
                      ? 'border-rose-400 bg-rose-50/30'
                      : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/10'
                  }`}
                >
                  <input
                    type="file"
                    ref={dedupFileInputRef}
                    onChange={(e) => { if (e.target.files?.[0]) processDedupFile(e.target.files[0]); }}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700 Prompt">อัปโหลดไฟล์ Google Sheet เก่า</p>
                    <p className="text-[10px] text-slate-400 Sarabun mt-0.5">รองรับ .xlsx, .xls, .csv — ลากวางได้เลย</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); dedupFileInputRef.current?.click(); }}
                    className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-full transition cursor-pointer active:scale-95 Prompt"
                  >
                    เลือกไฟล์
                  </button>
                </div>

                {/* Right: Google Sheet URL */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="w-4 h-4 text-slate-400" />
                      <p className="text-xs font-bold text-slate-700 Prompt">หรือวาง Google Sheet URL</p>
                    </div>
                    <p className="text-[10px] text-slate-400 Sarabun mb-3 leading-relaxed">
                      Sheet ต้องตั้งเป็น &quot;เผยแพร่สู่เว็บ&quot; (ไฟล์ → เผยแพร่สู่เว็บ → CSV)
                    </p>
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-rose-400 transition Sarabun"
                    />
                  </div>
                  <button
                    onClick={fetchSheetFromUrl}
                    disabled={!sheetUrl.trim()}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition cursor-pointer active:scale-[0.99] Prompt"
                  >
                    <ScanSearch className="w-3.5 h-3.5" />
                    ดึงข้อมูลและตรวจสอบ
                  </button>
                </div>
              </div>

              {/* Results */}
              <AnimatePresence>
                {dedupScanned && (
                  <motion.section
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm"
                  >
                    {legacyMatches.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                          <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 Prompt">ไม่พบงานซ้ำ!</p>
                        <p className="text-xs text-slate-400 Sarabun">คิวงานค้างส่งสะอาด ไม่มีงานที่ตรงกับ Google Sheet เก่า</p>
                      </div>
                    ) : (
                      <>
                        {/* Header row */}
                        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-5 bg-rose-500 rounded-full" />
                            <div>
                              <h2 className="text-sm font-bold text-slate-800 Prompt">รายการงานซ้ำที่ตรวจพบ</h2>
                              <p className="text-xs text-slate-400 Sarabun">
                                พบ <span className="font-bold text-rose-500">{legacyMatches.length}</span> รายการที่ตรงกับคิวงานค้างส่งปัจจุบัน
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={toggleSelectAllDelete}
                              className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition Prompt cursor-pointer"
                            >
                              {selectedDeleteIds.size === legacyMatches.length ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                            </button>

                            <button
                              onClick={handleDeleteSelected}
                              disabled={selectedDeleteIds.size === 0}
                              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400/50 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-100 transition Prompt cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              ลบที่เลือก ({selectedDeleteIds.size} รายการ)
                            </button>

                            <button
                              onClick={() => { setDedupScanned(false); setLegacyMatches([]); setSelectedDeleteIds(new Set()); }}
                              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* Matches table */}
                        <div className="overflow-x-auto border border-slate-100 rounded-2xl max-h-[520px]">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider Prompt sticky top-0 z-10">
                                <th className="p-3 pl-5 text-center w-10 bg-slate-50">ลบ</th>
                                <th className="p-3 bg-slate-50">รหัสงาน (Firebase)</th>
                                <th className="p-3 bg-slate-50">เลขออเดอร์</th>
                                <th className="p-3 bg-slate-50">ช่างเทคนิค</th>
                                <th className="p-3 bg-slate-50">วันที่ส่งเก่า</th>
                                <th className="p-3 bg-slate-50">ชื่อไฟล์เก่า</th>
                                <th className="p-3 bg-slate-50 text-center">ไฟล์ / วิดีโอ</th>
                                <th className="p-3 bg-slate-50">เหตุผลที่จับคู่</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700 Sarabun">
                              {legacyMatches.map((match, idx) => {
                                const job = match.firebaseJob;
                                const row = match.sheetRow;
                                const isChecked = selectedDeleteIds.has(job.job_id);
                                const hasFile = row.fileLink && row.fileLink.startsWith('http');
                                const hasVideo = row.videoLink && row.videoLink.startsWith('http');

                                return (
                                  <tr
                                    key={`${job.job_id}-${idx}`}
                                    className={`hover:bg-slate-50/50 transition ${isChecked ? 'bg-rose-50/20' : ''}`}
                                  >
                                    <td className="p-3 pl-5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleDeleteSelect(job.job_id)}
                                        className="w-4 h-4 border border-rose-300 rounded text-rose-500 focus:ring-rose-400 cursor-pointer accent-rose-500"
                                      />
                                    </td>
                                    <td className="p-3">
                                      <span className="font-bold text-slate-800 Prompt">{job.job_id}</span>
                                      <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                        job.status === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-500'
                                      }`}>{job.status}</span>
                                    </td>
                                    <td className="p-3 font-mono text-slate-600 text-[11px]">
                                      {job.order_no && job.order_no !== '-' ? job.order_no : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-700 Prompt text-[11px] truncate max-w-[130px]" title={job.assigned_to}>
                                        {job.assigned_to?.split('-').pop()?.trim() || job.assigned_to}
                                      </div>
                                    </td>
                                    <td className="p-3 text-slate-500 whitespace-nowrap">
                                      {row.submissionDate || <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="p-3 max-w-[180px]">
                                      <p className="text-slate-600 text-[10px] truncate" title={row.fileName}>{row.fileName || '—'}</p>
                                      {row.orderTokens.length > 0 && (
                                        <span className="text-[9px] text-indigo-400 font-mono">#{row.orderTokens.join(', ')}</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {hasFile ? (
                                          <a
                                            href={row.fileLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="เปิดไฟล์"
                                            className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-lg text-[9px] font-bold transition cursor-pointer"
                                          >
                                            <FileText className="w-3 h-3" />
                                            ไฟล์
                                          </a>
                                        ) : (
                                          <span className="text-[9px] text-slate-300 font-bold">ไม่มีไฟล์</span>
                                        )}
                                        {hasVideo && (
                                          <a
                                            href={row.videoLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="เปิดวิดีโอ"
                                            className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-600 rounded-lg text-[9px] font-bold transition cursor-pointer"
                                          >
                                            <Video className="w-3 h-3" />
                                            VDO
                                          </a>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-3">
                                      <span className="text-[10px] text-slate-500 Sarabun">{match.matchReason}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
