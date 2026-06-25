"use client";

import React, { useState, useEffect } from 'react';

export default function CustomPdfViewer({ url }: { url: string }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<number>(0);

  useEffect(() => {
    setStatus('loading');
    // Pre-check that the file is accessible before loading inside iframe
    fetch(url, { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          setStatus('ok');
        } else {
          setErrorCode(res.status);
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorCode(0);
        setStatus('error');
      });
  }, [url]);

  if (status === 'loading') {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-xs">กำลังโหลดไฟล์...</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 px-8 text-center">
          <div className="text-4xl">📄</div>
          <p className="text-sm font-semibold text-slate-300">
            {errorCode === 404 ? 'ไม่พบไฟล์' : 'ไม่สามารถโหลดไฟล์ได้'}
          </p>
          <p className="text-xs text-slate-500">
            {errorCode === 404
              ? 'ไฟล์อาจถูกลบออกจาก Google Drive หรือสิทธิ์การเข้าถึงหมดอายุแล้ว'
              : `เกิดข้อผิดพลาด${errorCode ? ` (${errorCode})` : ''} — ลองกด "เปิดในหน้าต่างใหม่" แทน`}
          </p>
        </div>
      </div>
    );
  }

  // Append PDF display parameters:
  // - toolbar=0: hides the top dark control bar
  // - navpanes=0: hides the side thumbnail panel
  // - view=FitH: fits the document page horizontally to fill the width
  const viewerUrl = `${url}#toolbar=0&navpanes=0&view=FitH`;

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden rounded-2xl">
      <iframe
        src={viewerUrl}
        className="absolute border-0 bg-slate-950"
        style={{
          top: 0,
          left: 0,
          width: 'calc(100% + 18px)',
          height: 'calc(100% + 18px)',
          overflow: 'hidden',
        }}
        title="File Viewer"
        allowFullScreen
      />
    </div>
  );
}
