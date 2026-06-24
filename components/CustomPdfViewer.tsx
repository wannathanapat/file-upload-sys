"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function CustomPdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    const renderPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load PDF.js dynamically
        const win = window as any;
        if (!win.pdfjsLib) {
          await new Promise((resolve, reject) => {
            // Check if already injected
            if (document.getElementById('pdfjs-cdn-script')) {
              const checkInterval = setInterval(() => {
                if (win.pdfjsLib) {
                  clearInterval(checkInterval);
                  resolve(win.pdfjsLib);
                }
              }, 100);
              return;
            }
            const script = document.createElement('script');
            script.id = 'pdfjs-cdn-script';
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
              win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              resolve(win.pdfjsLib);
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
          });
        }
        
        if (!active) return;
        const pdfjsLib = win.pdfjsLib;
        
        // Fetch the PDF using pdfjsLib
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        
        if (!active) return;
        
        const container = containerRef.current;
        if (!container) return;
        
        // Clear previous canvases
        container.innerHTML = '';
        
        // Render all pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          // Make it look sleek and fit
          canvas.className = 'w-full max-w-full h-auto object-contain rounded-xl shadow-md mb-6 border border-slate-200/20';
          
          container.appendChild(canvas);
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
        }
        
        if (active) setLoading(false);
      } catch (err: any) {
        console.error("PDF Render Error:", err);
        if (active) {
          setError(err.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    };
    
    if (url) {
      renderPdf();
    }
    
    return () => { active = false; };
  }, [url]);

  return (
    <div className="w-full h-full relative overflow-y-auto bg-slate-900/50 rounded-2xl flex flex-col items-center p-4 hide-scrollbar">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-10 rounded-2xl">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
          <span className="text-xs text-indigo-300 font-bold Prompt animate-pulse">กำลังโหลดหน้าต่างพรีวิว...</span>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-400 text-sm font-bold Prompt bg-slate-900/90 rounded-2xl p-6 text-center">
          <p>⚠️ ไม่สามารถโหลดเอกสารได้</p>
          <p className="text-[10px] text-rose-500/80 mt-1 font-normal">{error}</p>
        </div>
      )}
      
      <div ref={containerRef} className="w-full max-w-3xl flex flex-col items-center" />
    </div>
  );
}
