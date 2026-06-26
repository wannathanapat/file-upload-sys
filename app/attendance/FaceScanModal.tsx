'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, CheckCircle2, AlertCircle, RefreshCw, UserX } from 'lucide-react';

export interface FaceScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** register mode: called with extracted descriptor. verify mode: called with no args on match. */
  onSuccess: (descriptor?: number[]) => void;
  employeeName: string;
  /** 'register' = admin enrolls face, 'verify' = technician checks in (default: 'register') */
  mode?: 'register' | 'verify';
  /** Required when mode='verify'. 128-dim descriptor stored during registration. */
  knownDescriptor?: number[];
  voiceMessage?: string;
  voiceRate?: number;
  voicePitch?: number;
  voiceName?: string;
}

type ScanPhase =
  | 'init'
  | 'loading-model'
  | 'streaming'
  | 'countdown'
  | 'scanning'
  | 'success'
  | 'failed-no-face'
  | 'failed-no-match'
  | 'no-camera'
  | 'model-error';

// Cache models for the session — load once, reuse
let _faceapi: typeof import('face-api.js') | null = null;
let _modelReady = false;

async function getFaceApi(): Promise<typeof import('face-api.js')> {
  if (_faceapi && _modelReady) return _faceapi;
  const faceapi = await import('face-api.js');
  await Promise.all([
    faceapi.nets.tinyFaceDetector.isLoaded      || faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68TinyNet.isLoaded  || faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.isLoaded     || faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ]);
  _faceapi = faceapi;
  _modelReady = true;
  return faceapi;
}

const MATCH_THRESHOLD = 0.55; // euclidean distance — lower = stricter

