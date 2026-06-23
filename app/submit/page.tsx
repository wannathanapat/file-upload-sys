'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Sidebar from '@/components/sidebar';
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
  History
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

  // Data lists
  const [assignedJobs, setAssignedJobs] = useState<JobRow[]>([]);
  const [personalHistory, setPersonalHistory] = useState<SubmissionData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

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
        let telegramMsg = `<b>📢 มีงานส่งใหม่เข้ามาครับ! (อ้างอิงรหัสงาน: ${activeJob.job_id})</b>\n` +
                          `👤 <b>ช่าง:</b> ${currentUser.name}\n` +
                          `📂 <b>ประเภทงาน:</b> ${finalWorkCat}${dismantleSub ? ` (${dismantleSub})` : ''}\n`;
        if (pdfFile) {
          telegramMsg += `📄 <b>ไฟล์งาน:</b> ${renamedPdfName}\n`;
        }
        if (videoFile && videoIsVisible) {
          telegramMsg += `🎥 <b>ไฟล์วิดีโอ:</b> ${renamedVideoName}\n`;
        }
        if (activeJob.order_no && activeJob.order_no !== '-') {
          telegramMsg += `🔢 <b>รหัสออเดอร์:</b> ${activeJob.order_no}\n`;
        }
        telegramMsg += `📝 <b>หมายเหตุ:</b> ${note || '-'}\n`;
        if (pdfFile && pdfUrl && pdfUrl !== '-') {
          telegramMsg += `🔗 <a href="${pdfUrl}">ลิงก์ PDF</a>`;
        }
        if (videoFile && videoIsVisible && videoUrl && videoUrl !== '-') {
          telegramMsg += `\n🔗 <a href="${videoUrl}">ลิงก์ Video</a>`;
        }

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

      <main className="flex-grow p-4 lg:p-8 overflow-y-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 Prompt">ส่งงานช่างเทคนิค</h1>
            <p className="text-sm text-slate-500 Sarabun">ดูตารางงานประจำวันของคุณและกรอกแบบฟอร์มเพื่อส่งรายงานเข้าสู่ระบบ</p>
          </div>
          <button 
            onClick={fetchJobs}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-100 transition Prompt cursor-pointer flex items-center gap-2"
          >
            🔄 ดึงรายการงานล่าสุด
          </button>
        </header>

        {/* Assigned jobs section (Cards) */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-4 Prompt">
            📅 งานค้างส่งในคิวของคุณ ({assignedJobs.length})
          </h2>

          {dataLoading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-slate-500 Prompt">กำลังโหลดคิวงานช่าง...</p>
            </div>
          ) : assignedJobs.length === 0 ? (
            <div className="bg-slate-100/50 border border-slate-200 border-dashed rounded-3xl p-8 text-center text-slate-500">
              ✨ วันนี้คุณส่งงานครบถ้วนหมดแล้ว ยอดเยี่ยมมากครับ!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedJobs.map((job) => {
                let badgeColor = 'bg-indigo-500';
                let icon = '📦';
                let jobLabelName = 'งานติดตั้ง';
                let cardStyle = "border-blue-100/70 bg-blue-50/10";

                if (job.job_type.includes('ถอด')) {
                  badgeColor = 'bg-purple-500';
                  icon = '⚙️';
                  jobLabelName = 'งานถอดติดตั้ง';
                  cardStyle = "border-purple-100/70 bg-purple-50/10";
                } else if (job.job_type.includes('ซ่อม')) {
                  badgeColor = 'bg-emerald-500';
                  icon = '🔧';
                  jobLabelName = 'งานซ่อม';
                  cardStyle = "border-emerald-100/70 bg-emerald-50/10";
                }

                return (
                  <motion.div
                    key={job.job_id}
                    layoutId={job.job_id}
                    className={`relative border rounded-[1.75rem] p-5 shadow-xs hover:shadow-sm hover:translate-y-[-1px] transition-all duration-300 flex justify-between items-center gap-4 ${cardStyle}`}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-grow">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold ${
                        job.job_type.includes('ถอด') ? 'bg-purple-100/50 text-purple-600' :
                        job.job_type.includes('ซ่อม') ? 'bg-emerald-100/50 text-emerald-600' :
                        'bg-blue-100/50 text-blue-600'
                      }`}>
                        {icon}
                      </div>
                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-extrabold text-slate-800 text-xs font-mono tracking-tight">
                            {job.order_no && job.order_no !== '-' ? `#${job.order_no}` : job.job_id}
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
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shrink-0 Prompt flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      📥 ส่งงาน
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Personal submission history */}
        <section>
          <h2 className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-4 Prompt">
            📋 ประวัติการส่งงานล่าสุดของคุณ ({personalHistory.length})
          </h2>

          {dataLoading ? (
            <div className="w-full h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : personalHistory.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center text-slate-400 text-xs Prompt">
              ยังไม่มีประวัติการส่งงานในระบบ
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
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
                  <h3 className="text-lg font-bold text-slate-800 Prompt flex items-center gap-1.5">
                    <span>📝</span> ส่งใบงาน: <span className="text-indigo-600">
                      {activeJob.order_no && activeJob.order_no !== '-' ? `#${activeJob.order_no}` : activeJob.job_id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 Sarabun leading-relaxed mt-0.5">
                    ลูกค้า: {activeJob.customer_name} {activeJob.order_no && activeJob.order_no !== '-' && `| รหัสงาน: ${activeJob.job_id}`}
                  </p>
                </div>
                <button
                  onClick={closeSubmitModal}
                  className="text-slate-400 hover:text-slate-600 text-lg p-1.5 hover:bg-slate-100 rounded-full transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-semibold">
                
                {/* 1. Installation Sub-status (Only for INS jobs) */}
                {activeJob.job_type === "งานติดตั้ง (INS)" && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 Prompt">
                      สถานะงานติดตั้ง <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 ${
                        insStatus === 'success' ? 'border-emerald-400 bg-emerald-50/30 text-emerald-700 font-bold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
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
                        <span className="text-lg">🟢</span>
                        <span className="text-[11px] Prompt">ติดตั้งสำเร็จ</span>
                      </label>

                      <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 ${
                        insStatus === 'fail' ? 'border-rose-300 bg-rose-50/20 text-rose-700 font-bold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="insStatus"
                          value="fail"
                          className="sr-only"
                          onChange={() => setInsStatus('fail')}
                        />
                        <span className="text-lg">🔴</span>
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
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 overflow-hidden"
                    >
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 Prompt">
                        รายละเอียดงานเฟล <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 ${
                          failDetail === 'entered' ? 'border-indigo-400 bg-indigo-50/20 text-indigo-700 font-bold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}>
                          <input
                            type="radio"
                            name="failDetail"
                            value="entered"
                            className="sr-only"
                            onChange={() => setFailDetail('entered')}
                          />
                          <span className="text-lg">🏠</span>
                          <span className="text-[11px] Prompt text-center">เข้าหน้างานแล้ว</span>
                        </label>

                        <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 ${
                          failDetail === 'not_entered' ? 'border-indigo-400 bg-indigo-50/20 text-indigo-700 font-bold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}>
                          <input
                            type="radio"
                            name="failDetail"
                            value="not_entered"
                            className="sr-only"
                            onChange={() => setFailDetail('not_entered')}
                          />
                          <span className="text-lg">🚗</span>
                          <span className="text-[11px] Prompt text-center">ยังไม่เข้าหน้างาน</span>
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 3. Dismantle subcategories (Only for AS dismantle jobs) */}
                {activeJob.job_type === "งานถอดติดตั้ง (AS)" && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
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
                            className={`border rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                              dismantleSub === type ? 'border-indigo-400 bg-indigo-50/20 text-indigo-700 font-bold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
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
                    <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center relative bg-slate-50/50 hover:bg-slate-50 transition">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1 pointer-events-none">
                        <FileUp className="w-7 h-7 text-slate-400 mb-1" />
                        <span className="text-xs font-bold text-slate-700 Prompt">คลิกแนบไฟล์เอกสาร PDF</span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">ขีดจำกัดสูงสุด {systemSettings.max_size_pdf || 20}MB</span>
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
                    <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center relative bg-slate-50/50 hover:bg-slate-50 transition">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1 pointer-events-none">
                        <Video className="w-7 h-7 text-slate-400 mb-1" />
                        <span className="text-xs font-bold text-slate-700 Prompt">คลิกแนบไฟล์วิดีโอ (ถ้ามี)</span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">ขีดจำกัดสูงสุด {systemSettings.max_size_video || 50}MB</span>
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
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition duration-150 Prompt shadow-lg shadow-indigo-100 mt-2 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>💾</span>
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
