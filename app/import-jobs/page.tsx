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
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function ImportJobsPage() {
  const { showToast, showConfirm, setLoading, setLoadingText, systemSettings } = useApp();
  
  // Data caches
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([]);
  const [historyData, setHistoryData] = useState<SubmissionData[]>([]);
  const [dbUsers, setDbUsers] = useState<UserData[]>([]);
  
  // Import File States
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCacheData = async () => {
    try {
      const db = getDb();
      
      // 1. Fetch assigned_jobs
      const jobsSnap = await getDocs(query(collection(db, 'assigned_jobs'), orderBy('timestamp', 'desc')));
      const jobsList: JobRow[] = [];
      jobsSnap.forEach(docSnap => {
        jobsList.push(docSnap.data() as JobRow);
      });
      setActiveJobs(jobsList);

      // 2. Fetch history (submissions)
      const subSnap = await getDocs(collection(db, 'submissions'));
      const subList: SubmissionData[] = [];
      subSnap.forEach(docSnap => {
        subList.push(docSnap.data() as SubmissionData);
      });
      setHistoryData(subList);

      // 3. Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserData[] = [];
      usersSnap.forEach(docSnap => {
        usersList.push(docSnap.data() as UserData);
      });
      setDbUsers(usersList);

    } catch (err: any) {
      console.error(err);
      showToast("ดึงคิวงานขัดข้อง กรุณาลองรีเฟรชข้อมูลคลาวด์ครับ ⚠️", "error");
    }
  };

  useEffect(() => {
    fetchCacheData();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  };

  const processExcelFile = (file: File) => {
    setLoading(true);
    setLoadingText("กำลังอ่านโครงสร้างไฟล์ Excel...");
    
    const reader = new FileReader();
    reader.onload = (e) => {
      // Defer processing to let the browser paint the loading state first
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

          activeJobs.forEach(j => {
            if (j.job_id) activeJobsById.set(j.job_id.trim().toLowerCase(), j);
            if (j.order_no) activeJobsByOrderNo.set(j.order_no.trim().toLowerCase(), j);
          });

          historyData.forEach(h => {
            if (h.job_id) historyById.set(h.job_id.trim().toLowerCase(), h);
            if (h.order_no) historyByOrderNoOrFile.set(h.order_no.trim().toLowerCase(), h);
            if (h.file_name) {
              const tokens = h.file_name.split(/[\s_.-]+/);
              for (const token of tokens) {
                if (token && token.length >= 4) {
                  historyByOrderNoOrFile.set(token.trim().toLowerCase(), h);
                }
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
              if (activeOrderNoMatch || historyOrderNoMatch) {
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำเลขออเดอร์ติดตั้งเดิม (ข้าม)', matchedItem: activeOrderNoMatch || historyOrderNoMatch };
              }
              return { duplicate: false, status: 'new', message: '✨ งานติดตั้งใหม่' };
            } else {
              if (activeJobIdMatch || historyJobIdMatch) {
                return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำรหัสงานบริการเดิม (ข้าม)', matchedItem: activeJobIdMatch || historyJobIdMatch };
              }
              if (activeOrderNoMatch) {
                return { 
                  duplicate: false, 
                  warning: true, 
                  status: 'pending_active', 
                  message: `⚠️ มีงานค้างในคิวช่าง (${activeOrderNoMatch.assigned_to})`, 
                  matchedItem: activeOrderNoMatch 
                };
              }
              if (historyOrderNoMatch) {
                const dateStr = historyOrderNoMatch.submission_date 
                  ? new Date(historyOrderNoMatch.submission_date).toLocaleDateString('th-TH') 
                  : 'ไม่ระบุวันที่';
                const prevFileName = historyOrderNoMatch.file_name || 'ใบงานเดิม';
                return { 
                  duplicate: false, 
                  warning: true, 
                  status: 'history_active', 
                  message: `🔍 พบประวัติเดิม: ${prevFileName} (${dateStr})`, 
                  matchedItem: historyOrderNoMatch 
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

              tempParsed.push({
                ...jobRow,
                duplicateAnalysis: dupAnalysis
              });
            }
          } else {
            // AS File Type
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

              tempParsed.push({
                ...jobRow,
                duplicateAnalysis: dupAnalysis
              });
            }
          }

          setParsedJobs(tempParsed);

          // Preselect all non-duplicate items
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
    if (next.has(jobId)) {
      next.delete(jobId);
    } else {
      next.add(jobId);
    }
    setSelectedImportIds(next);
  };

  const handleToggleSelectAllImport = () => {
    const importable = parsedJobs.filter(j => j.duplicateAnalysis?.status !== 'duplicate');
    const allSelected = importable.every(j => j.job_id && selectedImportIds.has(j.job_id));
    
    if (allSelected) {
      // Clear all
      setSelectedImportIds(new Set());
    } else {
      // Select all non-duplicates
      const next = new Set<string>();
      importable.forEach(j => {
        if (j.job_id) next.add(j.job_id);
      });
      setSelectedImportIds(next);
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
      setParsedJobs([]);
      setSelectedImportIds(new Set());
      
      // Reload daily queue
      fetchCacheData();
    } catch (err: any) {
      console.error(err);
      showToast("นำเข้างานล้มเหลว: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 Prompt">นำเข้างานและจ่ายงานช่าง</h1>
          <p className="text-sm text-slate-500 Sarabun">ลากและวางไฟล์ตาราง Excel จากส่วนกลางเพื่อจัดตารางสั่งจ่ายงานช่าง</p>
        </header>

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
            {/* Cloud Icon from image */}
            <div className="relative flex items-center justify-center w-24 h-24 text-[#b9cde3] transition-transform duration-300 group-hover:scale-105">
              <svg className="w-20 h-20 fill-current" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
              </svg>
            </div>
            
            <h3 className="text-base font-semibold text-slate-800 Prompt">
              ลากไฟล์มาที่นี่
            </h3>
            
            <span className="text-slate-400 text-xs font-semibold Prompt">
              หรือ
            </span>
            
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="bg-[#007fff] hover:bg-[#006bd6] text-white text-xs font-bold px-10 py-2.5 rounded-full transition-all duration-200 cursor-pointer active:scale-95 shadow-sm shadow-blue-100 Prompt"
            >
              เพิ่มไฟล์
            </button>

            {/* Subtle disclaimer overlay at the bottom for instructions */}
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

              {/* Preview table overflow wrapper */}
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
                      const isNew = job.duplicateAnalysis?.status === 'new';
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


      </main>
    </div>
  );
}
