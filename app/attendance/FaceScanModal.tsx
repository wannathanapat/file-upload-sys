'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface FaceScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeName: string;
  voiceMessage?: string;
}

type ScanPhase = 'init' | 'streaming' | 'countdown' | 'scanning' | 'success' | 'failed' | 'no-camera';

export default function FaceScanModal({ isOpen, onClose, onSuccess, employeeName, voiceMessage }: FaceScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Use a ref so the success-timer effect is NOT re-triggered every parent re-render
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  // AudioContext ref — must be created/resumed inside a user gesture to work on mobile
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [phase, setPhase] = useState<ScanPhase>('init');
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setPhase('streaming');
    } catch {
      setPhase('no-camera');
    }
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPhase('init');
      setCountdown(3);
      setProgress(0);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // Countdown logic
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('scanning');
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Scanning animation + simulated result
  useEffect(() => {
    if (phase !== 'scanning') return;
    let prog = 0;
    const interval = setInterval(() => {
      prog += 2;
      setProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        // Simulation always succeeds — real Face API to be wired up later
        setPhase('success');
      }
    }, 30);
    return () => clearInterval(interval);
  }, [phase]);

  // Auto-close on success — timer must NOT depend on `onSuccess` directly
  // because parent re-renders every second (clock) create a new function ref,
  // which would reset this timer before it ever fires.
  useEffect(() => {
    if (phase !== 'success') return;

    // ── 1. Web Audio API beep (works on Android & iOS, no autoplay restriction
    //       since AudioContext was unlocked on the user-gesture in handleStartScan)
    const playBeep = () => {
      try {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        // Resume in case it got suspended
        if (ctx.state === 'suspended') ctx.resume();

        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);          // A5 — bright success tone
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15); // slide down
        gain.gain.setValueAtTime(0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch {/* ignore */}
    };
    playBeep();

    // ── 2. speechSynthesis TTS (best-effort; may be silent on some mobile browsers)
    try {
      if ('speechSynthesis' in window) {
        const text = voiceMessage || 'เช็คอินสำเร็จ';
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'th-TH'; msg.rate = 0.95; msg.pitch = 1.05; msg.volume = 1;
        speechSynthesis.cancel();
        speechSynthesis.speak(msg);
      }
    } catch {/* ignore */}

    const t = setTimeout(() => {
      stopCamera();
      onSuccessRef.current();
    }, 1800);
    return () => clearTimeout(t);
  }, [phase, stopCamera, voiceMessage]); // voiceMessage is OK here — it rarely changes

  const handleStartScan = () => {
    // ── Unlock AudioContext here (inside a real user gesture) ────────────────
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {/* ignore */}

    // ── Unlock speechSynthesis with a silent utterance (iOS requirement) ─────
    try {
      if ('speechSynthesis' in window) {
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        speechSynthesis.cancel();
        speechSynthesis.speak(silent);
      }
    } catch {/* ignore */}

    setCountdown(3);
    setProgress(0);
    setPhase('countdown');
  };

  const handleRetry = () => {
    setProgress(0);
    setCountdown(3);
    setPhase('streaming');
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 Prompt">สแกนใบหน้า</h3>
              <p className="text-xs text-slate-500 Prompt mt-0.5">ยืนยันตัวตน: <span className="font-semibold text-blue-600">{employeeName}</span></p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Camera Viewport */}
          <div className="relative mx-5 rounded-2xl overflow-hidden bg-slate-900" style={{ aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover scale-x-[-1]"
              muted
              playsInline
            />

            {/* Face frame overlay */}
            {(phase === 'streaming' || phase === 'countdown' || phase === 'scanning') && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`relative w-40 h-48 transition-all duration-300 ${phase === 'scanning' ? 'scale-105' : ''}`}>
                  {/* Corner markers */}
                  {[
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 ${cls} ${phase === 'scanning' ? 'border-blue-400' : 'border-white/80'} transition-colors duration-300`} />
                  ))}

                  {/* Scanning line */}
                  {phase === 'scanning' && (
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Countdown overlay */}
            {phase === 'countdown' && (
              <motion.div
                key={countdown}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="text-8xl font-black text-white drop-shadow-2xl">{countdown || ''}</span>
              </motion.div>
            )}

            {/* No camera */}
            {phase === 'no-camera' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 bg-slate-900">
                <Camera className="w-12 h-12 opacity-40" />
                <p className="text-sm opacity-70 Prompt text-center px-8">ไม่สามารถเข้าถึงกล้องได้<br />กรุณาอนุญาตการใช้กล้อง</p>
              </div>
            )}

            {/* Success overlay */}
            {phase === 'success' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/90 gap-3"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-white" />
                </motion.div>
                <p className="text-white font-bold text-base Prompt">ยืนยันตัวตนสำเร็จ</p>
              </motion.div>
            )}

            {/* Failed overlay */}
            {phase === 'failed' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/90 gap-3"
              >
                <AlertCircle className="w-16 h-16 text-white" />
                <p className="text-white font-bold text-base Prompt">ไม่สามารถยืนยันตัวตน</p>
                <p className="text-white/80 text-xs Prompt">กรุณาลองอีกครั้ง</p>
              </motion.div>
            )}
          </div>

          {/* Progress bar */}
          {phase === 'scanning' && (
            <div className="mx-5 mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="px-5 py-5 space-y-2">
            {phase === 'streaming' && (
              <button
                onClick={handleStartScan}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition active:scale-95 Prompt shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                เริ่มสแกนใบหน้า
              </button>
            )}

            {phase === 'no-camera' && (
              <button
                onClick={startCamera}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm Prompt flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                ลองอีกครั้ง
              </button>
            )}

            {phase === 'failed' && (
              <button
                onClick={handleRetry}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm Prompt flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                สแกนใหม่อีกครั้ง
              </button>
            )}

            {(phase === 'countdown' || phase === 'scanning' || phase === 'init') && (
              <div className="w-full py-3.5 bg-slate-100 text-slate-400 font-semibold rounded-2xl text-sm Prompt text-center">
                {phase === 'countdown' ? `กำลังเตรียม... ${countdown}` : phase === 'scanning' ? 'กำลังประมวลผล...' : 'กำลังเปิดกล้อง...'}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-3 text-slate-500 font-semibold text-sm Prompt"
            >
              ยกเลิก
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
