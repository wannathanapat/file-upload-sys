export function getEnglishNameSuffix(nameStr: string): string {
  if (!nameStr) return "";
  const parts = nameStr.split("-");
  return parts[parts.length - 1].trim().toLowerCase();
}

export interface UserData {
  username: string;
  name: string;
  role: string;
  status: string;
  lineId?: string;
}

export interface JobRow {
  job_id: string;
  order_no: string;
  customer_name: string;
  job_type: string;
  sub_work_type: string;
  assigned_to: string;
  assigned_to_excel: string;
  is_matched: boolean;
  status: string;
  timestamp: string;
  submission_date: string;
  file_url: string;
  video_url: string;
  note: string;
}

export interface SubmissionData {
  submission_date: string;
  name: string;
  work_type: string;
  file_name: string;
  file_url: string;
  video_name: string;
  video_url: string;
  description: string;
  status: string;
  job_id: string;
  order_no: string;
  sub_work_type: string;
  assigned_to: string;
  fail_detail?: string;
}

export function findMatchingTechnician(excelCtName: string, dbUsers: UserData[]): string | null {
  const excelSuffix = getEnglishNameSuffix(excelCtName);
  if (!excelSuffix) return null;
  
  for (const user of dbUsers) {
    if (user.role !== 'staff') continue;
    const userSuffix = getEnglishNameSuffix(user.name);
    if (userSuffix && userSuffix === excelSuffix) {
      return user.name;
    }
  }
  return null;
}

export interface DuplicateAnalysis {
  duplicate: boolean;
  warning?: boolean;
  status: 'duplicate' | 'pending_active' | 'history_active' | 'new';
  message: string;
  matchedItem?: any;
}

export function analyzeJobDuplicate(
  jobRow: Partial<JobRow>,
  activeJobs: any[],
  historyData: any[]
): DuplicateAnalysis {
  const isIns = jobRow.job_type?.includes("INS");
  const orderNo = jobRow.order_no ? jobRow.order_no.trim() : "";
  const jobId = jobRow.job_id ? jobRow.job_id.trim() : "";
  
  // 1. Check active assigned_jobs
  const activeJobIdMatch = jobId ? activeJobs.find(j => j.job_id === jobId) : null;
  const activeOrderNoMatch = orderNo ? activeJobs.find(j => j.order_no === orderNo) : null;
  
  // 2. Check history (submissions)
  const historyJobIdMatch = jobId ? historyData.find(h => h.job_id === jobId) : null;
  const historyOrderNoMatch = orderNo ? historyData.find(h => {
    if (h.order_no === orderNo) return true;
    if (h.file_name && h.file_name.includes(orderNo)) return true;
    return false;
  }) : null;
  
  if (isIns) {
    if (activeJobIdMatch || historyJobIdMatch) {
      return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำรหัสงานติดตั้งเดิม (ข้าม)', matchedItem: activeJobIdMatch || historyJobIdMatch };
    }
    if (activeOrderNoMatch || historyOrderNoMatch) {
      return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำเลขออเดอร์ติดตั้งเดิม (ข้าม)', matchedItem: activeOrderNoMatch || historyOrderNoMatch };
    }
    return { duplicate: false, status: 'new', message: '✨ งานติดตั้งใหม่' };
  } else {
    // AS jobs
    // A. Check exact Job ID first
    if (activeJobIdMatch || historyJobIdMatch) {
      return { duplicate: true, status: 'duplicate', message: '❌ ซ้ำรหัสงานบริการเดิม (ข้าม)', matchedItem: activeJobIdMatch || historyJobIdMatch };
    }
    
    // B. Check Order No
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
}

export function formatThaiDate(dateString: string): string {
  if (!dateString || dateString === '-') return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' น.';
  } catch (e) {
    return dateString;
  }
}
