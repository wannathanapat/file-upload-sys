'use client';

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import Sidebar from '@/components/sidebar';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '../providers';
import { getDb } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import type { JobRow, SubmissionData } from '@/lib/utils';
import { formatThaiDate, isNativeVideo, getDirectStreamUrl, getPreviewUrl, getFileIdFromUrl } from '@/lib/utils';
import { 
  FileText, 
  Upload, 
  Video, 
  CheckCircle2, 
  Clock, 
  FileUp, 
  ExternalLink,
  ChevronRight,
  Info,
  ScanLine,
  History,
  LayoutDashboard,
  Zap,
  RefreshCw,
  X,
  XCircle,
  MapPin,
  Truck,
  FileImage,
  Users,
  Search,
  Filter,
  ChevronDown,
  Eye,
  Edit3,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getOrCreateTargetUploadFolder, 
  directUploadToGDrive, 
  getMimeTypeFromExt,
  getValidAccessToken
} from '@/lib/gdrive';
import { sendTelegramDirect } from '@/lib/telegram';
import { convertImagesToPdf, compressPdfFile } from '@/lib/image-pdf';
import CustomPdfViewer from '@/components/CustomPdfViewer';

const ImagePreview = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return (
    <div className="relative aspect-square group rounded-xl overflow-hidden border border-slate-200/60 bg-white shadow-xs">
      <img
        src={url}
        alt="preview"
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-5.5 h-5.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

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

function SubmitPageInner() {
  const { currentUser, showToast, showConfirm, systemSettings, gdrivePrefs, setLoading, setLoadingText } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'dashboard';

  // Data lists
  const [assignedJobs, setAssignedJobs] = useState<JobRow[]>([]);
  const [personalHistory, setPersonalHistory] = useState<SubmissionData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // States for Queue Search & Filter
  const [queueSearch, setQueueSearch] = useState('');
  const [isQueueSearchExpanded, setIsQueueSearchExpanded] = useState(false);
  const [showQueueFilterPanel, setShowQueueFilterPanel] = useState(false);
  const [queueTypeFilter, setQueueTypeFilter] = useState('');
  const queueSearchInputRef = useRef<HTMLInputElement>(null);

  // States for History Search & Filter
  const [historySearch, setHistorySearch] = useState('');
  const [isHistorySearchExpanded, setIsHistorySearchExpanded] = useState(false);
  const [showHistoryFilterPanel, setShowHistoryFilterPanel] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const historySearchInputRef = useRef<HTMLInputElement>(null);

  // Computed filtered lists
  const filteredQueue = assignedJobs.filter(job => {
    const q = queueSearch.toLowerCase();
    const matchSearch = 
      (job.job_id && job.job_id.toLowerCase().includes(q)) ||
      (job.customer_name && job.customer_name.toLowerCase().includes(q)) ||
      (job.order_no && job.order_no.toLowerCase().includes(q));

    let matchType = true;
    if (queueTypeFilter) {
      if (queueTypeFilter === 'งานติดตั้ง (INS)') {
        matchType = !job.job_type.includes('ถอด') && !job.job_type.includes('ซ่อม');
      } else if (queueTypeFilter === 'งานถอดติดตั้ง (AS)') {
        matchType = job.job_type.includes('ถอด');
      } else if (queueTypeFilter === 'งานซ่อม (AS)') {
        matchType = job.job_type.includes('ซ่อม');
      }
    }

    return matchSearch && matchType;
  });

  const filteredHistory = personalHistory.filter(item => {
    const q = historySearch.toLowerCase();
    const matchSearch = 
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.work_type && item.work_type.toLowerCase().includes(q)) ||
      (item.file_name && item.file_name.toLowerCase().includes(q)) ||
      (item.job_id && item.job_id.toLowerCase().includes(q)) ||
      (item.order_no && item.order_no.toLowerCase().includes(q));

    const matchType = !historyTypeFilter || item.work_type === historyTypeFilter;
    const itemStatus = item.status || 'รอตรวจ';
    const matchStatus = !historyStatusFilter || itemStatus === historyStatusFilter;

    let matchDate = true;
    if (historyDateFrom || historyDateTo) {
      try {
        const itemDateStr = new Date(item.submission_date).toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (historyDateFrom && itemDateStr < historyDateFrom) matchDate = false;
        if (historyDateTo && itemDateStr > historyDateTo) matchDate = false;
      } catch (_) {
        matchDate = false;
      }
    }

    return matchSearch && matchType && matchStatus && matchDate;
  });


  // States for Admin/Auditor to submit on behalf of tech
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [selectedTech, setSelectedTech] = useState<string>('');

  const isAdminOrAuditor = currentUser?.role === 'admin' || currentUser?.role === 'auditor';
  const targetTechName = (isAdminOrAuditor ? selectedTech : currentUser?.name?.trim()) || '';

  // Statistics for Technician Dashboard
  const totalPersonal = personalHistory.length;
  const approvedPersonal = personalHistory.filter(s => s.status === 'ตรวจแล้ว').length;
  const pendingPersonal = personalHistory.filter(s => s.status === 'รอตรวจ' || !s.status).length;
  const rejectedPersonal = personalHistory.filter(s => s.status === 'แก้ไข').length;
  const approvalRate = totalPersonal > 0 ? Math.round((approvedPersonal / totalPersonal) * 100) : 0;

  // Submission Form Modal state
  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  
  // History Detail & Fix Modal state
  const [selectedHistory, setSelectedHistory] = useState<SubmissionData | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ type: 'pdf' | 'video', url: string, name: string } | null>(null);
  const [fixPdfFile, setFixPdfFile] = useState<File | null>(null);
  const [fixImageFiles, setFixImageFiles] = useState<File[]>([]);
  const [fixVideoFile, setFixVideoFile] = useState<File | null>(null);
  const fixFileInputRef = useRef<HTMLInputElement>(null);
  const fixImageInputRef = useRef<HTMLInputElement>(null);
  const fixVideoInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [insStatus, setInsStatus] = useState<'success' | 'fail' | null>(null);
  const [failDetail, setFailDetail] = useState<'entered' | 'not_entered' | null>(null);
  const [dismantleSub, setDismantleSub] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // Upload progress indicators
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStepName, setUploadStepName] = useState('');

  // PDF Compression states
  const [isCompressingPdf, setIsCompressingPdf] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);

  const fetchJobs = async () => {
    if (!currentUser) return;
    
    // For admin/auditor, if they haven't selected a tech, don't query
    if (isAdminOrAuditor && !selectedTech) {
      setAssignedJobs([]);
      setPersonalHistory([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    try {
      const db = getDb();
      const techToQuery = targetTechName || '';
      
      // 1. Fetch pending assigned jobs for this tech
      const jobsSnap = await getDocs(
        query(
          collection(db, 'assigned_jobs'), 
          where('assigned_to', '==', techToQuery),
          where('status', '==', 'pending')
        )
      );
      const jobsList: JobRow[] = [];
      jobsSnap.forEach(docSnap => {
        jobsList.push(docSnap.data() as JobRow);
      });
      setAssignedJobs(jobsList);

      // 2. Fetch personal history of submissions
      const historySnap = await getDocs(
        query(
          collection(db, 'submissions'),
          where('name', '==', techToQuery)
        )
      );
      const historyList: SubmissionData[] = [];
      historySnap.forEach(docSnap => {
        historyList.push(docSnap.data() as SubmissionData);
      });
      // Sort desc by date
      historyList.sort((a, b) => new Date(b.submission_date).getTime() - new Date(a.submission_date).getTime());
      setPersonalHistory(historyList);

    } catch (err: any) {
      console.error(err);
      showToast("ดึงข้อมูลงานขัดข้อง กรุณาลองใหม่อีกครั้งครับ ⚠️", "error");
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    const fetchTechs = async () => {
      if (currentUser?.role === 'admin' || currentUser?.role === 'auditor') {
        try {
          const db = getDb();
          const usersSnap = await getDocs(query(collection(db, 'users')));
          const techList: string[] = [];
          usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.role === 'staff' && u.name) {
              techList.push(u.name);
            }
          });
          setTechnicians(techList);
        } catch (e) {
          console.error("Error fetching technicians:", e);
        }
      }
    };
    fetchTechs();
  }, [currentUser]);

  useEffect(() => {
    fetchJobs();
  }, [currentUser, selectedTech]);

  const openSubmitModal = (job: JobRow) => {
    setActiveJob(job);
    setInsStatus(null);
    setFailDetail(null);
    setDismantleSub(null);
    setNote('');
    setPdfFile(null);
    setImageFiles([]);
    setVideoFile(null);
  };

  const closeSubmitModal = () => {
    setActiveJob(null);
  };

  const openHistoryModal = (item: SubmissionData) => {
    setSelectedHistory(item);
    setIsFixing(false);
    setFixPdfFile(null);
    setFixImageFiles([]);
    setFixVideoFile(null);
  };

  const closeHistoryModal = () => {
    setSelectedHistory(null);
    setIsFixing(false);
    setFixPdfFile(null);
    setFixImageFiles([]);
    setFixVideoFile(null);
  };

  const handleFixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHistory) return;
    
    if (!fixPdfFile && fixImageFiles.length === 0) {
      showToast("กรุณาเลือกไฟล์ PDF หรือรูปภาพใหม่เพื่อส่งแก้ไข ⚠️", "error");
      return;
    }

    if (!gdrivePrefs?.connected) {
      showToast("กรุณาตรวจสอบการตั้งค่าการเชื่อมต่อ Google Drive ⚠️", "error");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);
      setUploadStepName("กำลังขอสิทธิ์เชื่อมต่อ Drive...");
      
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        showToast("ไม่สามารถเชื่อมต่อ Google Drive ได้ กรุณาเชื่อมต่อบัญชีใหม่", "error");
        setIsUploading(false);
        return;
      }

      setUploadProgress(20);
      setUploadStepName("กำลังเตรียมจัดสรรโฟลเดอร์...");

      const workCat = selectedHistory.work_type;
      const baseOrderNo = selectedHistory.order_no && selectedHistory.order_no !== '-' ? selectedHistory.order_no : selectedHistory.job_id.replace(/^(INS|AS)-/i, '');
      const cleanCustomerName = selectedHistory.file_name.replace(baseOrderNo, '').replace('.pdf', '').trim();
      const folderNameForGDrive = `${baseOrderNo} ${cleanCustomerName}.pdf`;
      
      const targetFolderId = await getOrCreateTargetUploadFolder(
        accessToken, 
        workCat, 
        folderNameForGDrive, 
        selectedHistory.sub_work_type || ""
      );

      let pdfUrl = '-';
      let renamedPdfName = selectedHistory.file_name;
      let fileToUpload: File | null = fixPdfFile;

      if (fixImageFiles.length > 0) {
        setUploadProgress(30);
        setUploadStepName("กำลังแปลงรูปภาพและบีบอัดเป็นไฟล์ PDF...");
        const pdfBlob = await convertImagesToPdf(fixImageFiles, (current, total) => {
          setUploadStepName(`กำลังแปลงรูปภาพเป็น PDF (${current}/${total} รูป)...`);
          setUploadProgress(30 + Math.round((current / total) * 10));
        });
        fileToUpload = new File([pdfBlob], renamedPdfName, { type: 'application/pdf' });
      }

      if (fileToUpload) {
        setUploadProgress(50);
        setUploadStepName(`กำลังอัปโหลดไฟล์แก้ไข: ${renamedPdfName}...`);
        const pdfUploadRes = await directUploadToGDrive(accessToken, fileToUpload, targetFolderId, renamedPdfName);
        pdfUrl = pdfUploadRes.url;
      }

      let videoUrl = selectedHistory.video_url || '-';
      let renamedVideoName = selectedHistory.video_name || '-';

      if (fixVideoFile) {
        setUploadProgress(70);
        const vidExt = fixVideoFile.name.substring(fixVideoFile.name.lastIndexOf('.'));
        renamedVideoName = `${baseOrderNo} ${cleanCustomerName}${vidExt}`;
        setUploadStepName(`กำลังอัปโหลดวิดีโอใหม่: ${renamedVideoName}...`);
        const videoUploadRes = await directUploadToGDrive(accessToken, fixVideoFile, targetFolderId, renamedVideoName);
        videoUrl = videoUploadRes.url;
      }

      setUploadProgress(85);
      setUploadStepName("กำลังลบไฟล์ต้นฉบับเก่าเพื่อประหยัดพื้นที่...");
      
      if (selectedHistory.file_url && selectedHistory.file_url.includes('id=')) {
        const oldFileId = selectedHistory.file_url.match(/id=([^&]+)/)?.[1];
        if (oldFileId) {
           await fetch('/api/gdrive/delete', { 
             method: 'POST', 
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ fileId: oldFileId }) 
           }).catch(console.error);
        }
      }
      
      if (fixVideoFile && selectedHistory.video_url && selectedHistory.video_url.includes('id=')) {
        const oldVidId = selectedHistory.video_url.match(/id=([^&]+)/)?.[1];
        if (oldVidId) {
           await fetch('/api/gdrive/delete', { 
             method: 'POST', 
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ fileId: oldVidId }) 
           }).catch(console.error);
        }
      }

      setUploadProgress(95);
      setUploadStepName("กำลังบันทึกข้อมูล...");

      const db = getDb();
      const updatedData = {
        file_url: pdfUrl !== '-' ? pdfUrl : selectedHistory.file_url,
        video_url: videoUrl,
        video_name: renamedVideoName,
        status: 'รอตรวจ',
        reject_reason: ''
      };

      await updateDoc(doc(db, 'submissions', selectedHistory.submission_date), updatedData);

      setUploadProgress(100);
      setUploadStepName("บันทึกการแก้ไขสำเร็จ!");
      
      setTimeout(() => {
        setIsUploading(false);
        closeHistoryModal();
        showToast("ส่งงานแก้ไขสำเร็จ! รอแอดมินตรวจสอบอีกครั้ง ✨", "success");
        fetchJobs();
      }, 800);

    } catch (err: any) {
      console.error(err);
      setIsUploading(false);
      showToast("พบข้อผิดพลาด: " + err.message, "error");
    }
  };

  const handleDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check if any file is a PDF
    const hasPdf = Array.from(files).some(file => file.type === 'application/pdf');

    if (hasPdf) {
      const pdf = Array.from(files).find(file => file.type === 'application/pdf');
      if (pdf) {
        const sizeMB = pdf.size / (1024 * 1024);
        const limit = systemSettings.max_size_pdf || 20;
        if (sizeMB > limit) {
          const confirm = await showConfirm(
            "ไฟล์เอกสารมีขนาดใหญ่เกินไป",
            `ไฟล์ PDF ของคุณมีขนาด ${sizeMB.toFixed(2)}MB ซึ่งเกินขีดจำกัดที่กำหนด (${limit}MB) คุณต้องการให้ระบบช่วยบีบอัดไฟล์ PDF นี้ให้อัตโนมัติเพื่อให้ขนาดเล็กลงและส่งงานได้หรือไม่?`,
            { okText: "บีบอัดไฟล์อัตโนมัติ", cancelText: "ยกเลิก" }
          );
          
          if (confirm) {
            setIsCompressingPdf(true);
            setCompressProgress(0);
            
            // We use setTimeout to let the UI update and show the spinner before launching the compression
            setTimeout(async () => {
              try {
                const compressed = await compressPdfFile(pdf, 0.6, 1.5, (current, total) => {
                  setCompressProgress(Math.round((current / total) * 100));
                });
                
                const compressedSizeMB = compressed.size / (1024 * 1024);
                if (compressedSizeMB > limit) {
                  showToast(`บีบอัดแล้วขนาดไฟล์ยังเกินกำหนด (${compressedSizeMB.toFixed(2)}MB) กรุณาลดจำนวนหน้าลงครับ`, "error");
                } else {
                  setPdfFile(compressed);
                  setImageFiles([]);
                  showToast(`บีบอัดไฟล์ PDF สำเร็จ! ขนาดลดลงเหลือ ${compressedSizeMB.toFixed(2)}MB ✨`, "success");
                }
              } catch (err: any) {
                console.error(err);
                showToast("การบีบอัดไฟล์ขัดข้อง: " + err.message, "error");
              } finally {
                setIsCompressingPdf(false);
              }
            }, 300);
          }
          return;
        }
        setPdfFile(pdf);
        setImageFiles([]);
      }
    } else {
      const incomingImages = Array.from(files).filter(file => file.type.startsWith('image/'));
      if (incomingImages.length === 0) {
        showToast("กรุณาเลือกไฟล์ PDF หรือรูปภาพเท่านั้นครับ 📄📸", "error");
        return;
      }

      const totalCount = imageFiles.length + incomingImages.length;
      if (totalCount > 20) {
        showToast("คุณสามารถอัปโหลดรูปภาพได้สูงสุด 20 รูปครับ ⚠️", "error");
        const remainingSlots = 20 - imageFiles.length;
        if (remainingSlots > 0) {
          const allowedImages = incomingImages.slice(0, remainingSlots);
          setImageFiles(prev => [...prev, ...allowedImages]);
          setPdfFile(null);
        }
        return;
      }

      setImageFiles(prev => [...prev, ...incomingImages]);
      setPdfFile(null);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > (systemSettings.max_size_video || 50)) {
        showToast(`ไฟล์วิดีโอของคุณมีขนาด ${sizeMB.toFixed(2)}MB ซึ่งเกินขีดจำกัดที่กำหนด (${systemSettings.max_size_video || 50}MB)`, "error");
        return;
      }
      setVideoFile(file);
    }
  };

  const handleFixDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const hasPdf = Array.from(files).some(file => file.type === 'application/pdf');

    if (hasPdf) {
      const pdf = Array.from(files).find(file => file.type === 'application/pdf');
      if (pdf) {
        const sizeMB = pdf.size / (1024 * 1024);
        const limit = systemSettings.max_size_pdf || 20;
        if (sizeMB > limit) {
          const confirm = await showConfirm(
            "ไฟล์เอกสารมีขนาดใหญ่เกินไป",
            `ไฟล์ PDF ของคุณมีขนาด ${sizeMB.toFixed(2)}MB ซึ่งเกินขีดจำกัดที่กำหนด (${limit}MB) คุณต้องการให้ระบบช่วยบีบอัดไฟล์ PDF นี้ให้อัตโนมัติเพื่อให้ขนาดเล็กลงและส่งงานได้หรือไม่?`,
            { okText: "บีบอัดไฟล์อัตโนมัติ", cancelText: "ยกเลิก" }
          );
          
          if (confirm) {
            setIsCompressingPdf(true);
            setCompressProgress(0);
            
            setTimeout(async () => {
              try {
                const compressed = await compressPdfFile(pdf, 0.6, 1.5, (current, total) => {
                  setCompressProgress(Math.round((current / total) * 100));
                });
                
                const compressedSizeMB = compressed.size / (1024 * 1024);
                if (compressedSizeMB > limit) {
                  showToast(`บีบอัดแล้วขนาดไฟล์ยังเกินกำหนด (${compressedSizeMB.toFixed(2)}MB) กรุณาลดจำนวนหน้าลงครับ`, "error");
                } else {
                  setFixPdfFile(compressed);
                  setFixImageFiles([]);
                  showToast(`บีบอัดไฟล์ PDF สำเร็จ! ขนาดลดลงเหลือ ${compressedSizeMB.toFixed(2)}MB ✨`, "success");
                }
              } catch (err: any) {
                console.error(err);
                showToast("การบีบอัดไฟล์ขัดข้อง: " + err.message, "error");
              } finally {
                setIsCompressingPdf(false);
              }
            }, 300);
          }
          return;
        }
        setFixPdfFile(pdf);
        setFixImageFiles([]);
      }
    } else {
      const incomingImages = Array.from(files).filter(file => file.type.startsWith('image/'));
      if (incomingImages.length === 0) {
        showToast("กรุณาเลือกไฟล์ PDF หรือรูปภาพเท่านั้นครับ 📄📸", "error");
        return;
      }

      const totalCount = fixImageFiles.length + incomingImages.length;
      if (totalCount > 20) {
        showToast("คุณสามารถอัปโหลดรูปภาพได้สูงสุด 20 รูปครับ ⚠️", "error");
        const remainingSlots = 20 - fixImageFiles.length;
        if (remainingSlots > 0) {
          const allowedImages = incomingImages.slice(0, remainingSlots);
          setFixImageFiles(prev => [...prev, ...allowedImages]);
          setFixPdfFile(null);
        }
        return;
      }

      setFixImageFiles(prev => [...prev, ...incomingImages]);
      setFixPdfFile(null);
    }
  };

  const handleFixRemoveImage = (indexToRemove: number) => {
    setFixImageFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleFixVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > (systemSettings.max_size_video || 50)) {
        showToast(`ไฟล์วิดีโอของคุณมีขนาด ${sizeMB.toFixed(2)}MB ซึ่งเกินขีดจำกัดที่กำหนด (${systemSettings.max_size_video || 50}MB)`, "error");
        return;
      }
      setFixVideoFile(file);
    }
  };

  // Logic determining whether PDF is required
  const pdfIsRequired = !(
    activeJob?.job_type === "งานติดตั้ง (INS)" &&
    insStatus === "fail" &&
    failDetail === "not_entered"
  );

  // Logic determining whether Video should be visible
  const videoIsVisible = (
    activeJob?.job_type === "งานติดตั้ง (INS)" || 
    activeJob?.job_type === "งานถอดติดตั้ง (AS)"
  ) && !(
    activeJob?.job_type === "งานติดตั้ง (INS)" &&
    insStatus === "fail" &&
    failDetail === "not_entered"
  );

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !currentUser) return;

    // Check mandatory fields
    if (activeJob.job_type === "งานติดตั้ง (INS)" && !insStatus) {
      showToast("กรุณาเลือกสถานะงานติดตั้งด้วยนะครับ 🟢🔴", "error");
      return;
    }
    
    if (activeJob.job_type === "งานติดตั้ง (INS)" && insStatus === 'fail' && !failDetail) {
      showToast("กรุณาเลือกรายละเอียดการเฟลด้วยนะครับ 🏠🚗", "error");
      return;
    }

    if (activeJob.job_type === "งานถอดติดตั้ง (AS)" && !dismantleSub) {
      showToast("กรุณาเลือกประเภทย่อยงานถอดติดตั้งด้วยนะครับ 📂", "error");
      return;
    }

    if (pdfIsRequired && !pdfFile && imageFiles.length === 0) {
      showToast("กรุณาแนบไฟล์ PDF หรือรูปภาพใบงานด้วยนะครับ 📄📸", "error");
      return;
    }

    // Google Drive Preferences connection check
    if (!gdrivePrefs || !gdrivePrefs.connected) {
      showToast("ระบบอัปโหลดขัดข้อง: ยังไม่ได้เชื่อมต่อ Google Drive กรุณาติดต่อแอดมินนะครับ 🙏", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStepName("กำลังดึง OAuth Access Token...");

    try {
      const db = getDb();
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error("สิทธิ์การเชื่อมต่อ Google Drive หมดอายุชั่วคราว กรุณาแจ้งแอดมินต่อสิทธิ์ในหน้าตั้งค่าเพื่อให้ทุกคนส่งงานต่อได้ครับ 🚀");
      }

      setUploadProgress(20);
      setUploadStepName("กำลังเตรียมจัดสรรโฟลเดอร์โครงการบน Drive...");

      // Final folder routing categorization matching old script
      let finalWorkCat = activeJob.job_type;
      if (activeJob.job_type === "งานติดตั้ง (INS)" && insStatus === "fail") {
        finalWorkCat = "งานเฟล (Fail)";
      }

      let baseOrderNo = activeJob.order_no && activeJob.order_no !== '-' ? activeJob.order_no : '';
      if (!baseOrderNo) {
        baseOrderNo = activeJob.job_id.replace(/^(INS|AS)-/i, '');
      }

      // Rename rules
      const cleanCustomerName = activeJob.customer_name.replace(/[\\/:*?"<>|]/g, '');
      const folderNameForGDrive = (pdfFile || imageFiles.length > 0)
        ? `${baseOrderNo} ${cleanCustomerName}.pdf`
        : `${baseOrderNo} ${cleanCustomerName}`;
      
      const targetFolderId = await getOrCreateTargetUploadFolder(
        accessToken, 
        finalWorkCat, 
        folderNameForGDrive, 
        dismantleSub || ""
      );

      let pdfUrl = '-';
      let renamedPdfName = '-';
      let fileToUpload: File | null = pdfFile;

      if (imageFiles.length > 0) {
        setUploadProgress(30);
        setUploadStepName("กำลังแปลงรูปภาพและบีบอัดเป็นไฟล์ PDF...");
        
        try {
          const pdfBlob = await convertImagesToPdf(imageFiles, (current, total) => {
            setUploadStepName(`กำลังแปลงรูปภาพเป็น PDF (${current}/${total} รูป)...`);
            setUploadProgress(30 + Math.round((current / total) * 10));
          });
          
          renamedPdfName = `${baseOrderNo} ${cleanCustomerName}.pdf`;
          fileToUpload = new File([pdfBlob], renamedPdfName, { type: 'application/pdf' });
        } catch (convErr: any) {
          console.error("PDF conversion error:", convErr);
          throw new Error("ไม่สามารถแปลงรูปภาพเป็น PDF ได้ กรุณาลองใหม่อีกครั้งครับ: " + convErr.message);
        }
      } else if (pdfFile) {
        renamedPdfName = `${baseOrderNo} ${cleanCustomerName}.pdf`;
      }

      if (fileToUpload) {
        setUploadProgress(45);
        setUploadStepName(`กำลังอัปโหลดไฟล์เอกสารส่งงาน: ${renamedPdfName}...`);
        
        const pdfUploadRes = await directUploadToGDrive(accessToken, fileToUpload, targetFolderId, renamedPdfName);
        pdfUrl = pdfUploadRes.url;
      }

      let videoUrl = '-';
      let renamedVideoName = '-';

      if (videoFile && videoIsVisible) {
        setUploadProgress(70);
        const vidExt = videoFile.name.substring(videoFile.name.lastIndexOf('.'));
        renamedVideoName = `${baseOrderNo} ${cleanCustomerName}${vidExt}`;
        setUploadStepName(`กำลังอัปโหลดวิดีโอประกอบ: ${renamedVideoName}...`);

        const videoUploadRes = await directUploadToGDrive(accessToken, videoFile, targetFolderId, renamedVideoName);
        videoUrl = videoUploadRes.url;
      }

      setUploadProgress(90);
      setUploadStepName("กำลังบันทึกข้อมูลและปรับคิวงาน...");

      const submissionDateStr = new Date().toISOString();
      const submissionPayload: SubmissionData = {
        submission_date: submissionDateStr,
        name: targetTechName,
        work_type: finalWorkCat,
        file_name: renamedPdfName,
        file_url: pdfUrl,
        video_name: videoFile && videoIsVisible ? renamedVideoName : '-',
        video_url: videoUrl,
        description: note || '-',
        status: 'รอตรวจ',
        job_id: activeJob.job_id,
        order_no: activeJob.order_no || '-',
        sub_work_type: dismantleSub || '',
        assigned_to: targetTechName,
        fail_detail: failDetail || '-'
      };

      // 1. Create document in submissions
      await setDoc(doc(db, 'submissions', submissionDateStr), submissionPayload);

      // 2. Update status in assigned_jobs
      await updateDoc(doc(db, 'assigned_jobs', activeJob.job_id), {
        status: 'submitted',
        submission_date: submissionDateStr,
        file_url: pdfUrl,
        video_url: videoUrl,
        note: note || '-',
        sub_work_type: dismantleSub || '',
        fail_detail: failDetail || '-'
      });

      setUploadProgress(100);
      showToast(`ส่งใบงานรหัส ${activeJob.job_id} เรียบร้อยแล้วครับ! ขอบคุณสำหรับความตั้งใจในการทำงานวันนี้ครับ 🌟`, "success");

      // 3. Optional Telegram group alert matching old system
      if (systemSettings.telegram_status === 'enabled' && systemSettings.telegram_bot_token && systemSettings.telegram_chat_id) {
        let telegramMsg = `📥 <b>แจ้งเตือนงานส่งใหม่</b>\n` +
                          `──────────────────\n` +
                          `• <b>รหัสงาน:</b> <code>${activeJob.job_id}</code>\n`;
        
        if (activeJob.order_no && activeJob.order_no !== '-') {
          telegramMsg += `• <b>รหัสออเดอร์:</b> <code>${activeJob.order_no}</code>\n`;
        }
        
        telegramMsg += `• <b>ประเภทงาน:</b> ${finalWorkCat}${dismantleSub ? ` (${dismantleSub})` : ''}\n` +
                       `• <b>ช่างเทคนิค:</b> ${targetTechName}\n\n`;

        if (pdfFile && pdfUrl && pdfUrl !== '-') {
          telegramMsg += `• <b>ไฟล์ PDF:</b> 📄 <a href="${pdfUrl}">${renamedPdfName}</a>\n`;
        }
        
        if (videoFile && videoIsVisible && videoUrl && videoUrl !== '-') {
          telegramMsg += `• <b>ไฟล์วิดีโอ:</b> 🎥 <a href="${videoUrl}">${renamedVideoName}</a>\n`;
        }
        
        telegramMsg += `• <b>หมายเหตุ:</b> ${note.trim() ? `<i>${note.trim()}</i>` : '-'}\n` +
                       `──────────────────`;

        sendTelegramDirect(
          systemSettings.telegram_bot_token, 
          systemSettings.telegram_chat_id, 
          telegramMsg
        ).catch(e => console.warn("Telegram notification failed:", e));
      }

      // 4. Optional Web Push Notification
      if (systemSettings.push_status === 'enabled' && systemSettings.push_service_account) {
        const pushTitle = '📥 แจ้งเตือนงานส่งใหม่';
        const pushBody = `รหัสงาน: ${activeJob.job_id}` +
          (activeJob.order_no && activeJob.order_no !== '-' ? ` | ออเดอร์: ${activeJob.order_no}` : '') +
          ` | ${finalWorkCat}` +
          ` | ช่าง: ${targetTechName}` +
          (note.trim() ? ` | หมายเหตุ: ${note.trim()}` : '');

        try {
          const db = getDb();

          // Save notification record to Firestore first (for history page)
          const { addDoc, serverTimestamp } = await import('firebase/firestore');
          const submitterUsername = currentUser?.username || currentUser?.name || '';
          const notifRef = await addDoc(collection(db, 'notifications'), {
            title: pushTitle,
            body: pushBody,
            type: 'job_submit',
            user_id: submitterUsername,          // used for per-user notification filtering
            job_id: activeJob.job_id,
            order_no: activeJob.order_no || '-',
            work_category: finalWorkCat,
            technician: targetTechName,
            note: note.trim() || '-',
            pdf_url: pdfUrl || null,
            video_url: (videoFile && videoIsVisible && videoUrl) ? videoUrl : null,
            created_at: serverTimestamp(),
            sent: false,
            sent_count: 0,
          });

          // Read tokens: notify admin/auditor + the submitting technician only
          const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
          const fcmTokens: string[] = tokensSnap.docs
            .map(d => d.data())
            .filter(d =>
              d.role === 'admin' ||
              d.role === 'auditor' ||
              d.username === submitterUsername
            )
            .map(d => d.token as string)
            .filter(Boolean);

          if (fcmTokens.length > 0) {
            fetch('/api/push-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: pushTitle,
                body: pushBody,
                url: '/notifications',
                serviceAccountJson: systemSettings.push_service_account,
                tokens: fcmTokens,
                notifId: notifRef.id,
              }),
            }).catch(e => console.warn('[push-notify] Failed to send push notification:', e));
          }
        } catch (e) {
          console.warn('[push-notify] Failed to send push notification:', e);
        }
      }

      closeSubmitModal();
      fetchJobs();
    } catch (err: any) {
      console.error(err);
      showToast("เกิดข้อผิดพลาดในการส่งงาน: " + err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />

      <main className="flex-grow pt-24 pb-6 px-4 lg:p-8 overflow-y-auto">

        {/* Dropdown Selector for Admin/Auditor */}
        {isAdminOrAuditor && (
          <div className="glass-card p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 Prompt">ส่งงานแทนช่างเทคนิค</h3>
                <p className="text-[10px] text-slate-400 Sarabun">เลือกชื่อช่างเทคนิคที่ต้องการลงงานแทนระบบ</p>
              </div>
            </div>
            <div className="w-full sm:w-72">
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 transition font-bold Prompt cursor-pointer"
              >
                <option value="">-- เลือกช่างเทคนิค --</option>
                {technicians.map((t) => (
                  <option key={t} value={t}>
                    {formatDisplayName(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Tab switcher row for Admin/Auditor */}
        {isAdminOrAuditor && selectedTech && (
          <div className="flex gap-2 mb-6 bg-slate-100/70 p-1 rounded-2xl w-fit border border-slate-200/20">
            <button
              type="button"
              onClick={() => router.push('/submit?tab=dashboard')}
              className={`px-4.5 py-2.5 rounded-xl font-bold text-xs Prompt flex items-center gap-2 cursor-pointer transition ${
                activeTab === 'dashboard'
                  ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              แผงควบคุมผลงาน
            </button>
            <button
              type="button"
              onClick={() => router.push('/submit?tab=queue')}
              className={`px-4.5 py-2.5 rounded-xl font-bold text-xs Prompt flex items-center gap-2 cursor-pointer transition ${
                activeTab === 'queue'
                  ? 'bg-white text-amber-600 shadow-sm border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" />
              คิวงานค้างส่ง
            </button>
            <button
              type="button"
              onClick={() => router.push('/submit?tab=history')}
              className={`px-4.5 py-2.5 rounded-xl font-bold text-xs Prompt flex items-center gap-2 cursor-pointer transition ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-655 shadow-sm border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              ประวัติส่งงาน
            </button>
          </div>
        )}

        {/* If Admin/Auditor and haven't selected a technician */}
        {isAdminOrAuditor && !selectedTech ? (
          <div className="glass-card p-12 text-center flex flex-col items-center justify-center gap-4 border-dashed border-2 border-slate-200 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-slate-100/80 flex items-center justify-center text-slate-400">
              <Users className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 Prompt">โปรดเลือกช่างเทคนิคเพื่อดำเนินการ</h3>
              <p className="text-xs text-slate-400 Sarabun mt-1">เลือกช่างเทคนิคจากเมนูด้านบน เพื่อส่งงานค้างและบันทึกประวัติการส่งงานแทน</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Tab: Personal Dashboard ── */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Welcome Section */}
                <div className="bg-gradient-to-r from-indigo-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-md border border-white/20 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/4 translate-x-1/4 scale-150">
                    <CheckCircle2 className="w-64 h-64" />
                  </div>
                  <div className="relative z-10">
                    <h2 className="text-xl font-bold Prompt mb-1">
                      {isAdminOrAuditor ? `ส่งงานแทน ช่าง ${formatDisplayName(selectedTech)}` : `สวัสดีครับ ช่าง ${currentUser?.name}`} 👋
                    </h2>
                    <p className="text-xs opacity-90 Sarabun">
                      {isAdminOrAuditor 
                        ? `บันทึกข้อมูลและส่งงานเข้าระบบในนามช่าง มีคิวงานค้างส่งทั้งหมด ${assignedJobs.length} รายการ`
                        : `ยินดีต้อนรับเข้าสู่ระบบปฏิบัติการช่าง วันนี้มีงานส่งสะสมทั้งหมด ${totalPersonal} รายการ`}
                    </p>
                  </div>
                </div>

            {/* 5 KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'ส่งงานสะสมทั้งหมด', value: totalPersonal, unit: 'งาน', icon: <FileText className="w-4 h-4" />, bg: 'bg-indigo-500', text: 'text-white', glow: 'icon-glow-indigo' },
                { label: 'ตรวจแล้วผ่าน (อนุมัติ)', value: approvedPersonal, unit: 'งาน', icon: <CheckCircle2 className="w-4 h-4" />, bg: 'bg-emerald-500', text: 'text-white', glow: 'icon-glow-emerald' },
                { label: 'รอตรวจสอบ', value: pendingPersonal, unit: 'รายการ', icon: <Clock className="w-4 h-4" />, bg: 'bg-amber-500', text: 'text-white', glow: 'icon-glow-amber' },
                { label: 'แจ้งแก้ไข (งานเคลม)', value: rejectedPersonal, unit: 'รายการ', icon: <Info className="w-4 h-4" />, bg: 'bg-rose-500', text: 'text-white', glow: 'icon-glow-rose' },
                { label: 'อัตราการทำงานผ่าน', value: approvalRate, unit: '%', icon: <Zap className="w-4 h-4" />, bg: 'bg-violet-500', text: 'text-white', glow: 'icon-glow-violet' }
              ].map((kpi, i) => (
                <div
                  key={i}
                  className="glass-card p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-200"
                >
                  <div className={`w-8 h-8 ${kpi.bg} ${kpi.text} ${kpi.glow} rounded-xl flex items-center justify-center`}>
                    {kpi.icon}
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 font-extrabold tracking-wide uppercase Prompt">{kpi.label}</p>
                    <p className="text-xl font-black text-slate-800 Prompt leading-tight">
                      {dataLoading ? '—' : kpi.value} <span className="text-xs font-semibold text-slate-400">{kpi.unit}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts & Quick Insights for Tech */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Progress / Gauge Card */}
              <div className="glass-card p-6 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-violet-500 rounded-full inline-block shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                    ดัชนีคุณภาพงานส่ง (Approval Rate)
                  </h3>
                  <p className="text-[10px] text-slate-400 Sarabun mt-1">เป้าหมายคือรักษาอัตราความถูกต้องให้ได้มากกว่า 90% เพื่อประสิทธิภาพสูงสุด</p>
                </div>
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="Prompt text-slate-500">อัตราผ่านงานจริง</span>
                    <span className={approvalRate >= 90 ? "text-emerald-600" : approvalRate >= 75 ? "text-amber-600" : "text-rose-600"}>{approvalRate}%</span>
                  </div>
                  <div className="w-full bg-slate-100/70 rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        approvalRate >= 90 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
                        approvalRate >= 75 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                        'bg-gradient-to-r from-rose-400 to-red-500'
                      }`}
                      style={{ width: `${approvalRate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="bg-white/55 backdrop-blur-md rounded-2xl p-4 border border-white/50 text-[11px] Sarabun font-medium text-slate-600 leading-relaxed">
                  {approvalRate >= 90 ? (
                    <span>🎉 ยอดเยี่ยมมากครับ! คุณภาพงานติดตั้งของคุณอยู่ในเกณฑ์ดีเยี่ยม รักษามาตรฐานนี้ต่อไปนะครับ</span>
                  ) : approvalRate >= 75 ? (
                    <span>👍 คุณภาพงานอยู่ในเกณฑ์มาตรฐาน แต่ยังสามารถปรับปรุงเอกสารหรือวิดีโอเพิ่มเติมเพื่อความละเอียดได้อีกครับ</span>
                  ) : (
                    <span>⚠️ อัตราผ่านงานค่อนข้างต่ำ ควรตรวจเช็กรายละเอียดของเอกสาร PDF หรือวิดีโอที่ส่ง เพื่อลดจำนวนงานแก้ไขลงครับ</span>
                  )}
                </div>
              </div>

              {/* Quick List of Recent Submissions */}
              <div className="glass-card p-6 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-slate-700 Prompt flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  ประวัติส่งงาน 3 รายการล่าสุด
                </h3>
                {dataLoading ? (
                  <div className="flex-grow flex items-center justify-center p-6">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : personalHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 Prompt text-center py-8">ยังไม่มีการส่งงาน</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {personalHistory.slice(0, 3).map((item, idx) => {
                      const statusVal = item.status || 'รอตรวจ';
                      return (
                        <div key={idx} onClick={() => openHistoryModal(item)} className="flex items-start gap-3 py-2 border-b border-slate-100/30 last:border-0 last:pb-0 cursor-pointer hover:bg-slate-50 rounded-lg px-2 transition-colors">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                            item.work_type.includes('ถอด') ? 'bg-purple-500 text-white icon-glow-purple' :
                            item.work_type.includes('ซ่อม') ? 'bg-emerald-500 text-white icon-glow-emerald' :
                            'bg-indigo-500 text-white icon-glow-indigo'
                          }`}>
                            {item.work_type.includes('ถอด') ? '⚙️' : item.work_type.includes('ซ่อม') ? '🔧' : '📦'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-800 Prompt truncate">
                              {item.order_no && item.order_no !== '-' ? item.order_no : item.job_id}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate">{item.work_type}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${
                              statusVal === 'ตรวจแล้ว' ? 'bg-emerald-500/20 text-emerald-700' :
                              statusVal === 'แก้ไข' ? 'bg-rose-500/20 text-rose-700' :
                              'bg-amber-500/20 text-amber-700'
                            }`}>{statusVal}</span>
                            <p className="text-[8px] text-slate-300 mt-1">{formatThaiDate(item.submission_date).split(' ')[0]}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Queue ── */}
        {activeTab === 'queue' && (
          <section className="mb-8">
            <div className="flex justify-between items-center bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.02)] mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 icon-glow-amber">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 Prompt leading-tight">
                    งานค้างส่ง
                  </h2>
                  <span className="text-[10px] text-slate-400 font-extrabold Prompt font-mono">
                    จำนวน {filteredQueue.length} รายการ
                  </span>
                </div>
              </div>

              {/* Search & Filter Buttons */}
              <div className="flex items-center gap-2 relative">
                {/* Search Button (Expanding) */}
                <div 
                  onMouseEnter={() => setIsQueueSearchExpanded(true)}
                  onMouseLeave={() => {
                    if (!queueSearch && document.activeElement !== queueSearchInputRef.current) {
                      setIsQueueSearchExpanded(false);
                    }
                  }}
                  className="relative flex items-center bg-white border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-300"
                >
                  <button 
                    type="button"
                    onClick={() => {
                      setIsQueueSearchExpanded(!isQueueSearchExpanded);
                      if (!isQueueSearchExpanded) {
                        setTimeout(() => queueSearchInputRef.current?.focus(), 100);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-indigo-600 rounded-full transition-all cursor-pointer flex items-center justify-center animate-none"
                    title="ค้นหา"
                  >
                    <Search className="w-4 h-4 text-blue-500" />
                  </button>
                  <motion.input
                    ref={queueSearchInputRef}
                    type="text"
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    onFocus={() => setIsQueueSearchExpanded(true)}
                    onBlur={() => {
                      if (!queueSearch) setIsQueueSearchExpanded(false);
                    }}
                    initial={false}
                    animate={{ width: isQueueSearchExpanded ? '150px' : '0px', opacity: isQueueSearchExpanded ? 1 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    placeholder="ค้นหาใบงาน..."
                    className="bg-transparent border-0 text-slate-800 text-xs focus:outline-none focus:ring-0 placeholder-slate-400 font-medium overflow-hidden h-8 font-sans"
                    style={{ paddingLeft: isQueueSearchExpanded ? '4px' : '0px', paddingRight: isQueueSearchExpanded ? '8px' : '0px' }}
                  />
                </div>

                {/* Filter Icon Button */}
                <button
                  type="button"
                  onClick={() => setShowQueueFilterPanel(!showQueueFilterPanel)}
                  className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 text-xs font-bold Prompt"
                  title="ตัวกรอง"
                >
                  <Filter className="w-4 h-4 text-blue-500" />
                </button>

                {/* Dropdown Filter Panel */}
                <AnimatePresence>
                  {showQueueFilterPanel && (
                    <>
                      {/* Backdrop overlay to close when clicking outside */}
                      <div 
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={() => setShowQueueFilterPanel(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute right-0 top-11 z-30 w-72 bg-white border border-slate-100 rounded-3xl p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] flex flex-col gap-4 text-xs font-semibold font-sans"
                      >
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold Prompt">
                            <Filter className="w-3.5 h-3.5 text-blue-500" />
                            <span>ตัวเลือกตัวกรอง</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setShowQueueFilterPanel(false)}
                            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">ประเภทงาน (Type)</label>
                            <CustomSelect
                              value={queueTypeFilter}
                              onChange={(val) => setQueueTypeFilter(val)}
                              options={[
                                { value: '', label: 'ประเภทงานทั้งหมด' },
                                { value: 'งานติดตั้ง (INS)', label: 'งานติดตั้ง (INS)' },
                                { value: 'งานซ่อม (AS)', label: 'งานซ่อม (AS)' },
                                { value: 'งานถอดติดตั้ง (AS)', label: 'งานถอดติดตั้ง (AS)' }
                              ]}
                            />
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {dataLoading ? (
              <div className="flex flex-col items-center justify-center p-12 glass-card">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs text-slate-500 Prompt">กำลังโหลดคิวงานช่าง...</p>
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="glass-card p-12 text-center text-slate-500 border-dashed">
                {assignedJobs.length === 0 
                  ? "✨ วันนี้คุณส่งงานครบถ้วนหมดแล้ว ยอดเยี่ยมมากครับ!"
                  : "🔍 ไม่พบรายการงานค้างส่งตามเงื่อนไขที่เลือก"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredQueue.map((job) => {
                  let badgeColor = 'bg-indigo-500';
                  let icon = '📦';
                  let jobLabelName = 'งานติดตั้ง';
                  let glowClass = 'icon-glow-indigo';
                  let iconBg = 'bg-indigo-500';

                  if (job.job_type.includes('ถอด')) {
                    badgeColor = 'bg-purple-500';
                    icon = '⚙️';
                    jobLabelName = 'งานถอดติดตั้ง';
                    glowClass = 'icon-glow-purple';
                    iconBg = 'bg-purple-500';
                  } else if (job.job_type.includes('ซ่อม')) {
                    badgeColor = 'bg-emerald-500';
                    icon = '🔧';
                    jobLabelName = 'งานซ่อม';
                    glowClass = 'icon-glow-emerald';
                    iconBg = 'bg-emerald-500';
                  }

                  return (
                    <motion.div
                      key={job.job_id}
                      layoutId={job.job_id}
                      className={`relative border backdrop-blur-md rounded-[1.75rem] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.02)] border-white/50 hover:shadow-[0_12px_35px_rgba(0,0,0,0.04)] transition-all duration-300 flex justify-between items-center gap-4 ${
                        job.job_type.includes('ถอด') ? 'bg-purple-500/5' :
                        job.job_type.includes('ซ่อม') ? 'bg-emerald-500/5' :
                        'bg-blue-500/5'
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-grow">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold text-white ${iconBg} ${glowClass}`}>
                          {icon}
                        </div>
                        <div className="min-w-0 flex-grow">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-extrabold text-slate-800 text-xs font-mono tracking-tight">
                              {job.order_no && job.order_no !== '-' ? job.order_no : job.job_id}
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-extrabold text-white uppercase tracking-wider ${badgeColor}`}>
                              {jobLabelName}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 truncate Prompt">
                            <span className="text-slate-400 font-medium">ลูกค้า:</span> {job.customer_name}
                          </p>
                          {job.order_no && job.order_no !== '-' && (
                            <span className="text-[9px] text-slate-400 font-semibold font-mono block mt-0.5">รหัสงาน: {job.job_id}</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSubmitModal(job)}
                        className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl text-xs font-bold transition duration-200 shrink-0 Prompt flex items-center gap-1.5 shadow-[0_4px_12px_rgba(99,102,241,0.25)] hover:shadow-[0_6px_16px_rgba(99,102,241,0.4)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-none"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        <span>ส่งงาน</span>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Tab: History ── */}
        {activeTab === 'history' && (
          <section>
            <div className="flex justify-between items-center bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.02)] mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 icon-glow-indigo">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 Prompt leading-tight">
                    ประวัติการส่งงาน
                  </h2>
                  <span className="text-[10px] text-slate-400 font-extrabold Prompt font-mono">
                    ส่งแล้ว {filteredHistory.length} รายการ
                  </span>
                </div>
              </div>

              {/* Search & Filter Buttons */}
              <div className="flex items-center gap-2 relative">
                {/* Search Button (Expanding) */}
                <div 
                  onMouseEnter={() => setIsHistorySearchExpanded(true)}
                  onMouseLeave={() => {
                    if (!historySearch && document.activeElement !== historySearchInputRef.current) {
                      setIsHistorySearchExpanded(false);
                    }
                  }}
                  className="relative flex items-center bg-white border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-300"
                >
                  <button 
                    type="button"
                    onClick={() => {
                      setIsHistorySearchExpanded(!isHistorySearchExpanded);
                      if (!isHistorySearchExpanded) {
                        setTimeout(() => historySearchInputRef.current?.focus(), 100);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-indigo-600 rounded-full transition-all cursor-pointer flex items-center justify-center animate-none"
                    title="ค้นหา"
                  >
                    <Search className="w-4 h-4 text-blue-500" />
                  </button>
                  <motion.input
                    ref={historySearchInputRef}
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    onFocus={() => setIsHistorySearchExpanded(true)}
                    onBlur={() => {
                      if (!historySearch) setIsHistorySearchExpanded(false);
                    }}
                    initial={false}
                    animate={{ width: isHistorySearchExpanded ? '150px' : '0px', opacity: isHistorySearchExpanded ? 1 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    placeholder="ค้นหาใบงาน..."
                    className="bg-transparent border-0 text-slate-800 text-xs focus:outline-none focus:ring-0 placeholder-slate-400 font-medium overflow-hidden h-8 font-sans"
                    style={{ paddingLeft: isHistorySearchExpanded ? '4px' : '0px', paddingRight: isHistorySearchExpanded ? '8px' : '0px' }}
                  />
                </div>

                {/* Filter Icon Button */}
                <button
                  type="button"
                  onClick={() => setShowHistoryFilterPanel(!showHistoryFilterPanel)}
                  className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 border border-slate-200/80 rounded-full shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 text-xs font-bold Prompt"
                  title="ตัวกรอง"
                >
                  <Filter className="w-4 h-4 text-blue-500" />
                </button>

                {/* Dropdown Filter Panel */}
                <AnimatePresence>
                  {showHistoryFilterPanel && (
                    <>
                      {/* Backdrop overlay to close when clicking outside */}
                      <div 
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={() => setShowHistoryFilterPanel(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute right-0 top-11 z-30 w-72 bg-white border border-slate-100 rounded-3xl p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] flex flex-col gap-4 text-xs font-semibold font-sans"
                      >
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold Prompt">
                            <Filter className="w-3.5 h-3.5 text-blue-500" />
                            <span>ตัวเลือกตัวกรอง</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setShowHistoryFilterPanel(false)}
                            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          {/* Work Type Filter */}
                          <div>
                            <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">ประเภทงาน (Type)</label>
                            <CustomSelect
                              value={historyTypeFilter}
                              onChange={(val) => setHistoryTypeFilter(val)}
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

                          {/* Status Filter */}
                          <div>
                            <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1.5 Prompt">สถานะการตรวจสอบ</label>
                            <CustomSelect
                              value={historyStatusFilter}
                              onChange={(val) => setHistoryStatusFilter(val)}
                              options={[
                                { value: '', label: 'สถานะทั้งหมด' },
                                { value: 'รอตรวจ', label: 'รอตรวจ' },
                                { value: 'ตรวจแล้ว', label: 'ตรวจแล้ว' },
                                { value: 'แก้ไข', label: 'แก้ไข' }
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
                                  value={historyDateFrom} 
                                  onChange={(e) => setHistoryDateFrom(e.target.value)} 
                                  className="w-full h-[38px] bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-0 text-xs focus:outline-none focus:border-indigo-500 Prompt cursor-pointer font-bold date-filter-input font-sans" 
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-[10px] w-6 shrink-0 Prompt font-extrabold text-right">ถึง</span>
                                <input 
                                  type="date" 
                                  value={historyDateTo} 
                                  onChange={(e) => setHistoryDateTo(e.target.value)} 
                                  className="w-full h-[38px] bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl px-3.5 py-0 text-xs focus:outline-none focus:border-indigo-500 Prompt cursor-pointer font-bold date-filter-input font-sans" 
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {dataLoading ? (
              <div className="w-full h-20 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="glass-card p-6 text-center text-slate-400 text-xs Prompt">
                {personalHistory.length === 0 
                  ? "ยังไม่มีประวัติการส่งงานในระบบ"
                  : "🔍 ไม่พบประวัติการส่งงานตามเงื่อนไขที่เลือก"}
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold tracking-wider uppercase Prompt">
                        <th className="p-4 pl-6">วันที่</th>
                        <th className="p-4">รหัสงาน</th>
                        <th className="p-4">ประเภทงาน</th>
                        <th className="p-4">ชื่อไฟล์</th>
                        <th className="p-4 pr-6">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600 Sarabun font-medium">
                      {filteredHistory.map((item, idx) => {
                        const statusVal = item.status || 'รอตรวจ';
                        return (
                          <tr key={idx} onClick={() => openHistoryModal(item)} className="hover:bg-slate-50/50 transition cursor-pointer">
                            <td className="p-4 pl-6 text-slate-500 whitespace-nowrap">
                              {formatThaiDate(item.submission_date)}
                            </td>
                            <td className="p-4 font-bold text-slate-800">{item.job_id || '-'}</td>
                            <td className="p-4 font-bold">
                              <span className={
                                item.work_type.includes('ติดตั้ง') ? 'text-indigo-600' :
                                item.work_type.includes('ซ่อม') ? 'text-emerald-600' :
                                item.work_type.includes('เฟล') ? 'text-rose-600' :
                                'text-blue-600'
                              }>
                                {item.work_type}{item.sub_work_type ? ` (${item.sub_work_type})` : ''}
                              </span>
                            </td>
                            <td className="p-4 max-w-[180px] truncate text-slate-500" title={item.file_name}>
                              {item.file_name}
                            </td>
                            <td className="p-4 pr-6">
                              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] Prompt ${
                                statusVal === 'ตรวจแล้ว' ? 'bg-emerald-50 text-emerald-600' :
                                statusVal === 'แก้ไข' ? 'bg-rose-50 text-rose-600' :
                                'bg-amber-50 text-amber-600'
                              }`}>
                                {statusVal}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </>
    )}

      </main>

      {/* Submission upload progress overlay */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 text-center">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 animate-bounce">
                📤
              </div>
              <h3 className="text-lg font-bold text-slate-800 Prompt mb-1">กำลังนำส่งชิ้นงานเข้า Drive</h3>
              <p className="text-xs text-slate-500 Sarabun mb-6 leading-relaxed">{uploadStepName}</p>
              
              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                <motion.div 
                  className="bg-indigo-600 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-xs font-bold text-indigo-600 Prompt">{uploadProgress}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF compression progress overlay */}
      <AnimatePresence>
        {isCompressingPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 text-center animate-fadeIn">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 animate-spin">
                ⏳
              </div>
              <h3 className="text-lg font-bold text-slate-800 Prompt mb-1 font-bold">กำลังบีบอัดไฟล์ PDF</h3>
              <p className="text-xs text-slate-500 Sarabun mb-6 leading-relaxed">กำลังปรับขนาดและลดขนาดหน้าเอกสาร...</p>
              
              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                <motion.div 
                  className="bg-indigo-600 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${compressProgress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <span className="text-xs font-bold text-indigo-650 Prompt">{compressProgress}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Form Modal */}
      <AnimatePresence>
        {activeJob && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={closeSubmitModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-100 max-h-[90vh] overflow-y-auto flex flex-col gap-4 z-10"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 Prompt flex items-center gap-2 flex-wrap">
                    <span className="text-indigo-600 font-mono">
                      {activeJob.order_no && activeJob.order_no !== '-' ? activeJob.order_no : activeJob.job_id}
                    </span>
                    <span className="text-slate-500 font-medium text-sm">
                      {activeJob.customer_name}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">
                    รหัสงาน: {activeJob.job_id}
                  </p>
                </div>
                <button
                  onClick={closeSubmitModal}
                  className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100/60 rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-semibold">
                
                {/* 1. Installation Sub-status (Only for INS jobs) */}
                {activeJob.job_type === "งานติดตั้ง (INS)" && (
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100/80 backdrop-blur-md shadow-xs">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 Prompt">
                      สถานะงานติดตั้ง <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`border rounded-2xl p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                        insStatus === 'success' 
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 font-bold shadow-[0_4px_14px_rgba(16,185,129,0.15)]' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="insStatus"
                          value="success"
                          className="sr-only"
                          onChange={() => {
                            setInsStatus('success');
                            setFailDetail(null);
                          }}
                        />
                        <CheckCircle2 className={`w-5 h-5 ${insStatus === 'success' ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <span className="text-[11px] Prompt">ติดตั้งสำเร็จ</span>
                      </label>

                      <label className={`border rounded-2xl p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                        insStatus === 'fail' 
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-700 font-bold shadow-[0_4px_14px_rgba(244,63,94,0.15)]' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="insStatus"
                          value="fail"
                          className="sr-only"
                          onChange={() => setInsStatus('fail')}
                        />
                        <XCircle className={`w-5 h-5 ${insStatus === 'fail' ? 'text-rose-500' : 'text-slate-400'}`} />
                        <span className="text-[11px] Prompt">งานเฟล (ไม่สำเร็จ)</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 2. Fail Detail selection (Only when INS + Fail is selected) */}
                <AnimatePresence>
                  {activeJob.job_type === "งานติดตั้ง (INS)" && insStatus === 'fail' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100/80 backdrop-blur-md shadow-xs overflow-hidden"
                    >
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 Prompt">
                        รายละเอียดงานเฟล <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={`border rounded-2xl p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                          failDetail === 'entered' 
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 font-bold shadow-[0_4px_14px_rgba(99,102,241,0.15)]' 
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}>
                          <input
                            type="radio"
                            name="failDetail"
                            value="entered"
                            className="sr-only"
                            onChange={() => setFailDetail('entered')}
                          />
                          <MapPin className={`w-5 h-5 ${failDetail === 'entered' ? 'text-indigo-500' : 'text-slate-400'}`} />
                          <span className="text-[11px] Prompt text-center">เข้าหน้างานแล้ว</span>
                        </label>

                        <label className={`border rounded-2xl p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                          failDetail === 'not_entered' 
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 font-bold shadow-[0_4px_14px_rgba(99,102,241,0.15)]' 
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}>
                          <input
                            type="radio"
                            name="failDetail"
                            value="not_entered"
                            className="sr-only"
                            onChange={() => setFailDetail('not_entered')}
                          />
                          <Truck className={`w-5 h-5 ${failDetail === 'not_entered' ? 'text-indigo-500' : 'text-slate-400'}`} />
                          <span className="text-[11px] Prompt text-center">ยังไม่เข้าหน้างาน</span>
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 3. Dismantle subcategories (Only for AS dismantle jobs) */}
                {activeJob.job_type === "งานถอดติดตั้ง (AS)" && (
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 backdrop-blur-md shadow-xs">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 Prompt">
                      ประเภทย่อยงานถอดติดตั้ง <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex flex-col gap-2">
                      {['ถอดเครื่อง', 'ย้ายจุดเดิม', 'ย้ายจุดใหม่'].map((type) => {
                        const labelText = 
                          type === 'ถอดเครื่อง' ? 'ถอดเครื่อง (Dismantle Only)' :
                          type === 'ย้ายจุดเดิม' ? 'ย้ายจุดเดิม (Same-site Relocation)' :
                          'ย้ายจุดใหม่ (New-site Relocation)';
                        return (
                          <label 
                            key={type}
                            className={`border rounded-2xl p-3 flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                              dismantleSub === type 
                                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 font-bold shadow-[0_4px_14px_rgba(99,102,241,0.15)]' 
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <input
                              type="radio"
                              name="dismantleSub"
                              value={type}
                              className="sr-only"
                              onChange={() => setDismantleSub(type)}
                            />
                            <span className="text-xs Prompt">{labelText}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Info bypass alert banner */}
                {!pdfIsRequired && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] Sarabun font-semibold leading-relaxed">
                      💡 <b>ข้อมูลสิทธิ์ยกเว้น:</b> เนื่องจากช่างเลือกรายละเอียดเป็น <u>ยังไม่เข้าหน้างาน</u> ระบบจึงยกเลิกการบังคับแนบไฟล์ PDF และปิดการอัปโหลดวิดีโอ เพื่อความสะดวกในการรายงานทันทีครับ
                    </p>
                  </div>
                )}

                {/* 4. Document File Upload (PDF or Images) */}
                {pdfIsRequired && (
                  <div className="space-y-2">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                      ไฟล์เอกสารส่งงาน (PDF หรือรูปภาพ) <span className="text-rose-500">*</span>
                    </label>
                    <div className="border border-dashed border-indigo-200 bg-indigo-50/10 hover:bg-indigo-50/20 backdrop-blur-md rounded-2xl p-4 text-center relative transition-all duration-200 cursor-pointer">
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        multiple
                        onChange={handleDocumentChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1 pointer-events-none">
                        <div className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center mb-1 icon-glow-indigo">
                          <FileUp className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-indigo-700/90 Prompt">
                          คลิกเพื่ออัปโหลดไฟล์เอกสาร (PDF หรือรูปภาพ)
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">
                          เลือก PDF 1 ไฟล์ (สูงสุด {systemSettings.max_size_pdf || 20}MB) หรือเลือกไฟล์รูปภาพ (สูงสุด 20 รูป)
                        </span>
                      </div>
                    </div>

                    {pdfFile && (
                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center animate-fadeIn">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileUp className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-[11px] font-bold text-indigo-700 truncate max-w-[200px]" title={pdfFile.name}>
                            {pdfFile.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-indigo-500 font-bold">{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <button
                            type="button"
                            onClick={() => setPdfFile(null)}
                            className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {imageFiles.length > 0 && (
                      <div className="space-y-2 animate-fadeIn">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 font-bold Prompt flex items-center gap-1">
                            <FileImage className="w-3.5 h-3.5 text-indigo-500" />
                            รูปภาพที่เลือกไว้ ({imageFiles.length}/20 รูป)
                          </span>
                          <button
                            type="button"
                            onClick={() => setImageFiles([])}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition cursor-pointer"
                          >
                            ล้างทั้งหมด
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2 bg-slate-50/60 border border-slate-100/80 rounded-2xl p-3">
                          {imageFiles.map((file, index) => (
                            <ImagePreview
                              key={index}
                              file={file}
                              onRemove={() => handleRemoveImage(index)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Video File Upload (Conditional visibility) */}
                {videoIsVisible && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                      วิดีโอประกอบใบงาน (สูงสุด {systemSettings.max_size_video || 50}MB)
                    </label>
                    <div className="border border-dashed border-purple-200 bg-purple-50/10 hover:bg-purple-50/20 backdrop-blur-md rounded-2xl p-4 text-center relative transition-all duration-200 cursor-pointer">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1 pointer-events-none">
                        <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center mb-1 icon-glow-purple">
                          <Video className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-purple-700/90 Prompt">แนบวิดีโอหลักฐานการติดตั้ง (ถ้ามี)</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ขนาดสูงสุด {systemSettings.max_size_video || 50}MB</span>
                      </div>
                    </div>

                    {videoFile && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
                        <span className="text-[11px] font-bold text-emerald-700 truncate max-w-[200px]" title={videoFile.name}>{videoFile.name}</span>
                        <span className="text-[10px] text-emerald-500 font-bold shrink-0">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Notes text */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                    หมายเหตุเพิ่มเติม (ถ้ามี)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ระบุรายละเอียด หรือข้อความอื่นๆ..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition Prompt min-h-[60px]"
                  />
                </div>

                {/* Action Buttons */}
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-bold rounded-2xl transition duration-200 Prompt shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_24px_rgba(99,102,241,0.45)] hover:scale-[1.01] active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>ยืนยันข้อมูลจัดส่งงาน</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Detail & Fix Modal */}
      <AnimatePresence>
        {selectedHistory && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={closeHistoryModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative bg-white/80 backdrop-blur-lg rounded-[2rem] p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] max-w-lg w-full border border-white/60 max-h-[90vh] overflow-y-auto flex flex-col gap-5 z-10"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 Prompt flex items-center gap-2">
                    {isFixing ? (
                      <><Edit3 className="w-5 h-5 text-amber-500" /><span>อัปโหลดงานแก้ไข</span></>
                    ) : (
                      <><FileSpreadsheet className="w-5 h-5 text-indigo-500" /><span>รายละเอียดการส่งงาน</span></>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">รหัสงาน: {selectedHistory.job_id || selectedHistory.order_no}</p>
                </div>
                <button onClick={closeHistoryModal} className="text-slate-400 hover:text-slate-600 text-lg p-1.5 hover:bg-slate-100/50 rounded-full transition cursor-pointer">✕</button>
              </div>

              {/* Glassmorphic Row: Date and Status */}
              <div className="bg-white/50 backdrop-blur-xs p-4.5 rounded-2xl border border-white/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase Prompt">วันเวลาที่ส่งงาน</span>
                  <p className="text-xs font-bold text-slate-700 Sarabun leading-relaxed mt-0.5">{formatThaiDate(selectedHistory.submission_date)}</p>
                </div>
                
                <div className="flex flex-col gap-1 sm:w-auto w-full sm:text-right">
                  <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase Prompt mb-0.5">สถานะการตรวจสอบ</span>
                  <span className={`inline-flex px-3 py-1.5 rounded-xl font-extrabold text-[10px] Prompt w-fit sm:ml-auto items-center justify-center ${
                    selectedHistory.status === 'ตรวจแล้ว' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200' :
                    selectedHistory.status === 'แก้ไข' ? 'bg-rose-500 text-white shadow-sm shadow-rose-200' :
                    'bg-amber-500 text-white shadow-sm shadow-amber-200'
                  }`}>
                    {selectedHistory.status || 'รอตรวจ'}
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-xs font-semibold Sarabun">
                <div className="grid grid-cols-2 gap-4 bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ประเภทงาน</span>
                    <p className="text-xs font-bold text-slate-880 mt-1">{selectedHistory.work_type}</p>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ผู้ส่งงาน (ช่าง)</span>
                    <p className="text-xs font-bold text-slate-880 mt-1">{formatDisplayName(selectedHistory.name)}</p>
                  </div>
                </div>

                {selectedHistory.fail_detail && selectedHistory.fail_detail !== '-' && (
                  <div className="bg-rose-500/10 backdrop-blur-xs p-4 rounded-2xl border border-rose-200/50 shadow-2xs">
                    <span className="block text-[10px] text-rose-500 font-bold uppercase Prompt">รายละเอียดการเฟล</span>
                    <p className="text-xs font-bold text-rose-700 mt-1">
                      {selectedHistory.fail_detail === 'entered' ? '🏠 เข้าหน้างานแล้ว' : '🚗 ยังไม่เข้าหน้างาน'}
                    </p>
                  </div>
                )}

                {selectedHistory.status === 'แก้ไข' && selectedHistory.reject_reason && (
                  <div className="bg-amber-500/10 backdrop-blur-xs p-4 rounded-2xl border border-amber-200/50 shadow-2xs">
                    <span className="block text-[10px] text-amber-600 font-bold uppercase Prompt flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" /> สาเหตุที่ให้แก้ไข
                    </span>
                    <p className="text-xs font-bold text-amber-700 mt-1 Sarabun leading-relaxed">
                      {selectedHistory.reject_reason}
                    </p>
                  </div>
                )}

                <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">ชื่อเอกสารใบงาน</span>
                  <p className="text-xs font-bold text-slate-880 mt-1 break-all">{selectedHistory.file_name || '-'}</p>
                </div>

                <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">หมายเหตุ / อาการเสีย</span>
                  <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{selectedHistory.description || '-'}</p>
                </div>

                {!isFixing && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs flex flex-col justify-between gap-3">
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">เอกสาร PDF ใบงาน</span>
                          <p className="text-[9px] text-slate-400 mt-0.5 truncate" title={selectedHistory.file_name}>{selectedHistory.file_name}</p>
                        </div>
                        {selectedHistory.file_url && selectedHistory.file_url !== '-' ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewFile({ type: 'pdf', url: selectedHistory.file_url, name: selectedHistory.file_name || 'เอกสารใบงาน' })}
                            className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition Prompt cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /><span>ดูไฟล์ PDF</span>
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 py-2.5 text-center bg-slate-100 rounded-xl">ไม่มีเอกสาร</span>
                        )}
                      </div>
                      <div className="bg-white/50 backdrop-blur-xs p-4 rounded-2xl border border-white/80 shadow-2xs flex flex-col justify-between gap-3">
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase Prompt">วิดีโอประกอบ</span>
                          <p className="text-[9px] text-slate-400 mt-0.5 truncate" title={selectedHistory.video_name || '-'}>{selectedHistory.video_name || '-'}</p>
                        </div>
                        {selectedHistory.video_url && selectedHistory.video_url !== '-' ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewFile({ type: 'video', url: selectedHistory.video_url, name: selectedHistory.video_name || 'วิดีโอประกอบ' })}
                            className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition Prompt cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /><span>เปิดดูวิดีโอ</span>
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 py-2.5 text-center bg-slate-100 rounded-xl">ไม่มีวิดีโอ</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-slate-100 mt-2">
                      {selectedHistory.status === 'แก้ไข' ? (
                        <button 
                          type="button"
                          onClick={() => setIsFixing(true)} 
                          className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition shadow-md shadow-amber-100 flex items-center justify-center gap-1.5 Prompt cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" /><span>แก้ไขไฟล์ส่งงาน</span>
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={closeHistoryModal} 
                          className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition Prompt cursor-pointer"
                        >
                          ปิดหน้าต่าง
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Fix Upload Form */}
                {isFixing && (
                  <form onSubmit={handleFixSubmit} className="space-y-4 animate-fadeIn border-t border-slate-200/50 pt-4 mt-2">
                    <div className="space-y-2">
                      <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider Prompt">
                        ไฟล์เอกสารส่งงานใหม่ (PDF หรือรูปภาพ) <span className="text-rose-500">*</span>
                      </label>
                      <div className="border border-dashed border-indigo-200 bg-indigo-50/10 hover:bg-indigo-50/20 backdrop-blur-md rounded-2xl p-4 text-center relative transition-all duration-200 cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          multiple
                          onChange={handleFixDocumentChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center gap-1 pointer-events-none">
                          <div className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center mb-1 icon-glow-indigo">
                            <FileUp className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-indigo-700/90 Prompt">
                            คลิกเพื่อเลือกไฟล์เอกสารใหม่ (PDF หรือรูปภาพ)
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">
                            เลือก PDF 1 ไฟล์ (สูงสุด {systemSettings?.max_size_pdf || 20}MB) หรือเลือกไฟล์รูปภาพ (สูงสุด 20 รูป)
                          </span>
                        </div>
                      </div>

                      {fixPdfFile && (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center animate-fadeIn">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileUp className="w-4 h-4 text-indigo-500 shrink-0" />
                            <span className="text-[11px] font-bold text-indigo-700 truncate max-w-[200px]" title={fixPdfFile.name}>
                              {fixPdfFile.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-indigo-500 font-bold">{(fixPdfFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                            <button
                              type="button"
                              onClick={() => setFixPdfFile(null)}
                              className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {fixImageFiles.length > 0 && (
                        <div className="space-y-2 animate-fadeIn mt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-400 font-bold Prompt flex items-center gap-1">
                              <FileImage className="w-3.5 h-3.5 text-indigo-500" />
                              รูปภาพที่เลือกไว้ ({fixImageFiles.length}/20 รูป)
                            </span>
                            <button
                              type="button"
                              onClick={() => setFixImageFiles([])}
                              className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition cursor-pointer"
                            >
                              ล้างทั้งหมด
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 bg-slate-50/60 border border-slate-100/80 rounded-2xl p-3">
                            {fixImageFiles.map((file, index) => (
                              <ImagePreview
                                key={index}
                                file={file}
                                onRemove={() => handleFixRemoveImage(index)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                        วิดีโอประกอบใบงานใหม่ (สูงสุด {systemSettings?.max_size_video || 50}MB)
                      </label>
                      <div className="border border-dashed border-purple-200 bg-purple-50/10 hover:bg-purple-50/20 backdrop-blur-md rounded-2xl p-4 text-center relative transition-all duration-200 cursor-pointer">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleFixVideoChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center gap-1 pointer-events-none">
                          <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center mb-1 icon-glow-purple">
                            <Video className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-purple-700/90 Prompt">แนบวิดีโอหลักฐานการติดตั้งใหม่ (ถ้ามี)</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ขนาดสูงสุด {systemSettings?.max_size_video || 50}MB</span>
                        </div>
                      </div>

                      {fixVideoFile && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center mt-2 animate-fadeIn">
                          <div className="flex items-center gap-2 min-w-0">
                            <Video className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-[11px] font-bold text-emerald-700 truncate max-w-[200px]" title={fixVideoFile.name}>{fixVideoFile.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-emerald-500 font-bold shrink-0">{(fixVideoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                            <button
                              type="button"
                              onClick={() => setFixVideoFile(null)}
                              className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-slate-100 mt-2">
                      <button
                        type="button"
                        onClick={() => setIsFixing(false)}
                        className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition Prompt cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 Prompt cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" /> ส่งอัปโหลดไฟล์แก้ไข
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── File Preview Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-pointer"
              onClick={() => setPreviewFile(null)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-black rounded-2xl sm:rounded-[2rem] w-full max-w-5xl h-[85vh] sm:h-[90vh] flex flex-col z-10 overflow-hidden shadow-2xl border border-white/10"
            >
              {(() => {
                const previewFileId = getFileIdFromUrl(previewFile.url);
                const gdriveViewUrl = previewFileId ? `https://drive.google.com/file/d/${previewFileId}/view?usp=drivesdk` : previewFile.url;
                return (
                  <>
                    {/* Header */}
                    <div className="bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex justify-between items-center absolute top-0 left-0 right-0 z-20">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${previewFile.type === 'pdf' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {previewFile.type === 'pdf' ? <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </div>
                        <h3 className="text-white font-bold text-sm sm:text-base truncate Prompt">
                          {previewFile.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={gdriveViewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-colors cursor-pointer hidden sm:flex items-center justify-center"
                          title="เปิดในแท็บใหม่"
                        >
                          <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                        </a>
                        <button
                          onClick={() => setPreviewFile(null)}
                          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <X className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 bg-black/50 w-full h-full relative pt-[60px] sm:pt-[72px]">
                      {previewFile.type === 'pdf' ? (
                        <CustomPdfViewer url={`/api/gdrive/proxy?fileId=${previewFileId}`} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-black">
                          {isNativeVideo(previewFile.url, previewFile.name) ? (
                            <video 
                              src={`/api/gdrive/proxy?fileId=${previewFileId}`} 
                              controls 
                              autoPlay 
                              className="max-w-full max-h-full rounded-xl outline-none"
                            />
                          ) : (
                            <div className="text-center">
                              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Video className="w-8 h-8 text-slate-400" />
                              </div>
                              <p className="text-white Prompt mb-2">ไม่สามารถเล่นวิดีโอนี้ในเบราว์เซอร์ได้</p>
                              <a 
                                href={gdriveViewUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm Prompt transition"
                              >
                                <ExternalLink className="w-4 h-4" />
                                เปิดดู/ดาวน์โหลดไฟล์
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense fallback={null}>
      <SubmitPageInner />
    </Suspense>
  );
}