export default function FaceScanModal({
  isOpen,
  onClose,
  onSuccess,
  employeeName,
  mode = 'register',
  knownDescriptor,
  voiceMessage,
  voiceRate,
  voicePitch,
  voiceName,
}: FaceScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractedDescRef = useRef<number[] | null>(null);

  const [phase, setPhase] = useState<ScanPhase>('init');
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [facePresent, setFacePresent] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (liveLoopRef.current) {
      clearTimeout(liveLoopRef.current);
      liveLoopRef.current = null;
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
      setPhase('loading-model');
    } catch {
      setPhase('no-camera');
    }
  }, []);

  // Load all three models after camera is ready
  useEffect(() => {
    if (phase !== 'loading-model') return;
    let cancelled = false;
    getFaceApi()
      .then(() => { if (!cancelled) setPhase('streaming'); })
      .catch(() => { if (!cancelled) setPhase('model-error'); });
    return () => { cancelled = true; };
  }, [phase]);

  // Live face detection loop — updates facePresent every 500ms
  useEffect(() => {
    if (phase !== 'streaming') return;
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      try {
        const faceapi = await getFaceApi();
        if (!cancelled && videoRef.current && videoRef.current.readyState >= 2) {
          const det = await faceapi.detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }),
          );
          if (!cancelled) setFacePresent(!!det);
        }
      } catch { /* ignore */ }
      if (!cancelled) liveLoopRef.current = setTimeout(loop, 500);
    };

    loop();
    return () => {
      cancelled = true;
      if (liveLoopRef.current) clearTimeout(liveLoopRef.current);
    };
  }, [phase]);

  // Open / close modal
  useEffect(() => {
    if (isOpen) {
      setPhase('init');
      setCountdown(3);
      setProgress(0);
      setFacePresent(false);
      extractedDescRef.current = null;
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('scanning'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Face recognition / registration during scanning phase
  useEffect(() => {
    if (phase !== 'scanning') return;
    let cancelled = false;

    const progInterval = setInterval(() => {
      setProgress(p => Math.min(p + 4, 88));
    }, 40);

    const doScan = async () => {
      try {
        const faceapi = await getFaceApi();
        if (cancelled || !videoRef.current) return;

        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks(true)   // tiny landmark model
          .withFaceDescriptor();

        clearInterval(progInterval);
        if (cancelled) return;

        setProgress(100);
        await new Promise<void>(r => setTimeout(r, 300));
        if (cancelled) return;

        if (!detection) {
          setPhase('failed-no-face');
          return;
        }

        const descriptor = Array.from(detection.descriptor);

        if (mode === 'verify') {
          if (!knownDescriptor || knownDescriptor.length === 0) {
            setPhase('failed-no-face');
            return;
          }
          const known = new Float32Array(knownDescriptor);
          const dist = faceapi.euclideanDistance(
            Array.from(detection.descriptor) as number[],
            Array.from(known) as number[],
          );
          if (dist <= MATCH_THRESHOLD) {
            setPhase('success');
          } else {
            setPhase('failed-no-match');
          }
        } else {
          // register mode — store descriptor for onSuccess
          extractedDescRef.current = descriptor;
          setPhase('success');
        }
      } catch {
        clearInterval(progInterval);
        if (!cancelled) setPhase('failed-no-face');
      }
    };

    doScan();
    return () => { cancelled = true; clearInterval(progInterval); };
  }, [phase, mode, knownDescriptor]);

  // Success: beep + TTS + auto-close
  useEffect(() => {
    if (phase !== 'success') return;

    try {
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch { /* ignore */ }

    if (mode === 'verify') {
      try {
        if ('speechSynthesis' in window) {
          const msg = new SpeechSynthesisUtterance(voiceMessage || 'เช็คอินสำเร็จ');
          msg.lang = 'th-TH';
          msg.rate = voiceRate ?? 0.95;
          msg.pitch = voicePitch ?? 1.05;
          msg.volume = 1;
          if (voiceName) {
            const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceName);
            if (v) msg.voice = v;
          }
          speechSynthesis.cancel();
          speechSynthesis.speak(msg);
        }
      } catch { /* ignore */ }
    }

    const t = setTimeout(() => {
      stopCamera();
      onSuccessRef.current(extractedDescRef.current ?? undefined);
    }, 1800);
    return () => clearTimeout(t);
  }, [phase, mode, stopCamera, voiceMessage, voiceRate, voicePitch, voiceName]);

  const handleStartScan = () => {
    if (!facePresent) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    } catch { /* ignore */ }

    try {
      if ('speechSynthesis' in window) {
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        speechSynthesis.cancel();
        speechSynthesis.speak(silent);
      }
    } catch { /* ignore */ }

    setCountdown(3);
    setProgress(0);
    setPhase('countdown');
  };

  const handleRetry = () => {
    setProgress(0);
    setCountdown(3);
    setFacePresent(false);
    extractedDescRef.current = null;
    setPhase('streaming');
  };

  const handleClose = () => { stopCamera(); onClose(); };

  if (!isOpen) return null;

  const isFailed = phase === 'failed-no-face' || phase === 'failed-no-match';

  const frameColor = phase === 'scanning'
    ? 'border-blue-400'
    : facePresent
    ? 'border-emerald-400'
    : 'border-white/70';

  const modeLabel = mode === 'register' ? 'ลงทะเบียนใบหน้า' : 'สแกนใบหน้า';

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
              <h3 className="text-base font-bold text-slate-800 Prompt">{modeLabel}</h3>
              <p className="text-xs text-slate-500 Prompt mt-0.5">
                {mode === 'register' ? 'บันทึกใบหน้า: ' : 'ยืนยันตัวตน: '}
                <span className="font-semibold text-blue-600">{employeeName}</span>
              </p>
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

            {/* Face frame */}
            {(phase === 'streaming' || phase === 'countdown' || phase === 'scanning') && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`relative w-40 h-48 transition-all duration-300 ${phase === 'scanning' ? 'scale-105' : ''}`}>
                  {[
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 ${cls} ${frameColor} transition-colors duration-300`} />
                  ))}

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

            {/* Live face status badge */}
            {phase === 'streaming' && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full transition-all duration-300 ${
                  facePresent ? 'bg-emerald-500 text-white' : 'bg-black/60 text-white/80'
                }`}>
                  {facePresent ? '✓ พบใบหน้า' : 'กรุณาหันหน้าเข้ากล้อง'}
                </span>
              </div>
            )}

            {/* Loading model overlay */}
            {(phase === 'init' || phase === 'loading-model') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 gap-3">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/70 text-xs Prompt">กำลังโหลดระบบสแกนหน้า...</p>
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
                <p className="text-sm opacity-70 Prompt text-center px-8">
                  ไม่สามารถเข้าถึงกล้องได้<br />กรุณาอนุญาตการใช้กล้อง
                </p>
              </div>
            )}

            {/* Model error */}
            {phase === 'model-error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 bg-slate-900">
                <AlertCircle className="w-12 h-12 text-amber-400" />
                <p className="text-sm opacity-70 Prompt text-center px-8">
                  โหลดระบบสแกนไม่สำเร็จ<br />กรุณาตรวจสอบอินเทอร์เน็ต
                </p>
              </div>
            )}

            {/* Success overlay */}
            {phase === 'success' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/90 gap-3"
              >
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}>
                  <CheckCircle2 className="w-16 h-16 text-white" />
                </motion.div>
                <p className="text-white font-bold text-base Prompt">
                  {mode === 'register' ? 'บันทึกใบหน้าสำเร็จ' : 'ยืนยันตัวตนสำเร็จ'}
                </p>
              </motion.div>
            )}

            {/* Failed — no face */}
            {phase === 'failed-no-face' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/90 gap-3"
              >
                <AlertCircle className="w-16 h-16 text-white" />
                <p className="text-white font-bold text-base Prompt">ไม่พบใบหน้าในกล้อง</p>
                <p className="text-white/80 text-xs Prompt">กรุณาลองอีกครั้ง</p>
              </motion.div>
            )}

            {/* Failed — face doesn't match */}
            {phase === 'failed-no-match' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-rose-600/90 gap-3"
              >
                <UserX className="w-16 h-16 text-white" />
                <p className="text-white font-bold text-base Prompt">ใบหน้าไม่ตรงกัน</p>
                <p className="text-white/80 text-xs Prompt text-center px-4">ไม่ใช่ใบหน้าที่ลงทะเบียนไว้</p>
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
                disabled={!facePresent}
                className={`w-full py-3.5 font-bold rounded-2xl text-sm transition active:scale-95 Prompt flex items-center justify-center gap-2 ${
                  facePresent
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Camera className="w-4 h-4" />
                {facePresent
                  ? mode === 'register' ? 'บันทึกใบหน้า' : 'สแกนใบหน้า'
                  : 'รอตรวจจับใบหน้า...'}
              </button>
            )}

            {(phase === 'no-camera' || phase === 'model-error') && (
              <button
                onClick={startCamera}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm Prompt flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                ลองอีกครั้ง
              </button>
            )}

            {isFailed && (
              <button
                onClick={handleRetry}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm Prompt flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                สแกนใหม่อีกครั้ง
              </button>
            )}

            {(phase === 'countdown' || phase === 'scanning') && (
              <div className="w-full py-3.5 bg-slate-100 text-slate-400 font-semibold rounded-2xl text-sm Prompt text-center">
                {phase === 'countdown' ? `กำลังเตรียม... ${countdown}` : 'กำลังประมวลผล...'}
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
