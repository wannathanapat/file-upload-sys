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
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRenderRef = useRef(false);

  const fileId = extractFileId(url);
  const proxyUrl = fileId ? `/api/gdrive/proxy?fileId=${fileId}` : url;

  // Effect 1: Load PDF Document
  useEffect(() => {
    let active = true;
    async function loadDoc() {
      try {
        setStatus('loading');
        setPdfDoc(null);
        setProgress('กำลังโหลด PDF.js...');
        await loadPdfJs();
        if (!active) return;

        setProgress('กำลังดึงไฟล์...');
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (!active) return;

        setProgress('กำลังประมวลผล...');
        const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
        if (!active) return;

        setPdfDoc(pdf);
      } catch (err) {
        console.error("PDF loading error:", err);
        if (active) setStatus('error');
      }
    }
    loadDoc();
    return () => { active = false; };
  }, [proxyUrl]);

  // Effect 2: Render PDF pages when pdfDoc or zoom changes
  useEffect(() => {
    if (!pdfDoc) return;
    cancelRenderRef.current = false;

    async function renderPages() {
      try {
        setStatus('loading');
        if (containerRef.current) containerRef.current.innerHTML = '';
        const numPages: number = pdfDoc.numPages;

        for (let i = 1; i <= numPages; i++) {
          if (cancelRenderRef.current) return;
          setProgress(`กำลังเรนเดอร์หน้า ${i}/${numPages}...`);

          const page = await pdfDoc.getPage(i);
          const naturalVp = page.getViewport({ scale: 1 });
          
          // Use scrollRef's clientWidth to prevent width-collapse bug when containerRef is cleared
          const parentWidth = scrollRef.current?.clientWidth ?? window.innerWidth;
          const containerWidth = parentWidth > 40 ? parentWidth : window.innerWidth;
          const scale = ((containerWidth - 24) / naturalVp.width) * zoom;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = 'max-width:none;display:block;border-radius:6px;margin-bottom:12px;margin-left:auto;margin-right:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          if (cancelRenderRef.current) return;

          containerRef.current?.appendChild(canvas);
        }
        if (!cancelRenderRef.current) setStatus('done');
      } catch (err) {
        console.error("PDF rendering error:", err);
        if (!cancelRenderRef.current) setStatus('error');
      }
    }

    renderPages();
    return () => { cancelRenderRef.current = true; };
  }, [pdfDoc, zoom]);

  // Effect 3: Handle Ctrl + Mouse Scroll Shortcut for Zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          // Scroll Up: Zoom In
          setZoom(z => Math.min(z + 0.1, 3.0));
        } else {
          // Scroll Down: Zoom Out
          setZoom(z => Math.max(z - 0.1, 0.5));
        }
      }
    };

    const container = scrollRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [scrollRef]);

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
    <div className="relative w-full h-full bg-slate-950 flex flex-col overflow-hidden">
      {/* Floating Zoom Controls */}
      {status === 'done' && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-full border border-white/10 text-white text-xs shadow-lg select-none">
          <button
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 font-black text-sm cursor-pointer"
            title="ย่อขนาด (Ctrl + Scroll Down)"
          >
            -
          </button>
          <span className="font-mono min-w-[36px] text-center font-bold">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(z + 0.25, 3.0))}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 font-black text-sm cursor-pointer"
            title="ขยายขนาด (Ctrl + Scroll Up)"
          >
            +
          </button>
          <div className="w-[1px] h-3 bg-white/20 mx-1" />
          <button
            onClick={() => setZoom(1.0)}
            className="px-2 py-0.5 hover:bg-white/10 rounded-md transition active:scale-90 text-[10px] font-bold cursor-pointer"
            title="รีเซ็ตเป็นขนาดเริ่มต้น"
          >
            พอดีหน้า
          </button>
        </div>
      )}

      {/* Main content scroll container */}
      <div ref={scrollRef} className="flex-grow overflow-auto w-full h-full flex flex-col">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-20 my-auto">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-xs">{progress}</span>
          </div>
        )}
        <div ref={containerRef} className="p-3 mx-auto my-auto" style={{ width: zoom === 1.0 ? '100%' : 'auto' }} />
      </div>
    </div>
  );
}
