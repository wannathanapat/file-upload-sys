"use client";

import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window { pdfjsLib: any; }
}

const PDFJS_VERSION = '3.11.174';

function loadPdfJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject();
    if (window.pdfjsLib) return resolve();
    const s = document.createElement('script');
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
      resolve();
    };
    s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });
}

function extractFileId(url: string): string {
  const m1 = url.match(/[?&]fileId=([^&]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/\/d\/([^/?]+)/);
  if (m2) return m2[1];
  return '';
}

export default function CustomPdfViewer({ url }: { url: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [progress, setProgress] = useState('กำลังโหลด...');
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  const fileId = extractFileId(url);
  const proxyUrl = fileId ? `/api/gdrive/proxy?fileId=${fileId}` : url;

  useEffect(() => {
    cancelRef.current = false;

    async function render() {
      try {
        setStatus('loading');
        if (containerRef.current) containerRef.current.innerHTML = '';

        setProgress('กำลังโหลด PDF.js...');
        await loadPdfJs();
        if (cancelRef.current) return;

        setProgress('กำลังดึงไฟล์...');
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelRef.current) return;

        setProgress('กำลังประมวลผล...');
        const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelRef.current) return;

        const numPages: number = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
          if (cancelRef.current) return;
          setProgress(`กำลังโหลดหน้า ${i}/${numPages}...`);

          const page = await pdf.getPage(i);
          const naturalVp = page.getViewport({ scale: 1 });
          const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth;
          const scale = (containerWidth - 16) / naturalVp.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = 'width:100%;height:auto;display:block;border-radius:4px;margin-bottom:8px;';

          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          if (cancelRef.current) return;

          containerRef.current?.appendChild(canvas);
        }

        if (!cancelRef.current) setStatus('done');
      } catch {
        if (!cancelRef.current) setStatus('error');
      }
    }

    render();
    return () => { cancelRef.current = true; };
  }, [proxyUrl]);

  if (status === 'error') {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 px-8 text-center">
          <div className="text-4xl">📄</div>
          <p className="text-sm font-semibold text-slate-300">ไม่สามารถโหลดไฟล์ได้</p>
          <p className="text-xs text-slate-500">ลองกด "เปิดในหน้าต่างใหม่" แทน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-950 overflow-y-auto">
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-20">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-xs">{progress}</span>
        </div>
      )}
      <div ref={containerRef} className="p-2" />
    </div>
  );
}
