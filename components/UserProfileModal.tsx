'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, KeyRound, User, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { getDb } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { UserData } from '@/lib/utils';

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[timeout] ${label}`)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Resize image to 128×128 and return as base64 data URL (~10-15 KB)
async function resizeImageToDataUrl(file: File, maxSize = 128, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

interface Props {
  user: UserData;
  onClose: () => void;
  onUpdate: (updated: Partial<UserData>) => void;
}

type Tab = 'profile' | 'password';
type Status = { type: 'success' | 'error'; msg: string } | null;

export default function UserProfileModal({ user, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState(user.name);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function saveProfile() {
    if (!name.trim()) { setStatus({ type: 'error', msg: 'กรุณากรอกชื่อ' }); return; }
    setLoading(true);
    setStatus(null);
    try {
      const db = getDb();
      const updates: Record<string, string> = {};

      if (name.trim() !== user.name) updates.name = name.trim();

      if (avatarFile) {
        console.log('[Avatar] resizing to base64...');
        const dataUrl = await withTimeout(resizeImageToDataUrl(avatarFile), 10_000, 'resize timeout');
        console.log('[Avatar] base64 size:', Math.round(dataUrl.length / 1024), 'KB');
        updates.avatar_url = dataUrl;
      }

      if (Object.keys(updates).length === 0) {
        setStatus({ type: 'error', msg: 'ไม่มีข้อมูลที่เปลี่ยนแปลง' });
        return;
      }

      await updateDoc(doc(db, 'users', user._docId ?? user.username), updates);
      onUpdate(updates);
      setStatus({ type: 'success', msg: 'บันทึกข้อมูลเรียบร้อย' });
    } catch (err: any) {
      console.error('[UserProfile] save error — code:', err?.code, 'message:', err?.message, err);
      let msg = 'บันทึกไม่สำเร็จ — กรุณาลองใหม่';
      if (err?.code === 'storage/unauthorized') {
        msg = 'ไม่มีสิทธิ์อัปโหลดรูป — กรุณาแจ้งผู้ดูแลระบบตรวจสอบ Firebase Storage Rules';
      } else if (err?.code === 'storage/unknown' || err?.message?.includes('timeout')) {
        msg = 'อัปโหลดรูปล้มเหลว — ตรวจสอบ Firebase Storage Rules หรือลองใหม่อีกครั้ง';
      } else if (err?.message) {
        msg = err.message;
      }
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  }

  async function savePassword() {
    if (!oldPass || !newPass || !confirmPass) {
      setStatus({ type: 'error', msg: 'กรุณากรอกข้อมูลให้ครบ' }); return;
    }
    if (newPass !== confirmPass) {
      setStatus({ type: 'error', msg: 'รหัสผ่านใหม่ไม่ตรงกัน' }); return;
    }
    if (newPass.length < 6) {
      setStatus({ type: 'error', msg: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }); return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const db = getDb();
      const snap = await getDoc(doc(db, 'users', user.username));
      if (!snap.exists()) throw new Error('ไม่พบข้อมูลผู้ใช้');
      const stored = snap.data().password as string | undefined;
      const hashedOld = await sha256(oldPass);
      if (stored && stored !== hashedOld) {
        setStatus({ type: 'error', msg: 'รหัสผ่านเดิมไม่ถูกต้อง' }); return;
      }
      const hashedNew = await sha256(newPass);
      await updateDoc(doc(db, 'users', user.username), { password: hashedNew });
      setStatus({ type: 'success', msg: 'เปลี่ยนรหัสผ่านเรียบร้อย' });
      setOldPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setLoading(false);
    }
  }

  const validAvatar = (url: string | undefined): string | null =>
    url?.startsWith('data:') ? url : null;
  const avatar = avatarPreview ?? validAvatar(user.avatar_url);
  const displayName = user.name.split('-').pop()?.trim() ?? user.name;
  const initials = displayName.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-black/20 overflow-hidden"
        >
          {/* ── Top banner ── */}
          <div className="relative h-24 bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 flex items-start justify-between px-5 pt-5">
            {/* Decorative blobs */}
            <div className="absolute -bottom-10 -right-6 w-36 h-36 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute top-0 left-0 w-24 h-24 rounded-full bg-white/5 blur-2xl pointer-events-none" />

            <div className="relative">
              <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">บัญชีผู้ใช้</p>
              <p className="text-white font-bold text-base leading-snug mt-0.5">{displayName}</p>
              <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                user.role === 'admin' ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
              }`}>
                {user.role}
              </span>
            </div>

            <button
              onClick={onClose}
              className="relative p-1.5 rounded-xl bg-white/15 text-white/70 hover:text-white hover:bg-white/25 transition-all"
            >
              <X size={15} />
            </button>
          </div>

          {/* ── Avatar ── */}
          <div className="flex items-end gap-4 px-5 -mt-8 mb-4 relative z-10">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl ring-4 ring-white shadow-xl overflow-hidden bg-indigo-100">
                {avatar
                  ? <img src={avatar} alt={user.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600">
                      <span className="text-white font-bold text-xl">{initials}</span>
                    </div>
                }
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all"
                title="เปลี่ยนรูปโปรไฟล์"
              >
                <Camera size={11} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
            </div>
            {avatarFile && (
              <p className="text-[11px] text-indigo-500 font-medium leading-snug pb-1">
                รูปใหม่พร้อมบันทึก<br/>
                <span className="text-slate-400 font-normal">(ปรับขนาดอัตโนมัติ)</span>
              </p>
            )}
          </div>

          {/* ── Tabs ── */}
          <div className="px-5 mb-4">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {([
                { key: 'profile' as Tab, label: 'ข้อมูลส่วนตัว', icon: <User size={12} /> },
                { key: 'password' as Tab, label: 'เปลี่ยนรหัสผ่าน', icon: <KeyRound size={12} /> },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setStatus(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Status ── */}
          <div className="px-5">
            <AnimatePresence mode="wait">
              {status && (
                <motion.div
                  key={status.msg}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-3 text-xs font-medium ${
                    status.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-red-50 text-red-600 border border-red-100'
                  }`}
                >
                  {status.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {status.msg}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Form ── */}
          <div className="px-5 pb-5">
            {tab === 'profile' && (
              <div className="flex flex-col gap-3">
                <Field label="ชื่อ-นามสกุล">
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                    placeholder="ชื่อ-นามสกุล"
                  />
                </Field>
                <Field label="ชื่อผู้ใช้ (Username)">
                  <input
                    value={user.username}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-100 text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
                  />
                </Field>
                <SaveButton onClick={saveProfile} loading={loading} label="บันทึกข้อมูล" />
              </div>
            )}

            {tab === 'password' && (
              <div className="flex flex-col gap-3">
                <PasswordField label="รหัสผ่านเดิม" value={oldPass} onChange={setOldPass} show={showOld} onToggle={() => setShowOld(p => !p)} placeholder="รหัสผ่านเดิม" />
                <PasswordField label="รหัสผ่านใหม่" value={newPass} onChange={setNewPass} show={showNew} onToggle={() => setShowNew(p => !p)} placeholder="อย่างน้อย 6 ตัวอักษร" />
                <PasswordField label="ยืนยันรหัสผ่านใหม่" value={confirmPass} onChange={setConfirmPass} show={showConfirm} onToggle={() => setShowConfirm(p => !p)} placeholder="พิมพ์อีกครั้ง" />
                <SaveButton onClick={savePassword} loading={loading} label="เปลี่ยนรหัสผ่าน" />
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  );
}

function SaveButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-60 shadow-[0_4px_14px_rgba(99,102,241,0.4)]"
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}
