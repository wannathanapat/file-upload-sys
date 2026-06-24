'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Sidebar from '@/components/sidebar';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../providers';
import { getDb } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import type { JobRow, SubmissionData } from '@/lib/utils';
import { formatThaiDate } from '@/lib/utils';
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
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getOrCreateTargetUploadFolder, 
  directUploadToGDrive, 
  getMimeTypeFromExt,
  getValidAccessToken
} from '@/lib/gdrive';
import { sendTelegramDirect } from '@/lib/telegram';

function SubmitPageInner() {
  const { currentUser, showToast, systemSettings, gdrivePrefs, setLoading, setLoadingText } = useApp();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';

  // Data lists
  const [assignedJobs, setAssignedJobs] = useState<JobRow[]>([]);
  const [personalHistory, setPersonalHistory] = useState<SubmissionData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Statistics for Technician Dashboard
  const totalPersonal = personalHistory.length;
  const approvedPersonal = personalHistory.filter(s => s.status === 'ตรวจแล้ว').length;
  const pendingPersonal = personalHistory.filter(s => s.status === 'รอตรวจ' || !s.status).length;
  const rejectedPersonal = personalHistory.filter(s => s.status === 'แก้ไข').length;
  const approvalRate = totalPersonal > 0 ? Math.round((approvedPersonal / totalPersonal) * 100) : 0;

  // Submission Form Modal state
  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  
  // Form fields
  const [insStatus, setInsStatus] = useState<'success' | 'fail' | null>(null);
  const [failDetail, setFailDetail] = useState<'entered' | 'not_entered' | null>(null);
  const [dismantleSub, setDismantleSub] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // Upload progress indicators
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStepName, setUploadStepName] = useState('');

  const fetchJobs = async () => {
    if (!currentUser) return;
    setDataLoading(true);
    try {
      const db = getDb();
      
      // 1. Fetch pending assigned jobs for this tech
      const jobsSnap = await getDocs(
        query(
          collection(db, 'assigned_jobs'), 
          where('assigned_to', '==', currentUser.name.trim()),
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
          where('name', '==', currentUser.name.trim())
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
    fetchJobs();
  }, [currentUser]);

  const openSubmitModal = (job: JobRow) => {
    setActiveJob(job);
    setInsStatus(null);
    setFailDetail(null);
    setDismantleSub(null);
    setNote('');
    setPdfFile(null);
    setVideoFile(null);
  };

  const closeSubmitModal = () => {
    setActiveJob(null);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > (systemSettings.max_size_pdf || 20)) {
        showToast(`ไฟล์ PDF ของคุณมีขนาด ${sizeMB.toFixed(2)}MB ซึ่งเกินขีดจำกัดที่แอดมินกำหนด (${systemSettings.max_size_pdf || 20}MB)`, "error");
        return;
      }
      setPdfFile(file);
    }
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

    if (pdfIsRequired && !pdfFile) {
      showToast("กรุณาแนบไฟล์ PDF ใบงานด้วยนะครับ 📄", "error");
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
      const folderNameForGDrive = pdfFile ? `${baseOrderNo} ${cleanCustomerName}.pdf` : `${baseOrderNo} ${cleanCustomerName}`;
      
      const targetFolderId = await getOrCreateTargetUploadFolder(
        accessToken, 
        finalWorkCat, 
        folderNameForGDrive, 
        dismantleSub || ""
      );

      let pdfUrl = '-';
      let renamedPdfName = '-';
      
      if (pdfFile) {
        setUploadProgress(40);
        renamedPdfName = `${baseOrderNo} ${cleanCustomerName}.pdf`;
        setUploadStepName(`กำลังอัปโหลดไฟล์ PDF: ${renamedPdfName}...`);
        
        const pdfUploadRes = await directUploadToGDrive(accessToken, pdfFile, targetFolderId, renamedPdfName);
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
        name: currentUser.name,
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
        assigned_to: currentUser.name,
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
                       `• <b>ช่างเทคนิค:</b> ${currentUser.name}\n\n`;

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


        {/* ── Tab: Personal Dashboard ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-indigo-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-md border border-white/20 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/10 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/4 translate-x-1/4 scale-150">
                <CheckCircle2 className="w-64 h-64" />
              </div>
              <div className="relative z-10">
                <h2 className="text-xl font-bold Prompt mb-1">สวัสดีครับ ช่าง {currentUser?.name} 👋</h2>
                <p className="text-xs opacity-90 Sarabun">ยินดีต้อนรับเข้าสู่ระบบปฏิบัติการช่าง วันนี้มีงานส่งสะสมทั้งหมด {totalPersonal} รายการ</p>
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
                        <div key={idx} className="flex items-start gap-3 py-2 border-b border-slate-100/30 last:border-0 last:pb-0">
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
                    จำนวน {assignedJobs.length} รายการ
                  </span>
                </div>
              </div>

            </div>

            {dataLoading ? (
              <div className="flex flex-col items-center justify-center p-12 glass-card">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs text-slate-500 Prompt">กำลังโหลดคิวงานช่าง...</p>
              </div>
            ) : assignedJobs.length === 0 ? (
              <div className="glass-card p-12 text-center text-slate-500 border-dashed">
                ✨ วันนี้คุณส่งงานครบถ้วนหมดแล้ว ยอดเยี่ยมมากครับ!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedJobs.map((job) => {
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
                        onClick={() => openSubmitModal(job)}
                        className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl text-xs font-bold transition duration-200 shrink-0 Prompt flex items-center gap-1.5 shadow-[0_4px_12px_rgba(99,102,241,0.25)] hover:shadow-[0_6px_16px_rgba(99,102,241,0.4)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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
                    ส่งแล้ว {personalHistory.length} รายการ
                  </span>
                </div>
              </div>

            </div>

            {dataLoading ? (
              <div className="w-full h-20 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : personalHistory.length === 0 ? (
              <div className="glass-card p-6 text-center text-slate-400 text-xs Prompt">
                ยังไม่มีประวัติการส่งงานในระบบ
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
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
                      {personalHistory.map((item, idx) => {
                        const statusVal = item.status || 'รอตรวจ';
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition">
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

                {/* 4. PDF File Upload (Conditional visibility/requirement) */}
                {pdfIsRequired && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider Prompt">
                      ไฟล์ใบส่งงาน (PDF เท่านั้น) <span className="text-rose-500">*</span>
                    </label>
                    <div className="border border-dashed border-indigo-200 bg-indigo-50/10 hover:bg-indigo-50/20 backdrop-blur-md rounded-2xl p-4 text-center relative transition-all duration-200 cursor-pointer">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1 pointer-events-none">
                        <div className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center mb-1 icon-glow-indigo">
                          <FileUp className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-indigo-700/90 Prompt">อัปโหลดไฟล์เอกสารใบส่งงาน (PDF)</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ขนาดสูงสุด {systemSettings.max_size_pdf || 20}MB</span>
                      </div>
                    </div>

                    {pdfFile && (
                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-700 truncate max-w-[200px]" title={pdfFile.name}>{pdfFile.name}</span>
                        <span className="text-[10px] text-indigo-500 font-bold shrink-0">{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</span>
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
